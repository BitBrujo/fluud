/**
 * The filter and the highlight must agree about what matched.
 *
 * `matchRange` is the exported half of the filter's own text normalisation —
 * `matchesText` is defined in terms of it, and `components/highlight.tsx`
 * renders the range it returns as a `<mark>`. The property pinned here is the
 * one that keeps the two from drifting if somebody ever unshares the logic:
 * **a row `applyQuery` accepts on a search always yields a range on at least
 * one of its searched fields.** A mark computed with different case or trim
 * rules from the filter sits on the wrong characters, which reads as a broken
 * search rather than a styling bug.
 */
import { describe, expect, test } from "vitest";

import {
  applyQuery,
  DEFAULT_QUERY,
  matchRange,
  type InstrumentQuery,
} from "../src/lib/instrument-query";
import { camera, sensor } from "./_fixtures";

const FLOOD_EVENT_MM = 10;
const q = (over: Partial<InstrumentQuery> = {}): InstrumentQuery => ({
  ...DEFAULT_QUERY,
  ...over,
});

describe("matchRange", () => {
  test("finds a case-insensitive substring and reports its indices", () => {
    expect(matchRange("Northern Blvd @ Bell Blvd", "bell")).toEqual({
      start: 16,
      end: 20,
    });
  });

  test("an empty search marks nothing", () => {
    expect(matchRange("Northern Blvd", "")).toBeNull();
  });

  test("a non-matching search marks nothing", () => {
    expect(matchRange("Northern Blvd", "gowanus")).toBeNull();
  });

  test("the range is index arithmetic on the ORIGINAL string, not a lowered copy", () => {
    const r = matchRange("AVE C @ 23 ST", "ave c");
    expect(r).toEqual({ start: 0, end: 5 });
  });

  test("⚠️ a sensor row the filter accepts always has a range to mark", () => {
    const rows = [
      sensor({ sensor_id: "s1", name: "Union St & Bond St", nta: null }),
      sensor({ sensor_id: "s2", name: null, nta: "Gowanus" }),
      sensor({ sensor_id: "curly_orange_shrimp", name: null, nta: null }),
    ];
    for (const search of ["union", "GOWANUS", "shrimp"]) {
      const kept = applyQuery(
        q({ mode: "sensors", search }),
        [],
        rows,
        FLOOD_EVENT_MM,
      );
      expect(kept.length).toBeGreaterThan(0);
      for (const item of kept) {
        if (item.kind !== "sensor") continue;
        const fields = [
          item.sensor.name,
          item.sensor.borough,
          item.sensor.nta,
          item.sensor.sensor_id,
        ];
        const marked = fields.some(
          (f) => f != null && matchRange(f, search) !== null,
        );
        expect(marked).toBe(true);
      }
    }
  });

  test("⚠️ a camera row the filter accepts always has a range to mark", () => {
    const rows = [camera({ camera_id: "c1", name: "Northern Blvd @ Bell Blvd" })];
    const kept = applyQuery(
      q({ mode: "cameras", search: "bell" }),
      rows,
      [],
      FLOOD_EVENT_MM,
    );
    expect(kept.length).toBe(1);
    const c = kept[0];
    if (c.kind !== "camera") throw new Error("expected a camera row");
    const fields = [c.camera.name, c.camera.nta, c.camera.camera_id, c.camera.sensor_id];
    expect(fields.some((f) => f != null && matchRange(f, "bell") !== null)).toBe(
      true,
    );
  });
});
