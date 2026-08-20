#!/usr/bin/env python3
"""Assert the model contract. No database, no network, no pytest.

    python3 scripts/check_models.py

A sibling to the other check scripts.

## Why a whole script for type declarations

Because three of the properties here are a **single pydantic setting** away from
reversing, none of them fails loudly when it does, and all three are written down
in `waterline/CLAUDE.md` as traps rather than as preferences:

 · **`Wire` sets `extra="forbid"`.** FastAPI's default is to silently DROP
   undeclared keys, so a handler that grows a field nobody added to the model
   returns it to no one and looks perfectly healthy server-side.
 · **DB timestamps are `AwareDatetime`.** Pydantic accepts a naive datetime into
   a plain `datetime` field, and a naive timestamp on the wire is exactly the bug
   `parseServerTime` carries a workaround for — an offsetless string is read in
   the VIEWER's zone, which in NYC shifts every age by four or five hours and
   renders a five-hour-old reading as current.
 · **`SpeakEvent.at` is `str` and must stay `str`.** Those dicts go out over two
   transports — HTTP through pydantic, and `/api/events` as raw `json.dumps`.
   Typing it as a datetime makes pydantic re-serialise to `…Z` on one path while
   SSE keeps emitting `…+00:00`, which defeats `warning-feed.ts`'s dedupe on that
   exact field.

## The direction rule these encode

`Lenient` is for bytes coming **in** from someone else's API. `Wire` is for bytes
going **out** to our own browser. `Strict` is for records that never leave the
process. The ingest layer's fail-soft rule is for data we do not control; this is
data we do.
"""

import sys
import typing
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pydantic import ValidationError  # noqa: E402

from waterline import models  # noqa: E402
from waterline.models import (  # noqa: E402
    CameraStatus,
    Lenient,
    Level,
    MoodEvent,
    Observation,
    SpeakEvent,
    Strict,
    Wire,
)

AWARE = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)
NAIVE = datetime(2026, 8, 5, 12, 0)

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


def rejects(build) -> bool:
    """Whether a model refuses this input. Never lets the exception escape —
    a raise here would take the script down before the report prints."""
    try:
        build()
        return False
    except (ValidationError, TypeError, ValueError):
        return True


def camera_status(**over):
    base = dict(
        camera_id="c", name="n", lat=40.7, lon=-73.9, image_url="http://x",
        observed_at=AWARE, depth_mm=None, sensor_id=None,
        nws_active=False, calibrated=False, nta=None,
        depth_plausible=True,
    )
    base.update(over)
    return CameraStatus(**base)


# --- the three base classes carry the three different rules ----------------
check("Wire forbids extras", Wire.model_config.get("extra"), "forbid")
check("Lenient allows them", Lenient.model_config.get("extra"), "allow")
check("Strict forbids them too", Strict.model_config.get("extra"), "forbid")
# ⚠️ Not frozen on Wire: these are built once and serialised, never mutated.
# Strict IS frozen, because those records travel through the decision layer.
check("Strict is frozen", Strict.model_config.get("frozen"), True)
check("and Wire deliberately is not", Wire.model_config.get("frozen"), None)


class _W(Wire):
    a: int


class _L(Lenient):
    a: int


check("an undeclared key on a Wire model RAISES rather than being dropped",
      rejects(lambda: _W(a=1, undeclared="x")), True)
# ⚠️ The other half, and it is the whole direction rule: upstream schemas change
# without warning and a hard validation failure at 9pm is not a trade worth
# making. `except (TypeError, ValueError): continue` already ate 479 sensors once.
check("but an undeclared key from UPSTREAM is kept",
      _L(a=1, undeclared="x").a, 1)
check("and does not raise", rejects(lambda: _L(a=1, undeclared="x")), False)

# Every response model must inherit the forbid rule rather than re-declaring it.
wire_models = [
    v for v in vars(models).values()
    if isinstance(v, type) and issubclass(v, Wire) and v is not Wire
]
check("there are response models to check", len(wire_models) > 10, True)
check("and every one of them forbids extras",
      [m.__name__ for m in wire_models
       if m.model_config.get("extra") != "forbid"], [])

# --- timestamps must carry a zone -----------------------------------------
# ⚠️ A naive timestamp reaching the browser is a five-hour error in New York.
# This turns it into a 500 in our logs instead of a wrong number on a phone.
check("a naive datetime is REFUSED by a wire timestamp",
      rejects(lambda: camera_status(observed_at=NAIVE)), True)
check("an aware one is accepted",
      camera_status(observed_at=AWARE).observed_at, AWARE)
check("and an offset string is accepted and normalised",
      camera_status(observed_at="2026-08-05T08:00:00-04:00")
      .observed_at.astimezone(timezone.utc), AWARE)
check("while an offsetless STRING is refused too",
      rejects(lambda: camera_status(observed_at="2026-08-05T12:00:00")), True)

# Every `AwareDatetime` field across the contract, found rather than listed, so a
# new one cannot be added as a bare `datetime` without this noticing.
aware_fields = []
for m in wire_models:
    for fname, finfo in m.model_fields.items():
        ann = str(finfo.annotation)
        if "datetime" in ann and "AwareDatetime" not in ann and "str" not in ann:
            aware_fields.append(f"{m.__name__}.{fname}")
check("no wire model declares a BARE datetime", aware_fields, [])

# --- the poller's heartbeat block -----------------------------------------
# ⚠️ **Every field on `PollWrites` is nullable and the block's PRESENCE is the
# signal.** Three absences with three different meanings ride on that — an older
# server (block absent), a read that failed (block null), and *no poller has ever
# ticked in this mode* (block present, `tick_at` null). Tightening any field to
# non-null collapses the third into a 500, and the third is the one that made a
# bare `uvicorn` run legible instead of silently empty.
pw = models.PollWrites
check("PollWrites accepts an all-null row",
      pw(tick_at=None, tick_ok=None, readings=None, stored=None,
         last_store_at=None).tick_at,
      None)
check("and a full one round-trips",
      pw(tick_at=AWARE, tick_ok=True, readings=390, stored=388,
         last_store_at=AWARE).stored,
      388)
for _f in ("tick_at", "tick_ok", "readings", "stored", "last_store_at"):
    check(f"PollWrites.{_f} is nullable",
          type(None) in getattr(pw.model_fields[_f].annotation, "__args__", ()),
          True)
# The naive-timestamp rule, on the two fields an age is computed from.
check("PollWrites refuses a naive tick_at",
      rejects(lambda: pw(tick_at=NAIVE, tick_ok=True, readings=0, stored=0,
                         last_store_at=None)),
      True)
check("and a naive last_store_at",
      rejects(lambda: pw(tick_at=AWARE, tick_ok=True, readings=0, stored=0,
                         last_store_at=NAIVE)),
      True)
# ⚠️ A renamed field here is a silent hole: `messages.ts` reads `last_store_at`
# by name, and `extra="forbid"` means the server would 500 rather than drop it —
# but only if something constructs the model. This is that something.
check("PollWrites declares exactly the five heartbeat fields",
      sorted(pw.model_fields),
      ["last_store_at", "readings", "stored", "tick_at", "tick_ok"])
check("HealthResponse carries the block, nullable",
      "writes" in models.HealthResponse.model_fields, True)
# ⚠️ `last_tick_at` STAYS beside it. It is the fallback for a database where
# `poll_ticks` does not exist yet, and dropping it makes that state unreadable.
check("and keeps last_tick_at beside it",
      "last_tick_at" in models.HealthResponse.model_fields, True)

# --- the two-transport fields stay strings --------------------------------
# ⚠️ `at` goes out over HTTP through pydantic AND over SSE as raw `json.dumps`.
# One format across both transports is what lets `warning-feed.ts` dedupe on it.
check("SpeakEvent.at is a str", SpeakEvent.model_fields["at"].annotation, str)
check("MoodEvent.at is a str", MoodEvent.model_fields["at"].annotation, str)

# ⚠️ **Neither event model declares `replay`, and that is correct.**
# `rat.recent()` returns a COPY with the flag, on the SSE path only, which no
# `response_model` touches. Declaring it here would put `"replay": false` into
# every drill response — a new key describing a path that cannot produce it.
check("SpeakEvent does not declare `replay`",
      "replay" in SpeakEvent.model_fields, False)
check("nor does MoodEvent", "replay" in MoodEvent.model_fields, False)

# --- the watch surface carries no reading ---------------------------------
# ⚠️ `silent` is a BOOLEAN and may never become an age. The server holds the
# timestamp and reduces it in the route, precisely so no amount of work in
# `watch-panel.tsx` can put "47 minutes ago" beside an instrument name — that is
# a reading, and a reading there arrives without the plausibility and freshness
# idiom every other number on the page carries.
ref = models.WatchSensorRef
check("WatchSensorRef.silent is a bool", ref.model_fields["silent"].annotation, bool)
check("WatchSensorRef.alert_permitted is a bool",
      ref.model_fields["alert_permitted"].annotation, bool)
# The same rule one level up: a coverage FRACTION would be a reading too.
check("citywide_silence is a bool",
      models.WatchSubscriptionResponse.model_fields["citywide_silence"].annotation,
      bool)

# Nothing on that surface may carry a depth, an age or a reading of any kind.
BANNED = ("depth_mm", "observed_at", "severity", "last_seen_at", "age_s",
          "plausible", "depth")
for m in (models.WatchSensorRef, models.WatchSettings,
          models.WatchSubscriptionResponse,
          models.WatchSubscribeResponse, models.WatchConfirmResponse,
          models.WatchResendResponse, models.WatchUnsubscribeResponse):
    check(f"{m.__name__} renders no reading",
          [f for f in m.model_fields if f in BANNED], [])

# ⚠️ **Tombstones.** A camera measures nothing here, so `CameraStatus` carries
# no judgement of its own — no ordinal class, no confidence, no depth estimate.
# The estimate was the dangerous one: a segmentation mask against a drawn
# reference line, in centimetres, indistinguishable from a calibrated
# millimetre to every consumer downstream. These fail if any of the four comes
# back on the wire.
for _gone in ("severity", "severity_label", "confidence", "vision_estimate_cm"):
    check(f"CameraStatus carries no `{_gone}`",
          _gone in CameraStatus.model_fields, False)
# `WatchCameraRef` went with the camera watch. A wire shape nothing sends is a
# contract claiming something the server does not do.
check("there is no WatchCameraRef", hasattr(models, "WatchCameraRef"), False)
check("and no WatchSubscriptionResponse.cameras",
      "cameras" in models.WatchSubscriptionResponse.model_fields, False)
# `StatusResponse` lost its alert list with the on-page alert system.
check("StatusResponse carries no alerts",
      "alerts" in models.StatusResponse.model_fields, False)

# --- the level enum --------------------------------------------------------
check("the levels are exactly four",
      [l.value for l in Level], ["clear", "watch", "warning", "emergency"])
check("and their ranks are ordered",
      [l.rank for l in Level], sorted(l.rank for l in Level))
# These four strings are duplicated in `web/src/lib/levels.ts` as an exhaustive
# Record, where `tsc` enforces coverage. A member added here and not there
# fails `next build`.

# --- Observation is Strict, and frozen -------------------------------------
obs = Observation(camera_id="c", observed_at=AWARE)
check("Observation refuses an undeclared field",
      rejects(lambda: Observation(camera_id="c", observed_at=AWARE, oops=1)), True)


def _mutate():
    obs.depth_mm = 40.0


check("and cannot be mutated after construction", rejects(_mutate), True)
# ⚠️ Frozen matters here specifically: an `Observation` is what
# `escalation.level_for` decides on, and a caller mutating one after the decision
# would make the record and the decision disagree.
check("its defaults are the SAFE ones — no depth, nothing active",
      (obs.depth_mm, obs.nws_active, obs.flood_detected),
      (None, False, False))

# ⚠️ **`depth_plausible` defaults to True, which is the PERMISSIVE direction**,
# and that is worth pinning rather than assuming. `_depth_is_credible` demands a
# second witness only when it is False, so a caller that forgets to set it gets
# the *looser* gate. That is safe today for one reason: the only path that builds
# an `Observation` with a depth is `poll.tick`, which sets it from
# `floodnet`'s band explicitly. It stops being safe the moment a second producer
# appears, so this assertion is here to be argued with rather than to be green.
check("depth_plausible defaults to True — the permissive side of the gate",
      Observation.model_fields["depth_plausible"].default, True)
check("and a bare Observation carries that default",
      Observation(camera_id="c", observed_at=AWARE).depth_plausible, True)

# --- the NWS block: two timestamps, and no verdict -------------------------
# ⚠️ `checked_at` and `attempted_at` are the whole reason this model exists
# rather than a bare `list[NwsAlert]`. *We asked and nothing was active* and *we
# could not ask* both arrive as an empty list and mean opposite things, and a
# UI handed one field cannot tell a reader which it is holding.
#
# Asserted as BEHAVIOUR rather than as an annotation string: the sweep above
# already reads the types, and what actually matters is that a naive value is
# refused at the boundary. Both are nullable, and null is the cold-start answer
# the UI has to be able to say out loud.
def _nws(**kw):
    return models.NwsStatus(**{
        "checked_at": None, "attempted_at": None, "reachable": True,
        "alerts": [], "elsewhere": 0, **kw})


for field in ("checked_at", "attempted_at"):
    check(f"NwsStatus.{field} refuses a naive datetime",
          rejects(lambda f=field: _nws(**{f: NAIVE})), True)
    check(f"NwsStatus.{field} accepts null — the cold-start answer",
          getattr(_nws(**{field: None}), field), None)

check("NwsStatus refuses an undeclared field",
      rejects(lambda: _nws(all_clear=True)), True)

# ⚠️ **The load-bearing one.** `severity` is NWS's word and it may travel; a
# field saying an alert *counts* may not, because that judgement is
# `feeds.is_witness_alert` and a wire field inviting a surface that marks the
# ones that matter is this page ranking somebody else's warnings.
for banned in ("credible", "witness", "is_witness", "corroborat", "safe", "clear"):
    check(f"no NwsAlert field named for {banned!r}",
          any(banned in f for f in models.NwsAlert.model_fields), False)
    check(f"no NwsStatus field named for {banned!r}",
          any(banned in f for f in models.NwsStatus.model_fields), False)

# The display fields reached `WeatherAlert` and must not have reached the record
# `escalation.level_for` decides on. Same shape as `check_escalation.py`'s
# "`Observation` carries no field one could arrive through".
for banned in ("same_codes", "area_desc", "severity", "headline", "urgency"):
    check(f"Observation carries no {banned!r}", banned in Observation.model_fields, False)
check("the second witness is still ONE boolean on Observation",
      Observation.model_fields["nws_active"].annotation, bool)

# --- the camera registry: a tier crosses, a distance does not --------------
# ⚠️ **The classification is the whole shape of this route's safety.**
# `cameras.pair_tier` is the single authority, exactly as `alert_permitted` is
# for the alert gate: `db.camera_registry` returns the raw `distance_m` and
# `api.camera_registry` puts it through that function. What crosses is a
# classified string.
check("CameraEntry.tier is exactly {paired, near, unpaired}",
      set(typing.get_args(models.CameraEntry.model_fields["tier"].annotation)),
      {"paired", "near", "unpaired"})

# ⚠️ **THE ASSERTION THAT CATCHES A REVERT.** *Never colour a distance* is a
# Never bullet, and its argument — reddening with distance is a severity ramp
# built out of coverage — binds any monotone ramp over distance, not only hue.
# A UI handed 968 raw distances is one commit from printing one beside a camera
# name or sorting a list on it. The field is absent on purpose.
check("CameraEntry declares no distance_m",
      "distance_m" in models.CameraEntry.model_fields, False)
# ⚠️ The substring list is deliberately about DISTANCE and not about units —
# `depth_mm` is a millimetre and is exactly what this route is for. What may not
# arrive is how far apart the two instruments are.
for banned in ("distance", "metre", "meters", "proximity", "near_m"):
    check(f"no CameraEntry field named for {banned!r}",
          any(banned in f for f in models.CameraEntry.model_fields), False)

# ⚠️ **`depth_observed_at`, never `observed_at`, and the NAME is the safeguard.**
# This is FloodNet's publication clock — `sensorFreshnessOf`, 1h/3h — and
# `CameraStatus.observed_at` is OUR poller's tick — `freshnessOf`, 5m/30m.
# Judging one against the other's thresholds already shipped once, when three of
# four healthy USGS gauges rendered amber on first load. A field called
# `observed_at` here is that mistake's door.
check("CameraEntry carries depth_observed_at",
      "depth_observed_at" in models.CameraEntry.model_fields, True)
check("...and NOT a bare observed_at",
      "observed_at" in models.CameraEntry.model_fields, False)

# The registry answers about every camera, so absence has to be expressible on
# every field a camera may not have. `depth_plausible` is the exception and is
# `true` when there is no depth — absence has no plausibility to doubt.
check("CameraEntry.depth_plausible is a plain bool, never a third state",
      models.CameraEntry.model_fields["depth_plausible"].annotation, bool)

# `SensorsResponse`' rule, and here it is load-bearing rather than tidy: the
# browser filters these rows, so the browser is the only thing that can say
# "130 of 968 are drawn". A count beside the rows would be a second place for
# that number to be computed and to disagree with the marks underneath it.
check("CameraRegistryResponse carries rows and nothing else",
      set(models.CameraRegistryResponse.model_fields), {"cameras"})

# ⚠️ **`subscribe` has TWO answers since 2026-08-16 and it may not grow a
# third without somebody editing this line.** `confirmed` is reachable only for
# a caller who proved the address — `api._verified_session` plus an
# `email_verified` claim equal to the request — and every other caller still
# gets `pending`, byte for byte. A third state would be a third thing the
# response can tell a caller about a row they may not own, which is exactly what
# the identical-answer property exists to prevent. The literal set is the whole
# of what a check script can hold here; the branch itself needs a database, a
# network and a token signed by somebody else.
check("WatchSubscribeResponse.status is exactly {pending, confirmed}",
      set(typing.get_args(
          models.WatchSubscribeResponse.model_fields["status"].annotation)),
      {"pending", "confirmed"})

# ⚠️ **Optional, and absence is the safe direction**: a client that sees no
# token simply offers no shortcut link. Required, every `pending` response would
# have to carry a bearer credential or fail validation.
check("WatchSubscribeResponse.manage_token is not required",
      models.WatchSubscribeResponse.model_fields["manage_token"].is_required(),
      False)

# ⚠️ **The token may not spread.** `confirm` and `subscribe` are the only two
# responses allowed to carry it, and both hand it to somebody who has just
# proved they hold the mailbox. A third wire shape carrying it is a third place
# a non-expiring bearer credential leaves this server.
for name in ("WatchSubscriptionResponse", "WatchResendResponse",
             "WatchUnsubscribeResponse"):
    check(f"{name} carries no manage_token",
          "manage_token" in getattr(models, name).model_fields, False)

if failures:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

print("model contract OK")
