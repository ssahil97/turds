// ─── Weapon Types ───

export interface Weapon {
  name: string;
  damage: number;
  radius: number;
  speed: number;
  gravity_multiplier: number;
  bounces: number;
  cluster_count: number;
  color: string;
  trail_color: string;
  description: string;
  geometry: WeaponGeometry;
}

export interface WeaponGeometry {
  parts: GeometryPart[];
  projectile: {
    type: "sphere" | "box" | "cone";
    radius: number;
    color: string;
    emissive: string;
  };
}

export interface GeometryPart {
  type: "cylinder" | "sphere" | "cone" | "box" | "torus";
  color: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radius?: number;
  width?: number;
  depth?: number;
  tube?: number;
}

// ─── Character Types ───

export interface CharacterState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  health: number;
  alive: boolean;
  facing: number;
  grounded: boolean;
}

// ─── Team Types ───

export interface Team {
  playerId: string;
  name: string;
  color: string;
  weapons: Weapon[];
  characters: CharacterState[];
}

// ─── Game State ───

export type GamePhase = "lobby" | "weapon_select" | "playing" | "ended";
export type TurnPhase = "move" | "aim" | "fire" | "spectate";

export interface GameState {
  phase: GamePhase;
  mapSeed: number;
  currentTeamIndex: number;
  currentCharIndex: number;
  turnTimer: number;
  turnPhase: TurnPhase;
  teams: Team[];
  winnerTeamIndex: number | null;
}

// ─── Network Messages ───

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "weapons_ready"; weapons: Weapon[] }
  | { type: "start_game" }
  | { type: "move"; x: number; y: number; z: number; facing: number }
  | { type: "switch_to_aim" }
  | { type: "fire"; weaponIndex: number; origin: [number, number, number]; direction: [number, number, number]; power: number }
  | { type: "damage_report"; damages: DamageEntry[] }
  | { type: "turn_complete" };

export type ServerMessage =
  | { type: "sync"; state: GameState; playerId: string }
  | { type: "state_update"; state: GameState }
  | { type: "player_joined"; team: Team }
  | { type: "fire"; weaponIndex: number; origin: [number, number, number]; direction: [number, number, number]; power: number; teamIndex: number }
  | { type: "turn_advance"; teamIndex: number; charIndex: number }
  | { type: "game_over"; winnerTeamIndex: number }
  | { type: "error"; message: string };

export interface DamageEntry {
  teamIndex: number;
  charIndex: number;
  damage: number;
  newHealth: number;
  alive: boolean;
}

// ─── Constants ───

export const TEAM_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];
export const MAP_SIZE = 60;
export const MAP_RES = 80;
export const MAX_HEIGHT = 8;
export const WATER_LEVEL = -3;
export const GRAVITY = -20;
export const CHAR_RADIUS = 0.4;
export const CHAR_HEIGHT = 1.2;
export const CHARS_PER_TEAM = 3;
export const TURN_DURATION = 20;
export const KILL_ZONE_Y = -15;
export const DEFAULT_WEAPON: Weapon = {
  name: "Bazooka",
  damage: 30,
  radius: 4,
  speed: 25,
  gravity_multiplier: 1.0,
  bounces: 0,
  cluster_count: 0,
  color: "#ff4444",
  trail_color: "#ff8800",
  description: "Classic rocket launcher",
  geometry: {
    parts: [
      { type: "cylinder", color: "#555555", position: [0, 0, 0], radiusTop: 0.08, radiusBottom: 0.08, height: 0.6 },
      { type: "cone", color: "#ff4444", position: [0.35, 0, 0], rotation: [0, 0, -Math.PI / 2], radius: 0.1, height: 0.15 },
    ],
    projectile: { type: "sphere", radius: 0.15, color: "#ff4444", emissive: "#ff2200" },
  },
};
