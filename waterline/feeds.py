"""Weather, and the Socrata mirror.

FloodNet depth and deployments live in `floodnet.py` — they come from the public
GraphQL API at https://api.floodnet.nyc/v1/graphql. Water-level gauges (NOAA
CO-OPS and USGS) live in `gauges.py`; the Battery tide fetch used to live here,
and moved when USGS arrived and made it one of a pair rather than a special
case.

What remains is NWS alerts, and one narrow job for Socrata dataset kb2e-tjy3 —
supplying sensor **coordinates**, which the GraphQL `deployments.location`
column does not serialize through Hasura. The two sources join on
slug == sensor_id.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from .config import settings
from .models import Strict, WeatherAlert

log = logging.getLogger(__name__)

SOCRATA = "https://data.cityofnewyork.us/resource"
NWS_ALERTS = "https://api.weather.gov/alerts/active"

UA = {"User-Agent": "waterline/0.1 (NYC flood prototype; contact via repo)"}


def _socrata_headers() -> dict[str, str]:
    h = dict(UA)
    if settings.socrata_app_token:
        h["X-App-Token"] = settings.socrata_app_token
    return h


# --- sensors ---------------------------------------------------------------
def fetch_sensor_locations() -> dict[str, tuple[float, float, str | None, bool]]:
    """slug -> (lat, lon, nta, tidal), from Socrata dataset kb2e-tjy3.

    Verified columns: sensor_id, sensor_name, latitude, longitude,
    date_installed, borough, nta, tidally_influenced,
    lowest_point_height_delta_inches, location (a GeoJSON dict, NOT a name —
    treating it as one silently discarded every row on first contact).

    `nta` is why this matters beyond coordinates: it is the neighborhood
    aggregation unit LIMITATIONS.md §3 commits to, and it ships free.
    """
    url = f"{SOCRATA}/{settings.floodnet_sensors_dataset}.json"
    with httpx.Client(timeout=30, headers=_socrata_headers()) as c:
        rows = c.get(url, params={"$limit": 2000}).raise_for_status().json()

    out: dict[str, tuple[float, float, str | None, bool]] = {}
    dropped = 0
    for r in rows:
        slug = _first(r, "sensor_id")
        lat = _first(r, "latitude", "lat")
        lon = _first(r, "longitude", "lon")
        if not (slug and lat and lon):
            dropped += 1
            continue
        try:
            out[str(slug)] = (
                float(lat),
                float(lon),
                _first(r, "nta"),
                str(r.get("tidally_influenced", "")).lower() in ("yes", "true", "1"),
            )
        except (TypeError, ValueError) as e:
            dropped += 1
            log.warning("location row rejected: %s", e)

    log.info("socrata: %d sensor locations (%d dropped)", len(out), dropped)
    return out


# --- weather ---------------------------------------------------------------
# ⚠️ **ONE fetch, TWO derivations, and nothing joins them again.**
#
# `nws_active` is a **second witness**: `watch.is_credible` and
# `escalation._depth_is_credible` both read it, `check_watch.py` asserts the two
# byte-equal over a 288-combination matrix, and `escalation.py` raises to WATCH
# on it alone. It is what lets an implausible depth be believed.
#
# The gauges panel shows **everything NWS has active for the five boroughs** —
# tornado, severe thunderstorm, heat, air quality, the lot. If those reached
# `nws_active`, a Heat Advisory would become corroboration for a rangefinder
# reading four metres, and a Tornado Warning would raise every subscribed sensor
# in the city. So:
#
#   credibility  ->  is_witness_alert()      -> nws_active -> watch/escalation
#   display      ->  fetch_nws_alerts_all()  -> nws_reads   -> /api/status
#
# ⚠️ **The REQUEST parameters belong to the credibility path.** `area=NY` is
# statewide and stays statewide: narrowing the request to NYC zones for the
# panel's benefit would silently narrow `nws_active` too, and a flood warning in
# Westchester would stop corroborating an implausible depth under a tidal
# sensor. **The NYC scoping happens after the fetch**, and what falls outside is
# counted, never dropped.

# The witness filter, unchanged since first contact.
#
# ⚠️ **This already matches `Freezing Rain Advisory`** through `"rain"`, which
# is wider than the name suggests. That is PRE-EXISTING and it is deliberately
# left alone: tightening it while working nearby moves the second witness, which
# is a change to what this app is willing to believe about a faulted sensor.
# `check_watch.py` pins the behaviour, including that one.
WITNESS_TERMS = ("flood", "rain")

# The five boroughs as NWS SAME (FIPS) codes: Bronx, Kings, New York, Queens,
# Richmond. ⚠️ **DISPLAY SCOPE ONLY.** See the block above — this may never be
# pushed up into the request.
NYC_SAME = frozenset({"036005", "036047", "036061", "036081", "036085"})


class NwsRead(Strict):
    """One answer from NWS, including whether we got one.

    Two facts and not one: *we asked and NWS said nothing* and *we could not
    ask* are different claims, and the panel has to be able to tell a reader
    which. Today's `except: return []` collapsed them.
    """

    alerts: tuple[WeatherAlert, ...] = ()
    reachable: bool = True
    detail: str | None = None


def is_witness_alert(a: WeatherAlert) -> bool:
    """Whether this alert may corroborate an implausible depth.

    ⚠️ **The ONLY thing on the second-witness path.** Widening it to serve a
    display need is the change to refuse — the panel reads `NwsRead.alerts`,
    which is everything, and needs nothing from here.
    """
    ev = (a.event or "").lower()
    return any(t in ev for t in WITNESS_TERMS)


def in_nyc(a: WeatherAlert) -> bool:
    """Whether this alert covers any of the five boroughs. Display only.

    ⚠️ **An alert with no recognisable geocode answers False**, so it lands in
    the "elsewhere in New York State" tail rather than being shown as local.
    That fails toward *not claimed here*, which is the safe direction for a
    scope claim: over-claiming coverage is how a reader concludes we are
    watching a place we are not.
    """
    return any(c in NYC_SAME for c in (a.same_codes or ()))


def fetch_nws_alerts_all() -> NwsRead:
    """Every active NWS alert for NY State, unfiltered, plus reachability.

    Fails soft like the rest of ingest, but **says so in the return value** —
    an empty list from an unreachable feed and an empty list from a quiet day
    are the same bytes and opposite meanings.
    """
    try:
        with httpx.Client(timeout=20, headers=UA) as c:
            data = (
                c.get(NWS_ALERTS, params={"area": "NY"}).raise_for_status().json()
            )
    except Exception as e:  # noqa: BLE001
        log.warning("nws unreachable: %s", e)
        return NwsRead(reachable=False, detail=f"{type(e).__name__}: {e}")

    out: list[WeatherAlert] = []
    dropped = 0
    for f in data.get("features", []):
        p = f.get("properties", {})
        try:
            out.append(
                WeatherAlert(
                    nws_id=p.get("id") or f.get("id"),
                    event=p.get("event", ""),
                    severity=p.get("severity"),
                    urgency=p.get("urgency"),
                    certainty=p.get("certainty"),
                    headline=p.get("headline"),
                    area_desc=p.get("areaDesc"),
                    same_codes=list((p.get("geocode") or {}).get("SAME") or []),
                    onset=_ts(p["onset"]) if p.get("onset") else None,
                    ends=_ts(p["ends"]) if p.get("ends") else None,
                    expires=_ts(p["expires"]) if p.get("expires") else None,
                )
            )
        except Exception as e:  # noqa: BLE001
            dropped += 1
            log.warning("nws alert rejected (%s): %s", type(e).__name__, e)

    log.info("nws: %d active in NY (%d dropped)", len(out), dropped)
    return NwsRead(alerts=tuple(out), reachable=True)


def fetch_nws_alerts() -> list[WeatherAlert]:
    """Active flood/rain alerts for NY — the SECOND-WITNESS view. No key needed.

    Unchanged in meaning since first contact; it is `fetch_nws_alerts_all`
    filtered by `is_witness_alert`. Kept as its own name because `poll.probe`
    and `poll.validate` both call it and both mean this narrower set.
    """
    return [a for a in fetch_nws_alerts_all().alerts if is_witness_alert(a)]


# --- helpers ---------------------------------------------------------------
def _first(row: dict, *keys):
    for k in keys:
        if row.get(k) not in (None, ""):
            return row[k]
    return None


def _ts(v) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v, tz=timezone.utc)
    s = str(v or "").strip().replace("Z", "+00:00").replace(" ", "T")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return datetime.now(timezone.utc)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
