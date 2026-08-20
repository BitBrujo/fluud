"""FloodNet's public GraphQL API.

    https://api.floodnet.nyc/v1/graphql

No auth, introspection enabled. This is the real data path and it is much better
than the Socrata mirror: live depth at ~1 minute resolution, sensor elevation in
NAVD88, deployment health, tidal datum offsets, human-annotated flood events,
and server-side geospatial search.

Query surface (from introspection):

    deployments                  sensor registry, richer than the Socrata mirror
    deployments_within_radius    (lat, lon, radius_meters) -> server-side pairing
    depth_data                   the timeseries: raw / proc / filt, mm
    flood_events                 human-annotated events with confidence + label
    storm_events                 storm groupings
    tidal_data                   tidal sensor readings
    inundation_contours          modelled flood extent
    sensor_health_data           per-device health

Three identifiers, and confusing them is the easiest way to get nothing back:

    deployment_id   'curly_orange_shrimp'         internal key; joins depth_data
    slug            'M-avenue-c-e-20th-st-2zpcro' matches Socrata's sensor_id
    dev_id          the physical LoRaWAN device

THREE DATA-QUALITY TRAPS. The first two were hit on first contact; the third
only appears at scale and is the dangerous one, because it looks like silence.

 1. Some devices have broken real-time clocks and report timestamps decades in
    the future — a naive `order_by: {time: desc}` returns readings dated 2080
    and no live data at all. Every depth query here is bounded on both sides.
 2. `depth_raw_mm` goes slightly negative (-20mm is normal) because it is an
    uncorrected ultrasonic range. Use `depth_filt_mm`; keep raw only for
    provenance. Measured: filt is never negative, raw is negative on 96% of
    rows — see `IMPLAUSIBLE_MIN_MM`, whose whole derivation is that difference.
 3. **A row `limit` on a multi-deployment depth query is silently lossy, and
    how lossy depends on how many sensors you ask about.** `limit: 2000` with
    client-side dedupe spans ~12h at 27 deployments and **under 5 minutes at
    425**. Sensors that fall off the end arrive as not-reporting, which is
    indistinguishable from a sensor that is genuinely quiet. `fetch_depths` uses
    `distinct_on` for this reason; see `DEPTHS_COMPLETE_PER_DEPLOYMENT`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from .config import settings
from .models import DepthReading, Sensor

log = logging.getLogger(__name__)

API = "https://api.floodnet.nyc/v1/graphql"

# Readings outside this window are rejected as clock skew, not data.
MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(hours=6)

DEPLOYMENT_FIELDS = """
  deployment_id slug name dev_id sensor_status alert_visibility
  date_deployed date_down height_ground_mm height_navd88_mm
  nearest_tidal_id mounted_over
  sensor_address_street sensor_address_neighborhood sensor_address_borough
"""


def query(gql: str, variables: dict | None = None) -> dict:
    url = settings.floodnet_api_base or API
    with httpx.Client(timeout=45) as c:
        r = c.post(url, json={"query": gql, "variables": variables or {}})
        r.raise_for_status()
        body = r.json()
    if "errors" in body:
        raise RuntimeError(f"floodnet graphql: {body['errors']}")
    return body["data"]


# --- sensors ---------------------------------------------------------------
def fetch_sensors() -> list[Sensor]:
    """The deployment registry, with location resolved via the radius helper.

    `location` on `deployments` is a PostGIS column that does not serialize to
    plain lat/lon through Hasura, so coordinates come from the Socrata mirror
    (kb2e-tjy3) joined on slug == sensor_id. The GraphQL side supplies
    everything Socrata lacks: live status, elevation, and alert visibility.
    """
    from .feeds import fetch_sensor_locations

    data = query(f"{{ deployments {{ {DEPLOYMENT_FIELDS} }} }}")
    coords = fetch_sensor_locations()  # slug -> (lat, lon, nta, tidal)

    out: list[Sensor] = []
    unlocated = 0
    for d in data.get("deployments", []):
        slug = d.get("slug")
        loc = coords.get(slug)
        if not loc:
            unlocated += 1
            continue
        lat, lon, nta, tidal = loc
        out.append(
            Sensor(
                sensor_id=d["deployment_id"],
                slug=slug,
                lat=lat,
                lon=lon,
                name=d.get("name"),
                nta=nta,
                borough=d.get("sensor_address_borough"),
                tidal=tidal,
                status=d.get("sensor_status") or "unknown",
                # FloodNet marks which deployments may drive public alerts.
                # We honour it: see should_alert().
                alert_visible=(d.get("alert_visibility") == "enabled"),
                ground_height_mm=_int(d.get("height_ground_mm")),
            )
        )

    log.info(
        "floodnet: %d deployments (%d without coordinates), %d alert-enabled",
        len(out), unlocated, sum(1 for s in out if s.alert_visible),
    )
    return out


def sensors_near(lat: float, lon: float, radius_m: float) -> list[dict]:
    """Server-side geospatial search. Authoritative — prefer this to computing
    distances locally, since FloodNet owns the sensor geometry."""
    data = query(
        """query near($lat: Float!, $lon: Float!, $r: Float!) {
             deployments_within_radius(
               args: {lat: $lat, lon: $lon, radius_meters: $r}
             ) { deployment_id slug name sensor_status alert_visibility } }""",
        {"lat": lat, "lon": lon, "r": radius_m},
    )
    return data.get("deployments_within_radius", [])


# --- depth -----------------------------------------------------------------
def fetch_depths(deployment_ids: list[str]) -> dict[str, DepthReading]:
    """Latest sane reading per deployment.

    An empty result is a legitimate answer, not a failure — it means no sensor
    we asked about has reported inside the sanity window.

    ⚠️ **`distinct_on` is what makes this complete, and the `limit` it replaced
    was silently lossy at scale.** The query used to ask for the newest 2000
    rows across every id and dedupe client-side. FloodNet publishes about once a
    minute per deployment, so 2000 rows spans roughly 12 hours at 27 sensors and
    **under 5 minutes at 425** — at which point a healthy sensor that happens to
    publish on a slow cadence falls off the end of the window and arrives here
    as not-reporting. That is indistinguishable from the truth, which is the
    worst shape a data bug can have in this app.

    `distinct_on: [deployment_id]` asks Postgres for one row per deployment
    instead, so the result size is the number of sensors rather than a guess at
    how many rows that takes. Hasura requires the distinct column to lead
    `order_by`, hence the two-key sort. Verified against the live schema by
    introspection before this was written; `_depths_are_complete` below is the
    guard for the day that stops being true.

    `MAX_AGE` / `MAX_FUTURE` stay on the `where` and are now doing *more* work,
    not less: they are the clock-skew bound (trap 1 in the module docstring),
    and they are what keeps `distinct_on` safe — without them "the newest row
    per deployment" is a reading dated 2080.
    """
    if not deployment_ids:
        return {}

    now = datetime.now(timezone.utc)
    data = query(
        """query depths($ids: [String!], $lo: timestamptz!, $hi: timestamptz!) {
             depth_data(
               where: {
                 deployment_id: {_in: $ids}
                 time: {_gte: $lo, _lte: $hi}
               }
               distinct_on: [deployment_id]
               order_by: [{deployment_id: asc}, {time: desc}]
             ) {
               deployment_id time depth_filt_mm depth_proc_mm depth_raw_mm
               flood_detected
             } }""",
        {
            "ids": deployment_ids,
            "lo": (now - MAX_AGE).isoformat(),
            "hi": (now + MAX_FUTURE).isoformat(),
        },
    )

    latest: dict[str, DepthReading] = {}
    no_depth = 0
    for row in data.get("depth_data", []):
        did = row["deployment_id"]
        # `distinct_on` already guarantees one row per deployment. This stays as
        # belt and braces so that if the query above ever regresses to a plain
        # `order_by` + `limit`, the failure degrades to wrong-not-corrupt.
        if did in latest:
            continue
        depth = _first_num(row, "depth_filt_mm", "depth_proc_mm", "depth_raw_mm")
        if depth is None:
            # Every depth column was null. Count and log rather than storing a
            # zero — see `_first_num`. Measured 2026-08-05: 8 of 399 rows.
            no_depth += 1
            continue
        latest[did] = DepthReading(
            sensor_id=did,
            observed_at=_ts(row["time"]),
            # filt is the fully processed value. proc and raw are kept for
            # provenance; raw is an uncorrected range and goes negative.
            depth_mm=depth,
            raw_mm=_int(row.get("depth_raw_mm")),
            # FloodNet's own flood determination for this reading. Load-bearing
            # — see the wall of text on IMPLAUSIBLE_MM below.
            flood_detected=bool(row.get("flood_detected")),
            plausible=IMPLAUSIBLE_MIN_MM <= depth < IMPLAUSIBLE_MM,
        )

    bogus = [r for r in latest.values() if not r.plausible]
    # Sorted by magnitude, not by signed depth: the band has two sides now, and
    # ordering by the raw number buries the negatives under the positives at the
    # far end of the list — which is how a -5773mm fault stays invisible behind
    # a 1452mm one.
    for r in sorted(bogus, key=lambda r: -abs(r.depth_mm)):
        side = "below" if r.depth_mm < IMPLAUSIBLE_MIN_MM else "above"
        bound = IMPLAUSIBLE_MIN_MM if r.depth_mm < IMPLAUSIBLE_MIN_MM else IMPLAUSIBLE_MM
        log.warning(
            "implausible depth rejected: %s reading %.0fmm (%.1f ft) — %s the "
            "%.0fmm bound — with flood_detected=%s — treating as sensor fault, "
            "not water",
            r.sensor_id, r.depth_mm, r.depth_mm / 304.8, side, bound,
            r.flood_detected,
        )

    if no_depth:
        log.warning(
            "floodnet: %d deployments published a row with no depth column at "
            "all (filt, proc and raw all null) — dropped, NOT recorded as 0mm",
            no_depth,
        )

    log.info(
        "floodnet: %d/%d reporting (%d implausible, %d without a depth column)",
        len(latest), len(deployment_ids), len(bogus), no_depth,
    )
    return latest


# Whether `fetch_depths` returns a row for EVERY deployment that has one, or
# merely a truncated sample of them.
#
# ⚠️ **`poll.tick` reads this to decide whether one city-wide snapshot may also
# drive the ≤27 watched cameras.** It may, today, because `distinct_on` asks for
# one row per deployment and there is no row cap to fall off the end of. Under
# the old `limit: 2000` it could not have: at 425 sensors that window is under
# five minutes, and a watched sensor publishing just outside it would arrive as
# not-reporting — a **missed alert**, which is the one failure this app exists to
# prevent.
#
# So: if `distinct_on` ever disappears upstream and this has to fall back to
# chunking ids, or if anyone reintroduces a `limit`, **set this False in the same
# commit.** `tick` then takes a second, narrow `fetch_depths(watched_sensor_ids)`
# for the alerting path and the display list degrades on its own. The guard is a
# constant rather than a heuristic because there is nothing in a short result to
# measure: most of the 425 are legitimately silent, so "fewer rows than ids" is
# the normal case and cannot distinguish silence from truncation.
DEPTHS_COMPLETE_PER_DEPLOYMENT = True


# A depth this large is a malfunctioning ultrasonic rangefinder, not a flood.
#
# Observed on 2026-08-04 in dry weather with zero NWS flood alerts active:
# four sensors reporting 1452mm, 876mm, 751mm and 666mm — up to 4.8 FEET of
# standing water on a clear day. Every one of them had FloodNet's own
# `flood_detected` flag set FALSE.
#
# Sensors are mounted roughly 2-3m above the ground (`height_ground_mm`), so a
# rangefinder that loses its echo, ices over, or picks up a parked truck
# reports a huge apparent depth. A naive `depth >= 10mm` threshold fires four
# EMERGENCY alerts for floods that do not exist.
#
# Crying wolf is not a cosmetic failure in a life-safety tool. It is how the
# next real warning gets ignored.
IMPLAUSIBLE_MM = 600.0  # ~2ft. Above this, corroboration is mandatory.

# ...and the floor, which the ceiling spent a year without.
#
# `plausible` was `depth < IMPLAUSIBLE_MM` — no lower bound at all — so a sensor
# reporting NEGATIVE depth was called believable. MEASUREMENTS.md names
# `-466 mm` at Northern Blvd @ Bell Blvd as the *worse* of the two faults it
# could see on screen, and the old rule waved it through.
#
# DERIVATION, measured 2026-08-05 over all 425 deployments in one request:
#
#   `depth_filt_mm` — the number we actually trust — was **never negative**.
#   0 negatives in 388 rows, min 0.0. A filtered depth below the roadway is not
#   a small reading, it is a broken one.
#
#   `depth_raw_mm` is a different animal and this is the whole reason the floor
#   is not simply 0. It is an uncorrected ultrasonic range, documented at the
#   top of this module as normally sitting near -20mm, and measured negative on
#   376 of 391 rows: the bulk between -1 and -30, a tail through -41, -74, and
#   -116. `_first_num` falls back to it when filt and proc are both absent
#   (3 rows that day), so the floor has to tolerate raw's normal excursion or it
#   rejects healthy sensors for behaving as documented.
#
#   Below that tail the data is empty until the faults: -261, -1233, -5773.
#
# So the floor is **10x the documented -20mm normal raw excursion**, which lands
# in that empty band — 1.7x below the worst legitimate reading observed and 1.3x
# above the nearest fault. Same shape of argument as the ceiling: a number taken
# from a documented instrument characteristic, then checked against what the
# instruments actually did.
#
# ⚠️ **Widening this band can only ever produce MORE rejections, never fewer.**
# `escalation.level_for` raises a level at `depth_mm >= flood_event_mm` (10mm),
# so nothing negative could have raised one before or after — and
# `_depth_is_credible` only gets stricter. There is a regression check for
# exactly that in `scripts/check_escalation.py`; it is asserted, not argued.
IMPLAUSIBLE_MIN_MM = -200.0


def skewed_deployments(deployment_ids: list[str]) -> list[tuple[str, datetime]]:
    """Deployments whose newest reading sits OUTSIDE the sanity window.

    Trap 1 counted, rather than merely guarded against. `fetch_depths` drops
    these by construction, which is right for the alerting path and useless for
    answering *why is a sensor I can see on FloodNet's own map missing from
    ours*. A device with a broken real-time clock stamps every row it publishes,
    so it has nothing inside the window at all and arrives as silent.

    Diagnostic only. Nothing on the alerting path may call this — the answer it
    returns is a list of readings we have already decided not to trust.
    """
    if not deployment_ids:
        return []

    now = datetime.now(timezone.utc)
    data = query(
        """query skew($ids: [String!]) {
             depth_data(
               where: {deployment_id: {_in: $ids}}
               distinct_on: [deployment_id]
               order_by: [{deployment_id: asc}, {time: desc}]
             ) { deployment_id time } }""",
        {"ids": deployment_ids},
    )

    out: list[tuple[str, datetime]] = []
    for row in data.get("depth_data", []):
        try:
            t = _ts(row["time"])
        except (KeyError, TypeError, ValueError):
            continue
        if not _in_clock_window(t, now, MAX_AGE):
            out.append((row["deployment_id"], t))
    return sorted(out, key=lambda p: p[1], reverse=True)


# How far back a flood-event query reaches. Days rather than hours because this
# is history for replay, not a live reading — `MAX_AGE` is the wrong bound here
# and using it would return almost nothing.
EVENTS_MAX_AGE = timedelta(days=7)


def fetch_flood_events(
    limit: int = 200, within: timedelta = EVENTS_MAX_AGE
) -> list[dict]:
    """Human-annotated flood events — start/end, confidence, label, annotator.

    This is labelled ground truth for replay: pick an event, replay its window,
    and you are driving the pipeline with a storm a human confirmed happened.

    ⚠️ **Bounded on both sides, and it was not until 2026-08-07 — which made it
    return NOTHING BUT the broken clocks.** This is trap 1 from the module
    docstring, guarded in `fetch_depths` since first contact and unguarded here
    for the whole life of the function. `order_by: {start_time: desc}` with no
    `where` sorts the devices with broken real-time clocks straight to the top:
    measured that day, **all ten newest events were dated 2080**, and no real
    storm was reachable through this function at any `limit`.

    It had no callers, so nothing was wrong on a page. What was wrong is that
    the docstring above offers replay as the way to test this pipeline against a
    confirmed storm, and the offer did not stand up.

    The bound is server-side in the `where`. The pass below is belt and braces on
    `fetch_depths`' rule: if the `where` ever regresses, the failure degrades to
    fewer-events rather than to 2080. A non-zero `skew` count means upstream
    moved and this function is the only thing that noticed.
    """
    now = datetime.now(timezone.utc)
    # ⚠️ `flood_events.start_time` is `timestamp`, NOT `timestamptz` — it is the
    # one time column on this API that carries no offset, and `depth_data.time`
    # next door is the other kind. Declaring `timestamptz!` here is a hard
    # validation error from Hasura, which is the good outcome; the bad one is
    # assuming the naive values are local. They are UTC — the 2080 rows here line
    # up with the 2080 rows in `depth_data`, which are offset-stamped — so the
    # bounds are sent naive-UTC and `_ts` stamps what comes back the same way.
    data = query(
        """query ev($n: Int!, $lo: timestamp!, $hi: timestamp!) {
             flood_events(
               limit: $n
               where: {start_time: {_gte: $lo, _lte: $hi}}
               order_by: {start_time: desc}
             ) {
               deployment_id start_time end_time event_confidence label
               annotated_by } }""",
        {
            "n": limit,
            "lo": (now - within).replace(tzinfo=None).isoformat(),
            "hi": (now + MAX_FUTURE).replace(tzinfo=None).isoformat(),
        },
    )

    rows = data.get("flood_events", [])
    out: list[dict] = []
    skew = unparseable = 0
    for row in rows:
        try:
            start = _ts(row["start_time"])
        except (KeyError, TypeError, ValueError) as e:  # noqa: PERF203
            # Fail soft, log loud, count drops. An event with no readable start
            # cannot be replayed, and it must not be handed back as though it
            # could.
            unparseable += 1
            log.warning(
                "flood event with unreadable start_time dropped (%s): %s",
                type(e).__name__, e,
            )
            continue
        if not _in_clock_window(start, now, within):
            skew += 1
            continue
        out.append(row)

    span = (
        f"{within.days}d" if within >= timedelta(days=1)
        else f"{within.total_seconds() / 3600:.0f}h"
    )
    if skew:
        log.warning(
            "floodnet: %d flood events outside the %s window survived the "
            "server-side bound — the `where` clause is no longer being applied "
            "and clock-skewed devices are back in this result",
            skew, span,
        )
    log.info(
        "floodnet: %d flood events in the last %s (%d dropped)",
        len(out), span, skew + unparseable,
    )
    return out


# The `sensor_status` values FloodNet publishes for a deployment it considers
# fit to alarm from. Anything else — newly installed, under maintenance,
# known-noisy — displays but does not warn.
HEALTHY_STATUS = ("good", "ok", "active")


def alert_permitted(alert_visible: bool, status: str | None) -> bool:
    """The alerting predicate over two bare fields rather than a `Sensor`.

    ⚠️ **This exists so `/api/sensors` never re-implements it in SQL.** The
    package CLAUDE.md records that "alert-enabled" is two different counts —
    `alert_visible` alone is 401 deployments, this predicate is 343 — and the
    `sensors` table stores only the first, because there is no `should_alert`
    column. The tempting fix when a route needs the second is a hand-copied
    `status in ('good','ok','active')` in a `where` clause, which is a second
    authority for a life-safety rule that must have exactly one.

    So the rule lives here, `should_alert` delegates to it unchanged for every
    existing caller, and the route calls it in Python over rows it has already
    fetched.
    """
    return bool(alert_visible) and status in HEALTHY_STATUS


def should_alert(sensor: Sensor) -> bool:
    """Whether this deployment may drive a public warning.

    FloodNet publishes `alert_visibility` and `sensor_status` precisely because
    not every deployment is trustworthy enough to alarm on — some are newly
    installed, under maintenance, or known-noisy. Overriding their judgement to
    make a demo louder would be exactly the wrong call in a life-safety tool.
    """
    return alert_permitted(sensor.alert_visible, sensor.status)


# --- helpers ---------------------------------------------------------------
def _first_num(row: dict, *keys) -> float | None:
    """The first non-null of `keys`, or **None** when every one of them is null.

    ⚠️ **This used to return `0`, and that is absence rendered as a
    measurement.** A deployment publishing a row with `depth_filt_mm`,
    `depth_proc_mm` and `depth_raw_mm` all null became a confident `0.0 mm` — a
    sensor asserting the street is dry when what it actually said was nothing at
    all. `web/CLAUDE.md` forbids exactly this downstream ("Absence of depth is
    not zero"); the ingest layer was manufacturing it upstream of the rule.

    Measured 2026-08-05: **8 of 399** returned rows had no depth column at all,
    so this fires on every poll. At the 27 paired sensors it plausibly never
    did, which is why it survived this long.

    The caller counts the drop and logs it — fail soft, log loud, count drops.
    """
    for k in keys:
        v = row.get(k)
        if v is not None:
            return float(v)
    return None


def _int(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _ts(v: str) -> datetime:
    dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _in_clock_window(ts: datetime, now: datetime, max_age: timedelta) -> bool:
    """Whether a timestamp is inside the sanity window on BOTH sides.

    Trap 1 from the module docstring, extracted so it can be asserted with no
    network. `fetch_depths` spells the same rule inline in its `where` clause
    and `fetch_flood_events` sends it as GraphQL variables; this is the shared
    judgement, and `scripts/check_ingest.py` reaches the rule through here.

    ⚠️ **Both sides, always.** A one-sided `now - max_age <= ts` looks like the
    obvious freshness check and admits every 2080 reading on the API.
    """
    return now - max_age <= ts <= now + MAX_FUTURE
