/**
 * Web Mercator, hand-rolled, normalised into the unit square.
 *
 * Twenty lines of trigonometry instead of a map library. That is the whole
 * reason this app still makes zero third-party requests at runtime: Leaflet or
 * MapLibre would have brought a tile CDN with them, and a blocked tile host
 * during a storm is a grey rectangle where the instrument used to be. See
 * web/src/components/CLAUDE.md, "Why it is drawn and not fetched".
 *
 * Nothing here touches React, the DOM, or the clock — it is all pure functions
 * of two numbers, which is what makes the one genuinely tricky part (the
 * aspect ratio) checkable rather than a matter of eyeballing pin drift.
 */

/**
 * The viewport, with a little margin on the data.
 *
 * The boroughs themselves span lon -74.2556..-73.7000, lat 40.4961..40.9155.
 * Rounding outward keeps Staten Island's western shore and the Bronx's northern
 * tip off the edge, and keeps these numbers legible.
 */
export const NYC_BOUNDS = {
  west: -74.27,
  east: -73.69,
  south: 40.49,
  north: 40.92,
} as const;

/** Mercator x — just longitude in radians. */
function mercatorX(lon: number): number {
  return (lon * Math.PI) / 180;
}

/** Mercator y. The one that isn't linear in the coordinate. */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

const X0 = mercatorX(NYC_BOUNDS.west);
const X1 = mercatorX(NYC_BOUNDS.east);
const Y0 = mercatorY(NYC_BOUNDS.south);
const Y1 = mercatorY(NYC_BOUNDS.north);

/**
 * Width ÷ height of the projected viewport. **Both the SVG `viewBox` and the
 * container's CSS `aspect-ratio` must use this number.**
 *
 * Why it matters more than it looks: the pins are HTML buttons positioned in
 * percentages *on top of* the SVG, not children of it. If the container's
 * aspect ratio disagrees with the viewBox's, `preserveAspectRatio` letterboxes
 * the drawing inside the box — and the percentages, which know nothing about
 * that, keep addressing the box. Every pin then drifts by half the letterbox,
 * consistently and plausibly enough to look like bad map data rather than a
 * layout bug. Matching the two makes the letterbox zero-width by construction.
 *
 * It must be computed from the mercator extent, not from the degree extent:
 * longitude degrees and latitude degrees are not the same distance, and using
 * `(east - west) / (north - south)` yields ~1.35 instead of ~1.01 — a map
 * stretched by a third, with New Jersey-shaped Manhattan.
 */
export const MAP_ASPECT = (X1 - X0) / (Y1 - Y0);

export interface Point {
  /** 0 at the western edge, 1 at the eastern. */
  x: number;
  /** 0 at the NORTHERN edge, 1 at the southern — SVG/CSS y grows downward. */
  y: number;
}

/** Project to the unit square. Values outside 0..1 are outside the viewport. */
export function project(lon: number, lat: number): Point {
  return {
    x: (mercatorX(lon) - X0) / (X1 - X0),
    y: 1 - (mercatorY(lat) - Y0) / (Y1 - Y0),
  };
}

/** Is this coordinate inside the drawn viewport at all? */
export function inViewport(lon: number, lat: number): boolean {
  const p = project(lon, lat);
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

/**
 * The viewBox height. Width is `VIEWBOX_H * MAP_ASPECT`. An arbitrary number of
 * user units — 1000 keeps stroke widths and the path data readable.
 */
export const VIEWBOX_H = 1000;
export const VIEWBOX_W = VIEWBOX_H * MAP_ASPECT;

/**
 * One flat [lon, lat, lon, lat, …] ring to an SVG path `d` fragment.
 *
 * Coordinates are emitted at one decimal place: at a 1000-unit viewBox that is
 * ~0.05% of the frame, well under a device pixel, and it roughly halves the
 * string length versus the default float formatting.
 */
export function ringToPath(ring: readonly number[]): string {
  let d = "";
  for (let i = 0; i < ring.length; i += 2) {
    const p = project(ring[i], ring[i + 1]);
    d += `${i === 0 ? "M" : "L"}${(p.x * VIEWBOX_W).toFixed(1)},${(
      p.y * VIEWBOX_H
    ).toFixed(1)}`;
  }
  return `${d}Z`;
}
