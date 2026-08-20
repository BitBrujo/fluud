"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Point } from "@/lib/geo/project";
import {
  centerOn,
  FULL_VIEW,
  fullView,
  isFullView,
  isVisible,
  panBy,
  withAspect,
  zoomAt,
  type Viewport,
} from "@/lib/geo/viewport";

/**
 * Pan and zoom on the drawn map — the seam between the pure arithmetic in
 * `lib/geo/viewport.ts` and a reader's wheel, fingers and keyboard.
 *
 * ⚠️ **The map did not pan or zoom at all until 2026-08-14.** It was a
 * fixed-extent drawing of a whole city at ~82 m/px, and the measured
 * consequence is in `web/src/components/CLAUDE.md`: **34% of the 425 sensor
 * markers had no reachable point at 1440×900, 63% at 390×844**, with a worst
 * cluster of 50 markers of which 36 were unreachable. Zoom is the first real
 * fix for that. It does not close it — the `‹ ›` pager is still what makes
 * every sensor reachable, and the two are one feature.
 *
 * ## The four decisions in here, and each is a failure mode rather than a taste
 *
 * ### 1 · ⚠️ Cooperative wheel — plain wheel scrolls, ctrl/⌘+wheel zooms
 *
 * Below `xl` the map is a full-width panel in a document several screens long,
 * and plain-wheel zoom would eat the scroll of a reader on their way to the
 * instrument list. Trackpad **pinch already arrives as `wheel` with
 * `ctrlKey: true`**, so trackpad readers get natural pinch out of the same
 * branch for free.
 *
 * The cost, stated: **a mouse-only desktop reader has no wheel zoom** and uses
 * `+` / `−`. That is why those buttons may never be dropped as redundant.
 *
 * ⚠️ **The listener is attached with `{ passive: false }` in an effect, and
 * React's `onWheel` will not do.** React attaches wheel listeners passively, so
 * `preventDefault` inside an `onWheel` handler is a **silent no-op** — the page
 * scrolls anyway and the bug looks like the zoom being ignored rather than like
 * a listener option.
 *
 * ### 2 · ⚠️ `touch-action` is conditional on zoom
 *
 * `pan-y` at full view, `none` while `w < 1`. Below `md` the map fills the
 * entire first screen with the list as a sticky sheet below it, so a permanent
 * `touch-action: none` traps a reader who then cannot scroll past it. At full
 * view there is nothing to pan, so `pan-y` costs nothing; once zoomed the
 * reader has opted in, and `whole city` is the always-present way back out.
 *
 * ### 3 · ⚠️ Pointer capture on the first `pointermove`, never on `pointerdown`
 *
 * Capturing on down steals the press from every marker button underneath and
 * makes the map unclickable. That is the `MARKER_HIT` failure arriving through
 * a different door — `city-map.tsx` records that a full-size hit-testable box
 * has already broken the gauge diamonds once and all 425 sensor markers once.
 * A press that never moves is a click and must reach the marker.
 *
 * ### 4 · ⚠️ Two-finger pinch, and a stuck pointer is a map that pans forever
 *
 * Two live pointers feed their midpoint and distance ratio into `zoomAt`.
 * **`pointercancel` and `lostpointercapture` both clear the pointer map**,
 * because a pointer the browser took away and we never forgot is a finger this
 * hook believes is still down.
 *
 * ## ⚠️ No test coverage, so the rules are written down
 *
 * Everything testable is in `lib/geo/viewport.ts` and
 * `tests/viewport.test.ts` — the clamp, the anchor, the identity contract. What
 * is in here is DOM wiring, and `tests/CLAUDE.md`'s jsdom refusal applies:
 * jsdom lays nothing out, so a synthetic `wheel` against a zero-sized rect
 * would assert that the arithmetic it is already asserting still works. **The
 * browser pass is the instrument for this file.**
 */

/** One press of `+` or `−`. A little over a third, so three presses is ~×2.5. */
const STEP_FACTOR = 1.35;

/**
 * Wheel delta to zoom factor.
 *
 * ⚠️ **Exponential, not linear, and `deltaY` is not in a known unit.** Browsers
 * report pixels, lines or pages depending on the device, so anything that adds
 * `deltaY` to a zoom level moves at a different speed on every mouse. Raising a
 * constant to `-deltaY/N` is scale-free: it composes, it is symmetric in both
 * directions, and it can never produce a negative or zero frame.
 */
function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY / 320);
}

export interface MapViewport {
  /** The frame. Pass to `svgViewBox` and `toContainer`. */
  view: Viewport;
  /** True while the frame is anything other than the whole city. */
  zoomed: boolean;
  /** Goes on the drawing's container — the wheel listener needs it. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Spread onto the container. Pointer handlers plus the conditional
      `touch-action`. */
  surfaceProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
    onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
    style: { touchAction: "pan-y" | "none" };
  };
  /** One press of `+`, about the centre of the frame. */
  zoomIn: () => void;
  /** One press of `−`. */
  zoomOut: () => void;
  /** `whole city`. Back to `FULL_VIEW`. */
  reset: () => void;
  /**
   * Put `p` on screen, at the current zoom.
   *
   * ⚠️ **A no-op when it is already visible, and the no-op is the SAME
   * OBJECT** — `clampViewport`'s identity contract, which is what lets a
   * render-phase call skip a 425-marker re-render. See `city-map.tsx`, which
   * calls this during render rather than in an effect and says why.
   */
  showPoint: (p: Point) => void;
}

export function useMapViewport(): MapViewport {
  const [view, setView] = useState<Viewport>(FULL_VIEW);
  const ref = useRef<HTMLDivElement>(null);

  /*
   * ⚠️ **The container's shape, measured, and it is what lets the drawing fill
   * its frame.** Until 2026-08-15 the container was locked to `MAP_ASPECT` by
   * CSS and the frame was square in normalized space, so there was nothing to
   * measure. The lock is gone; the frame is whatever shape the grid track
   * gives it, and `lib/geo/viewport.ts` derives the vertical axis from this one
   * number.
   *
   * ⚠️ **A `ResizeObserver`, not a window `resize` listener.** This box changes
   * size without the window doing anything — a rail tab opening, the controls
   * strip unfolding, the notices strip appearing. A window listener would miss
   * every one of those and the drawing would stay laid out for the box it used
   * to be in, which is the letterbox drift arriving through the back door.
   *
   * ⚠️ **`withAspect` is a no-op on an unchanged aspect and returns the SAME
   * OBJECT**, which matters because this fires on every frame of a drag-resize
   * and each new object is a 425-marker re-render.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      /* A zero-sized box is a box that has not been laid out yet — a hidden rail
         tab, a first paint. Re-shaping the frame for it would divide by zero and
         then snap back, so it is simply not an answer. */
      if (r.width <= 0 || r.height <= 0) return;
      setView((v) => withAspect(v, r.width / r.height));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * Live pointers, by `pointerId`, in container units.
   *
   * A ref rather than state: these change on every move and nothing renders
   * from them. The map re-renders from `view` alone.
   */
  const pointers = useRef(new Map<number, { cx: number; cy: number }>());
  /** The two-finger distance at the last frame, for the pinch ratio. */
  const pinchSpan = useRef<number | null>(null);
  /** Whether this gesture has moved. See decision 3. */
  const dragging = useRef(false);

  /** A pointer event to a fraction of the container. */
  const toLocal = useCallback((e: { clientX: number; clientY: number }) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      cx: (e.clientX - box.left) / box.width,
      cy: (e.clientY - box.top) / box.height,
    };
  }, []);

  /*
   * ⚠️ The wheel listener, attached by hand because React's is passive.
   *
   * `{ passive: false }` is the whole reason this is an effect rather than an
   * `onWheel` prop — see decision 1. It re-attaches when `toLocal` changes,
   * which is never, because `toLocal` closes over a ref.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      // Cooperative: an unmodified wheel belongs to the page. `metaKey` is the
      // Mac chord; `ctrlKey` is both the PC chord and what a trackpad pinch
      // reports, which is why pinch needs no branch of its own.
      if (!e.ctrlKey && !e.metaKey) return;
      const at = toLocal(e);
      if (!at) return;
      e.preventDefault();
      setView((v) => zoomAt(v, wheelFactor(e.deltaY), at.cx, at.cy));
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toLocal]);

  const forget = useCallback((id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinchSpan.current = null;
    if (pointers.current.size === 0) dragging.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const at = toLocal(e);
      if (!at) return;
      pointers.current.set(e.pointerId, at);
      // ⚠️ NO `setPointerCapture` here. See decision 3 — capturing on down
      // makes every marker underneath unpressable.
      dragging.current = false;
    },
    [toLocal],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const live = pointers.current;
      const prev = live.get(e.pointerId);
      if (!prev) return;
      const at = toLocal(e);
      if (!at) return;

      if (live.size >= 2) {
        // Pinch. Midpoint and span across the first two live pointers.
        live.set(e.pointerId, at);
        const [a, b] = Array.from(live.values());
        const span = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        const last = pinchSpan.current;
        pinchSpan.current = span;
        if (last !== null && last > 0 && span > 0) {
          if (!dragging.current) {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          const mx = (a.cx + b.cx) / 2;
          const my = (a.cy + b.cy) / 2;
          setView((v) => zoomAt(v, span / last, mx, my));
        }
        return;
      }

      const dcx = at.cx - prev.cx;
      const dcy = at.cy - prev.cy;
      // A press that has not moved is still a click on whatever is underneath.
      if (!dragging.current) {
        if (Math.abs(dcx) < 0.005 && Math.abs(dcy) < 0.005) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      live.set(e.pointerId, at);
      setView((v) => panBy(v, dcx, dcy));
    },
    [toLocal],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => forget(e.pointerId),
    [forget],
  );

  const zoomIn = useCallback(
    () => setView((v) => zoomAt(v, STEP_FACTOR, 0.5, 0.5)),
    [],
  );
  const zoomOut = useCallback(
    () => setView((v) => zoomAt(v, 1 / STEP_FACTOR, 0.5, 0.5)),
    [],
  );
  /* ⚠️ **`fullView(v.aspect)`, never the `FULL_VIEW` constant.** That constant
     is the whole city in a `MAP_ASPECT`-shaped box, and the box is whatever
     shape the track gives it — resetting to the literal would hand a wide frame
     a square one and shrink the drawing on the press labelled `whole city`. */
  const reset = useCallback(
    () => setView((v) => fullView(v.aspect)),
    [],
  );

  const showPoint = useCallback((p: Point) => {
    setView((v) => (isVisible(v, p) ? v : centerOn(v, p)));
  }, []);

  return {
    view,
    /* ⚠️ **`isFullView`, not `view.w < 1`.** `1` was the whole city only while
       the frame was square; on a wide frame the full view is wider than the
       city and the old comparison would report a resting map as zoomed —
       painting `FrameNote` and the `whole city` button on a page nobody has
       touched. It carries an epsilon, because the full width is now arithmetic
       over a measured aspect rather than a literal. */
    zoomed: !isFullView(view),
    ref,
    surfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
      // Decision 2. `pan-y` keeps a phone reader able to scroll past a map that
      // has nothing to pan; `none` once they have opted in by zooming.
      style: { touchAction: isFullView(view) ? "pan-y" : "none" },
    },
    zoomIn,
    zoomOut,
    reset,
    showPoint,
  };
}
