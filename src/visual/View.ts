import type * as THREE from "three";
import type { Params, Song } from "../state/State";

export interface View {
  load(song: Song, scene: THREE.Scene): void;
  update(t: number, params: Params): void;
  reset(): void;
  dispose(scene: THREE.Scene): void;
}
