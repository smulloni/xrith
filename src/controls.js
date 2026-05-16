import { cycleMsToBpm, clampBpm, ratioText } from './model.js';
import { PALETTE } from './palette.js';

// Tiny element helper. `text` sets textContent; known DOM props are assigned,
// everything else becomes an attribute. No innerHTML anywhere.
function h(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k === 'text') e.textContent = props[k];
    else if (k in e) e[k] = props[k];
    else e.setAttribute(k, props[k]);
  }
  for (const c of children) e.append(c);
  return e;
}

// Builds the control panel into `root`. Communicates only through callbacks:
//   getState() -> current state
//   actions: { setBpm(layerIndex,bpm), setN(id,n), addLayer(), removeLayer(id),
//              toggleMute(id), toggleSolo(id), setUnit(idx),
//              togglePlay(), tap() }
export function createControls(root, getState, actions) {
  root.replaceChildren();

  const banner = h('div', { class: 'banner', hidden: true });
  const playBtn = h('button', { class: 'btn primary' });
  const tapBtn = h('button', { class: 'btn', text: '⭘ Tap' });

  const bpmDown = h('button', { class: 'btn step', text: '−' });
  const bpmInput = h('input', {
    class: 'bpm', type: 'number', inputMode: 'numeric',
    min: '20', max: '300', step: '1',
  });
  const bpmUp = h('button', { class: 'btn step', text: '+' });
  const unitSel = h('select', { class: 'unit' });

  const layersBox = h('div', { class: 'layers' });
  const addBtn = h('button', { class: 'btn wide', text: '＋ Add layer' });
  const shareBtn = h('button', { class: 'btn wide', text: '🔗 Copy share link' });
  const ratio = h('div', { class: 'ratio' });

  root.append(
    banner,
    h('div', { class: 'transport' }, [playBtn, tapBtn]),
    h('div', { class: 'tempo' }, [
      h('div', { class: 'lab', text: 'Tempo' }),
      h('div', { class: 'tempo-row' }, [
        bpmDown, bpmInput, bpmUp,
        h('span', { class: 'muted', text: 'BPM per' }), unitSel,
      ]),
    ]),
    h('div', { class: 'lab', text: 'Layers' }),
    layersBox, addBtn, shareBtn, ratio,
  );

  function unitBpm(state) {
    const layer = state.layers[state.unitLayerIndex] || state.layers[0];
    return Math.round(cycleMsToBpm(state.cycleMs, layer.n));
  }

  function render() {
    const state = getState();
    playBtn.textContent = state.isPlaying ? '⏹ Stop' : '▶ Play';
    playBtn.classList.toggle('primary', !state.isPlaying);

    unitSel.replaceChildren(...state.layers.map((l, i) =>
      h('option', { value: String(i), text: String(l.n) })));
    unitSel.value = String(state.unitLayerIndex);
    bpmInput.value = String(unitBpm(state));

    layersBox.replaceChildren(...state.layers.map((l, i) => {
      const sw = h('span', { class: 'sw' });
      sw.style.background = PALETTE[i % 6].color;
      const nDown = h('button', { class: 'btn step', text: '−' });
      const nUp = h('button', { class: 'btn step', text: '+' });
      const mute = h('button',
        { class: 'tg' + (l.muted ? ' on' : ''), text: 'M' });
      const solo = h('button',
        { class: 'tg' + (l.soloed ? ' on' : ''), text: 'S' });
      const rm = h('button',
        { class: 'tg', text: '×', disabled: state.layers.length === 1 });
      nDown.addEventListener('click', () => actions.setN(l.id, l.n - 1));
      nUp.addEventListener('click', () => actions.setN(l.id, l.n + 1));
      mute.addEventListener('click', () => actions.toggleMute(l.id));
      solo.addEventListener('click', () => actions.toggleSolo(l.id));
      rm.addEventListener('click', () => actions.removeLayer(l.id));
      return h('div', { class: 'layer-row' }, [
        sw,
        h('span', { class: 'step-group' }, [
          nDown, h('b', { class: 'nval', text: String(l.n) }), nUp,
        ]),
        mute, solo, rm,
      ]);
    }));

    addBtn.disabled = state.layers.length >= 6;
    ratio.textContent = ratioText(state);
  }

  function commitBpm() {
    const state = getState();
    actions.setBpm(state.unitLayerIndex, clampBpm(Number(bpmInput.value)));
  }

  playBtn.addEventListener('pointerup', () => actions.togglePlay());
  tapBtn.addEventListener('pointerup', () => actions.tap());
  bpmDown.addEventListener('click', () => {
    bpmInput.value = String(Number(bpmInput.value) - 1); commitBpm();
  });
  bpmUp.addEventListener('click', () => {
    bpmInput.value = String(Number(bpmInput.value) + 1); commitBpm();
  });
  bpmInput.addEventListener('change', commitBpm);
  unitSel.addEventListener('change', () => actions.setUnit(Number(unitSel.value)));
  addBtn.addEventListener('click', () => actions.addLayer());
  shareBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showBanner('Link copied.', 1500);
    } catch (e) {
      showBanner('Copy failed — select the address bar to share.', 3000);
    }
  });

  let bannerTimer = null;
  function showBanner(msg, autoHideMs) {
    banner.textContent = msg;
    banner.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    if (autoHideMs) {
      bannerTimer = setTimeout(() => { banner.hidden = true; }, autoHideMs);
    }
  }

  return { render, showBanner };
}
