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
  // lighting
  ambientOn: boolean;
  ambientIntensity: number;
  ambientColor: string;
  keyOn: boolean;
  keyIntensity: number;
  keyColor: string;
  keyAzimuth: number;
  keyElevation: number;
  rimOn: boolean;
  rimIntensity: number;
  rimColor: string;
  rimAzimuth: number;
  rimElevation: number;
  // notes
  noteWidth: number;
  noteHeight: number;
  colorMode: "track" | "channel" | "velocity" | "pitch";
  noteOpacity: number;
  emissive: number;
  trail: number;
  glowEnabled: boolean;
  glowIntensity: number;
  // scene
  bgColor: string;
  bgImage: boolean;
  bgImageOpacity: number;
  bgImageRadius: number;
  bgImageOffset: number;
  bgImageSpin: number;
  bgImageRotation: number;
  domeFollow: boolean;
  wallOpacity: number;
  wallColor: string;
  wallImage: boolean;
  grid: boolean;
  fog: boolean;
  bloom: boolean;
  // wall effects
  wallEffects: boolean;
  effectSparks: boolean;
  effectBeams: boolean;
  effectRings: boolean;
  effectIntensity: number;
  effectSize: number;
  effectDuration: number;
  effectLimit: number;
  // time
  noteSpeed: number;
  windowSec: number;
  pitchMin: number;
  pitchMax: number;
  trackSpacing: number;
}
