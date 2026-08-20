/**
 * How far one coordinate is from another, and how to print it.
 *
 * Pure functions of numbers, beside `project.ts` and on the same terms: no
 * React, no DOM, no clock, nothing fetched. That is what makes the one part
 * that is easy to get wrong — which argument is latitude — checkable rather
 * than a matter of eyeballing a plausible-looking number.
 *
 * ## ⚠️ Named fields, never four positional numbers
 *
 * `project(lon, lat)` next door is **lon-first**; `waterline/cameras.py`'s
 * `haversine_m(lat1, lon1, lat2, lon2)` is **lat-first**. Both are correct for
 * themselves and a third convention in a third file is how a transposition
 * happens. A transposed NYC coordinate does not crash and does not look wrong:
 * it returns a large, plausible distance, and on a page whose subject is
 * coverage an enormous distance reads as *nothing is watching your block*
 * rather than as a bug. `SensorStatus` and `CameraStatus` already carry
 * `{lat, lon}`, so taking the same shape means the call sites spread nothing.
 *
 * ## ⚠️ Why duplicating `cameras.haversine_m` is not a second-authority
 * violation
 *
 * The second-authority rule in this repo is about `alert_permitted` — a
 * **judgement**, where two implementations can disagree and a reader is
 * therefore told something false about what this app will do for them. That is
 * why `floodnet.alert_permitted` is the single place and why `watch.is_permitted`
 * and `api._permitted_sensor_ids` both delegate to it rather than re-deriving.
 *
 * A haversine is not a judgement. It is arithmetic with a stated radius and one
 * right answer, and the two implementations are checked against each other by
 * hand rather than trusted (see the verification note in the plan: they agree
 * within a metre over a few km).
 *
 * The second half matters more: `cameras.haversine_m` answers a **different
 * question**. It measures camera → sensor, once, at bootstrap, and stores the
 * result in `pairs.distance_m`. Sharing it would mean putting the reader's
 * coordinate on the wire, which is the one thing this feature exists to refuse
 * (LIMITATIONS §16). There is no version of "reuse the server's function" that
 * does not send the address to the server.
 */

/** A coordinate, in degrees. Same field names as `SensorStatus`/`CameraStatus`. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Mean Earth radius, metres — the same constant `cameras.haversine_m` uses. */
const EARTH_R_M = 6_371_000;

const RAD = Math.PI / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const dp = (b.lat - a.lat) * RAD;
  const dl = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(h));
}

/**
 * Past this, the nearest instrument is described as far rather than as near.
 *
 * ⚠️ **Borrowed, not invented**, on this repo's rule that a threshold has to say
 * where it came from. It is `cameras.MAX_PAIR_M = 250.0` — the distance past
 * which this project stops calling two instruments the same water, and refuses
 * to pair a camera to a sensor at all.
 *
 * The borrow is approximate and worth naming: a camera is fixed infrastructure
 * and a reader is a person who moves. But it is conservative in the direction
 * that matters — a wider bound makes "far" fire *more* often, and the far copy
 * is the branch that says nothing near you is measured (the unobserved-not-clear rule). Erring
 * toward saying that is the right error.
 */
export const FAR_M = 250;

/** Below this many metres, print metres. Above, kilometres. */
const KM_FROM_M = 950;

/**
 * A distance split so the unit can be styled separately from the digits, the
 * same shape `formatDepth` returns.
 *
 * ⚠️ **Metres are rounded to the nearest 10 on purpose.** GeoSearch returns a
 * parcel centroid, not where somebody is standing, so `137 m` would be false
 * precision about a quantity that is already ±30 m before anyone moves. Rounding
 * makes the number as accurate as it claims to be.
 *
 * Under 10 m rounds to `0`, which would read as *you are standing on it*, so the
 * floor is `10`. There is no depth-style null case here: the caller decides
 * whether there is a distance at all (`distanceFromOrigin` returns null), and
 * this only ever formats a real one.
 */
export function formatDistance(m: number): { value: string; unit: string } {
  if (m < KM_FROM_M) {
    return { value: String(Math.max(10, Math.round(m / 10) * 10)), unit: "m" };
  }
  return { value: (m / 1000).toFixed(1), unit: "km" };
}

/** One-line form, for prose. */
export function distanceText(m: number): string {
  const d = formatDistance(m);
  return `${d.value} ${d.unit}`;
}
