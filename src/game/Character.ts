import * as THREE from "three";
import { CharacterState, CHAR_RADIUS, CHAR_HEIGHT, TEAM_COLORS, GRAVITY, KILL_ZONE_Y } from "../types/game";
import { Terrain } from "./Terrain";

export class Character {
  group: THREE.Group;
  state: CharacterState;
  teamIndex: number;
  charIndex: number;
  private bodyMaterial: THREE.MeshStandardMaterial;
  private healthBarGroup: THREE.Group;
  private healthBarFill: THREE.Mesh;

  constructor(teamIndex: number, charIndex: number, state: CharacterState) {
    this.teamIndex = teamIndex;
    this.charIndex = charIndex;
    this.state = { ...state };
    this.group = new THREE.Group();

    const color = TEAM_COLORS[teamIndex] || "#ffffff";
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.1,
    });

    // Build capsule from primitives
    const cylHeight = CHAR_HEIGHT - CHAR_RADIUS * 2;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(CHAR_RADIUS, CHAR_RADIUS, cylHeight, 12),
      this.bodyMaterial
    );
    body.castShadow = true;

    const topCap = new THREE.Mesh(
      new THREE.SphereGeometry(CHAR_RADIUS, 12, 8),
      this.bodyMaterial
    );
    topCap.position.y = cylHeight / 2;
    topCap.castShadow = true;

    const botCap = new THREE.Mesh(
      new THREE.SphereGeometry(CHAR_RADIUS, 12, 8),
      this.bodyMaterial
    );
    botCap.position.y = -cylHeight / 2;
    botCap.castShadow = true;

    this.group.add(body, topCap, botCap);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
    });
    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, cylHeight / 2 - 0.05, CHAR_RADIUS * 0.85);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, cylHeight / 2 - 0.05, CHAR_RADIUS * 0.85);

    // Pupils
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const pupilGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.12, cylHeight / 2 - 0.05, CHAR_RADIUS * 0.95);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.12, cylHeight / 2 - 0.05, CHAR_RADIUS * 0.95);

    this.group.add(leftEye, rightEye, leftPupil, rightPupil);

    // Health bar (billboard)
    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.position.y = CHAR_HEIGHT / 2 + 0.4;

    const bgGeo = new THREE.PlaneGeometry(0.8, 0.1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    this.healthBarGroup.add(bg);

    const fillGeo = new THREE.PlaneGeometry(0.76, 0.07);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, side: THREE.DoubleSide });
    this.healthBarFill = new THREE.Mesh(fillGeo, fillMat);
    this.healthBarFill.position.z = 0.001;
    this.healthBarGroup.add(this.healthBarFill);

    this.group.add(this.healthBarGroup);

    this.updatePosition();
  }

  updatePosition(): void {
    this.group.position.set(this.state.x, this.state.y + CHAR_HEIGHT / 2, this.state.z);
    this.group.rotation.y = this.state.facing;
  }

  updateHealthBar(camera: THREE.Camera): void {
    // Billboard: face camera
    this.healthBarGroup.lookAt(camera.position);

    const pct = Math.max(0, this.state.health / 100);
    this.healthBarFill.scale.x = pct;
    this.healthBarFill.position.x = -(1 - pct) * 0.38;

    const mat = this.healthBarFill.material as THREE.MeshBasicMaterial;
    if (pct > 0.5) mat.color.setHex(0x44ff44);
    else if (pct > 0.25) mat.color.setHex(0xffaa00);
    else mat.color.setHex(0xff3333);
  }

  applyPhysics(dt: number, terrain: Terrain): void {
    if (!this.state.alive) return;

    // Gravity
    this.state.vy += GRAVITY * dt;

    // Move
    this.state.x += this.state.vx * dt;
    this.state.y += this.state.vy * dt;
    this.state.z += this.state.vz * dt;

    // Terrain collision
    const terrainY = terrain.getHeightAt(this.state.x, this.state.z);
    const feetY = terrainY + CHAR_HEIGHT * 0.5;

    if (this.state.y <= feetY) {
      this.state.y = feetY;
      this.state.vy = 0;
      this.state.grounded = true;

      // Friction
      this.state.vx *= Math.max(0, 1 - 8 * dt);
      this.state.vz *= Math.max(0, 1 - 8 * dt);

      // Slope sliding
      const normal = terrain.getNormalAt(this.state.x, this.state.z);
      const slopeAngle = Math.acos(normal.y);
      if (slopeAngle > 0.6) {
        const slideForce = 12 * dt;
        this.state.vx += normal.x * slideForce;
        this.state.vz += normal.z * slideForce;
      }
    } else {
      this.state.grounded = false;
    }

    // Kill zone
    if (this.state.y < KILL_ZONE_Y) {
      this.state.alive = false;
      this.state.health = 0;
    }

    this.updatePosition();
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  applyDamage(damage: number): void {
    this.state.health = Math.max(0, this.state.health - damage);
    if (this.state.health <= 0) {
      this.state.alive = false;
    }
  }

  applyKnockback(force: THREE.Vector3): void {
    this.state.vx += force.x;
    this.state.vy += force.y;
    this.state.vz += force.z;
    this.state.grounded = false;
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}
