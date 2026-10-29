import * as THREE from "three";
import type { Params } from "../state/State";

export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  params: Params;
  grid: THREE.GridHelper;
  isDragging = false;
  lastX = 0;
  lastY = 0;
  theta = 0;
  phi = Math.PI / 3;
  radius = 25;
  fog: THREE.Fog;
  ambient: THREE.AmbientLight;
  dir: THREE.DirectionalLight;
  dome: THREE.Mesh | null = null;
  domeTexture: THREE.Texture | null = null;
  domeAngle = 0;
  lastFrame = performance.now();

  constructor(canvas: HTMLCanvasElement, params: Params) {
    this.canvas = canvas;
    this.params = params;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(params.bgColor);
    this.fog = new THREE.Fog(params.bgColor, 20, 120);
    if (params.fog) this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(params.cameraFov, 1, 0.1, 500);
    this.camera.position.set(0, 10, params.cameraDistance);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.dir = new THREE.DirectionalLight(0xffffff, 0.8);
    this.dir.position.set(5, 10, 5);
    this.scene.add(this.ambient, this.dir);

    this.grid = new THREE.GridHelper(200, 40, 0x333344, 0x222233);
    this.grid.visible = params.grid;
    this.scene.add(this.grid);

    this.syncOrbit();
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.style.cursor = "grabbing";
      this.syncOrbit();
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.theta -= dx * 0.005;
      this.phi += dy * 0.005;
      this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
      this.updateCameraFromOrbit();
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button !== 0) return;
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    });
    window.addEventListener("blur", () => {
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    });
  }

  syncOrbit() {
    const p = this.camera.position;
    this.radius = p.length() || this.params.cameraDistance;
    this.phi = Math.acos(Math.min(1, Math.max(-1, p.y / this.radius)));
    this.theta = Math.atan2(p.x, p.z);
  }

  updateCameraFromOrbit() {
    this.camera.position.x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    this.camera.position.y = this.radius * Math.cos(this.phi);
    this.camera.position.z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    this.camera.lookAt(0, 0, 0);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.params.cameraFov;
    this.camera.updateProjectionMatrix();
  }

  async setBackgroundImage(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.x = -1;
      texture.offset.x = 1;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.setDomeTexture(texture);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  setDomeTexture(texture: THREE.Texture) {
    if (this.domeTexture) {
      this.domeTexture.dispose();
      const image = this.domeTexture.image as { close?: () => void } | undefined;
      image?.close?.();
    }
    this.domeTexture = texture;
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

  applyParams(p: Params) {
    this.params = p;
    this.scene.background = new THREE.Color(p.bgColor);
    this.fog.color = new THREE.Color(p.bgColor);
    this.scene.fog = p.fog ? this.fog : null;
    this.grid.visible = p.grid;
    this.camera.fov = p.cameraFov;
    this.camera.updateProjectionMatrix();
    if (this.dome) {
      this.dome.visible = p.bgImage && !!this.domeTexture;
      this.dome.scale.setScalar(p.bgImageRadius);
      this.dome.position.y = p.bgImageOffset;
      const material = this.dome.material as THREE.MeshBasicMaterial;
      material.opacity = p.bgImageOpacity;
      material.transparent = true;
    }
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.params.autoRotate) {
      this.theta += 0.002;
      this.updateCameraFromOrbit();
    }
    if (this.dome) {
      this.domeAngle = (this.domeAngle + this.params.bgImageSpin * dt) % (Math.PI * 2);
      this.dome.rotation.y = this.domeAngle + THREE.MathUtils.degToRad(this.params.bgImageRotation);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.dome?.geometry.dispose();
    (this.dome?.material as THREE.Material | undefined)?.dispose();
    if (this.domeTexture) {
      this.domeTexture.dispose();
      const image = this.domeTexture.image as { close?: () => void } | undefined;
      image?.close?.();
    }
    this.renderer.dispose();
  }
}
