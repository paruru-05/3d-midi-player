import * as THREE from "three";
import type { Note, Song, Params } from "../../state/State";
import { notesTriggered } from "../Ripple";
import { colorForNote, setNoteColors } from "../colors";
import { disposeObject } from "../dispose";
import { createPlayhead } from "../playhead";
import { PianoKeyboard } from "../pianoKeyboard";
import { FUTURE_X_PLANE } from "../clipping";
import { attachGlow, clearGlow, patchNoteGlow } from "../glow";
import { PlayheadEffects } from "../effects/PlayheadEffects";

export class TopDownView {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  notes: Note[] = [];
  song: Song | null = null;
  params: Params;
  dummy = new THREE.Object3D();
  playhead: THREE.Mesh;
  keyboard: PianoKeyboard;
  effects: PlayheadEffects;
  glow: THREE.InstancedBufferAttribute;
  triggered = new Set<number>();
  lastT = 0;
  lastColorMode: Params["colorMode"];

  constructor(params: Params) {
    this.params = params;
    this.lastColorMode = params.colorMode;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), 1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow = attachGlow(this.mesh, 1);
    this.playhead = createPlayhead("flat");
    this.keyboard = new PianoKeyboard("flat");
    this.effects = new PlayheadEffects("flat", FUTURE_X_PLANE);
    this.group.add(this.mesh, this.playhead, this.keyboard.group, this.effects.group);
  }

  noteMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xffffff,
      emissiveIntensity: this.params.emissive,
      transparent: true,
      opacity: this.params.noteOpacity,
      clippingPlanes: [FUTURE_X_PLANE],
    });
    patchNoteGlow(material);
    return material;
  }

  load(song: Song, scene: THREE.Scene) {
    this.song = song;
    this.notes = song.notes;
    this.triggered.clear();
    this.lastT = 0;
    this.effects.group.removeFromParent();
    this.effects.reset();
    scene.remove(this.group);
    disposeObject(this.group);
    this.group = new THREE.Group();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), Math.max(1, this.notes.length));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow = attachGlow(this.mesh, this.notes.length);
    this.playhead = createPlayhead("flat");
    this.keyboard = new PianoKeyboard("flat");
    this.group.add(this.mesh, this.playhead, this.keyboard.group, this.effects.group);
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

  update(t: number, params: Params, playing: boolean) {
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
    const glow = this.glow.array as Float32Array;
    const glowIntensity = playing && params.glowEnabled ? params.glowIntensity : 0;
    this.notes.forEach((n, i) => {
      const x = (n.start - t) * speed * 4;
      const len = Math.max(0.1, n.duration * speed * 4);
      if (x > limit || x + len < -1) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        glow[i] = 0;
        return;
      }
      const z = (n.pitch - 60) * (params.noteWidth * 0.3);
      this.dummy.position.set(x + len / 2, 0, z);
      this.dummy.scale.set(len, params.noteHeight * 0.5, params.noteWidth);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      glow[i] = this.glowFor(n, t, glowIntensity);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;
    this.keyboard.update(params.noteWidth * 0.3, 0);

    if (playing) {
      if (t < this.lastT - 0.5) this.triggered.clear();
      const triggered = notesTriggered(this.notes, this.lastT, t, this.triggered);
      for (const i of triggered) {
        const n = this.notes[i];
        const z = (n.pitch - 60) * (params.noteWidth * 0.3);
        const color = colorForNote(n, params.colorMode).getHex();
        this.effects.spawn(0.03, 0.05, z, color, this.effectScale(params), params);
      }
    } else {
      this.triggered.clear();
      this.effects.reset();
    }
    this.lastT = t;
    this.effects.update(params);
  }

  private glowFor(n: Note, t: number, intensity: number) {
    if (intensity <= 0) return 0;
    const end = n.start + n.duration;
    if (t >= n.start && t < end) {
      return intensity * (0.85 + 0.15 * Math.sin((t - n.start) * 16));
    }
    const after = 0.22;
    if (t >= end && t < end + after) {
      return intensity * 0.55 * (1 - (t - end) / after);
    }
    return 0;
  }

  private effectScale(params: Params) {
    return Math.max(0.25, (params.noteWidth + params.noteHeight) * 0.5);
  }

  reset() {
    this.triggered.clear();
    clearGlow(this.glow);
    this.effects.reset();
    this.lastT = 0;
  }

  dispose(scene: THREE.Scene) {
    this.effects.group.removeFromParent();
    this.effects.reset();
    scene.remove(this.group);
    disposeObject(this.group);
    this.song = null;
    this.notes = [];
    this.triggered.clear();
    clearGlow(this.glow);
    this.lastT = 0;
  }
}
