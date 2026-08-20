#!/usr/bin/env python3
"""Print the Python half of every number the UI duplicates. JSON on stdout.

    python3 scripts/parity_constants.py

**This script asserts nothing.** It is one half of a cross-language check whose
other half is `web/tests/parity.test.ts`, and the split is deliberate: vitest
already resolves the TypeScript, so the web side drives and this side only has
to answer. Putting the assertions here instead would mean teaching Python to
load a TS module, which is the resolve hook the test suite deleted.

## Why this exists at all

Six numbers in this repo are written down twice, in two languages, on purpose.
Each carries a comment saying it must stay in step with its twin, and **nothing
could see either half moving.** The sharpest example:
`scripts/check_watch.py` asserts

    check("the silence threshold is the same hour `staleness.ts` calls a sensor
           stale", watch.SENSOR_STALE_AFTER_S, 3600)

under a comment naming `staleness.ts` — and `staleness.ts` can be edited to 1800
with that assertion still green, because a Python script cannot read it. That is
the gap this closes.

⚠️ **Never add an assertion to this file.** The moment it can fail, it becomes a
second place the contract is enforced, and the two will disagree about which
numbers matter. It prints; the test decides.

⚠️ **Never let this import anything that touches the network or the database.**
It is run from a test process with no `.env` guaranteed and no Postgres. Every
module below is pure or config-only, on the same rule the two check scripts
follow.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ⚠️ **`cadence`, NEVER `poll`.** The two integers below live in a leaf module
# for exactly this import, and reaching them through `poll` instead pulls
# `auth` → `fastapi` and `db` → `psycopg`, neither of which is installed in the
# bare `python3` this runs under.
#
# ⚠️ **And the failure is SILENT, which is what makes it worth a warning.**
# `parity.test.ts` skips rather than fails when this script cannot run — by
# design, so a fresh clone with no Python dependencies still passes — so an
# import error here does not go red anywhere. It just turns every
# cross-language assertion in the repo off. That happened on 2026-08-20, in the
# same change that made one of those assertions load-bearing for the first time.
from waterline import agent, cadence, cameras, floodnet, peaks, rat, watch  # noqa: E402
from waterline.config import settings  # noqa: E402

# Millimetre readings probed on both sides of the one-inch boundary. The units
# each language *prints* differ on purpose — `agent._depth_phrase` renders whole
# inches for prose and `formatDepth` renders one decimal for a card — so what is
# compared is which UNIT is chosen, never the rendered string.
DEPTH_PROBE = [-466.0, 0.0, 1.0, 10.0, 25.0, 25.3, 25.39, 25.4, 25.41, 26.0,
               50.0, 150.0, 1451.0]

# Coordinate pairs for the haversine cross-check. `cameras.haversine_m` is
# LAT-FIRST and `distance.haversineM` takes named fields; these are emitted as
# named objects so the test cannot reintroduce the transposition by reading the
# tuple in the wrong order.
HAVERSINE_PROBE = [
    {"a": {"lat": 40.7340, "lon": -73.9770}, "b": {"lat": 40.7375, "lon": -73.9745}},
    {"a": {"lat": 40.6782, "lon": -73.9442}, "b": {"lat": 40.7061, "lon": -73.9969}},
    {"a": {"lat": 40.7340, "lon": -73.9770}, "b": {"lat": 40.7340, "lon": -73.9770}},
]

# Windows probed on both sides of both clamp bounds, including the values a
# number input actually produces on the way to a real one (0, and a value past
# retention). `clamp_minutes` and `clampWindow` have to agree at every one.
CLAMP_PROBE = [-1, 0, 1, 10, 60, 1440, 10079, 10080, 10081, 525600]

_EN = agent._TEMPLATES["en"]


def _renders_as_mm(depth_mm: float) -> bool:
    """Which unit `agent._depth_phrase` picks for this reading."""
    return agent._depth_phrase(depth_mm, _EN) == str(
        _EN["depth_mm_phrase"]
    ).format(n=f"{depth_mm:.0f}")


print(json.dumps({
    # --- staleness, in seconds -------------------------------------------
    "SENSOR_STALE_AFTER_S": watch.SENSOR_STALE_AFTER_S,
    "REPLAY_MAX_AGE_S": rat.REPLAY_MAX_AGE_S,
    "FLOODNET_MAX_AGE_S": int(floodnet.MAX_AGE.total_seconds()),

    # --- the two POLL CADENCES, and why they are here ---------------------
    # ⚠️ **Every threshold in `web/src/lib/staleness.ts` is a multiple of one of
    # these, and until 2026-08-20 nothing could see either half move.** They were
    # tuned against a 60s loop — `TICK_COLD_AFTER_S` is commented "three poll
    # intervals" — and when the poller moved to a fifteen-minute schedule so the
    # database could suspend between runs, all four became wrong at once: cards
    # reading stale two thirds of the time, and a permanent *the poller is
    # frozen* banner on a deployment polling perfectly.
    #
    # That is exactly the gap this file exists to close, so both cadences are
    # exported and `parity.test.ts` asserts the RELATIONSHIP rather than an
    # equality: the UI's numbers must stay clear of the cadence, whatever either
    # of them becomes next.
    "POLL_SECONDS": cadence.POLL_SECONDS,
    "POLL_WINDOW_S": cadence.POLL_WINDOW_S,

    # --- distance, in metres ---------------------------------------------
    "MAX_PAIR_M": cameras.MAX_PAIR_M,
    "GOLD_PAIR_M": cameras.GOLD_PAIR_M,

    # --- the two borrowed thresholds -------------------------------------
    # These reach the UI over the wire rather than as a TS constant, so the test
    # asserts the wire-shaped claim: that the fixtures it uses are the real ones.
    "flood_event_mm": settings.flood_event_mm,
    "curb_height_mm": settings.curb_height_mm,

    # --- the plausibility band -------------------------------------------
    "IMPLAUSIBLE_MM": floodnet.IMPLAUSIBLE_MM,
    "IMPLAUSIBLE_MIN_MM": floodnet.IMPLAUSIBLE_MIN_MM,

    # --- the depth-peak window -------------------------------------------
    # ⚠️ `web/src/lib/depth-window.ts` duplicates all four. The retention day
    # count is the one that matters most: it is the ceiling on what a window may
    # ask for, and if the UI's copy of it drifts ABOVE the Python one, the menu
    # offers a window the server silently narrows — a seven-day peak wearing a
    # thirty-day label, which is the one way this feature can understate a
    # flood. The presets are duplicated for the same reason every other pair
    # here is: nothing else can see one half move.
    "PRESET_MINUTES": list(peaks.PRESET_MINUTES),
    "RETENTION_DAYS": peaks.RETENTION_DAYS,
    "MIN_WINDOW_MIN": peaks.MIN_WINDOW_MIN,
    "MAX_WINDOW_MIN": peaks.MAX_WINDOW_MIN,
    # Behavioural, on `depth_renders_as_mm`'s model: the two clamps have to
    # agree at the edges, not merely share a ceiling constant.
    "clamp_probe_min": CLAMP_PROBE,
    "clamp_probe_out": [peaks.clamp_minutes(m) for m in CLAMP_PROBE],

    # --- the disclaimer, which is duplicated into the UI as a fallback -----
    # ⚠️ `site-footer.tsx`'s `FALLBACK_DISCLAIMER` must be byte-identical to the
    # `en` string here. It is the API-is-down copy, so the only time a reader
    # sees it is the moment they are least able to tell it apart from the live
    # one — the two saying different things would make a dead API look like a
    # different product. Emitted so the web side can assert it rather than trust
    # a comment.
    "disclaimer_en": agent.disclaimer("en"),
    "disclaimer_es": agent.disclaimer("es"),

    # --- behavioural, not numeric ----------------------------------------
    "depth_probe_mm": DEPTH_PROBE,
    "depth_renders_as_mm": [_renders_as_mm(mm) for mm in DEPTH_PROBE],
    "haversine": [
        {**pair, "m": cameras.haversine_m(
            pair["a"]["lat"], pair["a"]["lon"],
            pair["b"]["lat"], pair["b"]["lon"],
        )}
        for pair in HAVERSINE_PROBE
    ],
}))
