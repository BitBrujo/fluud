"""The depth peak over a time window: the presets, the bounds, and the rules.

PURE. No database, no network, no I/O — on `escalation.py`'s and `watch.py`'s
terms, and for one additional reason: `scripts/parity_constants.py` imports this
module, and that script runs from a test process with no `.env` and no Postgres.

## Why the aggregate is a PEAK and may never become a mean

The detail panel's depth is *the one big number on the page*. Offering a window
over it means choosing what a window's worth of millimetres reduces to, and only
one choice is safe here.

A **mean** over 24 hours across a two-hour flood renders that flood as a small
number. That is the never-safe rule arriving through arithmetic — the page reporting a
calm figure about a street that went under — and it would do it in the largest
type on the surface. A **median** is worse for the same reason and hides it
better.

The **peak** cannot fail in that direction. The worst it can do is describe a
moment that has passed, which is why `peak_at` rides beside it and the UI prints
how long ago it was. An old peak reads as history; a low mean reads as safety.

⚠️ **If a second aggregate is ever wanted, it goes BESIDE the peak and never
instead of it.**

## Why the peak is taken over PLAUSIBLE readings only

`escalation._depth_is_credible` has always gated *alerting* on plausibility, and
a faulted rangefinder's `1451 mm` sitting in a window would become the peak of
that window — promoted from a number the list already marks `FAULT` into the
26px figure, wearing none of the marks that say what it is. So both queries in
`db.py` filter on the plausibility column, and the count they return beside the
peak is a count of plausible readings.

This is the display half of the second-witness rule, applied to an aggregate. The faulted
digits still render everywhere they already did; what they may not do is win a
maximum.

⚠️ **Absence of a peak is not zero.** A window containing no plausible reading
answers `None`, and the UI renders an em-dash and says the window was empty —
never `0 mm`, which claims a dry street. Same rule as `_first_num` returning
`None` rather than `0`, one layer up.
"""

# --- the retention bound ----------------------------------------------------
# `sensor_readings` is the only table in this app whose growth is driven by a
# number we do not control (~560k rows/day), and `db.prune_sensor_readings`
# drops anything past this. It is THE ceiling on what a window may ask for:
# beyond it a query returns a peak over whatever survived the prune, which is a
# smaller number wearing a longer window's label — the one way this feature can
# understate a flood.
#
# ⚠️ `db.prune_sensor_readings` takes its default from here rather than typing
# `7` a second time. A retention change and a window ceiling change are the same
# change, and they must not be two edits.
#
# ⚠️ **`observations` is pruned to this too, since 2026-08-20.** It used to be
# unbounded, which meant the camera side *could* answer wider windows and was
# held to this ceiling anyway: a control that offered `last month` on a camera
# and refused it on a sensor would make the two faces of one panel disagree
# about what this app can be asked, and the reader has no way to know which kind
# they are looking at is the constrained one. That argument is unchanged — what
# changed is that the storage now matches the promise instead of quietly
# exceeding it. `db.prune_observations` takes its default from here for
# `prune_sensor_readings`' reason: one retention change, one edit, both tables.
RETENTION_DAYS = 7

MIN_WINDOW_MIN = 1
MAX_WINDOW_MIN = RETENTION_DAYS * 24 * 60

# --- the presets ------------------------------------------------------------
# The four standard windows, in minutes. Duplicated in
# `web/src/lib/depth-window.ts` and asserted equal by `web/tests/parity.test.ts`
# — the same treatment every other cross-language number in this repo gets, and
# for the same reason: nothing else could see one half move.
#
# These are not thresholds and nothing is borrowed. They gate no alert, no
# escalation and no notification, so moving one cannot change a single warning —
# the same argument `selected-detail.tsx`'s `CONFIDENT_AT` makes for being a
# display band rather than a threshold. They are round numbers a person asks a
# question in.
PRESET_MINUTES = (10, 30, 60, 1440)


def clamp_minutes(minutes: int) -> int:
    """Bring a requested window inside what the data can answer for.

    Clamps rather than rejects, deliberately. The alternative — a 400 on an
    out-of-range window — puts an error banner on the page over a request the
    reader made with a number spinner, and the honest answer to *"show me the
    last year"* is the seven days that exist rather than a refusal.

    ⚠️ **The UI must say when it clamped**, or a reader gets a seven-day peak
    labelled as a year. The clamped value is echoed back in the response so the
    client renders the window it actually got rather than the one it asked for.
    """
    return max(MIN_WINDOW_MIN, min(MAX_WINDOW_MIN, int(minutes)))
