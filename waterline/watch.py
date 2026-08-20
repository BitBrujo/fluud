"""The sensor watch state machine — what a subscription is told, and when.

PURE, exactly like `escalation.py` and for the same reason: this is the only
thing standing between a faulted rangefinder and an email in somebody's inbox at
three in the morning. No I/O, no database, no network, no clock of its own. The
caller passes `now` in.

⚠️ **This is the LIVE state machine.** `escalation.py` is dormant — the on-page
alert system was unwired — so this is the only thing that decides anything, and
its output is a queued message rather than a warning on a screen.

⚠️ **It is still not `escalation.py` and must never import it.**

| | `escalation.py` | this |
|---|---|---|
| subject | one watched CAMERA | one FloodNet SENSOR |
| NWS alone | raises to WATCH | raises nothing — see below |
| output | dormant | a queued message |

**The witness sets are now identical** — `flood_detected`, `nws_active`, and
`tidal and harbor_above_flood`. `escalation._depth_is_credible` accepted a
fourth, the camera seeing water, and that went with the water-segmentation
layer. `scripts/check_watch.py` asserts the two functions agree over the full
matrix; if it fires, one of them changed and both docstrings are stale.

**NWS is a witness here and never a trigger, and that is deliberate.**
`escalation.level_for` raises to WATCH on `nws_active` because it is deciding
about one camera on one corner. This module is deciding about every sensor
anybody subscribed to, so the same rule would turn a single county-scale NWS
product into one email per subscription, city-wide, for weather that may be
nowhere near the reader. Same argument for the harbor. Both corroborate a depth
or they do nothing at all.

Two rules hold here exactly as they do in `escalation.py`: the level is
monotonic within an episode, and closing one takes
`settings.clear_readings_to_stand_down` consecutive clear readings rather than
a single one. Escalate fast, stand down slowly.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from . import floodnet
from .config import settings
from .models import Level, SensorReadingFacts

# When a subscribed instrument has been quiet long enough that saying nothing
# would itself be misleading.
#
# ⚠️ This is the same number as `SENSOR_STALE_AFTER_S` in
# `web/src/lib/staleness.ts`, and it must stay the same number: what a
# subscriber is told and what the page draws have to be one judgement about one
# instrument. The derivation is measurement and it lives in both places —
# FloodNet publication lag over the 390 deployments that answered one request:
# p50 1.0 min, p90 2.2, p99 22.5, max 48.1. One hour is 2.7x the p99 and clears
# the observed maximum with margin, so it fires when a sensor has actually
# stopped rather than when its telemetry is taking its time.
#
# Re-derive it from `poll probe`'s lag line if FloodNet's cadence changes. The
# failure is silent in both directions: too tight and every healthy sensor cries
# wolf, too loose and a dead one reads as current.
SENSOR_STALE_AFTER_S = 3600
SENSOR_STALE_AFTER = timedelta(seconds=SENSOR_STALE_AFTER_S)

# The fraction of the registry that must have gone quiet before a wave of
# silence is read as **our** outage rather than as N broken instruments.
#
# ⚠️ **This was the fan-out suppressor and it is now a truthfulness gate.** It
# was the only thing standing between one FloodNet outage and one email per
# subscription inside a single tick — measured at five subscribers watching ten
# instruments each, that is 50 messages from one tick. The silence notice stopped
# being an email on 2026-08-05, so the fan-out it bounded cannot happen any more.
#
# **Keep it anyway, because the other half of the argument never depended on the
# transport.** When most of the city has gone dark the instruments did not fail:
# we lost the feed. Telling a reader "the sensor at Ave C has stopped reporting"
# is then simply false, and it is false on a page exactly as it was in an inbox.
# So this now suppresses the per-instrument line on the manage face and the panel
# says the true thing instead — that Fluud has lost most of the registry.
#
# **The number has margin measured against the normal floor.** ~30 of 425
# deployments are legitimately quiet on any given tick (395 reporting, measured
# 2026-08-05), which is a **7%** resting silence. Half the city is seven times
# that, so this cannot fire on a bad afternoon — it fires when something
# structural has happened. Re-derive it from `poll probe`'s reporting count if
# FloodNet's fleet changes size.
#
# ⚠️ It suppresses the **silence line only**, never a water episode. A tick in
# which 60% of the city is dark and one sensor reports 200 mm must still warn
# about that sensor — the outage is a reason to distrust absence, not a reason
# to distrust a reading that actually arrived.
CITYWIDE_SILENCE = 0.5


def is_permitted(facts: SensorReadingFacts) -> bool:
    """Invariant 9, through the one authority that owns it.

    Never a status check written out here. `floodnet.alert_permitted` is the
    single implementation of "may this deployment raise an alarm", and a
    subscription is an alarm with a longer wire on it.
    """
    return floodnet.alert_permitted(facts.alert_visible, facts.status)


def is_credible(
    depth_mm: float | None,
    plausible: bool,
    flood_detected: bool,
    nws_active: bool,
    tidal: bool,
    harbor_above_flood: bool,
) -> bool:
    """Whether a depth may drive a notification on its own. Three witnesses.

    Bare positional facts rather than a record, so that nothing can be smuggled
    in: there is no parameter here a camera's judgement could arrive through,
    and that is the point. The three are `flood_detected`, `nws_active` and
    `tidal and harbor_above_flood`.

    ⚠️ **Identical to `escalation._depth_is_credible` now**, which took a fourth
    witness — the camera seeing water — until that layer was deleted.
    `check_watch.py` asserts the equality over the full matrix. The
    phantom-flood reasoning behind the gate is in
    `escalation._depth_is_credible` and in `floodnet.IMPLAUSIBLE_MM`;
    read it there.

    The tidal gate is copied verbatim in meaning: a Battery reading above minor
    flood stage corroborates a **tidal** sensor because that is one body of water
    arriving at two independent instruments. Under an inland stormwater sensor
    the same number corroborates nothing, and admitting it there would
    manufacture a witness out of an unrelated coincidence — worse than having no
    witness, because it looks like evidence.
    """
    if depth_mm is None:
        return False
    if plausible:
        return True
    return bool(flood_detected or nws_active or (tidal and harbor_above_flood))


def level_for_depth(depth_mm: float | None, credible: bool) -> Level:
    """Map one depth onto a level. **Depth only — nothing else raises here.**

    ⚠️ This must agree with `escalation.level_for` on the depth axis, and
    `scripts/check_watch.py` pins that across the band boundaries rather than
    trusting it. Same borrowed thresholds, same direction: `flood_event_mm` is
    FloodNet's own definition of a flood event and `curb_height_mm` is where
    water leaves the roadway for the sidewalk, which is the path to basement
    stairwells. If either changes it changes in `config.py` for both.

    There is no NWS term here. See the module docstring for why that omission
    is on purpose rather than an oversight.
    """
    if depth_mm is None or not credible:
        return Level.CLEAR
    if depth_mm >= settings.curb_height_mm:
        return Level.EMERGENCY
    if depth_mm >= settings.flood_event_mm:
        return Level.WARNING
    return Level.CLEAR


def sensor_level(facts: SensorReadingFacts) -> Level:
    """What this instrument alone says, before the camera path is consulted.

    CLEAR for a deployment FloodNet will not let us alarm from, whatever its
    depth says — the alert-permitted rule applied before anything else, because a
    subscription to a sensor they disabled is a promise we may not keep.
    """
    if not is_permitted(facts):
        return Level.CLEAR
    return level_for_depth(
        facts.depth_mm,
        is_credible(
            facts.depth_mm,
            facts.plausible,
            facts.flood_detected,
            facts.nws_active,
            facts.tidal,
            facts.harbor_above_flood,
        ),
    )


def effective_level(facts: SensorReadingFacts) -> Level:
    """The level a subscriber is told about.

    ⚠️ **`facts.camera_level` is always None now**, so this returns
    `sensor_level`. It carried the worst OPEN camera alert on this sensor, so
    the ~21 paired deployments would defer to the camera's episode rather than
    tell a second story about one body of water. The on-page alert system was
    unwired and there is nothing left to defer to.

    Kept, with the field, so re-wiring the camera path is one commit rather
    than a rebuild. The `max` is what makes that safe: a re-wire cannot turn
    into a downgrade, whatever the camera path decides.
    """
    own = sensor_level(facts)
    cam = facts.camera_level
    if cam is None:
        return own
    return cam if cam.rank >= own.rank else own


def transition(
    facts: SensorReadingFacts, current: dict | None
) -> tuple[str, Level, dict]:
    """Decide what happens to this sensor's watch episode.

    Returns (action, level, detail), the same five actions and the same shape as
    `escalation.transition` — deliberately, so that the two read as one idea
    applied twice rather than two designs:

      open      — nothing running and something should start
      escalate  — running episode moves up a level
      hold      — running episode continues unchanged
      close     — clear long enough to stand down
      none      — nothing running, nothing to start
    """
    proposed = effective_level(facts)

    if current is None:
        if proposed is Level.CLEAR:
            return "none", Level.CLEAR, {}
        return "open", proposed, {}

    running = Level(current["level"])

    if proposed.rank > running.rank:
        return "escalate", proposed, {
            "peak_depth_mm": _peak(current.get("peak_depth_mm"), facts.depth_mm),
        }

    if proposed is Level.CLEAR:
        streak = int(current.get("clear_streak", 0)) + 1
        if streak >= settings.clear_readings_to_stand_down:
            return "close", running, {"clear_streak": streak}
        return "hold", running, {"clear_streak": streak}

    # Elevated, but no higher than where we already are. Hold the line and do
    # NOT walk the level back down mid-episode — the monotonic rule.
    return "hold", running, {
        "peak_depth_mm": _peak(current.get("peak_depth_mm"), facts.depth_mm),
    }


def should_notify(action: str) -> bool:
    """Which transitions are worth somebody's inbox.

    `escalation.should_speak`'s rule, minus its level floor: a watch episode
    only opens above CLEAR in the first place, so there is nothing here to floor.
    A `hold` writes no message — an episode that is still running is not news,
    and a message a tick is how a subscription becomes something people filter.

    ⚠️ **`close` is NOT here, and its absence is a decision rather than an
    oversight.** The stand-down email was removed on 2026-08-05, on the owner's
    instruction. It was the most dangerous message this feature sent: whatever a
    stand-down says, the reader hears *it's over*, and it had to spend two
    paragraphs refusing the inference it had just invited. An episode closing is
    a fact about one instrument crossing back under one threshold, and the page
    already renders that as a reading. Mail is the wrong transport for it —
    there is no card beside it, and nothing in an inbox says how old it is.

    The episode still closes. `poll._watch_sensors` writes the transition to
    `sensor_episodes` exactly as before; what it no longer does is queue a
    message about it. **This function only ever decides who gets written to.**
    """
    return action in ("open", "escalate")


def citywide_silence(total: int, reporting: int) -> bool:
    """Is this wave of silence the instruments, or is it us?

    True when at least `CITYWIDE_SILENCE` of the registry has stopped reporting,
    in which case no per-instrument silence line may be drawn on a manage face.

    ⚠️ **`total <= 0` returns True, and the direction of that default is the
    decision.** It means the registry could not be read or the depth fetch died
    outright — we cannot measure coverage, so we cannot tell one dead instrument
    from a dead feed. Defaulting to "ours" costs a reader a line they were owed;
    defaulting the other way tells them every instrument they watch is broken on
    the strength of a query that failed. The first is a gap in a mitigation that
    LIMITATIONS §16 already says is incomplete. The second is this system
    asserting something about hundreds of instruments it did not hear from.
    """
    if total <= 0:
        return True
    return (1.0 - (reporting / total)) >= CITYWIDE_SILENCE


def is_silent(last_seen_at: datetime | None, now: datetime) -> bool:
    """Has this watched instrument stopped being able to tell anybody anything?

    ⚠️ **This is the mitigation for the one thing a subscription cannot honestly
    promise, and as of 2026-08-05 it is a note on the PAGE rather than an email.**
    A reader who hears nothing cannot tell "no water" from "the poller froze",
    "the mail bounced", or "your sensor stopped reporting" — the frozen-poller rule's
    failure mode wearing a new hat. This closes the last of those three and only
    the last. Nothing here can close the other two, and LIMITATIONS §16 says so
    rather than implying otherwise.

    **What changed and why the shape got simpler.** This used to be
    `silence_notice_due`, and it carried an `already_notified` argument because
    an email may be sent once per silence and never once per tick. A line on the
    manage face has no such problem: it is recomputed on every read, it says what
    is true at the moment somebody looks, and it disappears on its own when the
    instrument reports again. So the dedupe argument is gone, `outbox` no longer
    carries a `silence` kind, and there is no `db.silence_notified_since`.

    ⚠️ **The direction of the trade is worth stating plainly rather than
    implying.** A page cannot reach somebody who is not looking at it, and this
    is the one signal whose whole purpose was to arrive uninvited. What it buys
    is that the notice can no longer fan out — see `citywide_silence`, which is
    now a suppressor for a sentence rather than for fifty messages.

    `last_seen_at is None` is silent: a subscription to a deployment that has
    never reported here at all is the deepest version of the same silence, and
    the copy on the panel says "no reading" rather than "stopped reporting" so
    that it is true in both cases.
    """
    if last_seen_at is None:
        return True
    return (now - last_seen_at) >= SENSOR_STALE_AFTER


def _peak(existing: float | None, new: float | None) -> float | None:
    vals = [v for v in (existing, new) if v is not None]
    return max(vals) if vals else None
