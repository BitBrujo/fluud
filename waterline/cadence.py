"""How often this app polls. Two integers, and nothing else in this file.

⚠️ **They live here rather than in `poll.py` so they can be read WITHOUT the
ingest tree.** `scripts/parity_constants.py` needs them — every staleness
threshold in `web/src/lib/staleness.ts` is a multiple of one of them, and that
script is the only thing that can hold the two languages in step. It runs under
a bare `python3` with no `.env` and no Postgres, and importing `poll` to reach
these pulls `auth` → `fastapi` and `db` → `psycopg`, neither of which is
installed there.

That is not hypothetical: it happened on 2026-08-20, and the way it presented is
the reason this module exists. The parity suite does not fail when its Python
half cannot run — it **skips**, deliberately, so a fresh clone with no
dependencies still passes. So adding the import turned every cross-language
assertion in the repo off, quietly, in the same commit that made one of them
load-bearing for the first time.

`poll.py` imports these and is still where the polling behaviour lives; this is
a leaf so that reading a number costs nothing.
"""

from __future__ import annotations

# The STORM cadence, and the fastest this app ever polls. It is FloodNet's own
# publication rate — the measured median gap between two readings from one
# deployment is 60s — so asking more often returns the same row.
POLL_SECONDS = 60

# The DRY cadence: how long one scheduled run may live, and therefore how stale
# a reading may get while nothing is happening.
#
# ⚠️ **This number and the Railway cron expression are ONE fact written twice.**
# The cron service runs `python -m waterline.poll window` on `*/15`, and
# `poll.run_window` stops at this budget so a run cannot outlive its own
# schedule. Change one without the other and the poller either idles inside a
# window it has already finished with, or gets skipped for still being alive.
#
# ⚠️ **It is a cost decision, not a data one.** Neon bills for being awake, and
# something touching Postgres every 60 seconds means autosuspend can never fire.
# At fifteen minutes the database is awake roughly a tenth of the day instead of
# all of it. What buys that back when it matters is `poll._storm`: the run
# escalates to `POLL_SECONDS` the moment any of the three witnesses says
# something is happening, so the saving comes entirely out of quiet weather.
POLL_WINDOW_S = 900
