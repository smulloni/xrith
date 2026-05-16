# Cross-Rhythm Explorer — Design Spec

- **Date:** 2026-05-16
- **Status:** Approved (brainstorming complete; ready for implementation plan)
- **Working name:** xrith

## 1. Summary

A web-based cross-rhythm explorer: a "fancy metronome" that plays and visualizes
multiple integer subdivisions of one shared loop at a variable tempo, with clear
sonic and visual differentiation between layers. The motivating use case is
hearing and *seeing* a 4-against-7 polyrhythm — and arbitrary stacks like
3:4:5 — with the ratio legible both by ear and on screen.

This is the v1 ("pure cross-rhythm explorer") on an intended path toward a drum
machine. The architecture is deliberately YAGNI-now but leaves clean seams for
that growth (see §10).

## 2. Goals / Non-goals

**Goals**

- Stack up to 6 layers, each an integer subdivision of one shared cycle.
- Variable tempo with an intuitive, musician-facing input.
- Distinct synth voice per layer; shared downbeat accent as the alignment anchor.
- Concentric-ring visualization with an audio-clock-locked playhead.
- Per-layer mute/solo, tap tempo, and a shareable URL.
- Honest model: no control may masquerade as a musical transformation.

**Non-goals (v1)** — see §9 for the full list. No step sequencer, no sample
voices, no per-layer volume/pitch UI, no alternative visualizations shipped, no
polymeter.

## 3. Core rhythmic model (final)

Single source of truth, privileging no layer:

```
state = {
  layers: [ { id, n, muted, soloed } ],   // 1..6 layers; n = integer subdivision
  cycleMs,                                  // the ONLY tempo quantity
  isPlaying
}
```

- Hit `k` of a layer fires at `t = (k / n) * cycleMs`, for `k = 0 .. n-1`.
- `k = 0` is the **downbeat** → accented voice. All layers' downbeats coincide
  at `t = 0`; that recurring alignment is the perceptual anchor.
- BPM is **never stored**. The tempo UI displays
  `BPM = n / cycleMs * 60000` for a layer chosen in a unit dropdown. Changing
  that dropdown is a pure relabel of the displayed number — sound, visuals, and
  state are untouched. No layer is privileged anywhere (sound, visuals, state).
- There is **no "reference layer" concept.** It was explicitly considered and
  rejected: relabeling a layer cannot change the sounded rhythm, so a
  reference selector would be feature theater. Felt pulse comes from tempo and
  sonic emphasis, which v1 deliberately scopes to the fixed downbeat accent plus
  mute/solo.

**Worked example — 4 against 7, displaying BPM "per 4" at 90 BPM:**

(`cycleMs = n * 60000 / BPM`; inverse of the display formula `BPM = n / cycleMs * 60000`.)

| Quantity | Value |
|---|---|
| `cycleMs` (from 4 @ 90 BPM = `4 * 60000/90`) | 2667 ms (2666.67) |
| Layer "4" hits | 0, 667, 1333, 2000 ms |
| Layer "7" hits | 0, 381, 762, 1143, 1524, 1905, 2286 ms |
| Realign | every cycle (2667 ms) |
| Ratio readout | `4 : 7 · cycle 2667 ms · grid LCM 28` |

The LCM is informational only; scheduling never uses it.

## 4. Architecture — vanilla ES modules, no build

Plain ES modules + Web Audio API + SVG. Served as static files; no bundler, no
framework, no dependencies.

| File | Single responsibility | Depends on |
|---|---|---|
| `src/model.js` | Pure state + math: `hitTimes`, `bpm↔cycleMs`, `audibleLayers` (mute/solo), clamping/validation. No DOM/Audio. | — |
| `src/audio.js` | Owns `AudioContext`; `playHit(voiceIndex, accent, whenSec)` = oscillator + envelope. Interface swappable for samples later. | model (types) |
| `src/scheduler.js` | Lookahead transport: ~25 ms timer schedules hits due in the next ~120 ms onto the audio clock; exposes `getTransport()`. Pure window-selection logic extracted for testing. | model, audio |
| `src/ring-view.js` | SVG concentric rings; `renderStructure(state)` + rAF `tick(transport)`. Implements a `Visualization` interface (`renderStructure`, `tick`, `destroy`). | model |
| `src/controls.js` | Builds/wires control DOM; mutates model via one dispatch. | model |
| `src/url-state.js` | `encode`/`decode` state ↔ URL hash, with validation + fallback to default 4:7. | model |
| `src/main.js` | Composition root: build state from URL or default; wire model changes → ring-view, scheduler, url-state. | all |
| `index.html`, `styles.css` | Shell + layout/styling. | — |

**Data flow (unidirectional):** input → `controls` → mutate `model` → notify →
(`ring-view.renderStructure`, `scheduler.reconfigure`, `url-state.write`).
Playback: scheduler timer → `audio.playHit` + record hit. Render: rAF →
`ring-view.tick(scheduler.getTransport())`.

**Live-edit behavior:** any change while playing (tempo, `n`, add/remove,
mute/solo) **restarts the current cycle from its downbeat** — instant,
glitch-free, pedagogically clean (every tweak replays from count 1).

## 5. Audio engine

Six-voice palette; each voice is a percussive blip: `OscillatorNode` (waveform
varies per voice) → `GainNode` (~1 ms attack, exponential decay ~60–120 ms) →
master gain → destination. Base frequencies chosen for *perceptual* separation
across ~2 octaves (not necessarily a scale). **Accent** (every layer's `k=0`):
pitched up + ~+5 dB + slightly longer tail. `AudioContext` is resumed on the
first user gesture; failure surfaces a visible banner (never a silently dead
metronome).

## 6. Visualization — concentric rings

Square `viewBox`. Outermost ring = first layer; radii step inward per layer.
Each ring: a faint guide circle + `n` dots at angles `−90° + k·(360/n)`
(`k=0` at 12 o'clock). The downbeat dot is larger/distinct. A center→12-o'clock
**playhead hand** rotates by `((now − cycleStart) / cycleMs) · 360°`, derived
from `audioContext.currentTime` (never `Date.now()`). When the hand crosses a
dot, that dot **flashes** (~150 ms pulse) — visual confirmation locked to the
click. Only this view ships in v1, behind the `Visualization` interface so
lanes/polygons become a toggle later.

## 7. UI layout (Layout A)

Big central rings with the ratio readout beneath; a single vertical control
column on the right, top to bottom:

1. Transport: **▶ Play / ⏹ Stop**, **⭘ Tap** (tap tempo). (Stop resets to the
   downbeat — consistent with the `isPlaying` boolean and restart-on-change;
   there is no resume-mid-cycle Pause.)
2. Tempo: stepper number + "BPM per **[layer ▾]**" unit picker.
3. Layers list — one row per layer: color swatch · subdivision stepper
   `− n +` · **M** (mute) · **S** (solo) · **×** (remove).
4. **＋ Add layer** (disabled at 6 layers).
5. **🔗 Copy share link**.

The layer list is vertical specifically to absorb future per-row control growth
(volume/pitch/voice) without a redesign.

## 8. Edge cases & error handling (no silent failures)

| Case | Behavior |
|---|---|
| `AudioContext` suspended (autoplay policy) | `resume()` on first Play gesture; on failure show a visible banner. |
| Subdivision `n` | Integer, clamped to **[1, 32]**; field reflects clamped value. |
| Tempo | Clamped to an effective **20–300 BPM** in the current unit-picker layer's terms; clamp shown in field. |
| Layer count | **[1, 6]**; "Add" disabled at 6, "remove" disabled at 1. |
| Mute/solo precedence | Any layer soloed → only soloed layers audible; mute always wins over solo. Encoded in pure `audibleLayers(state)`. |
| Malformed share URL | Validate structure/ranges; on failure load default 4:7 + dismissible notice. Never a blank app. |
| Background-tab throttling | Large lookahead window mitigates; documented known limitation. Post-MVP fix (Worker/AudioWorklet clock) isolated to `scheduler.js`. |
| Float drift over long runs | Never sum intervals; compute `cycleStart + (k/n)·cycleMs`, advancing `cycleStart` by exact `cycleMs` off the audio clock. |
| Rapid edits | Each edit restarts the cycle; URL write debounced ~300 ms via `history.replaceState`. |

## 9. Testing

- **TDD on the pure core** via Node's built-in `node --test` (zero deps; honors
  "no build"). `model.js` and `url-state.js` are DOM/Audio-free:
  - `hitTimes`: known cases (4:7 exact arrays), `n=1`, large `n`.
  - bpm↔cycleMs round-trip per layer (unit-picker calculator correctness).
  - `audibleLayers`: full mute/solo truth table.
  - clamping: out-of-range `n`, BPM, layer count.
  - `decode(encode(state)) === state`; malformed hash → default + flag.
- **Scheduler:** extract the "which hits fall in `[t0, t1)`" decision as a pure
  function and unit-test it; the timer/audio glue is a thin, manually-verified
  shell.
- **Audio + ring-view:** manual checklist + a tiny `tests/manual.html` harness
  (fire each voice; render a known pattern). Not auto-tested — Web Audio/SVG is
  integration territory, not worth a headless rig for MVP.
- Tests live in `tests/`, run via `node --test`.

## 10. Out of scope (YAGNI) and future seams

Deferred: step sequencer / per-step on-off / extra accents / swing · sample
voices · per-layer volume/pitch/voice UI · lane & polygon visualizations ·
presets/accounts/export/MIDI · polymeter (independent per-layer cycles) ·
mobile-tuned layout.

Each maps to an existing seam, so growth is additive, not a rewrite:

- Extra accents / per-step → hit metadata in `model`.
- Sample voices → the `audio.playHit` interface.
- Lane / polygon views → the `Visualization` interface.
- Polymeter → per-layer `cycleMs` instead of one shared value.

## 11. Notes

- Brainstorming UI mockups are preserved under
  `.superpowers/brainstorm/` (rings, layout A/B). Add `.superpowers/` to
  `.gitignore`.
- Desktop-first; must not break on mobile but is not tuned for it.
