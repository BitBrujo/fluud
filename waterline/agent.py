"""Warning copy.

A design decision worth defending out loud: **the warning is templated, not
generated.** An LLM writing safety-critical copy can hallucinate a depth, a
street, or a reassurance, and there is no reviewer between it and the person
reading it. Templates cannot. The LLM's job here is confined to the
conversational Q&A context — the part where being wrong is recoverable because
a human is asking follow-ups.

The second rule is about what we are never allowed to say. This system does not
tell anyone they are safe. "No flooding detected at this camera" is a claim
about the instrument. "You are safe" is a claim about the world, and we cannot
see the side streets, the basements, or the block behind the camera.

⚠️ **The `mail_*` keys are an ENVELOPE around the same warnings, not a second
set of them.** A watch email's body is `warning_text_for_depth` output —
verbatim, the identical reviewed sentences the page renders — wrapped in a
subject, a freshness line, a disclaimer and an unsubscribe link. That is the
whole reason `warning_text` was split: two renderings of one warning is two
places for it to diverge, and only one of them would be the one anybody read.

The genuinely new copy is the four things the page has no equivalent for —
confirming an address, saying an instrument has gone quiet, saying an episode
has closed, and the footer. All four are held to the same rules as everything
above, and one of them carries the never-safe rule explicitly: `mail_confirm` states
*"This is not a statement about conditions."* before anybody relies on the
feature. ⚠️ **Two keys that ENDED on that sentence are gone** — `mail_silence`
and `mail_standdown`, removed 2026-08-05 — and `scripts/check_escalation.py`
records what that cost the contract at the assert that used to cover them.
That sentence is load-bearing in both. A stand-down is the single most
dangerous message this system sends, because the reader will hear "it's over"
however carefully it is worded.

⚠️ **The three level keys hold SEVERAL reviewed sentences, and which one you
get is a HASH — never a draw.** `random.choice` here breaks three things and
only the first shows up in a test run:

1. `scripts/check_escalation.py` asserts `warning_text` and
   `warning_text_for_depth` are an identity over a level × depth × language ×
   seed grid. A draw makes that flaky, and a safety check that fails one run in
   three is a safety check somebody disables.
2. `poll._queue_watch` renders once PER SUBSCRIBER. Five people watching one
   episode would get five different sentences, none of them the one on the page.
3. `alerts.message_en` is persisted by `db.mark_spoken` and `/api/speak`
   re-renders from that row minutes later. The stored warning and the live
   warning would drift apart.

So `variant_index` is a pure function of the episode, the corner and the level.
`Math.random()` here would be a bug that looks like a feature: it would pass
every casual read and fail only in production, per subscriber, silently.

Variants do NOT relax anything. Every one is reviewed copy in this file, every
one is bound by the narrowing-variation rule (the count per level is itself the
ramp: six at `watch`, four at `warning`, three at `emergency`, where the
variants differ only in their opening sentence and the instruction block never
moves), and `warning_text_for_depth` is still the only place any of them is
produced.
"""

from __future__ import annotations

from .models import Level, Observation

# Languages matter more here than in almost any app of this shape. Eleven of
# the thirteen people who died in NYC during Ida died in basement apartments,
# concentrated among immigrant families in Queens. NWS alerts are English,
# text, and county-scale.
#
# EN and ES below are usable. The remaining languages are SCAFFOLDS and are
# deliberately left untranslated rather than machine-translated: a mistranslated
# flood warning is worse than no warning. Get a speaker to review before these
# are spoken to anyone.
SUPPORTED = ["en", "es"]
PENDING_REVIEW = ["zh", "bn", "ht", "ru", "ar"]

# THE COPY IS AN INSTRUMENT REPORTING, AND IT HAS NO CHARACTER AT ANY LEVEL.
#
# ⚠️ **This file used to speak as a sewer rat**, and the escalation was legible
# because you could watch the animal stop joking: voice at WATCH, thinner at
# WARNING, gone by EMERGENCY. **The character was removed on 2026-08-14 with the
# rename to Fluud**, in both languages, at every level. What replaces it is not
# a quieter voice — it is no voice. Every sentence is now the same three moves:
# name the corner, state what the instrument observed, give one action.
#
# ⚠️ **The EMERGENCY variants did not change and are byte-identical to what
# shipped before the rename.** They already carried no character — that was the
# bottom of the old ramp — so removing it cost them nothing, and leaving them
# untouched is the safest available outcome for the most dangerous message this
# system sends. **Do not "harmonise" them with the two levels above.**
#
# ⚠️ THE THREE LEVEL KEYS HOLD A TUPLE OF VARIANTS. The other keys hold one
# string. That asymmetry is deliberate — see `variants` and `template` — and
# `scripts/check_escalation.py` asserts which keys are which, in both languages.
#
# ⚠️ **A MISSING TRAILING COMMA MAKES A TUPLE A STRING**, and nothing downstream
# raises: `("The sewer " "is filling.")` is a 22-character `str` whose `[0]` is
# `'T'`, so it is indexable, it has a length, `variants()` reports 22 of them and
# a subscriber is sent `T`. This is one copy edit away for the life of this file,
# which is why the first assertion in the block is `isinstance(v, tuple)`.
#
# ⚠️ **The COUNT per level is still a ramp — 6 at watch, 4 at warning, 3 at
# emergency — but it no longer means what it used to mean.** It was the
# shrinking-character rule in a third form. With no character to shrink, what
# the ordering now encodes is how much VARIATION is permitted:
#
#   · `watch` fires most often and reaches a subscriber watching several corners
#     in one storm, so six openings keep that from reading as one form letter
#     posted six times. Nothing about the level is dangerous enough for the
#     variation to cost anything.
#   · `emergency` is capped at three and they differ ONLY in their opening
#     sentence. Every variant is a separate life-safety review of one identical
#     instruction block, and recognition is speed for somebody below street
#     level — the words that matter must never move.
#
# `check_escalation.py` asserts the ordering rather than the three numbers, so
# adding copy at `watch` stays free and adding it at `emergency` has to argue.
#
# ⚠️ **The old counts were 16 / 11 / 3.** Sixteen ways to plainly state one
# observation is sixteen chances for two of them to drift apart in review, in two
# languages, with nothing able to assert that variant *i* in `es` still
# translates variant *i* in `en`. Fewer variants is a REVIEWABILITY property now
# that they are no longer carrying a voice.
LEVEL_KEYS: tuple[str, ...] = tuple(
    l.value for l in Level if l is not Level.CLEAR
)

_TEMPLATES: dict[str, dict[str, str | tuple[str, ...]]] = {
    "en": {
        # Six. This is the level a subscriber reads most often across a season,
        # and the one that reaches somebody watching several corners in one
        # storm — hence six openings rather than one.
        #
        # Every one of them: names the corner, claims only the PIPE rather than
        # the street, and ends on an action somebody below grade can take now.
        #
        # ⚠️ None of them carries `{depth}` — a measurement in the sentence
        # whose whole claim is that there is nothing up top yet is a
        # contradiction, and `str.format` will not catch it.
        #
        # ⚠️ **"Nothing on the street yet" is the strongest thing any of these
        # may say about the street, and it is a claim about an INSTRUMENT.**
        # `clear`, `dry`, `fine` and `safe` are all one word away and all of them
        # are the never-safe rule broken in the one message that arrives
        # uninvited. The old copy held this line through sixteen variants; hold
        # it through six.
        "watch": (
            # ⚠️ Variant 0 is quoted verbatim by `landing/landing-sections.tsx`
            # AND pinned by `scripts/check_escalation.py`'s `LANDING_QUOTE`.
            # Reword it and the landing page becomes a second author of warning
            # copy — the check script fails, and it is telling you to update the
            # page, not to update the pin.
            "The sewer under {place} is filling. Nothing on the street yet. If "
            "you are below street level, check your exit now.",

            "Water is rising in the drain at {place}. Nothing on the street "
            "yet. This is the time to clear the way out of your basement.",

            "The pipes under {place} are running full. Nothing on the street "
            "yet. If you sleep below the sidewalk, walk your exit now.",

            "Water is climbing the sewer line at {place}. Nothing on the street "
            "yet. Move what you cannot replace off the basement floor.",

            "The drain at {place} is backing up. Nothing on the street yet. "
            "Know how you get out of any space below grade.",

            "The sewer under {place} is filling and the street has not caught "
            "up. If you are below street level, find your exit now.",
        ),
        # Four. Every one carries the depth, says get out of the basement and go
        # UP, and refuses driving — that last one is not decoration. Most flood
        # deaths in a car are people who thought they could see the bottom.
        "warning": (
            "Water is on the street at {place}. {depth}. If you are below "
            "street level, leave now and go up. Do not walk or drive into it.",

            "There is water at street level at {place}. {depth}. Get out of any "
            "basement and go up a floor. Do not drive through it.",

            "{place} has water on the street. {depth}. Clear the basement and "
            "take anyone downstairs up with you. Do not drive into it.",

            "The street at {place} is taking water. {depth}. If you are below "
            "grade, that is your exit cue. Go up. Do not walk or drive into it.",
        ),
        # ⚠️ **UNCHANGED across the 2026-08-14 rename.** These three are
        # byte-identical to what shipped before the character was removed,
        # because they never carried any. Instructions only.
        #
        # ⚠️ **Three, and they differ ONLY in the opening sentence.** Everything
        # from `{depth}` onward is byte-identical across all three, and
        # `scripts/check_escalation.py` asserts exactly that. Somebody below
        # street level may have read this before, and recognition is speed — so
        # the words that carry the instruction never move. The opening varies
        # only because a subscriber to ten corners should not get ten identical
        # emails in one storm.
        #
        # This is the shortest tuple on purpose. Every variant here is a
        # separate life-safety review of the same four instructions, and the
        # reader gets whichever one the hash lands on.
        "emergency": (
            "Water at {place} is above the curb. {depth}. If you are below "
            "street level, get out and get up now. Call 911 if you cannot. "
            "Do not walk or drive into this water.",

            "Water at {place} has passed the curb and is on the sidewalk. "
            "{depth}. If you are below "
            "street level, get out and get up now. Call 911 if you cannot. "
            "Do not walk or drive into this water.",

            "Water at {place} is over the curb and still rising. "
            "{depth}. If you are below "
            "street level, get out and get up now. Call 911 if you cannot. "
            "Do not walk or drive into this water.",
        ),
        "unknown_depth": "no confirmed depth nearby",
        "depth_mm_phrase": "{n} millimeters",
        "depth_in_phrase": "about {n} inches",
        # ⚠️ **The deferral sentence was removed on 2026-08-05, on the owner's
        # instruction, and it went from EVERY surface at once** — this is the one
        # string, so the footer on all four pages, `/about` and the footer of
        # every warning email lost it in the same edit. It read: *"For official
        # warnings, follow the National Weather Service and Notify NYC."*
        #
        # ⚠️ **The root `CLAUDE.md` Never rule it belonged to is
        # `Never present output as an official warning. Defer to NWS and Notify
        # NYC.`** The first half is unchanged and still enforced by everything
        # this file does — nothing here has ever claimed to be an official
        # warning. What is gone is the second half said OUT LOUD to a reader.
        #
        # The mail path is the loss worth naming, because it is the one with no
        # page around it: a subscriber reading this at 3am has an inbox, no map,
        # no chips, no `/about` link in front of them, and now nothing naming the
        # authority they should be listening to instead. `/terms` and `/about`
        # both still say it; neither is in that inbox.
        #
        # **If it comes back, it comes back HERE** — one string, both languages,
        # every surface at once. Splitting it so the page and the inbox say
        # different things is the shape this deliberately does not have.
        "disclaimer": "Fluud is a prototype, not an emergency service.",

        # --- the mail envelope ---------------------------------------------
        # One subject per level rather than one for all three. A single line
        # reading "water at {place}" is simply FALSE at `watch`, where the
        # body's own first claim is that there is nothing on the street yet —
        # and a subject is the part most people read and the only part some of
        # them read. Invariant 14 binds these too: the character drops out as
        # the water rises, and `emergency` is bare.
        "mail_subject_watch": "Fluud: the pipes are filling under {place}",
        "mail_subject_warning": "Fluud: water on the street at {place}",
        "mail_subject_emergency": "Fluud: water above the curb at {place}",
        "mail_subject_confirm": "Fluud: confirm this address",
        "mail_subject_resend": "Fluud: your link",

        # ⚠️ **Reworded 2026-08-06 to the `Map flows` design's structure (screen
        # 1j)**: the "Somebody asked…" lead, the instrument list, the confirm
        # link, the "If that was not you…" sentence, and then the SAME honesty
        # sentence the watch panel renders — `watch_note`, byte-identical, which
        # `check_escalation.py` and `check_mail.py` both assert. The panel's
        # docstring has always claimed the email carries "the identical reviewed
        # sentence"; as of this rework that claim is literally true.
        #
        # Two things the design DROPS are kept, both deliberate deviations
        # recorded in the plan:
        # - the coverage-bias paragraph ("Fluud watches instruments, not
        #   neighborhoods…") — dropping it would be a thirteenth removal made
        #   here rather than by the owner, in an inbox at 3am where there is no
        #   page around the reader;
        # - the closing Notify NYC / NWS line — the eleventh removal took the
        #   deferral out of the one disclaimer string, and this sentence is the
        #   last one that reaches an inbox at sign-up. Same reasoning, larger
        #   stakes.
        #
        # The `{sensors}` lines carry the borough now — `api._sensor_names`
        # renders "name · borough" — so a reader confirming can tell two
        # same-named corners apart. The slots are unchanged.
        "mail_confirm": (
            "Somebody asked Fluud to email this address when these FloodNet "
            "instruments change:\n\n{sensors}\n\n"
            "Confirm it was you: {confirm_url}\n\n"
            "If that was not you, ignore this. Nothing is ever sent to an "
            "address that has not confirmed, and an unconfirmed address is "
            "deleted within a week.\n\n"
            "Fluud watches instruments, not neighborhoods. One sensor reads "
            "one corner. It cannot see your side street, your stairwell, or the "
            "block behind it, and most of New York has no sensor on it at all. "
            "Email is slow, and a message can arrive after the water does.\n\n"
            "A watch is best effort. If Fluud stops polling, you hear "
            "nothing. Silence is not a statement about conditions.\n\n"
            "For warnings that reach your phone, sign up for Notify NYC and "
            "follow the National Weather Service."
        ),
        # ⚠️ **Says nothing about any instrument, and that is the security
        # property rather than brevity.** This is the one message a stranger can
        # cause to be sent — `POST /api/watch/resend` takes an address and
        # nothing else. It goes only to an address that already confirmed, so
        # the worst it can do is put a link in the inbox of somebody who already
        # holds that link. Naming a corner here would let an attacker learn what
        # a mailbox they cannot read is watching, which is the targeting shape
        # LIMITATIONS §16 spends its length keeping this table clear of.
        "mail_resend": (
            "Somebody asked Fluud for the link to this address's watch "
            "settings.\n\n{manage_url}\n\n"
            "That link is the only key to it. Anyone holding it can see what "
            "this address watches and can stop the emails, so treat it the way "
            "you would treat a password.\n\n"
            "If it was not you, ignore this. Nothing about what you watch has "
            "changed, and no email address can be added to Fluud this way."
        ),
        # A footer for the one message with no instrument behind it. `mail_footer`
        # cannot serve here: its reading line describes an instrument's freshness
        # and its manage line repeats a URL this body has already given.
        "mail_disclaimer_only": "\n\n—\n{disclaimer}",
        # ⚠️ Carried by every `/api/watch/*` response and rendered on the panel.
        # It is HERE rather than in `api.py` because it is the whole honest
        # caveat on the feature, and a route composing its own version of it is
        # the templated-copy rule through a side door. It says the one thing a subscription
        # cannot promise: our silence is not information.
        # ⚠️ Shortened 2026-08-06 on the owner's instruction — the mail-rejected
        # / instrument-quiet / calm-night clause came out. The refusal sentence
        # survives and `check_escalation.py` still asserts both the verbatim
        # containment in `mail_confirm` and the refusal.
        "watch_note": (
            "A watch is best effort. If Fluud stops polling, you hear "
            "nothing. Silence is not a statement about conditions."
        ),
        "mail_reading_age": (
            "Reading taken {when}. Fluud polls this instrument about once a "
            "minute, and email adds its own delay on top.\n"
        ),
        "mail_reading_none": (
            "No reading has arrived from this instrument.\n"
        ),
        "mail_footer": (
            "\n\n—\n{reading}"
            "Stop these emails, or change what you watch:\n{manage_url}\n\n"
            "{disclaimer}"
        ),
    },
    "es": {
        # ⚠️ **Variant `i` here is the translation of variant `i` above**, and
        # `scripts/check_escalation.py` asserts the counts match but CANNOT
        # assert the pairing — that is a review property. Reordering one list
        # without the other silently gives a Spanish reader a different sentence
        # from the English one about the same episode.
        #
        # ⚠️ These 10 want a native-speaker pass before they are relied on.
        # `_depth_phrase` was English-only for the whole life of the mail
        # feature and rendered *"Hay agua en la calle en Ave C @ 23 St. about 2
        # inches."* — the one clause carrying the actual number, in the wrong
        # language, mid-sentence. It was found by rendering every template in
        # both languages side by side and READING them. Do that again here.
        #
        # ⚠️ **"Todavía no hay nada en la calle" is the ceiling here**, exactly
        # as "Nothing on the street yet" is in the English. The old Spanish
        # variant 9 read *"La calle se ve bien"* — the street looks fine — which
        # was the never-safe rule broken in Spanish only, with nothing in the
        # repo able to see it. It is gone and nothing like it may come back.
        "watch": (
            "La alcantarilla debajo de {place} se está llenando. Todavía no hay "
            "nada en la calle. Si está por debajo del nivel de la calle, revise "
            "su salida ahora.",

            "El agua está subiendo en el desagüe en {place}. Todavía no hay "
            "nada en la calle. Este es el momento de despejar la salida de su "
            "sótano.",

            "Las tuberías debajo de {place} van llenas. Todavía no hay nada en "
            "la calle. Si duerme por debajo de la acera, recorra su salida "
            "ahora.",

            "El agua sube por la línea del alcantarillado en {place}. Todavía "
            "no hay nada en la calle. Levante del piso del sótano lo que no "
            "pueda reponer.",

            "El desagüe en {place} se está devolviendo. Todavía no hay nada en "
            "la calle. Sepa cómo salir de cualquier espacio bajo el nivel del "
            "suelo.",

            "La alcantarilla debajo de {place} se está llenando y la calle "
            "todavía no lo alcanza. Si está por debajo del nivel de la calle, "
            "busque su salida ahora.",
        ),
        "warning": (
            "Hay agua en la calle en {place}. {depth}. Si está por debajo del "
            "nivel de la calle, salga ahora y suba. No camine ni maneje por el "
            "agua.",

            "Hay agua a nivel de la calle en {place}. {depth}. Salga de "
            "cualquier sótano y suba un piso. No cruce en carro.",

            "{place} tiene agua en la calle. {depth}. Desocupe el sótano y suba "
            "con quien esté abajo. No entre en carro.",

            "La calle en {place} está tomando agua. {depth}. Si está bajo el "
            "nivel de la calle, esa es su señal de salir. Suba. No camine ni "
            "maneje por el agua.",
        ),
        # ⚠️ **UNCHANGED across the 2026-08-14 rename**, like the English.
        # Same rule as the English: only the opening sentence varies, and the
        # instruction block from `{depth}` onward is byte-identical across all
        # three. Asserted, in both languages.
        "emergency": (
            "El agua en {place} está por encima del borde de la acera. {depth}. "
            "Si está por debajo del nivel de la calle, salga y suba ahora. "
            "Llame al 911 si no puede. No camine ni maneje por esta agua.",

            "El agua en {place} pasó el borde y está en la acera. {depth}. "
            "Si está por debajo del nivel de la calle, salga y suba ahora. "
            "Llame al 911 si no puede. No camine ni maneje por esta agua.",

            "El agua en {place} está por encima del borde y sigue subiendo. "
            "{depth}. "
            "Si está por debajo del nivel de la calle, salga y suba ahora. "
            "Llame al 911 si no puede. No camine ni maneje por esta agua.",
        ),
        "unknown_depth": "sin profundidad confirmada cerca",
        "depth_mm_phrase": "{n} milímetros",
        "depth_in_phrase": "unas {n} pulgadas",
        # See the note on the `en` disclaimer. Both languages lost the deferral
        # in the same edit, which is the only safe way to drop it: a Spanish
        # reader keeping a sentence an English reader no longer gets would make
        # the two versions different products rather than one in two languages.
        "disclaimer": "Fluud es un prototipo, no un servicio de emergencia.",

        # --- the mail envelope ---------------------------------------------
        "mail_subject_watch": (
            "Fluud: se están llenando las tuberías debajo de {place}"
        ),
        "mail_subject_warning": "Fluud: hay agua en la calle en {place}",
        "mail_subject_emergency": (
            "Fluud: el agua está por encima del borde de la acera en {place}"
        ),
        "mail_subject_confirm": "Fluud: confirme esta dirección",
        "mail_subject_resend": "Fluud: su enlace",

        # Same 1j structure as the English, same two kept paragraphs, and the
        # honesty sentence is `watch_note` (es) verbatim — asserted. ⚠️ This
        # rewording is my translation and is owed a native-speaker pass, on the
        # same terms as the 30 rat variants.
        "mail_confirm": (
            "Alguien le pidió a Fluud que escribiera a esta dirección "
            "cuando cambien estos instrumentos de FloodNet:\n\n{sensors}\n\n"
            "Confirme que fue usted: {confirm_url}\n\n"
            "Si no fue usted, ignore este mensaje. Nunca se envía nada a una "
            "dirección que no ha confirmado, y una dirección sin confirmar se "
            "borra en una semana.\n\n"
            "Fluud vigila instrumentos, no vecindarios. Un sensor lee una "
            "esquina. No ve su calle lateral, ni su escalera, ni la cuadra de "
            "atrás, y la mayor parte de Nueva York no tiene ningún sensor. El "
            "correo es lento, y un mensaje puede llegar después del agua.\n\n"
            "Vigilar es un servicio de mejor esfuerzo. Si Fluud deja de "
            "consultar, usted no recibe nada. El silencio no es una afirmación "
            "sobre las condiciones.\n\n"
            "Para avisos que llegan a su teléfono, inscríbase en Notify NYC y "
            "siga al Servicio Meteorológico Nacional."
        ),
        "mail_resend": (
            "Alguien le pidió a Fluud el enlace de la configuración de "
            "vigilancia de esta dirección.\n\n{manage_url}\n\n"
            "Ese enlace es la única llave. Cualquiera que lo tenga puede ver "
            "qué vigila esta dirección y puede detener los correos, así que "
            "trátelo como trataría una contraseña.\n\n"
            "Si no fue usted, ignore este mensaje. Nada de lo que usted vigila "
            "ha cambiado, y por esta vía no se puede agregar ninguna dirección "
            "a Fluud."
        ),
        "mail_disclaimer_only": "\n\n—\n{disclaimer}",
        "watch_note": (
            "Vigilar es un servicio de mejor esfuerzo. Si Fluud deja de "
            "consultar, usted no recibe nada. El silencio no es una afirmación "
            "sobre las condiciones."
        ),
        "mail_reading_age": (
            "Lectura tomada {when}. Fluud consulta este instrumento "
            "aproximadamente cada minuto, y el correo añade su propia "
            "demora.\n"
        ),
        "mail_reading_none": (
            "No ha llegado ninguna lectura de este instrumento.\n"
        ),
        "mail_footer": (
            "\n\n—\n{reading}"
            "Para dejar de recibir estos correos, o cambiar lo que vigila:\n"
            "{manage_url}\n\n{disclaimer}"
        ),
    },
}


# FNV-1a, 32-bit, with the xorshift-multiply finisher. Chosen for the reason
# restated in this module's docstring: a draw would be a bug that looks like a
# feature.
#
# ⚠️ **There was a TypeScript twin of this and it is deleted.** `ratFor` in
# `web/src/components/neighborhood-back.tsx` picked a graffiti image by hashing
# a camera id, and the note here used to say the two shared a TECHNIQUE and not
# their VALUES — that one read UTF-16 code units through `charCodeAt`, this
# reads UTF-8 bytes, so they agreed on ASCII and diverged above it. The
# neighbourhood card went with the rodent feature on 2026-08-14. **This is the
# only implementation left, nothing compares it to anything, and no assertion
# may ever claim it matches something in the web tree.**
_FNV_OFFSET = 0x811C9DC5
_FNV_PRIME = 0x01000193
_M32 = 0xFFFFFFFF


def _hash32(key: str) -> int:
    h = _FNV_OFFSET
    for b in key.encode("utf-8"):
        h = ((h ^ b) * _FNV_PRIME) & _M32
    # The avalanche step. It is what stops a future key layout that puts the
    # varying part LAST from clumping silently — bare, FNV-1a's low bits are
    # weakly mixed and a `% n` over keys sharing most of their structure comes
    # out lumpy. `scripts/check_escalation.py` pins this function's output, since
    # changing a constant here reshuffles which sentence every corner in the
    # city gets AND desynchronises every `alerts.message_en` already written.
    h ^= h >> 16
    h = (h * 0x7FEB352D) & _M32
    h ^= h >> 15
    return h


def variants(level: Level, lang: str = "en") -> tuple[str, ...]:
    """Every reviewed way of saying this level, in this language.

    The `en` fallback on an unknown language matches `warning_text_for_depth`
    and `template`; `api.speak` refuses an unreviewed language at the door
    (the reviewed-language rule), so nothing legitimately arrives here needing one.
    """
    t = _TEMPLATES.get(lang) or _TEMPLATES["en"]
    return t[level.value]  # type: ignore[return-value]


def variant_index(place: str, level: Level, seed: str, n: int) -> int:
    """Which of `n` variants. A pure function of its arguments, never a draw.

    ⚠️ **The three parts of the key are three different stability promises**,
    and dropping any one of them is a real behaviour change:

    - `seed` is the EPISODE. It is what makes the pick stable across a repeated
      render, across `mail.py`'s per-subscriber loop, and between
      `alerts.message_en` and what `/api/speak` re-renders minutes later — and
      what makes the next flood at the same corner a different sentence.
    - `place` is the CORNER, so one storm across eight instruments does not read
      as one form letter posted eight times. It is the whole key for a caller
      with no episode, which is why an unseeded drill still varies by place.
    - `level` re-rolls on escalation, so corners do not all walk
      first-watch-line → first-warning-line → first-emergency-line forever,
      which is three tuples behaving exactly like three strings.

    `\\x1f` (unit separator) rather than `|` or `:`, because a place name comes
    from the DOT and FloodNet feeds and must not be able to forge another
    episode's key.

    The `n <= 1` short-circuit is BEFORE the hash, so a level with one variant
    is provably independent of every argument — that is what let the mechanism
    land as a no-op ahead of the copy.
    """
    if n <= 1:
        return 0
    return _hash32(f"{seed}\x1f{place}\x1f{level.value}") % n


def warning_text(
    level: Level, obs: Observation, place: str, lang: str = "en", *, seed: str = ""
) -> str:
    """The exact words the page renders. Deterministic by construction.

    A thin shim over `warning_text_for_depth`, which is the implementation. The
    depth is the only thing either of them reads off the observation — the rest
    of it gates *whether* there is a warning, never what it says — so the
    sensor path can reach the same sentences without inventing an
    `Observation` it has no camera for. `scripts/check_escalation.py` asserts
    the delegation is an identity over the whole level × depth × language ×
    seed grid, so the two cannot drift into two warnings.

    ⚠️ **`seed` is passed through verbatim and is never derived from `obs`.**
    Reaching for `obs.camera_id` here is the tempting mistake, and it would
    break that identity only on the sensor-watch path — the one with no camera,
    and the one whose words go to an inbox rather than to a screen somebody is
    already looking at.
    """
    return warning_text_for_depth(level, obs.depth_mm, place, lang, seed=seed)


def warning_text_for_depth(
    level: Level,
    depth_mm: float | None,
    place: str,
    lang: str = "en",
    *,
    seed: str = "",
) -> str:
    """The warning, from a level and a depth and nothing else.

    ⚠️ **This is the only place warning copy is produced, for the page and for
    the mail both.** A second implementation for email would be a second set of
    sentences to review, and the one nobody re-read would be the one that went
    to an inbox at 3am. It is also the only thing allowed to pick a variant —
    `template()` refuses the level keys outright for that reason.
    """
    if level is Level.CLEAR:
        return ""
    t = _TEMPLATES.get(lang) or _TEMPLATES["en"]
    choices: tuple[str, ...] = t[level.value]  # type: ignore[assignment]
    text = choices[variant_index(place, level, seed, len(choices))]
    return text.format(place=place, depth=_depth_phrase(depth_mm, t))


def _depth_phrase(depth_mm: float | None, t: dict[str, str | tuple[str, ...]]) -> str:
    """The measurement, in the language of the sentence around it.

    ⚠️ **This used to hard-code English**, so a Spanish `warning` read *"Hay agua
    en la calle en Ave C @ 23 St. about 2 inches."* — the one clause in a
    life-safety message that carries the actual number, in the wrong language,
    mid-sentence. `unknown_depth` was localised beside it the whole time, which
    is how it survived: the absence case read correctly and the present case did
    not. It surfaced when the mail envelope made every template renderable side
    by side and somebody read them.

    Same numbers and same units in both languages — a New Yorker reading Spanish
    is still being told about a city that measures curbs in inches. Only the
    nouns change.
    """
    if depth_mm is None:
        return str(t["unknown_depth"])
    inches = depth_mm / 25.4
    if inches < 1:
        return str(t["depth_mm_phrase"]).format(n=f"{depth_mm:.0f}")
    return str(t["depth_in_phrase"]).format(n=f"{inches:.0f}")


def disclaimer(lang: str = "en") -> str:
    return str((_TEMPLATES.get(lang) or _TEMPLATES["en"])["disclaimer"])


def template(key: str, lang: str = "en") -> str:
    """One raw template string, unformatted. For `mail.py`'s renderer.

    ⚠️ **The point of exporting the string rather than a rendered message is
    that `mail.py` never composes a sentence** — it picks a key and fills slots.
    Invariant 6 is about where words come from, and it does not stop being true
    because the transport changed. The fallback to `en` on an unknown language
    matches `warning_text_for_depth`; `api.speak` refuses an unreviewed language
    at the door (the reviewed-language rule) so nothing legitimately arrives here needing one.

    ⚠️ **This door is CLOSED to the three level keys**, which hold a tuple of
    variants rather than one string. Left open, `template("watch")` hands
    `mail.py` a tuple and `.format` raises `AttributeError` somewhere inside
    `render` — on the one transport in this repo that pushes to a person, with a
    message that names neither the cause nor the fix. The right door is
    `warning_text_for_depth`, which is the only thing allowed to pick a variant,
    and this error says so.
    """
    if key in LEVEL_KEYS:
        raise KeyError(
            f"{key!r} holds warning variants, not one template. Call "
            f"warning_text_for_depth() — it is the only thing that may pick one."
        )
    t = _TEMPLATES.get(lang) or _TEMPLATES["en"]
    return str(t[key])


def conversation_context(obs: Observation, place: str, level: Level) -> str:
    """Context for any conversational layer bolted on later — a chat box, and a
    chat box specifically. Speech was removed on accessibility grounds and
    should not come back through this door. Keeps a Q&A layer able to answer
    follow-ups without inventing numbers. Not used by the templated warning
    path, which is deliberate — see the module docstring.

    ⚠️ **This is the whole of the not-an-official rule**, and it is the one
    place in this repo where words are produced by a model rather than picked
    from a reviewed list. The persona was a sewer rat until 2026-08-14 and is
    now an instrument; what did NOT change is every constraint under it. A
    persona that can be talked into speaking for the city is the same defect
    whatever it is a persona OF.
    """
    depth = (
        f"{obs.depth_mm:.0f}mm ({obs.depth_mm / 25.4:.1f} in)"
        if obs.depth_mm is not None
        else "no co-located sensor — depth unknown"
    )
    return (
        "You are Fluud, a prototype flood-monitoring instrument in New York "
        "City. You read FloodNet's street-level depth sensors and you report "
        "what they observe. That is your only authority. You are not a person, "
        "not an official, and not a city agency, and you must never claim to "
        "speak for the city, for FloodNet, or for any agency.\n\n"
        "You have no personality and no character to perform. Answer plainly "
        "at every level. Someone in a basement may be reading this, and "
        "anything that is not the answer costs them seconds.\n\n"
        f"Current status for {place}: alert level {level.value}. "
        f"FloodNet depth: {depth}. "
        f"NWS flood alert active: {'yes' if obs.nws_active else 'no'}. "
        f"Mode: {obs.mode}.\n\n"
        "RULES YOU MUST FOLLOW:\n"
        "1. Never tell anyone they are safe. You can only say what this sensor "
        "observes. Side streets, basements, and everything the instruments do "
        "not cover are invisible to you — say so when asked.\n"
        "2. Never invent a depth. If there is no co-located sensor, say the "
        "depth is unknown.\n"
        "3. Always defer to the National Weather Service and Notify NYC for "
        "official warnings. You are a prototype.\n"
        "4. If someone says they are in a basement and water is rising, tell "
        "them to get to higher ground immediately and call 911. Do not "
        "hedge, do not ask clarifying questions first.\n"
        "5. Keep answers under three sentences. People are reading this under "
        "stress, on a phone, possibly in the dark."
    )
