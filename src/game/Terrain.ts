import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { MAP_SIZE, MAP_RES, MAX_HEIGHT, WATER_LEVEL } from "../types/game";

// Seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Terrain {
  mesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  geometry: THREE.PlaneGeometry;
  private noise2D: ReturnType<typeof createNoise2D>;
  private seed: number;
  private positionAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;

  constructor(seed: number) {
    this.seed = seed;
    const rng = mulberry32(seed);
    this.noise2D = createNoise2D(rng);

    // Terrain mesh
    this.geometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, MAP_RES, MAP_RES);
    this.geometry.rotateX(-Math.PI / 2);

    this.positionAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const vertexCount = this.positionAttr.count;

    // Vertex colors
    const colors = new Float32Array(vertexCount * 3);
    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.geometry.setAttribute("color", this.colorAttr);

    // Displace vertices
    for (let i = 0; i < vertexCount; i++) {
      const x = this.positionAttr.getX(i);
      const z = this.positionAttr.getZ(i);
      const h = this.getHeight(x, z);
      this.positionAttr.setY(i, h);

      // Vertex color based on height
      const color = this.getVertexColor(h);
      this.colorAttr.setXYZ(i, color.r, color.g, color.b);
    }

    this.geometry.computeVertexNormals();
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;

    // Water plane
    const waterGeo = new THREE.PlaneGeometry(MAP_SIZE * 3, MAP_SIZE * 3);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5c,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.3,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = WATER_LEVEL;
  }

  getHeight(x: number, z: number): number {
    let h = this.noise2D(x * 0.04, z * 0.04) * MAX_HEIGHT;
    h += this.noise2D(x * 0.08, z * 0.08) * (MAX_HEIGHT * 0.4);
    h += this.noise2D(x * 0.15, z * 0.15) * (MAX_HEIGHT * 0.15);

    const dist = Math.sqrt(x * x + z * z) / (MAP_SIZE * 0.5);
    const falloff = Math.max(0, 1 - dist * dist);
    h *= falloff;

    if (dist > 0.85) h -= (dist - 0.85) * 40;

    return h;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    return this.getHeight(worldX, worldZ);
  }

  getNormalAt(x: number, z: number): THREE.Vector3 {
    const delta = 0.5;
    const hL = this.getHeight(x - delta, z);
    const hR = this.getHeight(x + delta, z);
    const hD = this.getHeight(x, z - delta);
    const hU = this.getHeight(x, z + delta);
    const normal = new THREE.Vector3(hL - hR, 2 * delta, hD - hU).normalize();
    return normal;
  }

  deform(cx: number, cz: number, radius: number, depth: number): void {
    const count = this.positionAttr.count;
    for (let i = 0; i < count; i++) {
      const vx = this.positionAttr.getX(i);
      const vz = this.positionAttr.getZ(i);
      const dx = vx - cx;
      const dz = vz - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < radius) {
        const factor = 1 - dist / radius;
        const currentY = this.positionAttr.getY(i);
        const newY = currentY - depth * factor * factor;
        this.positionAttr.setY(i, newY);

        const color = this.getVertexColor(newY);
        this.colorAttr.setXYZ(i, color.r, color.g, color.b);
      }
    }
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  private getVertexColor(height: number): THREE.Color {
    if (height < 0) return new THREE.Color(0.2, 0.35, 0.15); // dark green / mud
    if (height < MAX_HEIGHT * 0.3) return new THREE.Color(0.3, 0.55, 0.2); // green
    if (height < MAX_HEIGHT * 0.6) return new THREE.Color(0.45, 0.4, 0.25); // brown
    if (height < MAX_HEIGHT * 0.8) return new THREE.Color(0.5, 0.45, 0.35); // light brown
    return new THREE.Color(0.85, 0.85, 0.9); // snow
  }

  updateWater(time: number): void {
    this.waterMesh.position.y = WATER_LEVEL + Math.sin(time * 0.5) * 0.15;
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
    scene.add(this.waterMesh);
  }
}
