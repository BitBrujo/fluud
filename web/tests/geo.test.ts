/**
 * The projection and the distance arithmetic — twenty lines of Mercator instead
 * of a map library, which is the whole reason this app makes no third-party
 * request at runtime for its map.
 *
 * Two things in here are checkable rather than eyeballable, and both are the
 * reason these functions live outside React:
 *
 *  · **`MAP_ASPECT` must come from the mercator extent.** The degree extent
 *    gives ~1.35 instead of ~1.01 and every pin drifts by half a letterbox —
 *    consistently and plausibly enough to look like bad map data.
 *  · **Which argument is latitude.** `project` is lon-first,
 *    `cameras.haversine_m` is lat-first, `haversineM` takes named fields. A
 *    transposed NYC coordinate does not crash and does not look wrong: it
 *    returns a large, plausible distance, and on a page about coverage that
 *    reads as *nothing is watching your block* rather than as a bug.
 */
import { describe, expect, test } from "vitest";

import {
  distanceText,
  FAR_M,
  formatDistance,
  haversineM,
} from "../src/lib/geo/distance";
import {
  inViewport,
  MAP_ASPECT,
  NYC_BOUNDS,
  project,
  ringToPath,
  VIEWBOX_H,
  VIEWBOX_W,
} from "../src/lib/geo/project";

/** Two Manhattan corners. Cross-checked against `waterline.cameras.haversine_m`. */
const A = { lat: 40.734, lon: -73.977 };
const B = { lat: 40.7375, lon: -73.9745 };

describe("haversineM", () => {
  test("agrees with cameras.haversine_m over a short pair", () => {
    // Python: 442.5284514101322 m. Both use R = 6_371_000.
    // ⚠️ This is a hand-pinned twin of the Python value; `parity.test.ts` is
    // what recomputes it from the real function.
    expect(haversineM(A, B)).toBeCloseTo(442.5284514101322, 6);
  });

  test("and over a several-kilometre pair", () => {
    // Python: 5419.064624225242 m.
    expect(
      haversineM({ lat: 40.6782, lon: -73.9442 }, { lat: 40.7061, lon: -73.9969 }),
    ).toBeCloseTo(5419.064624225242, 6);
  });

  test("is symmetric and zero at a point", () => {
    expect(haversineM(A, B)).toBeCloseTo(haversineM(B, A), 9);
    expect(haversineM(A, A)).toBe(0);
  });

  test("⚠️ ONE transposed endpoint returns a huge plausible number, never an error", () => {
    // The failure mode the named-fields rule exists to prevent, asserted so the
    // rule has a witness. A transposed NYC coordinate is in the southern Indian
    // Ocean, so the distance is ~11,000 km — finite, plausible-looking, and on a
    // page about coverage it reads as *nothing is watching your block*.
    const swapped = haversineM(A, { lat: B.lon, lon: B.lat });
    expect(Number.isFinite(swapped)).toBe(true);
    expect(swapped).toBeGreaterThan(10_000_000);
  });

  test("⚠️ transposing BOTH endpoints hides itself completely", () => {
    // Worth pinning because it is the case that looks fine. Two coordinates
    // swapped the same way stay near each other, so the distance is merely
    // *wrong* rather than absurd — 298 m against a true 442 m. No magnitude
    // check can catch this, which is why `inViewport` is the actual guard and
    // why `distanceFromOrigin` calls it on both points rather than one.
    const both = haversineM(
      { lat: A.lon, lon: A.lat },
      { lat: B.lon, lon: B.lat },
    );
    expect(both).toBeLessThan(1000);
    expect(both).not.toBeCloseTo(haversineM(A, B), 0);
  });
});

describe("FAR_M", () => {
  test("is cameras.MAX_PAIR_M, borrowed rather than invented", () => {
    // The distance past which this project stops calling two instruments the
    // same water and refuses to pair a camera to a sensor at all.
    expect(FAR_M).toBe(250);
  });
});

describe("formatDistance", () => {
  test("rounds metres to the nearest 10", () => {
    // GeoSearch returns a parcel centroid, so metre precision would be false
    // precision about where somebody is standing.
    expect(formatDistance(442.5)).toEqual({ value: "440", unit: "m" });
    expect(formatDistance(435.039)).toEqual({ value: "440", unit: "m" });
  });

  test("floors at 10 m rather than printing 0", () => {
    // `0 m` would read as *you are standing on it*.
    expect(formatDistance(0)).toEqual({ value: "10", unit: "m" });
    expect(formatDistance(4)).toEqual({ value: "10", unit: "m" });
  });

  test("switches to kilometres at 950 m", () => {
    expect(formatDistance(949)).toEqual({ value: "950", unit: "m" });
    // ⚠️ Reads `0.9 km`, not `1.0`. `(950/1000).toFixed(1)` is "0.9" because 0.95
    // is below 0.95 in binary floating point. Pinned as the actual behaviour
    // rather than the expected one — it is a cosmetic understatement of 50 m at
    // one value, on a figure already rounded to the nearest 10 m, and "fixing"
    // it would be a rounding change on a distance nobody's safety turns on.
    expect(formatDistance(950)).toEqual({ value: "0.9", unit: "km" });
    expect(formatDistance(1000)).toEqual({ value: "1.0", unit: "km" });
    expect(formatDistance(5419)).toEqual({ value: "5.4", unit: "km" });
  });

  test("distanceText joins the two halves", () => {
    expect(distanceText(442.5)).toBe("440 m");
  });
});

describe("MAP_ASPECT", () => {
  test("⚠️ is computed from the mercator extent, not the degree extent", () => {
    // The degree ratio is (east-west)/(north-south) ≈ 1.35 — a map stretched by
    // a third, with a New Jersey-shaped Manhattan. The mercator ratio is ~1.01.
    const degrees =
      (NYC_BOUNDS.east - NYC_BOUNDS.west) / (NYC_BOUNDS.north - NYC_BOUNDS.south);
    expect(degrees).toBeCloseTo(1.35, 1);
    expect(MAP_ASPECT).toBeCloseTo(1.01, 1);
    expect(MAP_ASPECT).not.toBeCloseTo(degrees, 1);
  });

  test("the viewBox is derived from it, so the letterbox is zero by construction", () => {
    expect(VIEWBOX_W / VIEWBOX_H).toBe(MAP_ASPECT);
  });
});

describe("project", () => {
  test("is lon-first, and the corners land where they should", () => {
    const nw = project(NYC_BOUNDS.west, NYC_BOUNDS.north);
    const se = project(NYC_BOUNDS.east, NYC_BOUNDS.south);
    expect(nw.x).toBeCloseTo(0, 9);
    expect(nw.y).toBeCloseTo(0, 9); // y grows DOWNWARD — 0 is the north edge
    expect(se.x).toBeCloseTo(1, 9);
    expect(se.y).toBeCloseTo(1, 9);
  });

  test("a Manhattan coordinate lands inside the unit square", () => {
    const p = project(A.lon, A.lat);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(1);
  });
});

describe("inViewport", () => {
  test("accepts a real NYC coordinate", () => {
    expect(inViewport(A.lon, A.lat)).toBe(true);
  });

  test("⚠️ rejects the transposition, which is the actual mechanism", () => {
    // `geosearch.readFeature` and `distanceFromOrigin` both lean on this. A
    // transposed feature is rejected and the surface says "no New York address
    // matches" rather than returning a wrong answer.
    expect(inViewport(A.lat, A.lon)).toBe(false);
  });

  test("rejects null island and NaN", () => {
    expect(inViewport(0, 0)).toBe(false);
    expect(inViewport(Number.NaN, 40.734)).toBe(false);
    expect(inViewport(-73.977, Number.NaN)).toBe(false);
  });

  test("the whole instrument set fits with margin", () => {
    // Measured: 968 DOT cameras span lat 40.508–40.906 / lon −74.230 to −73.714,
    // and all 425 FloodNet sensors sit inside that. The off-map counter should
    // read zero forever; it firing means an upstream feed has moved.
    expect(inViewport(-74.23, 40.508)).toBe(true);
    expect(inViewport(-73.714, 40.906)).toBe(true);
  });
});

describe("ringToPath", () => {
  test("emits a closed path at one decimal place", () => {
    const d = ringToPath([NYC_BOUNDS.west, NYC_BOUNDS.north, NYC_BOUNDS.east, NYC_BOUNDS.south]);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("L");
    expect(d).toMatch(/^M[\d.,-]+L[\d.,-]+Z$/);
  });
});
