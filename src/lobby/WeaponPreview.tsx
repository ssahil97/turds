import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { Weapon } from "../types/game";
import { buildWeaponMesh } from "../game/WeaponRenderer";

interface WeaponPreviewProps {
  weapon: Weapon;
}

export const WeaponPreview: React.FC<WeaponPreviewProps> = ({ weapon }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const size = 100;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
    camera.position.set(1, 0.5, 1);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(2, 3, 1);
    scene.add(dir);

    const weaponGroup = buildWeaponMesh(weapon.geometry);
    scene.add(weaponGroup);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      weaponGroup.rotation.y += 0.02;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [weapon]);

  return (
    <div
      ref={containerRef}
      style={{
        width: 100,
        height: 100,
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
      }}
    />
  );
};
