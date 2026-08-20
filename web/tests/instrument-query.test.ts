/**
 * Filter, search and sort over both instrument classes.
 *
 * Two assertions in here are safety rules rather than behaviour checks, and
 * both are one character away from reversing:
 *
 *  · **`queryIsActive` must not include `origin`.** It gates `matchingSensorIds`
 *    in `map/page.tsx`, so including it drops 404 of 425 markers to 25% opacity
 *    the moment somebody types an address — the unobserved-not-clear rule broken by a search
 *    field, which makes the city look empty.
 *  · **`compareSensors` must not let a faulted 1451 mm head the list.** That is
 *    the single loudest number in the payload and it is not water. Sorting it to
 *    the bottom is a claim about the instrument; deleting it would be a claim
 *    about the street.
 */
import { describe, expect, test } from "vitest";

import {
  applyQuery,
  boroughsOf,
  compareDistance,
  DEFAULT_QUERY,
  distanceFromOrigin,
  queryIsActive,
  sensorAgeSeconds,
  sensorTotals,
} from "../src/lib/instrument-query";
import type { InstrumentQuery, Origin } from "../src/lib/instrument-query";
import { camera, sensor } from "./_fixtures";

const FLOOD_EVENT_MM = 10;
const q = (over: Partial<InstrumentQuery> = {}): InstrumentQuery => ({
  ...DEFAULT_QUERY,
  ...over,
});

/** Ave C @ 23 St, the fixture sensor's own corner. */
const ORIGIN: Origin = { lat: 40.734, lon: -73.977, label: "Ave C @ 23 St" };

const ids = (q_: InstrumentQuery, sensors = SENSORS) =>
  applyQuery(q_, [], sensors, FLOOD_EVENT_MM).map((i) => i.id);

const SENSORS = [
  sensor({ sensor_id: "deep", name: "Deep", depth_mm: 150, plausible: true }),
  sensor({ sensor_id: "shallow", name: "Shallow", depth_mm: 12, plausible: true }),
  sensor({ sensor_id: "faulted", name: "Faulted", depth_mm: 1451, plausible: false }),
  sensor({
    sensor_id: "silent",
    name: "Silent",
    depth_mm: null,
    plausible: null,
    observed_at: null,
  }),
];

describe("queryIsActive", () => {
  test("⚠️ an origin does NOT make the query active", () => {
    // The severest single assertion in this file. An origin orders; it filters
    // nothing. If this ever returns true, a typed address de-emphasises 404 of
    // 425 markers and the map stops saying "unobserved".
    expect(queryIsActive(q({ origin: ORIGIN }))).toBe(false);
  });

  test("nor does a sort key", () => {
    // Reordering a list removes nothing from it, so it cannot hide an
    // instrument from a reader.
    expect(queryIsActive(q({ sort: "distance", origin: ORIGIN }))).toBe(false);
    expect(queryIsActive(q({ sort: "name" }))).toBe(false);
  });

  test("the untouched query is inactive", () => {
    expect(queryIsActive(DEFAULT_QUERY)).toBe(false);
  });

  test("every real filter does make it active", () => {
    expect(queryIsActive(q({ search: "union" }))).toBe(true);
    expect(queryIsActive(q({ boroughs: ["Brooklyn"] }))).toBe(true);
    expect(queryIsActive(q({ watchedOnly: true }))).toBe(true);
    expect(queryIsActive(q({ reportingOnly: true }))).toBe(true);
    expect(queryIsActive(q({ overThresholdOnly: true }))).toBe(true);
    expect(queryIsActive(q({ faultsOnly: true }))).toBe(true);
    expect(queryIsActive(q({ tidalOnly: true }))).toBe(true);
  });

  test("whitespace is not a search", () => {
    expect(queryIsActive(q({ search: "   " }))).toBe(false);
  });
});

describe("compareSensors, through applyQuery", () => {
  test("⚠️ a faulted 1451 mm never heads the list", () => {
    const order = ids(q({ mode: "sensors" }));
    expect(order).toEqual(["deep", "shallow", "faulted", "silent"]);
  });

  test("faults are grouped after every plausible reading, however shallow", () => {
    // 1 mm of real water outranks 1451 mm of broken rangefinder.
    const order = ids(q({ mode: "sensors" }), [
      sensor({ sensor_id: "faulted", depth_mm: 1451, plausible: false }),
      sensor({ sensor_id: "tiny", depth_mm: 1, plausible: true }),
    ]);
    expect(order).toEqual(["tiny", "faulted"]);
  });

  test("a sensor with no reading sorts last, behind the faults", () => {
    // An absent reading is not a small one. It has nothing to rank.
    const order = ids(q({ mode: "sensors" }));
    expect(order.at(-1)).toBe("silent");
  });

  test("nothing is ever dropped by sorting", () => {
    expect(ids(q({ mode: "sensors" }))).toHaveLength(SENSORS.length);
  });
});

/**
 * ⚠️ **`compareCameras` sorted on a camera's ordinal class until that layer was
 * deleted, and the obvious replacement is VACUOUS.** `poll.tick` stamps every
 * camera in a tick with one `now`, so an `observed_at`-only comparator ranks
 * nothing at all — the "worst" control would silently stop working while still
 * appearing to sort. These assertions exist because that failure is invisible:
 * a list in payload order looks exactly like a list in a sorted order nobody
 * checked.
 */
describe("compareCameras, through applyQuery", () => {
  /** Every camera carries the SAME `observed_at`, exactly as `poll.tick`
   *  stamps them. If the tiering ever regressed to age alone this fixture is
   *  what makes it fail rather than pass by luck. */
  const STAMP = "2026-08-05T12:00:00Z";
  const CAMERAS = [
    camera({
      camera_id: "cam-faulted",
      name: "Faulted",
      observed_at: STAMP,
      depth_mm: 1451,
      depth_plausible: false,
    }),
    camera({
      camera_id: "cam-unpaired",
      name: "Unpaired",
      observed_at: STAMP,
      depth_mm: null,
      calibrated: false,
    }),
    camera({
      camera_id: "cam-shallow",
      name: "Shallow",
      observed_at: STAMP,
      depth_mm: 12,
    }),
    camera({
      camera_id: "cam-deep",
      name: "Deep",
      observed_at: STAMP,
      depth_mm: 150,
    }),
  ];
  const camIds = (over: Partial<InstrumentQuery> = {}) =>
    applyQuery(q({ mode: "cameras", ...over }), CAMERAS, [], FLOOD_EVENT_MM).map(
      (i) => i.id,
    );

  test("⚠️ deepest first, and a faulted 1451 mm never heads the list", () => {
    expect(camIds()).toEqual([
      "cam-deep",
      "cam-shallow",
      "cam-faulted",
      "cam-unpaired",
    ]);
  });

  test("⚠️ it is not vacuous when every timestamp is identical", () => {
    // The whole point. An age-only comparator returns every camera equal and
    // the array comes back in payload order — which is what this asserts is
    // NOT happening.
    expect(camIds()).not.toEqual(CAMERAS.map((c) => c.camera_id));
  });

  test("a camera with no depth sorts last, behind the faults", () => {
    // An unpaired camera has no ground truth. Absence is not a small reading.
    expect(camIds().at(-1)).toBe("cam-unpaired");
  });

  test("nothing is ever dropped by sorting", () => {
    expect(camIds()).toHaveLength(CAMERAS.length);
  });
});

describe("the faults filter", () => {
  test("⚠️ uses `plausible === false`, never `!plausible`", () => {
    // `plausible` is null on a sensor that has never reported, and an absent
    // reading is not a fault — there is no number for the instrument to have
    // got wrong. `!plausible` would sweep every silent sensor into the fault
    // filter and invent 35 broken instruments.
    expect(ids(q({ mode: "sensors", faultsOnly: true }))).toEqual(["faulted"]);
  });
});

/**
 * The tidal facet, added 2026-08-15.
 *
 * ⚠️ **It is the only filter here that narrows on what an instrument IS rather
 * than on what it is reporting**, and the two tests below are the two halves of
 * that. A tidal deployment sees coastal surge and the rest see stormwater; the
 * flag is also the gate on the harbor witness in `waterline/watch.py`, where
 * the Battery corroborates a tidal sensor and corroborates nothing else.
 *
 * ⚠️ **Being a property of the deployment is what makes the bare `!` correct
 * here** — `tidal` is a plain boolean on every row, unlike `plausible`, which
 * is null on a sensor that has never reported. The second test is what would
 * catch somebody "harmonising" the two predicates.
 */
describe("the tidal filter", () => {
  test("keeps only the tidally influenced deployments", () => {
    const order = ids(q({ mode: "sensors", tidalOnly: true }), [
      sensor({ sensor_id: "coastal", tidal: true }),
      sensor({ sensor_id: "inland", tidal: false }),
    ]);
    expect(order).toEqual(["coastal"]);
  });

  test("⚠️ it narrows on the deployment, never on the reading", () => {
    // A tidal sensor that has never reported is still tidal, and a tidal
    // sensor with a faulted rangefinder is still tidal. Dropping either would
    // make this a filter about water wearing the name of a filter about
    // instruments — and would quietly hide the coastal deployments a reader is
    // most likely to be looking for during a surge.
    const order = ids(q({ mode: "sensors", tidalOnly: true }), [
      sensor({ sensor_id: "coastal-silent", tidal: true, observed_at: null,
               depth_mm: null, flood_detected: null, plausible: null }),
      sensor({ sensor_id: "coastal-faulted", tidal: true, depth_mm: 1451,
               plausible: false }),
      sensor({ sensor_id: "inland", tidal: false }),
    ]);
    expect(order.sort()).toEqual(["coastal-faulted", "coastal-silent"]);
  });
});

describe("the over-threshold filter", () => {
  test("requires plausibility as well as magnitude", () => {
    // A faulted rangefinder is over every threshold there is. Letting it
    // satisfy "over threshold" puts the loudest wrong number at the top of the
    // filter whose whole purpose is finding real water.
    expect(ids(q({ mode: "sensors", overThresholdOnly: true }))).toEqual([
      "deep",
      "shallow",
    ]);
  });

  test("the threshold is the borrowed one that was passed in, not a local copy", () => {
    const over = applyQuery(
      q({ mode: "sensors", overThresholdOnly: true }),
      [],
      SENSORS,
      100, // a different flood-event figure
    ).map((i) => i.id);
    expect(over).toEqual(["deep"]);
  });
});

describe("distance", () => {
  test("compareDistance sorts an absent distance last", () => {
    // `compareAge`'s rule applied to a second quantity. A sensor with no usable
    // coordinate must not head a list whose whole claim is "closest to you".
    expect([300, null, 100].sort(compareDistance)).toEqual([100, 300, null]);
  });

  test("distanceFromOrigin is null without an origin", () => {
    expect(distanceFromOrigin(null, 40.734, -73.977)).toBeNull();
  });

  test("⚠️ null outside NYC_BOUNDS, so no NaN can reach a comparator", () => {
    // A NaN in a comparator is non-transitive and `Array.prototype.sort` is free
    // to produce any permutation from one. Three surfaces read that array, so
    // the failure is an arbitrary order rather than a wrong number.
    expect(distanceFromOrigin(ORIGIN, 0, 0)).toBeNull();
    expect(distanceFromOrigin({ lat: 0, lon: 0, label: "x" }, 40.734, -73.977))
      .toBeNull();
    expect(distanceFromOrigin(ORIGIN, Number.NaN, -73.977)).toBeNull();
  });

  test("orders nearest first when an origin is set", () => {
    const near = sensor({ sensor_id: "near", lat: 40.7345, lon: -73.9775 });
    const far = sensor({ sensor_id: "far", lat: 40.68, lon: -73.94 });
    expect(
      ids(q({ mode: "sensors", sort: "distance", origin: ORIGIN }), [far, near]),
    ).toEqual(["near", "far"]);
  });

  test("⚠️ `sort: distance` with no origin is total, not an arbitrary order", () => {
    // Guard 1 of the three. It falls through to the mode's own comparator
    // rather than throwing or shuffling.
    expect(ids(q({ mode: "sensors", sort: "distance", origin: null }))).toEqual([
      "deep",
      "shallow",
      "faulted",
      "silent",
    ]);
  });

  test("works in camera mode too — a distance needs no reinterpretation", () => {
    const a = camera({ camera_id: "a", lat: 40.7345, lon: -73.9775 });
    const b = camera({ camera_id: "b", lat: 40.68, lon: -73.94 });
    const order = applyQuery(
      q({ mode: "cameras", sort: "distance", origin: ORIGIN }),
      [b, a],
      [],
      FLOOD_EVENT_MM,
    ).map((i) => i.id);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("search", () => {
  test("is case-insensitive across name, borough, nta and id", () => {
    expect(ids(q({ mode: "sensors", search: "DEEP" }))).toEqual(["deep"]);
    expect(ids(q({ mode: "sensors", search: "manhattan" }))).toHaveLength(4);
  });

  test("an empty search matches everything", () => {
    expect(ids(q({ mode: "sensors", search: "" }))).toHaveLength(4);
  });
});

describe("sensorTotals", () => {
  test("counts each class out of the payload rather than hard-coding", () => {
    // ⚠️ `watched` is a count of SENSORS and is not the size of WATCH_CAMERAS —
    // four sensors serve more than one camera, so 27 cameras are 21 sensors.
    expect(sensorTotals(SENSORS)).toEqual({
      all: 4,
      watched: 0,
      reporting: 3,
      faulted: 1,
      silent: 1,
    });
  });
});

describe("boroughsOf", () => {
  test("is derived and sorted, with nulls dropped", () => {
    expect(
      boroughsOf([
        sensor({ borough: "Queens" }),
        sensor({ borough: null }),
        sensor({ borough: "Bronx" }),
        sensor({ borough: "Queens" }),
      ]),
    ).toEqual(["Bronx", "Queens"]);
  });
});

describe("sensorAgeSeconds", () => {
  const now = Date.parse("2026-08-05T12:10:00Z");

  test("counts from FloodNet's own publication clock", () => {
    expect(sensorAgeSeconds(sensor(), now)).toBe(600);
  });

  test("a sensor with no reading has no age", () => {
    expect(sensorAgeSeconds(sensor({ observed_at: null }), now)).toBeNull();
  });

  test("a future timestamp is excluded rather than rendered negative", () => {
    // A clock disagreement is neither fresh nor stale. Same treatment the
    // cameras get.
    const ahead = sensor({ observed_at: "2026-08-05T12:20:00Z" });
    expect(sensorAgeSeconds(ahead, now)).toBeNull();
  });
});
