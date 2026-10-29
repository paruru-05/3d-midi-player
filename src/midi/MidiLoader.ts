import { Midi } from "@tonejs/midi";
import type { Note, Song, TrackInfo } from "../state/State";

export function loadMidi(buffer: ArrayBuffer): Song {
  const midi = new Midi(buffer);
  const notes: Note[] = [];
  const tracks: TrackInfo[] = [];
  midi.tracks.forEach((t, idx) => {
    const trNotes: Note[] = [];
    const channel = t.channel ?? 0;
    const program = t.instrument?.number ?? 0;
    t.notes.forEach((n) => {
      const note: Note = {
        channel,
        pitch: n.midi,
        start: n.time,
        duration: Math.max(0.05, n.duration),
        velocity: n.velocity,
        program,
        track: idx,
      };
      trNotes.push(note);
      notes.push(note);
    });
    if (trNotes.length === 0 && t.name === "") return;
    tracks.push({
      index: idx,
      name: t.name || `Track ${idx + 1}`,
      channel,
      program,
      muted: false,
      solo: false,
      volume: 0.9,
      notes: trNotes,
    });
  });
  // filter empty tracks
  const nonEmpty = tracks.filter((t) => t.notes.length > 0);
  // remap track indices
  const trackMap = new Map<number, number>();
  nonEmpty.forEach((t, i) => trackMap.set(t.index, i));
  nonEmpty.forEach((t) => { t.index = trackMap.get(t.index)!; });
  notes.forEach((n) => { n.track = trackMap.get(n.track) ?? 0; });
  const duration = midi.duration || Math.max(...notes.map((n) => n.start + n.duration), 0);
  const tempos = midi.header.tempos.map((t) => ({ time: t.time ?? 0, bpm: t.bpm }));
  if (tempos.length === 0) tempos.push({ time: 0, bpm: 120 });
  return { duration, notes, tracks: nonEmpty, tempos };
}
