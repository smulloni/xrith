import {
  setLayerN, addLayer, removeLayer, toggleMute, toggleSolo,
  setBpmForLayer, setUnitLayerIndex, setPlaying,
} from './model.js';
import { decodeState, encodeState } from './url-state.js';
import { createAudioEngine } from './audio.js';
import { createScheduler } from './scheduler.js';
import { createRingView } from './ring-view.js';
import { createControls } from './controls.js';

const decoded = decodeState(location.hash);
let state = decoded.state;

const audio = createAudioEngine();
const scheduler = createScheduler({ getState: () => state, audio });
const view = createRingView(document.getElementById('rings'));

let urlTimer = null;
function writeUrl() {
  if (urlTimer) clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    history.replaceState(null, '', encodeState(state));
  }, 300);
}

// Apply a transition, then re-render + reconfigure + persist.
function dispatch(next) {
  state = next;
  controls.render();
  view.renderStructure(state);
  scheduler.reconfigure();
  writeUrl();
}

// --- tap tempo: median interval of recent taps -> BPM for the unit layer ---
let taps = [];
function tap() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 3000);
  taps.push(now);
  if (taps.length >= 2) {
    const gaps = [];
    for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const bpm = 60000 / median;
    dispatch(setBpmForLayer(state, state.unitLayerIndex, bpm));
  }
}

async function togglePlay() {
  if (state.isPlaying) {
    scheduler.stop();
    dispatch(setPlaying(state, false));
  } else {
    const ok = await audio.resume();
    if (!ok) {
      controls.showBanner('Audio is blocked by the browser — tap Play again.', 4000);
      return;
    }
    dispatch(setPlaying(state, true));
    scheduler.start();
  }
}

const actions = {
  setBpm: (idx, bpm) => dispatch(setBpmForLayer(state, idx, bpm)),
  setN: (id, n) => dispatch(setLayerN(state, id, n)),
  addLayer: () => dispatch(addLayer(state)),
  removeLayer: (id) => dispatch(removeLayer(state, id)),
  toggleMute: (id) => dispatch(toggleMute(state, id)),
  toggleSolo: (id) => dispatch(toggleSolo(state, id)),
  setUnit: (idx) => dispatch(setUnitLayerIndex(state, idx)),
  togglePlay,
  tap,
};

const controls = createControls(
  document.getElementById('panel'), () => state, actions);

// Initial paint
controls.render();
view.renderStructure(state);
if (decoded.warning) controls.showBanner(decoded.warning, 5000);

// Render loop locked to the audio clock via the scheduler transport.
(function frame() {
  view.tick(scheduler.getTransport());
  requestAnimationFrame(frame);
})();

// Mobile/desktop interruption recovery (calls, app-switch suspend the context).
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.isPlaying
      && audio.state() !== 'running') {
    const ok = await audio.resume();
    if (!ok) controls.showBanner('Audio interrupted — tap Play to resume.', 4000);
  }
});
