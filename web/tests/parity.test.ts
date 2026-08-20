/**
 * ⚠️ **The cross-language check, and the gap nothing else in this repo can
 * close.**
 *
 * Six numbers are written down twice, in two languages, on purpose. Each carries
 * a comment saying it must stay in step with its twin. Until this file existed,
 * **nothing could see either half moving** — the sharpest case being
 * `check_watch.py`, which asserts `watch.SENSOR_STALE_AFTER_S == 3600` under a
 * comment naming `staleness.ts`, and which stays green if `staleness.ts` is
 * edited to 1800. A Python script cannot read a `.ts` file.
 *
 * ## Why the web side drives
 *
 * An earlier draft had `scripts/check_parity.py` shelling Node with a custom
 * ESM loader. Vitest already resolves the TypeScript, so that version would have
 * existed only to keep the file under `scripts/` — and it would have had to
 * carry the twenty-line resolve hook the suite deleted. So the assertions live
 * here and `scripts/parity_constants.py` only prints.
 *
 * ⚠️ **This does not break the rule `check_escalation.py` follows.** That script
 * deliberately stays free of the web tree — it hand-copies `LANDING_QUOTE`
 * rather than reading the `.tsx` — and that rule is about a *Python safety
 * script* not depending on the UI. Nothing says the inverse, and the inverse is
 * the cheap direction.
 *
 * ⚠️ **This is the one test here that is not hermetic.** It needs `python3` on
 * the path. It skips with a named reason rather than failing, so a UI-only
 * contributor gets an explanation instead of a red suite.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  clampWindow,
  MAX_WINDOW_MIN,
  MIN_WINDOW_MIN,
  PRESET_MINUTES,
  RETENTION_DAYS,
} from "../src/lib/depth-window";
import { formatDepth } from "../src/lib/format";
import { FAR_M, haversineM } from "../src/lib/geo/distance";
import { NWS_COLD_AFTER_S } from "../src/lib/nws";
import {
  DEAD_AFTER_S,
  POLL_SECONDS,
  POLL_WINDOW_S,
  SENSOR_DEAD_AFTER_S,
  SENSOR_STALE_AFTER_S,
  STALE_AFTER_S,
  storeColdAfterS,
  tickColdAfterS,
} from "../src/lib/staleness";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/parity_constants.py", import.meta.url),
);

interface LatLon {
  lat: number;
  lon: number;
}

interface Parity {
  SENSOR_STALE_AFTER_S: number;
  REPLAY_MAX_AGE_S: number;
  FLOODNET_MAX_AGE_S: number;
  POLL_SECONDS: number;
  POLL_WINDOW_S: number;
  MAX_PAIR_M: number;
  GOLD_PAIR_M: number;
  flood_event_mm: number;
  curb_height_mm: number;
  IMPLAUSIBLE_MM: number;
  IMPLAUSIBLE_MIN_MM: number;
  PRESET_MINUTES: number[];
  RETENTION_DAYS: number;
  MIN_WINDOW_MIN: number;
  MAX_WINDOW_MIN: number;
  clamp_probe_min: number[];
  clamp_probe_out: number[];
  disclaimer_en: string;
  disclaimer_es: string;
  depth_probe_mm: number[];
  depth_renders_as_mm: boolean[];
  haversine: { a: LatLon; b: LatLon; m: number }[];
}

/**
 * ⚠️ **Two failures wear one face here, and only one of them may skip.**
 *
 * No `python3` on PATH is a fresh clone with no Python installed, and skipping
 * is right — the TypeScript half still has to pass on its own.
 *
 * A `python3` that IS there and could not run the script is something else
 * entirely: the script is broken, and every cross-language assertion in this
 * repo silently stops running. That happened on 2026-08-20 — an import added to
 * `parity_constants.py` pulled `fastapi`, which is not installed in the bare
 * interpreter this spawns, and seventeen assertions turned themselves off in the
 * same commit that made one of them load-bearing for the first time. Nothing
 * went red. This is the difference being made visible.
 */
class ParityScriptBroken extends Error {}

function readPython(): Parity | null {
  let out: string;
  try {
    out = execFileSync("python3", [SCRIPT], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    // ENOENT is the interpreter missing. Anything else means it ran and failed.
    if (err.code === "ENOENT") return null;
    throw new ParityScriptBroken(
      "`python3 scripts/parity_constants.py` FAILED. Every cross-language " +
        "constant in this repo is now unchecked — fix the script rather than " +
        "letting this suite skip.\n\n" +
        (err.stderr ?? err.message ?? ""),
    );
  }
  try {
    return JSON.parse(out) as Parity;
  } catch {
    throw new ParityScriptBroken(
      "`python3 scripts/parity_constants.py` ran but did not print JSON. " +
        "Something in it is writing to stdout.\n\n" +
        out.slice(0, 500),
    );
  }
}

const py = readPython();

// `describe.skip` rather than a silent pass: a skipped suite is visible in the
// run output and says which half was unavailable. Reached only when `python3`
// itself is absent — a broken script threw above.
const suite = py ? describe : describe.skip;

if (!py) {
  console.warn(
    "parity.test.ts SKIPPED — no `python3` on PATH. " +
      "The Python half of the cross-language constants is unchecked in this run.",
  );
}

suite("staleness constants match across the language boundary", () => {
  test("⚠️ the sensor stale hour is one hour on BOTH sides", () => {
    // watch.SENSOR_STALE_AFTER_S ↔ staleness.SENSOR_STALE_AFTER_S.
    // What a subscriber is told and what the page draws have to be one
    // judgement about one instrument.
    expect(SENSOR_STALE_AFTER_S).toBe(py!.SENSOR_STALE_AFTER_S);
  });

  test("⚠️ the replay bound is no LOOSER than the camera stale window", () => {
    // The failure this protects against is a replayed warning arriving on a page
    // that still calls its own readings fresh — so what matters is the
    // direction, not equality.
    //
    // ⚠️ **This was `toBe` until 2026-08-20 and the equality was the wrong
    // shape.** The two numbers were both "comfortably longer than the 60s poll
    // cadence" and therefore happened to coincide at 300. When the poller went
    // to a fifteen-minute quiet window `STALE_AFTER_S` had to rise to 1200, and
    // an equality would have dragged `rat.REPLAY_MAX_AGE_S` up with it —
    // quadrupling how old a warning may be and still be shouted at a late
    // arrival, to satisfy a test, in a feature that is currently dormant.
    // Tighter replay is always safe; looser replay is the bug.
    expect(py!.REPLAY_MAX_AGE_S).toBeLessThanOrEqual(STALE_AFTER_S);
  });

  test("⚠️ the UI knows the cadence the poller actually runs on", () => {
    // Everything in the next test is a multiple of one of these, so this is the
    // assertion the rest of them rest on.
    expect(POLL_SECONDS).toBe(py!.POLL_SECONDS);
    expect(POLL_WINDOW_S).toBe(py!.POLL_WINDOW_S);
  });

  test("⚠️ every staleness threshold clears the QUIET poll cadence", () => {
    // THE regression the two cadence exports exist to prevent, asserted as a
    // RELATIONSHIP rather than as literals on purpose: the numbers may move,
    // but a threshold below the cadence is always a page calling a healthy
    // poller frozen.
    //
    // On 2026-08-20 the poller went from a 60s loop to a 15-minute scheduled
    // window so Neon could suspend between runs. Every number below had been
    // tuned against that loop — `tickColdAfterS` was literally "three poll
    // intervals" — and all of them broke in the same instant: cards reading
    // stale for 10 of every 15 minutes, a permanent *the poller is frozen*
    // banner, and an NWS panel calling its feed cold on a perfectly good read.
    const quiet = py!.POLL_WINDOW_S;
    expect(STALE_AFTER_S).toBeGreaterThan(quiet);
    expect(DEAD_AFTER_S).toBeGreaterThan(quiet);
    expect(tickColdAfterS()).toBeGreaterThan(quiet);
    expect(storeColdAfterS()).toBeGreaterThan(quiet);
    expect(NWS_COLD_AFTER_S).toBeGreaterThan(quiet);
  });

  test("⚠️ the storm cadence is the faster of the two, on both sides", () => {
    // `run_window` escalates to POLL_SECONDS while a witness says something is
    // happening. Inverted, the loop would slow DOWN in a flood.
    expect(py!.POLL_SECONDS).toBeLessThan(py!.POLL_WINDOW_S);
    expect(POLL_SECONDS).toBeLessThan(POLL_WINDOW_S);
  });

  test("⚠️ sensor DEAD sits strictly inside floodnet.MAX_AGE", () => {
    // Past the depth query's window a sensor has no row in the payload at all
    // and renders as never-reported. Setting dead at the boundary would leave
    // the red band unreachable — the mitigation would exist and never fire.
    expect(SENSOR_DEAD_AFTER_S).toBeLessThan(py!.FLOODNET_MAX_AGE_S);
    expect(SENSOR_STALE_AFTER_S).toBeLessThan(py!.FLOODNET_MAX_AGE_S);
  });
});

suite("distance constants", () => {
  test("FAR_M is cameras.MAX_PAIR_M, borrowed rather than invented", () => {
    expect(FAR_M).toBe(py!.MAX_PAIR_M);
  });

  test("and the gold tier is tighter than the operating tier", () => {
    // GOLD_PAIR_M gates what may become a training label; MAX_PAIR_M gates what
    // may be operated on. Collapsing them would let a silver pair teach the
    // model.
    expect(py!.GOLD_PAIR_M).toBeLessThan(py!.MAX_PAIR_M);
  });
});

suite("the two borrowed thresholds", () => {
  test("are the numbers the UI fixtures assume", () => {
    // These reach the page over the wire rather than as a TS constant, so they
    // cannot drift — this pins that the fixtures in the other test files are
    // exercising the real figures rather than invented ones.
    expect(py!.flood_event_mm).toBe(10);
    expect(py!.curb_height_mm).toBe(150);
  });

  test("and both sit inside the plausibility band", () => {
    // If the band ever closed over `flood_event_mm`, every real flood reading
    // would be judged a fault and the depth signal would be lost silently.
    // `check_escalation.py` asserts this too; it is cheap to hold twice.
    expect(py!.IMPLAUSIBLE_MIN_MM).toBeLessThan(py!.flood_event_mm);
    expect(py!.flood_event_mm).toBeLessThan(py!.IMPLAUSIBLE_MM);
    expect(py!.curb_height_mm).toBeLessThan(py!.IMPLAUSIBLE_MM);
  });
});

suite("haversine — two implementations, one right answer", () => {
  test("⚠️ agrees with cameras.haversine_m to within a millimetre", () => {
    // `waterline/CLAUDE.md` argues this duplication is NOT a second-authority
    // violation, because a haversine is arithmetic rather than a judgement and
    // because sharing the server's function would mean putting the reader's
    // coordinate on the wire — the one thing the address feature refuses.
    // This is the assertion that keeps that argument true.
    for (const { a, b, m } of py!.haversine) {
      expect(haversineM(a, b)).toBeCloseTo(m, 3);
    }
  });
});

suite("the localised disclaimer", () => {
  // ⚠️ The footer stopped rendering the disclaimer on 2026-08-06 (owner's
  // instruction), so the two tests that pinned `FALLBACK_DISCLAIMER` out of
  // `site-footer.tsx` went with it. The string itself is still served — it
  // rides `/api/status` and closes every warning email — so its translation
  // property is still worth holding.
  test("the Spanish disclaimer is a real translation, not the same bytes", () => {
    // The same rule `_depth_phrase` is held to in `check_escalation.py`: this
    // cannot judge a translation, only say the two languages are not identical.
    expect(py!.disclaimer_es).not.toBe(py!.disclaimer_en);
  });
});

suite("the depth unit boundary", () => {
  test("⚠️ both languages switch units at the same millimetre", () => {
    // ⚠️ Compared as a UNIT CHOICE, never as a rendered string. The two
    // deliberately print differently — `agent._depth_phrase` renders whole
    // inches for prose ("about 6 inches") and `formatDepth` renders one decimal
    // for a card ("5.9"). What must not diverge is where they change over,
    // because that is the same claim about the same water in two places.
    const { depth_probe_mm: probe, depth_renders_as_mm: wantMm } = py!;
    const gotMm = probe.map((mm) => formatDepth(mm)?.unit === "mm");
    expect(gotMm).toEqual(wantMm);
  });

  test("and the boundary is exactly one inch, on both sides", () => {
    // 25.3 / 25.4 = 0.996 — still millimetres. Named in `format.ts` as the
    // boundary a rewrite gets wrong, and in `agent._depth_phrase` as the same
    // rule in the other language.
    const at = (mm: number) => py!.depth_renders_as_mm[py!.depth_probe_mm.indexOf(mm)];
    expect(at(25.3)).toBe(true);
    expect(at(25.4)).toBe(false);
    expect(formatDepth(25.3)?.unit).toBe("mm");
    expect(formatDepth(25.4)?.unit).toBe("in");
  });
});

suite("the depth-peak window", () => {
  test("⚠️ the four presets are the same four minutes on both sides", () => {
    // `peaks.PRESET_MINUTES` ↔ `depth-window.PRESET_MINUTES`. A preset that
    // exists on one side only is a menu entry the server answers differently
    // from the label the reader pressed.
    expect([...PRESET_MINUTES]).toEqual(py!.PRESET_MINUTES);
  });

  test("⚠️ retention — and therefore the widest window — agrees", () => {
    // This is the one that matters most. `sensor_readings` is pruned at
    // `peaks.RETENTION_DAYS`, so it is the ceiling on what a window can be
    // answered for. If the UI's copy drifted ABOVE the Python one the menu
    // would offer a window the server silently narrows, and the page would
    // render a seven-day peak wearing a longer window's label — the one way
    // this feature can understate a flood.
    expect(RETENTION_DAYS).toBe(py!.RETENTION_DAYS);
    expect(MAX_WINDOW_MIN).toBe(py!.MAX_WINDOW_MIN);
    expect(MIN_WINDOW_MIN).toBe(py!.MIN_WINDOW_MIN);
  });

  test("⚠️ both clamps agree at every edge, not just on the ceiling", () => {
    // Behavioural rather than numeric, on `depth_renders_as_mm`'s model. Two
    // implementations can share a constant and still disagree about what they
    // do with 0, a negative, or a value one minute past the bound — and the
    // client's clamp is what decides which window is REQUESTED while the
    // server's decides which is ANSWERED.
    const got = py!.clamp_probe_min.map((m) => clampWindow(m));
    expect(got).toEqual(py!.clamp_probe_out);
  });
});
