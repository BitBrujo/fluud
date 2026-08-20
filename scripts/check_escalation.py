#!/usr/bin/env python3
"""Assert the escalation safety contract. No database, no network, no pytest.

    python3 scripts/check_escalation.py

`escalation.py` and `agent.py` are pure by design, and `waterline/CLAUDE.md`
justifies that purity by saying the whole safety contract can be checked "in a
few asserts with no database and no network". This is those asserts. It is a
script rather than a test suite because the repo has no test dependency and this
does not need one — it imports the module and calls functions.

The centre of it is **LIMITATIONS §11**, the phantom-flood gate. On a clear day
with no NWS alert anywhere in the state, four FloodNet sensors reported 666 to
1458 mm — up to 4.8 feet of standing water — all faulted rangefinders, all with
FloodNet's own `flood_detected` false. A bare `depth >= 10mm` rule fires four
EMERGENCY alerts in that weather. Crying wolf is how the next real warning gets
ignored.

The gate now takes **three** witnesses — FloodNet's own `flood_detected`, an
active NWS alert, and a tidal sensor under a harbor above minor flood stage.
There was a fourth, a camera seeing water, and it went when the
water-segmentation layer was deleted. The whole 16-combination grid is asserted
below rather than four hand-picked cases, so a witness coming back fails here.
The phantom readings are checked against the tidal one explicitly, because
widening a gate can only ever produce *more* alerts.

The second change is the plausibility **floor**. `plausible` had a ceiling and
no floor, so a sensor reporting a large negative depth was called believable —
including the -466mm MEASUREMENTS.md names as the worse of the two faults
visible on screen. `floodnet.IMPLAUSIBLE_MIN_MM` closes that, and the assertions
below establish the property that matters: the change cannot alter a single
alerting decision, because every affected reading is below the flood threshold
at *both* plausibility verdicts. That is checked rather than argued.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from waterline.escalation import (  # noqa: E402
    _depth_is_credible,
    level_for,
    transition,
)
from waterline.models import (  # noqa: E402
    Level,
    Observation,
    Sensor,
)

# The four readings from the 2026-08-04 incident, in mm. All non-tidal.
PHANTOM = [786.0, 1458.0, 666.0, 995.0]

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


def obs(**kw) -> Observation:
    base = dict(camera_id="c", observed_at=datetime.now(timezone.utc))
    base.update(kw)
    return Observation(**base)


# --- a camera contributes NO judgement, and the shape is the enforcement ---
#
# ⚠️ **Structural assertions, and they are the whole of it.** A camera used to
# produce an ordinal class, a confidence and a depth estimate in centimetres,
# and the estimate — a segmentation mask measured against a drawn reference
# line — was indistinguishable from a calibrated millimetre to everything
# downstream. That layer is deleted. What keeps it deleted is that
# `escalation.level_for` takes an `Observation` and `Observation` has no field
# any of it could arrive through.
#
# The check is on the model shape rather than on a behaviour because there is
# no behaviour to vary: a re-added field would fail nothing at all here, and
# `level_for` would keep passing every assertion in this file while a guess
# moved an alert level.
_OBS_FIELDS = set(Observation.model_fields)
check(
    "Observation carries no estimate field for escalation to read",
    sorted(f for f in _OBS_FIELDS if "estimate" in f),
    [],
)
# The depth escalation reads is millimetres and only millimetres. A `_cm` field
# here would be the same number arriving in a unit nothing downstream converts.
check(
    "Observation's only depth is depth_mm",
    sorted(f for f in _OBS_FIELDS if "depth" in f),
    ["depth_mm", "depth_plausible"],
)
# No ordinal class either. The two are separate assertions because they were
# separate fields, and a re-wire is likelier to bring back one than both.
check(
    "Observation carries no camera judgement",
    sorted(
        f for f in _OBS_FIELDS
        if f in {"severity", "vision_confidence", "confidence"}
    ),
    [],
)


# --- an implausible depth needs an independent second witness --------------
for mm in PHANTOM:
    faulted = dict(depth_mm=mm, depth_plausible=False)

    check(
        f"phantom {mm}mm alone is not credible",
        _depth_is_credible(obs(**faulted)),
        False,
    )
    # The witness is gated on `tidal`. These four sensors are not tidal, so a
    # high harbor must not rescue them — this is the assertion the harbor
    # baseline exists to not break.
    check(
        f"phantom {mm}mm stays rejected when the harbor is high but the sensor is not tidal",
        _depth_is_credible(obs(**faulted, tidal=False, harbor_above_flood=True)),
        False,
    )
    check(
        f"phantom {mm}mm stays rejected for a tidal sensor when the harbor is normal",
        _depth_is_credible(obs(**faulted, tidal=True, harbor_above_flood=False)),
        False,
    )
    # Both halves true is the one case that passes, and it is a real coastal
    # surge: the same water reaching two independent instruments.
    check(
        f"phantom {mm}mm IS credible for a tidal sensor under a high harbor",
        _depth_is_credible(obs(**faulted, tidal=True, harbor_above_flood=True)),
        True,
    )
    # The three pre-existing witnesses are unchanged.
    check(
        f"{mm}mm credible on FloodNet's own flood_detected",
        _depth_is_credible(obs(**faulted, flood_detected=True)),
        True,
    )
    check(
        f"{mm}mm credible under an active NWS alert",
        _depth_is_credible(obs(**faulted, nws_active=True)),
        True,
    )

# --- the witness set, exhaustively ----------------------------------------
#
# ⚠️ **The rule as a truth table rather than as four hand-picked cases.** There
# were four witnesses and now there are three: the camera seeing water went with
# the water-segmentation layer. Asserting the whole grid is what makes "a fourth
# witness came back" fail here rather than pass quietly — a hand-picked set
# tests the witnesses somebody thought of.
#
# Only the implausible half is a grid. Inside the band the sensor is trusted on
# its own and no witness is consulted at all, which is asserted below.
for _flood in (False, True):
    for _nws in (False, True):
        for _tidal in (False, True):
            for _harbor in (False, True):
                want = _flood or _nws or (_tidal and _harbor)
                check(
                    f"witnesses flood={_flood} nws={_nws} tidal={_tidal} "
                    f"harbor={_harbor}",
                    _depth_is_credible(obs(
                        depth_mm=900.0,
                        depth_plausible=False,
                        flood_detected=_flood,
                        nws_active=_nws,
                        tidal=_tidal,
                        harbor_above_flood=_harbor,
                    )),
                    want,
                )

# End to end: the level, not just the gate.
check(
    "non-tidal phantom under a high harbor stays CLEAR",
    level_for(obs(depth_mm=1458.0, depth_plausible=False,
                  tidal=False, harbor_above_flood=True)),
    Level.CLEAR,
)
check(
    "tidal sensor under a high harbor reaches EMERGENCY at 1458mm",
    level_for(obs(depth_mm=1458.0, depth_plausible=False,
                  tidal=True, harbor_above_flood=True)),
    Level.EMERGENCY,
)

# --- plausible depths are untouched by any of this -------------------------
check("no depth is not credible", _depth_is_credible(obs()), False)
check("plausible 40mm needs no witness", _depth_is_credible(obs(depth_mm=40.0)), True)
check("0mm is CLEAR", level_for(obs(depth_mm=0.0)), Level.CLEAR)
check("40mm is WARNING", level_for(obs(depth_mm=40.0)), Level.WARNING)
check("200mm is EMERGENCY (above curb)", level_for(obs(depth_mm=200.0)), Level.EMERGENCY)

# --- NWS raises to WATCH here, and to nothing at all in `watch.py` ---------
check(
    "an NWS alert raises a dry reading to WATCH",
    level_for(obs(depth_mm=0.0, nws_active=True)),
    Level.WATCH,
)
check(
    "an NWS alert cannot lower a depth-driven EMERGENCY",
    level_for(obs(depth_mm=200.0, nws_active=True)),
    Level.EMERGENCY,
)

# --- harbor context alone never raises anything ----------------------------
# The harbor is not an alarm. It corroborates a depth or it does nothing.
check(
    "a high harbor alone raises nothing",
    level_for(obs(tidal=True, harbor_above_flood=True)),
    Level.CLEAR,
)

# --- monotonic up, slow down -----------------------------------------------
running = {"level": "warning", "clear_streak": 0, "peak_depth_mm": 40.0}
action, level, _ = transition(obs(depth_mm=0.0), running)
check("a clear reading mid-episode holds rather than dropping", action, "hold")
check("and the level does not walk back down", level, Level.WARNING)

action, level, _ = transition(obs(depth_mm=200.0), running)
check("a worse reading escalates", action, "escalate")
check("to the higher level", level, Level.EMERGENCY)

action, _, _ = transition(obs(depth_mm=0.0), {**running, "clear_streak": 4})
check("the fifth consecutive clear reading closes the episode", action, "close")

# --- the plausibility band gained a FLOOR, and it had to be provably safe --
# `plausible` was `depth < IMPLAUSIBLE_MM` with no lower bound, so a sensor
# reporting a large NEGATIVE depth was called believable. MEASUREMENTS.md
# names -466mm at Northern Blvd @ Bell Blvd as the worse of the two faults it
# could see on screen; measured again on 2026-08-05, the live negatives were
# -263mm and -1236mm. `floodnet.IMPLAUSIBLE_MIN_MM` now rejects them.
#
# ⚠️ The claim that needs asserting is not "the new behaviour is right" — it is
# that **changing this cannot change one alerting decision**, in either
# direction. It cannot, because `level_for` only ever raises a level at
# `depth_mm >= flood_event_mm` and every one of these numbers is below zero. So
# each is checked at BOTH plausibility verdicts: the one the old code gave it
# and the one the new code gives it. Same answer, so the widening is provably
# inert rather than argued to be.
from waterline import floodnet  # noqa: E402
from waterline.config import settings  # noqa: E402

NEGATIVE_FAULTS = [-466.0, -263.0, -1236.0, -5773.0]

for mm in NEGATIVE_FAULTS:
    check(
        f"{mm}mm is CLEAR when called plausible (the OLD verdict)",
        level_for(obs(depth_mm=mm, depth_plausible=True)),
        Level.CLEAR,
    )
    check(
        f"{mm}mm is CLEAR when called implausible (the NEW verdict)",
        level_for(obs(depth_mm=mm, depth_plausible=False)),
        Level.CLEAR,
    )
    # And it stays CLEAR even with every witness the credibility gate accepts,
    # because credibility decides whether a depth is USED, not what it means. A
    # corroborated nonsense reading is still below the flood threshold.
    check(
        f"{mm}mm is CLEAR even fully corroborated",
        level_for(obs(depth_mm=mm, depth_plausible=False, flood_detected=True,
                      nws_active=False, tidal=True, harbor_above_flood=True)),
        Level.CLEAR,
    )

# The floor must sit below the ceiling, and the flood threshold must sit
# strictly between them. If the band ever closed over `flood_event_mm`, every
# real flood reading would be judged a fault and the gate would be unreachable —
# a silent, total loss of the depth signal.
check(
    "the plausibility band is ordered: floor < flood threshold < ceiling",
    (floodnet.IMPLAUSIBLE_MIN_MM
     < settings.flood_event_mm
     < floodnet.IMPLAUSIBLE_MM),
    True,
)
check(
    "and the curb-height threshold is inside it too",
    floodnet.IMPLAUSIBLE_MIN_MM < settings.curb_height_mm < floodnet.IMPLAUSIBLE_MM,
    True,
)

# --- `alert_permitted` is the one authority for the alert-permitted rule ----------------
# Extracted so `/api/sensors` can report the 343-count without re-implementing
# the predicate in SQL. `should_alert` must keep delegating to it exactly, or
# the wire and the poll loop disagree about which sensors may alarm.
for visible in (True, False):
    for status in ("good", "ok", "active", "low_charge", "dead", "unknown", ""):
        want = visible and status in floodnet.HEALTHY_STATUS
        check(
            f"alert_permitted(visible={visible}, status={status!r})",
            floodnet.alert_permitted(visible, status),
            want,
        )
        check(
            f"should_alert agrees for (visible={visible}, status={status!r})",
            floodnet.should_alert(
                Sensor(sensor_id="s", lat=0.0, lon=0.0,
                       alert_visible=visible, status=status)
            ),
            want,
        )
check(
    "a null status is not healthy",
    floodnet.alert_permitted(True, None),
    False,
)

# --- the witness expires ---------------------------------------------------
# Not an escalation property, but the thing that stops a dead gauge testifying
# forever. Checked here because it is the same safety argument.
from waterline import gauges  # noqa: E402

check(
    "the harbor witness expires within the hour",
    gauges.WITNESS_MAX_AGE <= timedelta(hours=1),
    True,
)
check(
    "the Battery has a published threshold",
    gauges.BY_ID[gauges.BATTERY].minor_flood_ft is not None,
    True,
)
check(
    "no USGS site invents one",
    [g.gauge_id for g in gauges.GAUGES
     if g.network == "usgs" and g.minor_flood_ft is not None],
    [],
)
# The datum conversion, pinned. 10.19 ft STND - 3.29 ft (MLLW above STND).
check(
    "the Battery minor-flood stage is the CONVERTED MLLW figure, not the published STND one",
    gauges.BY_ID[gauges.BATTERY].minor_flood_ft,
    6.90,
)


# --- the warning is written ONCE, however it is delivered ------------------
# `warning_text` was split so the sensor-watch path could reach the reviewed
# sentences without inventing an `Observation` it has no camera for. The split
# is only safe if it is an identity: the moment the two produce different words
# there are two warnings to review and one of them is the one that goes to an
# inbox at three in the morning, unread by anybody.
#
# Asserted over the whole grid rather than spot-checked, because the failure
# would be a single level or a single language quietly diverging.
from waterline import agent  # noqa: E402

# ⚠️ The grid gained a SEED dimension when the level keys gained variants.
# `SEEDS` starts with `""`, so the original 64 cells are still asserted with
# byte-identical inputs and the rest are new.
#
# This is the assert that catches the tempting mistake of having `warning_text`
# derive a seed from the observation it is handed — `obs.camera_id` is right
# there. That would break the identity ONLY on the sensor-watch path, which is
# the one with no camera and the one whose words go to an inbox rather than to a
# screen somebody is already looking at.
SEEDS = ["", "alert:1", "alert:2", "alert:97", "episode:1", "episode:412", "drill"]

for lang in agent.SUPPORTED:
    for lvl in Level:
        for mm in (None, 0.0, 10.0, 25.3, 25.4, 40.0, 150.0, 200.0):
            for seed in SEEDS:
                check(
                    f"warning_text delegates unchanged "
                    f"({lang}, {lvl.value}, {mm}, {seed!r})",
                    agent.warning_text(
                        lvl, obs(depth_mm=mm), "Ave C @ 23 St", lang, seed=seed
                    ),
                    agent.warning_text_for_depth(
                        lvl, mm, "Ave C @ 23 St", lang, seed=seed
                    ),
                )

# Every language carries every key, or a half-added template renders a KeyError
# in front of somebody at the worst possible moment. Free enforcement the repo
# did not have until the mail envelope doubled the number of keys.
check(
    "en and es define exactly the same template keys",
    sorted(agent._TEMPLATES["en"]),
    sorted(agent._TEMPLATES["es"]),
)
check(
    "every supported language is actually present",
    [l for l in agent.SUPPORTED if l not in agent._TEMPLATES],
    [],
)
check(
    "and no language is scaffolded and shipped at the same time",
    [l for l in agent.PENDING_REVIEW if l in agent._TEMPLATES],
    [],
)

# ⚠️ **`_depth_phrase` was English-only for the whole life of the mail envelope**,
# so the Spanish `warning` read *"Hay agua en la calle en Ave C @ 23 St. about 2
# inches."* — the one clause carrying the actual number, in the wrong language,
# mid-sentence. The key-parity assert above did NOT catch it and could not: both
# keys were present, and the English was hard-coded inside the function.
#
# It was found by rendering every template in both languages and READING them,
# which is the check no assertion in this repo makes. This is the mechanical
# half — it cannot judge a translation, only say the two languages are not the
# same bytes, which is exactly the failure that happened.
#
# ⚠️ **`unknown_depth` is in this list on purpose.** It was localised correctly
# the whole time, and that is *why* the bug survived: the absence case read
# properly and the present case did not, so a spot-check of the empty-depth
# template found nothing wrong. Checking all three keeps the pair honest.
for key in ("depth_mm_phrase", "depth_in_phrase", "unknown_depth"):
    check(
        f"{key} is localised rather than hard-coded English",
        agent._TEMPLATES["en"][key] != agent._TEMPLATES["es"][key],
        True,
    )

# And end to end, through the renderer: a Spanish warning at a depth must not
# carry the English measurement clause.
for mm, marker in ((40.0, "inches"), (10.0, "millimeters"), (150.0, "inches")):
    for lvl in (Level.WARNING, Level.EMERGENCY):
        rendered = agent.warning_text_for_depth(lvl, mm, "Ave C @ 23 St", "es")
        en_clause = agent._depth_phrase(mm, agent._TEMPLATES["en"])
        check(
            f"the es {lvl.value} at {mm}mm does not carry the EN depth clause",
            en_clause in rendered,
            False,
        )

# --- the copy has VARIANTS now, and the pick is a HASH, never a draw --------
# `random.choice` here breaks three things and only the first shows up in a test
# run: the delegation grid above goes flaky; `poll._queue_watch` renders once
# PER SUBSCRIBER, so five people watching one episode get five different
# sentences, none of them the one on the page; and `alerts.message_en` is
# persisted while `/api/speak` re-renders from that row minutes later, so the
# stored warning and the live warning drift apart.
#
# The objection in one line: *"Math.random() here would be a bug that looks like
# a feature"* — it passes every casual read and fails only in production, per
# subscriber, silently.
from string import Formatter  # noqa: E402

# What each level's copy is ALLOWED to say and MUST say. Written out rather than
# derived from variant 0, because variant 0 is exactly as likely to be the wrong
# one.
LEVEL_SLOTS = {
    Level.WATCH: {"place"},
    Level.WARNING: {"place", "depth"},
    Level.EMERGENCY: {"place", "depth"},
}

PLACES = [
    "Ave C @ 23 St", "Northern Blvd @ Bell Blvd", "Flatbush Ave @ Tillary St",
    "Grand Concourse @ E 161 St", "Richmond Ter @ Bay St", "Queens Blvd @ 63 Dr",
    "Broadway @ W 145 St", "Atlantic Ave @ Bedford Ave",
]
SWEEP = [f"alert:{i}" for i in range(1, 501)]


def slots(s: str) -> set:
    """The `{...}` field names in a template.

    ⚠️ **Returns a sentinel rather than raising on a malformed string.**
    `Formatter().parse` throws `ValueError: Single '{' encountered` on a lone
    brace — which is exactly what a *character* looks like when the shape check
    below has already failed and the loops are iterating a string one letter at
    a time. Left to raise, it takes the whole script down at this line and the
    operator sees a brace-parsing error instead of the named assertion that
    already knows what is wrong. Measured: the tuple check fires correctly and
    its report never prints, because `check()` accumulates and this crashes
    first.
    """
    try:
        return {f for _, f, _, _ in Formatter().parse(s) if f is not None}
    except ValueError:
        return {"<unparseable>"}


# ⚠️ **A MISSING COMMA MAKES A TUPLE A STRING**, and nothing downstream raises.
# Measured: with the comma dropped from a one-element tuple, `emergency` became
# a 161-character `str` whose `[0]` is `'W'` — indexable, with a length, so
# `variants()` reported 161 of them and a subscriber would have been sent `W`.
# It is one copy edit away for the life of this file.
#
# ⚠️ **The OTHER form is the comma lost BETWEEN two variants**, which is not a
# type error at all: Python's implicit concatenation silently welds them into
# one sentence and the count drops by one. That is invisible to `isinstance` and
# is caught by the en/es count parity below — which is the real reason that
# assertion earns its keep, beyond keeping the two languages level.
SHAPE_OK = True
for lang in agent.SUPPORTED:
    for key in agent.LEVEL_KEYS:
        v = agent._TEMPLATES[lang][key]
        ok = isinstance(v, tuple)
        SHAPE_OK = SHAPE_OK and ok
        check(f"{lang}/{key} is a tuple of variants, not a bare string", ok, True)
        check(f"{lang}/{key} has at least one variant", len(v) >= 1, True)
        check(f"{lang}/{key} holds only strings",
              [i for i, x in enumerate(v) if not isinstance(x, str)], [])

check(
    "en and es agree about WHICH keys hold variants",
    [k for k in agent._TEMPLATES["en"]
     if type(agent._TEMPLATES["en"][k]) is not type(agent._TEMPLATES["es"][k])],
    [],
)

# ⚠️ Everything past here iterates the variants, so it is meaningless — and
# noisy — once the shape is wrong. Bail to the report instead, which now names
# the actual defect rather than burying it under a hundred derived failures
# about single characters.
if not SHAPE_OK:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

# ⚠️ **Equality, not superset, and `str.format` is the whole reason.**
# `warning_text_for_depth` always passes BOTH `place=` and `depth=`, so:
#   · a stray `{depth}` in a WATCH variant does not raise — it renders "about 2
#     inches" inside the one sentence whose entire claim is that there is
#     nothing on the street yet;
#   · a MISSING `{place}` does not raise either — it silently drops the
#     intersection out of a warning about an intersection;
#   · only a TYPO raises.
# A superset check catches the typo and neither of the two silent ones.
SLOTS_OK = True
for lang in agent.SUPPORTED:
    for lvl, want in LEVEL_SLOTS.items():
        for i, text in enumerate(agent.variants(lvl, lang)):
            got = slots(text)
            SLOTS_OK = SLOTS_OK and got == want
            check(f"{lang}/{lvl.value} variant {i} carries exactly {sorted(want)}",
                  got, want)

# ⚠️ Same gate as the shape one above, for the same reason and a different
# failure. A TYPO'd slot is the one slot defect that raises: every assertion
# past here RENDERS, and `"{plce}".format(place=…)` is a bare
# `KeyError: 'plce'` out of `agent.py` that takes the script down before the
# named assertion two lines up ever prints. Measured — it crashed in the purity
# grid, which is nowhere near the copy and reads like a bug in the checker.
if not SLOTS_OK:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

# en and es are ONE warning in two languages, not two warning sets. Unequal
# counts mean the selector picks from a different-sized set per language, so the
# same episode renders variant 2 in English and whatever `h % 2` gives in
# Spanish — the two stop being translations of each other. The stronger claim,
# that variant *i* in `en` IS variant *i* in `es`, is a review property no
# assert can reach; this is the mechanical half, and it is the half that breaks
# by accident when somebody adds a line in one language.
for lvl in LEVEL_SLOTS:
    check(f"en and es carry the same NUMBER of {lvl.value} variants",
          len(agent.variants(lvl, "en")), len(agent.variants(lvl, "es")))

# ⚠️ **The variation ramp, as a COUNT.** `watch` fires most often and reaches a
# subscriber watching several corners in one storm, so it carries the most
# openings; `emergency` carries the fewest because every one of them is a
# separate life-safety review of one identical instruction block. Asserted as an
# ordering rather than as three magic numbers, so adding copy at watch stays free
# and adding copy at emergency has to argue with this line.
#
# ⚠️ **This used to be the shrinking-CHARACTER rule** — the rat had the most ways
# to say the least dangerous thing — and the character was removed on 2026-08-14
# with the rename to Fluud. The ordering survived the removal because the second
# argument for it never depended on the first. **The counts went 16/11/3 to
# 6/4/3, and this line did not have to change**, which is the whole reason it was
# written as an ordering.
check("watch carries at least as many variants as warning",
      len(agent.variants(Level.WATCH, "en"))
      >= len(agent.variants(Level.WARNING, "en")), True)
check("warning carries at least as many variants as emergency",
      len(agent.variants(Level.WARNING, "en"))
      >= len(agent.variants(Level.EMERGENCY, "en")), True)
check("emergency carries no more than three",
      len(agent.variants(Level.EMERGENCY, "en")) <= 3, True)

# ⚠️ **At EMERGENCY the instructions never move.** Recognition is speed for
# somebody below street level, so only the opening sentence may vary. Asserted
# by stripping the first sentence and requiring the remainder to be identical
# across every variant — the thing a careful reader would check by eye, and the
# thing nobody re-checks after the fourth edit.
for lang in agent.SUPPORTED:
    tails = {v.split(". ", 1)[1] for v in agent.variants(Level.EMERGENCY, lang)}
    check(f"every {lang} emergency variant carries the SAME instruction block",
          len(tails), 1)

# ⚠️ **The hash is a contract, not an implementation detail.** Changing a
# constant in `_hash32` silently reshuffles which sentence every corner in the
# city gets, AND desynchronises every `alerts.message_en` written before the
# change from what `/api/speak` re-renders for that same alert. Pinned so that
# is a failing script rather than a discovery.
for key, want in (
    ("", 0xA61DB31C),
    ("a", 0xE9167C8F),
    ("Ave C @ 23 St", 0x5FFE4D67),
    ("alert:1", 0xEFDC99D8),
    ("alert:1\x1fAve C @ 23 St\x1fwatch", 0xE4C49F9E),
):
    check(f"_hash32({key!r}) is pinned", agent._hash32(key), want)

# Purity: the pick is a function of its arguments and NOTHING else. Fifty passes
# over the same grid, because a module-level `random` or a clock read would show
# up on the second one.
grid = {(p, lvl, s): agent.warning_text_for_depth(lvl, 40.0, p, "en", seed=s)
        for p in PLACES for lvl in LEVEL_SLOTS for s in SEEDS}
for _ in range(50):
    check(
        "the same (place, level, seed) renders the same words every time",
        {k: agent.warning_text_for_depth(k[1], 40.0, k[0], "en", seed=k[2])
         for k in grid},
        grid,
    )

# Every variant is reachable, and none of them is a third of the city.
# ⚠️ **This assertion cannot be flaky, and that is the point.** Five hundred
# named seeds through a pure function: a bound that passes today passes forever
# until the variant count, the key or the hash changes — and every one of those
# three SHOULD fail it. `random.choice` would make this untestable, which is the
# clearest available statement of what the hash buys.
for lang in agent.SUPPORTED:
    for lvl in LEVEL_SLOTS:
        n = len(agent.variants(lvl, lang))
        hits = [0] * n
        for s in SWEEP:
            hits[agent.variant_index("Ave C @ 23 St", lvl, s, n)] += 1
        check(f"every {lang}/{lvl.value} variant is reachable",
              [i for i, c in enumerate(hits) if c == 0], [])
        check(f"no {lang}/{lvl.value} variant takes more than twice its share",
              max(hits) <= 2 * len(SWEEP) / n, True)

# ⚠️ **The LEVEL is in the key, and this is the assert that says so.** Drop it
# and every corner locks to one slot per episode — first watch line, first
# warning line, first emergency line, every time, everywhere. That is three
# tuples behaving exactly like three strings.
_n = min(len(agent.variants(lvl, "en")) for lvl in LEVEL_SLOTS)
if _n > 1:
    agree = sum(
        1 for s in SWEEP
        if agent.variant_index("Ave C @ 23 St", Level.WATCH, s, _n)
        == agent.variant_index("Ave C @ 23 St", Level.WARNING, s, _n)
    )
    check("the level is part of the key (watch and warning do not lock together)",
          agree < len(SWEEP), True)
    # And the CORNER is in it too, so one storm across eight instruments does
    # not read as one form letter posted eight times.
    check("different corners get different variants at one level and seed",
          len({agent.variant_index(p, Level.WATCH, "", _n) for p in PLACES}) > 1,
          True)

# A level with ONE variant is provably independent of every argument — the
# short-circuit is before the hash. This is what let the mechanism land ahead of
# the copy, and it is what keeps a level that is deliberately never varied
# (emergency, if it is ever cut back to one) honest rather than merely lucky.
check(
    "a single-variant level ignores place, level and seed entirely",
    {agent.variant_index(p, lvl, s, 1)
     for p in PLACES for lvl in LEVEL_SLOTS for s in SEEDS + SWEEP[:20]},
    {0},
)

# `template()` refuses a level key and names the right door. Left open, it hands
# `mail.py` a tuple and `.format` raises `AttributeError` inside `render` — on
# the one transport that pushes to a person, with a message that names neither
# the cause nor the fix.
for lang in agent.SUPPORTED:
    for key in agent.LEVEL_KEYS:
        try:
            agent.template(key, lang)
            got = "returned a value"
        except KeyError:
            got = "refused"
        check(f"template({key!r}, {lang!r}) refuses a level key", got, "refused")

# The only written bound left on how long this copy may get. The masthead
# reserve is recorded as RETIRED in `web/src/components/CLAUDE.md` — the warning
# sits at the foot of a scrolling rail with nothing under it to shove — so this
# is advisory rather than load-bearing. It is kept because the copy author gets
# a loud failure here instead of a layout nobody re-measures. The six strings
# that shipped before variants ran 161-254.
for lang in agent.SUPPORTED:
    for lvl in LEVEL_SLOTS:
        for i in range(len(agent.variants(lvl, lang))):
            rendered = agent.warning_text_for_depth(
                lvl, 40.0, "Northern Blvd @ Bell Blvd", lang,
                seed=f"pin:{lang}:{lvl.value}:{i}",
            )
            check(f"{lang}/{lvl.value} renders under 300 characters",
                  len(rendered) <= 300, True)

# ❌ ⚠️ **`LANDING_QUOTE` was here and is DELETED**, with the landing page it
# guarded (2026-08-14, owner's instruction).
#
# It pinned one WATCH variant as a constant and asserted it was still a member of
# the tuple, because `landing/landing-sections.tsx` rendered that sentence
# verbatim — with `{place}` left visible as a slot, under a chip reading *"one of
# the WATCH templates, verbatim"*. The check existed because rewording a template
# is an ordinary copy edit two directories away from a duplicate of it, and the
# failure mode was the landing page silently becoming the second author of
# warning copy.
#
# ⚠️ **Nothing on any surface now quotes warning copy, which is why this could go
# rather than being repointed.** That is also a loss worth naming: no page shows
# a reader what a warning actually says. **If a quote ever returns anywhere — a
# landing page, a doc page, a screenshot's alt text — this assertion returns with
# it**, as a hand-copied constant, so that the script stays free of the web tree
# and the two still have to be edited together.

# ⚠️ Invariant 1, as an assert rather than as prose.
#
# **This block used to cover three keys and now covers one.** It asserted that
# `mail_silence`, `mail_silence_never` and `mail_standdown` each ENDED on the
# refusal, because all three describe something ending or something absent —
# exactly where a reader supplies "so it's fine" on the copy's behalf — and the
# sentence people carry away is the one they stopped on. All three were removed
# on 2026-08-05: the stand-down email is gone outright and silence became a line
# on the watch panel.
#
# ⚠️ **So the ends-on-it property is no longer asserted anywhere, and the claim
# it protected now lives in a `.tsx` file this script cannot read** —
# `watch-panel.tsx`, which says it in the same words. That is a real loss of
# enforcement rather than a cleanup, and it is recorded here rather than left to
# be noticed. What survives below is the weaker containment check on the one
# remaining message that makes a claim about absence.
# ⚠️ **The refusal sentence changed on 2026-08-06 and the assertion moved with
# it.** The confirm email's silence paragraph is now `watch_note` VERBATIM —
# the same reviewed sentence the watch panel renders — so the refusal it ends
# on is "Silence is not a statement about conditions." rather than "This is
# not…". Two checks, and the second is not implied by the first: the verbatim
# check keeps the panel and the inbox one sentence, and the refusal check keeps
# that sentence a refusal even if `watch_note` itself is ever edited.
for lang in agent.SUPPORTED:
    check(
        f"mail_confirm ({lang}) carries the panel's honesty sentence verbatim",
        agent.template("watch_note", lang) in agent.template("mail_confirm", lang),
        True,
    )
    check(
        f"mail_confirm ({lang}) still refuses to describe conditions",
        (
            "El silencio no es una afirmación sobre las condiciones."
            if lang == "es"
            else "Silence is not a statement about conditions."
        ) in agent.template("mail_confirm", lang),
        True,
    )

if failures:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)

print("escalation contract OK")
