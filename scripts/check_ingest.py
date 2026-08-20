#!/usr/bin/env python3
"""Assert the parse-layer contract. No database, no network, no pytest.

    python3 scripts/check_ingest.py

A sibling to the other check scripts. This one covers `floodnet.py`, `gauges.py`
and `cameras.py` — the layer that turns somebody else's JSON into our models.

## The rule this whole file is about

**In a parse loop, a default value and a bare `continue` are the same failure.**
Both replace *"we do not know"* with something that looks like an answer.

Both forms have already shipped here:

 · `except (TypeError, ValueError): continue` silently ate **all 479** FloodNet
   sensors, because Socrata's `location` column is a GeoJSON dict and pydantic's
   `ValidationError` subclasses `ValueError`. The probe reported "OK, 0 sensors"
   and looked fine.
 · `_first_num` returned **`0`** when every depth column on a row was null —
   worse than a dropped row, because a dropped row is absent and the count says
   so, while a fabricated zero is *present, confident and wrong*: a sensor
   asserting the street is dry when what it published was nothing at all.
   Measured at 8-9 of ~399 rows per poll.

⚠️ **`floodnet.py` and `gauges.py` import `httpx` but open no socket here.**
Every function exercised below is a pure helper or a constant. Nothing in this
script fetches, and nothing may be added that does — `poll probe` is the live
check and it is run by a person.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from waterline import cameras, floodnet, gauges  # noqa: E402
from waterline.config import settings  # noqa: E402
from waterline.models import Camera, Sensor  # noqa: E402

logging.disable(logging.CRITICAL)

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


# --- `_first_num`: absence is None, never zero -----------------------------
DEPTH_KEYS = ("depth_filt_mm", "depth_proc_mm", "depth_raw_mm")

# ⚠️ The assertion this script exists for. A row with every depth column null is
# a sensor that published nothing, and it must not become `0.0 mm`.
check("a row with every depth column null yields None",
      floodnet._first_num(dict.fromkeys(DEPTH_KEYS), *DEPTH_KEYS), None)
check("and so does a row with no depth columns at all",
      floodnet._first_num({"time": "x"}, *DEPTH_KEYS), None)

# ⚠️ The other half, and it is what makes the first half a real distinction: a
# sensor genuinely reading zero is a MEASUREMENT and must survive.
check("but a real zero survives as a reading",
      floodnet._first_num({"depth_filt_mm": 0}, *DEPTH_KEYS), 0.0)
check("including a zero expressed as a float",
      floodnet._first_num({"depth_filt_mm": 0.0}, *DEPTH_KEYS), 0.0)
check("and a zero in a later column",
      floodnet._first_num({"depth_filt_mm": None, "depth_proc_mm": 0},
                          *DEPTH_KEYS), 0.0)

# Preference order: filtered, then processed, then raw. `depth_raw_mm` is an
# uncorrected range that is negative on 96% of rows, so reaching it is the last
# resort and the reason the plausibility floor exists at all.
check("the first non-null key wins",
      floodnet._first_num({"depth_filt_mm": 12, "depth_proc_mm": 99,
                           "depth_raw_mm": -20}, *DEPTH_KEYS), 12.0)
check("and it falls through nulls in order",
      floodnet._first_num({"depth_filt_mm": None, "depth_proc_mm": 99,
                           "depth_raw_mm": -20}, *DEPTH_KEYS), 99.0)
check("down to raw",
      floodnet._first_num({"depth_filt_mm": None, "depth_proc_mm": None,
                           "depth_raw_mm": -20}, *DEPTH_KEYS), -20.0)
check("a negative raw reading is returned, not swallowed",
      floodnet._first_num({"depth_raw_mm": -466}, *DEPTH_KEYS), -466.0)

# --- `_int` ---------------------------------------------------------------
check("_int parses", floodnet._int("12"), 12)
check("_int returns None rather than raising", floodnet._int("nope"), None)
check("and None in is None out", floodnet._int(None), None)

# --- the plausibility band -------------------------------------------------
# ⚠️ Half-open: `IMPLAUSIBLE_MIN_MM <= depth < IMPLAUSIBLE_MM`. Pinned because
# the band decides whether a number is called a depth at all, and both edges
# have been wrong once. It had a ceiling and NO FLOOR until 2026-08-05, so a
# sensor reporting -466 mm was called believable.
def plausible(mm: float) -> bool:
    return floodnet.IMPLAUSIBLE_MIN_MM <= mm < floodnet.IMPLAUSIBLE_MM


check("the floor is inclusive", plausible(floodnet.IMPLAUSIBLE_MIN_MM), True)
check("just under the floor is not", plausible(floodnet.IMPLAUSIBLE_MIN_MM - 0.1), False)
check("the ceiling is exclusive", plausible(floodnet.IMPLAUSIBLE_MM), False)
check("just under the ceiling is fine", plausible(floodnet.IMPLAUSIBLE_MM - 0.1), True)

# The four live faults this repo has actually seen, both signs.
for mm in (-1236.0, -466.0, -263.0, 786.0, 834.0, 995.0, 1451.0, 1458.0):
    check(f"the live fault {mm}mm is implausible", plausible(mm), False)
# And the ordinary readings around them.
for mm in (-116.0, -20.0, 0.0, 10.0, 40.0, 150.0, 599.0):
    check(f"the ordinary reading {mm}mm is plausible", plausible(mm), True)

# ⚠️ The derivation, as an assertion. `depth_raw_mm` sits near -20 mm normally
# and the worst legitimate observation was -116; the nearest fault was -261. The
# floor has to clear raw's normal excursion without admitting the faults.
check("the floor clears raw's documented resting value",
      floodnet.IMPLAUSIBLE_MIN_MM < -20.0, True)
check("and sits between the worst legitimate reading and the nearest fault",
      -261.0 < floodnet.IMPLAUSIBLE_MIN_MM < -116.0, True)

# If the band ever closed over the thresholds, every real flood reading would be
# judged a fault and the depth signal would vanish silently.
check("both borrowed thresholds sit inside the band",
      plausible(float(settings.flood_event_mm))
      and plausible(float(settings.curb_height_mm)), True)

# --- the clock traps -------------------------------------------------------
# ⚠️ Some devices report timestamps decades ahead. A naive `order_by: {time:
# desc}` returns readings dated 2080 and no live data at all, so every depth
# query is bounded on BOTH sides.
check("the future bound is minutes, not hours",
      floodnet.MAX_FUTURE <= timedelta(minutes=15), True)
check("and the age bound is hours", floodnet.MAX_AGE >= timedelta(hours=1), True)
check("future is far tighter than age", floodnet.MAX_FUTURE < floodnet.MAX_AGE, True)

check("a `Z` timestamp parses as UTC",
      floodnet._ts("2026-08-05T12:00:00Z"),
      datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc))
check("an explicit offset parses",
      floodnet._ts("2026-08-05T08:00:00-04:00").astimezone(timezone.utc),
      datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc))
# ⚠️ A NAIVE upstream timestamp is stamped UTC rather than left naive. A naive
# datetime reaching a `Wire` model is a 500 by design (`AwareDatetime`), and
# reaching the browser it is `parseServerTime`'s five-hour bug.
naive = floodnet._ts("2026-08-05T12:00:00")
check("a naive timestamp is stamped UTC rather than left naive",
      naive.tzinfo is not None, True)
check("and lands on the right instant",
      naive, datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc))

# --- `_in_clock_window`: the same trap, as a rule anything can reach --------
# ⚠️ **This is the assertion that would have caught a shipped bug.**
# `fetch_flood_events` sorted `start_time desc` with NO time bound for the whole
# life of the function, so it returned nothing but the broken clocks: measured
# 2026-08-07, all ten newest annotated events were dated **2080** and no real
# storm was reachable through it at any `limit`. It had no callers, so nothing
# was wrong on a page — what was wrong is that its docstring offers replay as
# the way to test this pipeline against a confirmed storm, and the offer did not
# stand up.
NOW = datetime(2026, 8, 7, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)


def windowed(iso: str, max_age: timedelta = 7 * DAY) -> bool:
    return floodnet._in_clock_window(floodnet._ts(iso), NOW, max_age)


check("a reading from an hour ago is inside the window",
      windowed("2026-08-07T11:00:00Z"), True)
check("and one from six days ago still is",
      windowed("2026-08-01T12:00:00Z"), True)
check("one past the age bound is outside",
      windowed("2026-07-30T12:00:00Z"), False)

# ⚠️ THE ONE THAT MATTERS. A one-sided `now - max_age <= ts` is the obvious
# freshness check and admits every 2080 row on the API.
check("a 2080 timestamp is REJECTED, however wide the age bound",
      windowed("2080-01-20T23:03:13Z"), False)
check("and it stays rejected at a hundred-year age bound",
      windowed("2080-01-20T23:03:13Z", 36500 * DAY), False)
check("the future bound is what rejects it, so a minute ahead is fine",
      windowed("2026-08-07T12:01:00Z"), True)
check("and an hour ahead is not",
      windowed("2026-08-07T13:00:00Z"), False)

# The naive `timestamp` column feeding the same rule. ⚠️ `flood_events.
# start_time` carries NO offset where `depth_data.time` does, so this is the
# path a real 2080 event actually arrives on.
check("a naive 2080 timestamp is rejected too",
      windowed("2080-01-20T23:03:13.122"), False)
check("and a naive recent one is accepted",
      windowed("2026-08-07T11:00:00"), True)

# The events window is history rather than a live reading, so it is days.
check("the flood-event window is days, not hours",
      floodnet.EVENTS_MAX_AGE >= DAY, True)
check("and it reaches back further than the depth window",
      floodnet.EVENTS_MAX_AGE > floodnet.MAX_AGE, True)

# --- `DEPTHS_COMPLETE_PER_DEPLOYMENT` is a guard, not a comment ------------
# ⚠️ `poll.tick` reuses one city-wide snapshot for the watched cameras, and it
# may ONLY because `distinct_on` makes that snapshot complete per deployment. A
# truncated snapshot starving a watched camera of its depth is a MISSED ALERT.
check("the completeness guard is set", floodnet.DEPTHS_COMPLETE_PER_DEPLOYMENT, True)

# --- the alert-permitted rule, and the single authority that owns it -------------------
# The same matrix `check_escalation.py` runs. Held twice on purpose: this is the
# ingest module's own contract, and that one is escalation's use of it.
check("the healthy statuses are exactly the three",
      sorted(floodnet.HEALTHY_STATUS), ["active", "good", "ok"])
for visible in (True, False):
    for status in ("good", "ok", "active", "low_charge", "dead", "unknown", "", None):
        want = visible and status in floodnet.HEALTHY_STATUS
        check(f"alert_permitted(visible={visible}, status={status!r})",
              floodnet.alert_permitted(visible, status), want)
        check(f"should_alert agrees (visible={visible}, status={status!r})",
              floodnet.should_alert(Sensor(sensor_id="s", lat=0.0, lon=0.0,
                                           alert_visible=visible,
                                           status=status or "")),
              visible and (status or "") in floodnet.HEALTHY_STATUS)

# --- gauges: the datum, and the refusal to invent a threshold -------------
# ⚠️ Getting a datum wrong is not a visible bug — it is a threshold that never
# fires. NOAA publishes the Battery's stage in feet above STATION DATUM (10.19)
# and serves level in whatever datum you ask for; we ask for MLLW, which sits
# 3.29 ft higher, so the figure we hold is 6.90.
check("the Battery's stage is the CONVERTED MLLW figure",
      gauges.BY_ID[gauges.BATTERY].minor_flood_ft, 6.90)
check("at its own stage it is above minor flood",
      gauges.above_minor_flood(gauges.BATTERY, 6.90), True)
check("a hair under is not", gauges.above_minor_flood(gauges.BATTERY, 6.89), False)
check("and well over is", gauges.above_minor_flood(gauges.BATTERY, 9.0), True)
# ⚠️ **The assertion that catches the datum mistake**, and it is the reason the
# figure is pinned twice. 7.5 ft sits ABOVE the converted MLLW stage (6.90) and
# BELOW the published station-datum one (10.19). With the right number this
# fires; with the published number pasted in unconverted it would silently never
# fire, and a threshold that never fires looks exactly like calm water.
check("a level between the two datums DOES fire, because MLLW is the one we hold",
      gauges.above_minor_flood(gauges.BATTERY, 7.5), True)
check("and the unconverted station-datum figure is not what is stored",
      gauges.BY_ID[gauges.BATTERY].minor_flood_ft == 10.19, False)

# Every USGS site: no published stage, and borrowing one would be inventing it.
for g in gauges.GAUGES:
    if g.network == "usgs":
        check(f"{g.gauge_id} publishes no flood stage", g.minor_flood_ft, None)
        check(f"and never reports above one ({g.gauge_id})",
              gauges.above_minor_flood(g.gauge_id, 9999.0), False)

check("an unknown gauge id is not above anything",
      gauges.above_minor_flood("nope", 9999.0), False)
check("and `site` says so rather than raising", gauges.site("nope"), None)

# ⚠️ The witness expires. This is what stops a dead gauge testifying forever
# under the second-witness rule's tidal clause.
check("the harbor witness expires within the hour",
      gauges.WITNESS_MAX_AGE <= timedelta(hours=1), True)
check("and it is far tighter than what may be DISPLAYED",
      gauges.WITNESS_MAX_AGE < gauges.STALE_AFTER, True)

# `gauges._ts` returns None on failure rather than `datetime.now()`. Stamping an
# unparseable reading with the current time makes stale data look fresh, which
# is the frozen-poller rule arriving through the parser.
check("an unparseable gauge timestamp is dropped, not stamped now",
      gauges._ts("nonsense"), None)
check("and so is a missing one", gauges._ts(None), None)

# --- cameras: the two tiers -----------------------------------------------
# `GOLD_PAIR_M` gates what may become a TRAINING LABEL; `MAX_PAIR_M` gates what
# may be OPERATED ON. A silver pair still yields a useful depth read; it just
# never teaches the model anything.
check("gold is tighter than the operating bound",
      cameras.GOLD_PAIR_M < cameras.MAX_PAIR_M, True)

check("haversine is zero at a point", cameras.haversine_m(40.7, -73.9, 40.7, -73.9), 0.0)
check("and symmetric",
      round(cameras.haversine_m(40.7, -73.9, 40.75, -73.95), 6),
      round(cameras.haversine_m(40.75, -73.95, 40.7, -73.9), 6))

# `pair_cameras` takes the NEAREST sensor and drops anything past the bound.
cam = Camera(camera_id="c1", name="n", lat=40.7340, lon=-73.9770,
             image_url="http://x")
near = Sensor(sensor_id="near", lat=40.7343, lon=-73.9773,
              alert_visible=True, status="good")
far = Sensor(sensor_id="far", lat=40.7500, lon=-73.9900,
             alert_visible=True, status="good")

pairs = cameras.pair_cameras([cam], [near, far])
check("the nearest sensor wins", [p.sensor_id for p in pairs], ["near"])
check("and the distance is stored", pairs[0].distance_m < cameras.GOLD_PAIR_M, True)

check("a camera with nothing in range is left UNPAIRED, not paired badly",
      cameras.pair_cameras([cam], [far]), [])
check("an unpaired camera is dropped from the list rather than nulled",
      len(cameras.pair_cameras([cam], [])), 0)

# --- `pair_tier`: the classification, at the constants it classifies -------
# ⚠️ **The single authority for what crosses the wire.** `db.camera_registry`
# returns the raw `pairs.distance_m` and `api.camera_registry` puts it through
# this; the UI never sees a distance. Same shape as `floodnet.alert_permitted`,
# and assertable here for the same reason — it is a pure function of a number.
check("no pairing at all is `unpaired`, never a tier",
      cameras.pair_tier(None), "unpaired")

# ⚠️ **Both bounds INCLUSIVE**, matching `pair_cameras`' own `best[0] <= max_m`
# (`cameras.py`). A camera exactly at the bound is paired there and must be
# classified here — the two are one keystroke apart and a mismatch would put a
# stored row in a tier nothing draws.
check("zero metres is paired", cameras.pair_tier(0.0), "paired")
check("the gold bound is INCLUSIVE",
      cameras.pair_tier(cameras.GOLD_PAIR_M), "paired")
check("just past it is `near`",
      cameras.pair_tier(cameras.GOLD_PAIR_M + 0.1), "near")
check("the operating bound is INCLUSIVE",
      cameras.pair_tier(cameras.MAX_PAIR_M), "near")

# ⚠️ **Unreachable today and not forever, and `unpaired` is the SAFE
# direction.** `pair_cameras` never writes a row above `MAX_PAIR_M`, so nothing
# in the table can reach this branch — but lowering that constant without
# re-running `bootstrap` leaves stale rows above the new bound, and withholding
# a depth is the right answer for them. The alternative labels a 400 m sensor as
# this corner's.
check("a stale row past the bound WITHHOLDS rather than labels",
      cameras.pair_tier(cameras.MAX_PAIR_M + 0.1), "unpaired")

# The wire's `PairTier` literal set, held on this side too. A fourth tier here
# with no matching literal in `models.py` is a 500 on a route that answers about
# every camera in the city.
check("the tier vocabulary is exactly three words",
      sorted({cameras.pair_tier(d)
              for d in (None, 0.0, 50.0, 100.0, 100.1, 250.0, 250.1, 9999.0)}),
      ["near", "paired", "unpaired"])

# ⚠️ **The internal names may not leak.** `gold` and `silver` are what these two
# constants are called in this file and in `waterline/CLAUDE.md`; the reader's
# three words are `paired`, `near` and `not paired`. This asserts the wire half;
# `web/tests/camera-filter.test.ts` asserts the copy half.
for word in ("gold", "silver"):
    check(f"no tier value contains {word!r}",
          any(word in cameras.pair_tier(d)
              for d in (None, 0.0, 100.0, 200.0, 400.0)), False)

# --- `camera_from_row`: the borough, and the name that must not move -------
# Extracted from `fetch_cameras` so this can be driven with no network —
# `gauges._ts`' precedent, one module over.
_ROW = {"id": "abc", "name": "South St @ Broad St",
        "latitude": 40.7, "longitude": -74.0, "area": "Manhattan"}

check("`area` is read into `borough`",
      cameras.camera_from_row(_ROW).borough, "Manhattan")
check("...and the NAME is untouched by it",
      cameras.camera_from_row(_ROW).name, "South St @ Broad St")

_NO_AREA = {k: v for k, v in _ROW.items() if k != "area"}
check("a row with no `area` gets a null borough rather than a guess",
      cameras.camera_from_row(_NO_AREA).borough, None)
check("...and the same name",
      cameras.camera_from_row(_NO_AREA).name, "South St @ Broad St")

# ⚠️ **`area` is read TWICE and the two reads are different questions.** This
# one is the last-resort fallback for a nameless row and it is byte-identical to
# what shipped before the borough landed — removing it changes behaviour for
# rows nobody has counted. The duplication in the output is upstream's.
_NO_NAME = {"id": "abc", "latitude": 40.7, "longitude": -74.0, "area": "Bronx"}
check("a nameless row still falls back to `area` for its NAME",
      cameras.camera_from_row(_NO_NAME).name, "Bronx")
check("...and still gets `area` as its BOROUGH",
      cameras.camera_from_row(_NO_NAME).borough, "Bronx")

# The parse still refuses what it always refused, and it says so by returning
# None rather than by raising — the loop counts and logs.
check("a row with no coordinates is refused, not defaulted",
      cameras.camera_from_row({"id": "abc", "area": "Queens"}), None)

if failures:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

print("ingest contract OK")
