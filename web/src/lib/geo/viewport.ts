/**
 * The map's frame — what part of the drawing is on screen.
 *
 * Pure, like everything else in `src/lib/`. No React, no DOM, no clock. The
 * hook that drives it is `hooks/use-map-viewport.ts` and it does nothing this
 * file could not be tested without.
 *
 * ## The model
 *
 * A viewport is `{ x, y, w }` in **normalized unit-square coordinates** — the
 * same space `project()` returns. `x, y` is the top-left corner and `w` is the
 * frame's width. `zoom = fullW / w`, and `fullW` is the whole city.
 *
 * ## ⚠️ The frame is no longer square, and `w` is still the only axis
 *
 * Until 2026-08-15 the frame was a square of side `w`, because the container was
 * locked to `MAP_ASPECT` by CSS: a square in normalized space was a
 * `MAP_ASPECT`-shaped box on screen at every zoom, so one number drove both axes
 * and there was no second one to get wrong. The map fills its frame now, so the
 * container is whatever shape the grid track gives it and the lock is gone.
 *
 * ⚠️ **The height is DERIVED, never stored and never settable.** A viewport
 * carries an optional `aspect` — the container's own width ÷ height, measured
 * from the DOM — and the frame's normalized height is
 * `w × MAP_ASPECT / aspect`, computed the same way by every function in this
 * file. **So there is still one axis a caller can move.** `aspect` is not a
 * second one: it is a fact about the box, it comes from one place, and nothing
 * here writes it except `withAspect`.
 *
 * ⚠️ **That derivation is what keeps the marker alignment.**
 * `web/src/components/CLAUDE.md` records what a mismatch between the container's
 * shape and the SVG's `viewBox` does: `preserveAspectRatio` letterboxes the
 * drawing inside a box the marker percentages know nothing about, and every
 * marker drifts by half the letterbox — consistently and plausibly enough to
 * read as bad map data rather than as a layout bug. **`svgViewBox` and
 * `toContainer` now both read the height out of `frameH`**, so the viewBox and
 * the percentages cannot disagree; the failure needs the two to be computed
 * separately, and they are not.
 *
 * ⚠️ **`aspect` is OPTIONAL and defaults to `MAP_ASPECT`**, which is the square
 * frame exactly as it was. Every rule below reduces to the old arithmetic at
 * that default, and `tests/viewport.test.ts` is the pre-2026-08-15 suite
 * unchanged — it pins the square case, and the wide and tall cases are tested
 * beside it.
 *
 * ⚠️ **At full view the frame CONTAINS the city rather than equalling it.** A
 * frame wider than the city is shaped shows background either side and `x` goes
 * negative; a taller one shows it above and below. **Nothing is ever cropped at
 * full view** — that is what `whole city` promises — so `fullW` is whichever of
 * the two axes needs the larger frame, never the smaller.
 *
 * ## ⚠️ Marker SIZES are not in here, and may never be
 *
 * `toContainer` moves a marker. Nothing scales one. The unreachable-marker
 * table in `web/src/components/CLAUDE.md` is measured against 11px / 15px / 7px
 * boxes — 7px → 11% unreachable, 15px → 34%, 25px → 60% — and those figures are
 * why the padding is what it is. **Positions move; sizes do not.**
 *
 * ## ⚠️ `isVisible` is about the FRAME. `project.inViewport` is about the CITY
 *
 * Two predicates, two meanings, and they are one careless rename from being
 * confused. `inViewport(lon, lat)` asks whether a coordinate is inside
 * `NYC_BOUNDS` at all — whether the drawing has anywhere to put it — and that
 * meaning is unchanged and load-bearing: the off-map counters in the map's
 * footer are built on it and should read zero forever. `isVisible(v, p)` asks
 * whether a point the drawing *does* hold is inside the frame right now. A
 * point can be `inViewport` and not `isVisible`, and that is the ordinary case
 * the moment somebody zooms.
 */

import type { Point } from "@/lib/geo/project";
import { MAP_ASPECT, VIEWBOX_H, VIEWBOX_W } from "@/lib/geo/project";

export interface Viewport {
  /** Left edge in the unit square. ⚠️ **Negative when the frame is wider than
      the city** — see `fullW`. */
  x: number;
  /** Top edge. `y` grows downward — see `Point`. Negative on a tall frame. */
  y: number;
  /** Width of the frame, `minW(v)`..`fullW(v)`. */
  w: number;
  /**
   * The container's own width ÷ height, measured from the DOM.
   *
   * ⚠️ **Optional, and absent means `MAP_ASPECT`** — the square frame this file
   * had until 2026-08-15, which is what lets the whole pre-existing test suite
   * stand unchanged as the regression case.
   *
   * ⚠️ **It is a fact about the BOX, not a second axis.** Nothing but
   * `withAspect` writes it, every other function carries it through untouched,
   * and the frame's height is derived from it rather than stored — which is
   * what makes the viewBox and the marker percentages unable to disagree.
   */
  aspect?: number;
}

/**
 * The whole city in a `MAP_ASPECT`-shaped box.
 *
 * ⚠️ **This is the SQUARE-FRAME full view and it is no longer the resting state
 * of the map** — the frame is whatever shape the grid track gives it, so the
 * hook resets to `fullView(aspect)`. Kept because it is the identity every
 * measurement in this repo is attributed against, and because a container that
 * happens to be `MAP_ASPECT`-shaped resolves to exactly this.
 */
export const FULL_VIEW: Viewport = { x: 0, y: 0, w: 1 };

/** The container's shape, or the square frame's when nothing has measured it. */
function aspectOf(v: Viewport): number {
  return v.aspect ?? MAP_ASPECT;
}

/**
 * The frame's normalized HEIGHT. Derived, never stored.
 *
 * ⚠️ **Every consumer of the vertical axis goes through this**, which is the
 * whole safety property of the file: `svgViewBox` and `toContainer` read the
 * same number, so the drawing and the markers are laid out against one height.
 * A local `w * something` anywhere else re-opens the letterbox drift.
 */
export function frameH(v: Viewport): number {
  return (v.w * MAP_ASPECT) / aspectOf(v);
}

/**
 * The widest the frame may be — the whole city, and the resting state.
 *
 * ⚠️ **It is the LARGER of the two axes' requirements, never the smaller.** The
 * frame has to contain the city on both axes at full view, because `whole city`
 * promises a whole city; fitting the tighter axis would crop boroughs out of the
 * state the page opens in. So a frame wider than the city is shaped shows
 * background either side rather than a bigger, clipped drawing.
 *
 * At `MAP_ASPECT` this is `1` and everything below reduces to the old file.
 */
export function fullW(v: Viewport): number {
  return Math.max(1, aspectOf(v) / MAP_ASPECT);
}

/** The tightest frame, i.e. `MAX_ZOOM` in. Scales with `fullW` so the zoom
    range is the same factor whatever shape the container is. */
export function minW(v: Viewport): number {
  return fullW(v) / MAX_ZOOM;
}

/** Is the frame all the way out? The `whole city` button and `FrameNote` both
    ask this, and a strict `w < fullW` would flicker on float error. */
export function isFullView(v: Viewport): boolean {
  return v.w >= fullW(v) - 1e-9;
}

/** The resting state for a container of this shape. */
export function fullView(aspect?: number): Viewport {
  const v: Viewport = { x: 0, y: 0, w: 1, aspect };
  return clampViewport({ ...v, w: fullW(v) });
}

/**
 * Re-shape a frame for a container that has just been measured or resized.
 *
 * ⚠️ **The zoom LEVEL is preserved, not the width.** `w` is a width and the
 * width that meant "×3" in one box means something else in another, so what
 * carries across a resize is `w / fullW`. A reader who has zoomed into a corner
 * and then opens a rail tab does not expect the map to change magnification.
 *
 * ⚠️ **Same-object on no change**, like everything else here — this is called
 * from a `ResizeObserver`, which fires on every frame of a drag-resize.
 */
export function withAspect(v: Viewport, aspect: number): Viewport {
  if (aspectOf(v) === aspect) return v;
  /* The frame's middle, in world coordinates, before anything moves. Keeping
     the corner instead would slide the map sideways every time a container
     resized, which is the one thing a resize must not look like. */
  const mx = v.x + v.w / 2;
  const my = v.y + frameH(v) / 2;
  const scale = v.w / fullW(v);
  const next: Viewport = { x: 0, y: 0, w: 1, aspect };
  const w2 = fullW(next) * scale;
  const h2 = (w2 * MAP_ASPECT) / aspect;
  return settle({ ...v, aspect }, { x: mx - w2 / 2, y: my - h2 / 2, w: w2 });
}

/**
 * How far in the frame may go.
 *
 * ⚠️ **Measured against the worst cluster rather than picked.** The densest
 * 50px square on the sensor layer holds **50 markers at 390px wide**, of which
 * 36 have no reachable point. At ×12 that cluster spreads to 600px, which is
 * what makes the layer genuinely addressable rather than nominally so. **Treat
 * this as a measurement**: changing it means re-running the unreachable-marker
 * table at full view *and* at the new stop.
 *
 * It is a ceiling and not a target. Nothing zooms here on its own — every
 * change of `w` comes from a reader's wheel, pinch or press.
 */
export const MAX_ZOOM = 12;

/**
 * The smallest frame in a `MAP_ASPECT`-shaped box.
 *
 * ⚠️ **`minW(v)` is the one the rules use.** This is that function at the
 * default aspect, kept because it is what `MAX_ZOOM`'s measurement was taken
 * against and what the test suite pins. A frame of another shape zooms to the
 * same **factor**, not to the same width.
 */
export const MIN_W = 1 / MAX_ZOOM;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * One axis of the corner clamp.
 *
 * ⚠️ **Two regimes, and the second one is new with the non-square frame.** A
 * frame smaller than the city slides inside it and is clamped at the edges, as
 * it always has been. A frame **larger** than the city on this axis has no
 * freedom at all — there is nowhere to slide to, and letting it drift would put
 * the city against one edge with all the background on the other. It is
 * centred, which is what the CSS used to do from outside the drawing.
 */
function fitAxis(pos: number, size: number): number {
  if (size >= 1) return (1 - size) / 2;
  return clamp(pos, 0, 1 - size);
}

/**
 * Clamp `next` into the rules, and hand back `from` unchanged when the clamped
 * result is where `from` already was.
 *
 * ⚠️ **The identity is measured against `from`, not against `next`, and that is
 * the whole reason this helper exists.** `panBy` and `zoomAt` build a candidate
 * literal before clamping, so a clamp that only compared against its own
 * argument would return a fresh object for every gesture that is already
 * against a stop — a wheel held down at ×12, or a drag pushing at the edge of
 * the city, which are exactly the two cases that repeat at frame rate.
 *
 * One line of algebra: `w` is clamped first, the height is derived from it, and
 * then each corner is fitted against its own axis. So **the frame can never
 * zoom out past the whole city and can never slide off it** — there is no state
 * in which the reader is looking at page background where Queens should be.
 *
 * ⚠️ **`next` carries no aspect and must not.** The shape belongs to `from`,
 * every caller here is an operation *on* an existing frame, and `withAspect` is
 * the one door that changes it. Reading it off the candidate would let a
 * half-built literal silently re-shape the map.
 */
function settle(from: Viewport, next: { x: number; y: number; w: number }): Viewport {
  const w = clamp(next.w, minW(from), fullW(from));
  const shaped: Viewport = { x: 0, y: 0, w, aspect: from.aspect };
  const x = fitAxis(next.x, w);
  const y = fitAxis(next.y, frameH(shaped));
  if (w === from.w && x === from.x && y === from.y) return from;
  return { x, y, w, aspect: from.aspect };
}

/**
 * Put a viewport back inside the rules.
 *
 * ⚠️ **It returns the SAME OBJECT when nothing changes, and three call sites
 * depend on that identity to skip a 425-marker re-render**: a pan that is
 * already at the edge, a zoom that is already at a stop, and the recentre guard
 * in `showPoint`. A tidy-up that always returns a fresh object costs nothing
 * visible and triples the work of a keyboard pass through the sensor group.
 * `tests/viewport.test.ts` holds it with a `toBe`, and holds the same property
 * through `panBy` and `zoomAt` — where it is easier to lose. See `settle`.
 */
export function clampViewport(v: Viewport): Viewport {
  return settle(v, v);
}

/**
 * Zoom by `factor` about a point in the container, `cx`/`cy` in 0..1 of the
 * frame's own width and height.
 *
 * ⚠️ **The point under the cursor stays under the cursor.** That is the whole
 * contract and it is the only one a reader can feel: resolve the cursor to a
 * world point first, then choose the corner that puts that world point back
 * under the same fraction of the new frame. Zooming about the frame's centre
 * instead is the version that feels like the map is running away.
 *
 * `factor > 1` zooms in. Clamped at both ends, so a wheel held down at the stop
 * returns the same object rather than a new identical one.
 */
export function zoomAt(
  v: Viewport,
  factor: number,
  cx: number,
  cy: number,
): Viewport {
  const w2 = clamp(v.w / factor, minW(v), fullW(v));
  const h2 = (w2 * MAP_ASPECT) / aspectOf(v);
  // The world point under the cursor, before the frame changes. ⚠️ The vertical
  // half goes through `frameH` — using `v.w` for both axes was correct only
  // while the frame was square, and it is the kind of line that keeps working
  // on a 16:10 monitor and drifts on an ultrawide.
  const ax = v.x + cx * v.w;
  const ay = v.y + cy * frameH(v);
  return settle(v, { x: ax - cx * w2, y: ay - cy * h2, w: w2 });
}

/**
 * Pan by a fraction of the frame. `dcx`/`dcy` are in container units, i.e. 1 is
 * one whole frame width, so a drag of half the box is `0.5` at every zoom and
 * the gesture feels the same at ×1 and at ×12.
 *
 * The sign follows the drag: the reader moves the paper, so a positive `dcx`
 * (content moving right under the pointer) moves the frame **left**.
 */
export function panBy(v: Viewport, dcx: number, dcy: number): Viewport {
  return settle(v, {
    x: v.x - dcx * v.w,
    y: v.y - dcy * frameH(v),
    w: v.w,
  });
}

/**
 * Move the frame so `p` is in the middle of it, at the current zoom.
 *
 * ⚠️ **The clamp can refuse part of this and that is correct.** A point near a
 * corner of the city cannot be centred without the frame leaving the unit
 * square, so it lands off-centre and on screen instead. `isVisible` is the
 * predicate that decides whether to call this at all, and it is satisfied
 * either way.
 */
export function centerOn(v: Viewport, p: Point): Viewport {
  return settle(v, { x: p.x - v.w / 2, y: p.y - frameH(v) / 2, w: v.w });
}

/**
 * A unit-square point to a fraction of the container, for a marker's `left` and
 * `top`. Multiply by 100 for the percentage.
 *
 * ⚠️ **At `FULL_VIEW` this is exactly `p.x` and `p.y`**, which is what makes
 * threading it through `city-map.tsx` a pixel no-op before any interaction
 * exists. `tests/viewport.test.ts` asserts that identity, because it is what
 * every later measurement is attributed against.
 *
 * Values outside 0..1 are outside the frame. They are still rendered — the map
 * **clips rather than culls**, see `city-map.tsx` — so this must not clamp.
 */
export function toContainer(v: Viewport, p: Point): { cx: number; cy: number } {
  return { cx: (p.x - v.x) / v.w, cy: (p.y - v.y) / frameH(v) };
}

/**
 * Is `p` inside the frame?
 *
 * `margin` is in container units and defaults to a small inset, so a marker
 * technically on screen but half under the edge still counts as needing a
 * recentre — a lit marker bisected by the frame's border reads as broken.
 */
export function isVisible(v: Viewport, p: Point, margin = 0.04): boolean {
  const { cx, cy } = toContainer(v, p);
  return cx >= margin && cx <= 1 - margin && cy >= margin && cy <= 1 - margin;
}

/**
 * The SVG `viewBox` for this frame.
 *
 * ⚠️ **At `FULL_VIEW` this is byte-identical to the literal the map used before
 * zoom existed** — `0 0 ${VIEWBOX_W} ${VIEWBOX_H}` — and that is asserted.
 *
 * ⚠️ **The height comes from `frameH`, the same function `toContainer` uses,
 * and that is the marker-alignment rule made structural.** This rect's shape is
 * the container's shape by construction, so `preserveAspectRatio` has no
 * letterbox to add and the marker percentages have none to correct for.
 * **Computing the height here independently is the drift bug.**
 */
export function svgViewBox(v: Viewport): string {
  return `${v.x * VIEWBOX_W} ${v.y * VIEWBOX_H} ${v.w * VIEWBOX_W} ${
    frameH(v) * VIEWBOX_H
  }`;
}
