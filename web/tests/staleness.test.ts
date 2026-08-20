/**
 * Three clocks, three thresholds, and only the first measures whether Fluud
 * is healthy.
 *
 * ⚠️ **The mistake this file exists to prevent has already been made twice.** A
 * camera's `observed_at` is stamped by *our poller*, so its age is the frozen-poller rule.
 * A gauge's is NOAA's or USGS's publication time and a sensor's is FloodNet's —
 * both keep ticking whether or not we are alive, and both run far behind by
 * design. The first draft of `harbor-baseline.tsx` judged gauges on the camera
 * numbers and rendered three of four healthy USGS sites permanently amber. An
 * indicator that is always warning is an indicator nobody reads, which costs
 * the real signal on the day a gauge actually dies.
 *
 * The numbers are measured rather than chosen, and the measurements are in
 * `staleness.ts` beside each constant. These assertions pin the *shape*: which
 * boundary is inclusive, and that a healthy instrument on each clock reads
 * fresh.
 */
import { describe, expect, test } from "vitest";

import { NWS_COLD_AFTER_S } from "../src/lib/nws";
import {
  cadenceOf,
  DEAD_AFTER_S,
  freshnessOf,
  GAUGE_DEAD_AFTER_S,
  GAUGE_STALE_AFTER_S,
  gaugeFreshnessOf,
  POLL_SECONDS,
  POLL_WINDOW_S,
  SENSOR_DEAD_AFTER_S,
  SENSOR_STALE_AFTER_S,
  sensorFreshnessOf,
  STALE_AFTER_S,
  storeColdAfterS,
  tickColdAfterS,
} from "../src/lib/staleness";

/** Every clock is judged the same way; only the numbers differ. */
const CLOCKS = [
  { name: "camera", of: freshnessOf, stale: STALE_AFTER_S, dead: DEAD_AFTER_S },
  {
    name: "gauge",
    of: gaugeFreshnessOf,
    stale: GAUGE_STALE_AFTER_S,
    dead: GAUGE_DEAD_AFTER_S,
  },
  {
    name: "sensor",
    of: sensorFreshnessOf,
    stale: SENSOR_STALE_AFTER_S,
    dead: SENSOR_DEAD_AFTER_S,
  },
];

describe.each(CLOCKS)("$name freshness", ({ of, stale, dead }) => {
  test("the boundaries are inclusive at the threshold", () => {
    expect(of(stale - 1)).toBe("fresh");
    expect(of(stale)).toBe("stale");
    expect(of(dead - 1)).toBe("stale");
    expect(of(dead)).toBe("dead");
  });

  test("a brand new reading is fresh and an ancient one is dead", () => {
    expect(of(0)).toBe("fresh");
    expect(of(dead * 10)).toBe("dead");
  });

  test("stale sits below dead", () => {
    expect(stale).toBeLessThan(dead);
  });
});

describe("the three clocks are genuinely different", () => {
  test("no two share a stale threshold", () => {
    // If these ever collapse to one number, the three helpers are one helper and
    // the gauges' regression comes back.
    const stales = [STALE_AFTER_S, GAUGE_STALE_AFTER_S, SENSOR_STALE_AFTER_S];
    expect(new Set(stales).size).toBe(3);
  });

  test("they are ordered camera < sensor < gauge", () => {
    // Our own poller is the tightest, FloodNet is looser, the operators loosest.
    expect(STALE_AFTER_S).toBeLessThan(SENSOR_STALE_AFTER_S);
    expect(SENSOR_STALE_AFTER_S).toBeLessThan(GAUGE_STALE_AFTER_S);
  });
});

describe("the measured lags all read fresh", () => {
  test("a USGS gauge 81 minutes behind is a HEALTHY gauge", () => {
    // Measured over 48 hours, all four sites: newest published point runs 21 to
    // 81 minutes behind wall clock while sampling every 15 minutes exactly.
    // This is the assertion the permanently-amber regression would fail.
    expect(gaugeFreshnessOf(81 * 60)).toBe("fresh");
  });

  test("a FloodNet sensor 48 minutes behind is a HEALTHY sensor", () => {
    // Measured 2026-08-05 across all 425 deployments in one request:
    // p50 1.0 min, p90 2.2, p99 22.5, max 48.1.
    expect(sensorFreshnessOf(49 * 60)).toBe("fresh");
  });

  test("⚠️ but on the CAMERA clock both of those would read dead", () => {
    // The whole reason three functions exist. Roughly one sensor in twenty
    // would render amber on every load and the worst few red.
    expect(freshnessOf(49 * 60)).toBe("dead");
    expect(freshnessOf(81 * 60)).toBe("dead");
  });

  test("a 2016 USGS reading reaches the page dead", () => {
    // USGS returns `01406710 Raritan River at South Amboy` under
    // `siteStatus=active` with a most recent value from 2016. Never dropped,
    // never shown as current.
    expect(gaugeFreshnessOf(10 * 365 * 24 * 3600)).toBe("dead");
  });
});

describe("cross-file constants", () => {
  test("the camera stale window is one quiet window plus slack", () => {
    // Pins the value the page uses...
    expect(STALE_AFTER_S).toBe(1200);
    // ...and pins WHERE it comes from. A literal alone would let the cadence
    // move underneath it again, which is exactly what happened on 2026-08-20.
    // `parity.test.ts` binds it to the Python cadence and to the replay bound.
    expect(STALE_AFTER_S).toBe(POLL_WINDOW_S + 300);
  });

  test("the sensor stale window is the hour watch.py uses", () => {
    // ⚠️ `check_watch.py` asserts the Python half under a comment saying "the
    // same hour `staleness.ts` calls a sensor stale" — and it cannot see this
    // file. `parity.test.ts` is what actually binds the two.
    expect(SENSOR_STALE_AFTER_S).toBe(3600);
  });

  test("the poller is called cold after three missed WINDOWS", () => {
    // One missed run is a slow cron; three is a stopped loop. ⚠️ Windows, not
    // ticks — the poller only ticks every POLL_SECONDS while a storm is on, and
    // sizing this against that cadence is what made the banner permanent.
    expect(tickColdAfterS()).toBe(2700);
    expect(tickColdAfterS()).toBe(3 * POLL_WINDOW_S);
  });

  test("⚠️ every threshold clears the QUIET cadence, not just the storm one", () => {
    // The regression this whole group exists for. Each of these fired
    // permanently at a 15-minute cadence while the poller was perfectly healthy.
    expect(STALE_AFTER_S).toBeGreaterThan(POLL_WINDOW_S);
    expect(DEAD_AFTER_S).toBeGreaterThan(POLL_WINDOW_S);
    expect(tickColdAfterS()).toBeGreaterThan(POLL_WINDOW_S);
    expect(storeColdAfterS()).toBeGreaterThan(POLL_WINDOW_S);
    expect(NWS_COLD_AFTER_S).toBeGreaterThan(POLL_WINDOW_S);
  });

  test("a cadence off the wire overrides the compiled default", () => {
    // The whole reason the cadences are on the wire: the schedule is a Railway
    // cron expression too, and a deployment can poll on one this bundle never
    // knew about.
    const slow = cadenceOf({ pollSeconds: 60, pollWindowS: 3600 });
    expect(tickColdAfterS(slow)).toBe(3 * 3600);
    expect(storeColdAfterS(slow)).toBe(3 * 3600);
  });

  test("⚠️ a missing or zero cadence falls back instead of reaching a threshold", () => {
    // A zero would call every poller frozen the instant the server answered.
    expect(cadenceOf(null)).toEqual({
      pollSeconds: POLL_SECONDS,
      pollWindowS: POLL_WINDOW_S,
    });
    expect(cadenceOf({ pollSeconds: 0, pollWindowS: 0 })).toEqual({
      pollSeconds: POLL_SECONDS,
      pollWindowS: POLL_WINDOW_S,
    });
    expect(tickColdAfterS(cadenceOf(undefined))).toBeGreaterThan(0);
  });

  test("⚠️ sensor dead sits strictly inside floodnet.MAX_AGE (6h)", () => {
    // Past the depth query's window a sensor has no row in the payload at all
    // and renders as never-reported. Setting dead at the boundary would make
    // the red band unreachable, so a dying sensor could never be seen dying.
    expect(SENSOR_DEAD_AFTER_S).toBeLessThan(6 * 3600);
  });
});
