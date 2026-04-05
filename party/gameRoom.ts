import { Server, Connection } from "partyserver";
import {
  GameState,
  Team,
  Weapon,
  CharacterState,
  TEAM_COLORS,
  CHARS_PER_TEAM,
  MAP_SIZE,
  TURN_DURATION,
  DEFAULT_WEAPON,
} from "../src/types/game";

function createCharacterStates(
  teamIndex: number,
  totalTeams: number,
  mapSeed: number
): CharacterState[] {
  const chars: CharacterState[] = [];
  const angleOffset = (teamIndex / totalTeams) * Math.PI * 2;

  for (let i = 0; i < CHARS_PER_TEAM; i++) {
    const angle = angleOffset + ((i - 1) * 0.3);
    const dist = MAP_SIZE * 0.25;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    chars.push({
      x,
      y: 10, // Will be adjusted client-side to terrain height
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      health: 100,
      alive: true,
      facing: angle + Math.PI,
      grounded: false,
    });
  }

  return chars;
}

export class GameRoom extends Server {
  static options = { hibernate: true };

  gameState: GameState = {
    phase: "lobby",
    mapSeed: Math.floor(Math.random() * 99999),
    currentTeamIndex: 0,
    currentCharIndex: 0,
    turnTimer: TURN_DURATION,
    turnPhase: "move",
    teams: [],
    winnerTeamIndex: null,
  };

  private turnTimerInterval: ReturnType<typeof setInterval> | null = null;

  onConnect(conn: Connection) {
    conn.send(
      JSON.stringify({
        type: "sync",
        state: this.gameState,
        playerId: conn.id,
      })
    );
  }

  onMessage(conn: Connection, message: string) {
    let msg: any;
    try {
      msg = JSON.parse(message as string);
    } catch {
      return;
    }

    switch (msg.type) {
      case "join":
        this.handleJoin(conn, msg);
        break;
      case "weapons_ready":
        this.handleWeaponsReady(conn, msg);
        break;
      case "start_game":
        this.handleStartGame();
        break;
      case "move":
        this.handleMove(conn, msg);
        break;
      case "switch_to_aim":
        this.handleSwitchToAim(conn);
        break;
      case "fire":
        this.handleFire(conn, msg);
        break;
      case "damage_report":
        this.handleDamageReport(conn, msg);
        break;
      case "turn_complete":
        this.handleTurnComplete(conn);
        break;
    }
  }

  private handleJoin(conn: Connection, msg: { name: string }) {
    if (this.gameState.phase !== "lobby" && this.gameState.phase !== "weapon_select") return;
    if (this.gameState.teams.length >= 2) return;

    // Check if already joined
    if (this.gameState.teams.some((t) => t.playerId === conn.id)) return;

    const teamIndex = this.gameState.teams.length;
    this.gameState.teams.push({
      playerId: conn.id,
      name: msg.name || `Player ${teamIndex + 1}`,
      color: TEAM_COLORS[teamIndex],
      weapons: [DEFAULT_WEAPON, DEFAULT_WEAPON, DEFAULT_WEAPON],
      characters: [],
    });

    this.broadcastState();
  }

  private handleWeaponsReady(conn: Connection, msg: { weapons: Weapon[] }) {
    const team = this.gameState.teams.find((t) => t.playerId === conn.id);
    if (!team) return;

    team.weapons = msg.weapons.slice(0, 3);
    while (team.weapons.length < 3) {
      team.weapons.push(DEFAULT_WEAPON);
    }

    this.broadcastState();
  }

  private handleStartGame() {
    if (this.gameState.teams.length < 2) return;
    if (this.gameState.phase === "playing") return;

    // Create characters for each team
    for (let i = 0; i < this.gameState.teams.length; i++) {
      this.gameState.teams[i].characters = createCharacterStates(
        i,
        this.gameState.teams.length,
        this.gameState.mapSeed
      );
    }

    this.gameState.phase = "playing";
    this.gameState.currentTeamIndex = 0;
    this.gameState.currentCharIndex = 0;
    this.gameState.turnPhase = "move";
    this.gameState.turnTimer = TURN_DURATION;

    this.broadcastState();
    this.startTurnTimer();
  }

  private handleMove(conn: Connection, msg: { x: number; y: number; z: number; facing: number }) {
    if (this.gameState.phase !== "playing") return;
    const team = this.gameState.teams[this.gameState.currentTeamIndex];
    if (team.playerId !== conn.id) return;
    if (this.gameState.turnPhase !== "move") return;

    const char = team.characters[this.gameState.currentCharIndex];
    if (!char || !char.alive) return;

    char.x = msg.x;
    char.y = msg.y;
    char.z = msg.z;
    char.facing = msg.facing;

    // Broadcast position to other players
    this.broadcast(
      JSON.stringify({ type: "state_update", state: this.gameState }),
      [conn.id]
    );
  }

  private handleSwitchToAim(conn: Connection) {
    if (this.gameState.phase !== "playing") return;
    const team = this.gameState.teams[this.gameState.currentTeamIndex];
    if (team.playerId !== conn.id) return;
    if (this.gameState.turnPhase !== "move") return;

    this.gameState.turnPhase = "aim";
    this.broadcastState();
  }

  private handleFire(
    conn: Connection,
    msg: {
      weaponIndex: number;
      origin: [number, number, number];
      direction: [number, number, number];
      power: number;
    }
  ) {
    if (this.gameState.phase !== "playing") return;
    const teamIndex = this.gameState.currentTeamIndex;
    const team = this.gameState.teams[teamIndex];
    if (team.playerId !== conn.id) return;
    if (this.gameState.turnPhase !== "aim") return;

    this.gameState.turnPhase = "fire";
    this.stopTurnTimer();

    // Broadcast fire event to ALL clients (including sender)
    this.broadcast(
      JSON.stringify({
        type: "fire",
        weaponIndex: msg.weaponIndex,
        origin: msg.origin,
        direction: msg.direction,
        power: msg.power,
        teamIndex,
      })
    );

    this.broadcastState();
  }

  private handleDamageReport(
    conn: Connection,
    msg: {
      damages: {
        teamIndex: number;
        charIndex: number;
        damage: number;
        newHealth: number;
        alive: boolean;
      }[];
    }
  ) {
    // Accept damage reports from the firing player
    const team = this.gameState.teams[this.gameState.currentTeamIndex];
    if (team.playerId !== conn.id) return;

    for (const dmg of msg.damages) {
      const t = this.gameState.teams[dmg.teamIndex];
      if (!t) continue;
      const c = t.characters[dmg.charIndex];
      if (!c) continue;
      c.health = dmg.newHealth;
      c.alive = dmg.alive;
    }

    this.broadcastState();
  }

  private handleTurnComplete(conn: Connection) {
    const team = this.gameState.teams[this.gameState.currentTeamIndex];
    if (team.playerId !== conn.id) return;

    this.advanceTurn();
  }

  private advanceTurn() {
    // Check win condition
    const aliveTeams = this.gameState.teams.filter((t) =>
      t.characters.some((c) => c.alive)
    );

    if (aliveTeams.length <= 1) {
      this.gameState.phase = "ended";
      this.gameState.winnerTeamIndex = aliveTeams.length === 1
        ? this.gameState.teams.indexOf(aliveTeams[0])
        : -1;
      this.stopTurnTimer();
      this.broadcast(
        JSON.stringify({
          type: "game_over",
          winnerTeamIndex: this.gameState.winnerTeamIndex,
        })
      );
      this.broadcastState();
      return;
    }

    // Next team/character
    let nextTeam = this.gameState.currentTeamIndex;
    let nextChar = this.gameState.currentCharIndex;
    let found = false;

    for (let attempts = 0; attempts < 20; attempts++) {
      nextTeam = (nextTeam + 1) % this.gameState.teams.length;
      if (nextTeam === 0) {
        // Went around, try next char index
        nextChar = (this.gameState.currentCharIndex + 1) % CHARS_PER_TEAM;
      }

      const t = this.gameState.teams[nextTeam];
      if (t.characters[nextChar]?.alive) {
        found = true;
        break;
      }
      // If this char is dead, try any alive char on this team
      const aliveIdx = t.characters.findIndex((c) => c.alive);
      if (aliveIdx >= 0) {
        nextChar = aliveIdx;
        found = true;
        break;
      }
    }

    if (!found) return; // No alive characters (shouldn't happen)

    this.gameState.currentTeamIndex = nextTeam;
    this.gameState.currentCharIndex = nextChar;
    this.gameState.turnPhase = "move";
    this.gameState.turnTimer = TURN_DURATION;

    this.broadcastState();
    this.startTurnTimer();
  }

  private startTurnTimer() {
    this.stopTurnTimer();
    this.turnTimerInterval = setInterval(() => {
      this.gameState.turnTimer--;
      if (this.gameState.turnTimer <= 0) {
        if (this.gameState.turnPhase === "move") {
          this.gameState.turnPhase = "aim";
          this.gameState.turnTimer = 10;
          this.broadcastState();
        } else if (this.gameState.turnPhase === "aim") {
          // Auto-advance turn
          this.gameState.turnPhase = "spectate";
          this.advanceTurn();
        }
      }
    }, 1000);
  }

  private stopTurnTimer() {
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
  }

  private broadcastState() {
    this.broadcast(
      JSON.stringify({
        type: "state_update",
        state: this.gameState,
      })
    );
  }

  onClose() {
    // Could handle disconnect logic
  }
}
