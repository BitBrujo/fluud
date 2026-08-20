/**
 * The depth timeframe's pure rules.
 *
 * Scope is `src/lib/` as always — what is covered here is the arithmetic and
 * the copy generation, i.e. the parts a compiler cannot see. The cross-language
 * half (that these constants match `waterline/peaks.py`) is `parity.test.ts`
 * and is deliberately not duplicated here.
 */
import { describe, expect, test } from "vitest";

import {
  clampWindow,
  customToMinutes,
  MAX_WINDOW_MIN,
  MIN_WINDOW_MIN,
  peakLabel,
  PRESET_MINUTES,
  RETENTION_DAYS,
  splitWindow,
  windowLabel,
} from "../src/lib/depth-window";

describe("clampWindow", () => {
  test("holds anything already inside the band", () => {
    for (const m of [1, 10, 30, 60, 1440, 10080]) {
      expect(clampWindow(m)).toBe(m);
    }
  });

  test("⚠️ never returns 0, a negative, or a fraction", () => {
    // This is fed by a `<input type="number">`, whose transient states include
    // empty string, `-`, and `1e999`. A window of 0 asks the server for an
    // empty range and renders as "nothing recorded", which reads as a claim
    // about the street rather than about the control.
    for (const bad of [0, -1, -10080, 0.4, NaN, Infinity, -Infinity]) {
      const got = clampWindow(bad);
      expect(got).toBeGreaterThanOrEqual(MIN_WINDOW_MIN);
      expect(Number.isInteger(got)).toBe(true);
    }
  });

  test("⚠️ caps at retention rather than passing a wider window through", () => {
    // Readings past `RETENTION_DAYS` are pruned, so a wider window would come
    // back as a peak over whatever survived — a smaller number wearing a longer
    // label, which is the one way this feature can understate a flood.
    expect(clampWindow(MAX_WINDOW_MIN + 1)).toBe(MAX_WINDOW_MIN);
    expect(clampWindow(525_600)).toBe(MAX_WINDOW_MIN);
    expect(MAX_WINDOW_MIN).toBe(RETENTION_DAYS * 24 * 60);
  });
});

describe("customToMinutes", () => {
  test("converts each unit", () => {
    expect(customToMinutes(90, "minutes")).toBe(90);
    expect(customToMinutes(3, "hours")).toBe(180);
    expect(customToMinutes(2, "days")).toBe(2880);
  });

  test("returns null for what is not a window yet", () => {
    // null rather than a default: the apply button is disabled on it, so a
    // half-typed value cannot commit a window nobody asked for.
    expect(customToMinutes(0, "hours")).toBeNull();
    expect(customToMinutes(-5, "days")).toBeNull();
    expect(customToMinutes(NaN, "minutes")).toBeNull();
  });

  test("clamps a wide custom window instead of returning it", () => {
    expect(customToMinutes(365, "days")).toBe(MAX_WINDOW_MIN);
  });
});

describe("windowLabel", () => {
  test("names the four presets the way the menu does", () => {
    expect(PRESET_MINUTES.map(windowLabel)).toEqual([
      "last 10 min",
      "last 30 min",
      "last hour",
      "last day",
    ]);
  });

  test("steps units up only where they divide exactly", () => {
    // `last 90 min` is honest; `last 1.5 hours` is a rounding invitation on a
    // page where every other number is exact.
    expect(windowLabel(90)).toBe("last 90 min");
    expect(windowLabel(120)).toBe("last 2 hours");
    expect(windowLabel(2880)).toBe("last 2 days");
    expect(windowLabel(1500)).toBe("last 25 hours");
  });

  test("singular at exactly one unit", () => {
    expect(windowLabel(60)).toBe("last hour");
    expect(windowLabel(1440)).toBe("last day");
  });
});

describe("peakLabel", () => {
  test("⚠️ every label names the aggregate", () => {
    // The word `peak` is the ONLY thing separating a historical figure from a
    // current depth, and it renders under a 26px number. A label that could
    // omit it would let `42 mm · last hour` read as a depth that is still true.
    for (const m of [...PRESET_MINUTES, 1, 90, MAX_WINDOW_MIN]) {
      expect(peakLabel(m)).toContain("peak");
    }
    expect(peakLabel(60)).toBe("peak · last hour");
  });
});

describe("splitWindow", () => {
  test("round-trips through customToMinutes", () => {
    // The custom fields are seeded from whatever is picked, so a reader opening
    // the menu on `last day` and switching to custom starts at `1 day`. A
    // lossy split would silently change their window.
    for (const m of [1, 10, 45, 60, 180, 1440, 2880, MAX_WINDOW_MIN]) {
      const { value, unit } = splitWindow(m);
      expect(customToMinutes(value, unit)).toBe(m);
    }
  });

  test("picks the largest unit that divides exactly", () => {
    expect(splitWindow(1440)).toEqual({ value: 1, unit: "days" });
    expect(splitWindow(180)).toEqual({ value: 3, unit: "hours" });
    expect(splitWindow(45)).toEqual({ value: 45, unit: "minutes" });
  });
});
