export interface Note {
  channel: number;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  program: number;
  track: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  channel: number;
  program: number;
  muted: boolean;
  solo: boolean;
  volume: number;
  notes: Note[];
}

export interface Song {
  duration: number;
  notes: Note[];
  tracks: TrackInfo[];
  tempos: { time: number; bpm: number }[];
}

export type ViewMode = "fall" | "pianoroll" | "topdown" | "keyboard";

export interface Params {
  // camera
  cameraFov: number;
  cameraDistance: number;
  cameraAngle: number;
  autoRotate: boolean;
  // notes
  noteSize: number;
  noteHeight: number;
  colorMode: "track" | "channel" | "velocity" | "pitch";
  noteOpacity: number;
  emissive: number;
  trail: number;
  // scene
  bgColor: string;
  bgImage: boolean;
  bgImageOpacity: number;
  bgImageRadius: number;
  bgImageOffset: number;
  bgImageSpin: number;
  bgImageRotation: number;
  grid: boolean;
  fog: boolean;
  bloom: boolean;
  // time
  noteSpeed: number;
  windowSec: number;
  pitchMin: number;
  pitchMax: number;
  trackSpacing: number;
}
