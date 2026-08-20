"""The polling loop.

    python -m waterline.poll bootstrap   # sensors, cameras, pairing, schema
    python -m waterline.poll probe       # which feeds actually answer right now
    python -m waterline.poll validate    # ...and whether what they said holds up
    python -m waterline.poll window      # ⭑ one scheduled run — THE SHIPPED SHAPE
    python -m waterline.poll run         # the endless loop
    python -m waterline.poll once        # one verbose pass

`probe` and `validate` answer different questions and both are run by a person.
`probe` is the pre-demo check: one line per feed, fast, and it fails if a feed
is down. `validate` asks whether FloodNet's numbers are self-consistent and
whether our parse agrees with FloodNet's own flood determination — slower,
wordier, read-only, and it needs no database.

## ⚠️ Two deployment shapes, and `window` is the one in production

`window` is what the Railway cron service runs on `*/15`. It ticks once, and
then keeps ticking at `POLL_SECONDS` **only while something is happening** —
see `run_window` and `_storm`. Quiet runs last about ten seconds and exit, so
between runs there is no process at all and Postgres is free to suspend. That
is the entire point: Neon bills for being awake, and a loop touching it every
sixty seconds means autosuspend can never fire.

`run` is the same loop with no way out, still started on a background thread
inside `api.py` when `POLL_IN_SERVICE` is set. Both go through
`_tick_and_stamp`, so both write `poll_ticks` and neither can drift from the
other about what a tick is.

⚠️ **A quiet run also HANDS THE DATABASE BACK before it exits** — see
`_release_compute` and `neon.py`. Exiting is not enough on its own: the compute
idles for `suspend_timeout_seconds` before Neon scales it to zero, which on the
Launch plan is 300s minimum against ~25s of actual work. Asking for the
suspension is what turns a ~36% duty cycle into ~3%. It is the last thing the
run does, it is skipped when other backends are mid-query, and it cannot affect
what was collected.

⚠️ **`run` requires the container to keep running between requests.** A host
that suspends CPU while no request is in flight stops that loop with no error at
all; `window` has no such requirement, because it is not supposed to survive.
`poll_ticks` is what reports either case from outside — `LAST_TICK_AT` cannot,
since it is a global in this module and the API process no longer runs the loop.

⚠️ **A cadence change is not local to this file.** Every staleness threshold in
`web/src/lib/staleness.ts` is a multiple of `POLL_SECONDS`, and at the wrong
values the page declares a healthy poller frozen. `scripts/parity_constants.py`
exports both cadences and `web/tests/parity.test.ts` asserts the relationship,
which is the only thing that can see the two halves move apart.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import NamedTuple
from zoneinfo import ZoneInfo

from . import (
    auth,
    cameras,
    db,
    feeds,
    floodnet,
    gauges,
    mail,
    neon,
    notify,
    watch,
)
from .config import settings
from .models import Level, Observation, SensorReadingFacts

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s"
)
log = logging.getLogger("waterline.poll")

# ⚠️ **The two cadences live in `cadence.py`, not here**, so they can be read
# without importing this module's dependency tree — `scripts/parity_constants.py`
# runs under a bare `python3` and `auth` → `fastapi` is not installed there. Read
# that file before moving them back; the failure is silent and it turns every
# cross-language assertion in the repo off. They are re-exported because every
# reader in this package and in `api.py` says `poll.POLL_SECONDS`.
from .cadence import POLL_SECONDS, POLL_WINDOW_S  # noqa: E402

# The one place UTC becomes a local hour, for `notify.in_quiet_hours`. The
# quiet window is stored as America/New_York hours because that is the city
# the instruments are in and the day the readers live — a UTC window would
# shift against their sleep twice a year without anybody touching a setting.
NYC = ZoneInfo("America/New_York")

# When the loop last completed an iteration. `/api/healthz` reports it, and it
# is what tells a reader the loop is running rather than merely alive: the
# thread can be present and unscheduled. This is stamped even when the tick
# itself raised — the question it answers is "is the loop running", not "did
# the last tick succeed". A tick that keeps failing shows up instead as reading
# age on the cards, which is the signal that actually matters.
#
# ⚠️ **It is no longer the only answer, and it is no longer the best one.** Since
# 2026-08-15 `run` also writes `poll_ticks` — our clock, whether the tick came
# back clean, and the last time a reading actually reached the database. Two
# things this global structurally cannot do and that row can: it separates a
# loop that ticks forever storing nothing from a loop that is collecting, and it
# is **correct in both deployment shapes**, because whichever process runs the
# loop writes it and whichever process serves the request reads it. See the
# `LAST_COVERAGE` tombstone below, which is the argument in full.
#
# This stays for two narrower jobs: it is the fallback for a database where
# `poll_ticks` has not been created yet, and it is what `/api/healthz` reports
# to a UI built before that field existed.
LAST_TICK_AT: datetime | None = None

# ⚠️ **`LAST_NWS` / `LAST_NWS_AT` / `LAST_NWS_TRY_AT` were here and are deleted
# rather than orphaned.** They held what NWS last said, for the gauges panel, and
# `api._nws_status` read all three of them directly.
#
# They were module globals in this file, which means they were correct in
# exactly one deployment shape — the same defect as `LAST_COVERAGE` below and
# `LAST_TICK_AT` above, now the third time it has been paid for. On 2026-08-20
# the poller moved to a scheduled container so the database could suspend
# between runs, and the API process stopped ever running `tick`. These stayed
# `None` forever and the panel claimed permanently that NWS had never been read,
# on a deployment that was polling perfectly every fifteen minutes.
#
# The fix is `nws_reads` and `db.record_nws_read` / `db.nws_read`: one row per
# mode, written by whichever process runs the loop and read by whichever process
# serves the request. **The three states survived the move intact** — they are
# three columns now for the reason they were three names before, and
# `_record_nws` still moves `attempted_at` on every try and the other two only
# on success.
#
# ⚠️ **Still DISPLAY ONLY, and that has not changed.** The second witness is
# `nws_active`, a boolean derived in `tick` through `feeds.is_witness_alert` and
# nothing else. See the block at the top of the weather section in `feeds.py`
# for why the two share a fetch and nothing more.

# Gauges are refreshed on their own, much slower clock. NOAA CO-OPS publishes
# every ~6 minutes and USGS every ~15, so fetching them every tick would ask two
# agencies we do not own for the same number sixty times an hour and get ten new
# ones — politeness to an upstream, applied to cadence.
#
# The readings still go to Postgres, and both `tick` and `/api/status` read them
# back from there rather than from a second in-process cache. That is what keeps
# the baseline correct across a restart and identical between the poll thread
# and a request handler.
GAUGE_SECONDS = 300
_LAST_GAUGE_FETCH: datetime | None = None

# `sensor_readings` is the largest table in the app by an order of magnitude —
# ~390 reporting deployments every 60s is roughly 560k rows a day, against
# `observations`' 39k. Pruning runs on its own slow clock rather than every
# tick for `GAUGE_SECONDS`' reason: a delete that finds nothing is still an index
# scan, sixty times an hour, competing with the path that actually alerts.
PRUNE_SECONDS = 3600
_LAST_PRUNE: datetime | None = None

# ⚠️ **The elapsed-time guard above is not enough on its own any more, and this
# is why.** `_LAST_PRUNE` is a module global, so it resets on every scheduled
# run — the `LAST_COVERAGE` defect in its mildest form. Under `window` on a
# fifteen-minute cron every single run would arrive with it `None` and prune,
# which is 96 index scans a day where the intent was 24.
#
# So the prune is gated on the WALL CLOCK as well: only a tick inside this UTC
# hour is eligible. The two guards do different jobs and both are needed —
# the hour decides which runs may prune, `_LAST_PRUNE` stops a storm window that
# is ticking every 60s inside that hour from pruning fifteen times.
#
# Net effect is ~4 prunes a day (four scheduled runs fall inside the hour)
# against a 7-day retention window, so nothing is kept a meaningful moment
# longer. Under the long-running `run` shape it is exactly one.
#
# 08:00 UTC is roughly 3–4am in the city the instruments are in, which is when
# the fewest people are reading. It is deliberately NOT `NYC`-local: the prune
# has no opinion about anybody's day, and a DST-shifting hour would only make
# the count above harder to reason about.
PRUNE_HOUR_UTC = 8

# How much of a tick the outbox drain may spend.
#
# ⚠️ **Both bounds are safety bounds, not tuning.** The drain runs at the end of
# `tick`, inside the same 60-second budget the whole tick shares, and each unit
# of work is a socket to a host we do not own. A dead SMTP server
# with a 10s timeout and no wall-clock bound is 25 × 10s = four minutes inside a
# one-minute tick, and the symptom would be the poller appearing to freeze —
# a frozen poller is the failure this app cares most about, and here it would be
# caused by the feature meant to work around it. 25 messages is the fan-out of
# one episode across a subscriber list this prototype caps at 500; anything not
# reached stays queued for the next tick.
MAIL_BATCH = 25
MAIL_BUDGET_S = 10.0

# ⚠️ **`LAST_COVERAGE` was here and is deleted rather than orphaned.** It held
# `(registry size, how many answered)` from the most recent city-wide snapshot,
# stamped on every exit path of `_sensor_snapshot`, and `_watch_sensors` read it
# to suppress a fan-out of silence emails during a FloodNet outage. Those emails
# were removed on 2026-08-05 and the silence signal became a line on the watch
# panel, so the last reader went with them.
#
# ⚠️ **It was briefly repointed at `api.watch_subscription` and that was wrong**,
# which is the part worth keeping written down. A module global in this file is
# only ever populated in a process running the poll loop; on an API-only instance
# (`POLL_IN_SERVICE=false`) it stays `(0, 0)`, `watch.citywide_silence` reads that
# as unmeasurable and suppresses, and the manage face claims a permanent FloodNet
# outage on a perfectly healthy deployment. `db.registry_coverage` counts the same
# thing out of Postgres, so every process gets the same answer and it survives a
# restart. **If something here ever needs coverage again, call that** — do not
# reintroduce a global that is correct in exactly one deployment shape.
#
# ⚠️ **Something did, on 2026-08-15, and this records that the instruction was
# followed.** Poller liveness had the identical defect: `LAST_TICK_AT` is a
# global in this module, so on an API-only instance it is `None` forever, and
# `lib/messages.ts` gated the entire frozen-poller row on `poll_in_service` to
# keep from painting a false fault there. The fix is `poll_ticks` and
# `db.poll_health` — a row in Postgres written by whichever process runs the
# loop. A tombstone is only worth its lines if the next person reads it before
# repeating the mistake.


class _Snapshot(NamedTuple):
    """What one pass at the display path DID, beside what it collected.

    ⚠️ **`_sensor_snapshot` has four exits and returned two values between
    them.** Three were a bare `{}` — the registry read failed, the registry is
    empty, the depth fetch failed. The fourth returned a full dict **whether or
    not the write succeeded**. So a failed write, a dead upstream and a city
    with nothing to say all arrived downstream as the same value, which is the
    collapse this app refuses everywhere else.

    `stage` is for the log. `readings` and `stored` are what the heartbeat
    carries, and the gap between them is the answer to *did this tick write*.

    ⚠️ **`depths` keeps its exact previous meaning.** `tick` hands it to the
    watched-camera path, and that reuse is licensed by
    `floodnet.DEPTHS_COMPLETE_PER_DEPLOYMENT` — a missed-alert guard. Nothing
    here touches it.

    ⚠️ **`storm` is set by `tick`, not by `_sensor_snapshot`**, because two of
    the three witnesses it reads are fetched after the snapshot returns. All
    four of `_sensor_snapshot`'s exits leave it False, which is the safe
    direction: a pass that could not see the city does not get to claim it is
    flooding, and `run_window` treats not-knowing as quiet on purpose.

    A `NamedTuple` rather than a model in `models.py` because this value never
    crosses a boundary: it is built and read inside this file.
    """

    depths: dict
    stage: str  # registry | empty | fetch | write | ok
    readings: int
    stored: int
    storm: bool = False


def _storm(depths: dict, nws_active: bool, harbor_above_flood: bool) -> bool:
    """Is anything happening — the question `run_window` speeds up for.

    ⚠️ **Three BORROWED witnesses and not one judgement of our own.**
    `nws_active` is the National Weather Service's, via `feeds.is_witness_alert`.
    `flood_detected` is FloodNet's own determination for that reading, carried
    through unread. `harbor_above_flood` is NOAA's gauge against NOAA's own minor
    flood stage. Nothing here compares a depth to a number, and nothing here may
    start to.

    ⚠️ **This decides a POLL CADENCE and nothing else.** It is not a level, it
    does not gate an alert, and no email or page state may ever be derived from
    it — `escalation.py` owns that and owns it alone. The one thing a wrong
    answer here costs is money: a false positive polls fast for fifteen minutes,
    a false negative leaves the cadence at fifteen minutes for one more window.
    That asymmetry is why it ORs three witnesses instead of requiring agreement.

    ⚠️ **`flood_detected` rather than `depth_mm >= flood_event_mm`.** The
    threshold is the same 10 mm either way, and using FloodNet's boolean means
    there is no second place in this repo where a millimetre becomes a flood.
    """
    return (
        nws_active
        or harbor_above_flood
        or any(r.flood_detected for r in depths.values())
    )


def _sensor_snapshot(now: datetime) -> _Snapshot:
    """One city-wide depth snapshot: every deployment, stored, and handed back.

    This is the display path — `/api/sensors` reads what this writes. It is
    deliberately **one** fetch shared with the watched-camera path below rather
    than two queries a minute apart, because two snapshots can disagree about
    the same sensor by a tick, and a reader comparing a camera card against that
    sensor's row would be looking at a contradiction we manufactured.

    Fails soft and loud on both halves: the display list must never be able to
    take down the path that raises warnings.

    ⚠️ **Every exit says WHICH exit it was** — see `_Snapshot`. Failing soft is
    right and failing soft indistinguishably is not, and this function was doing
    the second for as long as it has existed.
    """
    global _LAST_PRUNE

    try:
        ids = db.sensor_ids()
    except Exception as e:  # noqa: BLE001 — the display list is not the alarm
        log.warning("sensor registry read failed (%s): %s", type(e).__name__, e)
        return _Snapshot({}, "registry", 0, 0)

    if not ids:
        # Was a silent `return {}`. An empty registry on a database nobody has
        # bootstrapped renders exactly like a city with no instruments in it.
        log.warning(
            "sensor registry is empty — nothing to fetch and nothing to store. "
            "Run: python -m waterline.poll bootstrap"
        )
        return _Snapshot({}, "empty", 0, 0)

    try:
        snapshot = floodnet.fetch_depths(ids)
    except Exception as e:  # noqa: BLE001
        log.warning("city-wide depth fetch failed (%s): %s", type(e).__name__, e)
        return _Snapshot({}, "fetch", 0, 0)

    readings = list(snapshot.values())
    stage, stored = "ok", 0
    try:
        stored = db.record_sensor_readings(readings)
    except Exception as e:  # noqa: BLE001
        # ⚠️ **The snapshot still travels, deliberately, and the prune below
        # still runs.** `tick`'s watched-camera path reads this, and an unstored
        # row is a smaller harm than a missed alert. What changed on 2026-08-15
        # is that the failure stops being invisible: the `write` stage goes out
        # with it, `poll_ticks.last_store_at` freezes while `tick_at` keeps
        # moving, and `/api/healthz` can finally say a loop is running and
        # collecting nothing.
        stage = "write"
        log.error(
            "sensor reading write FAILED (%s): %s — %d readings in hand, none stored",
            type(e).__name__, e, len(readings),
        )

    # Both guards, and they do different jobs — see `PRUNE_HOUR_UTC`. The hour
    # decides which scheduled runs may prune at all; the elapsed check stops a
    # storm window ticking every 60s inside that hour from doing it fifteen
    # times over.
    due = now.hour == PRUNE_HOUR_UTC and (
        _LAST_PRUNE is None
        or (now - _LAST_PRUNE) >= timedelta(seconds=PRUNE_SECONDS)
    )
    if due:
        try:
            dropped = db.prune_sensor_readings()
            if dropped:
                log.info("pruned %d sensor readings past the retention window", dropped)
        except Exception as e:  # noqa: BLE001
            log.warning("sensor prune failed (%s): %s", type(e).__name__, e)
        # Its own try, not folded into the one above: these are two tables and
        # one failing must not stop the other being reclaimed. Same window —
        # see `db.prune_observations`, which takes `peaks.RETENTION_DAYS` for
        # the reason the sensor prune does.
        try:
            dropped = db.prune_observations()
            if dropped:
                log.info("pruned %d observations past the retention window", dropped)
        except Exception as e:  # noqa: BLE001
            log.warning("observation prune failed (%s): %s", type(e).__name__, e)
        # The watch tables ride the same hourly clock, for the same reason: a
        # delete that finds nothing is still a scan, and none of these three
        # needs to run sixty times an hour beside the path that alerts.
        try:
            _prune_watch()
        except Exception as e:  # noqa: BLE001
            log.warning("watch prune failed (%s): %s", type(e).__name__, e)
        _LAST_PRUNE = now

    return _Snapshot(snapshot, stage, len(readings), stored)


def _prune_watch() -> None:
    """Retention for the three watch tables that accumulate.

    `sensor_episodes` is deliberately absent: it only gains a row on a
    transition, so it is hundreds of rows a year against `sensor_readings`'
    560k a day. There is nothing there to reclaim and it is the record of what
    was decided.
    """
    stalled = db.requeue_stalled()
    if stalled:
        log.info("returned %d message(s) claimed by a process that died", stalled)
    dropped = db.prune_outbox()
    if dropped:
        log.info("pruned %d delivered message(s) past the retention window", dropped)
    stale = db.prune_unconfirmed()
    if stale:
        log.info("deleted %d address(es) that never confirmed", stale)


def bootstrap() -> None:
    """Build the index once: schema, sensors, cameras, and the pairing that
    turns 350 calibrated points into labels for 900 uncalibrated ones."""
    log.info("creating schema")
    db.init()

    sensors = floodnet.fetch_sensors()
    db.upsert_sensors(sensors)

    cams = cameras.fetch_cameras()
    db.upsert_cameras(cams)

    pairs = cameras.pair_cameras(cams, sensors)
    db.save_pairs(pairs)

    log.info(
        "bootstrap complete: %d sensors, %d cameras, %d pairs",
        len(sensors), len(cams), len(pairs),
    )
    if not settings.cameras:
        near = sorted(pairs, key=lambda p: p.distance_m)[:10]
        log.info("no WATCH_CAMERAS set. Closest paired cameras to start with:")
        for p in near:
            log.info("  %s  (sensor %s, %.0fm)", p.camera_id, p.sensor_id, p.distance_m)


def probe() -> int:
    """Tell me which feeds are actually up, right now, before I demo."""
    ok = True

    def check(name: str, fn):
        nonlocal ok
        try:
            result = fn()
            log.info("  %-12s OK   %s", name, result)
        except Exception as e:  # noqa: BLE001
            ok = False
            log.error("  %-12s FAIL %s: %s", name, type(e).__name__, e)

    log.info("probing feeds...")

    sensors: list = []

    def _sensors():
        nonlocal sensors
        sensors = floodnet.fetch_sensors()
        alertable = sum(1 for s in sensors if floodnet.should_alert(s))
        return f"{len(sensors)} deployments, {alertable} alert-enabled"

    def _depths():
        # Every deployment, not a slice. The `[:400]` here was a guard against
        # the old `limit: 2000` query truncating, and it hid the problem instead
        # of reporting it — `fetch_depths` now returns one row per deployment.
        ids = [s.sensor_id for s in sensors]
        d = floodnet.fetch_depths(ids)
        if not d:
            return "0 reporting"
        wet = sum(1 for r in d.values() if r.depth_mm >= settings.flood_event_mm)
        newest = max(r.observed_at for r in d.values())
        bad = [r for r in d.values() if not r.plausible]
        low = sum(1 for r in bad if r.depth_mm < floodnet.IMPLAUSIBLE_MIN_MM)

        # ⚠️ The lag distribution is the measurement `staleness.ts`'s sensor
        # thresholds are set against, and it belongs here because it is free:
        # the readings are already in hand. `observed_at` is FLOODNET's clock —
        # the instrument's own publication time — not the moment our poller
        # wrote the row, so it is a different quantity from a camera's age and
        # must not be judged against the camera constants. Getting that wrong is
        # what rendered three healthy gauges permanently amber; see `gauges.py`.
        now = datetime.now(timezone.utc)
        lags = sorted((now - r.observed_at).total_seconds() for r in d.values())

        def pct(p: float) -> float:
            return lags[min(len(lags) - 1, int(round(p * (len(lags) - 1))))]

        return (
            f"{len(d)} of {len(ids)} reporting, "
            f"{wet} above {settings.flood_event_mm}mm, "
            f"{len(bad)} implausible ({low} below the "
            f"{floodnet.IMPLAUSIBLE_MIN_MM:.0f}mm floor, "
            f"{len(bad) - low} above the {floodnet.IMPLAUSIBLE_MM:.0f}mm ceiling), "
            f"newest {newest:%H:%M:%S}Z · "
            f"lag p50 {pct(.50)/60:.1f}m p90 {pct(.90)/60:.1f}m "
            f"p99 {pct(.99)/60:.1f}m max {lags[-1]/60:.1f}m"
        )

    def _gauges():
        rs = gauges.fetch_gauges()
        if not rs:
            return "0 reporting"
        now = datetime.now(timezone.utc)
        stale = sum(1 for r in rs if now - r.observed_at > gauges.STALE_AFTER)
        high = [r.gauge_id for r in rs
                if gauges.above_minor_flood(r.gauge_id, r.level_ft)]
        # Name the Battery explicitly. It is the one gauge with a threshold, and
        # a number printed beside that threshold is how a datum mistake gets
        # caught by eye before it gets caught by a missed warning.
        bat = next((r for r in rs if r.gauge_id == gauges.BATTERY), None)
        parts = [f"{len(rs)} reporting, {stale} stale"]
        if bat:
            site = gauges.site(gauges.BATTERY)
            parts.append(
                f"Battery {bat.level_ft:.2f}ft MLLW "
                f"(minor flood {site.minor_flood_ft:.2f})"
            )
        if high:
            parts.append(f"ABOVE MINOR FLOOD: {', '.join(high)}")
        return " · ".join(parts)

    def _db():
        # ⚠️ **This was `db.init()` and a hard-coded "schema ok" for the whole of
        # this command's life**, which meant `probe` could pass cleanly against a
        # database serving an empty map. Four things now, and two of them fail.
        #
        # ⚠️ It runs against the operator's own `DATABASE_URL`. It cannot tell
        # you the DEPLOYED API and the deployed poller agree about anything —
        # `curl $URL/api/healthz` is what does that.
        db.init()
        parts = ["schema ok"]

        n = len(db.sensor_ids())
        parts.append(f"{n} deployments in the registry")
        if n == 0:
            raise RuntimeError(
                "the sensor registry is empty. Every reading path is a no-op "
                "until it is filled. Run: python -m waterline.poll bootstrap"
            )

        # The mode census — the one query in `db.py` that does not filter on
        # `settings.mode`, and the only thing anywhere that can see a mode
        # change. See `db.sensor_reading_modes`.
        census = db.sensor_reading_modes()
        mine = next((r for r in census if r["mode"] == settings.mode), None)
        others = [r for r in census if r["mode"] != settings.mode]
        if census:
            parts.append(
                "readings by mode: "
                + ", ".join(
                    f"{r['mode']}={r['n']:,}"
                    + (" <-MODE" if r["mode"] == settings.mode else "")
                    for r in census
                )
            )
        else:
            # A fresh database that has never polled. Normal, and `bootstrap`
            # plus a first tick is the fix. Not a failure.
            parts.append("no readings stored yet")

        if mine is None and others:
            raise RuntimeError(
                f"MODE={settings.mode} and sensor_readings holds NO rows under "
                "it, while "
                + ", ".join(f"{r['mode']} has {r['n']:,}" for r in others)
                + ". Every read in db.py filters on mode, so every surface will "
                "be empty while the table is full. Mode is compared exactly."
            )
        if any(
            r["mode"].upper() == settings.mode.upper() for r in others
        ):
            parts.append(
                "⚠ WARN: rows also stored under a different spelling of this "
                "mode, and they are unread"
            )

        # The heartbeat. Works in both deployment shapes, unlike LAST_TICK_AT.
        beat = db.poll_health()
        if beat is None:
            parts.append("no heartbeat row — no poller has ticked in this mode")
        else:
            now = datetime.now(timezone.utc)
            tick_age = (now - beat["tick_at"]).total_seconds() / 60
            line = f"last tick {tick_age:.1f}m ago, stored {beat['stored']}"
            if beat["last_store_at"]:
                store_age = (now - beat["last_store_at"]).total_seconds() / 60
                line += f", last store {store_age:.1f}m ago"
            else:
                line += ", NOTHING EVER STORED"
            if not beat["tick_ok"]:
                line += " (last tick did not complete clean)"
            parts.append(line)

        return " · ".join(parts)

    def _watch():
        # A new subsystem has to be visible before a demo — the convention every
        # other line here follows. The number that matters most is the oldest
        # queued message: it is the delivery-side analogue of `last_tick_at`, and
        # the only one that catches a drain that has stopped draining. `polling`
        # cannot see that and neither can a queue depth of zero.
        c = db.watch_counts()
        oldest = c["oldest_queued_s"]
        parts = [
            f"{c['confirmed']} confirmed ({c['unconfirmed']} unconfirmed), "
            f"{c['sensors']} instruments watched",
            f"outbox {c['queued']} queued"
            + (f", oldest {float(oldest) / 60:.1f}m" if oldest else "")
            + (f", {c['failed']} FAILED" if c["failed"] else ""),
            f"transport={settings.mail_transport}",
        ]
        return " · ".join(parts)

    check("floodnet", _sensors)
    check("cameras", lambda: f"{len(cameras.fetch_cameras())} cameras")
    # ⚠️ **Four numbers because there are four different claims**, and the gap
    # between the second and the fourth is the whole of the display/credibility
    # split. `witness` is what can corroborate a faulted depth; `nyc` is what the
    # gauges panel renders. **This line is also the only check on the SAME-code
    # guess in `feeds.NYC_SAME`** — if `nyc` reads 0 while `active` is high
    # during real NYC weather, the geocode key is wrong (SAME vs UGC) and every
    # alert is landing in the "elsewhere" tail.
    def _nws() -> str:
        read = feeds.fetch_nws_alerts_all()
        if not read.reachable:
            return f"UNREACHABLE — {read.detail}"
        nyc = [a for a in read.alerts if feeds.in_nyc(a)]
        witness = [a for a in read.alerts if feeds.is_witness_alert(a)]
        parts = [
            f"{len(read.alerts)} active in NY",
            f"{len(nyc)} in NYC",
            f"{len(witness)} witness (flood/rain)",
        ]
        if nyc:
            parts.append("· " + ", ".join(sorted({a.event for a in nyc})[:6]))
        return " · ".join(parts)

    check("nws", _nws)
    check("gauges", _gauges)
    check("depths", _depths)
    check("db", _db)
    check("watch", _watch)

    def _auth():
        # ⚠️ **The only thing in this repo that can catch a wrong
        # `NEON_AUTH_URL` before a reader does.** `./scripts/check` cannot
        # reach the network, and the browser-side failure is a redirect loop
        # between `/` and `/auth/sign-in` that reads as a front-end bug rather
        # than as a misconfigured URL. This fetches the key set and says what
        # came back.
        healthy, message = auth.probe()
        if not healthy:
            raise RuntimeError(message)
        return message

    check("auth", _auth)

    if settings.mail_transport == "smtp" and not settings.smtp_host:
        log.warning(
            "MAIL_TRANSPORT=smtp but SMTP_HOST is unset — every message will "
            "sit queued until it expires. Nothing will send and nothing will "
            "say so except this line."
        )
    if not settings.public_base_url:
        log.warning(
            "PUBLIC_BASE_URL unset — confirmation and manage links cannot be "
            "rendered, so no subscription can ever be confirmed and nothing "
            "will be sent to one"
        )

    web = Path(__file__).parent / "web"
    if not (web / "index.html").is_file():
        log.warning(
            "waterline/web/ is not built — the API will answer but / will 503. "
            "Run: cd web && npm ci && npm run build && npm run prod:local"
        )

    return 0 if ok else 1


# The registry as `MEASUREMENTS.md` LAST recorded it, which is not always the
# figure in its oldest section. `validate` prints the DRIFT against these and
# never fails on it: FloodNet installs sensors, so a check that goes red because
# the city grew is a check people learn to ignore. Re-measure the file rather
# than editing these downward.
#
# ⚠️ **All three count `fetch_sensors()` output, which is deployments WITH
# COORDINATES.** The raw `deployments` query answers ~21 higher, because the
# Socrata join drops the ones with no lat/lon. Comparing the raw total against
# these reports drift that does not exist — that mistake is the reason this
# comment is here.
PINNED_DEPLOYMENTS = 425      # MEASUREMENTS.md "Verified live", 2026-08-04
PINNED_ALERT_VISIBLE = 408    # ...re-measured 2026-08-07; the older figure is 401
PINNED_ALERT_PERMITTED = 343  # visible AND healthy — the gate that mails somebody
PINNED_NO_DEPTH_ROWS = 8      # rows publishing no depth column, 2026-08-05


def validate() -> int:
    """Is FloodNet's data self-consistent right now, and do we agree with it?

    A different question from `probe`, which asks *which feeds answer* in one
    line each before a demo. This asks whether the numbers those feeds returned
    hold together, and it is deliberately slow and wordy. Folding it into
    `probe` would bury the line that matters at 9pm under a page of statistics.

    Read-only and database-free: it opens no connection, writes nothing, and
    touches no table. Safe to run against production at any time.

    ⚠️ **It never says anywhere is dry.** Invariant 1 governs a diagnostic
    exactly as it governs a page. Every line here reports what an instrument
    published. The NWS block at the end states a discrepancy and draws no
    conclusion from it, because absence of coverage is not absence of flooding
    (the unobserved-not-clear rule) and this report is the last place that should be forgotten.
    """
    now = datetime.now(timezone.utc)
    log.info("validating floodnet at %s", now.isoformat(timespec="seconds"))

    # --- the registry ------------------------------------------------------
    sensors = floodnet.fetch_sensors()
    visible = [s for s in sensors if s.alert_visible]
    permitted = [s for s in sensors if floodnet.should_alert(s)]
    statuses: dict[str, int] = {}
    for s in sensors:
        statuses[s.status] = statuses.get(s.status, 0) + 1

    log.info("registry")
    log.info("  %d deployments with coordinates", len(sensors))
    log.info(
        "  %d alert_visible · %d alert_permitted (visible AND healthy)",
        len(visible), len(permitted),
    )
    log.info(
        "  status: %s",
        ", ".join(f"{k}={v}" for k, v in sorted(statuses.items(), key=lambda kv: -kv[1])),
    )
    drift = [
        f"{name} {live - pinned:+d} (pinned {pinned}, live {live})"
        for name, live, pinned in (
            ("deployments", len(sensors), PINNED_DEPLOYMENTS),
            ("alert_visible", len(visible), PINNED_ALERT_VISIBLE),
            ("alert_permitted", len(permitted), PINNED_ALERT_PERMITTED),
        )
        if live != pinned
    ]
    if drift:
        log.warning(
            "  DRIFT against MEASUREMENTS.md: %s. Re-measure that file (never "
            "edit it) and check the counts hard-coded in web/src prose",
            " · ".join(drift),
        )
    else:
        log.info("  no drift against MEASUREMENTS.md")

    # --- depths, through the PRODUCTION path -------------------------------
    # `fetch_depths` rather than a fresh query on purpose: the question is what
    # our parser produced, and a second implementation here could agree with
    # FloodNet while the real one did not.
    ids = [s.sensor_id for s in sensors]
    readings = floodnet.fetch_depths(ids)
    if not readings:
        log.error("depths: NOTHING reporting inside the window — stop here")
        return 1

    depths = sorted(r.depth_mm for r in readings.values())
    lags = sorted((now - r.observed_at).total_seconds() for r in readings.values())

    def pct(a: list[float], p: float) -> float:
        return a[min(len(a) - 1, int(round(p * (len(a) - 1))))]

    zeros = sum(1 for d in depths if d == 0.0)
    plausible = [r for r in readings.values() if r.plausible]
    bad = [r for r in readings.values() if not r.plausible]

    log.info("depths")
    log.info(
        "  %d of %d deployments reporting (%d silent or published no depth "
        "column — the floodnet: line above splits those two, and "
        "MEASUREMENTS.md records %d no-depth rows on 2026-08-05)",
        len(readings), len(ids), len(ids) - len(readings), PINNED_NO_DEPTH_ROWS,
    )
    log.info(
        "  lag min: p50 %.1f p90 %.1f p99 %.1f max %.1f",
        pct(lags, .50) / 60, pct(lags, .90) / 60, pct(lags, .99) / 60, lags[-1] / 60,
    )
    log.info(
        "  depth mm: min %.0f p50 %.0f p90 %.0f p99 %.0f max %.0f",
        depths[0], pct(depths, .50), pct(depths, .90), pct(depths, .99), depths[-1],
    )
    log.info(
        "  exactly 0.0mm: %d of %d (%.0f%%)",
        zeros, len(depths), 100 * zeros / len(depths),
    )
    log.info(
        "  at or above %dmm: %d · at or above %dmm: %d — plausible readings only",
        settings.flood_event_mm,
        sum(1 for r in plausible if r.depth_mm >= settings.flood_event_mm),
        settings.curb_height_mm,
        sum(1 for r in plausible if r.depth_mm >= settings.curb_height_mm),
    )
    log.info("  implausible and therefore rejected: %d", len(bad))

    # --- labelled ground truth ---------------------------------------------
    # Fetched BEFORE the agreement block because it is half of it. See below.
    events = floodnet.fetch_flood_events()
    running = {
        e["deployment_id"] for e in events
        if not e.get("end_time") and e.get("deployment_id")
    }
    log.info("annotated flood events (the replay corpus)")
    log.info(
        "  %d in the last %dd · %d still OPEN (no end_time)",
        len(events), floodnet.EVENTS_MAX_AGE.days, len(running),
    )
    for e in events[:5]:
        log.info(
            "    %s -> %s  %s conf=%s  %s",
            e.get("start_time"), e.get("end_time") or "OPEN", e.get("label"),
            e.get("event_confidence"), e.get("deployment_id"),
        )
    if not events:
        log.warning(
            "  none — either the city has been dry for a week or the bound in "
            "fetch_flood_events is wrong again"
        )

    # --- do we agree with FloodNet's own determination? --------------------
    # ⚠️ THE LOAD-BEARING BLOCK. Our parse and FloodNet's own judgement read the
    # same instrument, so disagreement in either direction is the signal that
    # something on our side is wrong. A parser that fabricates or eats depths
    # diverges from them long before anybody notices on a page.
    #
    # ⚠️ **TWO of their signals, because `flood_detected` alone is misleading.**
    # That per-reading flag was False on **every one of ~390 rows** across two
    # runs on 2026-08-07 — including on instruments FloodNet's own annotator had
    # opened a flood event for minutes earlier. Read alone it says we never agree
    # with FloodNet, which is false and would send somebody hunting a parser bug
    # that is not there. `flood_events` is the channel that was actually live.
    # The two have different latencies and neither is a substitute for the other.
    theirs = {r.sensor_id for r in readings.values() if r.flood_detected}
    ours = {
        r.sensor_id for r in plausible if r.depth_mm >= settings.flood_event_mm
    }
    log.info("agreement with FloodNet's own judgement")
    log.info(
        "  flood_detected on %d rows · open flood_events on %d · we would raise "
        "from depth on %d", len(theirs), len(running), len(ours),
    )
    if readings and not theirs:
        log.info(
            "  NOTE: flood_detected is false on all %d rows. Measured dormant "
            "across the whole registry on 2026-08-07 while events were open, so "
            "treat the events line as the live signal", len(readings),
        )

    confirmed = ours & running
    if confirmed:
        log.info(
            "  ✓ %d of our %d raises have an OPEN annotated event: %s",
            len(confirmed), len(ours), ", ".join(sorted(confirmed)),
        )
    for sid in sorted(ours - running - theirs):
        r = readings[sid]
        # ⚠️ Say what the rule actually is. `_depth_is_credible` returns True for
        # ANY reading inside the plausibility band — the ceiling is what demands
        # a second witness, and there is no separate "small" case. Describing
        # this as "small readings stand alone" is wrong at 427mm, which is a
        # reading this line has already printed.
        log.info(
            "  we raise, they have not annotated (yet): %s at %.0fmm — inside "
            "the plausibility band, so escalation trusts it with no second "
            "witness. Their annotation has been observed to LAG a reading",
            sid, r.depth_mm,
        )
    for sid in sorted((theirs | running) - ours):
        r = readings.get(sid)
        if r is None:
            log.warning(
                "  THEY SEE A FLOOD, WE HAVE NO READING AT ALL: %s — check it "
                "against the clock-skew list below", sid,
            )
            continue
        log.warning(
            "  THEY SEE A FLOOD, WE DO NOT: %s at %.0fmm plausible=%s — if that "
            "is a plausible reading we are dropping a flood they confirmed",
            sid, r.depth_mm, r.plausible,
        )

    # --- the clock trap, counted -------------------------------------------
    skew = floodnet.skewed_deployments(ids)
    log.info("clock skew")
    log.info(
        "  %d deployments have NOTHING inside the %s window because their "
        "newest row is out of bounds", len(skew), floodnet.MAX_AGE,
    )
    for sid, t in skew[:5]:
        log.info("    %s  newest row %s", sid, t.isoformat(timespec="seconds"))

    # --- the weather, stated beside the instruments ------------------------
    # ⚠️ This block DRAWS NO CONCLUSION and must not learn to. NWS issues flood
    # warnings from radar rainfall rate across whole counties; FloodNet measures
    # standing water at a few hundred specific corners. Rain falling and water
    # ponding are different quantities, so the two disagreeing is ordinary. It
    # is printed because a person asking "is this data valid" needs both numbers
    # on one screen, and because the answer is never "the streets are fine".
    alerts = feeds.fetch_nws_alerts()
    log.info("weather, for context only")
    log.info("  %d active NWS flood/rain alerts for NY", len(alerts))
    for a in alerts[:5]:
        log.info("    %s (%s)", a.event, a.severity)
    if alerts and not ours:
        log.info(
            "  NOTE: flood alerts are active and no instrument is reporting "
            "above %dmm. Both can be true — a county-scale rainfall warning is "
            "not a reading at an instrumented corner. This is NOT a statement "
            "that anywhere is clear; the unobserved street is the majority of "
            "the city", settings.flood_event_mm,
        )

    log.info("validate complete — every line above is what an instrument said")
    return 0


def _record_nws(read: feeds.NwsRead, now: datetime) -> None:
    """Store the NWS answer for the gauges panel. Display only; never raises.

    ⚠️ **A failed read moves `attempted_at` and nothing else.** The last thing
    NWS actually said stays on screen, ageing, under a line saying the feed could
    not be read. Overwriting it with an empty list on failure would render an
    unreachable feed as a quiet day, which is the one confusion this whole block
    exists to prevent. `db.record_nws_read` is where that is enforced, in SQL, on
    `record_poll_tick`'s rule that the database decides what survives.

    ⚠️ **Wrapped, because a display failure must not take down the tick.** What
    follows this call in `tick` writes readings and queues warnings; nothing here
    is worth losing that over — and since 2026-08-20 this touches the network,
    so it can fail in ways an assignment could not.

    `mode="json"` on the dump because the column is `jsonb` and a `datetime` is
    not JSON. Round-trips through `WeatherAlert.model_validate` in
    `api._nws_status`, which is `Lenient` and keeps whatever else NWS sent.
    """
    try:
        db.record_nws_read(
            settings.mode,
            attempted_at=now,
            checked_at=now if read.reachable else None,
            alerts=(
                [a.model_dump(mode="json") for a in read.alerts]
                if read.reachable
                else None
            ),
        )
    except Exception as e:  # noqa: BLE001
        log.warning("nws display record failed (%s): %s", type(e).__name__, e)


def _harbor(now: datetime) -> bool:
    """Refresh the gauge baseline if due, and answer: is the harbor above flood?

    Returns True only when a gauge with a published minor-flood stage is at or
    above it **and** that reading is recent enough to be evidence
    (`gauges.WITNESS_MAX_AGE`). Both halves matter. The return value reaches
    `harbor_above_flood` on both records, and only `watch.is_credible` reads
    it — in combination with a tidal sensor. So a wrong True here can admit an
    implausible depth that should have been rejected.

    Stamped even when the refresh fails, for `LAST_TICK_AT`'s reason inverted: a
    dead upstream should not be retried sixty times an hour. The last good
    reading stays in Postgres and keeps answering until it ages out on its own.
    """
    global _LAST_GAUGE_FETCH

    due = (
        _LAST_GAUGE_FETCH is None
        or (now - _LAST_GAUGE_FETCH) >= timedelta(seconds=GAUGE_SECONDS)
    )
    if due:
        try:
            db.record_gauge_readings(gauges.fetch_gauges())
        except Exception as e:  # noqa: BLE001 — the baseline is not the alarm
            log.warning("gauge refresh failed (%s): %s", type(e).__name__, e)
        _LAST_GAUGE_FETCH = now

    try:
        latest = db.latest_gauge_readings()
    except Exception as e:  # noqa: BLE001
        log.warning("gauge read-back failed (%s): %s", type(e).__name__, e)
        return False

    for r in latest:
        if now - r["observed_at"] > gauges.WITNESS_MAX_AGE:
            continue
        if gauges.above_minor_flood(r["gauge_id"], r["level_ft"]):
            log.info(
                "harbor above minor flood: %s at %.2f ft (%s)",
                r["gauge_id"], r["level_ft"], r["observed_at"].isoformat(),
            )
            return True
    return False


def tick() -> _Snapshot:
    """One pass over every watched camera.

    Returns what the city-wide sensor pass did, for `run` to stamp into
    `poll_ticks`. The watched-camera half is not in the return value: it writes
    `observations`, which has its own per-card age on the page.
    """
    now = datetime.now(timezone.utc)
    watched = settings.cameras
    if not watched:
        # ⚠️ **This returns BEFORE `_sensor_snapshot`, so an empty
        # `WATCH_CAMERAS` stops the city-wide sensor write too** — every one of
        # the 425 rows on `/api/sensors` stays null forever, on a loop that is
        # ticking perfectly. Pre-existing, and the heartbeat is what makes it
        # legible: `tick_at` moves every minute while `last_store_at` never
        # does.
        log.warning("WATCH_CAMERAS is empty — nothing to do")
        return _Snapshot({}, "cameras", 0, 0)

    with db.conn() as c:
        rows = c.execute(
            """select c.camera_id, p.sensor_id, s.tidal
               from cameras c
               left join pairs p using (camera_id)
               left join sensors s on s.sensor_id = p.sensor_id
               where c.camera_id = any(%s)
               order by c.camera_id""",
            (watched,),
        ).fetchall()

    sensor_ids = [r["sensor_id"] for r in rows if r["sensor_id"]]

    # The whole city, for the sensor list. Every deployment, stored, once.
    pass_ = _sensor_snapshot(now)
    snapshot = pass_.depths

    # ⚠️ **The snapshot may drive the watched cameras ONLY because it is complete
    # per deployment.** `distinct_on` asks for one row per sensor, so there is no
    # row cap for a watched sensor to fall off the end of — see
    # `floodnet.DEPTHS_COMPLETE_PER_DEPLOYMENT`, and trap 3 in that module.
    #
    # If that ever stops being true, this falls back to the narrow query. A
    # truncated snapshot starving the watched path of a depth is a **missed
    # alert**, and it would be silent: the camera would render as having no
    # sensor reading, which is a state the UI already draws calmly. Reusing the
    # snapshot saves one request a minute; that is not worth the failure mode,
    # so the guard is here in code rather than only in the comment above it.
    if floodnet.DEPTHS_COMPLETE_PER_DEPLOYMENT and snapshot:
        depths = {sid: snapshot[sid] for sid in sensor_ids if sid in snapshot}
    else:
        depths = floodnet.fetch_depths(sensor_ids)

    # ⚠️ **ONE read, TWO derivations.** `nws_active` is the second witness and
    # `_record_nws` is the panel; they share these bytes and nothing else. See
    # `feeds.is_witness_alert` — widening it to serve the panel is the change to
    # refuse, because the panel already gets everything.
    read = feeds.fetch_nws_alerts_all()
    nws_active = any(feeds.is_witness_alert(a) for a in read.alerts)
    _record_nws(read, now)
    harbor_above_flood = _harbor(now)

    # ⚠️ **A camera is a VIEW, not a witness.** It contributes no judgement of
    # any kind: no ordinal class, no confidence, no estimate. What this loop
    # records is its paired FloodNet sensor's depth, stamped with our own clock
    # so `/api/history` and the camera peak queries have a cadence to measure.
    observed = []
    for row in rows:
        cam_id = row["camera_id"]
        reading = depths.get(row["sensor_id"]) if row["sensor_id"] else None

        obs = Observation(
            camera_id=cam_id,
            observed_at=now,
            depth_mm=reading.depth_mm if reading else None,
            sensor_id=row["sensor_id"],
            nws_active=nws_active,
            mode=settings.mode,
            flood_detected=reading.flood_detected if reading else False,
            depth_plausible=reading.plausible if reading else True,
            # Only meaningful as a pair — see the comment on the model. The
            # harbor state is citywide; `tidal` is what makes it apply here.
            tidal=bool(row["tidal"]),
            harbor_above_flood=harbor_above_flood,
        )
        observed.append(obs)

        log.info(
            "[%s] depth=%s nws=%s",
            cam_id,
            f"{obs.depth_mm:.0f}mm" if obs.depth_mm is not None else "—",
            nws_active,
        )

    # ⚠️ **One write, after the loop, and it is not wrapped.** It used to be a
    # `db.record_observation` per camera inside the loop — 27 connections a tick
    # against a database billed for being awake. The log lines above still come
    # out one per camera, because what a person reads and what Postgres is asked
    # are different questions.
    #
    # Bare, like the per-camera call it replaces: `_sensor_snapshot` has already
    # caught its own write failure, and this one belongs to `tick`'s caller,
    # which stamps `tick_ok=False` on the heartbeat. Swallowing it here would
    # make a failed camera write invisible in exactly the way `_Snapshot` was
    # written to stop.
    db.record_observations(observed)

    # Last in the tick, after the camera loop, so it reuses `nws_active` and
    # `harbor_above_flood` rather than re-fetching them.
    #
    # Its own try/except, on `_sensor_snapshot`'s rule: the path that writes to
    # a person's inbox must never be able to take down the path that reads the
    # instruments. Same for the drain, separately.
    try:
        _watch_sensors(now, nws_active, harbor_above_flood)
    except Exception as e:  # noqa: BLE001 — the watch is not the alarm
        log.warning("watch evaluation failed (%s): %s", type(e).__name__, e)

    try:
        counts = mail.drain(MAIL_BATCH, MAIL_BUDGET_S)
        if counts:
            log.info("mail drain: %s", counts)
    except Exception as e:  # noqa: BLE001
        log.warning("mail drain failed (%s): %s", type(e).__name__, e)

    # ⚠️ **The only thing `tick` adds to what `_sensor_snapshot` returned**, and
    # it is added here because two of the three witnesses are fetched above,
    # after that call. `_replace` rather than a new tuple so the four exits keep
    # owning `stage`, `readings` and `stored` — this may not launder any of them.
    #
    # Read by `run_window` to decide whether to keep ticking. Nothing else reads
    # it, and nothing that raises an alert may start to — see `_storm`.
    return pass_._replace(storm=_storm(snapshot, nws_active, harbor_above_flood))


def _watch_sensors(
    now: datetime,
    nws_active: bool,
    harbor_above_flood: bool,
) -> None:
    """Run the watch state machine over every subscribed instrument.

    Reads the sensors back from Postgres rather than taking the in-memory
    snapshot, for `_sensor_snapshot`'s own reason inverted: the display list and
    the watch have to agree about the same instrument, and two views a tick apart
    is a contradiction we manufactured. It is also the only way to see a sensor
    that reported nothing.

    ⚠️ **Costs one query when nobody is subscribed.** `db.watched_sensor_rows`
    joins through confirmed subscriptions, so an empty list here is the normal
    state and it is cheap.

    ⚠️ **This function no longer says anything about silence, and that is the
    2026-08-05 change rather than an omission.** It used to carry a `coverage`
    argument and a `_maybe_silence` call, because a quiet instrument was an
    email and one FloodNet outage would have been one message per subscription
    inside a single tick. Silence is a line on the manage face now — computed on
    read in `api.watch_subscription`, where it cannot fan out and cannot go
    stale. What is left here is water: episodes open and escalate, and both put
    a message in the outbox.
    """
    rows = db.watched_sensor_rows()
    if not rows:
        return

    opened = escalated = closed = 0
    for row in rows:
        facts = SensorReadingFacts(
            sensor_id=row["sensor_id"],
            observed_at=row["observed_at"],
            depth_mm=row["depth_mm"],
            flood_detected=bool(row["flood_detected"]),
            # `plausible` is null together with the reading. No row means no
            # number, and there is no plausibility verdict to have about one
            # that does not exist — the default stands in for a value nothing
            # will read, because `is_credible` returns False on a null depth
            # before it ever looks at this.
            plausible=row["plausible"] if row["plausible"] is not None else True,
            alert_visible=bool(row["alert_visible"]),
            status=row["status"] or "unknown",
            tidal=bool(row["tidal"]),
            nws_active=nws_active,
            harbor_above_flood=harbor_above_flood,
            # ⚠️ Always None. It carried the worst OPEN camera alert on this
            # sensor so the ~21 paired deployments would defer to the camera's
            # episode. The on-page alert system was unwired, so there is no
            # camera level to defer to and `watch.effective_level` returns
            # `sensor_level`. Kept so re-wiring is one commit.
            camera_level=None,
        )
        place = row["name"] or row["sensor_id"]

        action, level, detail = watch.transition(
            facts, db.open_sensor_episode(facts.sensor_id)
        )
        if action == "open":
            episode_id = db.create_sensor_episode(
                facts.sensor_id, level.value, now, facts.depth_mm
            )
            _queue_watch(facts, place, level, episode_id, now, action)
            opened += 1
        elif action == "escalate":
            current = db.open_sensor_episode(facts.sensor_id)
            db.escalate_sensor_episode(
                current["id"], level.value, detail.get("peak_depth_mm")
            )
            _queue_watch(facts, place, level, current["id"], now, action)
            escalated += 1
        elif action == "close":
            # ⚠️ **The episode closes and NOBODY is written to.** The stand-down
            # email was removed on 2026-08-05, on the owner's instruction — see
            # `watch.should_notify`, which no longer lists this action. The row
            # in `sensor_episodes` is the record of what was decided and it is
            # written exactly as before; what is gone is the message about it.
            current = db.open_sensor_episode(facts.sensor_id)
            db.close_sensor_episode(current["id"], now)
            closed += 1
        elif "clear_streak" in detail:
            current = db.open_sensor_episode(facts.sensor_id)
            if current:
                db.bump_sensor_clear_streak(current["id"])

    if opened or escalated or closed:
        log.info(
            "watch: %d opened, %d escalated, %d stood down (silently), "
            "over %d subscribed instrument(s)",
            opened, escalated, closed, len(rows),
        )


def _queue_watch(
    facts: SensorReadingFacts,
    place: str,
    level: Level,
    episode_id: int,
    now: datetime,
    action: str,
) -> None:
    """Render once per language and queue it for everybody watching.

    ⚠️ **Rendered here and stored, never composed at delivery.** What went out is
    a fact; re-templating later against readings that have since moved would
    rewrite history. `db.queue_message` returns None where `outbox_once` already
    holds a row for this (subscriber, kind, episode, level), so a tick that runs
    twice cannot produce two emails about one body of water — and a real
    escalation is a different row rather than a suppressed one.

    ⚠️ **`kind` was a parameter and is now the literal `"watch"`.** It carried
    `"standdown"` too until 2026-08-05. Hard-coding it is the point: this is the
    only path left that queues a message about water, so there is nowhere for a
    second kind to arrive from without somebody deciding to add one.

    ⚠️ **The seed is why this loop does not send N different warnings.** The
    three level templates hold several reviewed sentences each and
    `agent.variant_index` picks one; seeding on the EPISODE means every
    subscriber to this episode reads the same words, and they are the same words
    the page is showing. A draw here, or a seed derived from `sub`, would make
    "which warning did I get" a question with as many answers as there are
    subscribers.

    ⚠️ **Preferences filter this loop per subscriber, and they only ever
    subtract** — `notify.allowed` runs after `watch.should_notify` decided
    there is news, and `check_notify.py` asserts an EMERGENCY passes every
    preference. `already_messaged` is read only for the one combination that
    needs it (`first` + an escalation), so the default-settings path costs no
    extra query.
    """
    hour = now.astimezone(NYC).hour
    for sub in db.subscribers_for_sensor(facts.sensor_id):
        min_level, frequency = notify.effective(
            sub["min_level"], sub["frequency"],
            sub["override_min_level"], sub["override_frequency"],
        )
        quiet = notify.in_quiet_hours(hour, sub["quiet_start"], sub["quiet_end"])
        told = (
            action == "escalate"
            and frequency == "first"
            and db.already_messaged(sub["id"], "watch", episode_id)
        )
        if not notify.allowed(level, min_level, frequency, quiet, told):
            continue
        subject, body = mail.render(
            "watch", sub["lang"], place, now,
            level=level,
            depth_mm=facts.depth_mm,
            observed_at=facts.observed_at,
            manage_token=sub["manage_token"],
            seed=f"episode:{episode_id}",
        )
        db.queue_message(
            sub["id"], "watch", subject, body, now,
            sensor_id=facts.sensor_id, episode_id=episode_id,
            level=level.value,
        )


def _log_mode_census() -> None:
    """Say which modes the reading table actually holds. Startup and `probe`.

    ⚠️ **This is the only thing in the repo that can see a MODE change.** Four
    writers stamp `settings.mode` into a row and eleven readers filter on it, so
    changing `MODE` — or typing it as `live` — empties every surface on the site
    while the table stays full. Postgres string comparison is case-sensitive and
    none of those eleven queries can tell you that is what happened.

    Diagnostic only. Nothing on the alerting path may call it, and nothing may
    branch on what it finds: what a mismatch needs is a person reading a line.
    """
    try:
        census = db.sensor_reading_modes()
    except Exception as e:  # noqa: BLE001 — a diagnostic is not the alarm
        log.warning("mode census failed (%s): %s", type(e).__name__, e)
        return

    if not census:
        return

    mine = next((r for r in census if r["mode"] == settings.mode), None)
    others = [r for r in census if r["mode"] != settings.mode]

    for r in census:
        log.info(
            "sensor_readings: %s holds %s rows, newest %s%s",
            r["mode"], f"{r['n']:,}", r["newest"],
            "  <- MODE" if r["mode"] == settings.mode else "",
        )

    if mine is None and others:
        log.warning(
            "MODE=%s and sensor_readings holds NO rows under it, while %s does. "
            "Every read in db.py filters on mode, so every surface will be empty "
            "while the table is full.",
            settings.mode,
            ", ".join(f"{r['mode']} ({r['n']:,})" for r in others),
        )
    elif others and any(r["mode"].upper() == settings.mode.upper() for r in others):
        log.warning(
            "MODE=%s and sensor_readings also holds rows under a different "
            "spelling of it: %s. Mode is compared exactly, so those rows are "
            "unread.",
            settings.mode,
            ", ".join(
                r["mode"] for r in others
                if r["mode"].upper() == settings.mode.upper()
            ),
        )


def _tick_and_stamp() -> _Snapshot | None:
    """One tick, and the heartbeat that says it happened. Never raises.

    ⚠️ **Shared by `run` and `run_window`, and it must stay shared.** The two
    deployment shapes differ only in when they stop; a heartbeat written by one
    and not the other is exactly the class of bug `poll_ticks` exists to make
    impossible. `None` means the tick raised, which the heartbeat records as
    `tick_ok=False` rather than by staying silent.
    """
    global LAST_TICK_AT

    outcome: _Snapshot | None = None
    try:
        outcome = tick()
    except Exception as e:  # noqa: BLE001 — one bad tick must not end the run
        log.exception("tick failed: %s", e)
    now = datetime.now(timezone.utc)
    LAST_TICK_AT = now

    # ⚠️ **Wrapped, for `MAIL_BUDGET_S`' reason.** The thing that reports a
    # frozen poller may never be the thing that freezes it. A heartbeat that
    # cannot be written is a warning line; a heartbeat that can end the run
    # is a worse bug than the one it was added to catch.
    try:
        db.record_poll_tick(
            settings.mode,
            now,
            ok=outcome is not None and outcome.stage == "ok",
            readings=outcome.readings if outcome else 0,
            stored=outcome.stored if outcome else 0,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("poll heartbeat write failed (%s): %s", type(e).__name__, e)

    return outcome


def run() -> None:
    log.info("waterline poller starting in %s mode", settings.mode)
    log.info("watching %d cameras every %ds", len(settings.cameras), POLL_SECONDS)
    _log_mode_census()
    while True:
        started = time.monotonic()
        _tick_and_stamp()
        time.sleep(max(1.0, POLL_SECONDS - (time.monotonic() - started)))


def _release_compute() -> None:
    """Hand the database back at the end of a quiet run. Never raises.

    ⚠️ **The LAST thing a scheduled run does, and only on the quiet exit.** By
    here the readings are written and the heartbeat is stamped; nothing this
    function does or fails to do can change what was collected. Neon bills for
    the compute being awake, and after `poll window` reduced the work to about
    twenty-five seconds every fifteen minutes, the `suspend_timeout_seconds`
    idle tail became the bill — 300s on this plan, twelve times the work.

    ⚠️ **Deliberately NOT called on the window-spent exit.** That branch means a
    storm is still running and the next scheduled run is due immediately;
    suspending there buys nothing and pays a cold start to get back a database
    we are about to use again.

    ⚠️ **The `other_active_backends` check is a guard, not politeness.**
    Suspending terminates connections, so doing it while the API is mid-request
    turns a cost optimisation into a 500 on a flood map. If anyone else is
    working, leave it — the next run will find it quiet. See `db` for why this
    is racy and why that is accepted.
    """
    if not neon.configured():
        return

    try:
        busy = db.other_active_backends()
    except Exception as e:  # noqa: BLE001 — never let the tail break the run
        log.warning("could not check for other backends (%s): %s", type(e).__name__, e)
        return

    if busy:
        log.info("leaving the compute up — %d other backend(s) mid-query", busy)
        return

    log.info("compute release: %s", neon.suspend())


def run_window(budget_s: float = POLL_WINDOW_S) -> int:
    """One SCHEDULED run: tick, and keep ticking only while a storm is on.

    This is the shape the deployment actually uses now. A container starts, this
    runs, and it exits — so between runs there is no process, and the database
    is free to suspend. `run` above is the same loop with no way out and is what
    `POLL_IN_SERVICE` still starts inside the API.

        quiet  ->  one tick, ~10 seconds of container, exit
        storm  ->  tick every POLL_SECONDS until the window is spent

    ⚠️ **The escalation is the whole reason this is not just `once` on a cron.**
    A fifteen-minute cadence is right for a dry city and indefensible during a
    flash flood, which is the one hour this product exists for. So the run asks
    what it just saw and decides for itself; nothing outside has to know.

    ⚠️ **It exits on the FIRST quiet tick rather than riding out the window.**
    A storm that stops between two ticks stops costing money at the next one,
    and the following scheduled run picks it up fifteen minutes later — which is
    the correct cadence for a city that is no longer flooding.

    ⚠️ **`budget_s` must be the CRON INTERVAL, not more.** Railway skips a
    scheduled run while the previous one is still alive, so a window longer than
    the interval does not stack — it silently becomes the cadence, and the
    schedule stops meaning anything. Left at `POLL_WINDOW_S`, which is written
    against `*/15`.

    Returns the number of ticks it ran, for the caller to log. Nothing branches
    on it.
    """
    log.info(
        "scheduled run in %s mode: %d cameras, up to %.0fs, escalating to %ds "
        "if anything is happening",
        settings.mode, len(settings.cameras), budget_s, POLL_SECONDS,
    )
    started = time.monotonic()
    ticks = 0

    while True:
        tick_started = time.monotonic()
        outcome = _tick_and_stamp()
        ticks += 1

        # ⚠️ A tick that RAISED is treated as quiet, and that is deliberate.
        # `None` means we do not know what the city is doing, and the answer to
        # not knowing is not to hammer a failing path sixty times an hour — the
        # next scheduled run is a clean process against the same feeds.
        if outcome is None or not outcome.storm:
            log.info(
                "quiet after %d tick(s) in %.0fs — exiting until the next run",
                ticks, time.monotonic() - started,
            )
            _release_compute()
            return ticks

        spent = time.monotonic() - started
        if spent + POLL_SECONDS >= budget_s:
            # Checked BEFORE the sleep, so the window bounds when the last tick
            # STARTS rather than when it ends — `MAIL_BUDGET_S`' rule. Otherwise
            # a run overruns its own schedule by a whole tick.
            log.info(
                "storm still on, but the %.0fs window is spent after %d tick(s) "
                "— the next scheduled run continues it",
                budget_s, ticks,
            )
            return ticks

        log.info("storm: tick %d, %.0fs of the window left", ticks, budget_s - spent)
        time.sleep(max(1.0, POLL_SECONDS - (time.monotonic() - tick_started)))


def main() -> int:
    p = argparse.ArgumentParser(prog="waterline.poll")
    p.add_argument(
        "command",
        choices=["bootstrap", "probe", "validate", "run", "window", "once"],
    )
    args = p.parse_args()

    if args.command == "bootstrap":
        bootstrap()
    elif args.command == "probe":
        return probe()
    elif args.command == "validate":
        return validate()
    elif args.command == "window":
        # The shipped shape: what the Railway cron service runs on `*/15`.
        run_window()
    elif args.command == "once":
        # One verbose pass. It says what the pass DID as well as what it saw —
        # `stage` is the difference between a quiet city and a failed write, and
        # this is the command a person runs to find out which.
        out = tick()
        log.info(
            "pass: stage=%s, %d readings in hand, %d stored",
            out.stage, out.readings, out.stored,
        )
    else:
        run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
