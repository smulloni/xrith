import { PALETTE } from './palette.js';
import { ringRadius, pointOnCircle, crossed } from './geometry.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CX = 500, CY = 500;

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
export function createRingView(svg) {
  svg.setAttribute('viewBox', '0 0 1000 1000');
  let dots = [], hand = null, lastP = 0;

  function renderStructure(state) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    dots = [];
    const L = state.layers.length;
    state.layers.forEach((layer, i) => {
      const r = ringRadius(i, L);
      svg.appendChild(el('circle', {
        cx: CX, cy: CY, r, fill: 'none',
        stroke: '#33415c', 'stroke-width': 2,
      }));
      const color = PALETTE[i % PALETTE.length].color;
      for (let k = 0; k < layer.n; k++) {
        const frac = k / layer.n;
        const p = pointOnCircle(CX, CY, r, frac);
        const baseR = k === 0 ? 22 : 14;
        const c = el('circle', { cx: p.x, cy: p.y, r: baseR, fill: color });
        svg.appendChild(c);
        dots.push({ circle: c, frac, baseR });
      }
    });
    hand = el('line', {
      x1: CX, y1: CY, x2: CX, y2: 40,
      stroke: '#f1f3f8', 'stroke-width': 5, 'stroke-linecap': 'round',
    });
    svg.appendChild(hand);
    lastP = 0;
  }

  function tick(transport) {
    if (!hand) return;
    let p = 0;
    if (transport.isRunning && transport.cycleMs > 0) {
      const elapsedMs = (transport.nowSec - transport.cycleStartSec) * 1000;
      p = (elapsedMs / transport.cycleMs) % 1;
      if (p < 0) p += 1;
    }
    hand.setAttribute('transform', `rotate(${p * 360} ${CX} ${CY})`);
    for (const d of dots) if (crossed(lastP, p, d.frac)) flash(d.circle, d.baseR);
    lastP = p;
  }

  function destroy() { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  return { renderStructure, tick, destroy };
}
