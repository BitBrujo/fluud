"""Rendering and delivery — the first outbound egress in this repo.

Everything else here talks to the outside world by *asking* it questions.
This module is the only thing that pushes, and it pushes to a person rather
than to a browser that chose to connect. That is worth naming at the top of the
file, because every rule below follows from it.

**The transport is pluggable and its default sends nothing.** `MAIL_TRANSPORT`
is `log`: every message is rendered, written to the log in full, and marked
`skipped`. Nothing leaves the process, the whole path is exercisable with no
provider and no credential, and the honest headline is that this ships as a
watch that cannot yet notify. Setting four env vars turns on `smtp` with no code
change — the standard library's `smtplib`, so no new dependency and no
third-party origin on the alerting path.

**Nothing here composes a sentence.** `render` picks a template key from
`agent._TEMPLATES` and fills slots; a warning's body is `warning_text_for_depth`
output verbatim, the identical reviewed words the page renders. That is
the templated-copy rule, and it does not stop applying because the transport changed. If you
find yourself writing an f-string containing prose in this file, the copy
belongs in `agent.py`.

**A message is rendered once and stored as sent.** `db.queue_message` writes the
subject and body at the moment the episode transitioned; this module reads them
back and delivers them unchanged. Re-templating at delivery against readings
that have since moved would rewrite history, and a log that disagrees with the
inbox is worse than no log.
"""

from __future__ import annotations

import logging
import smtplib
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr

from . import agent, db
from .config import settings
from .models import Level

log = logging.getLogger(__name__)

# A queued message older than this is DROPPED, not sent — status `expired`.
#
# ⚠️ This is `rat.REPLAY_MAX_AGE_S` and the stale-replay rule applied to a second
# transport. A flood warning that arrives hours late presents a past emergency
# as a current one, which is worse than never arriving: the reader acts on it.
# There is no useful middle ground between "this is happening" and silence.
#
# 15 minutes rather than the SSE buffer's 5, because mail is expected to be
# slower and a relay retrying for a few minutes is normal where a browser
# reconnecting for a few minutes is not. It is still far inside the window in
# which a flood warning is about the present tense.
#
# It also bounds retries without a retry counter: a transient failure returns
# the row to `queued` and it is re-attempted until it either sends or ages out.
MAX_AGE_S = 900

# Subject lines by level, for the three kinds of message that carry a warning.
# Here rather than in a chain of ifs so that adding a level is a table edit and
# a missing one is a KeyError at render time rather than a silently generic
# subject. Invariant 14 lives in the strings themselves — see `agent.py`.
#
# ⚠️ **Four kinds go out now.** `silence` and `standdown` were removed on
# 2026-08-05, on the owner's instruction. What remains is `confirm`, `resend`,
# `watch` and — since the camera watch — `camera`: one double opt-in, one link
# recovery, and the warnings themselves on two id namespaces. Silence became a
# line on the manage face (`watch.is_silent`), and the stand-down became
# nothing at all: the episode closes in `sensor_episodes` and no message
# describes it. LIMITATIONS §16 carries what each of those costs.
#
# ⚠️ **`camera` renders through the identical branch as `watch`** — same
# subjects, same verbatim `warning_text_for_depth` body, same footer. It is a
# distinct kind for exactly one reason: `outbox_once` keys on
# (subscriber, kind, episode, level), and a camera `alerts.id` and a
# `sensor_episodes.id` are two bigserials that both start at 1. One kind over
# both would eat a real warning the day the ids collide. See `schema.sql`.
_SUBJECT_KEY = {
    Level.WATCH: "mail_subject_watch",
    Level.WARNING: "mail_subject_warning",
    Level.EMERGENCY: "mail_subject_emergency",
}


def normalise_address(raw: str) -> str | None:
    """The one address validator. Pure, and deliberately not `EmailStr`.

    Pydantic's `EmailStr` pulls in `email-validator` and `dnspython` — two new
    dependencies on a six-line `requirements.txt` — to be strict about a string
    we are only ever going to hand to a relay, which will make its own judgement
    anyway. The trade is written down rather than left to be re-litigated.

    ⚠️ **The rejection that is not cosmetic is the newline.** An address
    containing `\\r` or `\\n` that reaches a header is SMTP header injection: the
    attacker appends their own `Bcc:` and the service becomes an open relay for
    as long as nobody notices. `EmailMessage` defends against this too, by
    raising — but this runs at the door, where a 400 is the right answer, rather
    than at 3am inside a drain where an exception is a `failed` row.
    """
    if not raw:
        return None
    addr = parseaddr(raw.strip())[1]
    if not addr or len(addr) > 254:
        return None
    if any(c in addr for c in "\r\n\t ,;<>"):
        return None
    local, _, domain = addr.rpartition("@")
    if not local or not domain or "." not in domain:
        return None
    if domain.startswith(".") or domain.endswith(".") or ".." in domain:
        return None
    return addr


def _link(path: str, token: str) -> str:
    """Build a confirm or manage link, or say plainly that we cannot.

    ⚠️ Returning a sentence rather than a broken relative URL is the point. With
    `PUBLIC_BASE_URL` unset the process genuinely does not know its own origin,
    and a link that 404s reads to a reader as "this service is broken" while a
    stated absence reads as what it is. `poll.probe` warns about the same
    condition before a demo, and the token still reaches the log.
    """
    base = settings.public_base_url.rstrip("/")
    if not base:
        log.warning(
            "PUBLIC_BASE_URL is unset — no link can be rendered. The token for "
            "this message is %s and it cannot be used until that is set.", token
        )
        return f"(this deployment has no public URL configured; token: {token})"
    return f"{base}{path}{token}"


def unsubscribe_header(manage_token: str) -> str:
    """The `List-Unsubscribe` value, or `""` when one cannot be built.

    ⚠️ **Pure, and public, so `check_mail.py` can assert it.** It was three
    lines inside `_send`, which opens an SMTP conversation and is therefore not
    drivable from a check script — so the one header carrying a bearer
    credential was the least testable line in this module. It is the same
    `/watch/?watch=` path the body's manage link uses, and the whole point of
    the extraction is that a check can now prove they agree.

    ⚠️ **Gated on `public_base_url` as well as on the token, and NOT built
    through `_link`.** That helper returns an explanatory sentence when the
    origin is unknown, which is right in a body a person reads and wrong in a
    header a mail client parses — it would ship `List-Unsubscribe: <(this
    deployment has no public URL configured; token: …)>`, i.e. a malformed
    header with a live credential in it. No origin, no header.
    """
    if not manage_token or not settings.public_base_url:
        return ""
    base = settings.public_base_url.rstrip("/")
    return f"<{base}/watch/?watch={manage_token}>"


def _reading_line(observed_at: datetime | None, now: datetime, lang: str) -> str:
    """The freshness line in the footer. Invariant 12, in an envelope.

    A card on the page carries its own age and a reader can glance at it. An
    email has no card, so the age has to travel with the message or the reader's
    only evidence about how current this is, is when it happened to arrive.
    """
    if observed_at is None:
        return agent.template("mail_reading_none", lang)
    mins = max(0, int((now - observed_at).total_seconds() // 60))
    # Past 90 minutes, switch to hours. "240 minutes ago" is arithmetic a reader
    # has to do to find out how stale this is, and the whole point of the line
    # is that they should not have to.
    if mins < 1:
        when = "hace menos de un minuto" if lang == "es" else "less than a minute ago"
    elif mins <= 90:
        when = f"hace {mins} minutos" if lang == "es" else f"{mins} minutes ago"
    else:
        hrs = mins / 60
        when = f"hace {hrs:.0f} horas" if lang == "es" else f"about {hrs:.0f} hours ago"
    return agent.template("mail_reading_age", lang).format(when=when)


def _footer(
    lang: str, manage_token: str, observed_at: datetime | None, now: datetime
) -> str:
    return agent.template("mail_footer", lang).format(
        reading=_reading_line(observed_at, now, lang),
        manage_url=_link("/watch/?watch=", manage_token),
        disclaimer=agent.disclaimer(lang),
    )


def render(
    kind: str,
    lang: str,
    place: str,
    now: datetime,
    *,
    level: Level | None = None,
    depth_mm: float | None = None,
    observed_at: datetime | None = None,
    manage_token: str = "",
    confirm_token: str = "",
    sensors: list[str] | None = None,
    seed: str = "",
) -> tuple[str, str]:
    """(subject, body) for one message. Pure — no clock, no database, no socket.

    `now` is passed in for the same reason `watch.py` takes it: a renderer that
    reads the clock cannot be checked, and this one produces the freshness line
    that the frozen-poller rule rides on.

    ⚠️ **A warning's body is `agent.warning_text_for_depth` verbatim.** Not
    paraphrased, not summarised, not truncated — the same sentences the page
    renders, with an envelope around them. Two renderings of one warning is two
    places for it to diverge and only one of them gets reviewed.

    ⚠️ **`seed` picks WHICH of those sentences, and it is only read by `watch`.**
    The level templates hold several reviewed variants each, so an unseeded
    render would give every subscriber to one episode a different one. The
    caller passes the episode; nothing here draws. `confirm` and `resend` never
    reach a warning, so they never pass it. See `agent.variant_index`.
    """
    t = lambda key: agent.template(key, lang)  # noqa: E731

    if kind == "confirm":
        listed = "\n".join(f"  · {s}" for s in (sensors or [])) or "  · (none)"
        subject = t("mail_subject_confirm")
        body = t("mail_confirm").format(
            sensors=listed,
            confirm_url=_link("/watch/?confirm=", confirm_token),
        )
        # No freshness line: there is no reading to be fresh, and a confirmation
        # is not a claim about water. `_reading_line` would have to invent one.
        body += t("mail_footer").format(
            reading="",
            manage_url=_link("/watch/?watch=", manage_token),
            disclaimer=agent.disclaimer(lang),
        )
        return subject, body

    if kind == "resend":
        # ⚠️ **The only message that goes to an address without a transition
        # behind it**, and the only one a stranger can cause to be sent. Both
        # facts are why it says nothing about any instrument: no place, no
        # reading, no list of what is watched. Somebody who does not hold this
        # mailbox must not be able to learn anything by causing one, and
        # somebody who does already holds the link it carries.
        subject = t("mail_subject_resend")
        body = t("mail_resend").format(
            manage_url=_link("/watch/?watch=", manage_token),
        )
        return subject, body + t("mail_disclaimer_only").format(
            disclaimer=agent.disclaimer(lang),
        )

    if kind in ("watch", "camera"):
        # One branch for both id namespaces, deliberately: the words a camera
        # subscriber gets are the SAME reviewed sentences the page renders for
        # that alert, picked by the same `alert:<id>` seed `poll._speak`
        # passes. The kinds differ only in the outbox key — see the banner on
        # `_SUBJECT_KEY`.
        if level is None or level is Level.CLEAR:
            raise ValueError("a watch message needs a level above clear")
        subject = t(_SUBJECT_KEY[level]).format(place=place)
        body = agent.warning_text_for_depth(level, depth_mm, place, lang, seed=seed)
        return subject, body + _footer(lang, manage_token, observed_at, now)

    raise ValueError(f"unknown message kind: {kind!r}")


def transport_delivers() -> bool:
    """Whether this deployment can actually put a message in a mailbox.

    ⚠️ **The two conditions below are `deliver`'s, collapsed to the one question
    a reader has.** That function distinguishes them because they produce
    different outbox statuses — `log` is a deliberate no-op and marks `skipped`,
    while `smtp` with no host is a configuration mistake and marks `queued` so
    the row survives to be sent once somebody fixes it. Neither reaches an
    inbox, and to somebody waiting for a confirmation link that is one answer.

    ⚠️ **This is the single authority and `deliver` is checked against it.**
    `check_mail.py` asserts the two agree across the whole transport grid, on
    `alert_permitted`'s rule: a second copy of a predicate is how a page comes
    to promise something the sender cannot do. It is deliberately NOT wired into
    `deliver`'s control flow — that path pushes to a person and it keeps its two
    branches and its two log lines.

    What it is for is `/healthz`, which carries it to the watch panel so the
    confirm face can say nothing was sent. A page that says *check that address*
    against `MAIL_TRANSPORT=log` is telling somebody to wait for a message this
    process rendered into a log file.
    """
    return settings.mail_transport == "smtp" and bool(settings.smtp_host)


def deliver(row: dict, now: datetime | None = None) -> str:
    """Send one claimed message. Returns its new status, never raises.

    One of `sent` | `skipped` | `expired` | `queued` | `failed`:

    - **`expired`** — older than `MAX_AGE_S`. Dropped, not sent. Checked FIRST,
      before the transport is even consulted, because a message too old to be
      true is too old whether or not there is anywhere to send it.
    - **`skipped`** — the `log` transport. Rendered, logged in full, not sent.
    - **`sent`** — handed to a relay. ⚠️ **Not delivered.** Not accepted by the
      recipient's server, not filed in an inbox rather than a spam folder, not
      read. A bounce arrives at a mailbox this process does not read and never
      will. Nothing in this repo may be worded as though this word meant more.
    - **`queued`** — a transient failure, back in the pool. It cannot loop: the
      age check above drops it once it is too old to be worth sending.
    - **`failed`** — the message itself is unsendable, so retrying is pointless.

    Never raises, because the caller is a drain inside the poll tick and one bad
    address must not cost every other subscriber their message.
    """
    now = now or datetime.now(timezone.utc)
    age = (now - row["queued_at"]).total_seconds()
    if age > MAX_AGE_S:
        log.warning(
            "dropping a %s message queued %.0fs ago (max %ds) — a warning that "
            "arrives this late presents a past emergency as a current one",
            row["kind"], age, MAX_AGE_S,
        )
        return "expired"

    to = normalise_address(row.get("email") or "")
    if to is None:
        log.warning("outbox %s has an unusable address — not retrying", row["id"])
        return "failed"

    if settings.mail_transport != "smtp":
        log.info(
            "[mail:%s] would send to %s\n  subject: %s\n%s",
            row["kind"], _mask(to), row["subject"],
            "\n".join(f"  | {line}" for line in row["body"].splitlines()),
        )
        return "skipped"

    if not settings.smtp_host:
        # ⚠️ Belt and braces against the worst configuration mistake available
        # here: `MAIL_TRANSPORT=smtp` with no host is a request to send that
        # cannot be honoured, and silently falling back to `log` would look
        # exactly like success. `poll.probe` warns about this before a demo.
        log.error("MAIL_TRANSPORT=smtp but SMTP_HOST is unset — nothing sent")
        return "queued"

    try:
        _send(to, row["subject"], row["body"], row.get("manage_token") or "")
    except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused) as e:
        # The relay has judged the address itself. Retrying changes nothing, and
        # there is no bounce mailbox on our side to learn more from.
        log.warning("outbox %s refused (%s): %s", row["id"], type(e).__name__, e)
        return "failed"
    except Exception as e:  # noqa: BLE001 — one bad send must not end the drain
        log.warning(
            "outbox %s send failed (%s): %s — requeued, will expire in %.0fs",
            row["id"], type(e).__name__, e, MAX_AGE_S - age,
        )
        return "queued"

    log.info("[mail:%s] handed to the relay for %s", row["kind"], _mask(to))
    return "sent"


def _send(to: str, subject: str, body: str, manage_token: str = "") -> None:
    """One SMTP conversation, standard library only.

    `EmailMessage` rather than string concatenation because it does the header
    encoding and — the part that matters — refuses a header containing a
    newline. `normalise_address` already rejects those at the door; this is the
    second of the two.

    Plain text, no `multipart`, no HTML. There is nothing in these messages that
    HTML would carry better, and an HTML part is a place for a tracking pixel to
    arrive later without anybody deciding to add one.
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    # Gives the mail client its own unsubscribe button, which is both the
    # courteous thing and the thing that keeps a complaint from becoming a spam
    # report.
    #
    # ⚠️ **It carries the manage token, and it did not until 2026-08-05.** The
    # header was `<{base}/map/>` with the comment "the URL is already in the
    # body" — which was wrong in the one way that mattered: the body's URL has
    # the token and that one did not. A reader who pressed their client's
    # unsubscribe button landed on the map as an anonymous visitor, with no way
    # to identify themselves and nothing saying why the page looked ordinary.
    # It is the same URL as the body's now, so the button lands them on their
    # own manage face with the stop control on it.
    #
    # ⚠️ **That URL was `/map/?watch=` until 2026-08-16 and it was UNREACHABLE.**
    # `/map` is wrapped in `RequireSession`, so pressing a mail client's
    # unsubscribe button sent a subscriber with no Fluud account to a sign-in
    # page — the same failure the body's link had, and the one
    # `api._AUTH_EXEMPT` exempts `/api/watch/unsubscribe` to prevent. It is
    # `/watch/?watch=` now, a page with no session gate. See
    # `web/src/app/watch/page.tsx`.
    #
    # ⚠️ **`List-Unsubscribe-Post` is deliberately absent, so this is not RFC
    # 8058 one-click.** That header tells a provider it may POST to this URL and
    # unsubscribe with no further interaction. Every other mutation in this
    # feature is a POST with a token in a JSON body precisely because mail
    # clients prefetch, and `watch_unsubscribe`'s docstring says a prefetched
    # unsubscribe silently removes somebody who pressed nothing. Adding
    # one-click means adding a route that hard-deletes a person on an
    # unauthenticated form POST. The cost of leaving it out is one extra press
    # for the reader; the cost of putting it in is a delete somebody did not ask
    # for. If a relay ever demands one-click for deliverability, that is the
    # trade to reopen — and it is a decision, not a header.
    #
    # ⚠️ The gating and the reason it does not go through `_link` moved into
    # `unsubscribe_header` on 2026-08-16, so `check_mail.py` can assert the one
    # header in this feature that carries a bearer credential. This function
    # opens a socket and a check script cannot drive it.
    header = unsubscribe_header(manage_token)
    if header:
        msg["List-Unsubscribe"] = header
    msg.set_content(body)

    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout
    ) as s:
        if settings.smtp_starttls:
            s.starttls()
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


def drain(limit: int, budget_s: float) -> dict:
    """Send what is queued, bounded twice. Returns counts by status.

    ⚠️ **Both bounds are load-bearing and neither is an optimisation.** This
    runs at the end of `poll.tick`, inside a 60-second serial budget that
    `poll.FETCH_WORKERS` is already sized against. `limit` caps the work; the
    wall-clock budget caps the damage when each unit of work is a socket to a
    host that has stopped answering. A dead SMTP server with a 10s timeout and
    no budget is 25 messages × 10s = four minutes inside a one-minute tick, and
    the visible symptom would be the poller appearing to freeze — the frozen-poller rule's
    failure caused by the feature that exists to work around it.

    The budget is checked *before* each send rather than after, so it bounds the
    start of the last message rather than its end. Worst case overrun is
    therefore one `smtp_timeout`, which is why that setting is bounded too.
    """
    now = datetime.now(timezone.utc)
    started = time.monotonic()
    counts: dict[str, int] = {}

    rows = db.pending_outbox(limit)
    for i, row in enumerate(rows):
        if time.monotonic() - started >= budget_s:
            # Anything unclaimed stays queued; anything claimed and not reached
            # goes back to the pool so the next tick can take it.
            for rest in rows[i:]:
                db.mark_outbox(rest["id"], "queued")
            counts["deferred"] = len(rows) - i
            log.info("mail drain hit its %.0fs budget with %d left", budget_s,
                     len(rows) - i)
            break
        status = deliver(row, now)
        db.mark_outbox(row["id"], status)
        counts[status] = counts.get(status, 0) + 1

    return counts


def _mask(addr: str) -> str:
    """`joaquin@example.com` -> `j••••••@example.com`.

    Logs are the one place an address reliably outlives the row it came from —
    the host keeps them, the cascade does not reach them, and nothing here
    prunes them. Masking is the cheapest way to keep `delete_subscriber` from
    being undone by the log of the message that was sent before it.
    """
    local, _, domain = addr.partition("@")
    if not domain:
        return "••••"
    return f"{local[:1]}{'•' * max(1, len(local) - 1)}@{domain}"
