import { PALETTE } from './palette.js';
import { audibleLayers, isStepMuted } from './model.js';
import { ringRadius, pointOnCircle, crossed } from './geometry.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CX = 500, CY = 500;
const MUTED_COLOR = '#6b7794';   // gray = this event is individually muted

function el(name, attrs) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function flash(circle, baseR) {
  const start = performance.now(), peak = baseR * 1.9, dur = 160;
  function step(t) {
    const e = Math.min(1, (t - start) / dur);
    circle.setAttribute('r', String(peak - (peak - baseR) * e));
    if (e < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Implements the Visualization interface:
//   renderStructure(state), tick(transport), destroy()
// Lane/polygon views can implement the same 3 methods later.
export function createRingView(svg, onToggleEvent = () => {}) {
  svg.setAttribute('viewBox', '0 0 1000 1000');
  let dots = [], hand = null, lastP = 0, wasRunning = false;

  function renderStructure(state) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    dots = [];
    const L = state.layers.length;
    const audible = new Set(audibleLayers(state).map((a) => a.index));
    state.layers.forEach((layer, i) => {
      const r = ringRadius(i, L);
      svg.appendChild(el('circle', {
        cx: CX, cy: CY, r, fill: 'none',
        stroke: '#33415c', 'stroke-width': 2,
      }));
      const color = PALETTE[i % PALETTE.length].color;
      const layerSilenced = !audible.has(i);
      for (let k = 0; k < layer.n; k++) {
        const frac = k / layer.n;
        const p = pointOnCircle(CX, CY, r, frac);
        const baseR = k === 0 ? 22 : 14;
        const eventMuted = isStepMuted(layer, k);
        const tone = eventMuted ? MUTED_COLOR : color;
        const attrs = { cx: p.x, cy: p.y, r: baseR, 'pointer-events': 'none' };
        if (layerSilenced) {
          attrs.fill = 'none';
          attrs.stroke = tone;
          attrs['stroke-width'] = k === 0 ? 3 : 2;
        } else {
          attrs.fill = tone;
        }
        const c = el('circle', attrs);
        svg.appendChild(c);
        // Transparent >=44px touch target on top; carries the toggle.
        const hit = el('circle', {
          cx: p.x, cy: p.y, r: Math.max(baseR, 22),
          fill: 'transparent', 'pointer-events': 'all', cursor: 'pointer',
        });
        const layerId = layer.id, step = k;
        hit.addEventListener('click', () => onToggleEvent(layerId, step));
        svg.appendChild(hit);
        // Audio<->visual honesty: only events that will sound flash.
        if (!layerSilenced && !eventMuted) dots.push({ circle: c, frac, baseR });
      }
    });
    hand = el('line', {
      x1: CX, y1: CY, x2: CX, y2: 40,
      stroke: '#f1f3f8', 'stroke-width': 5, 'stroke-linecap': 'round',
      'pointer-events': 'none', // never absorb clicks meant for a dot below
    });
    svg.appendChild(hand);
    lastP = 0;
    wasRunning = false; // first tick after a rebuild resyncs without flashing
  }

  function tick(transport) {
    if (!hand) return;
    if (!transport.isRunning || transport.cycleMs <= 0) {
      // Parked: hold the hand at the downbeat. Don't run the flash pass or
      // advance lastP — the next running frame resyncs cleanly.
      hand.setAttribute('transform', `rotate(0 ${CX} ${CY})`);
      wasRunning = false;
      return;
    }
    const elapsedMs = (transport.nowSec - transport.cycleStartSec) * 1000;
    let p = (elapsedMs / transport.cycleMs) % 1;
    if (p < 0) p += 1;
    hand.setAttribute('transform', `rotate(${p * 360} ${CX} ${CY})`);
    // Skip flashing on the first running frame after a park/rebuild: the hand
    // jumps to a fresh cycle position, so stale crossings must not fire.
    if (wasRunning) {
      for (const d of dots) if (crossed(lastP, p, d.frac)) flash(d.circle, d.baseR);
    }
    lastP = p;
    wasRunning = true;
  }

  function destroy() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    hand = null;
    dots = [];
  }

  return { renderStructure, tick, destroy };
}
