import * as Tone from "tone";
import { Soundfont, Soundfont2, getSoundfontNames } from "smplr";
import type { Smplr } from "smplr";
import { SoundFont2 } from "soundfont2";
import { GM_NAMES } from "../midi/gm";
import type { Note, TrackInfo } from "../state/State";

const DRUM_CHANNEL = 9;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

type CustomSampler = Smplr & {
  readonly instrumentNames: readonly string[];
  loadInstrument(instrumentName: string): Promise<void>;
};

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  kick: Tone.MembraneSynth;
  snare: Tone.NoiseSynth;
  hat: Tone.MetalSynth;
  instruments = new Map<string, Smplr>();
  instrumentGains = new Map<string, GainNode>();
  pending = new Map<string, Promise<string>>();
  trackVolumes = new Map<number, number>();
  channelGains = new Map<number, number>();
  audibleTracks = new Set<number>();
  useCustom = false;
  loadedCustom: ArrayBuffer | null = null;
  customInstrument: CustomSampler | null = null;
  customGain: GainNode | null = null;
  customReady: Promise<void> | null = null;

  constructor() {
    this.ctx = Tone.getContext().rawContext as AudioContext;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.kick = new Tone.MembraneSynth().connect(this.master);
    this.snare = new Tone.NoiseSynth().connect(this.master);
    this.hat = new Tone.MetalSynth().connect(this.master);
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
    await Tone.start();
  }

  setUseCustom(enabled: boolean) {
    this.useCustom = enabled;
  }

  gmNameForProgram(program: number): string {
    const names = getSoundfontNames();
    const wanted = norm(GM_NAMES[program] ?? "");
    if (!wanted) return names[0];
    let match = names.find((n) => norm(n) === wanted);
    if (!match) match = names.find((n) => norm(n).includes(wanted) || wanted.includes(norm(n)));
    return match ?? names[0];
  }

  async ensureInstrument(channel: number, program: number, notesToLoad?: number[]): Promise<string> {
    if (channel === DRUM_CHANNEL) return "drum";
    const key = `${channel}:${program}`;
    if (this.instruments.has(key)) return key;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const gain = this.ctx.createGain();
    gain.gain.value = this.channelGains.get(channel) ?? 0.9;
    gain.connect(this.master);

    const promise = (async () => {
      const notes = notesToLoad ? [...new Set(notesToLoad)].sort((a, b) => a - b) : undefined;
      const inst = Soundfont(this.ctx, {
        instrument: this.gmNameForProgram(program),
        kit: "FluidR3_GM",
        destination: gain,
        notesToLoad: notes && notes.length ? { notes, fallback: "nearest" } : undefined,
      });
      await inst.ready;
      this.instruments.set(key, inst);
      this.instrumentGains.set(key, gain);
      this.pending.delete(key);
      return key;
    })();

    this.pending.set(key, promise);
    try {
      return await promise;
    } catch (err) {
      this.pending.delete(key);
      gain.disconnect();
      throw err;
    }
  }

  async loadCustomSF2(buffer: ArrayBuffer) {
    this.loadedCustom = buffer;
    const url = URL.createObjectURL(new Blob([buffer]));
    const gain = this.ctx.createGain();
    gain.gain.value = 0.9;
    gain.connect(this.master);
    const inst = Soundfont2(this.ctx, {
      url,
      destination: gain,
      createSoundfont: (data: Uint8Array) => new SoundFont2(data),
    });

    const ready = (async () => {
      await inst.ready;
      if (inst.instrumentNames.length > 0) {
        await inst.loadInstrument(inst.instrumentNames[0]);
      }
      this.customInstrument?.dispose();
      this.customGain?.disconnect();
      this.customInstrument = inst;
      this.customGain = gain;
      const maxVolume = Math.max(0, ...this.trackVolumes.values());
      gain.gain.value = maxVolume || 0.9;
    })();

    this.customReady = ready;
    try {
      await ready;
    } catch (err) {
      gain.disconnect();
      throw err;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  resetInstruments() {
    for (const inst of this.instruments.values()) inst.dispose();
    for (const gain of this.instrumentGains.values()) gain.disconnect();
    this.instruments.clear();
    this.instrumentGains.clear();
    this.pending.clear();
    this.audibleTracks.clear();
    this.trackVolumes.clear();
    this.channelGains.clear();
  }

  applyMix(tracks: TrackInfo[]) {
    const anySolo = tracks.some((t) => t.solo);
    this.audibleTracks.clear();
    this.trackVolumes.clear();
    this.channelGains.clear();
    for (const track of tracks) {
      this.trackVolumes.set(track.index, track.volume);
      const audible = !track.muted && (!anySolo || track.solo);
      if (!audible) continue;
      this.audibleTracks.add(track.index);
      if (track.channel === DRUM_CHANNEL) continue;
      this.channelGains.set(track.channel, Math.max(this.channelGains.get(track.channel) ?? 0, track.volume));
    }
    for (const [key, gain] of this.instrumentGains) {
      const channel = Number(key.split(":")[0]);
      gain.gain.value = this.channelGains.get(channel) ?? 0;
    }
    if (this.customGain) {
      const maxVolume = Math.max(0, ...[...this.audibleTracks].map((i) => this.trackVolumes.get(i) ?? 0));
      this.customGain.gain.value = maxVolume;
    }
  }

  playNote(note: Note, time: number) {
    if (!this.audibleTracks.has(note.track)) return;
    const trackVolume = this.trackVolumes.get(note.track) ?? 0.9;

    if (note.channel === DRUM_CHANNEL) {
      const velocity = Math.max(0.01, note.velocity * trackVolume);
      if (note.pitch === 35 || note.pitch === 36) this.kick.triggerAttackRelease("C1", 0.2, time, velocity);
      else if (note.pitch === 38 || note.pitch === 40) this.snare.triggerAttackRelease(0.1, time, velocity);
      else if (note.pitch === 42 || note.pitch === 44 || note.pitch === 46) this.hat.triggerAttackRelease("32n", time, velocity * 0.5);
      else this.snare.triggerAttackRelease(0.05, time, velocity * 0.4);
      return;
    }

    if (this.useCustom && this.customInstrument) {
      try {
        this.customInstrument.start({ note: note.pitch, velocity: Math.round(note.velocity * 127), time, duration: note.duration });
      } catch {
        void this.ensureInstrument(note.channel, note.program);
      }
      return;
    }

    let key = `${note.channel}:${note.program}`;
    if (!this.instruments.has(key)) {
      const fallback = [...this.instruments.keys()].find((k) => k.startsWith(`${note.channel}:`));
      if (fallback) key = fallback;
      else {
        void this.ensureInstrument(note.channel, note.program);
        return;
      }
    }
    const inst = this.instruments.get(key);
    if (!inst) return;
    try {
      inst.start({ note: note.pitch, velocity: Math.round(note.velocity * 127), time, duration: note.duration });
    } catch {
      void this.ensureInstrument(note.channel, note.program);
    }
  }
}
