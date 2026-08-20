/**
 * The level and severity ramps.
 *
 * ⚠️ **Most of what matters here is enforced by `tsc`, not by this file.** Every
 * lookup is an exhaustive `Record<Level, …>` / `Record<Severity, …>`, so adding
 * a member to `models.Level` and not to `LEVELS` fails `next build`. That is the
 * strongest guarantee available and it needs no test.
 *
 * What a compiler cannot see is the **colour a rest state takes**, which is
 * the never-safe rule and is a string. `LEVEL_EDGE.clear = "border-l-[var(--wl-clear)]"`
 * typechecks perfectly and puts a reassuring green beside the wordmark and the
 * freshness signal — the one corner where a green rest state reads as
 * "conditions are fine" no matter what the words say. So the ramps are asserted
 * as substrings.
 */
import { describe, expect, test } from "vitest";

import {
  DRILL_LEVELS,
  isLevel,
  LEVEL_ALERT_BLOCK,
  LEVEL_EDGE,
  LEVEL_PANEL_BG,
  LEVEL_RANK,
  LEVEL_RAT,
  LEVEL_RAT_LOOP,
  LEVEL_TEXT,
  LEVELS,
} from "../src/lib/levels";
import {
  depthBand,
  DEPTH_BANDS,
  DEPTH_BAND_LABEL,
  DEPTH_BAND_PILL,
  DEPTH_BAND_PIN,
  DEPTH_BAND_RANK,
} from "../src/lib/depth-band";

/** Any token that means "clear" or "live" — the greens the never-safe rule bans. */
const REASSURING = /--wl-clear|--wl-live/;

describe("⚠️ the never-safe rule — the ramp starts at watch", () => {
  test("LEVEL_EDGE.clear is a neutral border, never the green", () => {
    // This replaced `LEVEL_ACCENT`, which differed only in having a green
    // `clear` — precisely the token somebody reaches for by mistake.
    expect(LEVEL_EDGE.clear).toBe("border-l-border");
    expect(LEVEL_EDGE.clear).not.toMatch(REASSURING);
  });

  test("LEVEL_PANEL_BG.clear is the ordinary card ground", () => {
    expect(LEVEL_PANEL_BG.clear).toBe("bg-card");
    expect(LEVEL_PANEL_BG.clear).not.toMatch(REASSURING);
  });

  test("LEVEL_TEXT.clear is ordinary ink", () => {
    // This record exists partly so the rule survives the next call site: the
    // obvious implementation of "colour the headline by level" is an inline map,
    // and an inline map is where somebody writes the green without having read
    // the never-safe rule.
    expect(LEVEL_TEXT.clear).toBe("text-foreground");
    expect(LEVEL_TEXT.clear).not.toMatch(REASSURING);
  });

  test("the three warning levels DO take the ramp on all three records", () => {
    // The other half. Dropping the rest state must not flatten the whole ramp —
    // losing it entirely was a regression once already.
    for (const level of ["watch", "warning", "emergency"] as const) {
      expect(LEVEL_EDGE[level]).toContain(`--wl-${level}`);
      expect(LEVEL_TEXT[level]).toContain(`--wl-${level}`);
      expect(LEVEL_PANEL_BG[level]).not.toBe("bg-card");
    }
  });

  test("⚠️ LEVEL_ALERT_BLOCK is deliberately NOT held to this", () => {
    // Recorded rather than left to be discovered by someone who adds it to the
    // loop above. This record's `clear` entry does carry `--wl-clear`, and it is
    // unreachable in practice: an `alerts` row only ever opens at watch or
    // higher, so there is no clear-level alert block to render. It is a
    // defensive entry in an exhaustive Record, not a rest state on the page.
    expect(LEVEL_ALERT_BLOCK.clear).toContain("--wl-clear");
  });
});

describe("the level records are exhaustive", () => {
  test.each([
    ["LEVEL_EDGE", LEVEL_EDGE],
    ["LEVEL_PANEL_BG", LEVEL_PANEL_BG],
    ["LEVEL_TEXT", LEVEL_TEXT],
    ["LEVEL_RAT", LEVEL_RAT],
    ["LEVEL_RAT_LOOP", LEVEL_RAT_LOOP],
    ["LEVEL_ALERT_BLOCK", LEVEL_ALERT_BLOCK],
    ["LEVEL_RANK", LEVEL_RANK],
  ])("%s covers every level exactly once", (_name, record) => {
    expect(Object.keys(record).sort()).toEqual([...LEVELS].sort());
  });
});

describe("LEVEL_RANK", () => {
  test("is monotonic in the order LEVELS declares", () => {
    const ranks = LEVELS.map((l) => LEVEL_RANK[l]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(LEVELS.length);
  });
});

describe("the rat images", () => {
  test("every level has both a still and a loop", () => {
    // ⚠️ Both sets are required. The stills are what a `prefers-reduced-motion`
    // reader sees and what stops an escalation showing an empty box mid-fetch;
    // the loops carry the tempo half of the shrinking-character rule. Dropping either breaks two
    // things at once.
    for (const level of LEVELS) {
      expect(LEVEL_RAT[level]).toBe(`/rat/rat-${level}.webp`);
      expect(LEVEL_RAT_LOOP[level]).toBe(`/rat/rat-${level}-loop.webp`);
    }
  });

  test("a still and its loop are never the same file", () => {
    for (const level of LEVELS) {
      expect(LEVEL_RAT[level]).not.toBe(LEVEL_RAT_LOOP[level]);
    }
  });
});

describe("DRILL_LEVELS", () => {
  test("⚠️ includes `clear`, because cancelling a drill IS a clear drill", () => {
    // The menu filters it out of the three escalations and shows it below a rule
    // as "Cancel drill". Keeping one source of truth here is what makes a level
    // added to LEVELS arrive in the menu automatically.
    expect(DRILL_LEVELS).toContain("clear");
  });

  test("offers every level", () => {
    expect([...DRILL_LEVELS].sort()).toEqual([...LEVELS].sort());
  });
});

describe("the type guards", () => {
  test("isLevel accepts the four and rejects everything else", () => {
    for (const l of LEVELS) expect(isLevel(l)).toBe(true);
    for (const bad of ["flooded", "", null, undefined, 3, {}]) {
      expect(isLevel(bad)).toBe(false);
    }
  });

});

describe("the depth band", () => {
  // The two borrowed thresholds, passed in exactly as every surface passes
  // them — `/api/status` is the authority and neither number is hard-coded in
  // `depth-band.ts`. These are the values `waterline/config.py` ships.
  const FLOOD = 10;
  const CURB = 150;
  const band = (mm: number | null) => depthBand(mm, FLOOD, CURB);

  test("the records are exhaustive", () => {
    for (const record of [
      DEPTH_BAND_PILL,
      DEPTH_BAND_PIN,
      DEPTH_BAND_RANK,
      DEPTH_BAND_LABEL,
    ]) {
      expect(Object.keys(record).sort()).toEqual([...DEPTH_BANDS].sort());
    }
  });

  test("DEPTH_BAND_RANK is monotonic in declaration order", () => {
    const ranks = DEPTH_BANDS.map((b) => DEPTH_BAND_RANK[b]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(DEPTH_BANDS.length);
  });

  // ⚠️ **Both boundaries are `>=`, not `>`.** A reading of exactly 10 mm IS
  // FloodNet's flood event and exactly 150 mm IS curb height; excluding the
  // boundary would put the one reading that sits precisely on a borrowed
  // threshold on the quieter side of it.
  test("the flood boundary is inclusive", () => {
    expect(band(FLOOD - 0.01)).toBe("none");
    expect(band(FLOOD)).toBe("flood");
    expect(band(FLOOD + 0.01)).toBe("flood");
  });

  test("the curb boundary is inclusive", () => {
    expect(band(CURB - 0.01)).toBe("flood");
    expect(band(CURB)).toBe("curb");
    expect(band(CURB + 0.01)).toBe("curb");
  });

  test("no depth is `none`, and so is a real zero", () => {
    expect(band(null)).toBe("none");
    expect(band(0)).toBe("none");
    // ⚠️ They render the same colour and mean different things — an unpaired
    // camera versus a sensor reporting no water. What separates them is the
    // em-dash versus the digits, never the band.
  });

  test("⚠️ `none` is not painted with a reassuring green", () => {
    // A depth under 10 mm is not a statement that anywhere is safe. This
    // scale has a warning end and no reassuring end, deliberately — see
    // `depth-band.ts`.
    expect(DEPTH_BAND_PILL.none).not.toMatch(REASSURING);
    expect(DEPTH_BAND_PIN.none).not.toMatch(REASSURING);
  });

  test("⚠️ no band anywhere on the scale is green", () => {
    for (const b of DEPTH_BANDS) {
      expect(DEPTH_BAND_PILL[b]).not.toMatch(REASSURING);
      expect(DEPTH_BAND_PIN[b]).not.toMatch(REASSURING);
    }
  });

  // The thresholds are the caller's, so a deployment that moved them moves
  // the bands with it. This is what stops a literal creeping back in.
  test("the boundaries follow the thresholds it is given", () => {
    expect(depthBand(25, 50, 300)).toBe("none");
    expect(depthBand(50, 50, 300)).toBe("flood");
    expect(depthBand(300, 50, 300)).toBe("curb");
  });
});
