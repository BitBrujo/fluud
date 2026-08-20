"""Thin psycopg layer. DML only — schema lives in schema.sql."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import peaks
from .config import settings
from .models import Camera, GaugeReading, Observation, Sensor


@contextmanager
def conn() -> Iterator[psycopg.Connection]:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as c:
        yield c


def init() -> None:
    from pathlib import Path

    sql = (Path(__file__).parent.parent / "schema.sql").read_text()
    with conn() as c:
        c.execute(sql)
        c.commit()


def upsert_sensors(sensors: list[Sensor]) -> int:
    if not sensors:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """insert into sensors
                 (sensor_id, slug, name, lat, lon, deployed_at, nta, borough,
                  tidal, status, alert_visible, ground_height_mm)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (sensor_id) do update set
                 slug = excluded.slug, name = excluded.name,
                 lat = excluded.lat, lon = excluded.lon,
                 nta = excluded.nta, borough = excluded.borough,
                 tidal = excluded.tidal, status = excluded.status,
                 alert_visible = excluded.alert_visible,
                 ground_height_mm = excluded.ground_height_mm""",
            [
                (s.sensor_id, s.slug, s.name, s.lat, s.lon, s.deployed_at,
                 s.nta, s.borough, s.tidal, s.status, s.alert_visible,
                 s.ground_height_mm)
                for s in sensors
            ],
        )
        c.commit()
    return len(sensors)


def upsert_cameras(cameras: list[Camera]) -> int:
    if not cameras:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """insert into cameras (camera_id, name, lat, lon, image_url, borough)
               values (%s, %s, %s, %s, %s, %s)
               on conflict (camera_id) do update set
                 name = excluded.name, lat = excluded.lat,
                 lon = excluded.lon, image_url = excluded.image_url,
                 borough = excluded.borough""",
            [(c_.camera_id, c_.name, c_.lat, c_.lon, c_.image_url, c_.borough)
             for c_ in cameras],
        )
        c.commit()
    return len(cameras)


def save_pairs(pairs: list[Any]) -> int:
    if not pairs:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """insert into pairs (camera_id, sensor_id, distance_m)
               values (%s, %s, %s)
               on conflict (camera_id) do update set
                 sensor_id = excluded.sensor_id,
                 distance_m = excluded.distance_m""",
            [(p.camera_id, p.sensor_id, p.distance_m) for p in pairs],
        )
        c.commit()
    return len(pairs)


def record_observations(observations: list[Observation]) -> int:
    """Store one tick's worth of camera readings. Idempotent per (camera, time, mode).

    The only number here is the paired FloodNet sensor's depth. A camera
    produces nothing of its own, so there is nothing else to store — and no
    argument may be added that would let a guess arrive beside a calibrated
    millimetre.

    ⚠️ **This took a single `Observation` and one connection PER CAMERA until
    2026-08-20**, which at 27 watched cameras was 27 TCP connections a tick and
    ~39,000 a day. `conn()` is a bare `psycopg.connect` with no pool, so each one
    was a real connect, and the whole set describes one instant — there was never
    a reason for them to arrive separately. Now it is one `executemany` in one
    connection, which is what `record_sensor_readings` has always done for the
    425-row city-wide write beside it.

    Connection count is the point rather than row count: it is what decides
    whether a database that bills for wakefulness can ever go back to sleep.

    ⚠️ **`do nothing`, not `do update`** — `record_sensor_readings`' rule. These
    rows are stamped with OUR clock, so a conflict means this tick already wrote,
    and re-stamping it would make a repeated tick look like fresh evidence.

    Returns rows actually inserted, on `record_sensor_readings`' terms. Nothing
    reads it today: the camera half is deliberately not on `_Snapshot`, because
    `observations` has its own per-card age on the page. It is here so a caller
    that wants to log the difference does not have to count twice.
    """
    if not observations:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """insert into observations
                 (camera_id, observed_at, depth_mm, sensor_id,
                  nws_active, mode, depth_plausible)
               values (%s, %s, %s, %s, %s, %s, %s)
               on conflict (camera_id, observed_at, mode) do nothing""",
            [
                (
                    obs.camera_id,
                    obs.observed_at,
                    obs.depth_mm,
                    obs.sensor_id,
                    obs.nws_active,
                    obs.mode,
                    # Which displayed depths this poller judged faulted.
                    # `latest_observations`' `o.*` picks it up for free.
                    obs.depth_plausible,
                )
                for obs in observations
            ],
        )
        inserted = cur.rowcount
        c.commit()
    # Negative means the driver could not say — see `record_sensor_readings`.
    return inserted if inserted >= 0 else len(observations)


def record_gauge_readings(readings: list[GaugeReading]) -> int:
    """Store the harbor/stream baseline. Idempotent per (gauge, time, mode).

    `do nothing` rather than `do update` for the same reason as
    `record_observations`: gauges are polled more often than they publish, so the
    same reading arrives several times before a new one exists. Re-storing it is
    a no-op, not a duplicate and not a fresher timestamp.
    """
    if not readings:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """insert into gauge_readings (gauge_id, observed_at, level_ft, mode)
               values (%s, %s, %s, %s)
               on conflict (gauge_id, observed_at, mode) do nothing""",
            [(r.gauge_id, r.observed_at, r.level_ft, settings.mode) for r in readings],
        )
        c.commit()
    return len(readings)


def latest_gauge_readings(mode: str | None = None) -> list[dict]:
    """The most recent reading per gauge. No age filter — deliberately.

    A gauge that stopped reporting in 2016 must arrive here so the UI can render
    it as dead. Dropping it would make a dead instrument indistinguishable from
    one nobody configured, which is the same class of error as a blank card
    reading as calm.
    """
    with conn() as c:
        cur = c.execute(
            """select distinct on (gauge_id) gauge_id, observed_at, level_ft
               from gauge_readings
               where mode = %s
               order by gauge_id, observed_at desc""",
            (mode or settings.mode,),
        )
        return cur.fetchall()


def gauge_history(hours: int = 24, per_gauge: int = 200) -> list[dict]:
    """Recent level for **every** gauge, oldest first within each gauge.

    One query for all five rather than an endpoint per gauge, because the UI
    draws all five sparklines at once and five round trips to render one panel
    is five chances for one card to be a poll behind its neighbours.

    ⚠️ The rows are not comparable across `gauge_id` and nothing here makes them
    so — no ordering by level, no shared normalisation, no aggregate. NOAA is
    referenced to MLLW and each USGS site to its own local datum; grouping them
    in one result set is a transport convenience and must never become an axis.
    See the derivation comment in `gauges.py`.

    A window function rather than a `distinct on`: we want the last N points per
    gauge, and the two networks publish on different cadences (~6 min vs ~15),
    so a flat `limit` would give the Battery a day and a creek a week.
    """
    with conn() as c:
        cur = c.execute(
            """select gauge_id, observed_at, level_ft from (
                 select gauge_id, observed_at, level_ft,
                        row_number() over (
                          partition by gauge_id order by observed_at desc
                        ) as rn
                 from gauge_readings
                 where mode = %s and observed_at > now() - make_interval(hours => %s)
               ) t
               where rn <= %s
               order by gauge_id, observed_at""",
            (settings.mode, hours, per_gauge),
        )
        return cur.fetchall()


def record_sensor_readings(readings: list) -> int:
    """Store every deployment's own depth. Idempotent per (sensor, time, mode).

    `do nothing` rather than `do update`, for `record_gauge_readings`' reason:
    we poll every 60s and FloodNet publishes on its own cadence, so the same
    reading arrives several times before a new one exists. Re-storing it is a
    no-op — not a duplicate, and crucially not a fresher timestamp. A row whose
    `observed_at` crept forward on every poll would make a frozen sensor look
    alive, which is the frozen-poller rule wearing a different hat.

    ⚠️ **Returns rows ACTUALLY INSERTED, and it returned rows offered until
    2026-08-15.** With `do nothing` a skipped row affects zero, so this is the
    count of new readings. That is the number `poll_ticks.stored` carries and
    the whole of what separates *a tick that stored nothing new* from *a tick
    that stored 390*. A caller wanting the size of what it handed over already
    has it — it passed the list in.
    """
    if not readings:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """insert into sensor_readings
                 (sensor_id, observed_at, depth_mm, flood_detected, plausible, mode)
               values (%s, %s, %s, %s, %s, %s)
               on conflict (sensor_id, observed_at, mode) do nothing""",
            [
                (r.sensor_id, r.observed_at, r.depth_mm, r.flood_detected,
                 r.plausible, settings.mode)
                for r in readings
            ],
        )
        inserted = cur.rowcount
        c.commit()
    # psycopg sums affected rows across `executemany`. A negative rowcount means
    # the driver could not say, and reporting that as zero stored would be a
    # false alarm about the write path — so it degrades to the count offered.
    return inserted if inserted >= 0 else len(readings)


def sensor_ids() -> list[str]:
    """The deployment registry, from Postgres rather than a re-fetch.

    It only changes on `bootstrap`, so asking FloodNet for the list on every
    tick would be a second request to answer a question we already have stored —
    and it would make the poll loop's behaviour depend on an upstream index
    being up at that moment.
    """
    with conn() as c:
        cur = c.execute("select sensor_id from sensors order by sensor_id")
        return [r["sensor_id"] for r in cur.fetchall()]


def sensor_status(watched: list[str], mode: str | None = None) -> list[dict]:
    """The whole sensor registry with each one's newest reading.

    ⚠️ **Both joins are `lateral … limit 1`, and neither is optional.**

    `pairs` is keyed by `camera_id`, so two cameras may legitimately point at the
    same sensor — a plain join multiplies that sensor into two rows and the UI
    renders one instrument twice. The lateral takes one.

    That pair lateral is also restricted to `watched`, and the restriction is
    the whole meaning of the column. The question this answers is *does this
    sensor's depth label a camera view we actually poll* — true only for a
    sensor paired to a camera in `WATCH_CAMERAS`. *Is there any camera near it*
    is a different question with a different answer — 131 pairs exist, 27 are
    watched.

    ⚠️ **It gates nothing.** The email watch is `watch.py`, which has no camera
    in it and admits every `alert_permitted` sensor — ~343 of them — so a null
    here means *no camera view* and never *inert*.

    ⚠️ **No age filter, deliberately** — `latest_gauge_readings`' rule. A sensor
    that stopped reporting in 2019 must arrive here so the UI can render it dead.
    Dropping it makes a dead instrument indistinguishable from one nobody
    configured, and leaves the reader to assume the silence means nothing is
    wrong. Absence is the one thing this app may not render as calm.
    """
    with conn() as c:
        cur = c.execute(
            """select s.sensor_id, s.name, s.lat, s.lon, s.borough, s.nta,
                      s.tidal, s.status, s.alert_visible, s.ground_height_mm,
                      p.camera_id as watched_camera_id,
                      r.observed_at, r.depth_mm, r.flood_detected, r.plausible
               from sensors s
               left join lateral (
                 select pp.camera_id from pairs pp
                 where pp.sensor_id = s.sensor_id
                   and pp.camera_id = any(%s)
                 order by pp.distance_m
                 limit 1
               ) p on true
               left join lateral (
                 select rr.observed_at, rr.depth_mm, rr.flood_detected,
                        rr.plausible
                 from sensor_readings rr
                 where rr.sensor_id = s.sensor_id and rr.mode = %s
                 order by rr.observed_at desc
                 limit 1
               ) r on true
               order by s.sensor_id""",
            (watched, mode or settings.mode),
        )
        return cur.fetchall()


def camera_registry(mode: str | None = None) -> list[dict]:
    """Every DOT camera in the registry, with its pairing and that sensor's
    newest reading. 968 rows, against `latest_observations`' 27.

    ⚠️ **This is a different question from `latest_observations` and the two must
    not be collapsed.** That one reads `observations`, which `poll.tick` writes
    only for `settings.cameras` — so it structurally cannot see more than the 27
    cameras this poller watches. This reads the registry itself and hangs the
    paired sensor's own `sensor_readings` row off it, so all 130 paired cameras
    carry a live depth with no change to `WATCH_CAMERAS` and no new polling.

    ⚠️ **A `left join lateral … limit 1`, never a `distinct on`.** `distinct on
    (sensor_id) … order by observed_at desc` would sort the whole
    ~560k-rows-a-day `sensor_readings` table to answer a question about 130
    sensors. `sensor_status` already runs this exact shape for the same reason
    and `sensor_readings_time (sensor_id, observed_at desc)` is the index both
    want — **no new index is needed**. The inner `where` is false immediately for
    the 838 rows with no `p.sensor_id`, so it descends 130 times.

    ⚠️ **No `and rr.plausible` in that lateral.** This is a *latest* reading, not
    a peak: the four peak queries filter plausibility because a fault is not a
    high-water mark, and this one carries it to the wire instead so the digits
    stay and the *claim* changes. Never render a depth without its plausibility.

    ⚠️ **It returns `distance_m` raw and classifies nothing.** `alert_permitted`
    never appears in a `where` clause in this module and this follows the same
    rule: the row carries the number, `api` puts it through `cameras.pair_tier`,
    and that stays the single authority — assertable with no database.

    ⚠️ **No `where` on borough or on tier.** The filter belongs to the reader and
    happens in the browser, over rows it holds, because the browser is what has
    to be able to say how many cameras it is NOT drawing.
    """
    with conn() as c:
        cur = c.execute(
            """select c.camera_id, c.name, c.lat, c.lon, c.image_url, c.borough,
                      p.sensor_id, p.distance_m,
                      r.observed_at as depth_observed_at, r.depth_mm, r.plausible
               from cameras c
               left join pairs p using (camera_id)
               left join lateral (
                 select rr.observed_at, rr.depth_mm, rr.plausible
                 from sensor_readings rr
                 where rr.sensor_id = p.sensor_id and rr.mode = %s
                 order by rr.observed_at desc
                 limit 1
               ) r on true
               order by c.camera_id""",
            (mode or settings.mode,),
        )
        return cur.fetchall()


def sensor_history(sensor_id: str, limit: int = 240) -> list[dict]:
    """Recent depth for one sensor, oldest first. Mirrors `history()`."""
    with conn() as c:
        cur = c.execute(
            """select observed_at, depth_mm, plausible from sensor_readings
               where sensor_id = %s and mode = %s
               order by observed_at desc limit %s""",
            (sensor_id, settings.mode, limit),
        )
        return list(reversed(cur.fetchall()))


def prune_sensor_readings(days: int = peaks.RETENTION_DAYS) -> int:
    """Drop sensor readings older than `days`. DML, not DDL — see schema.sql.

    Arithmetic, and it is why this exists at all: ~390 reporting deployments ×
    1440 ticks a day is roughly **560k rows/day**, against `observations`' 39k.
    This is by far the largest table in the app and it is the only one whose
    growth is driven by a number we do not control.

    Nothing in the UI reads past a few hours — the list wants the newest reading
    and a trace wants a couple of hundred points — so the window is retention
    policy rather than a functional bound.
    """
    with conn() as c:
        cur = c.execute(
            "delete from sensor_readings where observed_at < now() - "
            "make_interval(days => %s)",
            (days,),
        )
        c.commit()
        return cur.rowcount


def prune_observations(days: int = peaks.RETENTION_DAYS) -> int:
    """Drop camera observations older than `days`. Same window, same reason.

    ⚠️ **This table was unbounded until now, and it was the only one left.**
    `sensor_readings` has been pruned since it existed because its growth is
    driven by a number we do not control; `observations` is driven by a number
    we do — `WATCH_CAMERAS` — so it grew slower and nobody noticed. At 27
    watched cameras it is ~39k rows/day, which is 71 MB and climbing ~14 MB/day
    on a database whose storage is billed.

    ⚠️ **It takes `RETENTION_DAYS` rather than a window of its own, and that is
    the whole point.** `peaks.RETENTION_DAYS` is already the ceiling on what a
    depth window may ask for on BOTH kinds — the camera side simply happened to
    be able to answer past it. Giving this its own number would let the two
    faces of one panel disagree about what this app can be asked, which is the
    confusion that comment was written to prevent. A retention change stays one
    edit.
    """
    with conn() as c:
        cur = c.execute(
            "delete from observations where observed_at < now() - "
            "make_interval(days => %s)",
            (days,),
        )
        c.commit()
        return cur.rowcount


def latest_observations(mode: str | None = None) -> list[dict]:
    with conn() as c:
        cur = c.execute(
            # `s.nta` comes through the sensor recorded on the observation
            # itself, not through `pairs` — so the neighborhood reported is the
            # one belonging to the sensor that actually produced this reading,
            # even if the pairing has since been recomputed. LEFT joined: an
            # unpaired camera has no sensor and therefore no NTA, which is a
            # real answer and renders as nothing rather than as a guess.
            """select distinct on (o.camera_id)
                 o.*, c.name, c.lat, c.lon, c.image_url, s.nta
               from observations o
               join cameras c using (camera_id)
               left join sensors s on s.sensor_id = o.sensor_id
               where o.mode = %s
               order by o.camera_id, o.observed_at desc""",
            (mode or settings.mode,),
        )
        return cur.fetchall()


def history(camera_id: str, limit: int = 240) -> list[dict]:
    with conn() as c:
        cur = c.execute(
            """select observed_at, depth_mm from observations
               where camera_id = %s and mode = %s
               order by observed_at desc limit %s""",
            (camera_id, settings.mode, limit),
        )
        return list(reversed(cur.fetchall()))


# --- the depth peak over a window -------------------------------------------
# Two functions, one idea applied twice — the same shape `escalation.transition`
# and `watch.transition` have, and kept as two for the same reason: the two
# tables carry the plausibility verdict under different column names
# (`observations.depth_plausible`, `sensor_readings.plausible`) and one
# parameterised query would have to interpolate an identifier to unify them.
#
# ⚠️ **Both filter on plausibility, and that is the second-witness rule's display half.** A
# faulted rangefinder's 1451 mm is stored on purpose — it is the evidence the
# instrument is broken — but a maximum is exactly where it would stop looking
# like evidence and start looking like water. See `peaks.py`.
#
# ⚠️ **One round trip, and the outer `where` is what makes a 404 possible.**
# Selecting from `cameras` / `sensors` and hanging the aggregate off a lateral
# means an unknown id returns NO ROW, while a known instrument with an empty
# window returns a row full of nulls. Those are different answers and the route
# gives them different statuses; an aggregate query alone cannot tell them apart
# and would report a typo'd id as "nothing recorded", which is the silent-default
# failure this codebase refuses everywhere else.


def camera_depth_peak(camera_id: str, minutes: int) -> dict | None:
    """Highest plausible depth observed at one camera in the last `minutes`.

    `None` when the camera is unknown. A known camera with nothing in the window
    returns `peak_mm: None` and `readings: 0` — a real answer about a real
    instrument, and never a zero depth.
    """
    with conn() as c:
        cur = c.execute(
            """select c.camera_id, p.peak_mm, p.peak_at, p.readings, p.faulted,
                      p.newest_at
               from cameras c
               left join lateral (
                 select count(*) filter (where o.depth_plausible) as readings,
                        -- Counted, not just excluded. A window whose every
                        -- reading is a fault has NO peak and is NOT empty, and
                        -- those two answers must not render as one sentence:
                        -- the first says the instrument is broken, the second
                        -- says nobody looked. See the response model.
                        count(*) filter (where not o.depth_plausible) as faulted,
                        max(o.depth_mm) filter (where o.depth_plausible)
                          as peak_mm,
                        -- Over ALL readings, plausible or not: this answers
                        -- "when did we last hear from this instrument", which a
                        -- faulted reading answers perfectly well.
                        max(o.observed_at) as newest_at,
                        -- WHEN the peak happened, in the same scan as the peak
                        -- itself. `max()` cannot answer this and a second
                        -- lateral would walk the window twice; ordering inside
                        -- the aggregate is the one-pass form. No plausible row
                        -- -> array_agg is NULL -> [1] is NULL, which is the
                        -- answer we want anyway.
                        (array_agg(o.observed_at
                                   order by o.depth_mm desc, o.observed_at desc)
                           filter (where o.depth_plausible)
                        )[1] as peak_at
                 from observations o
                 where o.camera_id = c.camera_id
                   and o.mode = %s
                   and o.observed_at >= now() - make_interval(mins => %s)
                   -- Nullable here and not on the sensor side: a camera with no
                   -- co-located sensor records observations with no depth at
                   -- all, and absence must not be counted as a reading OR as a
                   -- fault. It is neither.
                   and o.depth_mm is not null
               ) p on true
               where c.camera_id = %s""",
            (settings.mode, minutes, camera_id),
        )
        return cur.fetchone()


def camera_depth_peaks(minutes: int) -> list[dict]:
    """The same aggregate as `camera_depth_peak`, for EVERY camera at once.

    Backs the instrument list, which renders a peak per row when the reader
    picks a timeframe. One request rather than one per row: at 27 cameras that
    would be tolerable and at 425 sensors it is not, and the two kinds must not
    diverge in how they are fetched.

    ⚠️ **Three deliberate differences from the single-instrument version**, all
    of them about it being a bulk read:

    - **It groups from the reading table rather than left-joining from
      `cameras`.** That lateral exists so the route can tell *unknown
      instrument* (404) from *empty window* (200 with a null peak). A caller
      here is iterating a list it already has, so an id simply missing from the
      result IS the empty window, and there is no 404 to distinguish. Absence
      is still not zero: see the model, which forbids the client inventing one.
    - **No `peak_at`.** `array_agg(... order by ...)` per group would sort every
      row in the window across all instruments, and no list row renders the
      figure. The detail panel still asks the single-instrument route, which
      still answers it.
    - **No `newest_at`.** Every surface that shows an age already has one from
      `/api/status` or `/api/sensors`, on the instrument's own clock.

    What is NOT different, and may not become different: the peak is over
    `plausible` readings only and the faulted rows are COUNTED rather than
    merely excluded. Both halves are the second-witness rule's display rule, and a caller
    that gets a peak without its two counts cannot tell an empty window from a
    broken instrument.
    """
    with conn() as c:
        cur = c.execute(
            """select o.camera_id                                      as id,
                      count(*) filter (where o.depth_plausible)        as readings,
                      count(*) filter (where not o.depth_plausible)    as faulted,
                      max(o.depth_mm) filter (where o.depth_plausible) as peak_mm
                 from observations o
                where o.mode = %s
                  and o.observed_at >= now() - make_interval(mins => %s)
                  -- Absence of a depth is neither a reading nor a fault, exactly
                  -- as in the single-camera query above.
                  and o.depth_mm is not null
                group by o.camera_id""",
            (settings.mode, minutes),
        )
        return cur.fetchall()


def sensor_depth_peaks(minutes: int) -> list[dict]:
    """`camera_depth_peaks` over `sensor_readings`. Same shape, same rules.

    `sensor_readings.depth_mm` is `not null` by schema — a depth-less upstream
    row is dropped in `floodnet._first_num` rather than stored as a zero — so
    there is no null-depth filter here, which is the one way it differs from the
    camera query beside it.

    Measured against the live registry: **401 groups in 25.6 ms** over 442k rows
    at the widest window the control offers (7 days), and 14.9 ms at an hour.
    That is the number that makes one row-per-instrument fetch unnecessary.
    """
    with conn() as c:
        cur = c.execute(
            """select r.sensor_id                                as id,
                      count(*) filter (where r.plausible)        as readings,
                      count(*) filter (where not r.plausible)    as faulted,
                      max(r.depth_mm) filter (where r.plausible) as peak_mm
                 from sensor_readings r
                where r.mode = %s
                  and r.observed_at >= now() - make_interval(mins => %s)
                group by r.sensor_id""",
            (settings.mode, minutes),
        )
        return cur.fetchall()


def sensor_depth_peak(sensor_id: str, minutes: int) -> dict | None:
    """Highest plausible depth reported by one FloodNet deployment in a window.

    Mirrors `camera_depth_peak`. `sensor_readings.depth_mm` is `not null` by
    schema — a depth-less upstream row is dropped in `floodnet._first_num`
    rather than stored as a zero — so there is no null-depth filter here.
    """
    with conn() as c:
        cur = c.execute(
            """select s.sensor_id, p.peak_mm, p.peak_at, p.readings, p.faulted,
                      p.newest_at
               from sensors s
               left join lateral (
                 select count(*) filter (where r.plausible)     as readings,
                        count(*) filter (where not r.plausible) as faulted,
                        max(r.depth_mm) filter (where r.plausible) as peak_mm,
                        max(r.observed_at) as newest_at,
                        (array_agg(r.observed_at
                                   order by r.depth_mm desc, r.observed_at desc)
                           filter (where r.plausible)
                        )[1] as peak_at
                 from sensor_readings r
                 where r.sensor_id = s.sensor_id
                   and r.mode = %s
                   and r.observed_at >= now() - make_interval(mins => %s)
               ) p on true
               where s.sensor_id = %s""",
            (settings.mode, minutes, sensor_id),
        )
        return cur.fetchone()


# --- the sensor watch ------------------------------------------------------
# DML for the four tables at the foot of schema.sql. Same idioms as everything
# above: `with conn() as c`, raw SQL, `%s` params, an explicit commit, and
# `list[dict]` out.
#
# ⚠️ **`alert_permitted` never appears in any `where` clause here**, and it is
# the one rule in this section that is not a style preference. Invariant 9 says
# `floodnet.alert_permitted` is the single authority for which deployments may
# raise an alarm, and a hand-copied `status in ('good','ok','active')` in SQL is
# a second authority for a life-safety predicate. These functions return the raw
# `alert_visible` and `status` columns; the caller passes them through the one
# implementation. See `waterline/CLAUDE.md`.


def create_subscriber(
    email: str,
    lang: str,
    confirm_token: str,
    manage_token: str,
    min_level: str = "watch",
    frequency: str = "every",
    quiet_start: int | None = None,
    quiet_end: int | None = None,
    *,
    confirmed: bool = False,
) -> dict | None:
    """Store an address that asked to be told about instruments.

    ⚠️ **Returns None when the address is already here**, and the route must
    answer a caller identically either way. Two reasons, and the second is the
    stronger one: a different response would let anyone test whether a given
    address is on this list, and a second confirmation message is the only way
    an unauthenticated endpoint that sends mail can be turned on a third party.
    `subscribers.email` is `unique`, so the conflict clause is that control.

    The preference values arrive validated — `api._validated_settings` is the
    door, and this function stores what it is given. Defaults reproduce the
    pre-wizard behaviour exactly.

    ⚠️ **`confirmed=True` skips double opt-in and there is exactly ONE legal
    caller**: `api.watch_subscribe`'s verified-self branch, where the address
    equals an `email_verified` claim on a JWT this server checked against Neon's
    JWKS. `grep -rn 'confirmed=True' waterline/` is the whole audit, and it must
    return one line.

    ⚠️ **A keyword argument rather than a second function, on purpose.** A
    `create_confirmed_subscriber` would be a second copy of the `on conflict
    (email) do nothing` clause, and that clause *is* the abuse control above —
    two copies is one careless refactor from one of them losing it. The default
    is `False`, so every pre-existing call site is unchanged by construction.
    """
    with conn() as c:
        cur = c.execute(
            """insert into subscribers
                 (email, lang, confirm_token, manage_token,
                  min_level, frequency, quiet_start, quiet_end, confirmed_at)
               values (%s, %s, %s, %s, %s, %s, %s, %s,
                       case when %s then now() end)
               on conflict (email) do nothing
               returning id, email, lang, confirm_token, manage_token,
                         confirmed_at, created_at""",
            (email, lang, confirm_token, manage_token,
             min_level, frequency, quiet_start, quiet_end, confirmed),
        )
        row = cur.fetchone()
        c.commit()
        return row


def confirm_subscriber(confirm_token: str) -> dict | None:
    """Prove the address wanted this. Idempotent — a re-click is not an error.

    `confirmed_at` is only stamped once (`coalesce`), so a mail client that
    prefetches the link and a reader who then presses it themselves do not race
    to two different timestamps. The manage token comes back because this is the
    one response that is allowed to hand it over: the holder of a live confirm
    token has just proven they hold the mailbox.
    """
    with conn() as c:
        cur = c.execute(
            """update subscribers set confirmed_at = coalesce(confirmed_at, now())
               where confirm_token = %s
               returning id, email, lang, manage_token, confirmed_at""",
            (confirm_token,),
        )
        row = cur.fetchone()
        c.commit()
        return row


def subscriber_by_manage_token(token: str) -> dict | None:
    with conn() as c:
        cur = c.execute(
            """select id, email, lang, confirmed_at, created_at,
                      min_level, frequency, quiet_start, quiet_end
               from subscribers where manage_token = %s""",
            (token,),
        )
        return cur.fetchone()


def update_subscriber_prefs(
    subscriber_id: int,
    min_level: str,
    frequency: str,
    quiet_start: int | None,
    quiet_end: int | None,
) -> None:
    """Replace the global preferences. Validated at the door, stored whole.

    Whole, not a diff — the wizard's save is a statement of what the reader
    wants now, `set_subscriptions`' rule applied to four columns.
    """
    with conn() as c:
        c.execute(
            """update subscribers
               set min_level = %s, frequency = %s,
                   quiet_start = %s, quiet_end = %s
               where id = %s""",
            (min_level, frequency, quiet_start, quiet_end, subscriber_id),
        )
        c.commit()


def set_subscriptions(
    subscriber_id: int, subs: list[tuple[str, str | None, str | None]]
) -> int:
    """Replace the whole set, in one transaction.

    Delete-then-insert rather than a diff: the request is a statement of what
    the reader wants watched now, and computing the difference here would be a
    second place for the set to be wrong. An empty list is legitimate and means
    "watch nothing" — it is not the same as unsubscribing, which deletes the
    address as well.

    Each entry is `(sensor_id, min_level, frequency)` — the two overridable
    preferences ride with the interest, null meaning "the global applies".
    """
    with conn() as c, c.cursor() as cur:
        cur.execute("delete from subscriptions where subscriber_id = %s",
                    (subscriber_id,))
        if subs:
            cur.executemany(
                """insert into subscriptions
                     (subscriber_id, sensor_id, min_level, frequency)
                   values (%s, %s, %s, %s) on conflict do nothing""",
                [(subscriber_id, sid, ml, fq) for sid, ml, fq in subs],
            )
        c.commit()
    return len(subs)


def set_camera_subscriptions(
    subscriber_id: int, subs: list[tuple[str, str | None, str | None]]
) -> int:
    """Replace the whole camera set. `set_subscriptions`, other id namespace.

    A separate function over a shared helper on purpose: the two tables must
    not blur, and a helper taking a table name is SQL built from strings.
    """
    with conn() as c, c.cursor() as cur:
        cur.execute("delete from camera_subscriptions where subscriber_id = %s",
                    (subscriber_id,))
        if subs:
            cur.executemany(
                """insert into camera_subscriptions
                     (subscriber_id, camera_id, min_level, frequency)
                   values (%s, %s, %s, %s) on conflict do nothing""",
                [(subscriber_id, cid, ml, fq) for cid, ml, fq in subs],
            )
        c.commit()
    return len(subs)


def subscriptions_for(subscriber_id: int) -> list[dict]:
    """What this subscriber watches, with enough registry detail to name it.

    Left joined to `sensors`: a subscription to a deployment the registry no
    longer carries is a real state, and it must render as a sensor id with no
    name rather than vanishing from the reader's own list.

    ⚠️ **`last_reading_at` is a timestamp and it is NOT a reading.** It carries
    no depth and no plausibility, and `api.watch_subscription`
    turns it into a boolean before it reaches the wire — the watch shapes may not
    carry an age (see the banner above `WatchSubscribeResponse` in `models.py`).
    It exists so the manage face can say which instruments have gone quiet, which
    replaced the silence email on 2026-08-05.

    The `lateral … limit 1` is `sensor_status`' pattern and it is there for the
    same reason: `sensor_readings` holds ~560k rows a day, so this asks the index
    for one row per subscription rather than aggregating the table.
    """
    with conn() as c:
        cur = c.execute(
            """select sub.sensor_id, sub.min_level, sub.frequency,
                      s.name, s.borough, s.alert_visible,
                      s.status, r.observed_at as last_reading_at
               from subscriptions sub
               left join sensors s on s.sensor_id = sub.sensor_id
               left join lateral (
                 select observed_at from sensor_readings
                 where sensor_id = sub.sensor_id
                 order by observed_at desc limit 1
               ) r on true
               where sub.subscriber_id = %s
               order by sub.sensor_id""",
            (subscriber_id,),
        )
        return cur.fetchall()


def camera_subscriptions_for(subscriber_id: int) -> list[dict]:
    """What this subscriber watches among the CAMERAS. `subscriptions_for`'s
    sibling, without the reading lateral — a camera ref carries no silence
    signal (see `WatchCameraRef`), so there is no timestamp to reduce.

    Left joined to `cameras` on the same rule: a subscription to a camera the
    registry no longer carries renders as an id with no name rather than
    vanishing from the reader's own list.
    """
    with conn() as c:
        cur = c.execute(
            """select sub.camera_id, sub.min_level, sub.frequency, cam.name
               from camera_subscriptions sub
               left join cameras cam on cam.camera_id = sub.camera_id
               where sub.subscriber_id = %s
               order by sub.camera_id""",
            (subscriber_id,),
        )
        return cur.fetchall()


def registry_coverage(within: timedelta) -> tuple[int, int]:
    """(registry size, how many reported inside `within`). For the silence gate.

    ⚠️ **This reads Postgres rather than `poll.LAST_COVERAGE`, and the reason is
    a deployment shape rather than taste.** That module global is stamped by
    `_sensor_snapshot`, so it is only ever populated in a process running the
    poll loop. On an API-only instance — `POLL_IN_SERVICE=false`, i.e. the
    production-shaped split the root `CLAUDE.md` describes as optional — it stays
    `(0, 0)` forever, and `watch.citywide_silence` reads that as an unmeasurable
    tick and suppresses. The manage face would then claim a citywide FloodNet
    outage permanently, on a perfectly healthy deployment. Measured exactly that
    way before this function existed.

    Postgres is the single source of truth for `sensor_readings` already, so
    both processes get the same answer and the signal survives a restart.

    ⚠️ **`within` should be `watch.SENSOR_STALE_AFTER`, so that the citywide
    judgement and the per-instrument one are the same rule at two scales.** If
    an instrument is silent when it has not reported for an hour, then "how much
    of the city is silent" has to be counted the same way, or the panel can
    suppress a line it would never have drawn — or draw N lines while denying
    the outage they add up to.
    """
    with conn() as c:
        row = c.execute(
            """select (select count(*) from sensors) as total,
                      (select count(distinct sensor_id) from sensor_readings
                        where observed_at >= now() - %s) as reporting""",
            (within,),
        ).fetchone()
    return int(row["total"]), int(row["reporting"])


# --- the poller's heartbeat -------------------------------------------------
# ⚠️ **Three functions here, and they exist because `poll.LAST_TICK_AT` is a
# module global.** `registry_coverage` above already carries the argument in
# full: a global in `poll.py` is populated in exactly one deployment shape, and
# the API-only instance reads it as a permanent outage. That function's docblock
# ends by saying Postgres is where a fact both processes need has to live. This
# is that instruction applied to liveness rather than to coverage.


def record_poll_tick(
    mode: str, at: datetime, ok: bool, readings: int, stored: int
) -> None:
    """The poller's heartbeat, one upserted row per mode.

    ⚠️ **`last_store_at` only moves when `stored` is above zero, and the `case`
    is in SQL for a reason.** Computing it in Python means reading the old value
    and writing it back, and a tick that stored nothing would advance the column
    that exists to say a tick stored nothing. The database decides.

    `coalesce(excluded.…, poll_ticks.…)` is the other half: a tick with nothing
    to store leaves the previous timestamp standing rather than nulling it.
    """
    with conn() as c:
        c.execute(
            """insert into poll_ticks
                 (mode, tick_at, tick_ok, readings, stored, last_store_at)
               values (%s, %s, %s, %s, %s, case when %s > 0 then %s end)
               on conflict (mode) do update set
                 tick_at       = excluded.tick_at,
                 tick_ok       = excluded.tick_ok,
                 readings      = excluded.readings,
                 stored        = excluded.stored,
                 last_store_at = coalesce(excluded.last_store_at,
                                          poll_ticks.last_store_at)""",
            (mode, at, ok, readings, stored, stored, at),
        )
        c.commit()


def poll_health(mode: str | None = None) -> dict | None:
    """The heartbeat row for one mode, or `None` if no poller has ticked in it.

    ⚠️ **The two absences above this function are different and the caller must
    keep them apart.** `None` here means the table exists and holds no row for
    this mode — nothing has ever polled it, which is a positive statement and
    the whole of what a bare `uvicorn` run looks like. An **exception** means
    the table is not there or the read failed, which is *we could not ask*.
    Collapsing them puts a service that has never collected anything and a
    service whose database is unreachable behind one blank space.

    One row, by primary key. Nothing here is a scan.
    """
    with conn() as c:
        return c.execute(
            """select mode, tick_at, tick_ok, readings, stored, last_store_at
               from poll_ticks where mode = %s""",
            (mode or settings.mode,),
        ).fetchone()


def other_active_backends() -> int:
    """How many OTHER clients are mid-query on this database right now.

    ⚠️ **The guard on `neon.suspend`, and the reason it is a guard rather than a
    nicety.** Suspending a Neon compute terminates its connections, so asking
    for it while the API is serving somebody means their request dies — a 500 on
    a flood map, caused by a cost optimisation. The poller checks first and
    leaves the compute alone if anyone else is working; the next scheduled run
    will find it quiet.

    ⚠️ **It is inherently racy and that is accepted, not overlooked.** A request
    can arrive in the moment between this answer and the API call. The window is
    about a second, the cost is one failed request that a retry fixes, and the
    alternative — never suspending — is the thing being fixed. What this removes
    is the *likely* case, not the possible one.

    Excludes our own backend and Postgres's own workers: `state <> 'idle'` is
    what makes it *mid-query* rather than merely connected, which matters
    because `conn()` opens and closes around every call and a pooler may hold
    idle sessions open indefinitely.
    """
    with conn() as c:
        row = c.execute(
            """select count(*) as n from pg_stat_activity
               where pid <> pg_backend_pid()
                 and datname = current_database()
                 and backend_type = 'client backend'
                 and state <> 'idle'"""
        ).fetchone()
    return int(row["n"]) if row else 0


def record_nws_read(
    mode: str,
    attempted_at: datetime,
    checked_at: datetime | None,
    alerts: list | None,
) -> None:
    """What NWS last said, one upserted row per mode. See `poll._record_nws`.

    ⚠️ **A failed read moves `attempted_at` and NOTHING else, and the `coalesce`
    is what enforces it.** Pass `checked_at=None` and the previous success —
    both its timestamp and its payload — stays standing. Overwriting the alert
    list with `[]` because the feed was unreachable would render an outage as a
    quiet day, which is the single confusion this whole path exists to prevent.

    That is the same division of labour `record_poll_tick` uses for
    `last_store_at`: the caller says what happened, the database decides what
    survives it.
    """
    with conn() as c:
        c.execute(
            """insert into nws_reads (mode, attempted_at, checked_at, alerts)
               values (%s, %s, %s, coalesce(%s, '[]'::jsonb))
               on conflict (mode) do update set
                 attempted_at = excluded.attempted_at,
                 checked_at   = coalesce(excluded.checked_at,
                                         nws_reads.checked_at),
                 alerts       = case when excluded.checked_at is null
                                     then nws_reads.alerts
                                     else excluded.alerts end""",
            (mode, attempted_at, checked_at,
             Jsonb(alerts) if alerts is not None else None),
        )
        c.commit()


def nws_read(mode: str | None = None) -> dict | None:
    """The NWS row for one mode, or `None` if nothing has ever fetched in it.

    ⚠️ **`None` and an exception are different**, on `poll_health`'s rule. `None`
    means the table is there and holds no row — no poller has ever asked NWS,
    which is a positive statement and what a freshly bootstrapped database looks
    like. An exception is *we could not ask the database*, and `/api/status`
    already fails whole on that (see `db.latest_observations` at the top of it),
    so there is nothing here to catch.

    One row, by primary key. Nothing here is a scan.
    """
    with conn() as c:
        return c.execute(
            """select mode, attempted_at, checked_at, alerts
               from nws_reads where mode = %s""",
            (mode or settings.mode,),
        ).fetchone()


def sensor_reading_modes() -> list[dict]:
    """(mode, rows, newest) over the WHOLE of `sensor_readings`. For `probe`.

    ⚠️ **This is the one query in this file that deliberately does not filter on
    `settings.mode`, and adding that filter turns it into a query that always
    reports itself healthy.** Every other read of these tables is scoped to the
    configured mode. That is correct for all of them and it is exactly why
    nothing can see a mode change: flip `MODE`, or type it as `live`, and all
    eleven of them go quiet against a table holding millions of rows. This is
    the only thing in the repo that can say so.

    ⚠️ **Never call it from a request handler.** No index leads on `mode`, so it
    is a full scan of the biggest table in the database. `poll.probe` is a
    command a person runs before a demo and a scan there is free.
    """
    with conn() as c:
        cur = c.execute(
            # `n` rather than `rows`: ROWS is a reserved keyword, and
            # `as rows` parses only because the `as` is explicit. That is a
            # thin thing for a diagnostic to rest on.
            """select mode, count(*) as n, max(observed_at) as newest
               from sensor_readings group by mode order by n desc"""
        )
        return cur.fetchall()


def confirmed_subscriber_by_email(email: str) -> dict | None:
    """Look up a **confirmed** address, for the manage-link resend.

    ⚠️ **`confirmed_at is not null` is in the SQL and it is the abuse control,
    not a filter.** `api.watch_resend` takes an address from an unauthenticated
    caller and sends mail to it, so the only thing keeping that from being a way
    to mail a stranger is that the address must already have completed double
    opt-in. Move this predicate into Python, or forget it in a later refactor,
    and the endpoint becomes an open mailer. It sits beside
    `subscribers_for_sensor`'s identical clause for the same reason: this is a
    fact about a row in this table, never a judgement about a sensor.

    ⚠️ **There is still no function here that LISTS subscribers**, and there
    must not be. This takes an address the caller already typed and answers about
    that one row; it cannot enumerate, and the route above it cannot report what
    it found. See the note at the top of this section.
    """
    with conn() as c:
        cur = c.execute(
            """select id, email, lang, manage_token from subscribers
               where email = %s and confirmed_at is not null""",
            (email,),
        )
        return cur.fetchone()


def unconfirmed_subscriber_by_email(email: str) -> dict | None:
    """The sibling above's opposite half, for re-sending a CONFIRMATION.

    ⚠️ **`confirmed_at is null` is the abuse control here, exactly as its
    negation is one function up, and the two must stay mutually exclusive.**
    Together they partition the table, and each route branch may only ever send
    the one message its half is entitled to: a manage link to somebody who
    completed double opt-in, and a repeat of its own confirmation to somebody
    who has not. Widening either predicate — dropping the clause, or making one
    function answer for both states — hands the confirmed reader's manage token
    to an address that never proved it owned the mailbox.

    ⚠️ **It returns `confirm_token`, which the confirmed half deliberately does
    not select.** That token is the only credential an unconfirmed row has, it
    lives in a mailbox rather than a browser, and re-sending it is the whole
    point of this lookup — but it may never leave `api.py` in a response body.
    See `api.watch_resend`, which puts it in a rendered message and returns the
    same two fields it returns for an address that does not exist.

    Enumeration is refused on the same terms as above: an address the caller
    already typed, one row, and a route that cannot report what it found.
    """
    with conn() as c:
        cur = c.execute(
            """select id, email, lang, confirm_token, manage_token
               from subscribers
               where email = %s and confirmed_at is null""",
            (email,),
        )
        return cur.fetchone()


def confirm_message_count(subscriber_id: int) -> int:
    """How many confirmations this row has ever been queued. The lifetime cap.

    ⚠️ **This counts out of `outbox` rather than from a column on `subscribers`,
    and the retention windows are what make that sound.** `prune_outbox` keeps
    resolved rows for 30 days and `prune_unconfirmed` deletes the subscriber at
    7, so every `confirm` message an unconfirmed row was ever sent outlives the
    row itself. The count cannot be reset by a prune while there is anything
    left to reset it for.

    ⚠️ **A column would have been the intuitive implementation and it is the one
    to refuse.** The **Never** rule in the root `CLAUDE.md` enumerates what
    `subscribers` may hold, and a send counter is not on it — LIMITATIONS §16's
    third ground is that this table never accumulates. The outbox already
    records that somebody was written to; asking it is free and stores nothing.

    Counts every status, `failed` and `expired` included. The question is how
    many times this address has been mailed at, and a message the relay refused
    still left this process.
    """
    with conn() as c:
        cur = c.execute(
            "select count(*) as n from outbox "
            "where subscriber_id = %s and kind = 'confirm'",
            (subscriber_id,),
        )
        row = cur.fetchone()
        return int(row["n"]) if row else 0


def delete_subscriber(manage_token: str) -> int:
    """Unsubscribe. A hard delete, and the cascade is the whole point.

    One delete removes the address, every interest and every message still
    queued for them. A soft-delete flag would leave behind a record of a person
    who asked to leave, which is the thing they asked us to stop holding.
    """
    with conn() as c:
        cur = c.execute("delete from subscribers where manage_token = %s",
                        (manage_token,))
        c.commit()
        return cur.rowcount


def subscriber_count() -> int:
    """Every row, confirmed or not — this backs the ceiling in `api.py`.

    Counting only confirmed addresses would let an unconfirmed flood sit under
    the cap forever, which is the shape of the abuse the cap exists to bound.
    """
    with conn() as c:
        return c.execute("select count(*) as n from subscribers").fetchone()["n"]


def watch_counts() -> dict:
    """The numbers `poll.probe` prints. Aggregates only, deliberately.

    ⚠️ There is no function here that lists subscribers, and there must not be
    one. A surface that answers "who is watching this corner" is the targeting
    list LIMITATIONS §16 spends its length arguing this table is not.
    """
    with conn() as c:
        return c.execute(
            """select
                 (select count(*) from subscribers
                   where confirmed_at is not null)              as confirmed,
                 (select count(*) from subscribers
                   where confirmed_at is null)                  as unconfirmed,
                 (select count(distinct sub.sensor_id)
                    from subscriptions sub join subscribers s
                      on s.id = sub.subscriber_id
                   where s.confirmed_at is not null)            as sensors,
                 (select count(*) from outbox
                   where status = 'queued')                     as queued,
                 (select count(*) from outbox
                   where status = 'failed')                     as failed,
                 (select extract(epoch from (now() - min(queued_at)))
                    from outbox where status = 'queued')        as oldest_queued_s
            """
        ).fetchone()


def watched_sensor_rows(mode: str | None = None) -> list[dict]:
    """Every sensor at least one CONFIRMED subscriber asked about, with state.

    Restricted to subscribed sensors rather than reusing `sensor_status`, and
    the restriction is the cost model: with nobody subscribed this whole feature
    is one cheap query per tick and no fan-out at all.

    Two things ride along and each is read by exactly one rule:

    - `alert_visible` / `status` are the **raw** columns. The predicate is
      applied in Python by `floodnet.alert_permitted` — see the note at the top
      of this section.
    - `tidal` gates the harbor witness. A Battery reading corroborates a tidal
      sensor because that is one body of water at two instruments; under an
      inland stormwater sensor it corroborates nothing.

    ⚠️ **`camera_levels` was a third and it is gone.** It carried every OPEN
    camera alert on this sensor so `watch.effective_level` could defer to it.
    The on-page alert system was unwired and the `alerts` table went with it.

    ⚠️ **No age filter on the reading lateral**, on `sensor_status`' rule. A
    sensor that stopped reporting must arrive here, because its silence is the
    thing we have to tell somebody about. Dropping the row would make a dead
    instrument indistinguishable from a calm one, which is the exact failure
    this feature is most at risk of.
    """
    m = mode or settings.mode
    with conn() as c:
        cur = c.execute(
            """select s.sensor_id, s.name, s.borough, s.tidal,
                      s.status, s.alert_visible,
                      r.observed_at, r.depth_mm, r.flood_detected, r.plausible
               from sensors s
               join (
                 select distinct sub.sensor_id from subscriptions sub
                 join subscribers subr on subr.id = sub.subscriber_id
                 where subr.confirmed_at is not null
               ) w on w.sensor_id = s.sensor_id
               left join lateral (
                 select rr.observed_at, rr.depth_mm, rr.flood_detected,
                        rr.plausible
                 from sensor_readings rr
                 where rr.sensor_id = s.sensor_id and rr.mode = %s
                 order by rr.observed_at desc
                 limit 1
               ) r on true
               order by s.sensor_id""",
            (m,),
        )
        return cur.fetchall()


def subscribers_for_sensor(sensor_id: str) -> list[dict]:
    """Who to write to about one instrument. **Confirmed addresses only.**

    The `confirmed_at is not null` filter is SQL because it is a fact about a
    row in this table, not a judgement about a sensor. Compare the note at the
    top of this section: `alert_permitted` stays in Python because it is the
    latter.

    The preference columns ride along raw — the subscriber's globals and this
    subscription's overrides — and the judgement happens in `notify.effective`
    / `notify.allowed`, in Python, at the call site. A `where` clause encoding
    "wants this level" here would be a second authority for a rule
    `check_notify.py` can only see in one place.
    """
    with conn() as c:
        cur = c.execute(
            """select s.id, s.email, s.lang, s.manage_token,
                      s.min_level, s.frequency, s.quiet_start, s.quiet_end,
                      sub.min_level as override_min_level,
                      sub.frequency as override_frequency
               from subscribers s join subscriptions sub
                 on sub.subscriber_id = s.id
               where sub.sensor_id = %s and s.confirmed_at is not null
               order by s.id""",
            (sensor_id,),
        )
        return cur.fetchall()


def subscribers_for_camera(camera_id: str) -> list[dict]:
    """Who to write to about one CAMERA's alert episode. Confirmed only.

    `subscribers_for_sensor`'s sibling over `camera_subscriptions`, same
    predicate in SQL for the same reason, same raw preference columns for
    `notify` to judge in Python.
    """
    with conn() as c:
        cur = c.execute(
            """select s.id, s.email, s.lang, s.manage_token,
                      s.min_level, s.frequency, s.quiet_start, s.quiet_end,
                      sub.min_level as override_min_level,
                      sub.frequency as override_frequency
               from subscribers s join camera_subscriptions sub
                 on sub.subscriber_id = s.id
               where sub.camera_id = %s and s.confirmed_at is not null
               order by s.id""",
            (camera_id,),
        )
        return cur.fetchall()


def open_sensor_episode(sensor_id: str) -> dict | None:
    with conn() as c:
        cur = c.execute(
            """select * from sensor_episodes
               where sensor_id = %s and mode = %s and closed_at is null
               order by opened_at desc limit 1""",
            (sensor_id, settings.mode),
        )
        return cur.fetchone()


def create_sensor_episode(
    sensor_id: str, level: str, at: datetime, depth_mm: float | None
) -> int:
    with conn() as c:
        cur = c.execute(
            """insert into sensor_episodes
                 (sensor_id, level, opened_at, peak_depth_mm, mode)
               values (%s, %s, %s, %s, %s) returning id""",
            (sensor_id, level, at, depth_mm, settings.mode),
        )
        c.commit()
        return cur.fetchone()["id"]


def escalate_sensor_episode(
    episode_id: int, level: str, peak_mm: float | None
) -> None:
    with conn() as c:
        c.execute(
            """update sensor_episodes set level = %s, peak_depth_mm = %s,
                 clear_streak = 0 where id = %s""",
            (level, peak_mm, episode_id),
        )
        c.commit()


def bump_sensor_clear_streak(episode_id: int) -> int:
    with conn() as c:
        cur = c.execute(
            "update sensor_episodes set clear_streak = clear_streak + 1 "
            "where id = %s returning clear_streak",
            (episode_id,),
        )
        c.commit()
        return cur.fetchone()["clear_streak"]


def close_sensor_episode(episode_id: int, at: datetime) -> None:
    with conn() as c:
        c.execute("update sensor_episodes set closed_at = %s where id = %s",
                  (at, episode_id))
        c.commit()


def queue_message(
    subscriber_id: int,
    kind: str,
    subject: str,
    body: str,
    at: datetime,
    sensor_id: str | None = None,
    episode_id: int | None = None,
    level: str = "clear",
    camera_id: str | None = None,
) -> int | None:
    """Put one rendered message in the outbox. **None means already queued.**

    The subject and body arrive rendered and are stored as written. What went
    out is a fact; re-templating it at delivery against readings that have since
    moved would rewrite history, and a message that says one thing in the log
    and another in the inbox is worse than no log.

    Idempotency is the `outbox_once` partial index, not a check here — a tick
    that runs twice, or two instances that both see the same transition, must
    not produce two emails about one body of water. `confirm` and `resend` carry
    no `episode_id` and are deliberately outside that index: both are re-sendable
    by design. What stops `confirm` being abused is `subscribers.email unique`;
    what stops `resend` being abused is that it only ever writes to an address
    that has already confirmed, plus its own rate limit in `api.py`.

    ⚠️ **`level` is part of that key and passing it wrongly loses a warning
    silently.** One message per subscriber per episode per level is the property:
    a repeated tick at the same level is a no-op, and an escalation from warning
    to emergency is a different row rather than a swallowed one. See the index
    comment in `schema.sql` — this failed exactly once, in testing, and the only
    symptom was a gap in the id sequence.
    """
    with conn() as c:
        cur = c.execute(
            """insert into outbox
                 (subscriber_id, kind, sensor_id, episode_id, level, subject,
                  body, queued_at, camera_id)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (subscriber_id, kind, episode_id, level)
                 where episode_id is not null do nothing
               returning id""",
            (subscriber_id, kind, sensor_id, episode_id, level, subject, body,
             at, camera_id),
        )
        row = cur.fetchone()
        c.commit()
        return row["id"] if row else None


def already_messaged(subscriber_id: int, kind: str, episode_id: int) -> bool:
    """Has ANY message about this episode already been queued for this
    subscriber, at any level? This is what `frequency = 'first'` means — one
    message per episode — and it is a read of the outbox rather than a flag on
    the subscription, so it cannot go stale and needs no reset when the
    episode closes.

    Status is deliberately not filtered: a message that later expired or
    failed was still this feature's one attempt for the episode, and turning
    delivery trouble into a second message would make `first` mean "first
    that got through", which nobody asked for and nothing could explain.
    """
    with conn() as c:
        row = c.execute(
            """select 1 from outbox
               where subscriber_id = %s and kind = %s and episode_id = %s
               limit 1""",
            (subscriber_id, kind, episode_id),
        ).fetchone()
        return row is not None


def pending_outbox(limit: int) -> list[dict]:
    """**Claim** up to `limit` queued messages. Not a read — a read-and-take.

    ⚠️ The obvious shape — `select … for update skip locked`, then send, then
    update — does not work, and it fails quietly. The row lock lives for the
    length of its transaction, and this module commits and closes at the end of
    every `with conn()`, so by the time a caller has the rows the lock is gone
    and a second drainer sees them as free. Holding the transaction open across
    the send instead would put unbounded third-party SMTP latency inside a
    database transaction, which is worse.

    So the claim is the `update` itself, with `skip locked` scoping the
    sub-select. One statement, one transaction, and a row leaves `queued` the
    moment somebody takes it. This is what keeps the drain correct if the
    service ever runs more than one instance — the single assumption the
    in-process design rests on, and the cheapest place to stop depending on it.

    `attempts` increments on claim rather than on failure, so a message that
    kills the process mid-send still shows the attempt. Rows stuck in `sending`
    by such a crash are returned by `requeue_stalled` below.

    The address is joined from `subscribers` rather than stored on the row: it
    is resolved at send time so that a delete of the person takes every unsent
    message with it, which the cascade already guarantees.
    """
    with conn() as c:
        cur = c.execute(
            """update outbox set status = 'sending', attempts = attempts + 1
               where id in (
                 select id from outbox where status = 'queued'
                 order by queued_at limit %s
                 for update skip locked
               )
               returning id, subscriber_id, kind, sensor_id, episode_id,
                         subject, body, queued_at, attempts""",
            (limit,),
        )
        rows = cur.fetchall()
        if not rows:
            c.commit()
            return []
        # `manage_token` rides along for the `List-Unsubscribe` header, which
        # carries it as of 2026-08-05 — see `mail._send`. Resolved here rather
        # than stored on the row for the same reason the address is: a delete of
        # the person has to take every unsent message's credentials with it.
        addrs = c.execute(
            "select id, email, lang, manage_token from subscribers "
            "where id = any(%s)",
            ([r["subscriber_id"] for r in rows],),
        ).fetchall()
        c.commit()
    by_id = {a["id"]: a for a in addrs}
    out = []
    for r in rows:
        a = by_id.get(r["subscriber_id"])
        if a is None:
            # The subscriber was deleted between the claim and this read. The
            # cascade will take the row itself; nothing to send.
            continue
        out.append({
            **r,
            "email": a["email"],
            "lang": a["lang"],
            "manage_token": a["manage_token"],
        })
    return out


def mark_outbox(message_id: int, status: str) -> None:
    """Record what happened to one claimed message.

    `sent_at` is stamped only for `sent`, and it means **handed to a relay** —
    not delivered, not accepted by the recipient's server, not read. There is no
    mailbox on this side to learn otherwise from. See LIMITATIONS §16.

    `queued` is a legitimate argument and is how a transient failure returns a
    message to the pool. It cannot loop forever: `mail.MAX_AGE_S` drops anything
    that has been waiting too long, on the stale-replay rule's reasoning.
    """
    with conn() as c:
        c.execute(
            "update outbox set status = %s, "
            "sent_at = case when %s = 'sent' then now() else sent_at end "
            "where id = %s",
            (status, status, message_id),
        )
        c.commit()


def requeue_stalled(minutes: int = 15) -> int:
    """Return messages claimed by a process that died mid-send.

    A `sending` row is one somebody took and never resolved, which after a
    restart is indistinguishable from one being sent right now — except by age.
    Anything claimed longer ago than a drain could plausibly take is free again.
    They are usually about to be dropped as expired anyway; going back through
    `queued` is what makes that decision `mail.deliver`'s rather than this
    function's.
    """
    with conn() as c:
        cur = c.execute(
            "update outbox set status = 'queued' where status = 'sending' "
            "and queued_at < now() - make_interval(mins => %s)",
            (minutes,),
        )
        c.commit()
        return cur.rowcount


def prune_outbox(days: int = 30) -> int:
    """Drop resolved messages past the retention window.

    ⚠️ **`failed` and `expired` are never pruned here.** A message that could not
    be sent, or that was dropped for being too old to be true any more, is the
    evidence that somebody was not told — and deleting it makes an undelivered
    warning indistinguishable from one that was never queued. `sent` and
    `skipped` are the two outcomes where nothing is owed.
    """
    with conn() as c:
        cur = c.execute(
            "delete from outbox where status in ('sent', 'skipped') "
            "and queued_at < now() - make_interval(days => %s)",
            (days,),
        )
        c.commit()
        return cur.rowcount


def prune_unconfirmed(days: int = 7) -> int:
    """Delete addresses that never answered their own confirmation.

    An unconfirmed row is a record of an address somebody typed in, and there is
    no evidence it was theirs to type. Holding it indefinitely is holding a
    person record nobody consented to; the window is the smallest retention that
    still lets a reader find the mail in a spam folder a week later.
    """
    with conn() as c:
        cur = c.execute(
            "delete from subscribers where confirmed_at is null "
            "and created_at < now() - make_interval(days => %s)",
            (days,),
        )
        c.commit()
        return cur.rowcount
