import { App } from "./app/App";

declare global {
  interface Window {
    midiPlayer?: App;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.midiPlayer = new App();
});
