import * as THREE from "three";
import type { Note, Song, Params } from "../../state/State";
import { spawnRipple, updateRipples, clearRipples, notesTriggered, type Ripple } from "../Ripple";
import { colorForNote, setNoteColors } from "../colors";
import { disposeObject } from "../dispose";
import { createPlayhead } from "../playhead";
import { PianoKeyboard } from "../pianoKeyboard";
import { FUTURE_X_PLANE } from "../clipping";

export class PianoRollView {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  notes: Note[] = [];
  song: Song | null = null;
  params: Params;
  dummy = new THREE.Object3D();
  ripples: Ripple[] = [];
  rippleGroup = new THREE.Group();
  playhead: THREE.Mesh;
  keyboard: PianoKeyboard;
  triggered = new Set<number>();
  lastT = 0;
  lastColorMode: Params["colorMode"];

  constructor(params: Params) {
    this.params = params;
    this.lastColorMode = params.colorMode;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), 1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playhead = createPlayhead("vertical");
    this.keyboard = new PianoKeyboard("vertical");
    this.group.add(this.mesh, this.playhead, this.rippleGroup, this.keyboard.group);
  }

  noteMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xffffff,
      emissiveIntensity: this.params.emissive,
      transparent: true,
      opacity: this.params.noteOpacity,
      clippingPlanes: [FUTURE_X_PLANE],
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
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), Math.max(1, this.notes.length));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playhead = createPlayhead("vertical");
    this.rippleGroup = new THREE.Group();
    this.keyboard = new PianoKeyboard("vertical");
    this.group.add(this.mesh, this.playhead, this.rippleGroup, this.keyboard.group);
    scene.add(this.group);
    setNoteColors(this.mesh, this.notes, this.params.colorMode);
    this.lastColorMode = this.params.colorMode;
    let minPitch = 127;
    let maxPitch = 0;
    for (const note of this.notes) {
      if (note.pitch < minPitch) minPitch = note.pitch;
      if (note.pitch > maxPitch) maxPitch = note.pitch;
    }
    this.keyboard.setRange(minPitch - 2, maxPitch + 2);
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
    const limit = params.windowSec * speed * 4 + 5;
    const trackCount = this.song.tracks.length;
    this.notes.forEach((n, i) => {
      const x = (n.start - t) * speed * 4;
      const len = Math.max(0.1, n.duration * speed * 4);
      if (x > limit || x + len < -1) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        return;
      }
      const y = (n.pitch - 60) * (params.noteSize * 0.3);
      const z = (n.track - trackCount / 2) * params.trackSpacing;
      this.dummy.position.set(x + len / 2, y, z);
      this.dummy.scale.set(len, params.noteHeight, params.noteSize);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    const laneDepth = Math.max(4, (trackCount - 1) * params.trackSpacing + 2);
    this.keyboard.update(params.noteSize * 0.3, laneDepth);

    if (t < this.lastT - 0.5) this.triggered.clear();
    const triggered = notesTriggered(this.notes, this.lastT, t, this.triggered);
    for (const i of triggered) {
      const n = this.notes[i];
      const x = (n.start - t) * speed * 4;
      const y = (n.pitch - 60) * (params.noteSize * 0.3);
      const z = (n.track - trackCount / 2) * params.trackSpacing;
      const color = colorForNote(n, params.colorMode).getHex();
      const ripple = spawnRipple(this.rippleGroup, new THREE.Vector3(x, y, z), color, new THREE.Vector3(0, 0, 1));
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
