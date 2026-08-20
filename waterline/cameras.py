"""NYC DOT camera index, and the camera <-> sensor pairing that makes this
project work.

350-odd FloodNet sensors report calibrated depth in millimetres. ~900 DOT
cameras report nothing at all. Where the two look at the same corner, the
sensor's depth is what the camera's view is showing you — which is what a
paired camera renders and an unpaired one cannot.
"""

from __future__ import annotations

import logging
import math

import httpx

from .models import Camera, Pair, Sensor

log = logging.getLogger(__name__)

# NYC DOT public camera index. If the shape has drifted, this is the one place
# to fix it — everything downstream only wants Camera.
DOT_CAMERAS = "https://webcams.nyctmc.org/api/cameras"

# Two tiers, because the measured distribution supports it.
#
# Against the live feeds (479 sensors, 969 cameras) the yield is:
#     <= 100m :  28 cameras   <- gold: same corner, names match verbatim
#     <= 250m : 137 cameras   <- silver: same block
#     <= 500m : 360 cameras
#     <=1000m : 674 cameras   <- meaningless; different sewershed
#
# GOLD is what `WATCH_CAMERAS` was selected on: at 8-100m the DOT camera and
# the FloodNet sensor are demonstrably at the same intersection (compare
# "South St @ Broad St" to "M - Broad St/South St", 8m apart). MAX is what may
# be operated on — a silver pair still gets a useful depth read, it is just a
# view of the same block rather than the same puddle.
GOLD_PAIR_M = 100.0
MAX_PAIR_M = 250.0

UA = {"User-Agent": "waterline/0.1 (NYC flood prototype; contact via repo)"}


def pair_tier(distance_m: float | None) -> str:
    """Which of the two tiers a stored pairing falls in, or `unpaired`.

    Derived from the `pairs.distance_m` that is already stored — this adds no
    second distance and no second bound. It lives here, beside the two
    constants, so the classification cannot drift from the numbers it is a
    classification of.

    ⚠️ **`gold` and `silver` are the INTERNAL names and no reader meets either
    word.** What crosses the wire is `paired` / `near` / `unpaired`, and what a
    reader sees is `paired` / `near` / `not paired`. Renaming the constants is
    not this function's job; keeping the two vocabularies apart is.

    Both bounds are **inclusive**, matching `pair_cameras`' own `best[0] <=
    max_m` — a camera exactly at 250 m is paired there and must be `near` here.

    ⚠️ **The final branch is unreachable today and not forever.** `pair_cameras`
    never writes a row above `MAX_PAIR_M`, so nothing in the table can reach it
    — but lowering `MAX_PAIR_M` without re-running `bootstrap` leaves stale rows
    above the new bound. `unpaired` is the safe direction for those: it
    *withholds* a depth rather than labelling a 400 m sensor as this corner's.
    """
    if distance_m is None:
        return "unpaired"
    if distance_m <= GOLD_PAIR_M:
        return "paired"
    if distance_m <= MAX_PAIR_M:
        return "near"
    return "unpaired"


def camera_from_row(r: dict) -> Camera | None:
    """One DOT row to a `Camera`, or None if it cannot be one.

    Extracted from `fetch_cameras` so `check_ingest.py` can drive the parse with
    no network — `gauges._ts`' precedent. The loop keeps the counting and the
    logging; this keeps the shape.
    """
    cid = _first(r, "id", "cameraId", "camera_id")
    lat = _first(r, "latitude", "lat")
    lon = _first(r, "longitude", "lng", "lon")
    url = _first(r, "imageUrl", "image_url", "url", "imageURL")
    if not (cid and lat and lon):
        return None
    cid = str(cid)
    return Camera(
        camera_id=cid,
        # ⚠️ **`area` is read TWICE here and the two reads are different
        # questions.** This one is the last-resort fallback for a row with no
        # name and no title, and it is byte-identical to what shipped before the
        # borough landed — changing it would change behaviour for rows nobody
        # has counted.
        name=str(_first(r, "name", "title", "area") or cid),
        lat=float(lat),
        lon=float(lon),
        image_url=str(url or f"https://webcams.nyctmc.org/api/cameras/{cid}/image"),
        # ⚠️ ...and this one is the field's real meaning. A nameless row still
        # gets its borough here, and it also still gets that same string as its
        # name above. That duplication is upstream's, not ours.
        borough=_first(r, "area"),
    )


def fetch_cameras() -> list[Camera]:
    with httpx.Client(timeout=30, headers=UA, follow_redirects=True) as c:
        data = c.get(DOT_CAMERAS).raise_for_status().json()
    if isinstance(data, dict):
        data = data.get("items") or data.get("cameras") or data.get("data") or []

    out: list[Camera] = []
    dropped = 0
    for r in data:
        try:
            cam = camera_from_row(r)
        except Exception as e:  # noqa: BLE001 — but say so; see feeds.fetch_sensors
            dropped += 1
            log.warning("camera row rejected (%s): %s", type(e).__name__, e)
            continue
        if cam is None:
            dropped += 1
            continue
        out.append(cam)

    log.info("dot: %d cameras (%d rows dropped)", len(out), dropped)
    return out


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def pair_cameras(
    cameras: list[Camera], sensors: list[Sensor], max_m: float = MAX_PAIR_M
) -> list[Pair]:
    """Nearest-sensor pairing. Cameras with no sensor within `max_m` are
    deliberately left unpaired — an unpaired camera still renders, it just has
    no depth to show."""
    pairs: list[Pair] = []
    for cam in cameras:
        best: tuple[float, Sensor] | None = None
        for s in sensors:
            d = haversine_m(cam.lat, cam.lon, s.lat, s.lon)
            if best is None or d < best[0]:
                best = (d, s)
        if best and best[0] <= max_m:
            pairs.append(
                Pair(
                    camera_id=cam.camera_id,
                    sensor_id=best[1].sensor_id,
                    distance_m=round(best[0], 1),
                )
            )
    log.info(
        "paired %d/%d cameras within %.0fm", len(pairs), len(cameras), max_m
    )
    return pairs


def _first(row: dict, *keys):
    for k in keys:
        if row.get(k) not in (None, ""):
            return row[k]
    return None
