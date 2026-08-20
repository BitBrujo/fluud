/**
 * Filter, search and sort over both instrument classes.
 *
 * ## Why this is not inside `StationList`
 *
 * **Three surfaces need the same ordered array**, and they must not each derive
 * their own. The list renders it, the `‹ ›` pager in `SelectedDetail` indexes
 * into it to step the selection, and `CityMap` de-emphasises the sensors that
 * are not in it. If the pager walked a different order from the one on screen,
 * pressing `›` would appear to jump at random.
 *
 * So `page.tsx` owns the query and derives `ordered` once, **during render** —
 * on the same terms it already owns `picked` and `selectedGaugeId`. Passing the
 * order back up out of the list via a callback would be exactly the effect this
 * codebase refuses everywhere else (see `use-history.ts`, and the harbor
 * window in `harbor-baseline.tsx`).
 *
 * The second reason is that the comparators have rules worth checking without a
 * browser — `compareSensors`' fault handling in particular is a safety rule
 * rather than a preference, and it is easier to be sure of as a pure function.
 */

import type { CameraStatus, SensorStatus } from "./api-types";
import { ageSeconds, parseServerTime } from "./format";
import { haversineM } from "./geo/distance";
import { inViewport } from "./geo/project";

export type InstrumentMode = "cameras" | "sensors";

/**
 * `worst` is one intent — *show me the bad ones first* — and each class answers
 * it over its own rows.
 *
 * ⚠️ **Both classes now answer it in millimetres**, which they did not when a
 * camera carried an ordinal class of its own. A camera's depth is its paired
 * FloodNet sensor's, so the two comparators tier identically and only differ in
 * their tiebreak. They are still two functions rather than one generic: the
 * plausibility column is named differently on the two payloads
 * (`depth_plausible` / `plausible`) and unifying them would mean a lookup by
 * string.
 *
 * ⚠️ **`distance` is the opposite case and that is why it is safe in both
 * modes**: it is literally the same quantity for a camera and a sensor — metres
 * from one point to another — needing no per-class reinterpretation at all. It
 * is offered in camera mode and works there. Refusing it would make the sort
 * control disappear or disable when the tab flips, and a key that silently
 * means nothing in one mode makes `›` walk a sequence nobody asked for.
 */
export type SortKey = "worst" | "name" | "age" | "distance";

/**
 * Where the reader said they are.
 *
 * ⚠️ **The label rides with the coordinate in ONE object, and it is set
 * atomically or not at all.** A label from one search paired with a coordinate
 * from another is one location's numbers labelled with another's — the exact
 * error `use-history.ts` derives its answer during render to avoid, arriving in
 * a different file. Two pieces of state (`originLabel`, `originCoord`) would
 * make that a one-line mistake; one object makes it impossible.
 *
 * ⚠️ **This never leaves the browser.** It is produced by `lib/geosearch.ts`
 * from a call the browser makes directly to NYC Planning Labs, it is held in
 * React state, and there is no code path from here to `api.py`. See
 * LIMITATIONS §16, which argues why an address is allowed to exist on this page
 * at all and lists the five properties that have to hold for that to stay true.
 */
export interface Origin {
  lat: number;
  lon: number;
  /** The geocoder's own `properties.label`, verbatim. Never re-worded. */
  label: string;
}

export interface InstrumentQuery {
  mode: InstrumentMode;
  /** Free text over name, borough, NTA and id. Case-insensitive, no debounce. */
  search: string;
  sort: SortKey;
  /**
   * The address the reader gave, or null. Both instrument classes carry
   * `lat`/`lon`, so this means the same thing in both modes.
   *
   * ⚠️ **It orders; it never filters.** Nothing is removed from the list, the
   * map or the pager because of it — see `queryIsActive`, which deliberately
   * excludes it.
   */
  origin: Origin | null;
  /** Sensors only — `CameraStatus` carries no borough. */
  boroughs: string[];
  /** Sensors only: this app actually escalates from it. NOT `alert_permitted`. */
  watchedOnly: boolean;
  /** Sensors only: has a stored reading at all. */
  reportingOnly: boolean;
  /** Both classes: a believable depth at or above FloodNet's flood event. */
  overThresholdOnly: boolean;
  /** Both classes: the instrument is faulted. */
  faultsOnly: boolean;
  /**
   * Sensors only: the deployment is tidally influenced.
   *
   * ⚠️ **A property of the INSTRUMENT, never of its reading**, which is what
   * makes it a legitimate facet at all. Every other filter here narrows on
   * what an instrument is *reporting*; this narrows on what it is *able to
   * see*. A tidal deployment sees coastal surge and the rest see stormwater —
   * different phenomenon, different time constant — and it is also the gate on
   * the harbor witness in `waterline/watch.py`.
   *
   * ⚠️ **It may not become a map treatment.** A marker that varied by
   * tidality would compete with the depth band for the one visual channel the
   * band owns, and the band is the one that may never be crowded. Filtering a
   * list is reader-set state; recolouring a drawing is a second scale.
   */
  tidalOnly: boolean;
}

export const DEFAULT_QUERY: InstrumentQuery = {
  mode: "cameras",
  search: "",
  sort: "worst",
  /* Nothing is geocoded until somebody submits an address, and `sort` stays
     `worst` — the resting order of this page is "how bad is it", not "how close
     is it to a place nobody has named yet". */
  origin: null,
  boroughs: [],
  watchedOnly: false,
  reportingOnly: false,
  overThresholdOnly: false,
  faultsOnly: false,
  tidalOnly: false,
};

/**
 * Rows per page in the instrument list.
 *
 * **Owner's instruction, 2026-08-06**: stop the list after 20 and page. It
 * replaced a scroll region holding all 425 filtered rows.
 *
 * ⚠️ **It lives in this module because TWO files need the same number** —
 * `map/page.tsx` slices `ordered` with it and `station-list.tsx` renders
 * `n–m of N` from it — and one of the two owning it would make the other
 * compute a row range from a page size it was only assuming. Same reason
 * `ordered` itself is derived here rather than inside the list.
 *
 * ⚠️ **It is a page size, not the visible-row floor.** `list-controls.tsx`
 * records a measured floor of **three visible rows**, below which the list
 * reads as a stub that failed to load; that floor is about the vertical space
 * the panel's chrome leaves and it still binds independently of this.
 */
export const LIST_PAGE_SIZE = 20;

/**
 * One row, whichever class it came from. The pager indexes into these.
 *
 * ⚠️ **Do not put `distanceM` on this.** It describes an instrument, and a
 * distance is a property of a *query* — the same instrument is 40 m from one
 * reader and 9 km from the next. Caching it here would make the type lie the
 * moment the origin changes, and `distanceFromOrigin` is pure and cheap enough
 * that the surfaces can just ask.
 */
export type Instrument =
  | { kind: "camera"; id: string; camera: CameraStatus }
  | { kind: "sensor"; id: string; sensor: SensorStatus };

/**
 * Whether anything is narrowing the list.
 *
 * Two consumers: the controls strip renders a compact chip line when it is
 * collapsed so active filters are never hidden, and the map only de-emphasises
 * non-matching markers while this is true — an untouched query must leave the
 * drawing exactly as it was.
 *
 * `sort` is not part of it. Reordering a list does not remove anything from it,
 * so it cannot hide an instrument from a reader.
 *
 * ## ⚠️ `origin` is not part of it either, and getting this wrong is severe
 *
 * An origin is the sort's *argument*, so it inherits the sentence above
 * verbatim: it reorders and removes nothing. The reason to state it separately
 * is the blast radius. `queryIsActive` gates `matchingSensorIds` in
 * `map/page.tsx`, so including `origin` here would drop 404 of 425 map markers
 * to 25% opacity the moment somebody types an address — the unobserved-not-clear rule broken by
 * a search field, which is precisely the collapse `city-map.tsx`'s de-emphasis
 * docblock says must never happen. An address would make the city look empty.
 *
 * ⚠️ **But an origin is reader-set state and may never be invisible**, which is
 * this function's other consumer's rule (`ActiveFilterLine`: a list narrowed by
 * a control the reader cannot see is a list that appears to be the whole city).
 * So it gets its own always-visible chip **outside** this gate rather than
 * being folded into it. Both properties hold at once; neither is optional.
 */
export function queryIsActive(q: InstrumentQuery): boolean {
  return (
    q.search.trim() !== "" ||
    q.boroughs.length > 0 ||
    q.watchedOnly ||
    q.reportingOnly ||
    q.overThresholdOnly ||
    q.faultsOnly ||
    q.tidalOnly
  );
}

/**
 * Where the search term sits inside one field, or null.
 *
 * ⚠️ **This is the filter's own normalisation, exported for the highlight.**
 * `components/highlight.tsx` renders the matched substring as a `<mark>`, and a
 * mark computed with different case rules from the filter sits on the wrong
 * characters — so `matchesText` below is *defined in terms of this function*,
 * which makes "a row the filter accepts always has a range to mark" true by
 * construction rather than by discipline. `tests/match-range.test.ts` pins it
 * anyway, through `applyQuery`, in case somebody unshares the logic.
 */
export function matchRange(
  text: string,
  search: string,
): { start: number; end: number } | null {
  if (!search) return null;
  const start = text.toLowerCase().indexOf(search.toLowerCase());
  if (start < 0) return null;
  return { start, end: start + search.length };
}

function matchesText(haystack: (string | null)[], needle: string): boolean {
  if (!needle) return true;
  return haystack.some((h) => h != null && matchRange(h, needle) !== null);
}

/**
 * Depth at or above FloodNet's own flood-event threshold, **and believable**.
 *
 * ⚠️ The plausibility half is not decoration. A faulted rangefinder reporting
 * 1451 mm is over every threshold there is, and letting it satisfy "over
 * threshold" would put the loudest wrong number at the top of a filter whose
 * whole purpose is finding real water.
 */
function isOverThreshold(
  depthMm: number | null,
  plausible: boolean,
  floodEventMm: number,
): boolean {
  return depthMm != null && plausible && depthMm >= floodEventMm;
}

/**
 * Worst first, for cameras: **the same tiering `compareSensors` uses**, over
 * the paired sensor's depth.
 *
 * ⚠️ **It sorted on a camera's ordinal class until that layer was deleted, and
 * the obvious replacement is VACUOUS.** `poll.tick` stamps every camera in a
 * tick with one `now`, so `observed_at` is identical across all 27 rows and an
 * age-only comparator ranks nothing at all — the "worst" control would silently
 * stop working while still appearing to sort. The depth tier is required, not
 * optional.
 *
 * The tiering is `compareSensors`' verbatim and deliberately so: plausible
 * readings first and deeper first within them, faults grouped after while
 * keeping their digits, and no depth at all last. A faulted rangefinder's
 * 1451 mm heading the list is a claim about the street made out of a broken
 * instrument, and it is the same broken instrument whichever list it lands in.
 *
 * `observed_at` survives as the last tiebreak. It orders nothing today and
 * costs nothing; if the poller ever stamps per camera it starts meaning
 * something again.
 */
function compareCameras(a: CameraStatus, b: CameraStatus): number {
  const rank = (c: CameraStatus): number => {
    if (c.depth_mm == null) return 2; // unpaired, or the sensor is silent
    if (c.depth_plausible === false) return 1; // faulted
    return 0; // a real measurement
  };
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;

  if (a.depth_mm != null && b.depth_mm != null && a.depth_mm !== b.depth_mm) {
    return b.depth_mm - a.depth_mm;
  }
  return (
    b.observed_at.localeCompare(a.observed_at) || a.name.localeCompare(b.name)
  );
}

/**
 * Worst first, for sensors: **plausible readings first, then by depth.**
 *
 * ## Why sorting sensors by depth is legitimate when sorting gauges is not
 *
 * The no-ranking rule is a *gauge* rule and it does not generalise. NOAA is
 * referenced to MLLW and each USGS site to its own local datum, so five gauge
 * levels are five quantities that share no axis — ranking them would assert a
 * comparison that does not exist. Every FloodNet sensor, by contrast, reports
 * millimetres above the roadway against one definition. 40 mm here and 40 mm
 * across town are the same measurement of the same thing, so ordering by it
 * says something true.
 *
 * ⚠️ **What must not happen is a faulted 1451 mm heading the list.** That is the
 * single loudest number in the payload and it is not water — it is a
 * rangefinder that has lost its echo. So faults are grouped *after* every
 * plausible reading regardless of magnitude, while keeping their number and
 * their `FAULT` mark. Sorting them to the bottom is a claim about the
 * instrument; deleting them would be a claim about the street.
 *
 * Sensors with no reading at all sort last — behind the faults. An absent
 * reading is not a small one, and it has nothing to rank.
 */
function compareSensors(a: SensorStatus, b: SensorStatus): number {
  const rank = (s: SensorStatus): number => {
    if (s.depth_mm == null) return 2; // never reported
    if (s.plausible === false) return 1; // faulted
    return 0; // a real measurement
  };
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;

  // Within a rank, deeper first. Both null-depth rows fall through to name.
  if (a.depth_mm != null && b.depth_mm != null && a.depth_mm !== b.depth_mm) {
    return b.depth_mm - a.depth_mm;
  }
  return (a.name ?? a.sensor_id).localeCompare(b.name ?? b.sensor_id);
}

/** Newest reading first. A missing timestamp sorts last rather than first. */
function compareAge(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.localeCompare(a);
}

/**
 * Metres from the origin to one instrument, or null.
 *
 * Shared so the comparator, the list row, the detail face and the landing card
 * cannot disagree about how far away something is — `sensorAgeSeconds`' job,
 * for distance instead of time.
 *
 * ⚠️ **Null outside `NYC_BOUNDS`, and that guard is not optional even though it
 * should never fire.** `floodnet` drops coordinate-less deployments at ingest
 * and `schema.sql` declares lat/lon NOT NULL, so this is defensive — but the
 * failure it prevents is not a wrong number, it is an **arbitrary order**. A
 * `NaN` in a comparator is non-transitive (every comparison involving it is
 * false), `Array.prototype.sort` is free to produce any permutation from one,
 * and three surfaces read that array: the list draws it, the pager indexes it,
 * and the map de-emphasises against it. `inViewport` also rejects `NaN` by
 * construction, which is the actual mechanism here.
 *
 * The same bound rejects the same coordinate in `geosearch.readFeature`, so an
 * origin that could not be drawn can never become one that is measured from.
 */
export function distanceFromOrigin(
  o: Origin | null,
  lat: number,
  lon: number,
): number | null {
  if (!o) return null;
  if (!inViewport(o.lon, o.lat)) return null;
  if (!inViewport(lon, lat)) return null;
  return haversineM(o, { lat, lon });
}

/**
 * Nearest first, **null last**.
 *
 * `compareAge`'s rule applied to a second quantity: an absent value sorts last
 * rather than first, because an absent distance is not a small one. A sensor
 * with no usable coordinate has nothing to rank and must not head a list whose
 * whole claim is "these are the closest to you".
 */
export function compareDistance(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

/**
 * Every shown instrument's distance from the origin, computed once.
 *
 * ⚠️ **Returning `null` when there is no origin is guard 1 of the three below**,
 * and it is what makes `sort: "distance"` with `origin: null` a *pure fallback*
 * rather than an impossible state: the caller's `if (dist)` simply does not fire
 * and the mode's own `worst` comparator runs. There is no branch that can
 * produce an arbitrary order.
 */
function distanceMap<T extends { lat: number; lon: number }>(
  q: InstrumentQuery,
  shown: T[],
  idOf: (x: T) => string,
): Map<string, number | null> | null {
  if (q.sort !== "distance" || !q.origin) return null;
  const origin = q.origin;
  return new Map(
    shown.map((x) => [idOf(x), distanceFromOrigin(origin, x.lat, x.lon)]),
  );
}

/**
 * The one ordered array all three surfaces read.
 *
 * `floodEventMm` is threaded in rather than imported because it is a **borrowed
 * number** that arrives from `/api/status` — 10 mm is FloodNet's own definition
 * of a flood event, and this module must not carry its own copy to drift from.
 *
 * ## ⚠️ `sort: "distance"` with no origin is guarded three times
 *
 * This function must be **total** — there is no version of it that is allowed
 * to throw or to return an arbitrary order, because three surfaces read what it
 * returns. So the impossible state is refused in three independent places and
 * none of them is the belt to another's braces:
 *
 * 1. **Here**, by falling through to the mode's own `worst` comparator. A pure
 *    fallback, never an arbitrary order.
 * 2. In `list-controls.tsx`, where the `nearest` button is `disabled` until an
 *    origin exists, with a `title` saying why.
 * 3. In the clear-the-origin handler, which resets the sort **in the same
 *    patch** — `set({ origin: null, sort: sort === "distance" ? "worst" : sort })`
 *    — so the state never exists even for one render.
 */
export function applyQuery(
  q: InstrumentQuery,
  cameras: CameraStatus[],
  sensors: SensorStatus[],
  floodEventMm: number,
): Instrument[] {
  if (q.mode === "cameras") {
    const shown = cameras.filter((c) => {
      if (!matchesText([c.name, c.nta, c.camera_id, c.sensor_id], q.search)) {
        return false;
      }
      if (q.faultsOnly && c.depth_plausible) return false;
      if (
        q.overThresholdOnly &&
        !isOverThreshold(c.depth_mm, c.depth_plausible, floodEventMm)
      ) {
        return false;
      }
      // A camera has no borough on the wire and is never "unwatched" — every
      // camera in `/api/status` is one this page polls — so those two filters
      // do not apply here rather than silently emptying the list.
      return true;
    });

    /*
     * ⚠️ **Precomputed before `.sort()`, never inside the comparator.**
     * `applyQuery` re-memoises on every 15s tick because `cameras` changes
     * identity, and a comparator over 425 rows is called ~3,700 times per sort —
     * so a haversine in there is ~3,700 trig calls a tick to answer 425
     * questions. One `Map`, one pass, 425 calls. Same reason `sensorTotals` is
     * derived once rather than counted per row.
     */
    const dist = distanceMap(q, shown, (c) => c.camera_id);

    const sorted = [...shown].sort((a, b) => {
      if (q.sort === "name") return a.name.localeCompare(b.name);
      if (q.sort === "age") return compareAge(a.observed_at, b.observed_at);
      if (dist) {
        // Ties (and two absent distances) fall through to the mode's own
        // ordering rather than to nothing, so the result is stable and the tail
        // of the list is still worst-first.
        return (
          compareDistance(
            dist.get(a.camera_id) ?? null,
            dist.get(b.camera_id) ?? null,
          ) || compareCameras(a, b)
        );
      }
      return compareCameras(a, b);
    });

    return sorted.map((camera) => ({
      kind: "camera" as const,
      id: camera.camera_id,
      camera,
    }));
  }

  const shown = sensors.filter((s) => {
    if (!matchesText([s.name, s.borough, s.nta, s.sensor_id], q.search)) {
      return false;
    }
    if (q.boroughs.length > 0 && (!s.borough || !q.boroughs.includes(s.borough))) {
      return false;
    }
    if (q.watchedOnly && !s.watched_camera_id) return false;
    if (q.reportingOnly && s.observed_at == null) return false;
    /* `tidal` is a plain boolean on the wire — non-null on every row, because
       it describes the deployment rather than a reading — so a bare `!` is
       correct here and would not be on `plausible` two lines down. */
    if (q.tidalOnly && !s.tidal) return false;
    // ⚠️ `plausible === false`, not `!plausible`. It is null on a sensor that
    // has never reported, and an absent reading is not a fault — there is no
    // number for the instrument to have got wrong.
    if (q.faultsOnly && s.plausible !== false) return false;
    if (
      q.overThresholdOnly &&
      !isOverThreshold(s.depth_mm, s.plausible === true, floodEventMm)
    ) {
      return false;
    }
    return true;
  });

  /* Same precompute, same reason — and this is the branch it was written for:
     425 sensors against 27 cameras. */
  const dist = distanceMap(q, shown, (s) => s.sensor_id);

  const sorted = [...shown].sort((a, b) => {
    if (q.sort === "name") {
      return (a.name ?? a.sensor_id).localeCompare(b.name ?? b.sensor_id);
    }
    if (q.sort === "age") return compareAge(a.observed_at, b.observed_at);
    if (dist) {
      return (
        compareDistance(
          dist.get(a.sensor_id) ?? null,
          dist.get(b.sensor_id) ?? null,
        ) || compareSensors(a, b)
      );
    }
    return compareSensors(a, b);
  });

  return sorted.map((sensor) => ({
    kind: "sensor" as const,
    id: sensor.sensor_id,
    sensor,
  }));
}

/**
 * The counts the mode-note strip states, derived from the payload rather than
 * hard-coded.
 *
 * ⚠️ **`watched` is a count of SENSORS, and it is not the size of
 * `WATCH_CAMERAS`.** 27 cameras are watched, but four sensors serve more than
 * one of them — one serves four — so the distinct sensor count is 21. Writing
 * "27" into that sentence would be wrong in a way nobody would notice, which is
 * exactly why it is computed here.
 *
 * ⚠️ **`watched` counts the sensors paired to a camera this page polls, and
 * nothing wider.**
 * It is not how many this app monitors (all of them are polled and stored) and
 * it is not how many can warn a subscriber — that is `alert_permitted`, ~343,
 * through `waterline/watch.py`, which has no camera in it at all. The strip read
 * "the rest are display only" off this field until 2026-08-06 and was false
 * about 325 deployments. **A sentence built on this number has to say "on this
 * page".** See `api-types.ts`, which carries the two-path table.
 */
export function sensorTotals(sensors: SensorStatus[]) {
  return {
    all: sensors.length,
    watched: sensors.filter((s) => s.watched_camera_id).length,
    reporting: sensors.filter((s) => s.observed_at != null).length,
    faulted: sensors.filter((s) => s.plausible === false).length,
    silent: sensors.filter((s) => s.observed_at == null).length,
  };
}

/** Boroughs present in the payload, in a stable order. Never hard-coded. */
export function boroughsOf(sensors: SensorStatus[]): string[] {
  return [...new Set(sensors.map((s) => s.borough).filter((b): b is string => !!b))]
    .sort();
}

/**
 * Freshness input for a sensor row, in seconds, or null when it has no reading.
 * Shared so the row, the detail face and the map marker cannot disagree.
 */
export function sensorAgeSeconds(
  s: SensorStatus,
  now: number,
): number | null {
  const at = parseServerTime(s.observed_at);
  if (!at) return null;
  const age = ageSeconds(at, now);
  // A timestamp from the future is a clock disagreement, not freshness. Same
  // treatment as the cameras: neither fresh nor stale, excluded rather than
  // winning.
  return age < 0 ? null : age;
}
