"""The camera alert state machine. ⚠️ **DORMANT — nothing calls this.**

The on-page alert system was unwired: there is no `alerts` table, no
`/api/events`, no `/api/speak` and no caller for anything below. The file is
kept, and `check_escalation.py` keeps running against it, so putting the
warning back on the page is a re-wire rather than a rebuild.

**The live state machine is `watch.py`**, over `sensor_episodes`, and it is
what mails a subscriber. Never import this from there.

One rule governs this file, and it is a safety rule rather than a design
preference: **the system escalates fast and stands down slowly.**

A false positive here is an inconvenience. A false negative is how people
drowned in basement apartments during Ida. So within an alert episode the level
is monotonic — it never drops — and closing an episode requires a sustained run
of clear readings rather than a single one. The system is also never permitted
to tell anyone they are safe; see `agent.py` for the copy rules.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from .config import settings
from .models import Level, Observation

log = logging.getLogger(__name__)


def level_for(obs: Observation) -> Level:
    """Map one observation onto an alert level.

    Depth is the only evidence that can raise past WATCH, and it is FloodNet's
    — calibrated to within an inch. A camera contributes nothing here.
    """
    level = Level.CLEAR

    if obs.depth_mm is not None and _depth_is_credible(obs):
        if obs.depth_mm >= settings.curb_height_mm:
            # Above curb height the water is off the roadway and onto the
            # sidewalk, which is the path to basement stairwells.
            level = Level.EMERGENCY
        elif obs.depth_mm >= settings.flood_event_mm:
            # FloodNet's own definition of a flood event.
            level = Level.WARNING

    if obs.nws_active:
        level = _max(level, Level.WATCH)

    return level


def transition(obs: Observation, current: dict | None) -> tuple[str, Level, dict]:
    """Decide what happens to this camera's alert episode.

    Returns (action, level, detail) where action is one of:
      open      — no episode was running and one should start
      escalate  — running episode moves up a level
      hold      — running episode continues unchanged
      close     — running episode has been clear long enough to stand down
      none      — nothing running, nothing to start
    """
    now = obs.observed_at or datetime.now(timezone.utc)
    proposed = level_for(obs)

    if current is None:
        if proposed is Level.CLEAR:
            return "none", Level.CLEAR, {}
        log.info("[%s] opening at %s", obs.camera_id, proposed.value)
        return "open", proposed, {"opened_at": now}

    running = Level(current["level"])

    if proposed.rank > running.rank:
        log.info(
            "[%s] escalating %s -> %s", obs.camera_id, running.value, proposed.value
        )
        return "escalate", proposed, {
            "peak_depth_mm": _peak(current.get("peak_depth_mm"), obs.depth_mm),
        }

    if proposed is Level.CLEAR:
        streak = int(current.get("clear_streak", 0)) + 1
        if streak >= settings.clear_readings_to_stand_down:
            log.info("[%s] standing down after %d clear", obs.camera_id, streak)
            return "close", running, {"closed_at": now}
        return "hold", running, {"clear_streak": streak}

    # Still elevated but not higher than where we already are. Hold the line;
    # deliberately do NOT walk the level back down mid-episode.
    return "hold", running, {
        "peak_depth_mm": _peak(current.get("peak_depth_mm"), obs.depth_mm),
    }


def should_speak(action: str, level: Level, already_spoken: bool) -> bool:
    """The warning is the alarm, so it is written when there is something to
    say — on open and on every escalation, never merely because time passed."""
    if action == "open":
        return level.rank >= Level.WATCH.rank
    if action == "escalate":
        return True
    return False


def _depth_is_credible(obs: Observation) -> bool:
    """Whether a depth reading is allowed to drive an alert on its own.

    Depth alone is not enough, and this is the hard lesson from the live data.
    On 2026-08-04, in dry weather with no NWS alert anywhere in the state, four
    FloodNet sensors reported between 666mm and 1452mm — up to 4.8 feet of
    standing water on a clear day. All four were faulted rangefinders, and
    FloodNet's own `flood_detected` flag was False on every one.

    A bare `depth >= 10mm` rule fires four EMERGENCY alerts in that situation.
    In a life-safety tool, crying wolf is not a cosmetic bug: it is how the
    next real warning gets ignored.

    So a large reading must be corroborated by something that is not the same
    rangefinder — FloodNet's own determination, an active NWS alert, or the
    harbor being above flood stage under a tidal sensor. Readings inside the
    plausibility band are allowed through on their own, because that is where
    the sensor is trustworthy and where the physical failure mode does not
    live.

    ⚠️ **Three witnesses, and this is now identical to `watch.is_credible`.**
    There was a fourth — a camera's ordinal class — and it went when the
    water-segmentation layer was deleted. The two functions are asserted equal
    by `check_watch.py`; if that assertion fires, one of them changed and these
    docstrings are stale.

    ⚠️ The tidal witness is the narrowest of the three and the gate on it is
    the whole point. A Battery reading corroborates a **tidal** sensor because
    that is one body of water reaching two independent instruments; under an
    inland stormwater sensor the same number corroborates nothing, and
    admitting it there would manufacture a second witness out of an unrelated
    coincidence — worse than having no witness, because it looks like evidence.
    All four of the 2026-08-04 phantom sensors would still be rejected on a day
    when the harbor was high, because none of them is tidal.
    """
    if obs.depth_mm is None:
        return False

    # Below the plausibility ceiling, trust the sensor.
    if obs.depth_plausible:
        return True

    # Above it, demand a second, independent witness.
    return (
        obs.flood_detected
        or obs.nws_active
        or (obs.tidal and obs.harbor_above_flood)
    )


def _max(a: Level, b: Level) -> Level:
    return a if a.rank >= b.rank else b


def _peak(existing: float | None, new: float | None) -> float | None:
    vals = [v for v in (existing, new) if v is not None]
    return max(vals) if vals else None
