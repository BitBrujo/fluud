"""Notification preferences — who has asked to hear less, and when that holds.

PURE, on `watch.py`'s terms and for `watch.py`'s reason: this module sits
between a real transition and somebody's inbox, so every rule in it has to be
checkable with plain asserts, no database and no clock. The caller passes the
hour in. `scripts/check_notify.py` is the contract.

**What a preference may do: subtract. What it may never do: add.** Nothing here
can cause a message that `watch.should_notify` (or the camera path's
open/escalate) did not already decide to send. Every function below is a filter
over that decision, which is why the checker can assert monotonicity — a
stricter preference only ever removes messages — instead of arguing it.

⚠️ **EMERGENCY is exempt from every preference, and that is the safety rule
this module exists to hold.** A reader can ask for fewer messages; they cannot
ask this system to sit on "water above the curb" until morning. `allowed`
returns True for EMERGENCY whatever the minimum level, the frequency or the
quiet hours say, and the checker asserts it over the whole grid. The UI states
it beside the controls rather than hiding it in behaviour.

⚠️ **Quiet hours SUPPRESS, they never DELAY.** A held warning is the stale-replay rule's
failure arriving by appointment: a flood that happened at 2am presented as
current at 7am. `mail.MAX_AGE_S` would expire a delayed row anyway, so delivery
"after the window" is not an option the transport even offers. A message
suppressed by quiet hours is never queued and never sent, and the reader chose
that when they set the window — for everything below EMERGENCY.

The three settings, in the wizard's words:

- **trigger** (`min_level`) — the lowest level worth a message. watch (the
  default: everything) · warning · emergency.
- **frequency** — `every`: the open and each escalation. `first`: one message
  per episode, then silence until it closes (EMERGENCY still breaks through).
- **timeline** (`quiet_start` / `quiet_end`) — hours of the day, America/New_York,
  during which watch- and warning-level messages are not sent. Half-open
  [start, end), wrapping midnight when start > end.

A subscriber holds one global set; each subscription may override `min_level`
and `frequency` for its own instrument. Quiet hours are global only — they are
a fact about the reader's day, not about an instrument.
"""

from __future__ import annotations

from .models import Level

# The stored vocabulary. `api.py` refuses anything else at the door with a 400,
# so a typo is a legible error rather than a preference that silently means
# "every" — a filter that fails open is quieter than one that fails closed, but
# a stored value nothing validates is how a reader comes to hold a setting no
# code enforces.
MIN_LEVELS = ("watch", "warning", "emergency")
FREQUENCIES = ("every", "first")

DEFAULT_MIN_LEVEL = "watch"
DEFAULT_FREQUENCY = "every"


def effective(
    global_min_level: str | None,
    global_frequency: str | None,
    override_min_level: str | None = None,
    override_frequency: str | None = None,
) -> tuple[Level, str]:
    """(min level, frequency) for one subscription: override, else global, else default.

    Nulls fall through rather than raising, because these arrive from database
    columns that predate the feature — a subscriber created before the columns
    existed behaves exactly as they did before it shipped. An unknown *stored*
    value falls through one layer at a time — a junk override leaves the
    subscriber's own global in force rather than skipping past it — and the
    floor is the default, which is the loudest setting: a corrupted preference
    means more messages, never a silently muted watch.
    """

    def pick(values: tuple[str, ...], *candidates: str | None, fallback: str) -> str:
        for v in candidates:
            if v in values:
                return v  # type: ignore[return-value]
        return fallback

    min_level = pick(MIN_LEVELS, override_min_level, global_min_level,
                     fallback=DEFAULT_MIN_LEVEL)
    frequency = pick(FREQUENCIES, override_frequency, global_frequency,
                     fallback=DEFAULT_FREQUENCY)
    return Level(min_level), frequency


def in_quiet_hours(hour: int, start: int | None, end: int | None) -> bool:
    """Is this hour inside the reader's quiet window? Half-open [start, end).

    `start > end` wraps midnight — 22 to 7 means 22:00 through 06:59, which is
    the window everybody actually wants. `start == end` is refused at the API
    (it would read as either "never" or "always" depending on who is guessing),
    and defensively means no window here, in the direction that sends.

    The hour is the caller's problem on purpose: this module has no clock and
    no timezone, so the one conversion (UTC → America/New_York) happens once,
    in `poll`, where it can be seen.
    """
    if start is None or end is None or start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def allowed(
    level: Level,
    min_level: Level,
    frequency: str,
    quiet: bool,
    already_told: bool,
) -> bool:
    """May this transition write to this subscriber? The one gate, four rules.

    Runs AFTER `watch.should_notify` (or the camera path's own open/escalate),
    never instead of it — a preference filters real news, it does not define
    news. `already_told` is "a message about this episode already reached the
    outbox for this subscriber", which is what `frequency = first` means; the
    caller only needs to look it up for an escalation, since an open has no
    prior message to have sent.

    ⚠️ **Rule one is EMERGENCY passes everything, and it is first so that
    nothing added below it can come first.** The other three subtract:
    below the minimum level, already told under `first`, or inside quiet
    hours — each returns False and none can return True on its own.
    """
    if level is Level.EMERGENCY:
        return True
    if level.rank < min_level.rank:
        return False
    if frequency == "first" and already_told:
        return False
    if quiet:
        return False
    return True
