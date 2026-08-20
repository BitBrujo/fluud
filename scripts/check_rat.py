#!/usr/bin/env python3
"""Assert the event-bus contract. No database, no network, no pytest.

    python3 scripts/check_rat.py

A sibling to the other four check scripts, on the same terms.

## What this defends

**Invariant 13 — a replayed warning older than five minutes is dropped, not
shown.** `/api/events` replays `rat.recent()` on **every** connect and
`EventSource` reconnects on its own, so a page opened an hour later would
otherwise re-perform a stale EMERGENCY at full urgency. That is the frozen-poller rule's
failure mode wearing a rat costume: stale information presented as current.

`web/src/lib/warning-feed.ts` has its own guards against re-delivery and those
are checked in `web/tests/warning-feed.test.ts`. **These are not the same
check.** The browser's guards stop a *duplicate* being applied twice; this one
stops an *old* event being handed out at all. Both have to hold, and the server
one has to hold for anything that reads the API rather than the page.

## ⚠️ Not pure, and handled rather than worked around

`rat.py` owns a module-level buffer and reads the clock, so this script cannot
be the pure-function exercise the other four are. It resets `_recent` between
sections and builds events with explicit timestamps, which is enough to make
every assertion deterministic. What it deliberately does **not** do is start a
loop, open a socket, or subscribe a real `asyncio.Queue` — the delivery path is
threading behaviour and belongs in a live check, not here.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from waterline import rat  # noqa: E402
from waterline.models import Level, Observation  # noqa: E402

logging.disable(logging.CRITICAL)

NOW = datetime.now(timezone.utc)

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


def reset() -> None:
    """Empty the replay buffer. The module holds it at import scope."""
    with rat._lock:
        del rat._recent[:]


def at(seconds_ago: float) -> str:
    return (NOW - timedelta(seconds=seconds_ago)).isoformat()


def event(seconds_ago: float, text: str = "water on the street") -> dict:
    return {
        "type": "speak", "text": text, "level": "warning", "lang": "en",
        "place": "Ave C @ 23 St", "mood": "worried", "depth_mm": 40.0,
        "drill": False, "at": at(seconds_ago),
    }


# --- the stale-replay rule: the replay buffer is age-bounded ------------------------
reset()
rat.emit(event(10, "fresh"))
rat.emit(event(rat.REPLAY_MAX_AGE_S - 5, "just inside"))
rat.emit(event(rat.REPLAY_MAX_AGE_S + 5, "just outside"))
rat.emit(event(3600, "an hour old"))

replayed = [e["text"] for e in rat.recent()]
check("a fresh warning is replayed", "fresh" in replayed, True)
check("and one just inside the window is too", "just inside" in replayed, True)
# ⚠️ The load-bearing pair. There is no useful middle ground between "this is
# happening" and silence, so an old event is dropped rather than spoken quietly.
check("one just outside the window is DROPPED", "just outside" in replayed, False)
check("and an hour-old EMERGENCY is never re-performed",
      "an hour old" in replayed, False)

check("the bound is five minutes", rat.REPLAY_MAX_AGE_S, 300)
# Comfortably longer than the 60s poll cadence, so a genuinely active alert is
# still restated to a late arrival. Tighter and a real warning goes missing.
check("which is several poll ticks, not one", rat.REPLAY_MAX_AGE_S >= 4 * 60, True)

# --- everything replayed is MARKED as replayed -----------------------------
# The chips beside the words are the only thing naming that state now — the
# dashed panel border that carried it across a room went with the rat monitor.
reset()
rat.emit(event(10))
out = rat.recent()
check("every replayed event carries `replay`",
      [e.get("replay") for e in out], [True])
# ⚠️ And the buffered original is NOT mutated: `recent()` copies. A caller that
# stamped the flag in place would make the live frame and the replay disagree
# about whether a warning is happening now.
with rat._lock:
    buffered = list(rat._recent)
check("but the buffered original is not stamped",
      any("replay" in e for e in buffered), False)

# --- a malformed timestamp is skipped, never crashed on -------------------
# `recent()` runs on every SSE connect. An exception here takes down the replay
# for every browser, and the failure would arrive during the storm that filled
# the buffer.
reset()
rat.emit({**event(10), "at": "not a timestamp"})
rat.emit({k: v for k, v in event(10).items() if k != "at"})
rat.emit(event(10, "good"))
check("a bad timestamp is skipped rather than raising",
      [e["text"] for e in rat.recent()], ["good"])

# --- the buffer is bounded ------------------------------------------------
reset()
for i in range(rat.MAX_RECENT * 3):
    rat.emit(event(10, f"e{i}"))
with rat._lock:
    size = len(rat._recent)
check("the replay buffer is capped", size, rat.MAX_RECENT)
check("and it keeps the NEWEST events",
      [e["text"] for e in rat._recent][-1], f"e{rat.MAX_RECENT * 3 - 1}")

# --- `drill` is set INSIDE speak(), never stamped afterwards ---------------
# ⚠️ `emit()` hands the exact object to every subscriber and the SSE coroutine
# serialises it whenever its loop next runs, so a caller mutating the dict after
# `emit()` is racing the wire — the buffered copy wins that race and the live
# frame usually loses it. That is the worst possible shape for a flag whose whole
# job is saying "this warning is not real."
obs = Observation(camera_id="c", observed_at=NOW, depth_mm=40.0)

for drill in (True, False):
    reset()
    returned = rat.speak("water on the street", Level.WARNING, obs,
                         "Ave C @ 23 St", drill=drill)
    with rat._lock:
        buffered = list(rat._recent)
    # ⚠️ **`.get` with a sentinel, never `[...]`.** The mutation this pair exists
    # to catch — stamping `drill` on after `emit()` — removes the key from the
    # buffered dict, so a subscript raises `KeyError` and takes the script down
    # before either named assertion prints. That is the "any assertion downstream
    # of a crash is decorative" lesson `check_escalation.py` records, reproduced
    # here while testing this file by breaking the thing it checks.
    check(f"speak(drill={drill}) returns the flag",
          returned.get("drill", "<missing>"), drill)
    check(f"and the BUFFERED copy already carries it (drill={drill})",
          buffered[0].get("drill", "<missing>"), drill)
    # The returned object IS the buffered object — which is exactly why stamping
    # it afterwards is a race rather than merely untidy.
    check(f"they are the same object (drill={drill})",
          returned is buffered[0], True)

# ⚠️ An unlabelled event is treated as a REAL warning by the browser, so the
# absence of this key is the unsafe direction. It must always be present.
reset()
plain = rat.speak("x", Level.WATCH, obs, "p")
check("`drill` is always present, never omitted", "drill" in plain, True)
check("and defaults to False", plain["drill"], False)

# --- the warning text is passed through verbatim --------------------------
# The presenter renders it and never rewrites it. Invariant 6 at the last hop
# before the wire.
TEXT = "Hey. Rat here. Water's climbing the pipes under Ave C @ 23 St."
reset()
check("speak() passes the templated text through unedited",
      rat.speak(TEXT, Level.WATCH, obs, "Ave C @ 23 St")["text"], TEXT)

# --- mood is decided beside the level, in one place ------------------------
check("every level has a mood",
      sorted(rat.mood_for(l) for l in Level),
      sorted(["idle", "alert", "worried", "panic"]))
check("and clear is the idle one", rat.mood_for(Level.CLEAR), "idle")
check("and emergency is not", rat.mood_for(Level.EMERGENCY), "panic")

for level in Level:
    reset()
    ev = rat.set_mood(level)
    check(f"set_mood({level.value}) agrees with mood_for",
          ev["mood"], rat.mood_for(level))
    check(f"and carries the level itself ({level.value})", ev["level"], level.value)

# --- the two transports must agree about the timestamp format --------------
# ⚠️ `at` goes out over HTTP through pydantic AND over SSE as raw `json.dumps`.
# `models.SpeakEvent.at` is typed `str` precisely so pydantic cannot re-serialise
# it to `…Z` on one path while this emits `…+00:00` on the other —
# `warning-feed.ts` dedupes on that exact string across both.
reset()
ev = rat.speak("x", Level.WATCH, obs, "p")
check("`at` is a string on the wire", isinstance(ev["at"], str), True)
check("in isoformat with an explicit offset", ev["at"].endswith("+00:00"), True)

# --- sse() frames are well-formed -----------------------------------------
frame = rat.sse({"type": "mood", "level": "clear"})
check("an SSE frame opens with `data: `", frame.startswith("data: "), True)
check("and terminates with a blank line", frame.endswith("\n\n"), True)
check("and contains no bare newline that would split the frame",
      frame[:-2].count("\n"), 0)

# --- emit() never raises ---------------------------------------------------
# A browser that has gone away must not stop the alerting path: the presenter is
# downstream of the decision, and a dead subscriber is a delivery problem rather
# than a reason to stop deciding.
reset()


class _DeadLoop:
    def is_closed(self):
        raise RuntimeError("this loop is gone")


with rat._lock:
    rat._subscribers[object()] = _DeadLoop()  # type: ignore[index]
try:
    rat.emit(event(1))
    got = "survived"
except Exception as e:  # noqa: BLE001
    got = f"raised {type(e).__name__}"
check("a broken subscriber cannot stop the alerting path", got, "survived")
check("and is dropped from the subscriber table", len(rat._subscribers), 0)

reset()

if failures:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

print("rat contract OK")
