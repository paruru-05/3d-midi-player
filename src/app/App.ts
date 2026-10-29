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
  bgFile: HTMLInputElement;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.tracksEl = document.getElementById("tracks")!;
    this.timeEl = document.getElementById("time")!;
    this.seekEl = document.getElementById("seek") as HTMLInputElement;
    this.playBtn = document.getElementById("playBtn") as HTMLButtonElement;

    this.bgFile = document.createElement("input");
    this.bgFile.type = "file";
    this.bgFile.accept = "image/*";
    this.bgFile.style.display = "none";
    document.body.appendChild(this.bgFile);

    this.params = {
      cameraFov: 60,
      cameraDistance: 25,
      cameraAngle: 0,
      autoRotate: false,
      noteSize: 1,
      noteHeight: 1,
      colorMode: "track",
      noteOpacity: 0.9,
      emissive: 0.3,
      trail: 0,
      bgColor: "#0b0d12",
      bgImage: false,
      bgImageOpacity: 0.85,
      bgImageRadius: 300,
      bgImageOffset: -80,
      bgImageSpin: 0.01,
      bgImageRotation: 0,
      grid: true,
      fog: true,
      bloom: false,
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

    this.scene.camera.position.set(0, 12, -this.params.cameraDistance);
    this.scene.camera.lookAt(0, 0, 0);
    this.scene.syncOrbit();

    this.bindUI();
    this.loop();
  }

  buildGui() {
    const p = this.params;
    const cam = this.gui.addFolder("Camera");
    cam.add(p, "cameraFov", 30, 100).onChange(() => this.scene.applyParams(p));
    cam.add(p, "cameraDistance", 5, 80).onChange(() => {
      this.scene.camera.position.set(0, 12, -p.cameraDistance);
      this.scene.camera.lookAt(0, 0, 0);
      this.scene.syncOrbit();
    });
    cam.add(p, "autoRotate");
    const notes = this.gui.addFolder("Notes");
    notes.add(p, "noteSize", 0.2, 3);
    notes.add(p, "noteHeight", 0.2, 3);
    notes.add(p, "colorMode", ["track", "channel", "velocity", "pitch"]);
    notes.add(p, "noteOpacity", 0.1, 1);
    notes.add(p, "emissive", 0, 2);
    const sceneF = this.gui.addFolder("Scene");
    sceneF.addColor(p, "bgColor").onChange(() => this.scene.applyParams(p));
    sceneF.add(p, "grid").onChange(() => this.scene.applyParams(p));
    sceneF.add(p, "fog").onChange(() => this.scene.applyParams(p));
    const bg = this.gui.addFolder("Background");
    bg.add(p, "bgImage").name("dome");
    bg.add(p, "bgImageOpacity", 0, 1).name("opacity");
    bg.add(p, "bgImageRadius", 100, 400).name("radius");
    bg.add(p, "bgImageOffset", -200, 100).name("height");
    bg.add(p, "bgImageSpin", -0.2, 0.2).name("spin");
    bg.add(p, "bgImageRotation", 0, 360).name("rotation");
    bg.add({ load: () => this.bgFile.click() }, "load").name("画像を読み込む");
    const timeF = this.gui.addFolder("Time");
    timeF.add(p, "noteSpeed", 0.2, 4);
    timeF.add(p, "windowSec", 4, 40);
    timeF.add(p, "trackSpacing", 0.5, 4);
  }

  async loadFile(file: File) {
    try {
      await this.loadSong(await file.arrayBuffer());
    } catch (err) {
      console.error(err);
      alert("MIDIの読み込みに失敗しました。");
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
    this.canvas.addEventListener("dragover", (e) => e.preventDefault());
    this.canvas.addEventListener("drop", async (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) await this.loadFile(file);
    });

    this.playBtn.addEventListener("click", async () => {
      if (!this.song) return;
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

    const viewSel = document.getElementById("viewSel") as HTMLSelectElement;
    viewSel.addEventListener("change", () => {
      this.switchView(viewSel.value as ViewMode);
    });

    this.seekEl.addEventListener("input", () => {
      if (!this.song) return;
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

    customInput.addEventListener("change", async () => {
      const file = customInput.files?.[0];
      if (!file) return;
      try {
        await this.audio.loadCustomSF2(await file.arrayBuffer());
        customWrap.style.display = "";
        customToggle.checked = true;
        this.audio.setUseCustom(true);
        btn.textContent = `SF2: ${file.name}`;
      } catch (err) {
        console.error(err);
        alert("SF2の読み込みに失敗しました。");
      }
      customInput.value = "";
    });

    const btn = document.createElement("button");
    btn.textContent = "SF2読込";
    btn.addEventListener("click", () => customInput.click());
    document.getElementById("topbar")!.appendChild(btn);

    this.bgFile.addEventListener("change", async () => {
      const file = this.bgFile.files?.[0];
      if (!file) return;
      try {
        await this.scene.setBackgroundImage(file);
        this.params.bgImage = true;
        this.scene.applyParams(this.params);
        this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
      } catch (err) {
        console.error(err);
        alert("背景画像の読み込みに失敗しました。");
      }
      this.bgFile.value = "";
    });
  }

  async loadSong(buffer: ArrayBuffer) {
    const song = loadMidi(buffer);
    this.transport.stop();
    this.playBtn.textContent = "▶";
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
      try {
        await this.audio.ensureInstrument(entry.channel, entry.program, [...entry.notes]);
      } catch (err) {
        console.warn(`音源の読み込みに失敗しました (ch ${entry.channel}, program ${entry.program})`, err);
      }
    }
    this.audio.applyMix(song.tracks);
    this.transport.load(song.notes, song.duration);
    this.song = song;
    this.seekEl.value = "0";
    this.updateTime(0);
    this.switchView(this.currentView);
    this.renderTracks();
  }

  switchView(mode: ViewMode) {
    if (this.song) {
      this.views[this.currentView].dispose(this.scene.scene);
    }
    this.currentView = mode;
    const view = this.views[mode];
    if (!this.song) return;
    view.load(this.song, this.scene.scene);
    if (mode === "fall") {
      this.scene.camera.position.set(0, 12, -this.params.cameraDistance);
    } else if (mode === "pianoroll") {
      this.scene.camera.position.set(0, 0, -40);
    } else if (mode === "topdown") {
      this.scene.camera.position.set(0, 60, 0);
    } else {
      this.scene.camera.position.set(0, 20, -30);
    }
    this.scene.camera.lookAt(0, 0, 0);
    this.scene.syncOrbit();
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
    this.views[this.currentView].update(t, this.params);
    this.scene.render();
  }
}
