"""Ask Neon to suspend our own compute, once a scheduled run has nothing left to do.

## Why this exists

Neon bills for the compute being AWAKE, not for queries. `poll window` reduced
the work to about twenty-five seconds every fifteen minutes, and that made the
idle tail the dominant cost: the compute sits there for the whole
`suspend_timeout_seconds` after the last query before it scales to zero. On the
Launch plan the shortest that may be is **300 seconds** — measured, by asking
the API for 60, 120 and 180 and being refused each time — which is twelve times
the work the poller actually does.

So the run asks for the suspension instead of waiting for it. Duty cycle goes
from roughly 36% of the day to roughly 3%.

## ⚠️ This is a FOURTH server-side origin, and the accounting matters

`config.py` counts three: FloodNet/the weather feeds, SMTP, and Neon Auth. This
is `console.neon.tech`, and it is a fourth.

⚠️ **It is NOT the "fourth third-party origin" the root `CLAUDE.md` forbids.**
That prohibition is about the browser-facing basemap — it is why there is no
tile host and no map library, so the drawing survives somebody else's outage in
a reader's hand. Nothing here is reachable from a browser. This runs in the cron
container, after the tick has already written its readings, and:

- **it is not on the alerting path.** No warning, level, episode or email can
  reach it or be delayed by it;
- **it is not on the display path.** No page reads it and no response waits on
  it;
- **it fails soft and says so.** Every exit returns a string for the log and
  nothing raises. A dead Neon API costs money and changes no behaviour at all.

If any of those three ever stops being true, this module is in the wrong place.

## ⚠️ The endpoint is DERIVED from `DATABASE_URL`, never configured

Same argument as `auth.jwks_url()`, which derives the key set rather than taking
a second URL: two independently settable values are one deploy away from
disagreeing. Here the disagreement suspends **a different compute than the one
this process is connected to** — most likely production while pointed at a dev
branch. There is no configuration that can express that mistake, because there
is no setting.
"""

from __future__ import annotations

import logging
from urllib.parse import urlsplit

import httpx

from .config import settings

log = logging.getLogger(__name__)

API = "https://console.neon.tech/api/v2"

# Bounded like every other outbound call in this repo. Nothing waits on this —
# the run is over — but an unbounded socket to a host we do not own is a
# container that never exits, on a service whose whole point is exiting.
TIMEOUT_S = 10.0


def endpoint_id(database_url: str | None = None) -> str | None:
    """The compute id this process is actually connected to, off the DSN host.

    `ep-old-wildflower-ax35afuc-pooler.c-4.us-east-2.aws.neon.tech`
        -> `ep-old-wildflower-ax35afuc`

    ⚠️ **`-pooler` is a different HOSTNAME for the same compute, not a different
    compute.** Leaving it on produces an endpoint id the API does not know, and
    the failure is a 404 rather than anything louder.

    `None` for anything that is not recognisably a Neon compute host — a local
    Postgres, a socket DSN, a proxy. That is the off switch for every deployment
    that is not on Neon, and it needs no setting.
    """
    url = database_url if database_url is not None else settings.database_url
    if not url:
        return None
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return None
    label = host.split(".")[0]
    if label.endswith("-pooler"):
        label = label[: -len("-pooler")]
    return label if label.startswith("ep-") else None


def configured() -> bool:
    """Whether a suspend could be requested at all.

    ⚠️ **Off unless BOTH the key and the project are set**, on
    `mail_transport="log"`'s rule: the whole feature is exercisable without a
    credential, and a deployment that wants it turns it on in one place. An
    unset key is not a broken deployment — it is a poller that lets the compute
    time out on its own, which is exactly what happened before this existed.
    """
    return bool(settings.neon_api_key and settings.neon_project_id)


def suspend() -> str:
    """Ask Neon to scale our compute to zero now. Returns an outcome, never raises.

    The return value is for the log and for `poll.probe`. Nothing branches on it
    and nothing may start to: this function's success has no bearing on whether
    the city was polled.
    """
    if not configured():
        return "not configured"

    ep = endpoint_id()
    if ep is None:
        # Not a Neon host. Says so rather than guessing at an id, because a
        # guessed id is a suspend request against somebody else's compute.
        return "not a neon compute host"

    url = f"{API}/projects/{settings.neon_project_id}/endpoints/{ep}/suspend"
    try:
        with httpx.Client(timeout=TIMEOUT_S) as c:
            r = c.post(
                url,
                headers={
                    "accept": "application/json",
                    "authorization": f"Bearer {settings.neon_api_key}",
                },
            )
    except Exception as e:  # noqa: BLE001 — the run is over; this cannot fail it
        return f"request failed ({type(e).__name__}: {e})"

    if r.status_code in (200, 201, 202):
        return f"suspended {ep}"
    # ⚠️ A compute that is ALREADY suspended answers 4xx, and that is a success
    # in every sense that matters here. It is reported rather than translated,
    # because a 403 (bad key) and a 409 (already idle) are different problems
    # and collapsing them would hide the first behind the second.
    return f"not suspended ({r.status_code}): {r.text[:160]}"
