import * as THREE from "three";
import { SceneManager } from "../visual/SceneManager";
import type { View } from "../visual/View";
import { FallView } from "../visual/views/FallView";
import { PianoRollView } from "../visual/views/PianoRollView";
import { TopDownView } from "../visual/views/TopDownView";
import { KeyboardView } from "../visual/views/KeyboardView";
import { TransportController } from "../playback/Transport";
import { AudioEngine } from "../audio/AudioEngine";
import { loadMidi } from "../midi/MidiLoader";
import { programName } from "../midi/gm";
import type { Params, Song, ViewMode } from "../state/State";
import GUI from "lil-gui";

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export class App {
  canvas: HTMLCanvasElement;
  params: Params;
  scene: SceneManager;
  audio: AudioEngine;
  transport: TransportController;
  views: Record<ViewMode, View>;
  currentView: ViewMode = "fall";
  song: Song | null = null;
  gui: GUI;
  tracksEl: HTMLElement;
  timeEl: HTMLElement;
  seekEl: HTMLInputElement;
  playBtn: HTMLButtonElement;
  fullscreenBtn: HTMLButtonElement;
  loadingEl: HTMLElement;
  loadingTextEl: HTMLElement;
  bgFile: HTMLInputElement;
  wallFile: HTMLInputElement;
  songLoading = false;
  sf2Loading = false;
  songLoadSeq = 0;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.tracksEl = document.getElementById("tracks")!;
    this.timeEl = document.getElementById("time")!;
    this.seekEl = document.getElementById("seek") as HTMLInputElement;
    this.playBtn = document.getElementById("playBtn") as HTMLButtonElement;
    this.fullscreenBtn = document.getElementById("fsBtn") as HTMLButtonElement;
    this.loadingEl = document.getElementById("loading")!;
    this.loadingTextEl = document.getElementById("loadingText")!;

    this.bgFile = document.createElement("input");
    this.bgFile.type = "file";
    this.bgFile.accept = "image/*,video/mp4,video/webm,.gif,.mp4,.webm";
    this.bgFile.style.display = "none";
    document.body.appendChild(this.bgFile);

    this.wallFile = document.createElement("input");
    this.wallFile.type = "file";
    this.wallFile.accept = "image/*";
    this.wallFile.style.display = "none";
    document.body.appendChild(this.wallFile);

    this.params = {
      cameraFov: 60,
      cameraDistance: 25,
      cameraAngle: 0,
      autoRotate: false,
      ambientOn: true,
      ambientIntensity: 1.1,
      ambientColor: "#ffffff",
      keyOn: true,
      keyIntensity: 1.55,
      keyColor: "#ffffff",
      keyAzimuth: 35,
      keyElevation: 55,
      rimOn: true,
      rimIntensity: 0.8,
      rimColor: "#88aaff",
      rimAzimuth: 200,
      rimElevation: 25,
      noteWidth: 1,
      noteHeight: 1,
      colorMode: "track",
      noteOpacity: 0.9,
      emissive: 0.3,
      trail: 0,
      glowEnabled: true,
      glowIntensity: 1.25,
      bgColor: "#0b0d12",
      bgImage: false,
      bgImageOpacity: 0.85,
      bgImageRadius: 300,
      bgImageOffset: -80,
      bgImageSpin: 0.01,
      bgImageRotation: 0,
      domeFollow: false,
      wallOpacity: 0.18,
      wallColor: "#4488ff",
      wallImage: false,
      grid: true,
      fog: true,
      bloom: false,
      wallEffects: true,
      effectSparks: true,
      effectBeams: true,
      effectRings: true,
      effectIntensity: 1,
      effectSize: 1,
      effectDuration: 0.75,
      effectLimit: 160,
      noteSpeed: 1,
      windowSec: 12,
      pitchMin: 0,
      pitchMax: 127,
      trackSpacing: 1.4,
    };

    this.scene = new SceneManager(this.canvas, this.params);
    this.audio = new AudioEngine();
    this.transport = new TransportController();
    this.transport.onNote = (note, audioTime) => {
      this.audio.playNote(note, audioTime);
    };

    this.views = {
      fall: new FallView(this.params),
      pianoroll: new PianoRollView(this.params),
      topdown: new TopDownView(this.params),
      keyboard: new KeyboardView(this.params),
    };

    this.gui = new GUI({ container: document.getElementById("params")!, title: "Parameters" });
    this.buildGui();

    this.applyViewCamera("fall");
    this.bindUI();
    this.updateLoading();
    this.loop();
  }

  private refreshGui() {
    this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  }

  buildGui() {
    const p = this.params;
    const cam = this.gui.addFolder("Camera");
    cam.add(p, "cameraFov", 30, 100).name("FOV").onChange(() => this.scene.resize());
    cam.add(p, "cameraDistance", 5, 120).name("距離").onChange(() => this.applyViewCamera(this.currentView));
    cam.add(p, "autoRotate").name("自動回転");
    cam.add({ reset: () => this.resetCamera() }, "reset").name("視点リセット");

    const light = this.gui.addFolder("Lighting");
    light.add(p, "ambientOn").name("環境光 ON");
    light.add(p, "ambientIntensity", 0, 3).name("環境光 強度");
    light.addColor(p, "ambientColor").name("環境光 色");
    light.add(p, "keyOn").name("キーライト ON");
    light.add(p, "keyIntensity", 0, 5).name("キー 強度");
    light.addColor(p, "keyColor").name("キー 色");
    light.add(p, "keyAzimuth", -180, 180).name("キー 方位");
    light.add(p, "keyElevation", -90, 90).name("キー 仰角");
    light.add(p, "rimOn").name("リムライト ON");
    light.add(p, "rimIntensity", 0, 5).name("リム 強度");
    light.addColor(p, "rimColor").name("リム 色");
    light.add(p, "rimAzimuth", -180, 180).name("リム 方位");
    light.add(p, "rimElevation", -90, 90).name("リム 仰角");

    const notes = this.gui.addFolder("Notes");
    notes.add(p, "noteWidth", 0.2, 3).name("幅 W");
    notes.add(p, "noteHeight", 0.2, 3).name("高さ H");
    notes.add(p, "colorMode", ["track", "channel", "velocity", "pitch"]).name("色");
    notes.add(p, "noteOpacity", 0.1, 1).name("不透明度");
    notes.add(p, "emissive", 0, 2).name("基本発光");
    notes.add(p, "glowEnabled").name("発音中 発光");
    notes.add(p, "glowIntensity", 0, 3).name("発光 強度");

    const sceneF = this.gui.addFolder("Scene");
    sceneF.addColor(p, "bgColor").name("背景色").onChange(() => this.scene.applyParams(p));
    sceneF.add(p, "grid").name("グリッド");
    sceneF.add(p, "fog").name("フォグ");

    const bg = this.gui.addFolder("Background Dome");
    bg.add(p, "bgImage").name("ドーム表示");
    bg.add(p, "domeFollow").name("視点追従");
    bg.add(p, "bgImageOpacity", 0, 1).name("不透明度");
    bg.add(p, "bgImageRadius", 100, 400).name("半径");
    bg.add(p, "bgImageOffset", -200, 100).name("高さ");
    bg.add(p, "bgImageSpin", -0.2, 0.2).name("スピン");
    bg.add(p, "bgImageRotation", 0, 360).name("回転");
    bg.add({ load: () => this.bgFile.click() }, "load").name("画像/GIF/動画を読み込む");

    const wall = this.gui.addFolder("Fall Wall");
    wall.add(p, "wallOpacity", 0, 1).name("不透明度");
    wall.addColor(p, "wallColor").name("壁 色");
    wall.add(p, "wallImage").name("壁画像を使用");
    wall.add({ load: () => this.wallFile.click() }, "load").name("壁画像を読み込む");
    wall.add({ clear: () => this.clearWallImage() }, "clear").name("壁画像を解除");

    const fx = this.gui.addFolder("Playhead Effects");
    fx.add(p, "wallEffects").name("エフェクト全体");
    fx.add(p, "effectSparks").name("火花");
    fx.add(p, "effectBeams").name("上昇する光");
    fx.add(p, "effectRings").name("リング/フラッシュ");
    fx.add(p, "effectIntensity", 0, 2.5).name("強度");
    fx.add(p, "effectSize", 0.3, 3).name("サイズ");
    fx.add(p, "effectDuration", 0.2, 2).name("継続時間");
    fx.add(p, "effectLimit", 10, 360, 10).name("同時上限数");

    const timeF = this.gui.addFolder("Time");
    timeF.add(p, "noteSpeed", 0.2, 12).name("ノーツ速度");
    timeF.add(p, "windowSec", 4, 40).name("表示秒数");
    timeF.add(p, "trackSpacing", 0.5, 4).name("トラック間隔");
  }

  clearWallImage() {
    (this.views.fall as FallView).clearWallImage();
    this.refreshGui();
  }

  beginSongLoad(text: string) {
    const seq = ++this.songLoadSeq;
    this.songLoading = true;
    this.loadingTextEl.textContent = text;
    this.transport.stop();
    this.playBtn.textContent = "▶";
    this.views[this.currentView].reset();
    this.updateLoading();
    return seq;
  }

  endSongLoad(seq: number) {
    if (seq !== this.songLoadSeq) return;
    this.songLoading = false;
    this.updateLoading();
  }

  updateLoading() {
    const loading = this.songLoading || this.sf2Loading;
    this.loadingEl.classList.toggle("hidden", !loading);
    if (this.songLoading) this.loadingTextEl.textContent = "MIDIと音源を読み込み中...";
    else if (this.sf2Loading) this.loadingTextEl.textContent = "サウンドフォントを読み込み中...";
    this.playBtn.disabled = loading || !this.song;
    this.scene.setControlsEnabled(!loading);
  }

  async loadFile(file: File) {
    const seq = this.beginSongLoad("MIDIと音源を読み込み中...");
    try {
      const buffer = await file.arrayBuffer();
      if (seq !== this.songLoadSeq) return;
      await this.loadSong(buffer, seq);
    } catch (err) {
      console.error(err);
      if (seq === this.songLoadSeq) alert("MIDIの読み込みに失敗しました。");
    } finally {
      this.endSongLoad(seq);
    }
  }

  bindUI() {
    const loadBtn = document.getElementById("loadBtn")!;
    const fileInput = document.getElementById("file") as HTMLInputElement;
    loadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (file) await this.loadFile(file);
      fileInput.value = "";
    });
    const stage = document.getElementById("stage")!;
    stage.addEventListener("dragover", (e) => e.preventDefault());
    stage.addEventListener("drop", async (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) await this.loadFile(file);
    });

    this.playBtn.addEventListener("click", async () => {
      if (!this.song || this.songLoading || this.sf2Loading) return;
      await this.audio.resume();
      if (this.transport.state === "started") {
        this.transport.pause();
        this.playBtn.textContent = "▶";
      } else {
        if (this.transport.seconds >= this.song.duration - 0.01) this.transport.seek(0);
        this.transport.play();
        this.playBtn.textContent = "⏸";
      }
    });
    document.getElementById("stopBtn")!.addEventListener("click", () => {
      this.transport.stop();
      this.views[this.currentView].reset();
      this.playBtn.textContent = "▶";
    });
    document.getElementById("resetCamBtn")!.addEventListener("click", () => this.resetCamera());

    const viewSel = document.getElementById("viewSel") as HTMLSelectElement;
    viewSel.addEventListener("change", () => {
      this.switchView(viewSel.value as ViewMode);
    });

    this.seekEl.addEventListener("input", () => {
      if (!this.song) return;
      this.views[this.currentView].reset();
      const sec = (parseFloat(this.seekEl.value) / 100) * this.song.duration;
      this.transport.seek(sec);
    });

    const speedEl = document.getElementById("speed") as HTMLInputElement;
    speedEl.addEventListener("input", () => {
      this.transport.setSpeed(parseFloat(speedEl.value));
    });

    const volEl = document.getElementById("volume") as HTMLInputElement;
    volEl.addEventListener("input", () => {
      this.audio.master.gain.value = parseFloat(volEl.value);
    });

    const customInput = document.createElement("input");
    customInput.type = "file";
    customInput.accept = ".sf2,.sf3";
    customInput.style.display = "none";
    document.body.appendChild(customInput);

    const customToggle = document.createElement("input");
    customToggle.type = "checkbox";
    customToggle.addEventListener("change", () => this.audio.setUseCustom(customToggle.checked));
    const customWrap = document.createElement("label");
    customWrap.className = "label";
    customWrap.style.display = "none";
    customWrap.append(customToggle, document.createTextNode(" SF2"));
    document.getElementById("topbar")!.appendChild(customWrap);

    const sf2Btn = document.createElement("button");
    sf2Btn.textContent = "SF2読込";
    sf2Btn.addEventListener("click", () => {
      if (!this.songLoading && !this.sf2Loading) customInput.click();
    });
    document.getElementById("topbar")!.appendChild(sf2Btn);

    customInput.addEventListener("change", async () => {
      const file = customInput.files?.[0];
      if (!file) return;
      this.sf2Loading = true;
      this.updateLoading();
      try {
        await this.audio.loadCustomSF2(await file.arrayBuffer());
        customWrap.style.display = "";
        customToggle.checked = true;
        this.audio.setUseCustom(true);
        sf2Btn.textContent = `SF2: ${file.name}`;
      } catch (err) {
        console.error(err);
        alert("SF2の読み込みに失敗しました。");
      } finally {
        this.sf2Loading = false;
        this.updateLoading();
        this.refreshGui();
      }
      customInput.value = "";
    });

    this.bgFile.addEventListener("change", async () => {
      const file = this.bgFile.files?.[0];
      if (!file) return;
      try {
        await this.scene.setDomeMedia(file);
        this.params.bgImage = true;
        this.scene.applyParams(this.params);
        this.refreshGui();
      } catch (err) {
        console.error(err);
        alert("背景画像 / GIF / 動画の読み込みに失敗しました。既存の背景を使用します。");
      }
      this.bgFile.value = "";
    });

    this.wallFile.addEventListener("change", async () => {
      const file = this.wallFile.files?.[0];
      if (!file) return;
      try {
        await (this.views.fall as FallView).setWallImage(file);
        this.refreshGui();
      } catch (err) {
        console.error(err);
        alert("壁画像の読み込みに失敗しました。");
      }
      this.wallFile.value = "";
    });

    this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    document.addEventListener("fullscreenchange", () => {
      this.fullscreenBtn.textContent = document.fullscreenElement ? "全画面解除" : "全画面";
      requestAnimationFrame(() => this.scene.resize());
    });
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyF" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      this.toggleFullscreen();
    });
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.getElementById("app")!.requestFullscreen();
      }
    } catch (err) {
      console.warn("全画面に切り替えられませんでした", err);
    }
    requestAnimationFrame(() => this.scene.resize());
  }

  async loadSong(buffer: ArrayBuffer, seq: number) {
    const song = loadMidi(buffer);
    if (seq !== this.songLoadSeq) return;
    this.audio.resetInstruments();
    const byKey = new Map<string, { channel: number; program: number; notes: Set<number> }>();
    for (const note of song.notes) {
      if (note.channel === 9) continue;
      const key = `${note.channel}:${note.program}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { channel: note.channel, program: note.program, notes: new Set() };
        byKey.set(key, entry);
      }
      entry.notes.add(note.pitch);
    }
    for (const entry of byKey.values()) {
      if (seq !== this.songLoadSeq) return;
      try {
        await this.audio.ensureInstrument(entry.channel, entry.program, [...entry.notes]);
      } catch (err) {
        console.warn(`音源の読み込みに失敗しました (ch ${entry.channel}, program ${entry.program})`, err);
      }
    }
    if (seq !== this.songLoadSeq) return;
    this.audio.applyMix(song.tracks);
    this.transport.load(song.notes, song.duration);
    this.song = song;
    this.seekEl.value = "0";
    this.updateTime(0);
    this.switchView(this.currentView);
    this.renderTracks();
    this.updateLoading();
  }

  applyViewCamera(mode: ViewMode) {
    const d = this.params.cameraDistance;
    if (mode === "fall") {
      this.scene.setCameraPreset(new THREE.Vector3(0, 12, -d));
    } else if (mode === "pianoroll") {
      this.scene.setCameraPreset(new THREE.Vector3(0, 0, -40));
    } else if (mode === "topdown") {
      this.scene.setCameraPreset(new THREE.Vector3(0, 60, -0.01));
    } else {
      this.scene.setCameraPreset(new THREE.Vector3(0, 20, -30));
    }
  }

  resetCamera() {
    this.applyViewCamera(this.currentView);
  }

  switchView(mode: ViewMode) {
    if (this.song) {
      this.views[this.currentView].dispose(this.scene.scene);
    }
    this.currentView = mode;
    const view = this.views[mode];
    if (!this.song) return;
    view.load(this.song, this.scene.scene);
    this.applyViewCamera(mode);
  }

  renderTracks() {
    if (!this.song) return;
    const song = this.song;
    this.tracksEl.innerHTML = "";
    song.tracks.forEach((track) => {
      const div = document.createElement("div");
      div.className = "track";
      const name = document.createElement("span");
      name.className = "name";
      const label = track.channel === 9 ? "Drums" : programName(track.program);
      name.textContent = `${track.name} (${label})`;
      name.title = `Channel ${track.channel} / ${label}`;
      div.appendChild(name);

      const mute = document.createElement("button");
      mute.textContent = track.muted ? "M" : "m";
      mute.addEventListener("click", () => {
        track.muted = !track.muted;
        this.audio.applyMix(song.tracks);
        this.renderTracks();
      });
      div.appendChild(mute);

      const solo = document.createElement("button");
      solo.textContent = track.solo ? "S" : "s";
      solo.addEventListener("click", () => {
        track.solo = !track.solo;
        this.audio.applyMix(song.tracks);
        this.renderTracks();
      });
      div.appendChild(solo);

      const volume = document.createElement("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "1";
      volume.step = "0.01";
      volume.value = String(track.volume);
      volume.addEventListener("input", () => {
        track.volume = parseFloat(volume.value);
        this.audio.applyMix(song.tracks);
      });
      div.appendChild(volume);
      this.tracksEl.appendChild(div);
    });
  }

  updateTime(t: number) {
    const mm = (x: number) => `${Math.floor(x / 60).toString().padStart(2, "0")}:${Math.floor(x % 60).toString().padStart(2, "0")}`;
    this.timeEl.textContent = `${mm(t)} / ${mm(this.song?.duration ?? 0)}`;
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    let t = this.transport.seconds;
    if (this.song) {
      if (this.transport.state === "started" && t >= this.song.duration) {
        this.transport.stop();
        this.views[this.currentView].reset();
        this.playBtn.textContent = "▶";
        t = 0;
      }
      this.updateTime(t);
      if (!this.seekEl.matches(":active")) {
        this.seekEl.value = String((t / this.song.duration) * 100 || 0);
      }
    }
    this.scene.applyParams(this.params);
    const playing = this.transport.state === "started";
    this.views[this.currentView].update(t, this.params, playing);
    this.scene.render();
  }
}
