import * as THREE from "three";
import type { Params } from "../state/State";

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  params: Params;
  grid: THREE.GridHelper;
  target = new THREE.Vector3();
  dragMode: "orbit" | "pan" | null = null;
  lastX = 0;
  lastY = 0;
  theta = 0;
  phi = Math.PI / 3;
  radius = 25;
  keys = new Set<string>();
  controlsEnabled = true;
  fog: THREE.Fog;
  ambient: THREE.AmbientLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  dome: THREE.Mesh | null = null;
  domeTexture: THREE.Texture | null = null;
  domeVideo: HTMLVideoElement | null = null;
  domeMediaUrl: string | null = null;
  domeAnimatedTexture: THREE.Texture | null = null;
  domeAngle = 0;
  lastFrame = performance.now();
  spinQuat = new THREE.Quaternion();

  constructor(canvas: HTMLCanvasElement, params: Params) {
    this.canvas = canvas;
    this.params = params;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(params.bgColor);
    this.fog = new THREE.Fog(params.bgColor, 20, 120);
    if (params.fog) this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(params.cameraFov, 1, 0.1, 2000);
    this.camera.position.set(0, 10, params.cameraDistance);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.key = new THREE.DirectionalLight(0xffffff, 1.1);
    this.rim = new THREE.DirectionalLight(0x88aaff, 0.55);
    this.scene.add(this.ambient, this.key, this.rim);

    this.grid = new THREE.GridHelper(200, 40, 0x333344, 0x222233);
    this.grid.visible = params.grid;
    this.scene.add(this.grid);

    this.syncOrbit();
    this.applyParams(params);
    this.bindControls();
  }

  bindControls() {
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (!this.controlsEnabled) return;
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      this.dragMode = e.button === 0 ? "orbit" : "pan";
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.style.cursor = "grabbing";
      if (this.dragMode === "orbit") this.syncOrbit();
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.controlsEnabled || !this.dragMode) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.dragMode === "orbit") {
        this.theta -= dx * 0.005;
        this.phi += dy * 0.005;
        this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
        this.updateCameraFromOrbit();
      } else {
        this.panBy(dx, dy);
      }
    });
    window.addEventListener("mouseup", () => {
      this.dragMode = null;
      this.canvas.style.cursor = this.controlsEnabled ? "grab" : "default";
    });
    window.addEventListener("blur", () => {
      this.dragMode = null;
      this.keys.clear();
      this.canvas.style.cursor = this.controlsEnabled ? "grab" : "default";
    });
    this.canvas.addEventListener("wheel", (e) => {
      if (!this.controlsEnabled) return;
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.001));
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (!this.controlsEnabled || isTypingTarget(e.target)) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
  }

  setControlsEnabled(enabled: boolean) {
    this.controlsEnabled = enabled;
    if (!enabled) {
      this.dragMode = null;
      this.keys.clear();
      this.canvas.style.cursor = "default";
    } else {
      this.canvas.style.cursor = "grab";
    }
  }

  syncOrbit() {
    const offset = this.camera.position.clone().sub(this.target);
    this.radius = offset.length() || this.params.cameraDistance;
    this.phi = Math.acos(Math.min(1, Math.max(-1, offset.y / this.radius)));
    this.theta = Math.atan2(offset.x, offset.z);
  }

  updateCameraFromOrbit() {
    this.camera.position.set(
      this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }

  setCameraPreset(position: THREE.Vector3) {
    this.target.set(0, 0, 0);
    this.camera.position.copy(position);
    this.camera.lookAt(this.target);
    this.syncOrbit();
  }

  panBy(dx: number, dy: number) {
    const h = Math.max(1, this.canvas.clientHeight);
    const scale = (2 * this.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const delta = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale));
    const before = this.target.clone();
    this.target.add(delta);
    this.clampTarget();
    this.camera.position.add(this.target.clone().sub(before));
    this.camera.lookAt(this.target);
  }

  zoom(factor: number) {
    this.radius = Math.max(5, Math.min(250, this.radius * factor));
    this.updateCameraFromOrbit();
  }

  clampTarget() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -150, 150);
    this.target.y = THREE.MathUtils.clamp(this.target.y, -80, 160);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -150, 150);
  }

  applyMovement(dt: number) {
    if (!this.keys.size) return;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, Y_AXIS).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) move.add(forward);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) move.sub(forward);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) move.sub(right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) move.add(right);
    if (move.lengthSq() === 0) return;
    const speed = Math.max(12, this.radius * 0.75);
    move.normalize().multiplyScalar(speed * dt);
    const before = this.target.clone();
    this.target.add(move);
    this.clampTarget();
    this.camera.position.add(this.target.clone().sub(before));
    this.camera.lookAt(this.target);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.params.cameraFov;
    this.camera.updateProjectionMatrix();
  }

  configureDomeTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.x = -1;
    texture.offset.x = 1;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
  }

  async setDomeMedia(file: File) {
    const name = file.name.toLowerCase();
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|ogv)$/.test(name);
    if (isVideo) {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = "auto";
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("動画の読み込みに失敗しました。")), { once: true });
          video.load();
        });
        await video.play().catch(() => undefined);
        const texture = new THREE.VideoTexture(video);
        this.configureDomeTexture(texture);
        this.installDomeMedia(texture, video, url);
      } catch (err) {
        URL.revokeObjectURL(url);
        video.pause();
        video.removeAttribute("src");
        video.load();
        throw err;
      }
      return;
    }

    const url = URL.createObjectURL(file);
    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });
      this.configureDomeTexture(texture);
      const animated = file.type === "image/gif" || /\.gif$/.test(name);
      this.installDomeMedia(texture, null, url, animated ? texture : null);
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  installDomeMedia(texture: THREE.Texture, video: HTMLVideoElement | null, url: string, animatedTexture: THREE.Texture | null = null) {
    this.disposeDomeMedia();
    this.domeTexture = texture;
    this.domeVideo = video;
    this.domeMediaUrl = url;
    this.domeAnimatedTexture = animatedTexture;
    if (!this.dome) {
      const geometry = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        transparent: true,
        opacity: this.params.bgImageOpacity,
        depthWrite: false,
        fog: false,
      });
      this.dome = new THREE.Mesh(geometry, material);
      this.dome.renderOrder = -1;
      this.dome.frustumCulled = false;
      this.scene.add(this.dome);
    } else {
      const material = this.dome.material as THREE.MeshBasicMaterial;
      material.map = texture;
      material.needsUpdate = true;
    }
    this.dome.scale.setScalar(this.params.bgImageRadius);
    this.dome.position.y = this.params.bgImageOffset;
    this.dome.visible = this.params.bgImage;
  }

  disposeDomeMedia() {
    if (this.domeVideo) {
      this.domeVideo.pause();
      this.domeVideo.removeAttribute("src");
      this.domeVideo.load();
      this.domeVideo = null;
    }
    if (this.domeMediaUrl) {
      URL.revokeObjectURL(this.domeMediaUrl);
      this.domeMediaUrl = null;
    }
    this.domeAnimatedTexture = null;
    if (this.domeTexture) {
      this.domeTexture.dispose();
      const image = this.domeTexture.image as { close?: () => void } | undefined;
      image?.close?.();
      this.domeTexture = null;
    }
    if (this.dome) {
      const material = this.dome.material as THREE.MeshBasicMaterial;
      material.map = null;
      material.needsUpdate = true;
      this.dome.visible = false;
    }
  }

  applyLight(light: THREE.Light, on: boolean, intensity: number, color: string) {
    light.visible = on;
    light.intensity = intensity;
    light.color.set(color);
  }

  positionDirectional(light: THREE.DirectionalLight, azimuth: number, elevation: number) {
    const az = THREE.MathUtils.degToRad(azimuth);
    const el = THREE.MathUtils.degToRad(elevation);
    const distance = 40;
    light.position.set(
      Math.cos(el) * Math.sin(az) * distance,
      Math.sin(el) * distance,
      Math.cos(el) * Math.cos(az) * distance,
    );
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
  }

  applyParams(p: Params) {
    this.params = p;
    if (this.scene.background instanceof THREE.Color) this.scene.background.set(p.bgColor);
    else this.scene.background = new THREE.Color(p.bgColor);
    this.fog.color.set(p.bgColor);
    this.scene.fog = p.fog ? this.fog : null;
    this.grid.visible = p.grid;
    if (this.camera.fov !== p.cameraFov) {
      this.camera.fov = p.cameraFov;
      this.camera.updateProjectionMatrix();
    }

    this.applyLight(this.ambient, p.ambientOn, p.ambientIntensity, p.ambientColor);
    this.applyLight(this.key, p.keyOn, p.keyIntensity, p.keyColor);
    this.applyLight(this.rim, p.rimOn, p.rimIntensity, p.rimColor);
    this.positionDirectional(this.key, p.keyAzimuth, p.keyElevation);
    this.positionDirectional(this.rim, p.rimAzimuth, p.rimElevation);

    if (this.dome) {
      this.dome.visible = p.bgImage && !!this.domeTexture;
      this.dome.scale.setScalar(p.bgImageRadius);
      const material = this.dome.material as THREE.MeshBasicMaterial;
      material.opacity = p.bgImageOpacity;
      material.transparent = true;
    }
  }

  updateDome(dt: number) {
    if (!this.dome) return;
    this.domeAngle = (this.domeAngle + this.params.bgImageSpin * dt) % (Math.PI * 2);
    const extra = this.domeAngle + THREE.MathUtils.degToRad(this.params.bgImageRotation);
    if (this.params.domeFollow) {
      this.dome.position.copy(this.camera.position);
      this.dome.position.y += this.params.bgImageOffset;
      this.dome.quaternion.copy(this.camera.quaternion);
      this.spinQuat.setFromAxisAngle(Y_AXIS, extra);
      this.dome.quaternion.multiply(this.spinQuat);
    } else {
      this.dome.position.set(0, this.params.bgImageOffset, 0);
      this.dome.rotation.set(0, extra, 0);
    }
    if (this.domeAnimatedTexture) this.domeAnimatedTexture.needsUpdate = true;
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.controlsEnabled) {
      this.applyMovement(dt);
      if (this.params.autoRotate) {
        this.theta += 0.002;
        this.updateCameraFromOrbit();
      }
    }
    this.updateDome(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposeDomeMedia();
    if (this.dome) {
      this.dome.geometry.dispose();
      (this.dome.material as THREE.Material).dispose();
      this.scene.remove(this.dome);
      this.dome = null;
    }
    this.renderer.dispose();
  }
}
