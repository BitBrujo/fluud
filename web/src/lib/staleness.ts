/**
 * When a reading stops being a reading.
 *
 * This is the UI half of the frozen-poller rule. If the poll loop stops — the host
 * throttling is the likely cause — the API keeps serving the last readings it
 * stored and the page looks perfectly healthy while showing water levels from
 * forty minutes ago. In a tool whose premise is that stale information gets
 * people hurt, that is the wrong failure mode.
 *
 * Per-card reading age is the PRIMARY enforcement, not the health banner.
 * `/healthz` reports `polling` from `_poller.is_alive()`, and a thread frozen
 * by the host is alive — just never scheduled. The banner can only catch a
 * poller that has fully exited (or, with `last_tick_at`, one whose stamp has
 * gone cold). The cards catch every case, because they measure the data.
 */

/* --- the poll cadence, which every threshold below is a multiple of --------
 *
 * ⚠️ **These mirror `poll.POLL_SECONDS` and `poll.POLL_WINDOW_S`, and
 * `parity.test.ts` is what holds them in step.** Until 2026-08-20 the numbers
 * below were hand-tuned against a 60s loop and nothing could see the loop
 * change. When the poller moved to a fifteen-minute schedule so the database
 * could suspend between runs, all four became wrong in the same instant: cards
 * reading stale two thirds of the time, and a permanent *the poller is frozen*
 * banner on a deployment that was polling perfectly.
 *
 * ⚠️ **Two cadences, and the thresholds hang off the SLOW one.** The poller
 * ticks every `POLL_WINDOW_S` when the city is quiet and escalates to
 * `POLL_SECONDS` the moment any witness says otherwise — so the worst case a
 * threshold has to tolerate is the quiet one, and the case that actually
 * matters polls fifteen times faster than these allow for.
 */
export const POLL_SECONDS = 60;
export const POLL_WINDOW_S = 900;

/**
 * What the poller says it is doing. `/api/healthz` reports both.
 *
 * ⚠️ **The wire beats the bundle.** The constants above are compiled in, but
 * the deployed cadence is also a Railway cron expression that can be edited
 * without a rebuild. Where a wrong answer is most damaging — the frozen-poller
 * banners in `messages.ts` — the reported cadence is used instead.
 */
export interface Cadence {
  pollSeconds: number;
  pollWindowS: number;
}

export const DEFAULT_CADENCE: Cadence = {
  pollSeconds: POLL_SECONDS,
  pollWindowS: POLL_WINDOW_S,
};

/**
 * The cadence a health payload reports, falling back to what we were built
 * with. Anything missing or non-positive takes the default — an older API that
 * predates these fields must not produce a zero threshold, which would call
 * every poller frozen the instant it answered.
 */
export function cadenceOf(reported: Partial<Cadence> | null | undefined): Cadence {
  const pollSeconds = reported?.pollSeconds;
  const pollWindowS = reported?.pollWindowS;
  return {
    pollSeconds:
      typeof pollSeconds === "number" && pollSeconds > 0
        ? pollSeconds
        : POLL_SECONDS,
    pollWindowS:
      typeof pollWindowS === "number" && pollWindowS > 0
        ? pollWindowS
        : POLL_WINDOW_S,
  };
}

/**
 * Twenty minutes: one whole quiet window, plus slack for a run that started
 * late. Same number as `rat.REPLAY_MAX_AGE_S` and the same judgement —
 * comfortably longer than the cadence, so it fires when something has actually
 * stopped rather than when a scheduled run was a little behind.
 *
 * ⚠️ **A constant, not a function, unlike the two poller thresholds below**, and
 * that is a deliberate limit rather than an oversight. `freshnessOf` is called
 * from sixteen render paths that have no health payload in hand, and threading
 * one through all of them to re-derive a number that only moves when this repo
 * is rebuilt would be a large change for no protection — `parity.test.ts`
 * already fails if this drifts from the Python cadence. The two thresholds that
 * DO take a live cadence are the ones where being wrong prints an accusation.
 */
export const STALE_AFTER_S = POLL_WINDOW_S + 300;

/** Three quiet windows. Past this the still is not worth showing at all. */
export const DEAD_AFTER_S = 3 * POLL_WINDOW_S;

/**
 * How cold `tick_at` may go before the poller counts as frozen: three whole
 * scheduled windows. One missed run is a slow cron, three is a stopped loop.
 *
 * ⚠️ **This got fifteen times looser on 2026-08-20 and that is a real cost,
 * paid on purpose.** A genuinely dead poller now goes unflagged for 45 minutes
 * where it used to be 3. What buys it back is that the loop escalates to
 * `POLL_SECONDS` during a storm, so the window in which this matters most is
 * also the window in which the poller is ticking sixty times faster — and the
 * per-card reading age, not this banner, is the primary enforcement either way.
 */
export function tickColdAfterS(cadence: Cadence = DEFAULT_CADENCE): number {
  return 3 * cadence.pollWindowS;
}

/**
 * How long `writes.last_store_at` may go without moving before the poller
 * counts as ticking without collecting.
 *
 * ⚠️ **This is not `tickColdAfterS` and reusing that number here would be the
 * gauges' mistake a third time.** Three intervals measures OUR loop against our
 * own clock, which is the right question for `tick_at`. This one asks whether a
 * NEW FloodNet reading has landed, and a new row appears only when FloodNet
 * publishes one — per-sensor lag runs to p99 22.5 min. Across ~390 deployments
 * something new lands almost every tick, so it fires on a real stall rather
 * than on a slow feed.
 *
 * ⚠️ **It has to clear BOTH bounds, which is why it is a `max`.** Three quiet
 * windows covers our cadence; the 1800s floor covers FloodNet's own p99 lag,
 * and it is that floor that would bite first if the window were ever shortened
 * again. The old value of 900 satisfied only the second, and at a fifteen
 * minute cadence it sat exactly on the boundary and flapped.
 *
 * ⚠️ **Neither number is a MEASUREMENT**, on the same footing as
 * `prune_sensor_readings`' seven days. The reading this owes is the longest gap
 * between two ticks with `stored > 0` over 24 hours. Do not quote it as
 * measured until that is in `MEASUREMENTS.md`.
 */
export function storeColdAfterS(cadence: Cadence = DEFAULT_CADENCE): number {
  return Math.max(3 * cadence.pollWindowS, 1800);
}

export type Freshness = "fresh" | "stale" | "dead";

export function freshnessOf(ageSeconds: number): Freshness {
  if (ageSeconds >= DEAD_AFTER_S) return "dead";
  if (ageSeconds >= STALE_AFTER_S) return "stale";
  return "fresh";
}

/**
 * Gauges run on a different clock, and reusing the camera numbers above would
 * be actively wrong.
 *
 * ⚠️ **Sampling interval is not publication lag, and the second one is what
 * these thresholds have to be built on.** The first draft of this file assumed
 * they were the same and set stale at 30 minutes, which rendered three of the
 * four healthy USGS gauges permanently amber on the first page load.
 *
 * Measured over 48 hours, all four USGS sites:
 *
 *     samples        190 per 48h — every 15 minutes, median gap 15m, max gap 15m
 *     newest point   21 to 81 minutes behind wall clock
 *
 * So the instruments are sampling perfectly on schedule and the *telemetry*
 * arrives up to an hour and a half late. A gauge an hour behind is a normal
 * gauge, and colouring it amber says "something is wrong" about the ordinary
 * case. An indicator that is always warning is an indicator nobody reads, which
 * costs the real signal on the day a gauge actually dies.
 *
 * Three hours is comfortably past the worst lag observed, with margin; twelve
 * is a gauge that has stopped. The age text is shown either way — colour is
 * reserved for "this has gone wrong", not for "this is a few minutes old".
 *
 * Verified against the failure this must catch: USGS returns
 * `01406710 Raritan River at South Amboy` under `siteStatus=active` with a most
 * recent value from **2016**. A gauge like that has to reach the page reading
 * dead — never dropped, never shown as current.
 *
 * These deliberately do NOT feed `gauges.WITNESS_MAX_AGE` on the server, which
 * is much tighter (60 min) because it governs what may act as *evidence* rather
 * than what may be *displayed*. It also only ever applies to a gauge with a
 * published flood stage, which today means the Battery alone — and NOAA CO-OPS
 * lags about 9 minutes, not 80. Different question, different instrument,
 * different number; neither should be derived from the other.
 */
export const GAUGE_STALE_AFTER_S = 10800;
export const GAUGE_DEAD_AFTER_S = 43200;

export function gaugeFreshnessOf(ageSeconds: number): Freshness {
  if (ageSeconds >= GAUGE_DEAD_AFTER_S) return "dead";
  if (ageSeconds >= GAUGE_STALE_AFTER_S) return "stale";
  return "fresh";
}

/**
 * FloodNet sensors are a third clock, and this is the same mistake avoided a
 * second time.
 *
 * ⚠️ **A camera's `observed_at` and a sensor's are not the same quantity.** A
 * camera's is stamped by *our poller* at the moment it fused the observation
 * (`poll.py`), so its age measures whether our loop is running — the frozen-poller rule.
 * A sensor's is **FloodNet's own `time`**: the instrument's publication clock,
 * which we do not control and which keeps ticking whether or not we are
 * healthy. Judging one against the other's thresholds is exactly the error
 * `gaugeFreshnessOf` exists to correct, and it would be worse here because
 * there are 425 of them.
 *
 * Measured 2026-08-05 across all 425 deployments in one request, as
 * `now − observed_at` over the 390 that answered:
 *
 *     p50   1.0 min      p90   2.2 min
 *     p99  22.5 min      max  48.1 min
 *
 * So the typical sensor is a minute behind and the tail runs to about
 * three quarters of an hour. Against the camera numbers (300s / 1800s) roughly
 * one sensor in twenty would render amber on every load and the worst few red —
 * the permanently-amber gauge regression, repeated at twenty times the scale.
 *
 * **One hour** is 2.7x the p99 and clears the observed max with margin, so it
 * fires when a sensor has actually stopped rather than when its telemetry is
 * taking its time. **Three hours** is dead.
 *
 * ⚠️ Three hours rather than six is deliberate: `floodnet.MAX_AGE` bounds the
 * depth query at 6h, so a sensor past that has no reading in the payload *at
 * all* and renders as never-reported (an em-dash, no fault mark). Setting dead
 * at the window boundary would leave that red band unreachable. At three hours
 * there is a real interval in which a dying sensor is visibly dying before it
 * disappears.
 *
 * Re-derive both from `poll probe`'s lag line if FloodNet's cadence changes.
 * The failure is silent in both directions: too tight and every healthy sensor
 * cries wolf, too loose and a dead one reads as current.
 */
export const SENSOR_STALE_AFTER_S = 3600;
export const SENSOR_DEAD_AFTER_S = 10800;

export function sensorFreshnessOf(ageSeconds: number): Freshness {
  if (ageSeconds >= SENSOR_DEAD_AFTER_S) return "dead";
  if (ageSeconds >= SENSOR_STALE_AFTER_S) return "stale";
  return "fresh";
}
