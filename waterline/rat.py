"""The rat — presenter layer. ⚠️ **DORMANT — nothing calls this.**

The on-page warning was unmounted and the routes that fed it are gone:
`/api/events`, `/api/speak` and `/api/rat/drill` were all deleted, so nothing
emits and nothing subscribes. The file is kept, and `check_rat.py` keeps
running against it, so putting the warning back on the page is a re-wire rather
than a rebuild. The live path to a person is `mail.py`, off `watch.py`.

WHY A RAT IS NOT A JOKE
-----------------------
NYC's sewers are a combined system: storm water and sanitary waste share the
same pipes. When rain exceeds roughly 1.75 in/hr the pipes fill, and rats leave
— up through catch basins and drains, onto the street, ahead of the water.

So the rat is not a mascot bolted onto a flood tool. It is the *sewer's own
early-warning system*, and it has standing to tell you the pipes are filling
before the street shows it. That is the character's authority and it is
literally true.

THE HARD RULE: THE RAT STOPS JOKING WHEN IT IS SERIOUS
------------------------------------------------------
Character shrinks as the water rises. At WATCH the rat has a voice. At
EMERGENCY it is plain, short and direct, because someone below street level may
be reading this and comedy costs them time.

This is not tone policing. It is two safety rules surviving contact with a
talking rodent: the copy stays templated, and it never tells anyone they are
safe. See `agent.py`.

NOT THE RAT CZAR
----------------
NYC has a real Director of Rodent Mitigation, held by a real person. This rat is
an anonymous sewer rat and must never claim to be, speak for, or be styled as
that office or any city official. It is a character, not an authority.

ARCHITECTURE
------------
The server decides *what to say and when*. The browser renders it as text.

    poll loop ──▶ escalation ──▶ rat.speak() ──▶ SSE /api/events ──▶ web/

There is no synthesized speech. The warning is written, in the warning panel,
verbatim — which works on a muted projector, works for deaf and hard-of-hearing
users, and works for a judge on their phone.

The page does show the rat, as one of four still images baked offline and picked
by level, but that happens entirely in the browser and none of it is served from
here. This module emits words and only words; it was always the bus and the
persona, never the mouth. The stills are `aria-hidden`, so those words remain
the only channel a warning travels on.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from datetime import datetime, timezone

from .models import Level, Observation

log = logging.getLogger(__name__)


# --- the event bus ---------------------------------------------------------
# Alerts are fanned out to every connected browser over SSE. In-memory and
# per-instance, which is correct here: max-instances is 1, and an alert nobody
# is listening to is still recorded in the database.
#
# THREADING: emit() is called from the poll loop, which runs on a daemon thread
# when POLL_IN_SERVICE is set. asyncio.Queue is NOT thread-safe, so every put
# has to be marshalled back onto the loop that owns the queue via
# call_soon_threadsafe. Calling put_nowait directly from the poll thread
# appears to work and then drops events under load. Each subscriber therefore
# carries the loop it was created on.
_subscribers: dict[asyncio.Queue, asyncio.AbstractEventLoop] = {}
_lock = threading.Lock()
_recent: list[dict] = []
MAX_RECENT = 20


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=32)
    loop = asyncio.get_running_loop()
    with _lock:
        _subscribers[q] = loop
        n = len(_subscribers)
    log.info("rat: presenter connected (%d total)", n)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    with _lock:
        _subscribers.pop(q, None)
        n = len(_subscribers)
    log.info("rat: presenter disconnected (%d left)", n)


# A replayed warning older than this is history, not news.
#
# Found by testing: without an age bound, a browser opening the page replays
# whatever is in the buffer and the rat shouts a stale EMERGENCY at full
# urgency — an hour after the water went down. That is the frozen-poller rule's failure
# mode wearing a different hat: stale information presented as current.
#
# Five minutes is comfortably longer than the 60s storm cadence, so a genuinely
# active alert is still restated to a late arrival, while an old one is simply
# dropped rather than re-performed.
#
# ⚠️ **It did NOT move when the poll cadence did, and the reason is worth
# keeping.** On 2026-08-20 `staleness.STALE_AFTER_S` went from 300 to 1200 to
# clear the new fifteen-minute quiet window, and `parity.test.ts` had asserted
# the two were EQUAL. The equality was the wrong shape for what it was
# protecting: the failure it names is a replayed warning arriving on a page that
# still calls its own readings fresh, and that needs this bound to be **no
# looser** than the page's — not identical to it. At 300 against 1200 a replayed
# warning is always fresher than the freshness bound, which is the safe side.
#
# So the assertion became `<=` and this number stayed where invariant 13 put it.
# ⚠️ Raising it above `STALE_AFTER_S` is the change that would break the rule;
# lowering it only ever makes the replay quieter.
REPLAY_MAX_AGE_S = 300


def recent() -> list[dict]:
    """Replay buffer for a page that connects mid-storm.

    Age-bounded on purpose. Anything older is dropped, not spoken quietly —
    there is no useful middle ground between "this is happening" and silence.
    """
    now = datetime.now(timezone.utc)
    out = []
    with _lock:
        buffered = list(_recent)

    for ev in buffered:
        try:
            age = (now - datetime.fromisoformat(ev["at"])).total_seconds()
        except (KeyError, ValueError):
            continue
        if age <= REPLAY_MAX_AGE_S:
            out.append({**ev, "replay": True})
    return out


def emit(event: dict) -> None:
    """Publish to every connected rat.

    Never raises. A browser that has gone away must not stop the alerting path:
    the presenter is downstream of the decision, and a dead subscriber is a
    delivery problem, not a reason to stop deciding.
    """
    with _lock:
        _recent.append(event)
        del _recent[:-MAX_RECENT]
        targets = list(_subscribers.items())

    dead = []
    for q, loop in targets:
        try:
            if loop.is_closed():
                dead.append(q)
                continue
            loop.call_soon_threadsafe(_offer, q, event)
        except RuntimeError:
            dead.append(q)
        except Exception as e:  # noqa: BLE001
            log.warning("rat: subscriber error: %s", e)
            dead.append(q)

    if dead:
        with _lock:
            for q in dead:
                _subscribers.pop(q, None)


def _offer(q: asyncio.Queue, event: dict) -> None:
    """Runs on the subscriber's own loop. Drops the oldest event rather than
    the newest if a browser has stalled — in a flood tool the most recent
    reading is the one that matters."""
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        try:
            q.get_nowait()
            q.put_nowait(event)
        except Exception:  # noqa: BLE001
            pass


# --- what the rat is told to do -------------------------------------------
def speak(text: str, level: Level, obs: Observation, place: str,
          lang: str = "en", drill: bool = False) -> dict:
    """Build a speak event. `text` is the templated warning from agent.py and
    is passed through verbatim — the presenter renders it, never rewrites it.

    `drill` must be set *here*, not stamped onto the returned dict afterwards.
    emit() hands this exact object to every subscriber, and the SSE coroutine
    serialises it whenever its own loop next runs — so a caller that mutates
    the dict after emit() is racing the wire. The buffered copy in `_recent`
    reliably wins that race and the live frame usually loses it, which is the
    worst possible shape for a flag whose whole job is saying "this warning is
    not real."
    """
    event = {
        "type": "speak",
        "text": text,
        "level": level.value,
        "lang": lang,
        "place": place,
        "mood": mood_for(level),
        "depth_mm": obs.depth_mm,
        "drill": drill,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    emit(event)
    log.info("rat [%s/%s]: %s", level.value, event["mood"], text[:70])
    return event


def set_mood(level: Level) -> dict:
    event = {
        "type": "mood",
        "level": level.value,
        "mood": mood_for(level),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    emit(event)
    return event


def mood_for(level: Level) -> str:
    """Maps alert level to a presentation mood.

    Kept alongside `level` rather than derived in the browser: the level is the
    safety-critical fact and the mood is how it is presented, and this is the
    one place both are decided together.
    """
    return {
        Level.CLEAR: "idle",
        Level.WATCH: "alert",
        Level.WARNING: "worried",
        Level.EMERGENCY: "panic",
    }[level]


def sse(event: dict) -> str:
    """Format one event for text/event-stream."""
    return f"data: {json.dumps(event)}\n\n"
