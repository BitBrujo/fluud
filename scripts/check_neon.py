#!/usr/bin/env python3
"""Assert the compute-suspend contract. No database, no network, no pytest.

    python3 scripts/check_neon.py

A sibling to the other check scripts, on the same terms.

## What this defends

`neon.suspend` can stop a database. Everything here is about making sure it can
only ever stop **the one this process is connected to**, and only when it has
been deliberately switched on.

1. **The endpoint is derived, never configured.** `neon.endpoint_id` reads
   `DATABASE_URL`'s host, so there is no second value that can disagree with the
   first — the `auth.jwks_url()` argument. The failure a separate setting would
   allow is suspending PRODUCTION from a process pointed at a dev branch, which
   is one copy-paste away and completely silent.
2. **`-pooler` is the same compute under another hostname.** Leaving it on the
   id produces a 404 rather than anything louder, so the stripping is asserted
   directly.
3. **Anything that is not a Neon host answers `None`.** That is the off switch
   for every deployment not on Neon, and it needs no setting.
4. **Off unless BOTH credentials are set**, on `mail_transport="log"`'s rule.
5. ⚠️ **The alerting and display modules may not reach it.** Same shape as
   `check_watch.py`'s `DISPLAY_ONLY` grep: a credential that can stop a database
   has no business being importable from the path that raises warnings, and a
   grep in a check script is the only thing that catches it being wired in a
   year from now.
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from waterline import neon  # noqa: E402

logging.disable(logging.CRITICAL)

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


# --- the endpoint is derived from the DSN, and only from the DSN --------------
POOLED = (
    "postgresql://u:p@ep-old-wildflower-ax35afuc-pooler.c-4.us-east-2.aws"
    ".neon.tech/neondb?sslmode=require&channel_binding=require"
)
DIRECT = "postgresql://u:p@ep-tiny-smoke-axqk3ll8.c-4.us-east-2.aws.neon.tech/neondb"

check("a pooled host resolves to the compute, not to '-pooler'",
      neon.endpoint_id(POOLED), "ep-old-wildflower-ax35afuc")
check("a direct host resolves to the same shape",
      neon.endpoint_id(DIRECT), "ep-tiny-smoke-axqk3ll8")

# ⚠️ The load-bearing pair. Both of these mean *do not call the API at all*, and
# a guessed id here is a suspend request against somebody else's compute.
check("a local Postgres is NOT a Neon compute",
      neon.endpoint_id("postgresql://u:p@localhost:55432/waterline"), None)
check("an empty DSN answers None rather than raising",
      neon.endpoint_id(""), None)
check("a hostless DSN answers None",
      neon.endpoint_id("postgresql:///waterline"), None)
check("a non-ep host answers None",
      neon.endpoint_id("postgresql://u:p@db.example.com/waterline"), None)

# --- off unless switched on ---------------------------------------------------
# The check scripts run with no `.env` guaranteed, so the shipped default is what
# is under test here: absent credentials must be a quiet no-op, never an error
# and never a call.
if not (neon.settings.neon_api_key and neon.settings.neon_project_id):
    check("with no credentials the feature reports itself off",
          neon.configured(), False)
    check("...and suspend() says so rather than calling anything",
          neon.suspend(), "not configured")

# --- ⚠️ unreachable from anything that decides or displays --------------------
# `neon` is the only module allowed to read `neon_api_key`. `poll` is the one
# caller, and it calls it AFTER the readings are written — see
# `poll._release_compute`.
FORBIDDEN_IN = ("watch", "escalation", "api", "mail", "rat", "agent")
for module in FORBIDDEN_IN:
    src = (Path(__file__).resolve().parent.parent / "waterline" / f"{module}.py").read_text()
    for name in ("neon_api_key", "neon.suspend", "import neon"):
        check(f"{module}.py cannot reach {name!r}", name in src, False)

if failures:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)
print("ok — the compute-suspend contract holds")
