import * as THREE from "three";
import type { Note } from "../state/State";

export interface Ripple {
  mesh: THREE.Mesh;
  born: number;
  duration: number;
}

export function spawnRipple(group: THREE.Group, pos: THREE.Vector3, color: number, normal: THREE.Vector3): Ripple {
  const geometry = new THREE.RingGeometry(0.1, 0.3, 32);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(pos);
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  mesh.quaternion.copy(q);
  group.add(mesh);
  return { mesh, born: performance.now(), duration: 600 };
}

export function notesTriggered(notes: Note[], from: number, to: number, triggered: Set<number>): number[] {
  const result: number[] = [];
  const jumped = Math.abs(to - from) > 0.5;
  for (let i = 0; i < notes.length; i++) {
    if (triggered.has(i)) continue;
    const start = notes[i].start;
    const near = Math.abs(to - start) < 0.12;
    const crossed = !jumped && start > from && start <= to;
    if (near || crossed) {
      triggered.add(i);
      result.push(i);
    }
  }
  return result;
}

export function clearRipples(ripples: Ripple[]) {
  for (const ripple of ripples) {
    ripple.mesh.parent?.remove(ripple.mesh);
    ripple.mesh.geometry.dispose();
    (ripple.mesh.material as THREE.Material).dispose();
  }
  ripples.length = 0;
}

export function updateRipples(ripples: Ripple[], now: number) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    const age = (now - r.born) / r.duration;
    if (age >= 1) {
      r.mesh.parent?.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
      ripples.splice(i, 1);
      continue;
    }
    const s = 1 + age * 6;
    r.mesh.scale.set(s, s, s);
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age);
  }
}
