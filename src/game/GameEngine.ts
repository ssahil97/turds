import * as THREE from "three";
import { Terrain } from "./Terrain";
import { Character } from "./Character";
import { GameCamera } from "./Camera";
import { Controls } from "./Controls";
import { Projectile } from "./Projectile";
import { Explosion } from "./Explosion";
import { buildWeaponMesh } from "./WeaponRenderer";
import {
  GameState,
  TurnPhase,
  Weapon,
  CharacterState,
  TEAM_COLORS,
  CHARS_PER_TEAM,
  MAP_SIZE,
  DEFAULT_WEAPON,
  TURN_DURATION,
} from "../types/game";

export type GameEventCallback = (event: GameEvent) => void;

export type GameEvent =
  | { type: "move"; x: number; y: number; z: number; facing: number }
  | { type: "switch_to_aim" }
  | { type: "fire"; weaponIndex: number; origin: [number, number, number]; direction: [number, number, number]; power: number }
  | { type: "damage_report"; damages: { teamIndex: number; charIndex: number; damage: number; newHealth: number; alive: boolean }[] }
  | { type: "turn_complete" }
  | { type: "state_changed"; state: Partial<GameEngineState> };

export interface GameEngineState {
  turnPhase: TurnPhase;
  turnTimer: number;
  currentTeamIndex: number;
  currentCharIndex: number;
  selectedWeaponIndex: number;
  aimAngle: number;
  aimElevation: number;
  power: number;
  teams: { name: string; color: string; characters: { health: number; alive: boolean }[] }[];
  isMyTurn: boolean;
  phase: string;
}

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private gameCamera: GameCamera;
  private controls: Controls;
  private terrain!: Terrain;
  private characters: Character[][] = [];
  private projectiles: Projectile[] = [];
  private explosions: Explosion[] = [];
  private clock = new THREE.Clock();
  private animFrameId = 0;
  private onEvent: GameEventCallback;

  // Game state
  private gameState: GameState | null = null;
  private localPlayerId = "";
  private selectedWeaponIndex = 0;
  private aimAngle = 0;
  private aimElevation = 0.3;
  private power = 70;
  private aimArrow: THREE.ArrowHelper | null = null;
  private trajectoryLine: THREE.Line | null = null;
  private weaponMesh: THREE.Group | null = null;
  private activeIndicator: THREE.Mesh | null = null;
  private moveThrottle = 0;
  private turnTimerInterval: ReturnType<typeof setInterval> | null = null;
  private turnTimer = TURN_DURATION;
  private isProjectileFlying = false;

  constructor(container: HTMLElement, onEvent: GameEventCallback) {
    this.onEvent = onEvent;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a1a2e);
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.015);

    // Camera
    this.gameCamera = new GameCamera(container.clientWidth / container.clientHeight);

    // Controls
    this.controls = new Controls(this.renderer.domElement);

    // Lighting
    this.setupLighting();

    // Active character indicator
    const ringGeo = new THREE.RingGeometry(0.6, 0.8, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    this.activeIndicator = new THREE.Mesh(ringGeo, ringMat);
    this.activeIndicator.visible = false;
    this.scene.add(this.activeIndicator);

    // Resize handler
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.gameCamera.resize(w / h);
    };
    window.addEventListener("resize", onResize);

    // Start render loop
    this.animate();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x4466aa, 0.6);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.4);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffeedd, 1.2);
    dir.position.set(20, 30, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.left = -40;
    dir.shadow.camera.right = 40;
    dir.shadow.camera.top = 40;
    dir.shadow.camera.bottom = -40;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 80;
    this.scene.add(dir);
  }

  initGame(state: GameState, playerId: string): void {
    this.gameState = state;
    this.localPlayerId = playerId;

    // Terrain
    this.terrain = new Terrain(state.mapSeed);
    this.terrain.addToScene(this.scene);

    // Characters
    this.characters = [];
    for (let t = 0; t < state.teams.length; t++) {
      const team = state.teams[t];
      const chars: Character[] = [];
      for (let c = 0; c < team.characters.length; c++) {
        const char = new Character(t, c, team.characters[c]);
        char.addToScene(this.scene);
        chars.push(char);
      }
      this.characters.push(chars);
    }

    this.updateTurnState();
    this.startTurnTimer();
  }

  updateGameState(state: GameState): void {
    const prevPhase = this.gameState?.turnPhase;
    this.gameState = state;

    // Sync character states
    for (let t = 0; t < state.teams.length; t++) {
      if (!this.characters[t]) continue;
      for (let c = 0; c < state.teams[t].characters.length; c++) {
        if (!this.characters[t][c]) continue;
        const cs = state.teams[t].characters[c];
        const char = this.characters[t][c];
        char.state.health = cs.health;
        char.state.alive = cs.alive;
        if (!this.isMyTurn() || (t !== state.currentTeamIndex || c !== state.currentCharIndex)) {
          char.state.x = cs.x;
          char.state.y = cs.y;
          char.state.z = cs.z;
          char.state.facing = cs.facing;
          char.updatePosition();
        }
        char.setVisible(cs.alive);
      }
    }

    if (state.turnPhase !== prevPhase) {
      this.updateTurnState();
    }

    this.turnTimer = state.turnTimer;
    this.emitStateChanged();
  }

  handleFireEvent(
    weaponIndex: number,
    origin: [number, number, number],
    direction: [number, number, number],
    power: number,
    teamIndex: number
  ): void {
    const team = this.gameState!.teams[teamIndex];
    const weapon = team.weapons[weaponIndex] || DEFAULT_WEAPON;

    const proj = new Projectile(
      weapon,
      new THREE.Vector3(...origin),
      new THREE.Vector3(...direction),
      power
    );
    proj.addToScene(this.scene);
    this.projectiles.push(proj);
    this.isProjectileFlying = true;

    // Follow projectile with camera
    this.gameCamera.setTarget(new THREE.Vector3(...origin));
  }

  private updateTurnState(): void {
    if (!this.gameState) return;

    this.controls.turnPhase = this.gameState.turnPhase;

    // Clean up aim visuals
    if (this.aimArrow) {
      this.scene.remove(this.aimArrow);
      this.aimArrow = null;
    }
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine = null;
    }
    if (this.weaponMesh) {
      this.scene.remove(this.weaponMesh);
      this.weaponMesh = null;
    }

    if (this.gameState.turnPhase === "aim" && this.isMyTurn()) {
      this.setupAimVisuals();
    }

    this.resetTurnTimer();
    this.emitStateChanged();
  }

  private setupAimVisuals(): void {
    if (!this.gameState) return;
    const char = this.getActiveCharacter();
    if (!char) return;

    // Aim arrow
    const dir = new THREE.Vector3(0, 0, 1);
    this.aimArrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 3, 0xffff00, 0.5, 0.3);
    this.scene.add(this.aimArrow);

    // Trajectory preview
    const lineGeo = new THREE.BufferGeometry();
    const linePositions = new Float32Array(150 * 3);
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setDrawRange(0, 0);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.5 });
    this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.scene.add(this.trajectoryLine);

    // Weapon mesh
    const team = this.gameState.teams[this.gameState.currentTeamIndex];
    const weapon = team.weapons[this.selectedWeaponIndex] || DEFAULT_WEAPON;
    this.weaponMesh = buildWeaponMesh(weapon.geometry);
    this.scene.add(this.weaponMesh);
  }

  private updateAimVisuals(): void {
    if (!this.aimArrow || !this.gameState) return;
    const char = this.getActiveCharacter();
    if (!char) return;

    const charPos = new THREE.Vector3(char.state.x, char.state.y + 0.8, char.state.z);

    // Compute aim direction
    const dir = new THREE.Vector3(
      Math.sin(this.aimAngle) * Math.cos(this.aimElevation),
      Math.sin(this.aimElevation),
      Math.cos(this.aimAngle) * Math.cos(this.aimElevation)
    ).normalize();

    this.aimArrow.position.copy(charPos);
    this.aimArrow.setDirection(dir);
    this.aimArrow.setLength(2 + this.power / 50);

    // Weapon position
    if (this.weaponMesh) {
      this.weaponMesh.position.copy(charPos).add(dir.clone().multiplyScalar(0.5));
      this.weaponMesh.lookAt(charPos.clone().add(dir.clone().multiplyScalar(5)));
    }

    // Trajectory preview
    if (this.trajectoryLine) {
      const team = this.gameState.teams[this.gameState.currentTeamIndex];
      const weapon = team.weapons[this.selectedWeaponIndex] || DEFAULT_WEAPON;
      this.updateTrajectory(charPos, dir, weapon);
    }
  }

  private updateTrajectory(origin: THREE.Vector3, dir: THREE.Vector3, weapon: Weapon): void {
    if (!this.trajectoryLine) return;

    const posAttr = this.trajectoryLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const vel = dir.clone().multiplyScalar(weapon.speed * (this.power / 100));
    const pos = origin.clone();
    const gravity = -20 * weapon.gravity_multiplier;
    const dt = 0.05;
    let count = 0;
    const maxPoints = 150;

    for (let i = 0; i < maxPoints; i++) {
      posAttr.setXYZ(i, pos.x, pos.y, pos.z);
      count++;

      vel.y += gravity * dt;
      pos.add(vel.clone().multiplyScalar(dt));

      if (this.terrain && pos.y < this.terrain.getHeightAt(pos.x, pos.z)) break;
      if (pos.y < -20) break;
    }

    posAttr.needsUpdate = true;
    this.trajectoryLine.geometry.setDrawRange(0, count);
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    if (!this.gameState || this.gameState.phase !== "playing") {
      this.renderer.render(this.scene, this.gameCamera.camera);
      return;
    }

    // Input
    const input = this.controls.getInput();

    // Active character
    const char = this.getActiveCharacter();

    if (this.isMyTurn() && char) {
      if (this.gameState.turnPhase === "move") {
        this.handleMovement(char, input, dt);
      }
      if (this.gameState.turnPhase === "aim") {
        this.handleAiming(input, dt);
      }

      if (input.switchToAim && this.gameState.turnPhase === "move") {
        this.onEvent({ type: "switch_to_aim" });
      }
      if (input.fire && this.gameState.turnPhase === "aim") {
        this.fireWeapon();
      }
      if (input.weaponSelect >= 0) {
        const team = this.gameState.teams[this.gameState.currentTeamIndex];
        if (input.weaponSelect < team.weapons.length) {
          this.selectedWeaponIndex = input.weaponSelect;
          this.emitStateChanged();
        }
      }
    }

    // Camera controls
    if (input.cameraRotX || input.cameraRotY) {
      this.gameCamera.rotate(input.cameraRotX * 2 * dt, input.cameraRotY * 2 * dt);
    }

    // Physics for all characters
    for (const team of this.characters) {
      for (const c of team) {
        c.applyPhysics(dt, this.terrain);
      }
    }

    // Projectiles
    const allChars = this.characters.flat();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const result = proj.update(dt, this.terrain);

      // Check character collision
      if (proj.state.alive) {
        for (const c of allChars) {
          if (!c.state.alive) continue;
          const charPos = new THREE.Vector3(c.state.x, c.state.y + 0.6, c.state.z);
          if (proj.state.position.distanceTo(charPos) < 0.8) {
            proj.state.alive = false;
            this.spawnExplosion(proj.state.position, proj.weapon);
            proj.removeFromScene(this.scene);
            this.projectiles.splice(i, 1);
            break;
          }
        }
      }

      if (result?.hit) {
        this.spawnExplosion(result.position, proj.weapon);
        proj.removeFromScene(this.scene);
        this.projectiles.splice(i, 1);

        // Handle clusters
        if (proj.weapon.cluster_count > 0) {
          this.spawnClusters(result.position, proj.weapon);
        }
      }
    }

    // Check if projectiles are done
    if (this.isProjectileFlying && this.projectiles.length === 0) {
      this.isProjectileFlying = false;
      // Report damages
      this.reportDamages();
      setTimeout(() => {
        this.onEvent({ type: "turn_complete" });
      }, 500);
    }

    // Follow projectile or active character
    if (this.projectiles.length > 0) {
      this.gameCamera.setTarget(this.projectiles[0].state.position.clone());
    } else if (char) {
      this.gameCamera.setTarget(new THREE.Vector3(char.state.x, char.state.y + 1, char.state.z));
    }

    // Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].update(dt);
      if (!this.explosions[i].alive) {
        this.explosions.splice(i, 1);
      }
    }

    // Update
    if (this.terrain) this.terrain.updateWater(time);
    this.gameCamera.update(dt);

    // Health bars
    for (const team of this.characters) {
      for (const c of team) {
        c.updateHealthBar(this.gameCamera.camera);
      }
    }

    // Active indicator
    if (this.activeIndicator && char && char.state.alive) {
      this.activeIndicator.visible = true;
      this.activeIndicator.position.set(char.state.x, char.state.y + 0.05, char.state.z);
      this.activeIndicator.rotation.z += dt * 2;
    } else if (this.activeIndicator) {
      this.activeIndicator.visible = false;
    }

    // Aim visuals
    if (this.gameState.turnPhase === "aim" && this.isMyTurn()) {
      this.updateAimVisuals();
    }

    this.renderer.render(this.scene, this.gameCamera.camera);
  };

  private handleMovement(char: Character, input: { moveX: number; moveZ: number }, dt: number): void {
    if (input.moveX === 0 && input.moveZ === 0) return;

    const speed = 6;
    const camAngle = this.gameCamera.angle;

    // Movement relative to camera
    const moveAngle = Math.atan2(input.moveX, input.moveZ) + camAngle;
    const mx = Math.sin(moveAngle) * speed * dt;
    const mz = Math.cos(moveAngle) * speed * dt;

    char.state.x += mx;
    char.state.z += mz;
    char.state.facing = moveAngle;

    // Snap to terrain
    const terrainY = this.terrain.getHeightAt(char.state.x, char.state.z);
    char.state.y = terrainY + 0.6;
    char.updatePosition();

    // Throttle network updates
    this.moveThrottle += dt;
    if (this.moveThrottle > 0.1) {
      this.moveThrottle = 0;
      this.onEvent({
        type: "move",
        x: char.state.x,
        y: char.state.y,
        z: char.state.z,
        facing: char.state.facing,
      });
    }
  }

  private handleAiming(input: { aimDeltaX: number; aimDeltaY: number; cameraRotX: number }, dt: number): void {
    if (input.aimDeltaX) this.aimAngle += input.aimDeltaX;
    if (input.aimDeltaY) this.aimElevation = Math.max(-0.3, Math.min(1.2, this.aimElevation - input.aimDeltaY));

    // Keyboard aim
    if (input.cameraRotX) {
      this.aimAngle += input.cameraRotX * 2 * dt;
    }

    this.emitStateChanged();
  }

  private fireWeapon(): void {
    if (!this.gameState) return;
    const char = this.getActiveCharacter();
    if (!char) return;

    const origin: [number, number, number] = [char.state.x, char.state.y + 0.8, char.state.z];
    const direction: [number, number, number] = [
      Math.sin(this.aimAngle) * Math.cos(this.aimElevation),
      Math.sin(this.aimElevation),
      Math.cos(this.aimAngle) * Math.cos(this.aimElevation),
    ];

    this.onEvent({
      type: "fire",
      weaponIndex: this.selectedWeaponIndex,
      origin,
      direction,
      power: this.power,
    });
  }

  private spawnExplosion(position: THREE.Vector3, weapon: Weapon): void {
    const allChars = this.characters.flat();
    const explosion = new Explosion(
      position,
      weapon.radius,
      weapon.damage,
      weapon.color,
      this.terrain,
      allChars,
      this.scene
    );
    this.explosions.push(explosion);
  }

  private spawnClusters(position: THREE.Vector3, weapon: Weapon): void {
    for (let i = 0; i < weapon.cluster_count; i++) {
      const angle = (i / weapon.cluster_count) * Math.PI * 2;
      const clusterWeapon: Weapon = {
        ...weapon,
        damage: Math.round(weapon.damage * 0.3),
        radius: weapon.radius * 0.5,
        speed: weapon.speed * 0.5,
        bounces: 0,
        cluster_count: 0,
      };
      const dir = new THREE.Vector3(Math.cos(angle), 0.8, Math.sin(angle));
      const proj = new Projectile(clusterWeapon, position.clone().add(new THREE.Vector3(0, 0.5, 0)), dir, 60);
      proj.addToScene(this.scene);
      this.projectiles.push(proj);
    }
  }

  private reportDamages(): void {
    if (!this.gameState) return;
    const damages: { teamIndex: number; charIndex: number; damage: number; newHealth: number; alive: boolean }[] = [];

    for (let t = 0; t < this.characters.length; t++) {
      for (let c = 0; c < this.characters[t].length; c++) {
        const char = this.characters[t][c];
        const serverState = this.gameState.teams[t]?.characters[c];
        if (serverState && (char.state.health !== serverState.health || char.state.alive !== serverState.alive)) {
          damages.push({
            teamIndex: t,
            charIndex: c,
            damage: serverState.health - char.state.health,
            newHealth: char.state.health,
            alive: char.state.alive,
          });
        }
      }
    }

    if (damages.length > 0) {
      this.onEvent({ type: "damage_report", damages });
    }
  }

  private getActiveCharacter(): Character | null {
    if (!this.gameState) return null;
    const ti = this.gameState.currentTeamIndex;
    const ci = this.gameState.currentCharIndex;
    return this.characters[ti]?.[ci] || null;
  }

  isMyTurn(): boolean {
    if (!this.gameState) return false;
    const team = this.gameState.teams[this.gameState.currentTeamIndex];
    return team?.playerId === this.localPlayerId;
  }

  private startTurnTimer(): void {
    if (this.turnTimerInterval) clearInterval(this.turnTimerInterval);
    this.turnTimer = TURN_DURATION;
    this.turnTimerInterval = setInterval(() => {
      this.turnTimer = Math.max(0, this.turnTimer - 1);
      this.emitStateChanged();
    }, 1000);
  }

  private resetTurnTimer(): void {
    this.turnTimer = TURN_DURATION;
    this.startTurnTimer();
  }

  private emitStateChanged(): void {
    if (!this.gameState) return;
    this.onEvent({
      type: "state_changed",
      state: {
        turnPhase: this.gameState.turnPhase,
        turnTimer: this.turnTimer,
        currentTeamIndex: this.gameState.currentTeamIndex,
        currentCharIndex: this.gameState.currentCharIndex,
        selectedWeaponIndex: this.selectedWeaponIndex,
        aimAngle: this.aimAngle,
        aimElevation: this.aimElevation,
        power: this.power,
        isMyTurn: this.isMyTurn(),
        phase: this.gameState.phase,
        teams: this.gameState.teams.map((t) => ({
          name: t.name,
          color: t.color,
          characters: t.characters.map((c) => ({ health: c.health, alive: c.alive })),
        })),
      },
    });
  }

  setPower(p: number): void {
    this.power = Math.max(10, Math.min(100, p));
    this.emitStateChanged();
  }

  setSelectedWeapon(idx: number): void {
    this.selectedWeaponIndex = idx;
    // Rebuild weapon mesh
    if (this.weaponMesh) {
      this.scene.remove(this.weaponMesh);
      this.weaponMesh = null;
    }
    if (this.gameState && this.gameState.turnPhase === "aim") {
      const team = this.gameState.teams[this.gameState.currentTeamIndex];
      const weapon = team.weapons[idx] || DEFAULT_WEAPON;
      this.weaponMesh = buildWeaponMesh(weapon.geometry);
      this.scene.add(this.weaponMesh);
    }
    this.emitStateChanged();
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    if (this.turnTimerInterval) clearInterval(this.turnTimerInterval);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
