import * as THREE from "three";

export type PlayheadKind = "wall" | "vertical" | "flat";

export function createPlayhead(kind: PlayheadKind): THREE.Mesh {
  const geometry = kind === "wall"
    ? new THREE.PlaneGeometry(200, 200)
    : new THREE.PlaneGeometry(0.5, 200);
  const material = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  if (kind === "flat") mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
