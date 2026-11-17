import * as THREE from "three";
import type { Params } from "../../state/State";

export type PlayheadLayout = "wall" | "vertical" | "flat";

const SPARK_MAX = 360;
const BEAM_MAX = 96;
const RING_MAX = 64;

interface Spark {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  size: number;
}

interface Beam {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  size: number;
  length: number;
}

interface Ring {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  size: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const SPARK_VERTEX = /* glsl */ `
#include <clipping_planes_pars_vertex>
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (620.0 / max(0.001, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`;

const SPARK_FRAGMENT = /* glsl */ `
#include <clipping_planes_pars_fragment>
varying vec3 vColor;
void main() {
  #include <clipping_planes_fragment>
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

/**
 * Pooled playhead effects shared by all views.
 * - sparks: one THREE.Points draw call
 * - beams: one InstancedMesh draw call
 * - rings: one InstancedMesh draw call
 */
export class PlayheadEffects {
  group = new THREE.Group();
  layout: PlayheadLayout;
  sparks: Spark[] = [];
  beams: Beam[] = [];
  rings: Ring[] = [];
  sparkPositions = new Float32Array(SPARK_MAX * 3);
  sparkColors = new Float32Array(SPARK_MAX * 3);
  sparkSizes = new Float32Array(SPARK_MAX);
  points: THREE.Points;
  pointGeometry: THREE.BufferGeometry;
  beamMesh: THREE.InstancedMesh;
  ringMesh: THREE.InstancedMesh;
  dummy = new THREE.Object3D();
  tmpColor = new THREE.Color();
  ringQuat = new THREE.Quaternion();
  normal = new THREE.Vector3(0, 0, 1);
  last = performance.now();
  activeSparks = 0;
  activeBeams = 0;
  activeRings = 0;

  constructor(layout: PlayheadLayout, clippingPlane: THREE.Plane) {
    this.layout = layout;
    if (layout === "vertical") {
      this.normal.set(1, 0, 0);
      // The PianoRoll playhead is seen face-on from the default camera, so
      // ring flashes face the viewer instead of lying edge-on in the YZ plane.
    } else if (layout === "flat") {
      this.normal.set(0, 1, 0);
      this.ringQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
    } else {
      this.normal.set(0, 0, 1);
    }

    this.pointGeometry = new THREE.BufferGeometry();
    this.pointGeometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.pointGeometry.setAttribute("aColor", new THREE.BufferAttribute(this.sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.pointGeometry.setAttribute("aSize", new THREE.BufferAttribute(this.sparkSizes, 1).setUsage(THREE.DynamicDrawUsage));
    const pointMaterial = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clipping: true,
      clippingPlanes: [clippingPlane],
    });
    this.points = new THREE.Points(this.pointGeometry, pointMaterial);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;

    const beamGeometry = new THREE.BoxGeometry(1, 1, 1);
    const beamMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clippingPlanes: [clippingPlane],
      fog: false,
    });
    this.beamMesh = new THREE.InstancedMesh(beamGeometry, beamMaterial, BEAM_MAX);
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beamMesh.frustumCulled = false;
    this.beamMesh.renderOrder = 3;

    const ringGeometry = new THREE.RingGeometry(0.68, 1, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      clippingPlanes: [clippingPlane],
      fog: false,
    });
    this.ringMesh = new THREE.InstancedMesh(ringGeometry, ringMaterial, RING_MAX);
    this.ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 4;

    for (let i = 0; i < SPARK_MAX; i++) {
      this.sparks.push({ active: false, x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, r: 0, g: 0, b: 0, size: 1 });
      this.sparkPositions[i * 3 + 1] = -9999;
      this.sparkSizes[i] = 0;
    }
    for (let i = 0; i < BEAM_MAX; i++) {
      this.beams.push({ active: false, x: 0, y: -9999, z: 0, age: 0, life: 1, r: 0, g: 0, b: 0, size: 1, length: 2 });
      this.beamMesh.setColorAt(i, this.tmpColor.setRGB(0, 0, 0));
    }
    for (let i = 0; i < RING_MAX; i++) {
      this.rings.push({ active: false, x: 0, y: -9999, z: 0, age: 0, life: 1, r: 0, g: 0, b: 0, size: 1 });
      this.ringMesh.setColorAt(i, this.tmpColor.setRGB(0, 0, 0));
    }
    this.beamMesh.instanceColor!.needsUpdate = true;
    this.ringMesh.instanceColor!.needsUpdate = true;
    this.hideInactiveInstances();
    this.group.add(this.points, this.beamMesh, this.ringMesh);
  }

  private hideInactiveInstances() {
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.quaternion.identity();
    this.dummy.updateMatrix();
    for (let i = 0; i < BEAM_MAX; i++) {
      if (!this.beams[i].active) this.beamMesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (let i = 0; i < RING_MAX; i++) {
      if (!this.rings[i].active) this.ringMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.beamMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
  }

  private totalActive() {
    return this.activeSparks + this.activeBeams + this.activeRings;
  }

  private spawnSpark(x: number, y: number, z: number, color: THREE.Color, scale: number, life: number) {
    if (this.activeSparks >= SPARK_MAX || this.totalActive() >= 360) return;
    let index = -1;
    for (let i = 0; i < SPARK_MAX; i++) {
      if (!this.sparks[i].active) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const spark = this.sparks[index];
    spark.active = true;
    spark.x = x;
    spark.y = y;
    spark.z = z;
    const spread = 2.6 * scale;
    if (this.layout === "wall") {
      spark.vx = rand(-spread, spread);
      spark.vy = rand(1.5, 5.5) * scale;
      spark.vz = rand(0.4, 1.8) * scale;
    } else if (this.layout === "vertical") {
      spark.vx = rand(0.4, 2.2) * scale;
      spark.vy = rand(1.5, 5.5) * scale;
      spark.vz = rand(-spread, spread);
    } else {
      spark.vx = rand(0.4, 2.2) * scale;
      spark.vy = rand(2.5, 6.5) * scale;
      spark.vz = rand(-spread, spread);
    }
    spark.age = 0;
    spark.life = life * rand(0.55, 1);
    spark.r = color.r;
    spark.g = color.g;
    spark.b = color.b;
    spark.size = rand(0.14, 0.34) * scale;
    this.activeSparks++;
  }

  private spawnBeam(x: number, y: number, z: number, color: THREE.Color, scale: number, life: number) {
    if (this.activeBeams >= BEAM_MAX || this.totalActive() >= 360) return;
    let index = -1;
    for (let i = 0; i < BEAM_MAX; i++) {
      if (!this.beams[i].active) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const beam = this.beams[index];
    beam.active = true;
    const jitter = 0.25 * scale;
    beam.x = x + (this.layout === "vertical" ? 0 : rand(-jitter, jitter));
    beam.y = y;
    beam.z = z + (this.layout === "wall" || this.layout === "vertical" ? rand(-jitter, jitter) : 0);
    beam.age = 0;
    beam.life = life * rand(0.8, 1.15);
    beam.r = color.r;
    beam.g = color.g;
    beam.b = color.b;
    beam.size = rand(0.035, 0.075) * scale;
    beam.length = rand(1.4, 2.8) * scale;
    this.activeBeams++;
  }

  private spawnRing(x: number, y: number, z: number, color: THREE.Color, scale: number, life: number) {
    if (this.activeRings >= RING_MAX || this.totalActive() >= 360) return;
    let index = -1;
    for (let i = 0; i < RING_MAX; i++) {
      if (!this.rings[i].active) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const ring = this.rings[index];
    ring.active = true;
    ring.x = x;
    ring.y = y;
    ring.z = z;
    ring.age = 0;
    ring.life = life;
    ring.r = color.r;
    ring.g = color.g;
    ring.b = color.b;
    ring.size = scale;
    this.activeRings++;
  }

  spawn(x: number, y: number, z: number, color: number, scale: number, params: Params) {
    if (!params.wallEffects) return;
    const limit = Math.max(1, Math.floor(params.effectLimit));
    if (this.totalActive() >= limit) return;
    this.tmpColor.setHex(color);
    const size = Math.max(0.25, scale) * params.effectSize;
    const life = Math.max(0.1, params.effectDuration);
    const offset = this.layout === "wall" ? 0.05 : 0.28;
    const nx = this.normal.x * offset;
    const ny = this.normal.y * offset;
    const nz = this.normal.z * offset;
    if (params.effectRings) this.spawnRing(x + nx, y + ny, z + nz, this.tmpColor, size, life);
    if (params.effectBeams) {
      this.spawnBeam(x + nx, y + ny, z + nz, this.tmpColor, size, life);
      this.spawnBeam(x + nx, y + ny, z + nz, this.tmpColor, size, life);
    }
    if (params.effectSparks) {
      const count = params.effectIntensity > 1.3 ? 8 : 6;
      for (let i = 0; i < count; i++) this.spawnSpark(x + nx, y + ny, z + nz, this.tmpColor, size, life);
    }
  }

  private enforceLimit(limit: number) {
    while (this.totalActive() > limit) {
      let type: "spark" | "beam" | "ring" | null = null;
      let index = -1;
      let oldest = -1;
      for (let i = 0; i < SPARK_MAX; i++) {
        const s = this.sparks[i];
        if (!s.active) continue;
        const ratio = s.age / s.life;
        if (ratio > oldest) { oldest = ratio; type = "spark"; index = i; }
      }
      for (let i = 0; i < BEAM_MAX; i++) {
        const b = this.beams[i];
        if (!b.active) continue;
        const ratio = b.age / b.life;
        if (ratio > oldest) { oldest = ratio; type = "beam"; index = i; }
      }
      for (let i = 0; i < RING_MAX; i++) {
        const r = this.rings[i];
        if (!r.active) continue;
        const ratio = r.age / r.life;
        if (ratio > oldest) { oldest = ratio; type = "ring"; index = i; }
      }
      if (!type) break;
      if (type === "spark") this.deactivateSpark(index);
      else if (type === "beam") this.deactivateBeam(index);
      else this.deactivateRing(index);
    }
  }

  update(params: Params) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const enabled = params.wallEffects;
    const intensity = enabled ? Math.max(0, params.effectIntensity) : 0;
    if (enabled) this.enforceLimit(Math.max(1, Math.floor(params.effectLimit)));

    for (let i = 0; i < SPARK_MAX; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;
      if (!enabled) {
        this.deactivateSpark(i);
        continue;
      }
      s.age += dt;
      if (s.age >= s.life) {
        this.deactivateSpark(i);
        continue;
      }
      s.vy -= 8.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const fade = 1 - s.age / s.life;
      const k = fade * fade * intensity;
      this.sparkPositions[i * 3] = s.x;
      this.sparkPositions[i * 3 + 1] = s.y;
      this.sparkPositions[i * 3 + 2] = s.z;
      this.sparkColors[i * 3] = s.r * k;
      this.sparkColors[i * 3 + 1] = s.g * k;
      this.sparkColors[i * 3 + 2] = s.b * k;
      this.sparkSizes[i] = s.size * (0.6 + fade * 0.7);
    }
    this.pointGeometry.attributes.position.needsUpdate = true;
    this.pointGeometry.attributes.aColor.needsUpdate = true;
    this.pointGeometry.attributes.aSize.needsUpdate = true;

    for (let i = 0; i < BEAM_MAX; i++) {
      const b = this.beams[i];
      if (!b.active) continue;
      if (!enabled) {
        this.deactivateBeam(i);
        continue;
      }
      b.age += dt;
      if (b.age >= b.life) {
        this.deactivateBeam(i);
        continue;
      }
      const fade = 1 - b.age / b.life;
      const rise = b.y + b.age * 12 * b.size * 6;
      b.x += dt * 0.15 * b.size;
      this.dummy.position.set(b.x, rise + b.length * 0.5, b.z);
      this.dummy.quaternion.identity();
      this.dummy.scale.set(b.size, b.length * (0.7 + fade * 0.5), b.size);
      this.dummy.updateMatrix();
      this.beamMesh.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.setRGB(b.r * fade * intensity, b.g * fade * intensity, b.b * fade * intensity);
      this.beamMesh.setColorAt(i, this.tmpColor);
    }
    this.beamMesh.instanceMatrix.needsUpdate = true;
    this.beamMesh.instanceColor!.needsUpdate = true;

    for (let i = 0; i < RING_MAX; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      if (!enabled) {
        this.deactivateRing(i);
        continue;
      }
      r.age += dt;
      if (r.age >= r.life) {
        this.deactivateRing(i);
        continue;
      }
      const p = r.age / r.life;
      const fade = (1 - p) * (1 - p);
      const scale = r.size * (0.3 + p * 2.2);
      this.dummy.position.set(r.x, r.y, r.z);
      this.dummy.quaternion.copy(this.ringQuat);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.setRGB(r.r * fade * intensity, r.g * fade * intensity, r.b * fade * intensity);
      this.ringMesh.setColorAt(i, this.tmpColor);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceColor!.needsUpdate = true;
  }

  private deactivateSpark(i: number) {
    const s = this.sparks[i];
    if (!s.active) return;
    s.active = false;
    this.activeSparks--;
    this.sparkPositions[i * 3 + 1] = -9999;
    this.sparkColors[i * 3] = 0;
    this.sparkColors[i * 3 + 1] = 0;
    this.sparkColors[i * 3 + 2] = 0;
    this.sparkSizes[i] = 0;
  }

  private deactivateBeam(i: number) {
    const b = this.beams[i];
    if (!b.active) return;
    b.active = false;
    this.activeBeams--;
    this.dummy.position.set(0, -9999, 0);
    this.dummy.quaternion.identity();
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.beamMesh.setMatrixAt(i, this.dummy.matrix);
    this.beamMesh.setColorAt(i, this.tmpColor.setRGB(0, 0, 0));
  }

  private deactivateRing(i: number) {
    const r = this.rings[i];
    if (!r.active) return;
    r.active = false;
    this.activeRings--;
    this.dummy.position.set(0, -9999, 0);
    this.dummy.quaternion.identity();
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.ringMesh.setMatrixAt(i, this.dummy.matrix);
    this.ringMesh.setColorAt(i, this.tmpColor.setRGB(0, 0, 0));
  }

  reset() {
    for (let i = 0; i < SPARK_MAX; i++) {
      this.sparks[i].active = false;
      this.sparkPositions[i * 3 + 1] = -9999;
      this.sparkColors[i * 3] = 0;
      this.sparkColors[i * 3 + 1] = 0;
      this.sparkColors[i * 3 + 2] = 0;
      this.sparkSizes[i] = 0;
    }
    for (let i = 0; i < BEAM_MAX; i++) this.beams[i].active = false;
    for (let i = 0; i < RING_MAX; i++) this.rings[i].active = false;
    this.activeSparks = 0;
    this.activeBeams = 0;
    this.activeRings = 0;
    this.hideInactiveInstances();
    this.pointGeometry.attributes.position.needsUpdate = true;
    this.pointGeometry.attributes.aColor.needsUpdate = true;
    this.pointGeometry.attributes.aSize.needsUpdate = true;
    this.beamMesh.instanceColor!.needsUpdate = true;
    this.ringMesh.instanceColor!.needsUpdate = true;
  }

  dispose() {
    this.reset();
    this.group.removeFromParent();
    this.pointGeometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.beamMesh.geometry.dispose();
    (this.beamMesh.material as THREE.Material).dispose();
    this.beamMesh.dispose();
    this.ringMesh.geometry.dispose();
    (this.ringMesh.material as THREE.Material).dispose();
    this.ringMesh.dispose();
  }
}
