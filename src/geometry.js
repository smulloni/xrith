// Pure geometry for the ring view. No DOM. Angles measured with 0 at
// 12 o'clock, increasing clockwise (matches a clock face and the mockups).

export function ringRadius(index, layerCount, maxR = 460, minR = 150) {
  if (layerCount <= 1) return maxR;
  return maxR - (index * (maxR - minR)) / (layerCount - 1);
}

export function pointOnCircle(cx, cy, r, frac) {
  const theta = frac * 2 * Math.PI - Math.PI / 2; // -90° => start at top
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

// Did fraction `f` get crossed moving from prevP to curP around a [0,1) loop?
export function crossed(prevP, curP, f) {
  if (!Number.isFinite(prevP) || !Number.isFinite(curP) || !Number.isFinite(f)) return false;
  if (prevP === curP) return false;
  if (prevP < curP) return f > prevP && f <= curP;
  return f > prevP || f <= curP; // wrapped through 1.0 -> 0
}
