"""Water-level gauges: NOAA CO-OPS and USGS, in one module.

These are two agencies with two APIs, and they are **the same shape**: a
numbered gauge at a fixed point reporting a water level on a cadence. Modelling
them once means one probe check, one wire type, one staleness rule and one place
to be wrong — rather than two half-clients that drift.

What they are *for* is the baseline. FloodNet tells you there is 40mm of water
on a block. It cannot tell you whether that is a storm filling the combined
sewers or the harbor sitting high, and those are different events with different
time constants and different warnings. `sensors.tidal` has recorded which
distinction applies to each sensor since the first commit; until now nothing
read it, because there was no harbor number to read it against.

⚠️ **Levels are not comparable between gauges.** NOAA CO-OPS here is referenced
to MLLW; each USGS gage height is referenced to that site's own local datum. A
USGS stage of 0.65 ft and a NOAA level of 2.2 ft are not two measurements of one
thing, and nothing may subtract, average or rank them against each other. Each
gauge is only comparable to its own history and its own thresholds.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from .models import GaugeReading, GaugeSite

log = logging.getLogger(__name__)

NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
USGS = "https://waterservices.usgs.gov/nwis/iv/"

UA = {"User-Agent": "waterline/0.1 (NYC flood prototype; contact via repo)"}

# USGS parameter 00065 is gage height, in feet.
USGS_GAGE_HEIGHT = "00065"

BATTERY = "8518750"

# Same clock-skew defence as `floodnet.fetch_depths`. A gauge reporting the
# future is a broken clock, and it is rejected rather than shown; a gauge
# reporting the past is *old data*, which is a real answer and is kept so the UI
# can render it as stale. Those are different failures and only one of them is
# a lie.
MAX_FUTURE = timedelta(minutes=5)

# Not a rejection threshold — only the point at which a reading is worth a log
# line. USGS will happily return a site under `siteStatus=active` whose most
# recent value is from 2016; that gauge must reach the page looking dead, not
# vanish from it.
#
# Three hours, and the number comes from measurement rather than intuition.
# Sampling interval and publication lag are different things: all four USGS
# sites sample every 15 minutes exactly (190 points per 48h, median and max gap
# both 15m), but their newest point runs 21-81 minutes behind wall clock because
# the telemetry arrives late. A gauge an hour old is therefore a healthy gauge.
# This matches `GAUGE_STALE_AFTER_S` in the UI's `lib/staleness.ts` on purpose —
# the log line and the amber text answer the same question and should not be
# able to disagree.
STALE_AFTER = timedelta(hours=3)

# How old the harbor reading may be and still corroborate a depth
# (`escalation._depth_is_credible`). This is deliberately much tighter than
# STALE_AFTER, because the two answer different questions: STALE_AFTER governs
# what the page may *display* with an age beside it, and this governs what may
# be treated as *evidence*.
#
# Without a bound, a Battery gauge that died at high water would keep asserting
# "the harbor is above flood stage" indefinitely, and the only thing it gates is
# whether an implausible depth gets to raise an alarm — so a stuck witness is a
# crying-wolf generator, which is the exact failure LIMITATIONS §11 exists to
# prevent. The semidiurnal cycle is about 6h12m; an hour is a sixth of one, long
# enough to cover the high-water period and short enough that a dead gauge stops
# testifying quickly.
WITNESS_MAX_AGE = timedelta(minutes=60)


# --- the registry ----------------------------------------------------------
# Curated, not discovered. A bounding box around New York Harbor returns 29
# USGS sites, 25 of which are in the Passaic, Rahway and Raritan basins in New
# Jersey — real gauges, correctly returned, telling you nothing about whether
# a street in Queens is under water. Discovery is the wrong tool here: the
# question is not "what gauges exist nearby" but "which gauges say something
# about this city", and that is a judgement, so it is written down.
#
# ⚠️ THE FLOOD THRESHOLDS ARE CONVERTED. Read this before touching the number.
#
# NOAA publishes flood levels for 8518750 at
#   .../mdapi/prod/webapi/stations/8518750/floodlevels.json
#     {"nos_minor": 10.19, "action": 10.29, "nos_moderate": 11.12,
#      "nos_major": 12.39, ...}
# and those are feet above **station datum (STND)**, which is not the datum
# this module requests. `fetch_gauges` asks CO-OPS for `datum=MLLW`, and
#   .../mdapi/prod/webapi/stations/8518750/datums.json
# gives MLLW = 3.29 ft above STND. So:
#
#   minor     10.19 - 3.29 = 6.90 ft MLLW   <- the number below
#   action    10.29 - 3.29 = 7.00 ft MLLW
#   moderate  11.12 - 3.29 = 7.83 ft MLLW
#   major     12.39 - 3.29 = 9.10 ft MLLW
#
# Comparing the published 10.19 against an MLLW reading is a silent false
# negative: the Battery reads ~2-3 ft MLLW on a calm day and would have to rise
# seven feet past minor flood stage before a naive test fired. It would never
# look broken. It would just never warn.
#
# Cross-checked from the other direction, because a units bug that only shows up
# in a storm is worth two derivations: MHHW is 8.34 ft STND = 5.05 ft MLLW, so
# 6.90 ft MLLW is 1.85 ft above MHHW = 0.56 m — which is NOAA's own published
# minor-flood figure for The Battery. The two agree.
#
# Re-derive rather than adjust, if NOAA re-levels the station on a new datum
# epoch. Borrowed numbers, not invented ones — LIMITATIONS.md §8.
GAUGES: tuple[GaugeSite, ...] = (
    GaugeSite(
        gauge_id=BATTERY,
        network="noaa",
        name="The Battery",
        lat=40.7006,
        lon=-74.0142,
        minor_flood_ft=6.90,
    ),
    # The in-city USGS sites. Stream gauges, not tide gauges: these see
    # rainfall running off, which is the other half of the story from the
    # harbor. All four verified answering live.
    GaugeSite(
        gauge_id="01302020",
        network="usgs",
        name="Bronx River at NY Botanical Garden",
        lat=40.8623,
        lon=-73.8744,
    ),
    GaugeSite(
        gauge_id="01302050",
        network="usgs",
        name="Alley Creek near Oakland Gardens",
        lat=40.7564,
        lon=-73.7464,
    ),
    GaugeSite(
        gauge_id="01376534",
        network="usgs",
        name="Richmond Creek at Lighthouse Ave",
        lat=40.5737,
        lon=-74.1413,
    ),
    GaugeSite(
        gauge_id="01376558",
        network="usgs",
        name="Lemon Creek at Amboy Road",
        lat=40.5254,
        lon=-74.2094,
    ),
)

BY_ID: dict[str, GaugeSite] = {g.gauge_id: g for g in GAUGES}


def site(gauge_id: str) -> GaugeSite | None:
    return BY_ID.get(gauge_id)


def above_minor_flood(gauge_id: str, level_ft: float) -> bool:
    """Whether this gauge is at or above its published minor-flood stage.

    False for any gauge with no published threshold, which is every USGS site
    here — NWS publishes flood stage for some of them, but not through this
    endpoint, and inventing one would be exactly the thing LIMITATIONS §8
    forbids.
    """
    g = BY_ID.get(gauge_id)
    return bool(g and g.minor_flood_ft is not None and level_ft >= g.minor_flood_ft)


# --- fetch -----------------------------------------------------------------
def fetch_gauges() -> list[GaugeReading]:
    """Every configured gauge's most recent level.

    Fails soft **per network**: NOAA being down must not cost us USGS, and vice
    versa. Returns whatever answered, which may be an empty list — that is a
    legitimate answer meaning "nothing reported", not an error.
    """
    out: list[GaugeReading] = []
    out.extend(_noaa([g for g in GAUGES if g.network == "noaa"]))
    out.extend(_usgs([g for g in GAUGES if g.network == "usgs"]))

    stale = [r for r in out if _age(r.observed_at) > STALE_AFTER]
    for r in stale:
        log.warning(
            "gauge %s (%s) is stale: last reading %s, %.1fh old",
            r.gauge_id,
            BY_ID[r.gauge_id].name if r.gauge_id in BY_ID else "?",
            r.observed_at.isoformat(),
            _age(r.observed_at).total_seconds() / 3600,
        )

    log.info("gauges: %d reporting (%d stale)", len(out), len(stale))
    return out


def _noaa(sites: list[GaugeSite]) -> list[GaugeReading]:
    """CO-OPS water level. One request per station; there is one station."""
    out: list[GaugeReading] = []
    for g in sites:
        params = {
            "product": "water_level",
            "application": "waterline",
            "date": "latest",
            # ⚠️ Changing this changes the units of every threshold in GAUGES.
            "datum": "MLLW",
            "station": g.gauge_id,
            "time_zone": "gmt",
            "units": "english",
            "format": "json",
        }
        try:
            with httpx.Client(timeout=20, headers=UA) as c:
                data = c.get(NOAA, params=params).raise_for_status().json()
            rows = data.get("data") or []
            if not rows:
                log.warning("noaa %s: no data in response (%s)", g.gauge_id,
                            data.get("error", {}).get("message", "no error given"))
                continue
            d = rows[0]
            at = _ts(d["t"])
            if at is None:
                log.warning("noaa %s: unparseable timestamp %r", g.gauge_id, d.get("t"))
                continue
            out.append(
                GaugeReading(
                    gauge_id=g.gauge_id,
                    network="noaa",
                    observed_at=at,
                    level_ft=float(d["v"]),
                )
            )
        except Exception as e:  # noqa: BLE001
            log.warning("noaa %s unreachable (%s): %s", g.gauge_id, type(e).__name__, e)
    return out


def _usgs(sites: list[GaugeSite]) -> list[GaugeReading]:
    """USGS instantaneous values. One request for all sites, no key required.

    Note this is the legacy `waterservices.usgs.gov` endpoint. USGS is migrating
    to an OGC API at `api.waterdata.usgs.gov`; the legacy service is what works
    today and the migration is recorded in LIMITATIONS.md.
    """
    if not sites:
        return []

    params = {
        "format": "json",
        "sites": ",".join(g.gauge_id for g in sites),
        "parameterCd": USGS_GAGE_HEIGHT,
    }
    try:
        with httpx.Client(timeout=30, headers=UA) as c:
            data = c.get(USGS, params=params).raise_for_status().json()
    except Exception as e:  # noqa: BLE001
        log.warning("usgs unreachable (%s): %s", type(e).__name__, e)
        return []

    out: list[GaugeReading] = []
    dropped = 0
    for series in data.get("value", {}).get("timeSeries", []):
        try:
            info = series["sourceInfo"]
            gauge_id = info["siteCode"][0]["value"]
            # USGS marks absent readings with a sentinel (-999999) rather than
            # omitting them. Rendering that as a water level would be a lie
            # measured in miles.
            no_data = float(series["variable"].get("noDataValue", -999999))
            points = series["values"][0]["value"]
            if not points:
                dropped += 1
                continue
            p = points[0]
            level = float(p["value"])
            if level == no_data:
                dropped += 1
                log.warning("usgs %s: no-data sentinel, skipped", gauge_id)
                continue
            at = _ts(p["dateTime"])
            if at is None:
                dropped += 1
                log.warning("usgs %s: unparseable timestamp %r", gauge_id,
                            p.get("dateTime"))
                continue
            out.append(
                GaugeReading(
                    gauge_id=gauge_id,
                    network="usgs",
                    observed_at=at,
                    level_ft=level,
                )
            )
        except Exception as e:  # noqa: BLE001
            dropped += 1
            log.warning("usgs series rejected (%s): %s", type(e).__name__, e)

    if dropped:
        log.warning("usgs: %d series dropped", dropped)
    return out


# --- helpers ---------------------------------------------------------------
def _age(at: datetime) -> timedelta:
    return datetime.now(timezone.utc) - at


def _ts(v) -> datetime | None:
    """Parse an upstream timestamp, or None.

    ⚠️ Returns None on failure rather than `datetime.now()`. `feeds._ts` does
    fall back to now, and that is wrong for a gauge: stamping an unparseable
    reading with the current time makes stale data look fresh, which is
    the frozen-poller rule's failure mode arriving through the parser. A reading whose
    time we cannot establish has no age, and a reading with no age cannot be
    rendered honestly, so it is dropped and logged.

    NOAA returns `2026-08-04 23:30` with no zone and means GMT (we ask for
    `time_zone=gmt`). USGS returns a full ISO string with an offset.

    ⚠️ Some USGS sites stamp `-05:00` in August, which looks like a bug and is
    not: their `timeZoneInfo` carries `siteUsesDaylightSavingsTime: false`, so
    the gauge reports Eastern *Standard* Time year-round. Trust the offset on
    the string rather than "fixing" it against a New York calendar — assuming
    EDT there would shift every reading an hour into the future and make a
    fresh gauge look like a clock fault.
    """
    s = str(v or "").strip().replace("Z", "+00:00")
    if " " in s and "T" not in s:
        s = s.replace(" ", "T")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    if dt - datetime.now(timezone.utc) > MAX_FUTURE:
        log.warning("gauge timestamp is in the future, rejected: %s", dt.isoformat())
        return None
    return dt
