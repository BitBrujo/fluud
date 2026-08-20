/**
 * The shapes `waterline/api.py` actually returns.
 *
 * Still hand-written, but no longer *only* hand-written. Every route now
 * declares a `response_model=`, so `/openapi.json` describes real shapes and
 * these can be checked against it rather than taken on trust. The authority is
 * `waterline/models.py`, under "the HTTP contract"; if you change a handler,
 * change the model and this file in the same commit.
 *
 * **This file is deliberately allowed to be more lenient than the server, in
 * one direction only.** A field the server always sends may be optional here
 * when the fallback is safe — see `HealthResponse.last_tick_at` and
 * `SpeakEvent.drill`. The reason is version skew: during a rolling
 * deploy a browser can load the shell from a new instance and then poll an old
 * one. The reverse — this file promising a field the server may omit — is a
 * bug, because nothing would catch it until the value rendered as `undefined`.
 *
 * `SpeakEvent.replay` / `MoodEvent.replay` are the other legitimate extra:
 * they exist on the SSE frames (added by `rat.recent()`) and never on an HTTP
 * body, so no response model declares them.
 */

import type { Level } from "./levels";

export interface Thresholds {
  /** FloodNet's own flood-event definition, not ours. */
  flood_event_mm: number;
  /** NYC curb height — water leaving the roadway for the sidewalk. */
  curb_height_mm: number;
}

/**
 * The poller's own judgement bounds — **derived in this repo**, unlike
 * `Thresholds`.
 *
 * ⚠️ **Two models rather than one, and the split carries a claim.** 10 mm and
 * 150 mm are borrowed from FloodNet and from NYC's curbs, and the root
 * CLAUDE.md makes anyone changing them name a new source. Everything here was
 * measured off what the instruments did on a specific day, and
 * `waterline/floodnet.py` carries each derivation at the constant. A surface
 * that says "FloodNet's 10 mm threshold" is attributing correctly; one that
 * said "FloodNet's 600 mm ceiling" would not be.
 *
 * ⚠️ **On the wire for `depth-band.ts`'s reason: no literal may be written on
 * this side.** A copy here is a number duplicated across the two languages
 * with nothing in `tests/parity.test.ts` holding it, and this one would be a
 * safety band drifting silently.
 */
export interface IngestBounds {
  /**
   * Below this, a reading is a fault rather than a small depth. Negative:
   * `depth_filt_mm` is never negative, but the poller falls back to
   * `depth_raw_mm`, an uncorrected range that sits near −20 mm by design.
   */
  implausible_min_mm: number;
  /** Above this, a street rangefinder is reporting something it cannot see. */
  implausible_mm: number;
  /**
   * How far back the depth query reaches, in seconds.
   *
   * ⚠️ **A bound on the QUERY, never a staleness threshold.** `staleness.ts`
   * owns when a reading looks old; this owns whether it was fetched at all. A
   * deployment with a broken real-time clock stamps everything decades ahead,
   * has nothing inside this window, and arrives with no reading — which is why
   * a silent sensor is worth naming this number beside.
   */
  reading_max_age_s: number;
}

export interface CameraStatus {
  camera_id: string;
  name: string;
  lat: number;
  lon: number;
  image_url: string;
  /** ISO 8601. May arrive without an offset — parse with `parseServerTime`. */
  observed_at: string;
  /** null when there is no co-located sensor. NOT zero. See `calibrated`. */
  depth_mm: number | null;
  sensor_id: string | null;
  nws_active: boolean;
  /** false ⇒ no ground truth at all; the UI must say so rather than imply dry. */
  calibrated: boolean;
  /**
   * Neighborhood Tabulation Area **display name**, reached through this
   * camera's sensor. null when the camera is unpaired, or its sensor has no
   * NTA, or the crosswalk does not cover that code — and null renders as no
   * line at all rather than as a half-line.
   *
   * NTA is the finest granularity anything neighborhood-shaped is permitted to
   * reach here (the NTA-scale rule / LIMITATIONS §3). Do not ask the server for
   * something finer; it has nothing finer to give.
   *
   * ⚠️ **Two fields travelled beside this and are DELETED** —
   * `rodent_activity_rate` and `rodent_inspections`, the DOHMH rat-inspection
   * share and its denominator, removed 2026-08-14 with the card back that
   * rendered them. The name stayed because it is geography rather than rat
   * data, and it is not decorative: `instrument-query.ts` matches the search
   * box against it, so a reader can type a neighbourhood and find the
   * instruments in it.
   */
  nta: string | null;
  /**
   * Whether the poller judged this depth physically believable
   * (`floodnet.IMPLAUSIBLE_MIN_MM` ≤ depth < `IMPLAUSIBLE_MM`).
   *
   * `true` when `depth_mm` is null — absence has no plausibility to doubt — so
   * this is never a third state and the UI must check the depth first.
   *
   * ⚠️ `false` means **the instrument is faulted, not that the street is deep**.
   * The number still renders; what changes is the claim being made about it.
   * Same idiom as staleness: removed from the scale, never quietly downgraded.
   */
  depth_plausible: boolean;
}

/**
 * One FloodNet deployment — all 425, not only the ones this page watches.
 *
 * ⚠️ **A row here is not an alarm.** Three separate fields say how far a sensor
 * is from being able to warn you, and conflating them would tell a reader this
 * page is watching fifteen times as much as it is:
 *
 * | field | today | means |
 * |---|---|---|
 * | `alert_visible` | 401 | FloodNet permits this deployment to alarm |
 * | `alert_permitted` | 343 | ...and its sensor is currently healthy |
 * | `watched_camera_id` | 21 | paired to a camera in `WATCH_CAMERAS` |
 *
 * ⚠️ **`alert_permitted` is the one that gates anything.** It is what the
 * email watch admits — `waterline/watch.py` is a sensor-only state machine with
 * **no camera in it at all** — so ~343 of these can warn a subscriber with no
 * pairing whatsoever.
 *
 * `watched_camera_id` names the camera whose view this sensor's depth labels.
 * It gates nothing: the on-page alert system was unwired, and nothing on any
 * page raises a warning from any instrument.
 *
 * ⚠️ **This block said "what this app acts on is `watched_camera_id !== null`"
 * until 2026-08-06, and that reading is how five surfaces came to say "display
 * only" about 325 instruments this app will happily mail somebody about.** A
 * claim here has to name its path or it will be wrong on the other one.
 *
 * ⚠️ That count is **21, not 27**, and the difference is not a bug. 27 cameras
 * are watched, but four sensors serve more than one of them — one serves four —
 * so the distinct sensor count is lower. Derive both from the payload; never
 * hard-code either.
 */
export interface SensorStatus {
  /** FloodNet's `deployment_id`. The slug is deliberately not on the wire. */
  sensor_id: string;
  name: string | null;
  lat: number;
  lon: number;
  borough: string | null;
  /** NTA **display name**, not the code. NTA is the finest granularity here. */
  nta: string | null;
  /** Tidal deployments see coastal surge; the rest see stormwater. */
  tidal: boolean;
  /** FloodNet's `sensor_status`, verbatim. A string: upstream we don't own. */
  status: string;
  alert_visible: boolean;
  alert_permitted: boolean;
  /** null does NOT mean unpaired — 131 pairs exist and 27 cameras are watched. */
  watched_camera_id: string | null;

  /**
   * How far above the roadway the rangefinder is mounted, from FloodNet's
   * `height_ground_mm`. Typically 2–3 m.
   *
   * ⚠️ **A length in millimetres that is NOT a depth.** It may never take a
   * depth band, a pill, a bar or a marker colour, and it may never share an
   * axis with `depth_mm` — one is the height of a pole and the other is water
   * on the ground. What it is for is the phantom-flood argument: a `FAULT`
   * chip over `1452 mm` explains itself the moment a reader knows the
   * instrument is two metres up.
   *
   * Null for a deployment that publishes no height. **Absence gets words, not
   * a blank** — a missing mounting height is a fact about the registry, and a
   * gap where a sentence was reads as something failing to load.
   */
  ground_height_mm: number | null;

  /**
   * ⚠️ **These four are null TOGETHER.** No stored reading means no reading, and
   * there is nothing to describe: not a zero, and not a plausibility verdict on
   * a number that does not exist. Render an em-dash and no fault mark.
   *
   * `observed_at` is **FloodNet's own publication clock**, not our poller's, so
   * age it with `sensorFreshnessOf` — never `freshnessOf`. See `staleness.ts`.
   */
  observed_at: string | null;
  depth_mm: number | null;
  flood_detected: boolean | null;
  /** false ⇒ the rangefinder faulted. The digits stay; the claim changes. */
  plausible: boolean | null;
}

/**
 * Every FloodNet deployment this build knows about.
 *
 * **No counts and no aggregates, deliberately.** Every total the UI needs is
 * derivable from the rows it already has, and deriving it once in the browser is
 * one fewer place for a number to disagree with the list underneath it.
 */
export interface SensorsResponse {
  sensors: SensorStatus[];
}

/**
 * Which of the two stored pairing tiers a camera falls in, or neither.
 *
 * ⚠️ **`unpaired` is the WIRE value; `not paired` is the reader's words.** That
 * split is the fourth on this page after `watch`→`monitor`, `gauges`→`tide + wx`
 * and `worst`→`depth`, and `camera-filter.ts` owns the labels.
 *
 * ⚠️ **The words `gold` and `silver` may never reach a reader.** They are the
 * internal names of `cameras.GOLD_PAIR_M` / `MAX_PAIR_M` on the Python side,
 * they appear in no wire value and in no copy, and
 * `tests/camera-filter.test.ts` asserts it case-insensitively.
 */
export type PairTier = "paired" | "near" | "unpaired";

/**
 * One DOT camera from the registry — all 968, not the 27 this poller watches.
 *
 * ⚠️ **Deliberately not `CameraStatus`, and it is a different SET as well as a
 * different shape.** `CameraStatus` comes off `observations`, which the poller
 * writes only for `WATCH_CAMERAS`; this comes off the `cameras` table with the
 * paired sensor's own newest reading hung off it. The overlap is coincidence,
 * not a contract — do not collapse them, and do not feed one into a surface
 * expecting the other.
 *
 * ⚠️ **`distance_m` is deliberately absent and asking for it is the change to
 * refuse.** *Never colour a distance* is a Never bullet, and its argument —
 * reddening with distance is a severity ramp built out of coverage — binds any
 * monotone ramp over distance, not only hue. The classification happens once,
 * server-side, in `cameras.pair_tier`.
 */
export interface CameraEntry {
  camera_id: string;
  name: string;
  lat: number;
  lon: number;
  image_url: string;
  /**
   * DOT's own `area` string, verbatim and un-normalised against
   * `SensorStatus.borough` — two agencies, two vocabularies, and rewriting one
   * to match the other would be inventing a value and attributing it upstream.
   *
   * ⚠️ **null has TWO causes and neither is *outside the city*.**
   *
   * 1. **The database has not been re-bootstrapped** since `cameras.borough`
   *    landed — nothing but `python -m waterline.poll bootstrap` fills that
   *    column. A borough filter over a stale registry draws nothing for a
   *    *deployment* reason, and `cameraFilterNote` says exactly that rather
   *    than rendering an empty city.
   * 2. ⚠️ **DOT retired the camera and the row survived.** `upsert_cameras`
   *    never deletes. **Measured in production 2026-08-16: 973 fetched, 974
   *    stored, one null.**
   *
   * ⚠️ **This is why the refusal fires on `anyBorough` — *not one camera
   * carries one* — rather than on a single row.** One null among 974 is a
   * retired camera and is nobody's problem; 974 nulls is a database nobody
   * bootstrapped. `applyCameraFilter` withholds a null row from every borough
   * filter either way, which is the safe direction for both causes.
   */
  borough: string | null;
  /** The paired FloodNet deployment. null and `tier: "unpaired"` travel together. */
  sensor_id: string | null;
  tier: PairTier;
  depth_mm: number | null;
  /**
   * ⚠️ **`depth_observed_at`, never `observed_at`, and the name is the
   * safeguard.** This is **FloodNet's publication clock** — the same one
   * `SensorStatus.observed_at` carries — so age it with `sensorFreshnessOf`
   * (1h/3h) and never `freshnessOf` (5m/30m), which measures our poller's tick
   * and is what `CameraStatus.observed_at` means. Judging one against the
   * other's thresholds already shipped once, when three of four healthy USGS
   * gauges rendered amber on first load.
   */
  depth_observed_at: string | null;
  /**
   * `true` when `depth_mm` is null — absence has no plausibility to doubt — so
   * this is never a third state and the UI checks the depth first. Same
   * contract as `CameraStatus.depth_plausible`: `false` means the instrument
   * faulted, the digits stay, and the claim changes.
   */
  depth_plausible: boolean;
}

/**
 * Every DOT camera this build knows about, **unfiltered**.
 *
 * **No counts and no aggregates**, on `SensorsResponse`' rule — and here that
 * rule is load-bearing rather than tidy. The browser does the filtering, so the
 * browser is the only thing that can say *"130 of 968 are drawn"*. A server
 * returning only matching rows would have to send a total beside them, which is
 * a second place for that number to be computed and a second place for it to
 * disagree with the marks underneath it.
 */
export interface CameraRegistryResponse {
  cameras: CameraEntry[];
}

/**
 * One harbor or stream gauge — the baseline a street reading is read against.
 *
 * ⚠️ **Levels are not comparable between gauges.** NOAA CO-OPS is referenced to
 * MLLW; each USGS gage height is referenced to that site's own local datum. Do
 * not rank them, average them, or put them on a shared scale. Each is only
 * comparable to its own threshold and its own history.
 */
export interface GaugeStatus {
  gauge_id: string;
  /** "noaa" | "usgs". A string, not a union: a new network must not crash. */
  network: string;
  name: string;
  lat: number;
  lon: number;
  level_ft: number;
  /** ISO 8601. Age it with `gaugeFreshnessOf`, never `freshnessOf`. */
  observed_at: string;
  /**
   * Published minor-flood stage, in the same datum as `level_ft`. null for
   * every USGS site — the operator publishes no threshold there, and inventing
   * one is exactly what LIMITATIONS §8 forbids. A gauge without a threshold
   * renders as a bare level; it must not borrow another gauge's.
   */
  minor_flood_ft: number | null;
}

export interface GaugeHistoryPoint {
  /** ISO 8601, oldest first. */
  t: string;
  /** In this gauge's own datum. Never plot two gauges on one axis. */
  level_ft: number;
}

export interface GaugeSeries {
  gauge_id: string;
  points: GaugeHistoryPoint[];
}

/**
 * Every gauge's recent trace, in one body.
 *
 * ⚠️ One response, five scales. The grouping is transport only — see
 * `models.GaugeHistoryResponse`. `gauge-sparkline.tsx` draws each series
 * against its own range and prints its own endpoints, which is the only honest
 * way to render a level that has no shared zero with the card beside it.
 */
export interface GaugeHistoryResponse {
  series: GaugeSeries[];
}

/**
 * ⚠️ **Dormant — no route returns this.** `StatusResponse` dropped its `alerts`
 * list when the on-page alert system was unwired. Kept as a type so
 * `alert-list.tsx` and `warning-block.tsx` still compile while unmounted, on
 * the same terms as `waterline/escalation.py`: putting the warning back on the
 * page is meant to be a re-wire rather than a rebuild.
 */
export interface AlertStatus {
  id: number;
  camera_id: string;
  name: string;
  level: Level;
  opened_at: string;
  peak_depth_mm: number | null;
  message: string;
  conversation_id: string | null;
}

/**
 * ⚠️ **Dropping a field from this body is a contract change, and the server
 * makes it a loud one.** `models.StatusResponse` sets `extra="forbid"`, so this
 * file promising a field the server no longer declares is a mismatch against
 * `/openapi.json` rather than a field that silently arrives `undefined`. Two
 * fields left here on 2026-08-14 on those terms.
 */
export interface StatusResponse {
  /** "LIVE", or "REPLAY …". Drives the provenance badge. */
  mode: string;
  disclaimer: string;
  thresholds: Thresholds;
  /** ⚠️ Separate from `thresholds` on purpose — see `IngestBounds`. */
  ingest: IngestBounds;
  cameras: CameraStatus[];
  gauges: GaugeStatus[];
  /** ⚠️ On this body rather than a route of its own — see `NwsStatus`. */
  nws: NwsStatus;
}

/**
 * One active NWS product, as the tide-and-weather panel renders it.
 *
 * ⚠️ **Nothing here says whether an alert corroborates a depth.** That question
 * is `feeds.is_witness_alert` on the server, and it is deliberately not on the
 * wire: a field marking the alerts that "count" would be this page ranking
 * somebody else's warnings.
 */
export interface NwsAlert {
  /** NWS's own product name, e.g. "Flash Flood Warning". The whole claim. */
  event: string;
  /**
   * ⚠️ **NWS's severity vocabulary and this app's depth band share words for
   * different quantities.** It renders as an attributed word — `NWS severity ·
   * severe` — and may never take a colour. See `nws-alerts.tsx`.
   */
  severity: string | null;
  urgency: string | null;
  certainty: string | null;
  headline: string | null;
  area_desc: string | null;
  /** ISO 8601, all three. Any may be null; NWS omits them routinely. */
  onset: string | null;
  ends: string | null;
  expires: string | null;
}

/**
 * What NWS said, and when we last managed to ask.
 *
 * ⚠️ **`checked_at` and `attempted_at` are two fields because they are two
 * claims.** *We asked and nothing was active* and *we could not ask* both arrive
 * as an empty `alerts`, and they are opposite answers. `checked_at` moves only
 * on a successful read, so `alerts` is always the last thing NWS actually said —
 * ageing in place rather than emptied by an outage.
 *
 * ⚠️ **Read `reachable` as `=== false`**, on `mail_delivers`' precedent: a body
 * that arrived without the field must not render as *the feed is down*.
 */
export interface NwsStatus {
  /** null means never read in this process. Render *not read*, never *nothing active*. */
  checked_at: string | null;
  attempted_at: string | null;
  reachable: boolean;
  /** The five boroughs only, ordered by NWS's own published severity rank. */
  alerts: NwsAlert[];
  /**
   * Active in the statewide feed but outside the five boroughs. **Counted, never
   * dropped** — a scope this panel narrowed is a scope it has to admit to.
   */
  elsewhere: number;
}

export interface HistoryPoint {
  /** ISO 8601, oldest first. May arrive without an offset. */
  t: string;
  /** null for an unpaired camera. Never rendered as zero. */
  depth_mm: number | null;
}

export interface HistoryResponse {
  camera_id: string;
  points: HistoryPoint[];
}

/**
 * `models.DepthPeakResponse` — the highest PLAUSIBLE depth one instrument
 * reported over a window.
 *
 * ⚠️ **`readings` and `faulted` keep three different silences apart**, and the
 * UI has three different sentences for them. All three reduce to "no peak":
 *
 * - `readings: 0, faulted: 0` — nobody looked. The window is empty.
 * - `readings: 0, faulted: > 0` — the instrument reported and every reading was
 *   a fault. Measured against the live registry: `closely_muddy_scurvy` is in
 *   exactly this state, 1288 faulted readings and no believable one.
 * - `readings: > 0` — a real peak.
 *
 * Rendering the first two as one message would tell a reader that a broken
 * rangefinder is an unobserved street.
 *
 * ⚠️ **`peak_mm` is null, never 0, when there is no peak.** Zero is a depth and
 * it claims a dry street — the same rule `HistoryPoint.depth_mm` follows and the
 * same one `floodnet._first_num` was violating upstream.
 */
export interface DepthPeak {
  kind: "camera" | "sensor";
  instrument_id: string;
  /**
   * The window actually used, after the server clamped it to retention. Compare
   * against what was requested: a seven-day peak labelled `last year` is the one
   * way this feature can understate a flood.
   */
  minutes: number;
  peak_mm: number | null;
  /** ISO 8601. When the peak happened — an old peak is history, not weather. */
  peak_at: string | null;
  /** Plausible readings the peak was taken over. */
  readings: number;
  /** Readings in the window rejected as physically impossible. */
  faulted: number;
  /** Newest reading in the window, plausible or not. */
  newest_at: string | null;
}

/**
 * One instrument's peak inside `DepthPeaks`.
 *
 * `DepthPeak` without `peak_at` and `newest_at` — see `db.camera_depth_peaks`
 * for why a bulk read does not carry them. Everything that decides what a row
 * may CLAIM is still here.
 */
export interface DepthPeakEntry {
  instrument_id: string;
  /**
   * ⚠️ **Null is not zero, and this is the field where that matters most.**
   * The single-instrument version of this lands in a 26px readout with three
   * sentences under it; this one lands in a 42px list row. A `0` there beside
   * a street name is the most confident claim of a dry block this app could
   * make. `formatDepth(null)` renders the em-dash — never coerce.
   */
  peak_mm: number | null;
  /** Plausible readings the peak was taken over. */
  readings: number;
  /** Readings in the window rejected as physically impossible. */
  faulted: number;
}

/**
 * Every instrument of one kind, peaked over one window.
 *
 * ⚠️ **An instrument MISSING from `peaks` is the empty window** — `readings: 0,
 * faulted: 0` — and not an error. It renders as an em-dash on the same rule as
 * every other absent depth here.
 *
 * ⚠️ **`readings` and `faulted` ride with every entry so the three silences
 * stay apart**: nobody looked, every reading faulted, a real peak. A row that
 * showed a dash without them could not say which, and the first two mean
 * opposite things — one is an unobserved street and the other is a broken
 * instrument reporting constantly.
 */
export interface DepthPeaks {
  kind: "camera" | "sensor";
  /** The window actually used, after the server clamped it to retention. */
  minutes: number;
  peaks: DepthPeakEntry[];
}

/**
 * The poller's heartbeat row, out of `poll_ticks`.
 *
 * ⚠️ **Every field is nullable and `=== null` is the only safe test.** Reading
 * any of these by truthiness is wrong in a way that matters: `stored: 0` is
 * falsy and means *this tick stored nothing new*, which is a real claim about
 * the instrument feed, while `null` means *this server did not say*. That is
 * the `mail_delivers === false` rule below, one field up, and it is sharper
 * here because zero is a legitimate value rather than an impossible one.
 */
export interface PollWrites {
  /** Our clock, stamped every iteration including one that raised. */
  tick_at?: string | null;
  /** Whether that iteration completed and the sensor write came back clean. */
  tick_ok?: boolean | null;
  /** Readings handed to the insert. */
  readings?: number | null;
  /** Rows actually inserted. Zero when FloodNet published nothing new. */
  stored?: number | null;
  /**
   * The last tick at which `stored` was above zero. ⚠️ **The field this block
   * exists for.** A loop that ticks forever and stores nothing moves `tick_at`
   * every minute and leaves this frozen.
   */
  last_store_at?: string | null;
}

export interface HealthResponse {
  ok: boolean;
  mode: string;
  poll_in_service: boolean;
  /** `_poller.is_alive()` — only ever catches a thread that has EXITED. */
  polling: boolean;
  /**
   * When the loop last completed an iteration. This is the field that can see
   * a *throttled* poller, which `polling` structurally cannot.
   *
   * `models.HealthResponse` declares this **required**, so the current server
   * always sends the key. It stays optional here on purpose: during a rolling
   * deploy a browser can load the shell from a new instance and then
   * poll an old one, and the UI degrading to `polling` alone is better than it
   * type-erroring. Client leniency in the safe direction is not drift.
   */
  last_tick_at?: string | null;
  /**
   * What **Postgres** says about the poller, rather than what a module global
   * in the API's own memory says.
   *
   * ⚠️ **This is correct in BOTH deployment shapes and `last_tick_at` is not.**
   * With the poller in its own container the API's `poll.LAST_TICK_AT` is null
   * forever, which is why `messages.ts` gated the whole poller fault on
   * `poll_in_service` and therefore said nothing at all on a bare `uvicorn`
   * run. `poll_ticks` is written by whichever process runs the loop and read by
   * whichever process serves the request.
   *
   * ⚠️ **Three absences, three meanings.** Getting these confused is how a
   * healthy deployment ends up wearing a fault:
   *
   * · `undefined` — a server built before this field. Rolling deploy.
   * · `null` — the read failed, or `poll_ticks` is not on this database yet.
   *   *We could not ask.*
   * · present with `tick_at === null` — the table is there and **no poller has
   *   ever ticked in this mode**. A positive statement, and the bare-`uvicorn`
   *   shape.
   */
  writes?: PollWrites | null;
  cameras: number;
  /**
   * Whether this deployment requires a verified Neon Auth session on `/api/*`
   * — `settings.require_auth`, reported rather than inferred.
   *
   * ⚠️ **Configuration, never a verdict on any particular token.** `true` says
   * the gate is on; it does not say a session would be accepted, and no
   * surface may word it that way.
   *
   * Optional here for `last_tick_at`'s reason. ⚠️ **Read it as
   * `auth_required === true`, never as truthiness** — `undefined` means *this
   * server did not say*, and treating that as "auth is on" would show a
   * sign-in prompt on an open deployment during a rolling deploy.
   */
  auth_required?: boolean;
  /**
   * The two cadences the poller actually runs on: the storm tick and the quiet
   * scheduled window. `poll.POLL_SECONDS` / `poll.POLL_WINDOW_S`.
   *
   * ⚠️ **`lib/staleness.ts` sizes the frozen-poller thresholds off these**, and
   * that is the whole reason they are on the wire: the schedule is a Railway
   * cron expression as much as it is a Python constant, so a deployment can be
   * polling on a cadence this bundle was never built for.
   *
   * Optional for `auth_required`'s reason, and `cadenceOf` supplies the
   * compiled default for anything missing. ⚠️ **A zero must never reach a
   * threshold** — it would accuse every poller of being frozen the instant the
   * server answered, which is why `cadenceOf` tests `> 0` rather than presence.
   */
  poll_seconds?: number;
  poll_window_s?: number;
  /**
   * Whether a message queued now could reach a mailbox — `mail.transport_
   * delivers()` on the server, which is the single authority and is asserted
   * against `deliver` by `check_mail.py`.
   *
   * ⚠️ **Capability, never delivery.** It means a transport is configured, and
   * nothing past that: not accepted by the recipient's server, not out of a
   * spam folder, not read. `outbox.status = 'sent'` already means only *handed
   * to a relay* and this means less again. No surface may word it as a message
   * having arrived.
   *
   * Optional here for `last_tick_at`'s reason — a rolling deploy can have this
   * shell polling an older instance.
   *
   * ⚠️ **Read it as `mail_delivers === false`, never `!mail_delivers`** — the
   * `plausible === false` rule, one payload over, and the same argument:
   * absence is not a verdict. `undefined` means *this server did not say*, and
   * rendering "nothing was sent" on that would tell a reader on a perfectly
   * healthy deployment to stop watching their inbox, which loses them a real
   * confirmation. The cost of the other direction is a transient window where
   * a broken transport is not called out, which is the state that shipped
   * before this field existed.
   */
  mail_delivers?: boolean;
}

// --- the SSE stream --------------------------------------------------------
// `replay: true` is added by `rat.recent()` when an event comes out of the
// reconnect buffer. `drill: true` is set inside `rat.speak()` — never stamped
// on afterwards, because that races the SSE writer.

export interface HelloEvent {
  type: "hello";
  mode: string;
}

export interface SpeakEvent {
  type: "speak";
  /** Templated by `agent._TEMPLATES`. Rendered verbatim. Never rewritten. */
  text: string;
  level: Level;
  lang: string;
  place: string;
  mood: string;
  depth_mm: number | null;
  /**
   * `rat.speak()` always sets this, and `models.SpeakEvent` declares it
   * required. Optional here for the same reason as `last_tick_at`, and because
   * the fallback runs the safe way: a missing flag is falsy, so an unlabelled
   * event is treated as a **real warning** rather than as a rehearsal.
   */
  drill?: boolean;
  at: string;
  replay?: boolean;
}

export interface MoodEvent {
  type: "mood";
  level: Level;
  mood: string;
  at: string;
  replay?: boolean;
}

export type RatEvent = HelloEvent | SpeakEvent | MoodEvent;

export interface DrillResponse {
  /**
   * null for a `clear` drill — standing down sets a mood and says nothing.
   *
   * The key is always present now that the route declares a `response_model`;
   * it used to be omitted entirely. `response_model_exclude_none` would have
   * restored that, but it is too blunt a tool: it would also drop
   * `event.depth_mm` on a WATCH drill, where null is the meaningful value
   * (no depth) and an absent key would read as a missing field.
   */
  text: string | null;
  event: SpeakEvent | MoodEvent;
}

// --- the sensor watch ------------------------------------------------------
// ⚠️ Nothing here carries a reading, a depth, an age or a severity, and that is
// a rule rather than an omission. A watch surface that rendered live state
// would be a second place a number can appear without its plausibility and its
// freshness beside it. The live state comes from `/api/sensors` like everywhere
// else; these shapes only ever say what somebody asked for.

export interface WatchSubscribeResponse {
  /**
   * ⚠️ **`confirmed` landed 2026-08-16 and it is NARROW.** The server reaches
   * it only when the session it verified carries an `email_verified` claim
   * equal to the address being subscribed. A signed-in reader typing somebody
   * else's address gets `pending`, byte for byte, and so does every anonymous
   * caller — so the identical-answer property still holds for everybody who did
   * not prove the address. `REQUIRE_AUTH=false` makes it unreachable.
   *
   * ⚠️ **The UI may not infer which server branch fired from anything but this
   * field**, and it may not tell the reader whether the address was already
   * here: the shape is identical for a new row and an existing one.
   */
  status: "pending" | "confirmed";
  /**
   * Present only on `confirmed`, and **absence is the safe direction** — a
   * client that does not see one simply offers no shortcut link.
   *
   * ⚠️ **A non-expiring bearer credential** granting read, edit and hard delete
   * of that subscription. Until this field existed it only ever travelled in
   * mail. **It may never be persisted** — no `localStorage`, no
   * `sessionStorage`, no module-level cache, and never in a `router.push`,
   * which would put it in the history stack. Component state and an `<a href>`
   * built by `watchManageHref`, nothing else. `geosearch.ts`'s never-cache rule,
   * on something stronger than an address.
   */
  manage_token?: string | null;
  /**
   * `agent._TEMPLATES["watch_note"]`, verbatim. The sentence that says our
   * silence is not information. Rendered as sent — never summarised.
   *
   * ⚠️ Returned on **both** branches, in `req.lang` on both — never in the
   * subscriber's stored language, which would differ between a known address
   * and an unknown one.
   */
  note: string;
}

/**
 * The wizard's three global settings. Vocabulary is the server's
 * (`notify.MIN_LEVELS` / `notify.FREQUENCIES`); anything else is a 400 at the
 * door, never a silent default.
 *
 * ⚠️ EMERGENCY ignores all three — `notify.allowed`, asserted by
 * `check_notify.py`. The wizard states that beside the controls.
 */
export interface WatchSettings {
  /** The trigger: the lowest level worth a message. */
  min_level: "watch" | "warning" | "emergency";
  /** `every` transition, or `first` — one message per episode. */
  frequency: "every" | "first";
  /** The timeline: quiet hours, America/New_York, half-open [start, end). */
  quiet_start: number | null;
  quiet_end: number | null;
}

/** Per-instrument override of the two overridable settings. Null = global. */
export interface WatchOverride {
  min_level?: WatchSettings["min_level"] | null;
  frequency?: WatchSettings["frequency"] | null;
}

export interface WatchSensorRef {
  sensor_id: string;
  name: string | null;
  borough: string | null;
  /** Overrides as stored. Null means the subscriber's global applies. */
  min_level: string | null;
  frequency: string | null;
  /**
   * Recomputed by the server on every read, because it can flip after somebody
   * subscribes. When it goes false that watch has gone quiet, and the manage
   * surface owes the reader the reason rather than showing a live-looking row.
   */
  alert_permitted: boolean;
  /**
   * This instrument has not reported for over an hour, so Fluud can say
   * nothing about that corner. Replaced the silence email on 2026-08-05.
   *
   * ⚠️ **A boolean, and it may never become an age.** The server holds the
   * timestamp and reduces it before it reaches the wire, precisely so that no
   * surface here can render "47 minutes ago" beside an instrument name — that
   * is a reading, and a reading on this surface would arrive without the
   * plausibility and freshness idiom every other number on the page carries.
   */
  silent: boolean;
}

// ⚠️ **`WatchCameraRef` was here and is deleted rather than left dormant.** It
// is a wire shape, and a wire shape nothing sends is a contract claiming
// something the server does not do. The camera watch went with the on-page
// alert system: the two write routes refuse `camera_ids` with a 400.

export interface WatchSubscriptionResponse {
  /** Masked server-side, e.g. `r•••••@example.com`. Never the full address. */
  email_masked: string;
  confirmed: boolean;
  sensors: WatchSensorRef[];
  settings: WatchSettings;
  max_sensors: number;
  note: string;
  /**
   * At least half the FloodNet registry has stopped reporting, so this is our
   * outage rather than the reader's instruments failing.
   *
   * ⚠️ When true the server has already forced every `silent` above to false.
   * Render the one honest sentence about Fluud instead of N false ones
   * about their corners — see `watch.citywide_silence`.
   */
  citywide_silence: boolean;
}

/**
 * What the signed-in reader's own proven address already has — `/api/watch/mine`.
 *
 * ⚠️ **It exists so the wizard can stop re-asking.** A reader with a confirmed
 * watch used to be walked through pick → alerts → email → submit, and
 * `watch_subscribe` deliberately does not apply the picks to an existing row, so
 * the whole flow ended in a receipt that changed nothing.
 *
 * ⚠️ **It takes no parameter and answers about ONE address**, the caller's own
 * provider-verified one. There is nothing to aim it at, which is what keeps the
 * *"is this address on Fluud"* oracle unreachable rather than merely
 * unimplemented.
 *
 * ⚠️ **`watching: false` has three causes and every one means *run the wizard*
 * ** — no session (including `REQUIRE_AUTH=false`), an address the provider has
 * not verified, and a verified address with no confirmed row. **Read
 * `watching`, never the presence of `manage_token`.** The two are written
 * together on the server and a client keying off the token would be one field
 * rename from treating an unverified reader as subscribed.
 */
export interface WatchMineResponse {
  watching: boolean;
  /**
   * ⚠️ **A non-expiring bearer credential.** Same rule as
   * `WatchSubscribeResponse.manage_token`: component state only, never
   * persisted, never in a `router.push`, never logged. Absent when `watching`
   * is false.
   */
  manage_token?: string | null;
  /** The identical body `GET /api/watch/subscription` returns, so the manage
   *  face can mount from one request. Absent when `watching` is false. */
  subscription?: WatchSubscriptionResponse | null;
}

export interface WatchConfirmResponse {
  confirmed: boolean;
  /** The only response that ever carries this. Held in memory, never stored. */
  manage_token: string;
  note: string;
}

export interface WatchUnsubscribeResponse {
  status: "removed";
  note: string;
}

/**
 * ⚠️ **Identical whether or not that address is here**, exactly like
 * `WatchSubscribeResponse` — so the UI cannot tell the reader "we sent it" and
 * must not try. It says what was *asked for*, never what was found.
 *
 * This exists because the manage token is the only key to a subscription. A
 * reader who deletes the email has no other way in, and re-subscribing queues
 * nothing because the address is already taken.
 */
export interface WatchResendResponse {
  status: "pending";
  note: string;
}
