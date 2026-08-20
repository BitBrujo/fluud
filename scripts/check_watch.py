#!/usr/bin/env python3
"""Assert the sensor-watch safety contract. No database, no network, no pytest.

    python3 scripts/check_watch.py

A **sibling** to `check_escalation.py` rather than an extension of it, and the
reason is worth stating because merging them looks like tidying. That file's
docstring scopes itself to `escalation.py` and `agent.py` being pure, and its
whole length is one continuous argument about one state machine. Three
consequences:

 1. **The two machines are different, and confusing them is the mistake this
    file exists to prevent.** An active NWS alert raises a level in one and
    raises nothing in the other. Assertions about both interleaved in one file
    is exactly how somebody later "fixes an inconsistency" that is the safety
    property.
 2. **`check_escalation.py` is the control.** Every step of this build runs it
    unchanged and green, which is the evidence `escalation.py` was not touched.
    A file being edited cannot also be the thing proving nothing was edited.
 3. The one genuinely cross-module claim — that the two credibility gates
    agree — is a claim about **watch's obligation to escalation**, so it
    belongs where a change to `watch.py` gets reviewed.

⚠️ **`watch.py` is the LIVE state machine now** and `escalation.py` is dormant:
the on-page alert system was unwired, so nothing calls it. It is still checked,
and still checked separately, because putting the warning back on the page is
meant to be a re-wire rather than a rebuild.

The load-bearing assertion here is the credibility equality. Everything else
pins a number or a direction; that one is what stops the two gates drifting
into two different answers about one faulted rangefinder.
"""

import sys
from datetime import datetime, timedelta, timezone
from itertools import product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from waterline import feeds, floodnet, watch  # noqa: E402
from waterline.config import settings  # noqa: E402
from waterline.escalation import _depth_is_credible, level_for  # noqa: E402
from waterline.models import (  # noqa: E402
    Level,
    Observation,
    SensorReadingFacts,
    WeatherAlert,
)

# The same four readings from the 2026-08-04 incident `check_escalation.py`
# turns on, in mm. All non-tidal, all with FloodNet's own `flood_detected`
# false, all on a clear day with no NWS alert in the state.
PHANTOM = [786.0, 1458.0, 666.0, 995.0]

NOW = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


def facts(**kw) -> SensorReadingFacts:
    """A permitted, healthy deployment unless a test says otherwise."""
    base = dict(sensor_id="s", observed_at=NOW, alert_visible=True, status="good")
    base.update(kw)
    return SensorReadingFacts(**base)


def obs(**kw) -> Observation:
    base = dict(camera_id="c", observed_at=NOW)
    base.update(kw)
    return Observation(**base)


# --- the second-witness rule on the sensor path: three witnesses, not four -------------
for mm in PHANTOM:
    faulted = dict(depth_mm=mm, plausible=False)

    check(
        f"phantom {mm}mm alone is not credible",
        watch.is_credible(**faulted, flood_detected=False, nws_active=False,
                          tidal=False, harbor_above_flood=False),
        False,
    )
    check(
        f"phantom {mm}mm stays rejected when the harbor is high but the sensor is not tidal",
        watch.is_credible(**faulted, flood_detected=False, nws_active=False,
                          tidal=False, harbor_above_flood=True),
        False,
    )
    check(
        f"phantom {mm}mm stays rejected for a tidal sensor when the harbor is normal",
        watch.is_credible(**faulted, flood_detected=False, nws_active=False,
                          tidal=True, harbor_above_flood=False),
        False,
    )
    check(
        f"phantom {mm}mm IS credible for a tidal sensor under a high harbor",
        watch.is_credible(**faulted, flood_detected=False, nws_active=False,
                          tidal=True, harbor_above_flood=True),
        True,
    )
    check(
        f"{mm}mm credible on FloodNet's own flood_detected",
        watch.is_credible(**faulted, flood_detected=True, nws_active=False,
                          tidal=False, harbor_above_flood=False),
        True,
    )
    check(
        f"{mm}mm credible under an active NWS alert",
        watch.is_credible(**faulted, flood_detected=False, nws_active=True,
                          tidal=False, harbor_above_flood=False),
        True,
    )
    # End to end, through the record rather than the bare gate.
    check(
        f"non-tidal phantom {mm}mm under a high harbor stays CLEAR",
        watch.effective_level(
            facts(depth_mm=mm, plausible=False, harbor_above_flood=True)
        ),
        Level.CLEAR,
    )
    check(
        f"tidal phantom {mm}mm under a high harbor reaches EMERGENCY",
        watch.effective_level(
            facts(depth_mm=mm, plausible=False, tidal=True,
                  harbor_above_flood=True)
        ),
        Level.EMERGENCY,
    )

# ⚠️ **There is nowhere here to put a camera's judgement, and that is asserted
# rather than assumed.** `watch.is_credible` takes bare positional facts and
# `SensorReadingFacts` has no field one could be stored in. The
# water-segmentation layer is gone, so nothing produces such a judgement — but
# these are the assertions that fail if a re-wire brings the field back and
# quietly hands this path a class nobody looked at a frame for.
check(
    "SensorReadingFacts has no field a camera judgement could arrive through",
    sorted(
        f for f in SensorReadingFacts.model_fields
        if f in {"severity", "vision_confidence", "confidence"}
    ),
    [],
)

# --- the load-bearing one: the two gates are now IDENTICAL ------------------
#
# ⚠️ **This was "narrower, never wider" and it is now an EQUALITY.**
# `escalation._depth_is_credible` accepted a fourth witness — the camera seeing
# water — and that went with the water-segmentation layer, so the two functions
# take the same three. Asserted as equality rather than as an inequality
# because that is what is true: an inequality would stay green through a change
# to either side and this is meant to fire.
#
# ⚠️ **If this fires, one of the two changed and BOTH docstrings are stale.**
# They still describe each other. Fix the code or fix both files; do not
# weaken this back to `<=`.
matrix = 0
for depth, plausible, flood, nws, tidal, harbor in product(
    (None, -466.0, 0.0, 9.0, 10.0, 40.0, 149.0, 150.0, 1458.0),
    (True, False),
    (True, False),
    (True, False),
    (True, False),
    (True, False),
):
    mine = watch.is_credible(depth, plausible, flood, nws, tidal, harbor)
    theirs = _depth_is_credible(
        obs(depth_mm=depth, depth_plausible=plausible, flood_detected=flood,
            nws_active=nws, tidal=tidal, harbor_above_flood=harbor)
    )
    matrix += 1
    if mine != theirs:
        failures.append(
            "watch.is_credible and escalation._depth_is_credible disagree — "
            f"depth={depth} plausible={plausible} flood={flood} nws={nws} "
            f"tidal={tidal} harbor={harbor}: watch={mine} escalation={theirs}"
        )
check("the credibility-equality matrix actually ran", matrix, 9 * 2**5)

# --- the depth axis agrees with escalation, boundary for boundary ----------
# Same borrowed thresholds, same direction. Pinned rather than trusted, because
# the two files would drift silently: a changed constant in one and a hard-coded
# number in the other produces a page and an inbox that disagree about the same
# millimetres.
for mm in (0.0, 9.0, 9.99, 10.0, 10.01, 40.0, 149.0, 149.99, 150.0, 150.01,
           200.0, 599.0):
    check(
        f"level_for_depth({mm}) agrees with escalation on the depth-only axis",
        watch.level_for_depth(mm, True),
        level_for(obs(depth_mm=mm)),
    )
check("no depth is CLEAR", watch.level_for_depth(None, True), Level.CLEAR)
check("an incredible depth is CLEAR", watch.level_for_depth(1458.0, False),
      Level.CLEAR)

# --- NWS and the harbor are witnesses here, never triggers -----------------
# This is where the two machines deliberately disagree, so both sides are
# asserted: `escalation` raises to WATCH on an NWS alert because it is deciding
# about one corner; this path would turn one county-scale product into one email
# per subscription, city-wide.
check(
    "escalation raises to WATCH on an NWS alert alone",
    level_for(obs(nws_active=True)),
    Level.WATCH,
)
check(
    "the sensor path raises NOTHING on an NWS alert alone",
    watch.effective_level(facts(nws_active=True)),
    Level.CLEAR,
)
check(
    "a high harbor alone raises nothing",
    watch.effective_level(facts(tidal=True, harbor_above_flood=True)),
    Level.CLEAR,
)

# --- WHICH alerts are witnesses, pinned event by event ----------------------
# ⚠️ **The gauges panel shows every active NWS product for the five boroughs**
# since 2026-08-15 — tornado, severe thunderstorm, heat, the lot — and this is
# the assertion that the display set did not leak into the witness set. If it
# ever did, a Heat Advisory would corroborate a rangefinder reading four metres,
# and a Tornado Warning would raise every subscribed sensor in the city.
#
# `feeds.is_witness_alert` is the whole of the credibility side. The panel reads
# `feeds.fetch_nws_alerts_all()` and needs nothing from this predicate, so there
# is never a display reason to widen it.
WITNESS_EVENTS = {
    # --- water: witnesses ---
    "Flood Warning": True,
    "Flash Flood Warning": True,
    "Coastal Flood Advisory": True,
    "Coastal Flood Watch": True,
    "Flood Advisory": True,
    # ⚠️ PRE-EXISTING and deliberately left alone. `"rain"` is wider than the
    # rule's name suggests and freezing rain is not evidence of standing water.
    # It is pinned here rather than fixed because tightening it MOVES the second
    # witness, which is a change to what this app believes about a faulted
    # sensor and is not a change to make while renaming a tab. Fix it on its own
    # terms or not at all.
    "Freezing Rain Advisory": True,
    # --- severe weather: displayed, NEVER witnesses ---
    "Tornado Warning": False,
    "Severe Thunderstorm Warning": False,
    "Hurricane Warning": False,
    "Tropical Storm Warning": False,
    "Storm Surge Warning": False,
    "Winter Storm Warning": False,
    "Heat Advisory": False,
    "Air Quality Alert": False,
    "High Wind Warning": False,
}
for event, want in WITNESS_EVENTS.items():
    check(
        f"{event!r} is {'a' if want else 'NOT a'} second witness",
        feeds.is_witness_alert(WeatherAlert(event=event)),
        want,
    )

# ⚠️ **A storm surge warning is the one a reader would most expect to corroborate
# a tidal sensor, and it does not.** That is correct rather than an oversight:
# the tidal second witness is the HARBOR GAUGE being above flood stage — an
# observation — and not a forecast product. Adding it here would put a
# prediction into the set of things that confirm a measurement.
check(
    "the tidal witness is still the gauge and not a forecast",
    watch.is_credible(786.0, False, False, False, tidal=True,
                      harbor_above_flood=True),
    True,
)

# The scope split: the REQUEST stays statewide because it feeds the witness
# path; only the panel narrows to the five boroughs, and it narrows AFTER.
check("the NWS request is still statewide", feeds.NWS_ALERTS.endswith("/alerts/active"), True)
check("an alert with no geocode is NOT claimed as local",
      feeds.in_nyc(WeatherAlert(event="Flood Warning")), False)
check("a Manhattan SAME code is local",
      feeds.in_nyc(WeatherAlert(event="Flood Warning", same_codes=["036061"])), True)
check("a Westchester SAME code is not",
      feeds.in_nyc(WeatherAlert(event="Flood Warning", same_codes=["036119"])), False)

# ⚠️ **And the display path may not be reachable from either decision module.**
# Same shape as `check_escalation.py`'s "`Observation` carries no field one could
# arrive through": a grep in a check script is the only thing that catches this
# being widened a year from now, by somebody who has read neither docstring.
#
# ⚠️ `nws_reads` / `record_nws_read` replaced `LAST_NWS` here on 2026-08-20, when
# the display state moved from a module global to a row. Guarding a symbol that
# no longer exists is a check that can only pass, so the names have to track the
# thing they fence off. `nws_active` stays deliberately absent: it IS the
# credibility path, and both modules are supposed to reach it.
DISPLAY_ONLY = ("fetch_nws_alerts_all", "NwsRead", "NwsStatus", "NwsAlert",
                "nws_reads", "record_nws_read", "in_nyc", "same_codes",
                "area_desc")
for module in ("watch", "escalation"):
    src = (Path(__file__).resolve().parent.parent / "waterline" / f"{module}.py").read_text()
    for name in DISPLAY_ONLY:
        check(f"{module}.py cannot reach the display-only {name!r}",
              name in src, False)

# --- the alert-permitted rule: a deployment FloodNet disabled never notifies -------------
# The same (visible, status) matrix `check_escalation.py` runs `alert_permitted`
# over, asserted here at a depth that would otherwise be an EMERGENCY. A
# subscription is an alarm with a longer wire on it, and it obeys the same gate.
for visible in (True, False):
    for status in ("good", "ok", "active", "low_charge", "dead", "unknown", ""):
        permitted = floodnet.alert_permitted(visible, status)
        f = facts(depth_mm=1000.0, alert_visible=visible, status=status)
        check(
            f"is_permitted delegates for (visible={visible}, status={status!r})",
            watch.is_permitted(f),
            permitted,
        )
        check(
            f"1000mm notifies only where permitted (visible={visible}, "
            f"status={status!r})",
            watch.effective_level(f) is not Level.CLEAR,
            permitted,
        )
        action, _, _ = watch.transition(f, None)
        check(
            f"and opens no episode where it may not (visible={visible}, "
            f"status={status!r})",
            action == "open",
            permitted,
        )

# --- the monotonic and slow-stand-down rules: monotonic up, slow down ---------------------------
running = {"level": "warning", "clear_streak": 0, "peak_depth_mm": 40.0}

action, level, _ = watch.transition(facts(depth_mm=0.0), running)
check("a clear reading mid-episode holds rather than dropping", action, "hold")
check("and the level does not walk back down", level, Level.WARNING)
check("a hold writes no message", watch.should_notify(action), False)

action, level, _ = watch.transition(facts(depth_mm=200.0), running)
check("a worse reading escalates", action, "escalate")
check("to the higher level", level, Level.EMERGENCY)
check("an escalation writes a message", watch.should_notify(action), True)

for n in range(1, settings.clear_readings_to_stand_down):
    action, _, detail = watch.transition(
        facts(depth_mm=0.0), {**running, "clear_streak": n - 1}
    )
    check(f"clear reading {n} of {settings.clear_readings_to_stand_down} holds",
          action, "hold")
    check(f"and counts it ({n})", detail["clear_streak"], n)

action, _, _ = watch.transition(
    facts(depth_mm=0.0),
    {**running, "clear_streak": settings.clear_readings_to_stand_down - 1},
)
check(
    f"the {settings.clear_readings_to_stand_down}th consecutive clear reading "
    "closes the episode",
    action,
    "close",
)
# ⚠️ **`close` writes NO message, and this assert is the control on that.** The
# stand-down email was removed on 2026-08-05, on the owner's instruction: whatever
# a stand-down says the reader hears *it's over*, and it had to spend two
# paragraphs refusing the inference it invited. The episode still closes — the
# assert above pins that — and `poll._watch_sensors` still writes the row. What
# is gone is the message. If this ever flips back to True, the copy has to come
# back with it, and `mail.render` has no `standdown` kind any more.
check("but a stand-down is NOT worth an inbox", watch.should_notify("close"), False)

check("nothing running and nothing to say opens nothing",
      watch.transition(facts(depth_mm=0.0), None)[0], "none")
check("a `none` writes no message", watch.should_notify("none"), False)

# --- deference to a camera episode. ⚠️ DORMANT: nothing sets `camera_level` --
# The on-page alert system was unwired, so `poll._watch_sensors` passes None and
# `effective_level` returns `sensor_level`. These still run, over a field only
# this file populates, so a re-wire has a contract to land against.
#
# ⚠️ `effective_level` is a max, not a substitution, and these pin the
# direction. That is what makes re-wiring safe whatever the camera path decides:
# it can raise a level and can never talk one down.
check(
    "an open camera EMERGENCY carries a quiet sensor with it",
    watch.effective_level(facts(depth_mm=0.0, camera_level=Level.EMERGENCY)),
    Level.EMERGENCY,
)
check(
    "a camera at WATCH never talks a sensor at EMERGENCY down",
    watch.effective_level(
        facts(depth_mm=200.0, camera_level=Level.WATCH)
    ),
    Level.EMERGENCY,
)
check(
    "no open alert defers nothing — the sensor path runs on its own",
    watch.effective_level(facts(depth_mm=200.0, camera_level=None)),
    Level.EMERGENCY,
)
# ⚠️ **Deference outranks `is_permitted`, and that is correct rather than a
# hole in the alert-permitted rule.** An open `alerts` row is a warning this app is already
# broadcasting on the page and through the rat, and it only exists because
# `poll.tick`'s own `alert_visible` gate let it open. Suppressing the email
# because that sensor's health has since degraded would withhold a warning we
# are publishing anyway — a false negative, which is the failure this whole
# repo is shaped against. The gate that matters ran upstream; this repeats its
# answer rather than re-litigating it.
check(
    "an open camera alert carries through even if the sensor has since degraded",
    watch.effective_level(
        facts(depth_mm=0.0, alert_visible=False, camera_level=Level.EMERGENCY)
    ),
    Level.EMERGENCY,
)
# ...and with no alert open, the gate is the only thing deciding. Both halves
# together are the property: the alert-permitted rule governs what THIS path may start, not
# what it may repeat.
check(
    "but a degraded sensor with no open alert starts nothing on its own",
    watch.effective_level(
        facts(depth_mm=1000.0, alert_visible=False, camera_level=None)
    ),
    Level.CLEAR,
)

# --- silence is a line on the manage face, not an email ---------------------
# ⚠️ **This was `silence_notice_due` and it is now `is_silent`**, which is a
# smaller function on purpose. The old one took an `already_notified` argument
# because an email may be sent once per silence and never once per tick; a line
# recomputed on every read of `/api/watch/subscription` has no such problem, so
# the dedupe argument is gone along with `db.silence_notified_since` and the
# `silence` kind in the outbox. The threshold itself did not move.
check("a sensor reporting a minute ago is not silent",
      watch.is_silent(NOW - timedelta(minutes=1), NOW), False)
check("nor one just inside the window",
      watch.is_silent(
          NOW - watch.SENSOR_STALE_AFTER + timedelta(seconds=1), NOW),
      False)
check("one past the window is",
      watch.is_silent(NOW - watch.SENSOR_STALE_AFTER, NOW), True)
check("and one long past it stays silent however often it is asked",
      watch.is_silent(NOW - timedelta(hours=9), NOW), True)
check("a deployment that has never reported is the deepest silence",
      watch.is_silent(None, NOW), True)

# --- an outage must not become N false claims about instruments -------------
# ⚠️ This bounded a fan-out of EMAILS until 2026-08-05 — measured at five
# subscribers watching ten instruments each, one outage was 50 messages from a
# single tick. The silence signal is a line on a page now, so that fan-out
# cannot happen; the OTHER half of the argument never depended on the transport
# and is what these still pin. When most of the city is dark the instruments did
# not fail, we lost the feed, and "the sensor at Ave C has stopped reporting" is
# false on a page exactly as it was in an inbox.
check("a normal tick is not a citywide silence (395 of 425 reporting)",
      watch.citywide_silence(425, 395), False)
check("nor is a bad afternoon (300 of 425)",
      watch.citywide_silence(425, 300), False)
check("exactly half the city dark IS one",
      watch.citywide_silence(425, 212), True)
check("and a total outage certainly is",
      watch.citywide_silence(425, 0), True)

# ⚠️ The unmeasurable case defaults to SUPPRESSING, and the direction is the
# decision rather than an accident. `total <= 0` means the registry read or the
# depth fetch died outright, so we cannot tell one dead instrument from a dead
# feed. Costing a subscriber a notice is a gap in a mitigation LIMITATIONS §16
# already calls incomplete; the other default asserts something about hundreds
# of instruments we did not hear from.
check("an unmeasurable tick suppresses rather than fans out",
      watch.citywide_silence(0, 0), True)
check("and so does a negative, however it got there",
      watch.citywide_silence(-1, 0), True)

# The margin, stated as an assert rather than left in a comment: the resting
# silence is ~7% (30 of 425 legitimately quiet on any tick, measured
# 2026-08-05), and the threshold has to sit far above it or this fires on a
# normal evening and trains everybody to ignore it.
check(
    "the threshold clears the measured resting silence by a wide margin",
    watch.CITYWIDE_SILENCE >= 5 * (30 / 425),
    True,
)

# The threshold is shared with the page, and the page is where it was derived.
check(
    "the silence threshold is the same hour `staleness.ts` calls a sensor stale",
    watch.SENSOR_STALE_AFTER_S,
    3600,
)
# ⚠️ It has to sit strictly inside the depth query's own window. A sensor past
# `floodnet.MAX_AGE` has no row in the payload at all, so a threshold at or past
# that boundary would make the notice unreachable — the mitigation would exist
# and never fire, which is worse than not having it.
check(
    "and it sits strictly inside the depth query's window",
    watch.SENSOR_STALE_AFTER < floodnet.MAX_AGE,
    True,
)


if failures:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

print("watch contract OK")
