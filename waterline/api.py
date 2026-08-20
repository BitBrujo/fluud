"""The API + UI — the service entrypoint.

    uvicorn waterline.api:app --host 0.0.0.0 --port 8080
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from . import (
    agent,
    auth,
    cameras,
    db,
    feeds,
    floodnet,
    gauges,
    mail,
    notify,
    nta,
    peaks,
    watch,
)
from .config import settings
from .models import (
    CameraRegistryResponse,
    DepthPeakResponse,
    DepthPeaksResponse,
    GaugeHistoryResponse,
    HealthResponse,
    HistoryResponse,
    LanguagesResponse,
    SensorsResponse,
    StatusResponse,
    WatchConfirmResponse,
    WatchMineResponse,
    WatchResendResponse,
    WatchSubscribeResponse,
    WatchSubscriptionResponse,
    WatchUnsubscribeResponse,
    WeatherAlert,
)

log = logging.getLogger(__name__)

app = FastAPI(title="Fluud", version="0.1.0")

_poller: threading.Thread | None = None


# --- the session gate ------------------------------------------------------
# Paths that answer WITHOUT a session, even when `require_auth` is on. Every
# other `/api/*` path requires one.
#
# ⚠️ **The list is exemptions, not requirements, and the direction is the whole
# point.** A route added to this file is gated by default; forgetting to think
# about auth leaves it closed, which is the safe way to be forgetful. The
# inverse — decorating each route with a dependency — leaves a new route open
# by omission, and nothing anywhere would say so.
#
# Each entry earns its place:
#
# - **the two healthz paths.** `curl $URL/api/healthz` is the post-deploy
#   check, and a 401 there would make a correctly-running service look dead. It
#   reports no reading: `polling`, `last_tick_at`, `mail_delivers`, `auth`.
# - **`/api/watch/confirm` and `/api/watch/unsubscribe`.** ⚠️ These are reached
#   from a LINK IN AN EMAIL, by somebody who has proved they own a mailbox and
#   may have no Google account at all. Gating them would mean a confirmation
#   link that cannot be confirmed and — far worse — an **unsubscribe link that
#   demands a sign-in**. Both already carry their own bearer credential in the
#   URL: an opaque single-purpose token, which is a stronger claim about that
#   specific mailbox than a session is.
# - ⚠️ **`/api/watch/subscription`, added 2026-08-16.** The same argument, and
#   until then the exemption above was **unreachable in practice**: both links
#   pointed at `/map/?…`, `/map` is wrapped in `RequireSession`, and a
#   signed-out reader was redirected to sign-in before the component that reads
#   the token ever mounted. The links point at `/watch/` now, which has no gate
#   — and the manage face that page renders has to be able to LOAD, which is
#   this route. Exempting confirm and unsubscribe while gating the surface
#   between them was an exemption in name only.
#
#   ⚠️ **This gate is METHOD-BLIND.** `_session_gate` matches
#   `request.url.path.rstrip("/")` and nothing else, so this entry exempts GET,
#   PUT, and whatever is added to that path next. A DELETE registered there
#   later would be open, and nothing anywhere would say so.
#
#   ⚠️ **PUT is acceptable a fortiori, and the bound is the token.**
#   `watch_update` starts with `db.subscriber_by_manage_token` or a 404, so it
#   can only ever touch one row; it cannot create an address; `camera_ids`
#   still 400s; the cap still 400s; `_permitted_sensor_ids` still refuses; and
#   `_validated_settings` / `_validated_overrides` still enforce the
#   vocabulary. **`/api/watch/unsubscribe` is already exempt and hard-deletes
#   that same row with a cascade** — if the destructive operation is defensible
#   on a mailed token, editing it is strictly less.
#
# ⚠️ **`/api/watch/resend` is NOT here and that refusal is deliberate.** It is
# the only route in this app a stranger can cause mail to be sent from, which is
# why it has its own rate bucket and `CONFIRM_RESENDS_MAX`. `/watch/` does not
# call it. **The honest cost, recorded in LIMITATIONS §16: a reader whose token
# has been deleted gets a 404 on `/watch/` with no recovery door**, because both
# recovery doors live in the wizard on `/map`, behind the gate.
_AUTH_EXEMPT: frozenset[str] = frozenset({
    "/healthz",
    "/api/healthz",
    "/api/watch/confirm",
    "/api/watch/subscription",
    "/api/watch/unsubscribe",
})


@app.middleware("http")
async def _session_gate(request, call_next):
    """Refuse `/api/*` without a verified Neon Auth session.

    ⚠️ **This is the lock. `RequireSession` in the UI is a curtain.** The Next
    export is static files served to anyone, so nothing in the bundle is
    private and the client-side check only decides what is drawn.

    ⚠️ **It gates `/api/*` and NOT the UI mount**, which is deliberate. The
    HTML, CSS and JS stay public because they have to: the sign-in page is
    itself part of the bundle, so a reader who cannot fetch the bundle cannot
    sign in. What is protected is every reading.

    A middleware rather than a per-route dependency because it cannot be
    forgotten — see `_AUTH_EXEMPT`. It runs before routing, so it also covers
    paths that match no route at all.
    """
    path = request.url.path
    if (
        settings.require_auth
        and path.startswith("/api/")
        and path.rstrip("/") not in _AUTH_EXEMPT
    ):
        try:
            # ⚠️ **The return value used to be discarded and now it is kept.**
            # See `_verified_session`. Nothing about admission moves: this is
            # still the only caller of `auth.require_session`, the list is still
            # default-closed, and no route may take a `Depends` on it.
            request.state.session = auth.require_session(
                request.headers.get("authorization")
            )
        except HTTPException as e:
            # ⚠️ Raising from middleware does NOT reach FastAPI's exception
            # handlers — Starlette has already left the routing layer — so the
            # response is built here. Without this an expired token answers
            # with a 500 and an unhandled-exception traceback in the log.
            return JSONResponse({"detail": e.detail}, status_code=e.status_code)

    return await call_next(request)


def _verified_session(request: Request) -> auth.Session | None:
    """The session `_session_gate` verified for this request, or None.

    ⚠️ **This is NOT the per-route dependency the root `CLAUDE.md` refuses.**
    That rule is about who decides *admission*, and admission is still the
    middleware alone — default-closed, method-blind, impossible to forget. This
    reads a decision that has already been made. A `Depends(auth.require_session)`
    on a handler is still forbidden, and a `Request` parameter is not that.

    ⚠️ **`None` has three causes and every one of them means *no shortcut*.**
    `REQUIRE_AUTH` is off; the path is in `_AUTH_EXEMPT`; or the gate did not
    run at all. All three collapse to one answer, which is the safe direction:
    with the gate off this API is open to anybody, so a `session.email` nobody
    had to prove must not unlock anything. **The failure mode of getting this
    backwards is a self-confirming subscribe on an unauthenticated deployment.**

    ⚠️ **It reads what the middleware already verified and never verifies
    again.** `auth.verify` stays the only caller of `jwt.decode` in this repo,
    and it never decodes with `verify_signature=False`.

    ⚠️ **An exempt path never has one.** `confirm`, `subscription` and
    `unsubscribe` are reached from a link in an email by somebody who may have
    no account at all; they authorise on a single-purpose bearer token and must
    not start growing session behaviour behind it.
    """
    return getattr(request.state, "session", None)


@app.on_event("startup")
def _maybe_start_poller() -> None:
    """Run the poll loop in-process when POLL_IN_SERVICE is set.

    This is the shipped shape: one service doing both jobs. The reason is
    process state that a per-tick job would throw away every minute —
    `poll.LAST_TICK_AT` (which is how `/api/healthz` reports the loop is
    running at all), `api._bucket_limited`'s rate buckets, and `rat.py`'s
    event buffer. See `config.poll_in_service`.

    Hard requirement on the host: the container has to keep running between
    requests. A platform that suspends CPU while no request is in flight stops
    this thread ticking with no error at all.
    """
    global _poller
    if not settings.poll_in_service or _poller is not None:
        return

    from . import poll

    _poller = threading.Thread(target=poll.run, name="waterline-poll", daemon=True)
    _poller.start()
    log.info(
        "poll loop started in-process (%d cameras, %s mode)",
        len(settings.cameras), settings.mode,
    )


# ⚠️ **`/api/healthz` did NO database query at all until 2026-08-15**, and it is
# polled every 30s by every open tab. This memo is what keeps the cost of the
# `writes` block a function of TIME rather than of how many tabs are open. Ten
# seconds is under both poll cadences, so no reader ever sees a value staler
# than one poll of the thing it describes.
#
# ⚠️ **This is not a second source of truth and must not grow into one.**
# `sensor_readings` carries "no second in-process cache" as a rule for good
# reason. This holds one ~120-byte row for ten seconds, every process still
# reads the same row out of Postgres, and nothing derived from it is stored.
_WRITES_TTL_S = 10.0
_writes_memo: tuple[float, dict | None] = (0.0, None)


def _poll_writes() -> dict | None:
    """The heartbeat row, memoised, and `None` when we could not read it.

    ⚠️ **Wrapped, and the failure is `None` rather than a 500.** A database
    outage that turned `/api/healthz` red would fail the post-deploy `curl` and,
    on a host using this route as a liveness probe, restart a container whose
    process is perfectly fine. The status code does not move.
    """
    global _writes_memo

    fresh_at, cached = _writes_memo
    now = time.monotonic()
    if cached is not None and (now - fresh_at) < _WRITES_TTL_S:
        return cached

    try:
        row = db.poll_health()
    except Exception as e:  # noqa: BLE001 — liveness must not depend on this
        log.warning("poll heartbeat read failed (%s): %s", type(e).__name__, e)
        return None

    # `None` from `db.poll_health` means the table is there and holds no row for
    # this mode — nothing has ever polled it. That is a positive statement and
    # it is NOT the same as the read failing above, so it ships as a present
    # block with a null `tick_at` rather than as a null block. See `PollWrites`.
    writes = {
        "tick_at": row["tick_at"] if row else None,
        "tick_ok": row["tick_ok"] if row else None,
        "readings": row["readings"] if row else None,
        "stored": row["stored"] if row else None,
        "last_store_at": row["last_store_at"] if row else None,
    }
    _writes_memo = (now, writes)
    return writes


# --- the read-path memo ----------------------------------------------------
# ⚠️ **This is `_WRITES_TTL_S`' argument applied to the three big reads**, and it
# is what makes the database's cost a function of TIME rather than of how many
# people are looking. `/api/status`, `/api/sensors` (425 rows) and `/api/cameras`
# (968 rows) are identical for every visitor and change only when the poller
# writes. Without this, ten open tabs are ten sets of queries a minute and the
# database can never go back to sleep — which since 2026-08-20 is the whole
# point: the poller was moved to a schedule so Neon could suspend between runs,
# and a single forgotten tab would have undone all of it.
#
# ⚠️ **Strictly BELOW `poll.POLL_SECONDS`, and that bound is the design.** The
# cache may never be the reason a reading is late. During a storm the poller
# escalates back to 60s, so a TTL at or above that could hold a rising depth off
# the page for a whole extra tick. Thirty seconds collapses every concurrent
# reader — which is the actual goal — while adding at most half a tick of
# staleness to the one who misses.
#
# ⚠️ **Not a second source of truth**, on `_WRITES_TTL_S`' rule. Every process
# still reads the same rows out of Postgres, nothing derived from this is
# stored, and the cached value is treated as immutable — a caller that mutated
# it would be editing what the next reader sees.
#
# No lock. Two threads that miss together both build, which costs one duplicated
# read and converges immediately; a lock around the build would serialise
# requests to make a memo tidier, which is the wrong trade in the wrong place.
_READ_TTL_S = 30.0
_read_memos: dict[str, tuple[float, dict]] = {}


def _memoised(key: str, build) -> dict:
    """`build()`'s answer, at most `_READ_TTL_S` old. See the block above."""
    hit = _read_memos.get(key)
    now = time.monotonic()
    if hit is not None and (now - hit[0]) < _READ_TTL_S:
        return hit[1]
    value = build()
    _read_memos[key] = (now, value)
    return value


@app.get("/api/healthz", response_model=HealthResponse)
@app.get("/healthz", response_model=HealthResponse)
def healthz() -> dict:
    """Cheap liveness, plus the facts about the poller.

    ⚠️ **Registered at TWO paths, and the UI polls the `/api/` one.** Some
    hosts reserve the bare `/healthz` at their edge and answer it themselves —
    a request that never reaches this process, which `lib/messages.ts` renders
    as *"cannot reach the service"* over a perfectly healthy deployment. The
    bare path stays because it works everywhere else and every runbook curls
    it; it is two decorators on one handler and costs a line.

    `polling` is `_poller.is_alive()` and therefore only catches a thread that
    has **exited**. A thread the host has stopped scheduling is still alive,
    which is the failure this endpoint would otherwise miss entirely.

    `last_tick_at` is what closes that hole: the loop stamps it every
    iteration, so a timestamp older than a couple of poll intervals means the
    thread is frozen no matter what `polling` says. `null` before the first
    tick completes, and wherever the poller runs as a separate process.

    ⚠️ **`writes` is the third poller fact and it supersedes the first two**, on
    two counts. It comes out of `poll_ticks` in Postgres rather than out of this
    process's memory, so it is right in **both** deployment shapes — the two
    above are `null` forever on an API-only instance, which is why the UI had to
    gate the frozen-poller row on `poll_in_service` and therefore said nothing at
    all on a bare `uvicorn` run. And it carries `last_store_at`, which separates
    a loop that is ticking and collecting from a loop that is ticking and storing
    nothing. Neither field above can tell those apart: both keep moving.

    ⚠️ **Three absences with three meanings** — see `PollWrites`. Block absent is
    an older server, block `null` is *we could not ask*, and a present block with
    a null `tick_at` is *nothing has ever polled this mode*.

    ⚠️ **`mail_delivers` is the third fact and it is about a DIFFERENT failure**
    — not whether we are observing, but whether anything we decide can reach a
    person. It is `mail.transport_delivers()` verbatim, never a second reading
    of the settings, and it is here rather than on a watch route because it is a
    property of the deployment rather than of a request: a caller learns nothing
    about any address from it. The watch panel's confirm face renders it, so
    *"check that address"* is not printed against a transport that writes to a
    log file. It reports **capability, never delivery** — `outbox.status` means
    handed to a relay and this means less than that, so nothing may word it as a
    promise that a message arrived.
    """
    # Deferred, as `_nws_status` used to be: importing `poll` at module scope
    # would pull the whole ingest tree into every process that serves a request.
    from . import poll

    last_tick = poll.LAST_TICK_AT if settings.poll_in_service else None

    return {
        "ok": True,
        "mode": settings.mode,
        "poll_in_service": settings.poll_in_service,
        "polling": bool(_poller and _poller.is_alive()),
        "last_tick_at": last_tick,
        # ⚠️ Not behind `poll_in_service`, unlike the line above it. That guard
        # exists because the field above it is a global in this process; this one
        # is read out of the database, so an API-only instance answers about the
        # poller running elsewhere. Gating it would reintroduce the exact hole it
        # was added to close.
        "writes": _poll_writes(),
        "cameras": len(settings.cameras),
        "mail_delivers": mail.transport_delivers(),
        "auth_required": settings.require_auth,
        # ⚠️ **The cadences the UI sizes its staleness thresholds against.** Not
        # behind `poll_in_service`, for `writes`' reason one better: these are
        # constants of the build, true whichever process runs the loop and true
        # when none is. See `HealthResponse` for why they are on the wire at all.
        "poll_seconds": poll.POLL_SECONDS,
        "poll_window_s": poll.POLL_WINDOW_S,
    }


def _nta_name(nta_code: str | None) -> str | None:
    """The NTA display NAME for a code, or None.

    The code is an internal join key that arrives on FloodNet's Socrata mirror
    and means nothing to a reader, so nothing on the wire carries it. Both row
    kinds resolve through here — camera rows and sensor rows — so the two cannot
    name one neighborhood two ways.

    ⚠️ **This used to read `rodent_nta.RATES`, whose rows were a by-product of
    the DOHMH rat-inspection aggregate**, and it returned `entry[0]` out of a
    `(name, rate, inspections)` tuple. That feature was deleted on 2026-08-14
    and the name lookup was carved out of it into `nta.py`, because a
    neighborhood's name was never rodent data — DOHMH supplied the counts and
    the DCP layer supplied the names. **Coverage went UP as a result**, 213 NTAs
    to 262: the old file could only name a neighborhood the city had inspected
    that year, so a sensor in an uninspected NTA had no name at all.

    ⚠️ **Still returns None rather than the code on a miss.** A raw `BK0503` in
    a `neighbourhood` row reads as a rendering bug, and the em-dash beside it is
    already the page's word for *we do not have this*.
    """
    if not nta_code:
        return None
    return nta.NAMES.get(nta_code)


@app.get("/api/status", response_model=StatusResponse)
def status() -> dict:
    """Everything the UI needs in one call. Memoised — see `_memoised` above."""
    return _memoised("status", _build_status)


def _build_status() -> dict:
    """The uncached body. Everything in here is per-visitor cost without the memo."""
    obs = db.latest_observations()

    # The gauge registry is code (`gauges.GAUGES`) and the readings are rows, so
    # they are joined here rather than in SQL. A reading whose gauge is no longer
    # configured is skipped: it is history for an instrument this build does not
    # claim to watch, and it has no name or coordinates to render.
    levels = db.latest_gauge_readings()
    gauge_rows = []
    for r in levels:
        g = gauges.site(r["gauge_id"])
        if g is None:
            continue
        gauge_rows.append({
            "gauge_id": g.gauge_id,
            "network": g.network,
            "name": g.name,
            "lat": g.lat,
            "lon": g.lon,
            "level_ft": r["level_ft"],
            "observed_at": r["observed_at"],
            "minor_flood_ft": g.minor_flood_ft,
        })
    gauge_rows.sort(key=lambda g: (g["network"] != "noaa", g["name"]))

    return {
        "mode": settings.mode,
        "disclaimer": agent.disclaimer(),
        "thresholds": {
            "flood_event_mm": settings.flood_event_mm,
            "curb_height_mm": settings.curb_height_mm,
        },
        # ⚠️ **Read off `floodnet`, never off `settings`, and that is the
        # whole reason these are not in the block above.** The two thresholds
        # are borrowed and configurable; these three are this repo's own
        # judgement about when an instrument is lying, each derived at its
        # constant from measured behaviour. Putting them in `config.py` would
        # make a safety band something an environment variable can widen at
        # 9pm, which is exactly the change `IMPLAUSIBLE_MM`'s docblock exists
        # to argue against.
        "ingest": {
            "implausible_min_mm": floodnet.IMPLAUSIBLE_MIN_MM,
            "implausible_mm": floodnet.IMPLAUSIBLE_MM,
            "reading_max_age_s": int(floodnet.MAX_AGE.total_seconds()),
        },
        "cameras": [
            {
                "camera_id": o["camera_id"],
                "name": o["name"],
                "lat": o["lat"],
                "lon": o["lon"],
                "image_url": o["image_url"],
                "observed_at": o["observed_at"],
                "depth_mm": o["depth_mm"],
                "sensor_id": o["sensor_id"],
                "nws_active": o["nws_active"],
                # An unpaired camera has no ground truth. The UI must say so
                # rather than implying the absence of depth means dry.
                "calibrated": o["sensor_id"] is not None,
                # Whether the poller judged this depth physically believable.
                # True where there is no depth: absence has nothing to doubt.
                # Until this shipped, `_depth_is_credible` gated alerting on it
                # and the display said nothing, so a faulted rangefinder's
                # number rendered exactly like a real one.
                "depth_plausible": o["depth_plausible"],
                # The display NAME of this camera's neighborhood, resolved from
                # its paired sensor's 2020 NTA code. Null for an unpaired
                # camera, or one whose sensor has no NTA upstream, and null
                # renders as no line at all.
                "nta": _nta_name(o["nta"]),
            }
            for o in obs
        ],
        "gauges": gauge_rows,
        "nws": _nws_status(),
    }


# NWS's own published severity vocabulary, most severe first. ⚠️ **Ordering by
# it is allowed because it is THEIRS** — a rank this app invented over somebody
# else's warnings would be this page deciding which hazard matters more. Anything
# unrecognised sorts last rather than being dropped.
_NWS_SEVERITY_RANK = {"extreme": 0, "severe": 1, "moderate": 2, "minor": 3}


def _nws_status() -> dict:
    """The NWS block: the five boroughs, ordered, plus what could not be asked.

    ⚠️ **Reads the `nws_reads` row, whose `checked_at` and `alerts` only a
    successful fetch writes.** So the list is the last thing NWS actually said
    and never an outage rendered as a quiet day — the UI is told `reachable` and
    `checked_at` separately and does the wording. See `poll._record_nws`.

    ⚠️ **It used to read three globals off `poll`, and that broke the moment the
    poller moved to its own container** — see the tombstone where they were
    declared. A row is what makes this correct in both deployment shapes, which
    is the same argument `poll_ticks` settled for liveness.

    ⚠️ **No row means no poller has ever asked**, which is *waiting* — a null
    `attempted_at` and `reachable` True, exactly what the first tick used to look
    like. A database that cannot be read is a different thing entirely and is not
    caught here: `/api/status` already fails whole on `db.latest_observations`
    above, and inventing a third answer here would only disagree with it.

    ⚠️ **`elsewhere` is a COUNT and not a filter's leftovers.** The request is
    statewide because that is the second witness's input; this page narrows to
    the boroughs, and a scope narrowed silently is a scope a reader cannot audit.
    """
    row = db.nws_read()

    attempted_at = row["attempted_at"] if row else None
    checked_at = row["checked_at"] if row else None
    # `Lenient`, so whatever else NWS sent survives the round trip through
    # `jsonb` — which is the reason that column is `jsonb` at all.
    alerts = [WeatherAlert.model_validate(a) for a in (row["alerts"] if row else [])]

    local = [a for a in alerts if feeds.in_nyc(a)]
    local.sort(key=lambda a: (
        _NWS_SEVERITY_RANK.get((a.severity or "").lower(), 9),
        a.onset or a.expires or datetime.max.replace(tzinfo=timezone.utc),
    ))
    return {
        "checked_at": checked_at,
        "attempted_at": attempted_at,
        # ⚠️ Whether the LAST ATTEMPT succeeded, not whether we have ever
        # succeeded. Before the first tick this is True with a null
        # `checked_at`, and *waiting* is what the UI must say — not *reachable*
        # and not *down*.
        "reachable": attempted_at is None or checked_at == attempted_at,
        "alerts": [
            {
                "event": a.event,
                "severity": a.severity,
                "urgency": a.urgency,
                "certainty": a.certainty,
                "headline": a.headline,
                "area_desc": a.area_desc,
                "onset": a.onset,
                "ends": a.ends,
                "expires": a.expires,
            }
            for a in local
        ],
        "elsewhere": len(alerts) - len(local),
    }


@app.get("/api/history/{camera_id}", response_model=HistoryResponse)
def camera_history(camera_id: str) -> dict:
    """Recent depth for one camera, oldest first.

    The 404 is load-bearing: it means "nothing recorded here", which is a
    different answer from "recorded, and it was zero". The UI reads it as the
    former and renders nothing. Do not turn it into a 200 with an empty list.
    """
    rows = db.history(camera_id)
    if not rows:
        raise HTTPException(404, "no observations for that camera")
    return {
        "camera_id": camera_id,
        "points": [
            {"t": r["observed_at"], "depth_mm": r["depth_mm"]}
            for r in rows
        ],
    }


@app.get("/api/depth-peak/{kind}/{instrument_id}", response_model=DepthPeakResponse)
def depth_peak(kind: str, instrument_id: str, minutes: int = 60) -> dict:
    """The highest plausible depth one instrument reported over a window.

    Backs the detail panel's depth readout when the reader picks a timeframe
    instead of the current reading. One route over both kinds because it is one
    question asked of two tables — see `db.camera_depth_peak` /
    `db.sensor_depth_peak`, which are two functions for a reason that is about
    SQL rather than about the question.

    ⚠️ **404 means the instrument is unknown; it never means "the window was
    empty".** That distinction is the whole reason the queries select from
    `cameras` / `sensors` and hang the aggregate off a lateral, and it is the
    same call `/api/history/{camera_id}` makes in the opposite direction: there,
    "no observations at all" IS the answer about the named thing, so it 404s. A
    window with nothing in it is a 200 carrying `peak_mm: null`, `readings: 0`
    — a real answer, and the UI has three different sentences for the three
    shapes it can take (see `DepthPeakResponse`).

    ⚠️ **An out-of-range window is CLAMPED, not refused.** `peaks.clamp_minutes`
    brings it inside what retention can answer for and the response echoes the
    window actually used, so the client can say it clamped. A 400 here would put
    an error banner on the page over a number somebody typed into a spinner.
    """
    if kind not in ("camera", "sensor"):
        # Named rather than silently dropped, on `_permitted_sensor_ids`' rule.
        raise HTTPException(400, "kind must be 'camera' or 'sensor'")

    window = peaks.clamp_minutes(minutes)
    row = (
        db.camera_depth_peak(instrument_id, window)
        if kind == "camera"
        else db.sensor_depth_peak(instrument_id, window)
    )
    if row is None:
        raise HTTPException(404, f"no such {kind}")

    return {
        "kind": kind,
        "instrument_id": instrument_id,
        "minutes": window,
        # `max()` over an empty set is null, which is the honest answer and is
        # NOT a zero. The model forbids turning it into one.
        "peak_mm": row["peak_mm"],
        "peak_at": row["peak_at"],
        "readings": row["readings"] or 0,
        "faulted": row["faulted"] or 0,
        "newest_at": row["newest_at"],
    }


@app.get("/api/depth-peaks/{kind}", response_model=DepthPeaksResponse)
def depth_peaks(kind: str, minutes: int = 60) -> dict:
    """Every instrument of one kind, peaked over one window, in one request.

    Backs the instrument list when the reader picks a timeframe there. The
    single-instrument route above still backs the detail panel and is untouched:
    it answers `peak_at` and `newest_at`, which that panel renders and a list row
    does not.

    ⚠️ **This exists because 425 is not 1.** The obvious implementation — the
    list asking `/api/depth-peak/sensor/{id}` per row — is 425 requests per
    change of window, on a page whose own `use-sensors.ts` is gated behind a
    flag because ONE 150 KB fetch was judged too expensive to make unasked.
    Measured instead: **401 groups in 25.6 ms** at the widest window.

    ⚠️ **No 404 branch, and that is not an oversight.** `kind` is still
    validated, because an unknown kind is a caller bug. But there is no
    instrument id to be unknown — the response describes whatever reported, and
    an id the caller knows about that is missing from `peaks` is the *empty
    window*, which is a real answer rather than a missing one. The single
    route's 404 exists to separate those two, and here there is nothing to
    separate.

    ⚠️ **Clamped, never refused**, exactly as above, and the response echoes the
    window actually used so the list can label the window it GOT.
    """
    if kind not in ("camera", "sensor"):
        # Named rather than silently dropped, on `_permitted_sensor_ids`' rule.
        raise HTTPException(400, "kind must be 'camera' or 'sensor'")

    window = peaks.clamp_minutes(minutes)
    rows = (
        db.camera_depth_peaks(window)
        if kind == "camera"
        else db.sensor_depth_peaks(window)
    )
    return {
        "kind": kind,
        "minutes": window,
        "peaks": [
            {
                "instrument_id": r["id"],
                # `max()` over an empty set is null, and it stays null. The model
                # forbids turning it into a zero and the UI renders an em-dash.
                "peak_mm": r["peak_mm"],
                "readings": r["readings"] or 0,
                "faulted": r["faulted"] or 0,
            }
            for r in rows
        ],
    }


@app.get("/api/gauge-history", response_model=GaugeHistoryResponse)
def gauge_history() -> dict:
    """Recent level for every gauge, oldest first, one series per gauge.

    ⚠️ **No 404 here, unlike `/api/history/{camera_id}`, and the difference is
    deliberate.** That route answers about one named instrument, so "nothing
    recorded" is a real answer about a real thing. This one is a batch: an empty
    `series` means the poller has not stored a gauge reading in the window, and
    the panel already renders each gauge's current level from `/api/status`
    regardless. A 404 would make the cards' sparklines vanish on a cold start
    while the numbers above them were perfectly good.

    ⚠️ **The series are not comparable to each other.** Each is drawn against
    its own range in `gauge-sparkline.tsx`, which prints its own endpoints for
    exactly this reason. Nothing may put two of these on one axis.
    """
    rows = db.gauge_history()
    by_gauge: dict[str, list[dict]] = {}
    for r in rows:
        by_gauge.setdefault(r["gauge_id"], []).append(
            {"t": r["observed_at"], "level_ft": r["level_ft"]}
        )
    return {
        "series": [
            {"gauge_id": gid, "points": pts} for gid, pts in by_gauge.items()
        ]
    }


@app.get("/api/sensors", response_model=SensorsResponse)
def sensors() -> dict:
    """Every FloodNet deployment, with its newest reading. 425 of them.

    ⚠️ **Deliberately NOT part of `/api/status`.** That route is polled every 15s
    by every open tab and drives every reading on the page; this one is a
    six-figure payload for a surface most readers never open. Same call
    `/api/gauge-history` makes, for the same reason — the UI fetches it only
    when the sensor list or the sensor map layer is actually on, and polls it at
    60s because FloodNet publishes about once a minute.

    ⚠️ **A 425-row list is not 425 alarms, and three fields keep them apart.**
    `alert_visible` (401) is FloodNet's permission; `alert_permitted` (343) adds
    their health check; `watched_camera_id` (**21**) is the pairing to a camera
    in `WATCH_CAMERAS`. All three ship so the UI can say which is which rather
    than letting a reader infer that everything on the map is armed.

    ⚠️ **`alert_permitted` is the one that gates anything.** It is what the
    email watch admits — `watch.py` has no camera in it at all — so ~343 of
    these can warn a subscriber with no pairing whatsoever.
    `watched_camera_id` names the camera whose view this sensor's depth
    labels, and gates nothing: the on-page alert system was unwired.
    `web/src/lib/api-types.ts` carries the table.

    ⚠️ **21, not 27** — this said 27 until 2026-08-06 and that is a count of
    *cameras*. Four sensors serve more than one watched camera, so the distinct
    sensor count is lower; `db.sensor_status`' `lateral … limit 1` is what keeps
    a row per sensor rather than a row per pair.

    `alert_permitted` comes from `floodnet.alert_permitted`, computed in Python
    over rows already in hand — **never from SQL**. The `sensors` table stores
    only `alert_visible`, so the tempting `where status in (...)` would be a
    second, hand-copied authority for a life-safety predicate.

    Memoised — see `_memoised` above. 425 rows is the largest ordinary payload
    this service builds, and it is identical for everybody.
    """
    return _memoised("sensors", _build_sensors)


def _build_sensors() -> dict:
    rows = db.sensor_status(settings.cameras)
    return {
        "sensors": [
            {
                "sensor_id": s["sensor_id"],
                "name": s["name"],
                "lat": s["lat"],
                "lon": s["lon"],
                "borough": s["borough"],
                # The display name, not the 2020 code. Null for a sensor whose
                # NTA the committed aggregate does not cover.
                "nta": _nta_name(s["nta"]),
                "tidal": s["tidal"],
                "status": s["status"],
                "alert_visible": s["alert_visible"],
                "alert_permitted": floodnet.alert_permitted(
                    s["alert_visible"], s["status"]
                ),
                "watched_camera_id": s["watched_camera_id"],
                # The pole, never the water. See `SensorStatus` — this may not
                # take a depth band, and it may not share an axis with
                # `depth_mm`.
                "ground_height_mm": s["ground_height_mm"],
                # Null together. No row in `sensor_readings` means no reading,
                # and there is nothing here to describe — not a zero, and not a
                # plausibility verdict on a number that does not exist.
                "observed_at": s["observed_at"],
                "depth_mm": s["depth_mm"],
                "flood_detected": s["flood_detected"],
                "plausible": s["plausible"],
            }
            for s in rows
        ]
    }


@app.get("/api/cameras", response_model=CameraRegistryResponse)
def camera_registry() -> dict:
    """The whole DOT camera registry — 968 rows, unfiltered.

    ⚠️ **Deliberately NOT `/api/status`'s camera list, and it is a different
    SET.** That one comes from `observations`, which the poller only writes for
    the 27 ids in `WATCH_CAMERAS`, so the map structurally could not draw more
    than 27 cameras. This reads the `cameras` table and reaches every one of
    them, with the paired sensor's own newest `sensor_readings` row for a depth.
    **No new polling and no change to `WATCH_CAMERAS`** — the readings are
    already being collected for all 425 deployments.

    ⚠️ **Fetched LAZILY by the UI and gated like everything else.** Nothing
    requests it until a reader touches the camera filter, on `/api/sensors`'
    rule: a six-figure payload for a surface most readers never open does not
    belong on the 15s poll. It is **not** in `_AUTH_EXEMPT`, and it must not be
    — those five entries each earn it by being reachable from a link in an
    email, and this is reachable from a map behind the sign-in.

    ⚠️ **No query parameters, and the filtering is the browser's.** Three
    reasons, and the first is the one that makes the feature legal at all: the
    footer has to be able to say *"838 of 968 are not drawn"*, which needs the
    **denominator**, and a server returning only matching rows would have to
    send a count beside them — the second-authority shape `SensorsResponse`
    refuses. Second, every facet in this app is already computed in the browser
    over rows it holds (`applyQuery`, `boroughsOf`, `sensorTotals`). Third, 968
    rows is one `Array.filter`, and a filter in the fetch key is the failure
    `use-depth-peak.ts` records, multiplied by fifteen combinations.

    ⚠️ **`distance_m` is classified here and never forwarded.**
    `cameras.pair_tier` is the single authority for the tier, exactly as
    `floodnet.alert_permitted` is for the alert gate: `db.camera_registry`
    returns the raw number and no `where` clause reads it. See `CameraEntry`.

    Memoised — see `_memoised` above. Having no query parameters is what makes
    that a one-entry cache instead of fifteen, which is the third reason above
    paying off somewhere it was not written for.
    """
    return _memoised("cameras", _build_camera_registry)


def _build_camera_registry() -> dict:
    rows = db.camera_registry()
    return {
        "cameras": [
            {
                "camera_id": r["camera_id"],
                "name": r["name"],
                "lat": r["lat"],
                "lon": r["lon"],
                "image_url": r["image_url"],
                # Null until this database has been re-bootstrapped since the
                # column landed. That is a deployment fact and the UI says so —
                # it is never "outside the city".
                "borough": r["borough"],
                "sensor_id": r["sensor_id"],
                # In Python, over a row already in hand, never in SQL.
                "tier": cameras.pair_tier(r["distance_m"]),
                "depth_mm": r["depth_mm"],
                # FloodNet's publication clock, not our tick. The field name is
                # the safeguard — see `CameraEntry`.
                "depth_observed_at": r["depth_observed_at"],
                # True when there is no depth: absence has no plausibility to
                # doubt, and a null here would be a third state nobody can
                # render. `r["plausible"]` is null exactly when the lateral
                # found no reading.
                "depth_plausible": (
                    True if r["plausible"] is None else r["plausible"]
                ),
            }
            for r in rows
        ]
    }


@app.get("/api/languages", response_model=LanguagesResponse)
def languages() -> dict:
    return {
        "supported": agent.SUPPORTED,
        "pending_review": agent.PENDING_REVIEW,
        "note": (
            "Untranslated languages are deliberately unavailable rather than "
            "machine-translated. A mistranslated flood warning is worse than "
            "no warning."
        ),
    }


# --- the sensor watch ------------------------------------------------------
# Five routes, all under `/api/` so the dev proxy in `next.config.ts` forwards
# them, and all ABOVE the UI mount at the bottom of this file — Starlette
# matches in registration order and anything below it answers with the SPA's
# 404 page instead.
#
# ⚠️ **The way to prove that is to call the route with its real method**, and it
# is worth writing down because the obvious test does not work here. Sending a
# GET to a POST-only route returns the **404 page, not a 405**, whether or not
# the route is registered above the mount: Starlette treats a method mismatch as
# a PARTIAL match, keeps looking, and `Mount("/")` is a FULL match for every
# path in the app. So the mount answers, and it answers with HTML. `/api/typo`
# behaving the same way is the property `waterline/CLAUDE.md` already records.
# A `200` with a JSON body from `POST /api/watch/subscribe` is the proof; a
# `404` with `text/html` from it is the regression.
#
# ⚠️ **These are the first routes here that store what a caller sends**, which
# is why the abuse controls below exist at all. The real one is double opt-in:
# **nothing is ever sent to an address that has not confirmed except that
# address's own confirmation.** That sentence is unchanged and it is the whole
# property; what changed on 2026-08-06 is how many times the one permitted
# message may go out.
#
# ⚠️ **It used to end "and `subscribers.email unique` means it cannot even do
# that twice", and that clause is GONE.** `/api/watch/resend` now answers an
# unconfirmed address by re-queueing its confirmation, because a reader whose
# mail was filtered had no way back and a seven-day wait. So the bound is
# counted rather than structural: `CONFIRM_RESENDS_MAX` (3) over the row's
# lifetime, out of the outbox rather than a new column. The worst an
# unauthenticated POST can do is mail a stranger three identical times instead
# of once. That is a real widening, it is small, and it is stated here rather
# than left to be discovered — see `_resend_confirmation`.

# Two global rate limits. Neither is per-IP and the reasoning for that, along
# with the in-process-state dependency both rest on, is in `_bucket_limited`.
SUBSCRIBE_PER_MINUTE = 20

# ⚠️ **A SEPARATE bucket, deliberately lower.** `/api/watch/resend` sends mail
# to an address the caller names, so it is the only endpoint here somebody can
# aim at a mailbox that is not theirs — bounded to somebody who already
# confirmed, and to a message that names no instrument, but still worth its own
# ceiling. Sharing `subscribe`'s bucket would mean a script hammering one could
# lock out the other, and the one it would lock out is sign-up.
#
# Lower than 20 because the legitimate rate is different in kind: subscribing is
# something a room full of people at a demo might do at once, and asking for a
# lost link is something one person does once.
RESEND_PER_MINUTE = 5

# ⚠️ **The lifetime ceiling on confirmations to ONE unconfirmed address, and it
# is what replaces the property `subscribers.email unique` used to give for
# free.** That property was: an unauthenticated POST can mail a stranger once
# and `on conflict do nothing` means it cannot do it twice. `/api/watch/resend`
# now answers an unconfirmed address with a repeat of its own confirmation — a
# reader whose mail was filtered had no way back and a seven-day wait — so the
# bound has to be counted rather than structural.
#
# **3, and the arithmetic is the argument.** One from `subscribe` plus two
# recoveries. The worst an attacker gains is 3 identical messages to a stranger
# where they previously got 1, over the 7 days `db.prune_unconfirmed` allows the
# row — bounded, small, and a repeat of a message that address already received
# rather than anything new about it. `db.confirm_message_count` counts out of
# the outbox, whose 30-day retention outlives that 7-day row, so a prune cannot
# reset it.
#
# ⚠️ **What is unchanged is the sentence that actually carries the double
# opt-in**: nothing but its own confirmation is ever sent to an unconfirmed row.
# This route may repeat that message and may never send a different one — the
# manage link in particular, which is the confirmed half's and is a credential.
# Raising this number is a decision about how many times a stranger may be
# mailed, so it does not move without that being said out loud.
CONFIRM_RESENDS_MAX = 3

_subscribe_hits: list[float] = []
_resend_hits: list[float] = []
_rate_lock = threading.Lock()


def _bucket_limited(hits: list[float], ceiling: int) -> bool:
    """One sliding-minute bucket. Shared shape so the two cannot drift apart.

    ⚠️ **In-process state, so it is per instance.** These ceilings hold only
    while the service runs as ONE container. Two replicas make every ceiling
    here 2x, silently. That is one of the three reasons the service has to be
    a single long-lived process — see `config.poll_in_service`.

    Deliberately **not** per-IP. An IP is a person record that the privacy
    decision behind these tables excludes, and holding one even for sixty seconds
    beside a table this repo just promised holds none would be exactly the drift
    LIMITATIONS §16 has to argue against. A global bucket bounds the blast radius
    of a bombing script without learning anything about anyone.
    """
    import time as _time

    now = _time.monotonic()
    with _rate_lock:
        hits[:] = [t for t in hits if now - t < 60.0]
        if len(hits) >= ceiling:
            return True
        hits.append(now)
        return False


def _rate_limited() -> bool:
    return _bucket_limited(_subscribe_hits, SUBSCRIBE_PER_MINUTE)


def _resend_limited() -> bool:
    return _bucket_limited(_resend_hits, RESEND_PER_MINUTE)


class WatchSettingsIn(BaseModel):
    """The wizard's global settings, as input. Vocabulary enforced by
    `_validated_settings` with a 400 naming the field, never a silent default —
    a preference that stored as something other than what was asked for is a
    reader holding a setting nothing honours.
    """

    model_config = ConfigDict(extra="forbid")

    min_level: str = notify.DEFAULT_MIN_LEVEL
    frequency: str = notify.DEFAULT_FREQUENCY
    quiet_start: int | None = Field(None, ge=0, le=23)
    quiet_end: int | None = Field(None, ge=0, le=23)


class WatchOverrideIn(BaseModel):
    """Per-instrument override of the two overridable preferences."""

    model_config = ConfigDict(extra="forbid")

    min_level: str | None = None
    frequency: str | None = None


class WatchSubscribeRequest(BaseModel):
    # `extra="forbid"` on the first models here that carry user input. FastAPI
    # would otherwise ignore undeclared keys silently, and a forbidden extra is
    # a legible 422 rather than a field somebody thought they were setting.
    model_config = ConfigDict(extra="forbid")

    # A plain `str`, not pydantic's `EmailStr`. That type pulls in
    # `email-validator` and `dnspython` — two new dependencies on a six-line
    # `requirements.txt` — to be strict about a string a relay will judge for
    # itself anyway. `mail.normalise_address` is the one authority, it is pure,
    # and it rejects the case that actually matters (a newline, i.e. SMTP header
    # injection). The trade is written down rather than left to be re-argued.
    email: str = Field(max_length=254)
    # At least one instrument across the TWO lists, checked in the route — a
    # `min_length` on either field alone would forbid a cameras-only watch.
    sensor_ids: list[str] = Field(default_factory=list, max_length=64)
    camera_ids: list[str] = Field(default_factory=list, max_length=64)
    lang: str = "en"
    # None means the defaults, which are the pre-wizard behaviour.
    settings: WatchSettingsIn | None = None
    # Keyed by instrument id, sensor or camera — the two namespaces do not
    # collide (a DOT UUID is not a FloodNet deployment id), and a key naming
    # nothing in either list is refused rather than stored.
    overrides: dict[str, WatchOverrideIn] = Field(default_factory=dict)


class WatchTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(max_length=128)


class WatchResendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)
    # The language of the RESPONSE, never of the mail — see `watch_resend`. The
    # message itself goes out in whatever language that address chose when it
    # subscribed, which this endpoint deliberately never reveals.
    lang: str = "en"


class WatchUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(max_length=128)
    sensor_ids: list[str] = Field(max_length=64)
    # None leaves the camera set alone — the manage face's older callers sent
    # only sensors, and "field absent" must not mean "drop every camera".
    camera_ids: list[str] | None = Field(None, max_length=64)
    # None leaves the stored globals alone; a value replaces them whole.
    settings: WatchSettingsIn | None = None
    overrides: dict[str, WatchOverrideIn] = Field(default_factory=dict)


def _watch_note(lang: str = "en") -> str:
    """The one sentence every watch response carries. `agent`'s words, not ours.

    A route that composed its own reassurance would be the templated-copy rule arriving
    through a side door — and this is the sentence that most needs to be the
    reviewed one, because it is the whole honest caveat on the feature.
    """
    return agent.template("watch_note", lang)


def _permitted_sensor_ids(sensor_ids: list[str]) -> tuple[list[str], list[str]]:
    """Split a requested set into (allowed, refused). Invariant 9, at the door.

    ⚠️ **The predicate is `floodnet.alert_permitted` in Python, never SQL.** The
    `sensors` table stores only `alert_visible`, so the tempting `where status in
    (...)` would be a second, hand-copied authority for a life-safety rule that
    must have exactly one. Rows come back raw; the judgement happens here.

    An id nobody recognises is refused rather than stored. A subscription to a
    deployment that does not exist is a promise with nothing behind it.
    """
    if not sensor_ids:
        return [], []
    with db.conn() as c:
        rows = c.execute(
            "select sensor_id, alert_visible, status from sensors "
            "where sensor_id = any(%s)",
            (list(dict.fromkeys(sensor_ids)),),
        ).fetchall()
    known = {
        r["sensor_id"]: floodnet.alert_permitted(r["alert_visible"], r["status"])
        for r in rows
    }
    allowed, refused = [], []
    for sid in dict.fromkeys(sensor_ids):
        (allowed if known.get(sid) else refused).append(sid)
    return allowed, refused


def _permitted_camera_ids(camera_ids: list[str]) -> tuple[list[str], list[str]]:
    """Split a requested camera set into (allowed, refused).

    ⚠️ **DORMANT — no caller.** The camera watch was retired when the on-page
    alert system was unwired: `subscribe` and the `subscription` PUT both
    refuse `camera_ids` with a 400. Kept beside `camera_subscriptions` and
    `_camera_names` so re-wiring is one commit.

    `_permitted_sensor_ids`' sibling with a different predicate, because the
    authority is different: FloodNet says nothing about a DOT camera. What
    decided was whether this app watched it — `WATCH_CAMERAS`. Unknown ids
    were refused on the same rule. The registry check is `cameras` (raw rows);
    the judgement is `settings.cameras`, in Python.
    """
    if not camera_ids:
        return [], []
    wanted = list(dict.fromkeys(camera_ids))
    with db.conn() as c:
        rows = c.execute(
            "select camera_id from cameras where camera_id = any(%s)",
            (wanted,),
        ).fetchall()
    known = {r["camera_id"] for r in rows}
    watched = set(settings.cameras)
    allowed, refused = [], []
    for cid in wanted:
        (allowed if cid in known and cid in watched else refused).append(cid)
    return allowed, refused


def _validated_settings(
    s: "WatchSettingsIn | None",
) -> tuple[str, str, int | None, int | None]:
    """Refuse bad settings at the door with a 400 naming the field.

    `notify.effective` fails open on junk it finds STORED; this exists so junk
    never gets stored. The quiet pair must arrive whole (half a window is not
    a window) and unequal (`start == end` reads as "never" or "always"
    depending on who is guessing, so nobody gets to guess).
    """
    if s is None:
        return notify.DEFAULT_MIN_LEVEL, notify.DEFAULT_FREQUENCY, None, None
    if s.min_level not in notify.MIN_LEVELS:
        raise HTTPException(
            400, f"min_level must be one of {list(notify.MIN_LEVELS)}"
        )
    if s.frequency not in notify.FREQUENCIES:
        raise HTTPException(
            400, f"frequency must be one of {list(notify.FREQUENCIES)}"
        )
    if (s.quiet_start is None) != (s.quiet_end is None):
        raise HTTPException(
            400, "quiet hours need both a start and an end, or neither"
        )
    if s.quiet_start is not None and s.quiet_start == s.quiet_end:
        raise HTTPException(
            400,
            "quiet hours may not start and end on the same hour — for "
            "emergencies only, set the trigger to emergency instead",
        )
    return s.min_level, s.frequency, s.quiet_start, s.quiet_end


def _validated_overrides(
    overrides: "dict[str, WatchOverrideIn]",
    instrument_ids: set[str],
) -> dict[str, tuple[str | None, str | None]]:
    """Refuse overrides that name nothing in the request, or speak junk.

    Silently dropping an unknown key would store a watch that ignores a
    preference somebody believes they set — the same failure as quietly
    dropping a sensor, one layer up.
    """
    out: dict[str, tuple[str | None, str | None]] = {}
    unknown = [k for k in overrides if k not in instrument_ids]
    if unknown:
        raise HTTPException(
            400,
            "overrides name instruments that are not in this request: "
            + ", ".join(sorted(unknown)),
        )
    for key, ov in overrides.items():
        if ov.min_level is not None and ov.min_level not in notify.MIN_LEVELS:
            raise HTTPException(
                400, f"override min_level for {key} must be one of "
                     f"{list(notify.MIN_LEVELS)}"
            )
        if ov.frequency is not None and ov.frequency not in notify.FREQUENCIES:
            raise HTTPException(
                400, f"override frequency for {key} must be one of "
                     f"{list(notify.FREQUENCIES)}"
            )
        if ov.min_level is not None or ov.frequency is not None:
            out[key] = (ov.min_level, ov.frequency)
    return out


# --- the request-path outbox drain -----------------------------------------
# ⚠️ **The poll tick used to be the ONLY thing that drained the outbox**, and
# that was survivable only while it ran every 60 seconds inside this same
# process. Since 2026-08-20 the poller is a scheduled container on a fifteen
# minute cadence, so a queued confirmation would have sat for up to a quarter of
# an hour — and a double opt-in that takes fifteen minutes to arrive is a signup
# nobody completes.
#
# So the two endpoints that queue mail also ask for it to go out, in a
# `BackgroundTasks` that runs AFTER the response. The tick's drain stays exactly
# where it was and becomes what it always should have been: the retry path.
#
# ⚠️ **Its own bounds, smaller than `poll.MAIL_BATCH` / `MAIL_BUDGET_S`, and for
# a different reason.** The tick's bounds protect a 60-second budget shared with
# the path that alerts. These protect a worker thread: every unit of work is a
# socket to a host we do not own, and `smtp_timeout` is 10s, so five messages
# against a dead server is the ceiling this is sized to keep off one thread.
# Anything past the budget is requeued by `mail.drain` itself and the tick takes
# it.
_REQUEST_MAIL_BATCH = 5
_REQUEST_MAIL_BUDGET_S = 20.0


def _drain_outbox() -> None:
    """Send what is queued, from a request rather than from a tick.

    ⚠️ **Never raises.** It runs after the response has already gone out, so
    there is nobody left to tell — an exception here would surface only as an
    unhandled error in the log, on a request that succeeded. The row is queued
    either way and the poll tick will take it.
    """
    try:
        counts = mail.drain(_REQUEST_MAIL_BATCH, _REQUEST_MAIL_BUDGET_S)
        if counts:
            log.info("mail drain (request): %s", counts)
    except Exception as e:  # noqa: BLE001 — the response is already sent
        log.warning("request mail drain failed (%s): %s", type(e).__name__, e)


@app.post("/api/watch/subscribe", response_model=WatchSubscribeResponse)
def watch_subscribe(
    req: WatchSubscribeRequest, request: Request, background: BackgroundTasks
) -> dict:
    """Ask to be told about specific instruments.

    The refusals below are loud on purpose — a 400 naming the reason, rather
    than quietly dropping the sensors we will not watch. A reader who thinks
    they subscribed to twelve corners and got eight has been told something
    false about what this app will do for them, which is the failure the whole
    feature is most exposed to.

    ⚠️ **It answered the same way for everybody until 2026-08-16 and now it has
    TWO answers.** The thing that is deliberately not legible — whether the
    address was already here — is still not legible **to any caller who did not
    prove that address**, which is every anonymous caller and every signed-in
    reader typing somebody else's. The second answer is reachable only when a
    verified `email_verified` claim equals the request. See
    `WatchSubscribeResponse` for the whole argument and its cost.
    """
    if req.lang not in agent.SUPPORTED:
        raise HTTPException(
            400,
            f"{req.lang} is scaffolded but not reviewed by a speaker. "
            f"Supported: {agent.SUPPORTED}. See agent.PENDING_REVIEW.",
        )

    email = mail.normalise_address(req.email)
    if email is None:
        raise HTTPException(400, "that does not look like an email address")

    # ⚠️ **The camera watch is DORMANT and this refusal is how a caller finds
    # out.** It repeated a warning an `alerts` row was already broadcasting on
    # the page; that path was unwired, so a stored camera subscription would be
    # a promise with nothing behind it. Refused loudly rather than dropped
    # silently, on this route's own rule.
    if req.camera_ids:
        raise HTTPException(
            400,
            "Cameras cannot be watched. A camera is a view here — it measures "
            "nothing and raises nothing, so there is no episode to write to "
            "you about. Watch the FloodNet sensor at that corner instead.",
        )

    asked = len(req.sensor_ids)
    if asked == 0:
        raise HTTPException(400, "pick at least one instrument to watch")
    if asked > settings.watch_max_sensors:
        raise HTTPException(
            400,
            f"one address may watch at most {settings.watch_max_sensors} "
            f"instruments; you asked for {asked}",
        )

    allowed, refused = _permitted_sensor_ids(req.sensor_ids)
    if refused:
        raise HTTPException(
            400,
            "Fluud cannot warn from these instruments, so it cannot watch "
            f"them: {', '.join(refused)}. FloodNet marks which deployments may "
            "raise an alarm and we honour that rather than overriding it.",
        )
    if not allowed:
        raise HTTPException(400, "no watchable instruments in that request")

    min_level, frequency, quiet_start, quiet_end = _validated_settings(
        req.settings
    )
    overrides = _validated_overrides(req.overrides, set(allowed))

    if _rate_limited():
        raise HTTPException(429, "too many subscriptions at once — try again "
                                 "in a minute")

    if db.subscriber_count() >= settings.watch_max_subscribers:
        raise HTTPException(
            503,
            "Fluud is a prototype and its watch list is full "
            f"({settings.watch_max_subscribers}). Nothing was stored.",
        )

    # ⚠️ **Computed AFTER every refusal, the rate limit and the ceiling**, so the
    # fast path is a strict subset of the slow path's checks. A future reader
    # must not be able to find something the shortcut skips.
    #
    # Three things this expression is carrying:
    #
    # - **Both sides go through `mail.normalise_address`.** It is the one address
    #   authority in this repo. Comparing raw strings would let a trailing space
    #   or a display-name form defeat the equality — harmless, since the reader
    #   simply lands on the slow path — but a normalisation applied to one side
    #   only is the version that makes two different addresses compare equal.
    #
    #   ⚠️ **That normaliser strips and validates; it does NOT case-fold, so
    #   this comparison is CASE-SENSITIVE. Verified 2026-08-16, and it is the
    #   safe direction.** A differing case falls to the confirmation flow. The
    #   asymmetry is why it stays: RFC 5321 leaves local-part case to the
    #   receiving server, so case-folding here could hand a confirmation-free
    #   subscription to a mailbox the caller may not own — the exact harm double
    #   opt-in exists to prevent — while not folding costs one unnecessary
    #   confirmation email. **Do not "fix" it by lower-casing either side, and
    #   above all do not lower-case inside `normalise_address`**: that would
    #   change what is STORED and orphan every row already written with capitals,
    #   which is the argument `config.py` makes about normalising `MODE`.
    #   Unreachable from the panel in any case — it submits the session address
    #   verbatim, so both sides are one string from one source.
    # - ⚠️ **`email_verified` is the gate, not `email`.** Better Auth's password
    #   sign-up writes `neon_auth.account.password` with `emailVerified` false,
    #   so a session on its own is not proof of a mailbox. That reader falls
    #   through to the confirmation with no change of behaviour at all.
    # - ⚠️ **The claim is read off a token THIS process verified against Neon's
    #   JWKS.** `auth.py`'s "never decode with `verify_signature=False`" rule is
    #   load-bearing here: break it and this becomes an unauthenticated
    #   self-confirm for any address a caller cares to write into a JWT.
    session = _verified_session(request)
    session_email = (
        mail.normalise_address(session.email)
        if session is not None and session.email
        else None
    )
    verified_self = (
        session is not None
        and session.email_verified
        and session_email is not None
        and session_email == email
    )

    row = db.create_subscriber(
        email, req.lang, secrets.token_urlsafe(32), secrets.token_urlsafe(32),
        min_level=min_level, frequency=frequency,
        quiet_start=quiet_start, quiet_end=quiet_end,
        confirmed=verified_self,
    )
    if row is not None:
        # Only a brand-new address gets its interests set. A repeat POST for a
        # known address does not touch them — see the `row is None` branch.
        db.set_subscriptions(row["id"], _with_overrides(allowed, overrides))

        if verified_self:
            # ⚠️ **The `resend` template, verbatim, and NOT `confirm`.** It is
            # the message a confirmed address is entitled to under the resend
            # partition, it names no instrument, and its whole content is the
            # manage link — which is what a mailbox is for here. The token below
            # lives in one browser tab and is one refresh from gone; this is the
            # durable copy, and it carries the `List-Unsubscribe` header with it.
            subject, body = mail.render(
                "resend", req.lang, "", datetime.now(timezone.utc),
                manage_token=row["manage_token"],
            )
            db.queue_message(
                row["id"], "resend", subject, body, datetime.now(timezone.utc)
            )
            background.add_task(_drain_outbox)
            return {
                "status": "confirmed",
                "manage_token": row["manage_token"],
                "note": _watch_note(req.lang),
            }

        names = _sensor_names(allowed)
        subject, body = mail.render(
            "confirm", req.lang, "", datetime.now(timezone.utc),
            confirm_token=row["confirm_token"],
            manage_token=row["manage_token"],
            sensors=names,
        )
        db.queue_message(
            row["id"], "confirm", subject, body, datetime.now(timezone.utc)
        )
        background.add_task(_drain_outbox)
    elif verified_self:
        # The address is already here AND the caller has just proved they own
        # it. Answering `pending` would leave them waiting on a message that
        # nothing will ever queue, which is the one state this feature may not
        # put anybody in.
        #
        # ⚠️ **Two lookups, kept as a PARTITION** — the same rule
        # `/api/watch/resend` is held to. Nothing is mailed on either branch, so
        # neither can become a way to send to an address its own state did not
        # earn.
        known = db.confirmed_subscriber_by_email(email)
        if known is None:
            unconfirmed = db.unconfirmed_subscriber_by_email(email)
            if unconfirmed is not None:
                # ⚠️ **`db.confirm_subscriber` is reused rather than
                # duplicated**, so this repo still has exactly one
                # `update … set confirmed_at`. A `confirm_subscriber_by_email`
                # would be a primitive that stamps a confirmation from a bare
                # address, which is one careless caller from being the whole of
                # double opt-in. The row's own confirm token never leaves here.
                #
                # A provider-attested `email_verified` is a STRONGER claim about
                # the mailbox than a clicked link: the link proves somebody
                # reading that inbox pressed it, the claim proves the identity
                # provider checked.
                known = db.confirm_subscriber(unconfirmed["confirm_token"])
        if known is not None:
            # ⚠️ **`set_subscriptions` is deliberately NOT called here.** It is
            # delete-then-insert, so applying these picks would silently replace
            # a watch list this reader cannot see from the panel they pressed.
            # They get their token and `/watch/`, which is the surface built for
            # editing the set.
            #
            # ⚠️ **Same shape as the new-row branch above, and that is not
            # cosmetic.** A token on a new row and no token on an existing one
            # would make token-presence a "was this address already here" oracle
            # — the exact reflex this route's response shape exists to kill.
            return {
                "status": "confirmed",
                "manage_token": known["manage_token"],
                "note": _watch_note(req.lang),
            }

    return {"status": "pending", "note": _watch_note(req.lang)}


def _with_overrides(
    ids: list[str], overrides: dict[str, tuple[str | None, str | None]]
) -> list[tuple[str, str | None, str | None]]:
    """Zip a permitted id list with its validated overrides, nulls elsewhere."""
    return [(i, *(overrides.get(i) or (None, None))) for i in ids]


def _sensor_names(sensor_ids: list[str]) -> list[str]:
    """Display lines for the confirmation's list: `name · borough`.

    The borough rides with the name (2026-08-06, the `Map flows` confirm
    email) so a reader confirming can tell two same-named corners apart —
    FloodNet names repeat across boroughs. Falls back to the bare name when
    the row has no borough, and to the id when it has no name. `mail.render`
    stays a `list[str]`: composing the line is this caller's job, and the
    template only ever lists what it is given (the templated-copy rule stays whole).
    """
    with db.conn() as c:
        rows = c.execute(
            "select sensor_id, name, borough from sensors"
            " where sensor_id = any(%s)",
            (sensor_ids,),
        ).fetchall()
    by_id = {r["sensor_id"]: r for r in rows}
    out: list[str] = []
    for sid in sensor_ids:
        row = by_id.get(sid)
        name = (row["name"] if row else None) or sid
        borough = row["borough"] if row else None
        out.append(f"{name} · {borough}" if borough else name)
    return out


def _camera_names(camera_ids: list[str]) -> list[str]:
    """Display lines for the confirmation's list: `name · camera`.

    ⚠️ **DORMANT — no caller**, with `_permitted_camera_ids`. See there.

    `_sensor_names`' sibling. The suffix is the word `camera` where a sensor
    line carries its borough — a DOT camera name is already a street pair, so
    what a reader confirming needs to tell apart is the KIND of instrument,
    not the place twice. Composing the line stays the caller's job: the
    template only ever lists what it is given.
    """
    if not camera_ids:
        return []
    with db.conn() as c:
        rows = c.execute(
            "select camera_id, name from cameras where camera_id = any(%s)",
            (camera_ids,),
        ).fetchall()
    by_id = {r["camera_id"]: r for r in rows}
    out: list[str] = []
    for cid in camera_ids:
        row = by_id.get(cid)
        name = (row["name"] if row else None) or cid
        out.append(f"{name} · camera")
    return out


@app.post("/api/watch/confirm", response_model=WatchConfirmResponse)
def watch_confirm(req: WatchTokenRequest) -> dict:
    """Prove the address wanted this.

    POST rather than GET, and the email links to `/watch/?confirm=…` so the page
    issues the mutation. Mail clients prefetch links; a prefetched GET here would
    confirm an address whose owner never pressed anything, which is the one fact
    double opt-in exists to establish.
    """
    row = db.confirm_subscriber(req.token)
    if row is None:
        raise HTTPException(404, "that confirmation link is not valid")
    return {
        "confirmed": True,
        "manage_token": row["manage_token"],
        "note": _watch_note(row["lang"]),
    }


@app.get("/api/watch/subscription", response_model=WatchSubscriptionResponse)
def watch_subscription(token: str) -> dict:
    """What this token watches. Masked address, no readings.

    ⚠️ **This route carries the silence signal now**, which was an email until
    2026-08-05. Both of its judgements are computed here on every read rather
    than stored, and for the same reason: each can change after somebody
    subscribes, and a stale answer to either would tell a reader their watch is
    live when it has gone quiet.
    """
    sub = db.subscriber_by_manage_token(token)
    if sub is None:
        raise HTTPException(404, "that link is not valid")

    # ⚠️ Coverage comes from Postgres, NOT from `poll.LAST_COVERAGE`. That global
    # is only ever stamped in a process running the poll loop, so on an API-only
    # instance it stays `(0, 0)` and `citywide_silence` reads that as
    # unmeasurable and suppresses — the panel would claim a permanent FloodNet
    # outage on a healthy deployment. See `db.registry_coverage`.
    #
    # The window is `SENSOR_STALE_AFTER`, the same hour `is_silent` uses below,
    # so the two are one rule at two scales rather than two thresholds that can
    # disagree about the same instrument.
    hushed = watch.citywide_silence(
        *db.registry_coverage(watch.SENSOR_STALE_AFTER)
    )
    now = datetime.now(timezone.utc)

    return {
        "email_masked": mail._mask(sub["email"]),
        "confirmed": sub["confirmed_at"] is not None,
        "settings": {
            "min_level": sub["min_level"] or notify.DEFAULT_MIN_LEVEL,
            "frequency": sub["frequency"] or notify.DEFAULT_FREQUENCY,
            "quiet_start": sub["quiet_start"],
            "quiet_end": sub["quiet_end"],
        },
        # ⚠️ **No `cameras` key.** The camera watch is dormant — `WatchCameraRef`
        # went with it — and `camera_subscriptions` rows from before that are
        # left un-dropped and unread. Nothing can create a new one: the two
        # write routes refuse `camera_ids` with a 400.
        "sensors": [
            {
                "sensor_id": r["sensor_id"],
                "name": r["name"],
                "borough": r["borough"],
                "min_level": r["min_level"],
                "frequency": r["frequency"],
                # Recomputed on every read rather than stored, because it can
                # flip after somebody subscribes — and when it does, this watch
                # has gone quiet and the reader is owed the reason.
                "alert_permitted": floodnet.alert_permitted(
                    r["alert_visible"], r["status"]
                ),
                # ⚠️ Forced false under a citywide outage. Half the registry
                # going dark is our feed, not their instrument, and naming their
                # corner would be a true-shaped sentence about the wrong subject.
                # The response says `citywide_silence` instead and the panel
                # renders one honest line in place of N misleading ones.
                "silent": False if hushed else watch.is_silent(
                    r["last_reading_at"], now
                ),
            }
            for r in db.subscriptions_for(sub["id"])
        ],
        "max_sensors": settings.watch_max_sensors,
        "note": _watch_note(sub["lang"]),
        "citywide_silence": hushed,
    }


@app.get("/api/watch/mine", response_model=WatchMineResponse)
def watch_mine(request: Request) -> dict:
    """The signed-in reader's own watch, if their proven address already has one.

    ⚠️ **This exists so the wizard can stop re-asking.** `watch_subscribe` does
    not call `set_subscriptions` on the existing-row branch — deliberately, since
    that function is delete-then-insert and would silently replace a list the
    panel cannot see — so a subscriber walking the whole flow again ends on a
    receipt that changed nothing. The panel needs to know that **before** it
    offers the first step.

    ⚠️ **It is NOT in `_AUTH_EXEMPT` and must never be added.** It is the only
    watch route that authorises on a session rather than on a mailed token, and
    the exempt three are exempt precisely because they are reached by somebody
    who may have no account. `_verified_session` returns `None` on an exempt
    path, so an entry here would not loosen the route — it would **break** it,
    silently, into one that always answers `false`.

    ⚠️ **No parameter, and that is the whole of the enumeration control.** There
    is no address to aim it at: it reports on `session.email` and nothing else,
    so the *"is this address on Fluud"* oracle the rest of this feature spends
    its length refusing has no door here. `mail.normalise_address` on the claim,
    matching every other comparison against a stored address.

    ⚠️ **Three shapes of *no* collapse to one answer**, on `_verified_session`'s
    rule: no session (`REQUIRE_AUTH` off, or the gate did not run), a session
    whose address the provider has not verified, and a verified address with no
    confirmed row. All three mean the wizard runs unchanged, which is the safe
    direction — the shortcut is what has to be earned.
    """
    session = _verified_session(request)
    if session is None or not session.email_verified or not session.email:
        return {"watching": False}

    row = db.confirmed_subscriber_by_email(mail.normalise_address(session.email))
    if row is None:
        return {"watching": False}

    # ⚠️ The GET's own function, called rather than re-assembled — `watch_update`
    # already does this. `citywide_silence` and every `silent` / `alert_permitted`
    # in that body are recomputed on each read because each can flip after
    # somebody subscribes, and a second copy of that assembly is a second place
    # for it to go stale.
    return {
        "watching": True,
        "manage_token": row["manage_token"],
        "subscription": watch_subscription(row["manage_token"]),
    }


@app.put("/api/watch/subscription", response_model=WatchSubscriptionResponse)
def watch_update(req: WatchUpdateRequest) -> dict:
    """Replace the whole watched set. An empty list is legitimate.

    Watching nothing is not the same as unsubscribing: the address stays, and
    the reader can add instruments back without confirming again. Deleting on an
    empty list would silently destroy a confirmation somebody completed.
    """
    sub = db.subscriber_by_manage_token(req.token)
    if sub is None:
        raise HTTPException(404, "that link is not valid")

    # ⚠️ Dormant, same 400 as `subscribe` and for the same reason. A `None`
    # here still means "leave the camera set alone", which is what an older
    # client sends and what every current one sends — the stored rows are
    # simply never read again.
    if req.camera_ids:
        raise HTTPException(
            400,
            "Cameras cannot be watched. A camera is a view here — it measures "
            "nothing and raises nothing, so there is no episode to write to "
            "you about. Watch the FloodNet sensor at that corner instead.",
        )

    asked = len(req.sensor_ids)
    if asked > settings.watch_max_sensors:
        raise HTTPException(
            400,
            f"one address may watch at most {settings.watch_max_sensors} "
            f"instruments; you asked for {asked}",
        )
    allowed, refused = _permitted_sensor_ids(req.sensor_ids)
    if refused:
        raise HTTPException(
            400,
            "Fluud cannot warn from these instruments, so it cannot watch "
            f"them: {', '.join(refused)}.",
        )

    overrides = _validated_overrides(req.overrides, set(allowed))
    if req.settings is not None:
        db.update_subscriber_prefs(
            sub["id"], *_validated_settings(req.settings)
        )

    db.set_subscriptions(sub["id"], _with_overrides(allowed, overrides))
    return watch_subscription(req.token)


@app.post("/api/watch/resend", response_model=WatchResendResponse)
def watch_resend(req: WatchResendRequest, background: BackgroundTasks) -> dict:
    """Send an address the one message its state entitles it to. Always answers
    the same way.

    ⚠️ **Two branches as of 2026-08-06, and the split IS the abuse control.**
    A confirmed address gets its manage link; an unconfirmed one gets a repeat
    of its own confirmation (`_resend_confirmation`, which carries that half's
    reasoning and its lifetime cap). The two predicates are
    `confirmed_at is not null` and `confirmed_at is null`, both in SQL, and they
    partition the table — so neither branch can ever reach for the other's
    message. **A single lookup answering for both states is the refactor to
    refuse**: it is one edit away from handing a confirmed reader's manage
    token, which is a bearer credential, to an address that never proved it
    owned the mailbox.

    ⚠️ **This route exists because the manage token is the only key, and there
    was no second one.** A confirmed subscriber who deleted the email could not
    reach their own settings: re-subscribing hits `subscribers.email unique`,
    `db.create_subscriber` returns None, nothing is queued, and the response
    still says `pending`. They stayed subscribed with no way to stop and no
    surface telling them anything was wrong. That is not a state this feature may
    leave anybody in, so recovery is a route rather than a support request.

    **Why it is not folded into `subscribe`.** Making a repeat POST resend the
    link would tie link recovery to the size of the picked set and the sensor
    permission checks, none of which have anything to do with it — and it would
    put a mail-sending side effect on the path somebody uses to *sign up*, where
    a rate limit tuned for one job now guards two. Separate route, separate
    bucket, separate reason to exist.

    **What bounds the abuse, in order of how much work each does:**

    1. **Each branch may send only its own state's message**, and neither may
       send a NEW one. A confirmed address gets a link it already holds; an
       unconfirmed one gets a repeat of a message that address has already
       received. ⚠️ This bullet read *"Confirmed addresses only. An unconfirmed
       row gets nothing"* until 2026-08-06, when the unconfirmed branch landed,
       and the structural half of it went with that change — see
       `CONFIRM_RESENDS_MAX`, which is the counted bound that replaced it.
    2. **The message names no instrument.** `mail_resend` says nothing about any
       corner, so causing one teaches an attacker nothing about a mailbox they
       cannot read. That is the targeting shape LIMITATIONS §16 is about.
    3. **Its own rate limit**, separate from `subscribe`'s so that hammering one
       cannot lock out the other.
    4. **The response is identical either way**, so the caller cannot use it to
       test whether an address is on the list.

    ⚠️ **The note is rendered in the REQUESTED language, never the subscriber's**,
    and that is not a detail. `watch_note` reads differently in en and es, so
    answering in the stored language would hand back a response that varies with
    whether the address is here *and* leaks what language they picked — defeating
    control 4 with the one field that looked incidental. The mail goes out in
    their language; the HTTP response never sees it.
    """
    if req.lang not in agent.SUPPORTED:
        raise HTTPException(
            400,
            f"{req.lang} is scaffolded but not reviewed by a speaker. "
            f"Supported: {agent.SUPPORTED}. See agent.PENDING_REVIEW.",
        )
    email = mail.normalise_address(req.email)
    if email is None:
        raise HTTPException(400, "that does not look like an email address")
    if _resend_limited():
        raise HTTPException(
            429, "too many link requests at once — try again in a minute"
        )

    now = datetime.now(timezone.utc)
    sub = db.confirmed_subscriber_by_email(email)
    if sub is not None:
        subject, body = mail.render(
            "resend", sub["lang"], "", now, manage_token=sub["manage_token"]
        )
        db.queue_message(sub["id"], "resend", subject, body, now)
    else:
        _resend_confirmation(email, now)

    # ⚠️ **After the branch and unconditional, unlike `subscribe`'s two**, which
    # sit against their own `queue_message`. `_resend_confirmation` never reports
    # — not whether it queued, not whether it refused — and that silence is
    # control 4 above, not an oversight. A drain that asked which branch ran
    # would be reading the fact the partition exists to withhold. On the branch
    # that queued nothing this costs one indexed read of an empty `outbox`,
    # against a database this request has already woken several times over.
    background.add_task(_drain_outbox)

    return {"status": "pending", "note": _watch_note(req.lang)}


def _resend_confirmation(email: str, now: datetime) -> None:
    """Re-queue an unconfirmed address's own confirmation. Never raises, never
    reports.

    ⚠️ **This closes a state the feature could not leave anybody in, and it is
    the same class of gap `watch_resend` itself was written for.** A reader
    whose confirmation was filtered, deleted or never delivered had no way back
    at all: re-submitting hits `subscribers.email unique`, `db.create_subscriber`
    returns None, nothing is queued, and the panel still says `pending`. The
    sibling branch above refuses them by design — `confirmed_at is not null` is
    an abuse control and stays exactly as it is — so the recovery had to be its
    own branch rather than a widened predicate. Until this existed the only
    thing that touched such a row was `db.prune_unconfirmed`, seven days later.

    **What bounds it**, and the first is new because the third had to give way:

    1. ⚠️ **A lifetime cap of `CONFIRM_RESENDS_MAX`**, counted out of the outbox.
       `subscribers.email unique` used to make "mail a stranger once" structural;
       repeating a message on request cannot be structural, so it is counted. See
       that constant for the arithmetic.
    2. **It repeats, and may never compose.** The same template, the same stored
       `confirm_token`, the same interests — so the link in the first message
       stays live and a reader holding either envelope can use either one. It
       teaches an attacker nothing a successful `subscribe` did not already
       deliver, because it is byte-for-byte the message that `subscribe` sent.
    3. ⚠️ **The manage token is NOT sent here.** `mail.render("confirm", …)`
       takes it for the footer's unsubscribe link, which is what an unconfirmed
       row's first confirmation already carried; what this branch may not do is
       send the `resend` message, whose entire content is that credential. The
       branch above is the only path to it and its predicate is in SQL.
    4. **Its own rate-limit bucket**, shared with the branch above — already
       checked by the caller, and deliberately lower than `subscribe`'s.
    5. **The response is identical**, which is why this returns `None` and logs
       nothing a caller can see. Confirmed, unconfirmed, capped and absent are
       four states and the wire carries one answer.

    ⚠️ **No check script reaches this.** `api.py` is an entrypoint and the
    coverage table in `waterline/CLAUDE.md` names it as one of the three holes;
    exercising it needs a database and a running process. The cap and the
    branch predicates are held by this docstring and by the review that reads
    it, on the same terms as `.wl-swell`.
    """
    sub = db.unconfirmed_subscriber_by_email(email)
    if sub is None:
        return
    if db.confirm_message_count(sub["id"]) >= CONFIRM_RESENDS_MAX:
        # Silent on the wire, and loud in the log — the reader is told the same
        # thing either way (see `watch_note`), and an operator looking at a
        # complaint needs to know a ceiling was reached rather than a message
        # lost.
        log.info(
            "subscriber %s has had %d confirmations — not queueing another",
            sub["id"], CONFIRM_RESENDS_MAX,
        )
        return

    # The stored interests, re-listed exactly as `subscribe` listed them. Read
    # back rather than remembered: the message has to describe what this row
    # actually holds, and a set assembled from anywhere else would let the
    # second envelope disagree with the first.
    names = _sensor_names(
        [r["sensor_id"] for r in db.subscriptions_for(sub["id"])]
    )
    subject, body = mail.render(
        "confirm", sub["lang"], "", now,
        confirm_token=sub["confirm_token"],
        manage_token=sub["manage_token"],
        sensors=names,
    )
    db.queue_message(sub["id"], "confirm", subject, body, now)


@app.post("/api/watch/unsubscribe", response_model=WatchUnsubscribeResponse)
def watch_unsubscribe(req: WatchTokenRequest) -> dict:
    """Hard delete, cascading.

    One statement removes the address, every interest and every message still
    queued for them. A soft-delete flag would leave behind a record of a person
    who asked us to stop holding a record of them.

    POST rather than GET for the reason `confirm` is: a mail client prefetching
    an unsubscribe link would silently remove somebody who pressed nothing.
    """
    if not db.delete_subscriber(req.token):
        raise HTTPException(404, "that link is not valid")
    return {"status": "removed", "note": _watch_note()}


@app.exception_handler(Exception)
async def unhandled(_, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": str(exc)})


# --- the UI ----------------------------------------------------------------
# The Next.js static export, built by the Node stage in the Dockerfile and
# copied here. Mounted at "/" so every file Next emits resolves without an
# assetPrefix — including favicon.ico and anything added to public/ later.
#
# THIS MOUNT MUST STAY LAST. Starlette matches routes in registration order, so
# a route registered below this line is unreachable: the mount swallows it and
# returns 404.html instead. Two consequences we accept: /api/typo now answers
# with the 404 page rather than {"detail": ...}, and any new route goes above.
WEB = Path(__file__).parent / "web"


class UIFiles(StaticFiles):
    """Cache the hashed bundles forever, the HTML shell never.

    Next emits content-hashed filenames under `_next/static`, so those are
    immutable by construction. `index.html` names those hashes — caching it is
    exactly how a redeploy serves a shell pointing at chunks the new image no
    longer contains: a white page, a console full of 404s, no obvious cause.
    """

    def file_response(self, full_path, *args, **kwargs):
        resp = super().file_response(full_path, *args, **kwargs)
        immutable = "/_next/static/" in str(full_path)
        resp.headers["Cache-Control"] = (
            "public, max-age=31536000, immutable" if immutable else "no-cache"
        )
        return resp


# StaticFiles(directory=...) raises RuntimeError at *import* time on a missing
# directory. In a fresh clone that stops the API starting at all — and takes
# the poll loop down with it, since the loop is started by this app's startup
# event. A half-built UI must degrade to "no UI", never to "no service".
if WEB.is_dir():
    app.mount("/", UIFiles(directory=WEB, html=True), name="ui")
else:
    log.warning("waterline/web/ is missing — the API is up, the UI is not built")

    @app.get("/")
    def _ui_not_built() -> PlainTextResponse:
        return PlainTextResponse(
            "The Fluud UI is not built.\n\n"
            "  cd web && npm ci && npm run prod:local\n\n"
            "The API is up: try /healthz or /api/status.\n",
            status_code=503,
        )
