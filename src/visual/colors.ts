import * as THREE from "three";
import type { Note, Params } from "../state/State";

export const TRACK_COLORS = [0x5b8def, 0xef5b8d, 0x8def5b, 0xdef5b8, 0xb85bef, 0xefb85b, 0x5befb8, 0xb8ef5b];

export function colorForNote(note: Note, mode: Params["colorMode"]): THREE.Color {
  if (mode === "track") return new THREE.Color(TRACK_COLORS[note.track % TRACK_COLORS.length]);
  if (mode === "channel") return new THREE.Color().setHSL(note.channel / 16, 0.7, 0.55);
  if (mode === "pitch") {
    const pitchClass = note.pitch % 12;
    const octave = Math.floor(note.pitch / 12);
    return new THREE.Color().setHSL(pitchClass / 12, 0.75, 0.42 + (octave % 3) * 0.08);
  }
  return new THREE.Color().setHSL(0.6 - note.velocity * 0.5, 0.8, 0.4 + note.velocity * 0.3);
}

export function setNoteColors(mesh: THREE.InstancedMesh, notes: Note[], mode: Params["colorMode"]) {
  notes.forEach((note, i) => {
    mesh.setColorAt(i, colorForNote(note, mode));
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
