/**
 * Number and time formatting. Two of these carry safety weight and the file
 * says so at the top of itself.
 *
 * ⚠️ **`parseServerTime` is a five-hour error in New York when it regresses.**
 * FastAPI serves `datetime.isoformat()` and a naive datetime has no offset, so
 * `Date.parse` reads a bare `2026-08-04T14:32:00` in the *viewer's* zone. In
 * NYC that shifts every age on the page by four or five hours and renders a
 * five-hour-old reading as current — the frozen-poller rule, defeated by a missing
 * character.
 *
 * ⚠️ **`formatDepth`'s boundary is the one a rewrite gets wrong**, and it has to
 * agree with `agent._depth_phrase` on the server. That agreement is asserted
 * across the language boundary in `parity.test.ts`; this file pins the
 * behaviour on its own side.
 */
import { describe, expect, test } from "vitest";

import {
  AHEAD_OF_BROWSER,
  ageSeconds,
  depthText,
  formatAge,
  formatAgeShort,
  formatDepth,
  frameUrl,
  parseServerTime,
} from "../src/lib/format";

describe("parseServerTime", () => {
  test("an offsetless timestamp is read as UTC, not as local", () => {
    // The whole reason this function exists. If this ever returns a Date built
    // in the viewer's zone, every age on the page is wrong by the UTC offset.
    const d = parseServerTime("2026-08-04T14:32:00");
    expect(d?.toISOString()).toBe("2026-08-04T14:32:00.000Z");
  });

  test("the two wire formats are the same instant", () => {
    // ⚠️ Both are in use at once and that is by design. Response models
    // serialise `…Z`; `rat.py` emits `…+00:00` over SSE, because
    // `warning-feed.ts` dedupes on that raw string across both transports.
    const z = parseServerTime("2026-08-05T12:00:00Z");
    const offset = parseServerTime("2026-08-05T12:00:00+00:00");
    expect(z?.getTime()).toBe(offset?.getTime());
  });

  test("a real offset is respected rather than overwritten", () => {
    const d = parseServerTime("2026-08-05T08:00:00-04:00");
    expect(d?.toISOString()).toBe("2026-08-05T12:00:00.000Z");
  });

  test("fractional seconds survive", () => {
    expect(parseServerTime("2026-08-05T12:00:00.250")?.toISOString()).toBe(
      "2026-08-05T12:00:00.250Z",
    );
  });

  test("absence returns null, never an Invalid Date", () => {
    // Callers have to handle it. An Invalid Date propagates as NaN and renders
    // as a plausible-looking nothing.
    for (const v of [null, undefined, ""]) {
      expect(parseServerTime(v)).toBeNull();
    }
  });

  test("garbage returns null", () => {
    expect(parseServerTime("not a timestamp")).toBeNull();
  });
});

describe("ageSeconds", () => {
  const t = new Date("2026-08-05T12:00:00Z");

  test("counts forward in seconds", () => {
    expect(ageSeconds(t, t.getTime() + 90_000)).toBe(90);
  });

  test("goes negative when the reading is ahead of the browser", () => {
    expect(ageSeconds(t, t.getTime() - 30_000)).toBe(-30);
  });
});

describe("formatAge", () => {
  test("a reading from the future says the clocks disagree", () => {
    // ⚠️ Not paranoia. FloodNet devices report dates decades ahead — `poll.py`
    // bounds on MAX_FUTURE for exactly this — and a clock-skewed viewer gives
    // the same symptom. A negative age rendered as if it meant something is the
    // failure being refused.
    expect(formatAge(-61)).toBe(AHEAD_OF_BROWSER);
    expect(formatAge(-3600)).toBe(AHEAD_OF_BROWSER);
  });

  test("ordinary clock jitter is clamped rather than announced", () => {
    // A minute of skew between two machines is normal and must not put a scary
    // sentence on the page.
    expect(formatAge(-60)).toBe("0s ago");
    expect(formatAge(-1)).toBe("0s ago");
  });

  test("the second/minute boundary", () => {
    expect(formatAge(0)).toBe("0s ago");
    expect(formatAge(44)).toBe("44s ago");
    expect(formatAge(45)).toBe("1m ago");
  });

  test("minutes never round up to sixty", () => {
    // `Math.round(3599 / 60)` is 60, and "60m ago" beside "1h 0m ago" reads as
    // two different times. The `min(59, …)` is what prevents it.
    expect(formatAge(3599)).toBe("59m ago");
  });

  test("the minute/hour and hour/day boundaries", () => {
    expect(formatAge(3600)).toBe("1h 0m ago");
    expect(formatAge(86_399)).toBe("23h 59m ago");
    expect(formatAge(86_400)).toBe("1d ago");
  });
});

describe("formatAgeShort", () => {
  test("drops the `ago`", () => {
    expect(formatAgeShort(720)).toBe("12m old");
  });

  test("passes the clock-disagreement literal through untouched", () => {
    // "timestamp is ahead of this browser old" would be nonsense.
    expect(formatAgeShort(-3600)).toBe(AHEAD_OF_BROWSER);
  });
});

describe("formatDepth", () => {
  test("switches units at exactly one inch", () => {
    // 25.3 / 25.4 = 0.996 — still millimetres. This is the boundary the
    // docblock names as the one a rewrite gets wrong.
    expect(formatDepth(25.3)).toEqual({ value: "25", unit: "mm" });
    expect(formatDepth(25.4)).toEqual({ value: "1.0", unit: "in" });
  });

  test("the two borrowed thresholds render the way the page shows them", () => {
    expect(formatDepth(10)).toEqual({ value: "10", unit: "mm" });
    expect(formatDepth(150)).toEqual({ value: "5.9", unit: "in" });
  });

  test("absence is null, and zero is a reading", () => {
    // ⚠️ The rule the ingest layer was breaking upstream: a sensor that
    // published nothing is not a sensor reporting a dry street.
    expect(formatDepth(null)).toBeNull();
    expect(formatDepth(undefined)).toBeNull();
    expect(formatDepth(0)).toEqual({ value: "0", unit: "mm" });
  });

  test("a faulted negative depth keeps its digits", () => {
    // −466 mm is not a depth and the UI says so elsewhere. The number itself is
    // the evidence the instrument is broken, so it is never blanked or zeroed.
    expect(formatDepth(-466)).toEqual({ value: "-466", unit: "mm" });
  });
});

describe("depthText", () => {
  test("says unknown rather than zero", () => {
    expect(depthText(null)).toBe("unknown");
    expect(depthText(0)).toBe("0 mm");
  });
});

describe("frameUrl", () => {
  test("keys the cache buster on the reading, never the clock", () => {
    // `Date.now()` here re-downloads every still on every render, and with a
    // one-second age ticker on the page that is every camera, once a second.
    const a = frameUrl("https://x/f.jpg", "2026-08-05T12:00:00Z");
    const b = frameUrl("https://x/f.jpg", "2026-08-05T12:00:00Z");
    expect(a).toBe(b);
    expect(frameUrl("https://x/f.jpg", "2026-08-05T12:01:00Z")).not.toBe(a);
  });

  test("respects an existing query string", () => {
    expect(frameUrl("https://x/f.jpg?a=1", "T")).toBe("https://x/f.jpg?a=1&t=T");
    expect(frameUrl("https://x/f.jpg", "T")).toBe("https://x/f.jpg?t=T");
  });

  test("encodes the timestamp", () => {
    expect(frameUrl("https://x/f.jpg", "2026-08-05T12:00:00+00:00")).toContain(
      "%2B00%3A00",
    );
  });
});
