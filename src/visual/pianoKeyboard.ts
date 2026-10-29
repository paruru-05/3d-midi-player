import * as THREE from "three";

const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const WHITE_KEY_COLOR = new THREE.Color(0xd6d9df);
const BLACK_KEY_COLOR = new THREE.Color(0x2b303b);
const WHITE_KEY_LENGTH = 9;
const BLACK_KEY_LENGTH = 5.2;

export class PianoKeyboard {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  layout: "vertical" | "flat";
  dummy = new THREE.Object3D();
  lastStep = 0;
  lastDepth = 0;
  minPitch = 0;
  maxPitch = 127;

  constructor(layout: "vertical" | "flat") {
    this.layout = layout;
    const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.12 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 128);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const color = new THREE.Color();
    for (let pitch = 0; pitch < 128; pitch++) {
      color.copy(NATURAL_PITCH_CLASSES.has(pitch % 12) ? WHITE_KEY_COLOR : BLACK_KEY_COLOR);
      this.mesh.setColorAt(pitch, color);
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.group.add(this.mesh);
  }

  setRange(minPitch: number, maxPitch: number) {
    this.minPitch = Math.max(0, Math.min(127, minPitch));
    this.maxPitch = Math.max(this.minPitch, Math.min(127, maxPitch));
    this.lastStep = 0;
  }

  update(step: number, laneDepth: number) {
    const depth = this.layout === "vertical" ? laneDepth : 0;
    if (step === this.lastStep && depth === this.lastDepth) return;
    this.lastStep = step;
    this.lastDepth = depth;

    for (let pitch = 0; pitch < 128; pitch++) {
      if (pitch < this.minPitch || pitch > this.maxPitch) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(pitch, this.dummy.matrix);
        continue;
      }
      const natural = NATURAL_PITCH_CLASSES.has(pitch % 12);
      const length = natural ? WHITE_KEY_LENGTH : BLACK_KEY_LENGTH;
      const pitchOffset = (pitch - 60) * step;
      if (this.layout === "vertical") {
        this.dummy.position.set(-length / 2, pitchOffset, 0);
        this.dummy.scale.set(length, step * 0.92, laneDepth);
      } else {
        this.dummy.position.set(-length / 2, -0.22, pitchOffset);
        this.dummy.scale.set(length, 0.14, step * 0.92);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(pitch, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
