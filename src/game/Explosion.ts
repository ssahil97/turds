import * as THREE from "three";
import { Terrain } from "./Terrain";
import { Character } from "./Character";

export class Explosion {
  private group: THREE.Group;
  private age = 0;
  private duration = 0.8;
  private flashMesh: THREE.Mesh;
  private blastMesh: THREE.Mesh;
  private particles: THREE.Points;
  private particleVelocities: Float32Array;
  alive = true;

  constructor(
    position: THREE.Vector3,
    radius: number,
    damage: number,
    color: string,
    terrain: Terrain,
    characters: Character[],
    private scene: THREE.Scene
  ) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    // Flash
    const flashGeo = new THREE.SphereGeometry(radius * 0.3, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
    });
    this.flashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.group.add(this.flashMesh);

    // Blast sphere
    const blastGeo = new THREE.SphereGeometry(1, 12, 8);
    const blastMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      wireframe: true,
    });
    this.blastMesh = new THREE.Mesh(blastGeo, blastMat);
    this.group.add(this.blastMesh);

    // Particles
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    this.particleVelocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 3 + Math.random() * 8;
      this.particleVelocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      this.particleVelocities[i * 3 + 1] = Math.abs(Math.cos(phi)) * speed;
      this.particleVelocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color,
      size: 0.3,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.group.add(this.particles);

    scene.add(this.group);

    // Terrain deformation
    terrain.deform(position.x, position.z, radius, radius * 0.4);

    // Damage + knockback
    for (const char of characters) {
      if (!char.state.alive) continue;
      const charPos = new THREE.Vector3(char.state.x, char.state.y, char.state.z);
      const dist = charPos.distanceTo(position);
      if (dist < radius) {
        const factor = 1 - dist / radius;
        const dmg = Math.round(damage * factor);
        char.applyDamage(dmg);

        const knockDir = charPos.clone().sub(position).normalize();
        const knockForce = factor * 15;
        char.applyKnockback(
          knockDir.multiplyScalar(knockForce).add(new THREE.Vector3(0, knockForce * 0.5, 0))
        );
      }
    }
  }

  update(dt: number): void {
    this.age += dt;
    const t = this.age / this.duration;

    if (t >= 1) {
      this.alive = false;
      this.scene.remove(this.group);
      return;
    }

    // Flash shrinks and fades
    const flashScale = Math.max(0, 1 - t * 3);
    this.flashMesh.scale.setScalar(flashScale);
    (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = flashScale;

    // Blast expands and fades
    const blastScale = t * 4;
    this.blastMesh.scale.setScalar(blastScale);
    (this.blastMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - t);

    // Particles
    const posAttr = this.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setXYZ(
        i,
        posAttr.getX(i) + this.particleVelocities[i * 3] * dt,
        posAttr.getY(i) + this.particleVelocities[i * 3 + 1] * dt - 5 * dt * this.age,
        posAttr.getZ(i) + this.particleVelocities[i * 3 + 2] * dt
      );
    }
    posAttr.needsUpdate = true;
    (this.particles.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t);
  }
}
