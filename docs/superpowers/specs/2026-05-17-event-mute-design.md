# Per-Event Mute — Design Spec

- **Date:** 2026-05-17
- **Status:** Approved (brainstorming complete; ready for implementation plan)
- **Amends:** `2026-05-16-cross-rhythm-explorer-design.md` (§3 state block, §6
  visualization, §10 future seams) — see §8 Spec sync.

## 1. Summary

Let the user silence a single event (one dot/"ball" on a ring) by clicking it.
Clicking toggles it back on. A muted event renders **gray** instead of its
layer color, does not sound, and does not flash. The state is reflected in the
shareable URL, and existing shared links keep working unchanged.

This realizes part of the "per-step on-off" future seam anticipated in the
parent spec §10 ("Extra accents / per-step → hit metadata in `model`"). It is
the *mute-only* slice of that seam — no step add, no swing, no extra accents.

## 2. Goals / Non-goals

**Goals**

- Click any dot — including the downbeat — to toggle that one event off/on.
- Muted events are visually distinct (gray) and inaudible.
- Per-event mute composes honestly with the existing per-layer mute/solo.
- The visualization tells the truth: *only events that will sound are drawn
  filled in the layer color and allowed to flash.*
- URL round-trips per-event mutes; pre-existing `v1` links still decode.
- Pure-core changes are TDD-tested (model, scheduler window, url-state).

**Non-goals**

- No step *insertion/removal* (subdivision count `n` still owns event count).
- No per-event accent, velocity, swing, or probability.
- No keyboard interaction / focus ring on dots (SVG dots are pointer-only;
  matches the project's current touch-first, pointer-driven controls).
- No redesign of the M/S buttons themselves (only the *dots* gain visuals).

## 3. Interaction & composition model (decided)

**Identity.** An event is identified by its integer index `k` within a layer
(`0 ≤ k < n`), the k-th evenly-spaced slot — never by angular position. A
muted event keeps its index; changing `n` does not "move" mutes.

**Forget on shrink.** Lowering a layer's `n` permanently drops mutes whose
index is now out of range. Raising `n` again yields fresh, audible events.
Rationale: the model and URL only ever carry mutes for events that exist — no
invisible hidden state, smaller links, what-you-see-is-what-you-get. Accepted
cost: an accidental `n` down→up loses those mutes.

**Orthogonal & non-destructive vs. layer M/S.** Layer **M**/**S** remain
*layer-level audio filters*; per-event mute is an independent *event-level*
filter. Toggling a layer's **M** never rewrites its per-event mutes — they are
retained, untouched, and reappear when the layer is un-muted. ("M = mute all
events" was rejected: it is lossy — un-muting cannot recover which events were
individually muted.)

**Audio = AND.** An event sounds iff its layer passes the existing
`audibleLayers` solo/mute logic **and** the event is not individually muted.
Per-event mute always wins, mirroring the parent spec's existing precedence
("mute always wins over solo"). Soloing a layer does **not** resurrect its
individually-muted events. Net precedence: any silence wins; all silences
compose by AND. No special cases.

**Live edit.** Clicking a dot is a state edit like any other; while playing it
restarts the current cycle from its downbeat — the parent spec's documented,
intended live-edit behavior. Not special-cased here.

## 4. Visual model

Two independent booleans per event:

- `layerSilenced` — the layer is not in `audibleLayers(state)` (because it is
  **M**-muted, *or* excluded by another layer's **S**).
- `eventMuted` — this specific event's index is in the layer's `mutedSteps`.

| `layerSilenced` | `eventMuted` | Appearance | Sounds? | Flashes? |
|---|---|---|---|---|
| no  | no  | **filled, layer color** | ✅ | ✅ |
| no  | yes | **filled, gray** | no | no |
| yes | no  | **hollow, layer-color outline** | no | no |
| yes | yes | **hollow, gray outline** | no | no |

Invariants this enforces:

- *Only a fully-filled, layer-colored dot can sound, and only it flashes.*
  This fixes a latent inconsistency: today `ring-view.tick` flashes every
  crossed dot, so a silenced layer currently looks like it is playing. The
  flash must now be gated on "will sound."
- Gray always means "you individually muted this event," visible even when a
  layer mute is also in effect (hollow + gray).
- Hollow always means "this layer is silenced," whether by **M** or by
  solo-exclusion.

Gray shade: a single named constant in `ring-view.js` (start from `#6b7794`,
the existing `.lab` muted tone; final shade tunable during implementation,
must read clearly against `--bg #0e1320` and the `#33415c` guide rings).
Hollow stroke width ≈ 2 for regular dots, ≈ 3 for the larger downbeat dot so
the outline stays legible at `baseR 22`.

## 5. Data model (`src/model.js`)

Layer shape gains one field:

```
{ id, n, muted, soloed, mutedSteps }   // mutedSteps: sorted unique int[] in [0, n-1]
```

- `makeLayer(n)` → initialize `mutedSteps: []`.
- **New pure fn** `toggleStepMute(state, id, k)`: for the layer with `id`, if
  `0 ≤ k < layer.n`, return new state with `k` toggled in a new sorted unique
  `mutedSteps` array; out-of-range `k` → state returned unchanged (defensive;
  UI never produces it). Immutable (no mutation of input), same pattern as
  `toggleMute`/`toggleSolo`.
- `setLayerN(state, id, n)`: after clamping `n`, prune
  `mutedSteps = mutedSteps.filter(k => k < clampedN)` ("forget on shrink").
  Other layers untouched.
- **New helper** `isStepMuted(layer, k)` → `layer.mutedSteps.includes(k)`
  (exported, for reuse by scheduler + ring-view, and direct unit testing).
- `audibleLayers(state)` is unchanged — it stays strictly layer-level.
  Per-event filtering lives in the hit generator and the view.

## 6. Pipeline touch-points

**Scheduler — `src/scheduler.js` `hitsInWindow`.** Inside the existing
`for (const {index, layer} of audibleLayers(state))` / `for k in 0..n-1`
loops, add `if (isStepMuted(layer, k)) continue;` before pushing the hit.
Layer-level filtering already done by `audibleLayers`; composition is AND for
free. Downbeat (`k = 0`) muted ⇒ no accent hit that cycle.

**Ring view — `src/ring-view.js`.**

- `createRingView(svg, onToggleEvent)` — new second arg; `main.js` injects
  `(layerId, k) => dispatch(toggleStepMute(state, layerId, k))`. Mirrors the
  callback pattern `controls.js` already uses for actions.
- `renderStructure(state)`: compute
  `const audible = new Set(audibleLayers(state).map(a => a.index))` once. Per
  layer `i`: `layerSilenced = !audible.has(i)`. Per event `k`:
  `eventMuted = isStepMuted(layer, k)`. Paint per the §4 table.
- **Hit target.** Dots are `r = 14` (28 px) / downbeat `r = 22` (44 px) — most
  are below the project's 44 px touch minimum (parent spec §7). For each event
  append a transparent hit circle (`r = max(baseR, 22)`, `fill: transparent`,
  `pointer-events: all`) on top of the visible dot, carrying the `click`
  handler → `onToggleEvent(layer.id, k)`. The visible dot has
  `pointer-events: none`. `click` (not `pointerup`) is fine — mute toggle is
  not latency-critical, unlike transport/tap.
- **Flash gating.** Only push *sounding* events
  (`!layerSilenced && !eventMuted`) into the `dots` flash list. Non-sounding
  dots are static and absent from the flash pass by construction — `tick()`
  needs no change.
- `destroy()` unchanged.

**Composition root — `src/main.js`.** Import `toggleStepMute`; pass the
callback into `createRingView`. Click → `dispatch` → re-render + scheduler
`reconfigure` (cycle restarts from downbeat while playing) + debounced URL
write. All existing machinery; no new pathway.

## 7. URL encoding (`src/url-state.js`)

`VERSION` stays **1**. Per-layer token grammar gains an *optional* dot-list
suffix of muted indices:

```
token := <n><m?><s?>( "." <i> ( "." <j> )* )?      e.g.  7s.1.3
```

- `LAYER_RE`: `/^(\d+)(m?)(s?)$/` → `/^(\d+)(m?)(s?)(?:\.(\d+(?:\.\d+)*))?$/`
  (group 4 = the dot-joined index list, no leading dot).
- `encodeState`: append `'.' + mutedSteps.join('.')` **only when non-empty**
  (sorted ascending; defensively re-sort). Empty ⇒ no suffix ⇒ pre-existing
  states/links round-trip **byte-identically** (keeps `decode(encode)` tests
  and avoids URL churn).
- `decodeState`: parse group 4; each entry must be a non-negative integer with
  `0 ≤ idx < n`, no duplicates. Any violation ⇒ existing strict `fallback()`
  (default 4:7 + the existing dismissible "invalid link" banner) — consistent
  with how every other malformed field is handled. Store as sorted unique.
- **Backward compat:** an old `v1` link has no suffix ⇒ `mutedSteps: []`.
  Existing shared links keep working.
- **Forward asymmetry (documented, accepted):** a *new* link opened by an
  *old, not-yet-updated* deployment fails the old regex ⇒ existing
  invalid-link fallback + banner. Acceptable: single-page app updates
  atomically; graceful, already-defined degradation; no silent failure.

## 8. Spec sync

This feature amends the parent design `2026-05-16-cross-rhythm-explorer-design.md`.
The implementation plan must also update it:

- §3 state block: `{ id, n, muted, soloed }` → `{ id, n, muted, soloed, mutedSteps }`.
- §6: note dots have four visual states (filled/hollow × color/gray) and that
  flashing is gated on "will sound."
- §10: move "per-step on-off (mute only)" from deferred to implemented;
  step-insert/accent/swing remain deferred.

## 9. Edge cases & error handling (no silent failures)

| Case | Behavior |
|---|---|
| Click a dot | Toggle that event's mute; gray ⇄ color; live-edit cycle restart while playing (existing behavior). |
| Mute the downbeat (`k = 0`) | Allowed; no accent that cycle. Not special-cased. |
| Mute every event of a layer | Layer silent, but dots show **filled gray** (if not also M-muted) — visibly distinct from a layer **M**, honestly. Allowed. |
| `n = 1` layer | Only `k = 0` exists and is mutable ⇒ silent layer. Allowed. |
| Lower `n` below a muted index | Mute dropped from model + URL ("forget on shrink"). |
| Soloed layer with muted events | Muted events stay silent (AND); solo does not override. |
| Layer **M** with muted events | All silent; per-event mutes retained, reappear on un-**M**. |
| Touch target | Transparent ≥ 44 px hit circle per event (dots themselves are smaller). |
| Malformed URL suffix (non-int, negative, `≥ n`, duplicate) | Strict `fallback()` → default 4:7 + dismissible banner. |
| Old `v1` link (no suffix) | Decodes with `mutedSteps: []`. Still valid. |
| New link in old deployment | Old regex rejects ⇒ invalid-link fallback + banner (atomic SPA update; accepted). |
| Rapid clicking | Standard debounced `history.replaceState` (~300 ms); unchanged. |

## 10. Testing

TDD on the pure core via `node --test` (parent spec §9 ethos; zero deps):

- **model.js**
  - `makeLayer` seeds `mutedSteps: []`.
  - `toggleStepMute`: add, remove, re-add; keeps sorted + unique; out-of-range
    `k` no-ops; immutable (input untouched, new array identity); only the
    targeted layer changes.
  - `setLayerN`: prunes `mutedSteps` on shrink; preserves on grow/equal;
    leaves other layers' mutes intact.
  - `isStepMuted`: membership truth.
- **scheduler.js `hitsInWindow`**
  - Muted indices excluded from emitted hits.
  - AND composition with layer mute/solo (truth-table style: layer audible ×
    event muted).
  - `k = 0` muted ⇒ that cycle's accent hit absent.
- **url-state.js**
  - `encode` emits suffix only when non-empty; sorted.
  - `decode(encode(state))` round-trips `mutedSteps` (incl. empty & multi).
  - Old `v1` token without suffix ⇒ `mutedSteps: []`.
  - Malformed suffix (non-int / negative / `≥ n` / duplicate) ⇒ default +
    warning.
- **ring-view.js / audio** — manual, per parent spec §9 (Web Audio/SVG is
  integration territory). Extend `tests/manual.html`: verify the four §4
  appearance states, that only filled-color dots flash, click toggles via the
  ≥ 44 px hit area, hollow appears for both **M** and solo-exclusion, and
  un-**M** restores retained per-event mutes.

## 11. Out of scope (YAGNI)

Per-event accent/velocity/swing/probability · step insert or delete · keyboard
or focus interaction on dots · drag-to-mute / marquee selection · undo of
"forget on shrink" · per-event mute presets. Each remains a clean future
extension of the same `mutedSteps` hit-metadata seam.
