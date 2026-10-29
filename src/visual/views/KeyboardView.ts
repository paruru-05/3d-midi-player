import * as THREE from "three";
import type { Note, Song, Params } from "../../state/State";
import { spawnRipple, updateRipples, clearRipples, notesTriggered, type Ripple } from "../Ripple";
import { colorForNote, setNoteColors } from "../colors";
import { disposeObject } from "../dispose";
import { createPlayhead } from "../playhead";
import { FUTURE_Z_PLANE } from "../clipping";

export class KeyboardView {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  notes: Note[] = [];
  song: Song | null = null;
  params: Params;
  dummy = new THREE.Object3D();
  ripples: Ripple[] = [];
  rippleGroup = new THREE.Group();
  playhead: THREE.Mesh;
  triggered = new Set<number>();
  lastT = 0;
  lastColorMode: Params["colorMode"];

  constructor(params: Params) {
    this.params = params;
    this.lastColorMode = params.colorMode;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), 1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playhead = createPlayhead("wall");
    this.group.add(this.mesh, this.playhead, this.rippleGroup);
  }

  noteMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xffffff,
      emissiveIntensity: this.params.emissive,
      transparent: true,
      opacity: this.params.noteOpacity,
      clippingPlanes: [FUTURE_Z_PLANE],
    });
  }

  load(song: Song, scene: THREE.Scene) {
    this.song = song;
    this.notes = song.notes;
    this.triggered.clear();
    this.ripples = [];
    this.lastT = 0;
    scene.remove(this.group);
    disposeObject(this.group);
    this.group = new THREE.Group();
    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(80, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    keyboard.position.set(0, -2, 0);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), Math.max(1, this.notes.length));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playhead = createPlayhead("wall");
    this.rippleGroup = new THREE.Group();
    this.group.add(keyboard, this.mesh, this.playhead, this.rippleGroup);
    scene.add(this.group);
    setNoteColors(this.mesh, this.notes, this.params.colorMode);
    this.lastColorMode = this.params.colorMode;
  }

  update(t: number, params: Params) {
    if (!this.song) return;
    this.params = params;
    if (params.colorMode !== this.lastColorMode) {
      setNoteColors(this.mesh, this.notes, params.colorMode);
      this.lastColorMode = params.colorMode;
    }
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    material.opacity = params.noteOpacity;
    material.emissiveIntensity = params.emissive;
    const speed = params.noteSpeed;
    this.notes.forEach((n, i) => {
      const rel = n.start - t;
      if (rel > params.windowSec) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        return;
      }
      const x = (n.pitch - 60) * (params.noteSize * 0.35);
      const z = rel * speed * 6;
      const h = 0.5 + n.velocity * 4;
      this.dummy.position.set(x, h / 2, z);
      this.dummy.scale.set(params.noteSize * 0.6, h, params.noteSize * 0.6);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;

    if (t < this.lastT - 0.5) this.triggered.clear();
    const triggered = notesTriggered(this.notes, this.lastT, t, this.triggered);
    for (const i of triggered) {
      const n = this.notes[i];
      const x = (n.pitch - 60) * (params.noteSize * 0.35);
      const z = (n.start - t) * speed * 6;
      const color = colorForNote(n, params.colorMode).getHex();
      const ripple = spawnRipple(this.rippleGroup, new THREE.Vector3(x, 0, z), color, new THREE.Vector3(0, 0, 1));
      this.ripples.push(ripple);
    }
    this.lastT = t;
    updateRipples(this.ripples, performance.now());
  }

  reset() {
    this.triggered.clear();
    clearRipples(this.ripples);
    this.lastT = 0;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    disposeObject(this.group);
    this.song = null;
    this.notes = [];
    this.ripples = [];
    this.triggered.clear();
    this.lastT = 0;
  }
}
