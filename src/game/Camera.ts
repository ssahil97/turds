import * as THREE from "three";

const CAMERA_DIST_DEFAULT = 12;
const CAMERA_MIN_PITCH = 0.1;
const CAMERA_MAX_PITCH = Math.PI / 2 - 0.1;

export class GameCamera {
  camera: THREE.PerspectiveCamera;
  angle = 0;
  pitch = 0.5;
  distance = CAMERA_DIST_DEFAULT;
  target = new THREE.Vector3(0, 2, 0);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    this.camera.position.set(0, 15, 20);
  }

  rotate(deltaAngle: number, deltaPitch: number): void {
    this.angle += deltaAngle;
    this.pitch = Math.max(CAMERA_MIN_PITCH, Math.min(CAMERA_MAX_PITCH, this.pitch + deltaPitch));
  }

  setTarget(target: THREE.Vector3): void {
    this.target.copy(target);
  }

  update(dt: number): void {
    const camX = this.target.x + Math.sin(this.angle) * this.distance * Math.cos(this.pitch);
    const camY = this.target.y + this.distance * Math.sin(this.pitch) + 3;
    const camZ = this.target.z + Math.cos(this.angle) * this.distance * Math.cos(this.pitch);

    const desired = new THREE.Vector3(camX, camY, camZ);
    this.camera.position.lerp(desired, Math.min(1, 5 * dt));
    this.camera.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
