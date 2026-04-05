import * as THREE from "three";
import { WeaponGeometry, GeometryPart } from "../types/game";

export function buildWeaponMesh(geometry: WeaponGeometry): THREE.Group {
  const group = new THREE.Group();

  for (const part of geometry.parts) {
    let geo: THREE.BufferGeometry;
    switch (part.type) {
      case "cylinder":
        geo = new THREE.CylinderGeometry(
          part.radiusTop ?? 0.1,
          part.radiusBottom ?? 0.1,
          part.height ?? 0.5,
          12
        );
        break;
      case "sphere":
        geo = new THREE.SphereGeometry(part.radius ?? 0.2, 12, 8);
        break;
      case "cone":
        geo = new THREE.ConeGeometry(part.radius ?? 0.15, part.height ?? 0.3, 12);
        break;
      case "box":
        geo = new THREE.BoxGeometry(
          part.width ?? 0.2,
          part.height ?? 0.2,
          part.depth ?? 0.2
        );
        break;
      case "torus":
        geo = new THREE.TorusGeometry(part.radius ?? 0.2, part.tube ?? 0.05, 8, 16);
        break;
      default:
        continue;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: part.color,
      roughness: 0.4,
      metalness: 0.2,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...part.position);
    if (part.rotation) {
      mesh.rotation.set(...part.rotation);
    }
    mesh.castShadow = true;
    group.add(mesh);
  }

  group.scale.setScalar(0.8);
  return group;
}

export function buildProjectileMesh(geometry: WeaponGeometry): THREE.Mesh {
  const proj = geometry.projectile;
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
  return new THREE.Mesh(geo, mat);
}
