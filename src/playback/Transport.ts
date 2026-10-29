import * as Tone from "tone";
import type { Note } from "../state/State";

export type NoteCallback = (note: Note, audioTime: number) => void;

export class TransportController {
  part: Tone.Part | null = null;
  onNote: NoteCallback | null = null;
  notes: Note[] = [];
  duration = 0;

  load(notes: Note[], duration: number) {
    this.dispose();
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    this.notes = notes;
    this.duration = duration;
    const events = notes.map((n) => ({
      time: n.start,
      note: n,
    }));
    this.part = new Tone.Part((time, ev) => {
      const n = ev.note as Note;
      this.onNote?.(n, time as number);
    }, events);
    this.part.start(0);
  }

  play() {
    Tone.Transport.start();
  }
  pause() {
    Tone.Transport.pause();
  }
  stop() {
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
  }
  seek(sec: number) {
    Tone.Transport.seconds = Math.max(0, Math.min(this.duration, sec));
  }
  setSpeed(v: number) {
    Tone.Transport.bpm.value = 120 * v;
  }
  get seconds() {
    return Tone.Transport.seconds;
  }
  get state() {
    return Tone.Transport.state;
  }
  dispose() {
    this.part?.dispose();
    this.part = null;
    this.notes = [];
  }
}
