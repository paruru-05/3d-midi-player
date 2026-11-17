import * as THREE from "three";
import type { Note, Song, Params } from "../../state/State";
import { spawnRipple, updateRipples, clearRipples, notesTriggered, type Ripple } from "../Ripple";
import { colorForNote, setNoteColors } from "../colors";
import { disposeObject } from "../dispose";
import { createPlayhead } from "../playhead";
import { FUTURE_Z_PLANE } from "../clipping";
import { attachGlow, clearGlow, patchNoteGlow } from "../glow";
import { PlayheadEffects } from "../effects/PlayheadEffects";

export class FallView {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  notes: Note[] = [];
  song: Song | null = null;
  params: Params;
  dummy = new THREE.Object3D();
  ripples: Ripple[] = [];
  rippleGroup = new THREE.Group();
  playhead: THREE.Mesh;
  effects: PlayheadEffects;
  glow: THREE.InstancedBufferAttribute;
  triggered = new Set<number>();
  lastT = 0;
  lastColorMode: Params["colorMode"];
  wallTexture: THREE.Texture | null = null;
  wallUrl: string | null = null;

  constructor(params: Params) {
    this.params = params;
    this.lastColorMode = params.colorMode;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), 1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow = attachGlow(this.mesh, 1);
    this.playhead = createPlayhead("wall");
    this.effects = new PlayheadEffects("wall", FUTURE_Z_PLANE);
    this.group.add(this.mesh, this.playhead, this.effects.group);
  }

  noteMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xffffff,
      emissiveIntensity: this.params.emissive,
      transparent: true,
      opacity: this.params.noteOpacity,
      clippingPlanes: [FUTURE_Z_PLANE],
    });
    patchNoteGlow(material);
    return material;
  }

  async setWallImage(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 8;
      this.disposeWallTexture();
      this.wallTexture = texture;
      this.wallUrl = url;
      this.params.wallImage = true;
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  clearWallImage() {
    this.disposeWallTexture();
    this.params.wallImage = false;
  }

  private disposeWallTexture() {
    if (this.wallTexture) {
      this.wallTexture.dispose();
      this.wallTexture = null;
    }
    if (this.wallUrl) {
      URL.revokeObjectURL(this.wallUrl);
      this.wallUrl = null;
    }
  }

  private applyWall(params: Params) {
    const material = this.playhead.material as THREE.MeshBasicMaterial;
    material.color.set(params.wallColor);
    material.opacity = params.wallOpacity;
    material.transparent = true;
    const map = params.wallImage && this.wallTexture ? this.wallTexture : null;
    if (material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
  }

  load(song: Song, scene: THREE.Scene) {
    this.song = song;
    this.notes = song.notes;
    this.triggered.clear();
    this.ripples = [];
    this.lastT = 0;
    this.effects.group.removeFromParent();
    this.effects.reset();
    scene.remove(this.group);
    disposeObject(this.group);
    this.group = new THREE.Group();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.noteMaterial(), Math.max(1, this.notes.length));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow = attachGlow(this.mesh, this.notes.length);
    this.playhead = createPlayhead("wall");
    this.rippleGroup = new THREE.Group();
    this.group.add(this.mesh, this.playhead, this.rippleGroup, this.effects.group);
    scene.add(this.group);
    setNoteColors(this.mesh, this.notes, this.params.colorMode);
    this.lastColorMode = this.params.colorMode;
    this.applyWall(this.params);
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
    this.applyWall(params);
    const speed = params.noteSpeed;
    const win = params.windowSec;
    const trackCount = this.song.tracks.length;
    const glow = this.glow.array as Float32Array;
    const glowIntensity = playing && params.glowEnabled ? params.glowIntensity : 0;
    this.notes.forEach((n, i) => {
      const rel = n.start - t;
      const z = rel * speed * 6;
      const len = Math.max(0.2, n.duration * speed * 6);
      if (rel > win || z + len < -1) {
        this.dummy.position.set(0, 0, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        glow[i] = 0;
        return;
      }
      const x = (n.pitch - 60) * (params.noteWidth * 0.35);
      const y = (n.track - (trackCount / 2)) * params.trackSpacing;
      this.dummy.position.set(x, y, z + len / 2);
      this.dummy.scale.set(params.noteWidth, params.noteHeight, len);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      glow[i] = this.glowFor(n, t, glowIntensity);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;

    if (playing) {
      if (t < this.lastT - 0.5) this.triggered.clear();
      const triggered = notesTriggered(this.notes, this.lastT, t, this.triggered);
      for (const i of triggered) {
        const n = this.notes[i];
        const x = (n.pitch - 60) * (params.noteWidth * 0.35);
        const y = (n.track - (trackCount / 2)) * params.trackSpacing;
        const color = colorForNote(n, params.colorMode).getHex();
        this.ripples.push(spawnRipple(this.rippleGroup, new THREE.Vector3(x, y, 0), color, new THREE.Vector3(0, 0, 1)));
        this.effects.spawn(x, y, 0, color, this.effectScale(params), params);
      }
    } else {
      this.triggered.clear();
      this.effects.reset();
    }
    this.lastT = t;
    updateRipples(this.ripples, performance.now());
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
    clearRipples(this.ripples);
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
    this.ripples = [];
    this.triggered.clear();
    clearGlow(this.glow);
    this.lastT = 0;
  }
}
