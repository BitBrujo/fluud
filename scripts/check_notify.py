#!/usr/bin/env python3
"""Assert the notification-preference contract. No database, no network, no pytest.

    python3 scripts/check_notify.py

A sibling to `check_watch.py`, on the same terms: `notify.py` is pure precisely
so this file can exist, and `check_escalation.py` / `check_watch.py` stay the
controls proving the two state machines were not touched. Preferences sit
DOWNSTREAM of both machines, and the whole contract is one sentence:

    **A preference may subtract messages. It may never add one, and it may
    never subtract an EMERGENCY.**

The grid assertions below are that sentence three ways — EMERGENCY invariance
over every combination, monotonicity in every direction a preference can move,
and the defaults reproducing the pre-preference behaviour byte for byte. The
rest pins the quiet-hour window's shape, which is the one piece of arithmetic
here subtle enough to get wrong silently (the midnight wrap).
"""

import sys
from itertools import product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from waterline import notify  # noqa: E402
from waterline.models import Level  # noqa: E402

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


LEVELS = [Level.WATCH, Level.WARNING, Level.EMERGENCY]
MINS = [Level(m) for m in notify.MIN_LEVELS]
BOOLS = [False, True]

# --- EMERGENCY invariance over the whole grid --------------------------------
# The one rule that may never gain an exception. Every preference combination,
# both quiet states, told and not told: EMERGENCY always passes.
for min_l, freq, quiet, told in product(MINS, notify.FREQUENCIES, BOOLS, BOOLS):
    check(
        f"emergency passes min={min_l.value} freq={freq} quiet={quiet} told={told}",
        notify.allowed(Level.EMERGENCY, min_l, freq, quiet, told),
        True,
    )

# --- defaults are the pre-preference behaviour --------------------------------
# A subscriber who never touched the wizard gets exactly what shipped before it
# existed: every open and every escalation, at every level, at every hour.
for level, told in product(LEVELS, BOOLS):
    check(
        f"defaults pass level={level.value} told={told}",
        notify.allowed(level, Level(notify.DEFAULT_MIN_LEVEL),
                       notify.DEFAULT_FREQUENCY, False, told),
        True,
    )

# --- monotonicity: a stricter preference only ever removes --------------------
# Raising the minimum level, switching every -> first, entering quiet hours,
# having already been told: each may flip True -> False and never the reverse.
GRID = list(product(LEVELS, MINS, notify.FREQUENCIES, BOOLS, BOOLS))
for level, min_l, freq, quiet, told in GRID:
    base = notify.allowed(level, min_l, freq, quiet, told)
    for stricter in MINS:
        if stricter.rank > min_l.rank:
            if notify.allowed(level, stricter, freq, quiet, told) and not base:
                failures.append(
                    f"raising min_level ADDED a message at level={level.value}"
                )
    if freq == "every":
        if notify.allowed(level, min_l, "first", quiet, told) and not base:
            failures.append(f"first ADDED a message at level={level.value}")
    if not quiet:
        if notify.allowed(level, min_l, freq, True, told) and not base:
            failures.append(f"quiet hours ADDED a message at level={level.value}")
    if not told:
        if notify.allowed(level, min_l, freq, quiet, True) and not base:
            failures.append(f"already_told ADDED a message at level={level.value}")

# --- the specific behaviours the wizard promises ------------------------------
# trigger: warning minimum drops a watch and keeps a warning.
check("min=warning drops watch",
      notify.allowed(Level.WATCH, Level.WARNING, "every", False, False), False)
check("min=warning keeps warning",
      notify.allowed(Level.WARNING, Level.WARNING, "every", False, False), True)
# frequency: `first` keeps the first message and drops the repeat below
# EMERGENCY. An escalation that has not been preceded by any message (the
# episode opened below the reader's trigger) still gets through — `first`
# means one message per episode, not "the open action or nothing".
check("first keeps the untold escalation",
      notify.allowed(Level.WARNING, Level.WATCH, "first", False, False), True)
check("first drops the told escalation",
      notify.allowed(Level.WARNING, Level.WATCH, "first", False, True), False)
# timeline: quiet hours drop watch and warning; the emergency case is the grid
# above.
check("quiet drops warning",
      notify.allowed(Level.WARNING, Level.WATCH, "every", True, False), False)

# --- the quiet window's shape --------------------------------------------------
# Half-open [start, end): the end hour itself sends.
check("window [9,17) holds 9", notify.in_quiet_hours(9, 9, 17), True)
check("window [9,17) holds 16", notify.in_quiet_hours(16, 9, 17), True)
check("window [9,17) frees 17", notify.in_quiet_hours(17, 9, 17), False)
check("window [9,17) frees 8", notify.in_quiet_hours(8, 9, 17), False)
# The midnight wrap — 22 to 7 is the window everybody actually sets.
check("window [22,7) holds 23", notify.in_quiet_hours(23, 22, 7), True)
check("window [22,7) holds 0", notify.in_quiet_hours(0, 22, 7), True)
check("window [22,7) holds 6", notify.in_quiet_hours(6, 22, 7), True)
check("window [22,7) frees 7", notify.in_quiet_hours(7, 22, 7), False)
check("window [22,7) frees 12", notify.in_quiet_hours(12, 22, 7), False)
# No window, half a window, and the refused equal pair all send.
check("no window sends", notify.in_quiet_hours(3, None, None), False)
check("half a window sends", notify.in_quiet_hours(3, 22, None), False)
check("equal pair sends", notify.in_quiet_hours(3, 3, 3), False)
# Every hour is inside a wrapped window exactly when it is outside the
# complementary straight one — the wrap is the complement, not a special case.
for hour in range(24):
    check(
        f"wrap complement at {hour}",
        notify.in_quiet_hours(hour, 22, 7),
        not notify.in_quiet_hours(hour, 7, 22),
    )

# --- effective(): override beats global beats default --------------------------
check("override wins", notify.effective("watch", "every", "emergency", "first"),
      (Level.EMERGENCY, "first"))
check("global wins over default", notify.effective("warning", "first"),
      (Level.WARNING, "first"))
check("nulls fall to defaults", notify.effective(None, None),
      (Level.WATCH, "every"))
# An unknown stored value fails OPEN — more messages, never a silently muted
# watch. `clear` is not a minimum level anybody may hold.
check("junk min_level fails open", notify.effective("clear", None),
      (Level.WATCH, "every"))
check("junk frequency fails open", notify.effective(None, "daily"),
      (Level.WATCH, "every"))
check("junk override falls to global", notify.effective("warning", None, "loud"),
      (Level.WARNING, "every"))

if failures:
    print(f"notify contract FAILED — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

print("notify contract OK")
