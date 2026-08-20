/**
 * The map's frame arithmetic.
 *
 * Three of these are load-bearing in a way the others are not, and each is here
 * because the failure it catches is invisible in a browser until somebody
 * measures for it:
 *
 *  · **`toContainer` and `svgViewBox` at `FULL_VIEW` reproduce the pre-zoom
 *    behaviour EXACTLY.** That is what makes threading the viewport through
 *    `city-map.tsx` a pixel no-op, and a no-op is what makes every later
 *    measurement attributable to the change that caused it.
 *  · **`clampViewport` returns the SAME OBJECT when nothing changes.** Three
 *    call sites skip a 425-marker re-render on that identity. It is a `toBe`
 *    for `warning-feed.test.ts`'s reason: a fresh object with equal contents
 *    passes `toEqual` and does not deliver the contract.
 *  · **`zoomAt` fixes the point under the cursor.** Round-tripped through
 *    `toContainer` rather than asserted on the corner, because the corner is
 *    the thing derived and the anchor is the thing promised.
 *
 * ⚠️ **No test in here can see a marker.** Sizes, hit targets and the
 * unreachable-marker table are browser measurements and live in
 * `web/src/components/CLAUDE.md`. See the jsdom refusal in `tests/CLAUDE.md`.
 */
import { describe, expect, test } from "vitest";

import { MAP_ASPECT, VIEWBOX_H, VIEWBOX_W } from "../src/lib/geo/project";
import {
  centerOn,
  clampViewport,
  frameH,
  FULL_VIEW,
  fullView,
  fullW,
  isFullView,
  isVisible,
  minW,
  MAX_ZOOM,
  MIN_W,
  panBy,
  svgViewBox,
  toContainer,
  withAspect,
  zoomAt,
  type Viewport,
} from "../src/lib/geo/viewport";

/** A frame at ×4, somewhere over Brooklyn. */
const MID: Viewport = { x: 0.4, y: 0.45, w: 0.25 };

describe("clampViewport", () => {
  test("keeps the frame inside the unit square", () => {
    expect(clampViewport({ x: -0.5, y: -0.5, w: 0.25 })).toEqual({
      x: 0,
      y: 0,
      w: 0.25,
    });
    expect(clampViewport({ x: 9, y: 9, w: 0.25 })).toEqual({
      x: 0.75,
      y: 0.75,
      w: 0.25,
    });
  });

  test("never zooms out past the whole city", () => {
    expect(clampViewport({ x: 0, y: 0, w: 4 })).toEqual(FULL_VIEW);
  });

  test("never zooms in past MAX_ZOOM", () => {
    expect(clampViewport({ x: 0.5, y: 0.5, w: 0.0001 }).w).toBe(MIN_W);
    expect(MIN_W).toBe(1 / MAX_ZOOM);
  });

  test("a frame wider than the square is pinned to the origin", () => {
    // `w` clamps to 1 first, so `1 - w` is 0 and both corners follow.
    expect(clampViewport({ x: 0.3, y: 0.3, w: 2 })).toEqual(FULL_VIEW);
  });

  /**
   * ⚠️ **`toBe`, not `toEqual`.** The contract is that a caller can skip a
   * render. A fresh object with equal contents satisfies `toEqual` and does not
   * satisfy the contract — see the same distinction in `warning-feed.test.ts`.
   */
  test("returns the SAME OBJECT when nothing changes", () => {
    expect(clampViewport(MID)).toBe(MID);
    expect(clampViewport(FULL_VIEW)).toBe(FULL_VIEW);
  });

  test("a pan already at the edge is the same object", () => {
    const atEdge: Viewport = { x: 0, y: 0, w: 0.5 };
    expect(panBy(atEdge, 0.2, 0.2)).toBe(atEdge);
  });

  test("a zoom already at the stop is the same object", () => {
    const out = zoomAt(FULL_VIEW, 0.5, 0.5, 0.5);
    expect(out).toBe(FULL_VIEW);
  });
});

describe("zoomAt", () => {
  test("the point under the cursor stays under the cursor", () => {
    // A world point, and where it sits in the frame before the zoom.
    const p = { x: 0.47, y: 0.52 };
    const before = toContainer(MID, p);

    const after = toContainer(zoomAt(MID, 2, before.cx, before.cy), p);

    expect(after.cx).toBeCloseTo(before.cx, 10);
    expect(after.cy).toBeCloseTo(before.cy, 10);
  });

  test("it holds at a corner of the frame too", () => {
    const p = { x: 0.4, y: 0.45 }; // MID's own top-left
    const after = toContainer(zoomAt(MID, 3, 0, 0), p);
    expect(after.cx).toBeCloseTo(0, 10);
    expect(after.cy).toBeCloseTo(0, 10);
  });

  test("zooming out from anywhere converges on FULL_VIEW", () => {
    let v: Viewport = { x: 0.71, y: 0.13, w: MIN_W };
    for (let i = 0; i < 40; i += 1) v = zoomAt(v, 0.8, 0.5, 0.5);
    expect(v).toEqual(FULL_VIEW);
  });

  test("factor > 1 zooms in and factor < 1 zooms out", () => {
    expect(zoomAt(MID, 2, 0.5, 0.5).w).toBeCloseTo(0.125, 10);
    expect(zoomAt(MID, 0.5, 0.5, 0.5).w).toBeCloseTo(0.5, 10);
  });

  test("a zoom at the anchor cannot push the frame out of the square", () => {
    const v = zoomAt({ x: 0, y: 0, w: 1 }, 1.5, 0, 0);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.x + v.w).toBeLessThanOrEqual(1);
    expect(v.y + v.w).toBeLessThanOrEqual(1);
  });
});

describe("panBy", () => {
  test("moves the frame against the drag", () => {
    // Dragging the paper right (positive dcx) moves the frame left.
    expect(panBy(MID, 0.4, 0).x).toBeCloseTo(0.4 - 0.4 * 0.25, 10);
    expect(panBy(MID, -0.4, 0).x).toBeCloseTo(0.4 + 0.4 * 0.25, 10);
  });

  test("is scaled by the frame, so the gesture feels the same at every zoom", () => {
    const wide: Viewport = { x: 0.3, y: 0.3, w: 0.5 };
    const tight: Viewport = { x: 0.3, y: 0.3, w: 0.1 };
    expect(wide.x - panBy(wide, 0.5, 0).x).toBeCloseTo(0.25, 10);
    expect(tight.x - panBy(tight, 0.5, 0).x).toBeCloseTo(0.05, 10);
  });

  test("cannot escape the square, however hard it is pushed", () => {
    let v: Viewport = { x: 0.5, y: 0.5, w: 0.2 };
    for (let i = 0; i < 50; i += 1) v = panBy(v, -1, -1);
    expect(v).toEqual({ x: 0.8, y: 0.8, w: 0.2 });
  });

  test("panning at FULL_VIEW is a no-op, because there is nowhere to go", () => {
    expect(panBy(FULL_VIEW, 0.3, -0.7)).toBe(FULL_VIEW);
  });
});

describe("centerOn", () => {
  test("puts the point in the middle", () => {
    const p = { x: 0.5, y: 0.5 };
    const v = centerOn(MID, p);
    const { cx, cy } = toContainer(v, p);
    expect(cx).toBeCloseTo(0.5, 10);
    expect(cy).toBeCloseTo(0.5, 10);
  });

  test("a corner point lands ON SCREEN rather than centred", () => {
    // The clamp refuses to leave the square, so this is off-centre and visible,
    // which is what `isVisible` is asked about rather than centredness.
    const p = { x: 0.01, y: 0.99 };
    const v = centerOn(MID, p);
    expect(v.x).toBe(0);
    expect(v.y).toBeCloseTo(1 - MID.w, 10);
    expect(isVisible(v, p)).toBe(true);
  });

  test("does not change the zoom", () => {
    expect(centerOn(MID, { x: 0.2, y: 0.8 }).w).toBe(MID.w);
  });
});

describe("isVisible", () => {
  test("everything in the city is visible at FULL_VIEW", () => {
    expect(isVisible(FULL_VIEW, { x: 0.5, y: 0.5 })).toBe(true);
  });

  test("a point outside the frame is not", () => {
    expect(isVisible(MID, { x: 0.1, y: 0.1 })).toBe(false);
  });

  test("the margin catches a point half under the frame's edge", () => {
    // MID spans x 0.40..0.65. 0.401 is inside the frame and inside the inset.
    expect(isVisible(MID, { x: 0.401, y: 0.5 })).toBe(false);
    expect(isVisible(MID, { x: 0.401, y: 0.5 }, 0)).toBe(true);
  });
});

describe("the FULL_VIEW identities", () => {
  /**
   * ⚠️ These two are what make step 2 of the zoom work a **pixel no-op**. If
   * either fails, every marker on the drawing has moved and no later
   * measurement can be attributed to anything.
   */
  test("toContainer at FULL_VIEW is the old `p.x * 100%` behaviour exactly", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0.31415, y: 0.92653 },
    ]) {
      expect(toContainer(FULL_VIEW, p)).toEqual({ cx: p.x, cy: p.y });
    }
  });

  test("svgViewBox at FULL_VIEW is the literal the map used before zoom", () => {
    expect(svgViewBox(FULL_VIEW)).toBe(`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`);
  });

  test("svgViewBox scales both axes by the one `w`", () => {
    // The aspect invariant, stated as arithmetic: a square in normalized space
    // is a MAP_ASPECT-shaped box on screen at every zoom, because there is only
    // one number here and it multiplies both extents.
    const box = svgViewBox({ x: 0.25, y: 0.5, w: 0.5 });
    expect(box).toBe(
      `${0.25 * VIEWBOX_W} ${0.5 * VIEWBOX_H} ${0.5 * VIEWBOX_W} ${
        0.5 * VIEWBOX_H
      }`,
    );
  });
});

/**
 * ⚠️ **The non-square frame — 2026-08-15, when the map started filling its
 * track.** Everything above this point is the square frame and is unchanged;
 * it is the regression suite for `aspect` being absent.
 *
 * Two of these are the ones that matter, and both catch a failure that is
 * invisible until somebody measures a marker against a coastline:
 *
 *  · **the viewBox rect is the CONTAINER's shape at every zoom.** That is the
 *    marker-alignment rule, which used to be a CSS `aspect-ratio` matching a
 *    constant and is now arithmetic. A mismatch letterboxes the drawing and
 *    drifts every marker by half the letterbox — consistently enough to read
 *    as bad map data rather than as a bug.
 *  · **full view never crops.** `whole city` promises a whole city, so a frame
 *    that cannot match the container's shape *and* hold the city has to grow,
 *    never shrink. Fitting the tighter axis would cut boroughs out of the state
 *    the page opens in.
 */
describe("a frame that is not MAP_ASPECT-shaped", () => {
  /** A wide track — roughly the map column at full page width on a big screen. */
  const WIDE = 1172 / 932;
  /** A tall one — the stacked layout on a phone. */
  const TALL = 390 / 740;

  const rect = (v: Viewport) => svgViewBox(v).split(" ").map(Number);

  test("the viewBox rect is the container's shape, at every zoom", () => {
    for (const aspect of [WIDE, TALL, MAP_ASPECT, 1, 3.2]) {
      let v = fullView(aspect);
      for (let i = 0; i < 5; i++) {
        const [, , w, h] = rect(v);
        expect(w / h).toBeCloseTo(aspect, 10);
        v = zoomAt(v, 1.7, 0.3, 0.8);
      }
    }
  });

  test("full view holds the whole city and never crops it", () => {
    for (const aspect of [WIDE, TALL, MAP_ASPECT, 1, 3.2]) {
      const v = fullView(aspect);
      expect(v.x).toBeLessThanOrEqual(1e-9);
      expect(v.y).toBeLessThanOrEqual(1e-9);
      expect(v.x + v.w).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(v.y + frameH(v)).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(isFullView(v)).toBe(true);
    }
  });

  test("a frame wider than the city is centred on it, with nowhere to pan", () => {
    const v = fullView(WIDE);
    // The overhang is equal on both sides, so the city sits in the middle.
    expect(v.x).toBeCloseTo((1 - v.w) / 2, 12);
    expect(v.x).toBeLessThan(0);
    // And there is no freedom left on that axis: a pan cannot move it.
    expect(panBy(v, 0.4, 0)).toBe(v);
  });

  test("MAP_ASPECT is exactly the old square frame, key for key", () => {
    // The stored aspect is the only difference, and it is the shape ITSELF
    // rather than a frame value — so the frame is compared, not the record.
    const { x, y, w } = fullView(MAP_ASPECT);
    expect({ x, y, w }).toEqual(FULL_VIEW);
    expect(svgViewBox(fullView(MAP_ASPECT))).toBe(svgViewBox(FULL_VIEW));
    expect(frameH({ x: 0, y: 0, w: 0.25 })).toBeCloseTo(0.25, 12);
    expect(fullW(FULL_VIEW)).toBe(1);
    expect(minW(FULL_VIEW)).toBe(MIN_W);
  });

  test("the zoom RANGE is the same factor whatever the shape", () => {
    for (const aspect of [WIDE, TALL, MAP_ASPECT]) {
      const v = fullView(aspect);
      expect(fullW(v) / minW(v)).toBeCloseTo(MAX_ZOOM, 10);
    }
  });

  test("zoomAt still fixes the point under the cursor on a wide frame", () => {
    // Round-tripped through `toContainer` for the square case's reason: the
    // corner is derived and the anchor is what is promised. The vertical half
    // is the one that regressed if `frameH` is ever replaced by `v.w`.
    const v = fullView(WIDE);
    const before = toContainer(v, { x: 0.62, y: 0.38 });
    const after = toContainer(zoomAt(v, 2.5, before.cx, before.cy), {
      x: 0.62,
      y: 0.38,
    });
    expect(after.cx).toBeCloseTo(before.cx, 10);
    expect(after.cy).toBeCloseTo(before.cy, 10);
  });

  test("toContainer and svgViewBox agree about the frame's edges", () => {
    // The two halves of the alignment rule, checked against each other: the
    // corner of the viewBox rect must be container position (0, 0), and the
    // opposite corner (1, 1). This is what a drifting marker looks like as
    // arithmetic.
    for (const aspect of [WIDE, TALL]) {
      const v = zoomAt(fullView(aspect), 3, 0.25, 0.75);
      const [x, y, w, h] = rect(v);
      const topLeft = toContainer(v, { x: x / VIEWBOX_W, y: y / VIEWBOX_H });
      const btmRight = toContainer(v, {
        x: (x + w) / VIEWBOX_W,
        y: (y + h) / VIEWBOX_H,
      });
      expect(topLeft.cx).toBeCloseTo(0, 10);
      expect(topLeft.cy).toBeCloseTo(0, 10);
      expect(btmRight.cx).toBeCloseTo(1, 10);
      expect(btmRight.cy).toBeCloseTo(1, 10);
    }
  });
});

describe("withAspect", () => {
  const WIDE = 1172 / 932;

  test("keeps the zoom FACTOR across a resize, not the width", () => {
    // A width means a different magnification in a differently-shaped box, so
    // what has to survive a rail tab opening is how far in the reader is.
    const v = zoomAt(fullView(MAP_ASPECT), 4, 0.5, 0.5);
    const factorBefore = fullW(v) / v.w;
    const after = withAspect(v, WIDE);
    expect(fullW(after) / after.w).toBeCloseTo(factorBefore, 10);
  });

  test("keeps the middle of the frame over the same place", () => {
    const v = zoomAt(fullView(MAP_ASPECT), 4, 0.2, 0.7);
    const before = { x: v.x + v.w / 2, y: v.y + frameH(v) / 2 };
    const after = withAspect(v, WIDE);
    expect(after.x + after.w / 2).toBeCloseTo(before.x, 10);
    expect(after.y + frameH(after) / 2).toBeCloseTo(before.y, 10);
  });

  test("is the SAME OBJECT when the shape has not moved", () => {
    // A ResizeObserver fires on every frame of a drag-resize, and each new
    // object here is a 425-marker re-render. `toBe`, for `clampViewport`'s
    // reason.
    const v = fullView(WIDE);
    expect(withAspect(v, WIDE)).toBe(v);
    expect(withAspect(FULL_VIEW, MAP_ASPECT)).toBe(FULL_VIEW);
  });

  test("a full view stays a full view through any resize", () => {
    let v = fullView(MAP_ASPECT);
    for (const a of [WIDE, 0.6, 2.4, MAP_ASPECT]) {
      v = withAspect(v, a);
      expect(isFullView(v)).toBe(true);
    }
  });
});
