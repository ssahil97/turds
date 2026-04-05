import * as THREE from "three";
import { Weapon, GRAVITY } from "../types/game";
import { Terrain } from "./Terrain";

export interface ProjectileState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  alive: boolean;
  bouncesLeft: number;
  age: number;
}

export class Projectile {
  mesh: THREE.Mesh;
  trail: THREE.Points;
  state: ProjectileState;
  weapon: Weapon;
  private trailPositions: Float32Array;
  private trailIndex = 0;
  private trailCount = 60;

  constructor(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3, power: number) {
    this.weapon = weapon;

    // Projectile mesh
    const proj = weapon.geometry.projectile;
    let geo: THREE.BufferGeometry;
    switch (proj.type) {
      case "box":
        geo = new THREE.BoxGeometry(proj.radius * 2, proj.radius * 2, proj.radius * 2);
        break;
      case "cone":
        geo = new THREE.ConeGeometry(proj.radius, proj.radius * 3, 8);
        break;
      default:
        geo = new THREE.SphereGeometry(proj.radius, 8, 6);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: proj.color,
      emissive: proj.emissive,
      emissiveIntensity: 0.8,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;

    // Trail
    this.trailPositions = new Float32Array(this.trailCount * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.PointsMaterial({
      color: weapon.trail_color,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });
    this.trail = new THREE.Points(trailGeo, trailMat);

    // State
    const vel = direction.clone().normalize().multiplyScalar(weapon.speed * (power / 100));
    this.state = {
      position: origin.clone(),
      velocity: vel,
      alive: true,
      bouncesLeft: weapon.bounces,
      age: 0,
    };

    this.mesh.position.copy(origin);
  }

  update(dt: number, terrain: Terrain): { hit: boolean; position: THREE.Vector3 } | null {
    if (!this.state.alive) return null;

    this.state.age += dt;
    if (this.state.age > 10) {
      this.state.alive = false;
      return { hit: true, position: this.state.position.clone() };
    }

    // Gravity
    this.state.velocity.y += GRAVITY * this.weapon.gravity_multiplier * dt;

    // Move
    const newPos = this.state.position.clone().add(
      this.state.velocity.clone().multiplyScalar(dt)
    );

    // Terrain collision
    const terrainY = terrain.getHeightAt(newPos.x, newPos.z);
    if (newPos.y <= terrainY) {
      if (this.state.bouncesLeft > 0) {
        this.state.bouncesLeft--;
        const normal = terrain.getNormalAt(newPos.x, newPos.z);
        this.state.velocity.reflect(normal).multiplyScalar(0.5);
        newPos.y = terrainY + 0.1;
      } else {
        this.state.alive = false;
        newPos.y = terrainY;
        return { hit: true, position: newPos };
      }
    }

    this.state.position.copy(newPos);
    this.mesh.position.copy(newPos);

    // Rotate projectile in direction of travel
    if (this.state.velocity.lengthSq() > 0.1) {
      this.mesh.lookAt(newPos.clone().add(this.state.velocity));
    }

    // Trail
    const idx = (this.trailIndex % this.trailCount) * 3;
    this.trailPositions[idx] = newPos.x;
    this.trailPositions[idx + 1] = newPos.y;
    this.trailPositions[idx + 2] = newPos.z;
    this.trailIndex++;

    const trailGeo = this.trail.geometry;
    (trailGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    trailGeo.setDrawRange(0, Math.min(this.trailIndex, this.trailCount));

    return null;
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
    scene.add(this.trail);
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.trail);
    this.mesh.geometry.dispose();
    this.trail.geometry.dispose();
  }
}
