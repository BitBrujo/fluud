#!/usr/bin/env python3
"""Assert the outbound mail contract. No database, no network, no pytest.

    python3 scripts/check_mail.py

A **sibling** to `check_escalation.py` and `check_watch.py`, on the same terms
those two are siblings of each other: it is a separate file so that the script
proving one thing is never the script being edited to change another.

## Why this one exists

`mail.py` is the **first outbound egress in this repo**, and it is the only
module that pushes to a person rather than answering a browser that chose to
connect. `check_escalation.py` already asserts that `agent.warning_text`
delegates to `agent.warning_text_for_depth` over the whole level x depth x
language x seed grid. **Nothing asserted that the envelope around it reaches the
same sentences**, which is the half that ends up in somebody's inbox at three in
the morning with nobody reviewing it.

The load-bearing assertion here is the verbatim one. Everything else pins a
refusal or a boundary.

## The three failures this is shaped against

1. **An f-string containing prose in `mail.py`.** That is the templated-copy rule arriving
   by post — warning copy authored in a second place, reviewed in neither.
2. **A link that 404s instead of an absence that says so.** `PUBLIC_BASE_URL`
   unset is a real deployment state, and a broken link reads to a reader as
   *this service is broken* while a stated absence reads as what it is.
3. **`resend` naming an instrument.** It is the only message a stranger can
   cause to be sent to an address they do not hold, so it must teach them
   nothing.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ⚠️ **`mail.py` imports `db`, so this script needs `psycopg` INSTALLED** — not a
# database running, and it opens no connection. That makes it the first check
# script that cannot run on a bare interpreter, unlike `check_escalation.py` and
# `check_watch.py`, whose modules are pure. `scripts/check` picks `.venv/bin/python`
# when there is one for exactly this reason. Breaking the import would mean
# splitting `mail.render` away from `mail.drain`, which is a real change to make
# deliberately rather than a side effect of wanting a cheaper test.
from waterline import agent, mail  # noqa: E402
from waterline.config import settings  # noqa: E402
from waterline.models import Level  # noqa: E402

# `_link` warns on every render while `PUBLIC_BASE_URL` is unset, which is the
# correct behaviour and is itself asserted below — but the grid renders it
# hundreds of times and the report is what this script is for.
logging.disable(logging.CRITICAL)

NOW = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)
PLACE = "Ave C @ 23 St"

# The same seed dimension `check_escalation.py` sweeps, so the envelope is
# checked against every variant the level keys can pick rather than variant 0.
SEEDS = ["", "episode:1", "episode:412", "alert:97", "drill"]
DEPTHS = [None, 0.0, 10.0, 25.3, 25.4, 40.0, 150.0, 200.0, -466.0]
WARN_LEVELS = [Level.WATCH, Level.WARNING, Level.EMERGENCY]

failures: list[str] = []


def check(name: str, got, want) -> None:
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


def report_and_exit() -> None:
    print(f"FAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)


# --- the load-bearing one: a warning body is the reviewed copy VERBATIM -----
# Asserted over the whole grid rather than spot-checked, because the failure
# would be a single level, language or variant quietly diverging — and the one
# that diverges is the one nobody reads until it has already been sent.
for lang in agent.SUPPORTED:
    for lvl in WARN_LEVELS:
        for mm in DEPTHS:
            for seed in SEEDS:
                _, body = mail.render(
                    "watch", lang, PLACE, NOW,
                    level=lvl, depth_mm=mm, seed=seed,
                    manage_token="tok", observed_at=NOW,
                )
                want = agent.warning_text_for_depth(lvl, mm, PLACE, lang, seed=seed)
                check(
                    f"the {lang}/{lvl.value} body OPENS on the reviewed sentence "
                    f"(depth={mm}, seed={seed!r})",
                    body.startswith(want),
                    True,
                )
                # Verbatim means unedited, so the copy must survive intact rather
                # than merely appear at the front.
                check(
                    f"and carries it uncut ({lang}, {lvl.value}, {mm}, {seed!r})",
                    want in body,
                    True,
                )

# ⚠️ **The seed has to reach the copy through the envelope.** If `render` ever
# stopped threading it, every subscriber to one episode would still get a
# grammatical warning — just a different one each, none of them the sentence on
# the page. That is the failure `agent.variant_index` exists to prevent, arriving
# one module downstream of where it is asserted.
for lvl in WARN_LEVELS:
    n = len(agent.variants(lvl, "en"))
    if n > 1:
        bodies = {
            mail.render("watch", "en", PLACE, NOW, level=lvl, depth_mm=40.0,
                        seed=f"episode:{i}", manage_token="t")[1]
            for i in range(200)
        }
        check(f"the seed reaches the {lvl.value} copy through render()",
              len(bodies) > 1, True)

# And the same seed is the same message, every time, for every subscriber.
for lvl in WARN_LEVELS:
    once = mail.render("watch", "en", PLACE, NOW, level=lvl, depth_mm=40.0,
                       seed="episode:7", manage_token="t")
    for _ in range(20):
        check(
            f"five subscribers to one {lvl.value} episode get ONE body",
            mail.render("watch", "en", PLACE, NOW, level=lvl, depth_mm=40.0,
                        seed="episode:7", manage_token="t"),
            once,
        )

# --- render refuses what it cannot say ------------------------------------
for bad_level in (None, Level.CLEAR):
    try:
        mail.render("watch", "en", PLACE, NOW, level=bad_level)
        got = "returned a value"
    except ValueError:
        got = "refused"
    check(f"a watch message with level={bad_level} is refused", got, "refused")

try:
    mail.render("standdown", "en", PLACE, NOW)
    got = "returned a value"
except ValueError:
    got = "refused"
# ⚠️ `standdown` and `silence` were removed on 2026-08-05. This asserts they are
# GONE rather than merely unused: a caller that still asks for one must fail
# loudly instead of rendering an empty envelope.
check("the removed `standdown` kind is refused, not silently rendered", got, "refused")

for kind in ("silence", "", "watch_v2"):
    try:
        mail.render(kind, "en", PLACE, NOW)
        got = "returned a value"
    except ValueError:
        got = "refused"
    check(f"an unknown kind {kind!r} is refused", got, "refused")

# --- four kinds go out, and the subject table covers exactly the warnings --
check("the subject table covers every level a warning can carry",
      sorted(k.value for k in mail._SUBJECT_KEY), ["emergency", "warning", "watch"])
check("and `clear` is not in it",
      Level.CLEAR in mail._SUBJECT_KEY, False)

# ⚠️ **`camera` is `watch` byte for byte on the wire, and only the outbox key
# differs.** The kind exists because `alerts.id` and `sensor_episodes.id` are
# two bigserials in one `outbox_once` key space — see `schema.sql` — not
# because a camera subscriber gets different words. Same seed, same level,
# same language MUST render one envelope, or the page and the camera inbox
# have become two authors of one warning (the templated-copy rule).
for lang in agent.SUPPORTED:
    for lvl in WARN_LEVELS:
        check(
            f"camera renders identically to watch ({lang}/{lvl.value})",
            mail.render("camera", lang, PLACE, NOW, level=lvl, depth_mm=40.0,
                        seed="alert:9", manage_token="t"),
            mail.render("watch", lang, PLACE, NOW, level=lvl, depth_mm=40.0,
                        seed="alert:9", manage_token="t"),
        )
for bad_level in (None, Level.CLEAR):
    try:
        mail.render("camera", "en", PLACE, NOW, level=bad_level)
        got = "returned a value"
    except ValueError:
        got = "refused"
    check(f"a camera message with level={bad_level} is refused", got, "refused")

for lang in agent.SUPPORTED:
    for lvl in WARN_LEVELS:
        subject, _ = mail.render("watch", lang, PLACE, NOW, level=lvl,
                                 depth_mm=40.0, manage_token="t")
        check(f"the {lang}/{lvl.value} subject names the place", PLACE in subject, True)
        check(f"and leaves no unfilled slot ({lang}/{lvl.value})",
              "{" in subject, False)

# --- every mail template key exists in both languages ----------------------
# `check_escalation.py` asserts en/es hold the same key set. This asserts the
# specific keys THIS module reaches for are among them, so a renamed key is a
# failure here rather than a KeyError in front of a subscriber.
MAIL_KEYS = [
    "mail_confirm", "mail_disclaimer_only", "mail_footer", "mail_reading_age",
    "mail_reading_none", "mail_resend", "mail_subject_confirm",
    "mail_subject_emergency", "mail_subject_resend", "mail_subject_warning",
    "mail_subject_watch",
]
for lang in agent.SUPPORTED:
    check(f"every key mail.py uses is defined in {lang}",
          [k for k in MAIL_KEYS if k not in agent._TEMPLATES[lang]], [])

# --- `resend` is the message a stranger can cause, so it says nothing -------
# ⚠️ The only message that goes to an address with no transition behind it.
# Somebody who does not hold the mailbox must not learn anything by causing one.
for lang in agent.SUPPORTED:
    subject, body = mail.render("resend", lang, PLACE, NOW, manage_token="TOK",
                                sensors=["Ave C @ 23 St", "Bell Blvd"],
                                level=Level.EMERGENCY, depth_mm=1451.0,
                                observed_at=NOW)
    check(f"the {lang} resend names no instrument", PLACE in body, False)
    check(f"nor any sensor from the list ({lang})", "Bell Blvd" in body, False)
    check(f"nor a reading ({lang})", "1451" in body, False)
    check(f"and its subject names no place ({lang})", PLACE in subject, False)
    check(f"but it does carry the manage token ({lang})", "TOK" in body, True)
    check(f"and the disclaimer ({lang})", agent.disclaimer(lang) in body, True)

# --- `confirm` is not a claim about water ----------------------------------
for lang in agent.SUPPORTED:
    _, body = mail.render("confirm", lang, PLACE, NOW, confirm_token="CONF",
                          manage_token="MAN", sensors=["Ave C @ 23 St"])
    check(f"the {lang} confirm carries the confirm token", "CONF" in body, True)
    check(f"and the manage token ({lang})", "MAN" in body, True)
    check(f"and lists the instruments asked for ({lang})",
          "Ave C @ 23 St" in body, True)
    # No freshness line: there is no reading to be fresh, and inventing one
    # would make a confirmation into a statement about conditions.
    check(f"and carries NO reading line ({lang})",
          agent.template("mail_reading_none", lang) in body, False)
    # ⚠️ The honesty sentence is `watch_note` VERBATIM as of 2026-08-06 — the
    # same reviewed sentence the watch panel renders, which is what that
    # panel's docblock has always claimed. The refusal check beside it keeps
    # the sentence a refusal even if `watch_note` is ever edited.
    check(f"and carries the panel's honesty sentence verbatim ({lang})",
          agent.template("watch_note", lang) in body, True)
    check(f"and still refuses to describe conditions ({lang})",
          (
              "El silencio no es una afirmación sobre las condiciones."
              if lang == "es"
              else "Silence is not a statement about conditions."
          ) in body,
          True)

# An empty instrument list still renders rather than producing a blank block.
_, body = mail.render("confirm", "en", PLACE, NOW, sensors=[], manage_token="m")
check("a confirm with no instruments still says something", "(none)" in body, True)

# The instrument lines carry the borough now — `api._sensor_names` composes
# `name · borough` and this template lists what it is given, verbatim. This
# pins the passthrough so a "tidy-up" in `render` cannot strip or re-split the
# line: composing it is the caller's job and re-composing it here would be a
# second author (the templated-copy rule's shape, one layer down).
_, body = mail.render("confirm", "en", PLACE, NOW, manage_token="m",
                      sensors=["Ave C @ 23 St · Manhattan"])
check("a borough-suffixed line survives verbatim",
      "· Ave C @ 23 St · Manhattan" in body, True)

# --- the frozen-poller rule in an envelope -------------------------------------------
# An email has no card beside it, so the age travels with the message or the
# reader's only evidence about how current this is, is when it happened to
# arrive.
for lang in agent.SUPPORTED:
    check(f"no reading at all says so in {lang}",
          mail._reading_line(None, NOW, lang),
          agent.template("mail_reading_none", lang))

check("under a minute reads as under a minute",
      "less than a minute" in mail._reading_line(NOW - timedelta(seconds=30), NOW, "en"),
      True)
check("thirty minutes reads in minutes",
      "30 minutes ago" in mail._reading_line(NOW - timedelta(minutes=30), NOW, "en"),
      True)
check("ninety minutes is still minutes",
      "90 minutes ago" in mail._reading_line(NOW - timedelta(minutes=90), NOW, "en"),
      True)
# Past 90 minutes it switches to hours: "240 minutes ago" is arithmetic a reader
# has to do to find out how stale this is, which is the whole point of the line.
check("ninety-one minutes switches to hours",
      "about 2 hours ago" in mail._reading_line(NOW - timedelta(minutes=91), NOW, "en"),
      True)
check("a future observation clamps rather than going negative",
      "less than a minute" in mail._reading_line(NOW + timedelta(minutes=5), NOW, "en"),
      True)

# ⚠️ **The freshness line is LOCALISED, and this is `_depth_phrase`'s bug in a
# different function.** That one hard-coded English inside a Spanish sentence and
# survived because the absence case read correctly and the present case did not.
# Both cases are checked here for exactly that reason.
for delta in (timedelta(seconds=30), timedelta(minutes=30), timedelta(minutes=200)):
    check(f"the {delta} freshness line differs between en and es",
          mail._reading_line(NOW - delta, NOW, "en")
          != mail._reading_line(NOW - delta, NOW, "es"),
          True)

# --- `_link` states an absence rather than emitting a broken URL ------------
_saved_base = settings.public_base_url
try:
    settings.public_base_url = ""
    unset = mail._link("/map/?watch=", "TOKEN")
    check("with no public URL the link is a sentence, not a path",
          unset.startswith("/") or unset.startswith("http"), False)
    check("and it still carries the token so the log is useful",
          "TOKEN" in unset, True)

    # ⚠️ **That sentence is right in a BODY and wrong in a HEADER.** The first
    # draft would have shipped a live manage token inside an explanatory
    # sentence in `List-Unsubscribe`. The header has to be ABSENT instead, and
    # `_send` is what decides that — this pins the shape the decision reads.
    check("the unset form is not a usable URL", "://" in unset, False)

    settings.public_base_url = "https://fluud.example/"
    got = mail._link("/watch/?watch=", "TOKEN")
    check("a trailing slash on the base is not doubled",
          got, "https://fluud.example/watch/?watch=TOKEN")

    settings.public_base_url = "https://fluud.example"
    check("and the un-slashed base gives the same URL",
          mail._link("/watch/?watch=", "TOKEN"),
          "https://fluud.example/watch/?watch=TOKEN")
finally:
    settings.public_base_url = _saved_base

# --- ⚠️ the CALLERS' paths, which nothing asserted until 2026-08-16 ---------
#
# ⚠️ **This section is here because its absence let a total outage ship.** The
# block above passes `"/map/?watch="` as an ARGUMENT to `_link`, so it pins the
# base-joining and says nothing whatever about which path `render` and `_send`
# actually pass. Those five call sites pointed at `/map/?…` for the whole life
# of the feature, and `/map` is wrapped in `RequireSession` — so every
# confirmation link, every manage link and the `List-Unsubscribe` header sent a
# subscriber with no Fluud account to a sign-in page. `./scripts/check` was
# green throughout. **A helper asserted through its own arguments is a helper
# asserted against nothing.**
_saved_base = settings.public_base_url
try:
    settings.public_base_url = "https://fluud.example"

    for lang in ("en", "es"):
        _, body = mail.render(
            "confirm", lang, "", NOW,
            confirm_token="CONF", manage_token="MAN", sensors=["a", "b"],
        )
        check(f"[{lang}] the confirmation links at /watch/?confirm=",
              "https://fluud.example/watch/?confirm=CONF" in body, True)
        check(f"[{lang}] and its footer manages at /watch/?watch=",
              "https://fluud.example/watch/?watch=MAN" in body, True)

        _, body = mail.render("resend", lang, "", NOW, manage_token="MAN")
        check(f"[{lang}] the resend links at /watch/?watch=",
              "https://fluud.example/watch/?watch=MAN" in body, True)

        _, body = mail.render(
            "watch", lang, "Ave C @ 23 St", NOW,
            level=Level.WATCH, depth_mm=42.0, observed_at=NOW,
            manage_token="MAN", seed="episode:1",
        )
        check(f"[{lang}] a warning's footer manages at /watch/?watch=",
              "https://fluud.example/watch/?watch=MAN" in body, True)

    # ⚠️ The header is the one link carrying a bearer credential that a mail
    # client acts on without the reader reading it, and it was the least
    # testable line in the module until `unsubscribe_header` was extracted —
    # `_send` opens a socket.
    check("the List-Unsubscribe header points at /watch/",
          mail.unsubscribe_header("MAN"),
          "<https://fluud.example/watch/?watch=MAN>")
    check("and it is ABSENT with no token rather than malformed",
          mail.unsubscribe_header(""), "")

    settings.public_base_url = ""
    check("and absent with no origin, never the explanatory sentence",
          mail.unsubscribe_header("MAN"), "")

    # ⚠️ **The negative assertion, and it is the one that catches a revert.**
    # Every rendered body, in both languages, across every kind. Repointing one
    # call site back to `/map/?` restores the outage; this is what says so.
    settings.public_base_url = "https://fluud.example"
    for lang in ("en", "es"):
        bodies = [
            mail.render("confirm", lang, "", NOW, confirm_token="C",
                        manage_token="M", sensors=["a"])[1],
            mail.render("resend", lang, "", NOW, manage_token="M")[1],
            mail.render("watch", lang, "Ave C @ 23 St", NOW,
                        level=Level.EMERGENCY, depth_mm=900.0,
                        observed_at=NOW, manage_token="M", seed="e:1")[1],
        ]
        for body in bodies:
            check(f"[{lang}] no rendered body links into /map/",
                  "/map/?" in body, False)
    check("and neither does the unsubscribe header",
          "/map/?" in mail.unsubscribe_header("M"), False)
finally:
    settings.public_base_url = _saved_base

# --- the address validator, and the rejection that is not cosmetic ---------
# ⚠️ A `\r` or `\n` reaching a header is SMTP header injection: the attacker
# appends their own `Bcc:` and this becomes an open relay for as long as nobody
# notices. Checked at the door, where a 400 is the right answer.
#
# ⚠️ **The contract is about what comes OUT, not about rejection**, and this was
# got wrong on the first pass. `a@b.com\r` and `a\t@b.com` both return the clean
# `a@b.com` rather than `None`, because `.strip()` and `parseaddr` REMOVE those
# characters before the character test ever runs. That is equally safe and
# arguably kinder — but asserting rejection would have pinned a mechanism instead
# of the property, and a rewrite that reordered those two steps would then fail
# this script while still being correct.
#
# So: whatever comes back is either `None` or an address that cannot carry a
# header. That holds however the function is implemented.
HOSTILE = [
    "a@b.com\r\nBcc: victim@x.com", "a@b.com\nBcc: v@x.com",
    "a@b.com\r", "a@b.com\n", "a\t@b.com", "a b@c.com", "a,b@c.com",
    "a;b@c.com", "<a@b.com>x", "a@b.com>\r\nX-Injected: 1",
]
for raw in HOSTILE:
    got = mail.normalise_address(raw)
    check(
        f"nothing that could carry a header survives: {raw!r}",
        got is None or not any(c in got for c in "\r\n\t ,;<>"),
        True,
    )

# The multi-line ones must be refused outright — there is no safe truncation of
# an address with a second header stapled to it.
for raw in ["a@b.com\r\nBcc: victim@x.com", "a@b.com\nBcc: v@x.com",
            "a@b.com>\r\nX-Injected: 1"]:
    check(f"a stapled header is refused outright: {raw!r}",
          mail.normalise_address(raw), None)

for raw in ["", "   ", "nodomain", "@b.com", "a@", "a@b", "a@.com", "a@b.",
            "a@b..com", "a@" + "x" * 300]:
    check(f"a malformed address is refused: {raw!r}",
          mail.normalise_address(raw), None)

for raw, want in [
    ("a@b.com", "a@b.com"),
    ("  a@b.com  ", "a@b.com"),
    ("Joaquin <j@example.com>", "j@example.com"),
    ("J.P+watch@sub.example.co.uk", "J.P+watch@sub.example.co.uk"),
]:
    check(f"a real address survives: {raw!r}", mail.normalise_address(raw), want)

# --- the log must not undo the cascade -------------------------------------
# Logs outlive the row they came from — the host keeps them, `delete_subscriber`
# does not reach them, and nothing here prunes them.
check("the local part is masked", mail._mask("joaquin@example.com"),
      "j••••••@example.com")
check("a one-character local part still masks", mail._mask("a@b.com"), "a•@b.com")
check("something with no domain is masked entirely", mail._mask("garbage"), "••••")

# --- the age bound on the transport ----------------------------------------
# ⚠️ Invariant 13 on the mail path. A queued message past this is `expired` and
# never sent: fifteen minutes is a long time in the only tense a flood warning
# has. It also bounds retries without a retry counter.
check("the outbound age bound is fifteen minutes", mail.MAX_AGE_S, 900)
check("and it is longer than one poll tick but well inside an episode",
      60 < mail.MAX_AGE_S < 3600, True)

# --- the transport predicate has ONE implementation -------------------------
# ⚠️ `mail.transport_delivers()` is on the wire (`/healthz` -> `HealthResponse.
# mail_delivers`) and the watch panel's confirm face renders it, so a page says
# "nothing was sent" on its word. `deliver` decides the same thing separately,
# because it has to tell the two no-send cases apart to pick an outbox status.
# Two readings of one predicate is how a page comes to promise something the
# sender cannot do, so they are asserted to agree over the whole grid rather
# than trusted to.
#
# The grid is (transport, host) and the expected answers come from `deliver`'s
# own branches: anything but `smtp` is `skipped`, `smtp` with no host is
# `queued`, and only the last pair reaches a socket.
_saved = (mail.settings.mail_transport, mail.settings.smtp_host)
try:
    for transport, host, delivers in [
        ("log", "", False),
        ("log", "smtp.example.com", False),
        ("", "smtp.example.com", False),
        ("smtp", "", False),
        ("smtp", "smtp.example.com", True),
    ]:
        mail.settings.mail_transport = transport
        mail.settings.smtp_host = host
        check(f"transport_delivers({transport!r}, host={host!r})",
              mail.transport_delivers(), delivers)

        # And `deliver` agrees, without sending: a row that would reach the
        # socket is not exercised here (that needs a server), so the assertion
        # is the contrapositive — whenever the predicate says no, `deliver`
        # returns one of the two statuses that mean nothing left this process.
        if not delivers:
            row = {
                "id": 1, "kind": "confirm", "email": "a@b.com",
                "subject": "s", "body": "b",
                "queued_at": datetime.now(timezone.utc),
            }
            check(f"  and deliver() sends nothing at {transport!r}/{host!r}",
                  mail.deliver(row) in ("skipped", "queued"), True)
finally:
    mail.settings.mail_transport, mail.settings.smtp_host = _saved

check("the settings were restored after the grid",
      (mail.settings.mail_transport, mail.settings.smtp_host), _saved)

if failures:
    report_and_exit()

print("mail contract OK")
