# CLAUDE.md — the check scripts

Eight Python entry points and one runner. The root `CLAUDE.md` says what each
one covers; **this file is about how they are written**, because the idiom is
unusual on purpose and every part of it was chosen against a failure that
actually happened.

```
check                  THE RUNNER. The one command before a deploy
check_escalation.py    the DORMANT camera machine — AND the whole COPY contract
check_watch.py         the LIVE sensor state machine. A SIBLING, not an extension
check_notify.py        preferences may subtract, never add, never mute EMERGENCY
check_ingest.py        the parse layer — floodnet · gauges · cameras.
                       ⚠️ since 2026-08-16 it pins `cameras.pair_tier` — BOTH
                       bounds inclusive, matching `pair_cameras`' own
                       `best[0] <= max_m`, and the branch past `MAX_PAIR_M`
                       returning `unpaired` because WITHHOLDING a depth is the
                       safe direction for a stale row. It also drives
                       `camera_from_row` with no network (`gauges._ts`'
                       precedent) and asserts `area` reaches `borough` **without
                       moving the NAME** — that field is read TWICE and the two
                       reads are different questions. ⚠️ **And it asserts the
                       words `gold` / `silver` never reach a tier VALUE**; the
                       copy half of that rule is
                       `web/tests/camera-filter.test.ts`
check_models.py        the wire contract — extras forbidden, timestamps aware.
                       ⚠️ since 2026-08-15 it also pins `PollWrites`, whose five
                       fields are ALL nullable on purpose: three different
                       absences carry three different meanings, and tightening
                       any one of them turns *no poller has ticked in this mode*
                       into a 500.
                       ⚠️ since 2026-08-16 it pins `WatchSubscribeResponse`'s
                       literal set at exactly `{pending, confirmed}`, keeps
                       `manage_token` OPTIONAL, and asserts the three other
                       watch shapes carry no `manage_token` at all. That token
                       is a non-expiring bearer credential and `confirm` /
                       `subscribe` are the only two responses allowed to carry
                       it. ⚠️ **The literal set is the whole of what a script
                       can hold about the verified-self branch** — the branch
                       itself needs a database, a network and a token signed by
                       somebody else, which is `auth.py`'s own hole.
                       ⚠️ since 2026-08-16 it also pins `CameraEntry`, and the
                       assertion that earns it is a NEGATIVE one: **the model
                       declares no `distance_m`**, and no field named for a
                       distance at all. The tier crosses the wire as a
                       classified string — `alert_permitted`'s shape — because
                       *never colour a distance* binds any monotone ramp over
                       distance, not only hue. **That is the assertion that
                       catches a revert.** It also pins `depth_observed_at`
                       being present and a bare `observed_at` being ABSENT: one
                       is FloodNet's publication clock and the other is our
                       poller's tick, and the distinct name is the safeguard
check_mail.py          the outbound copy path, AND the transport predicate.
                       ⚠️ the one that needs psycopg. ⚠️ since 2026-08-16 it
                       also pins the CALL SITES' link paths and asserts that no
                       rendered body contains `/map/?` — see below
check_rat.py           the DORMANT event bus — replay age, `drill`, emit()
check_neon.py          ⚠️ the compute-suspend contract. The endpoint is DERIVED
                       from `DATABASE_URL` so no setting can point it at a
                       different database than the one it is connected to, and
                       a grep asserts the credential is unreachable from
                       `watch`, `escalation`, `api`, `mail`, `rat` and `agent`
parity_constants.py    PRINTS the Python half of every duplicated number
nta.py                 regenerates waterline/nta.py. BY HAND, not a check
```

⚠️ **Two of these check dormant modules and both stay.** `escalation.py` and
`rat.py` have no caller — the on-page alert system was unwired — and their
scripts keep running so putting the warning back is a re-wire rather than a
rebuild. `check_escalation.py` in particular is where **all** the copy
assertions live, and that copy still governs the live mail path.

## ⚠️ There is no `check_auth.py`, and that is a hole rather than an omission

`waterline/auth.py` is the only thing standing between an unauthenticated caller
and every reading this service holds, and **nothing in this directory covers
it.** The idiom cannot reach it: verifying a JWT needs a network, a JWKS, and a
token signed by somebody else's key — none of which a plain-asserts script with
no dependencies can produce.

**A bug in that module is a security bug, not a wrong number**, so it is worth
naming what stands in for a script here:

- `poll probe`'s **`auth`** line, which fetches the real key set and fails loudly
  on a wrong `NEON_AUTH_URL`. That is the only automated thing that can.
- A **hand pass against four bad credentials** — malformed, wrong scheme, empty,
  and an `alg: none` forgery — recorded with its results in `MEASUREMENTS.md`.
  ⚠️ **Re-run it by hand after touching `auth.py`.** `./scripts/check` will stay
  green through anything you do to that file.

⚠️ **The gate is a middleware with a list of EXEMPTIONS, which is what keeps a
new route closed by default.** No script asserts that list. If one is ever
written, the property worth asserting is that `_AUTH_EXEMPT` has not grown —
that is the one change that silently opens a route.

## The shape, and why it is not pytest

**Plain asserts in a `check(...)` helper, no test framework, no fixtures, no
conftest.** `watch.py`, `escalation.py`, `agent.py`, `notify.py` and `peaks.py`
are pure precisely so this is possible: no database, no network, no event loop,
nothing to mock. A contributor with a bare Python 3.11 can run the whole safety
contract.

That is a real property and it is worth defending. Adding pytest here would make
the safety contract depend on a dependency resolving — on the machine, at 11pm,
before a deploy.

⚠️ **`set -e` is OFF in `check`, deliberately.** It **collects** every failure
and exits 1 at the end. A runner that stops at the first failure tells you about
one broken thing per run, and the whole point of a pre-deploy gate is to hand
back the full list.

⚠️ **The scripts follow the same rule internally**: `check()` accumulates rather
than raising. Which produces the trap below.

## ⚠️ In a script that accumulates, any assertion downstream of a CRASH is decorative

This is the sharpest lesson in this directory and it was learned by measurement.

Eight mutations were driven through `check_escalation.py` while the rat variants
were built. Six failed with a named assertion. **Two produced a traceback
instead**, and in both cases the correct assertion had already recorded its
failure and **never got to print**, because a later line crashed first:

- a bare-string level key made `Formatter().parse` raise *"Single '{'
  encountered"*;
- a typo'd slot made `.format` raise `KeyError: 'plce'` inside the purity grid.

Both now have a **gate that bails to the report** before anything renders. The
general form: if your script accumulates failures, a crash anywhere silently
discards the report, and every assertion after the crash point may as well not
exist.

**So: test the checker by breaking the thing it checks.** A green run proves
nothing about a script nobody has seen fail. This applies to
`web/tests/parity.test.ts` identically.

## What each script may import

⚠️ **No network, no database, no `.env` requirement** — with exactly one
exception, and it is not a style point:

- **`check_mail.py` needs `psycopg` INSTALLED.** `mail.py` imports `db`, which
  imports `psycopg`. It opens **no connection**; it needs the dependency
  present. `scripts/check` prefers `.venv/bin/python` for this reason alone.
- **`parity_constants.py` may import only pure or config-only modules.** It runs
  from a *vitest* process with no `.env` guaranteed and no Postgres. ⚠️
  **Importing `db` there breaks the web test suite**, not this directory.

⚠️ **No script here can see SQL.** `db.py`'s queries carry real safety
properties — every depth peak is taken over `plausible` readings only, and the
faulted rows are counted rather than merely dropped — and a `where` clause is
exactly the kind of thing a later tidy-up edits. **Four queries hold that rule**,
not two. Nothing here asserts any of them, because asserting them means a
database and these scripts refuse one. The enforcement is the comment at each
query and review. **This is the same standing gap CSS has** — a rule no checker
can reach, because nothing in `./scripts/check` can read a stylesheet — and it is
recorded rather than closed. The worked example used to be `.wl-swell`, whose
whole safety property was prose; that class is deleted and the argument it
carried now lives as a comment at the point of deletion in `globals.css`.

⚠️ **`api.py` is in that same blind spot**, and `/api/watch/resend` put a
life-of-the-feature rule inside it: the two SQL predicates partition the table
so neither branch can send the other's message, `CONFIRM_RESENDS_MAX` caps the
unconfirmed branch, and all four states answer with one body. **No script here
can reach any of it.** The docstrings at `api._resend_confirmation` and
`CONFIRM_RESENDS_MAX` are the enforcement.

### ⚠️ `check_mail.py` MUTATES settings, and it is the only script here that does

Its transport grid sets `mail.settings.mail_transport` and
`mail.settings.smtp_host` across five pairs, because the property being pinned
is that `mail.transport_delivers()` and `deliver`'s own branches agree about
every one of them — and that predicate reaches a **page** through
`/api/healthz`, where two readings of it is how a panel comes to promise mail
the sender cannot send.

Three rules if anything else is ever tempted to do this:

- **Restore in a `finally`, and then assert the restore.** A script that leaves
  `settings` mutated poisons every assertion after it, in a file that
  deliberately keeps running after a failure.
- **Never let it reach a socket.** Only the four non-delivering pairs call
  `deliver`; the `smtp` + host pair is asserted on the predicate alone.
- **It is still no-network and no-database.** The `psycopg` requirement above is
  an *import*, not a connection.

### ⚠️ It pins the CALL SITES' link paths, and the absence of that shipped an outage

The `_link` block passes `"/map/?watch="` **as an argument** and asserts the
base-joining. That pins the helper and says nothing whatever about which path
`render` and `_send` actually pass — and those five call sites pointed at
`/map/?…` for the whole life of the feature, which is a route wrapped in
`RequireSession`. **Every confirmation link and every unsubscribe link in every
email was unreachable to a subscriber with no Fluud account, and this script was
green throughout.**

> **A helper asserted through its own arguments is a helper asserted against
> nothing.**

So there is a second block, added 2026-08-16: every `render` kind in both
languages must contain `/watch/?confirm=` or `/watch/?watch=`, and — the one
that catches a revert — **no rendered body of any kind may contain `/map/?`**.

⚠️ **`mail.unsubscribe_header` was extracted so this script could reach it.** The
`List-Unsubscribe` value is the only link a mail client acts on without the
reader reading it, it carries a bearer credential, and it lived inside `_send`,
which opens a socket. It is pure and public now, and three states are asserted:
the URL, absent with no token, and absent with no origin — never the explanatory
sentence `_link` returns, which in a header is a malformed field with a live
credential in it.

## ⚠️ `check_escalation.py` and `check_watch.py` are SIBLINGS, not a base and an extension

They look like duplication and they are not. `escalation.py` decides about one
camera; `watch.py` decides about every sensor anybody subscribed to. An active
NWS alert raises WATCH in the first and **nothing** in the second, and that
asymmetry is the whole point: escalation was deciding about one corner, and this
is deciding about every sensor anybody subscribed to, so the same NWS rule would
turn one county-scale product into one email per subscription city-wide.

⚠️ **The credibility gates are now IDENTICAL and that is asserted as an
equality.** There were four witnesses in `escalation` and three in `watch`; the
fourth was a camera seeing water, and it went with the water-segmentation layer.
`check_watch.py` compares the two functions over the whole 288-combination
matrix. **If it fires, one of them changed and both docstrings are stale** — fix
the code or fix both files, and do not weaken it back to `<=`.

⚠️ **`check_watch.py` carries NO copy assertions and never has** — it imports
neither `agent` nor `mail`. **All of them are in `check_escalation.py`**, which
is therefore the script to run after touching `agent._TEMPLATES`: the variant
shape, the slots, en/es count parity, the 300 character cap, and the
variant-count ordering.

⚠️ **One of those assertions is gone: `LANDING_QUOTE`.** It pinned the WATCH
variant the landing page rendered verbatim, and it went with that page on
2026-08-14. **No surface now quotes warning copy**, which is why it could be
deleted rather than repointed — and is also a loss worth naming, because no page
shows a reader what a warning actually says. If a quote returns anywhere, that
assertion returns with it.

## ⚠️ `parity_constants.py` asserts NOTHING, on purpose

It prints JSON on stdout and that is all it does. The assertions live in
`web/tests/parity.test.ts`, because vitest already resolves the TypeScript and
the alternative was teaching Python to load a `.ts` module.

**Never add an assertion to that file.** The moment it can fail it becomes a
second place the contract is enforced, and the two will disagree about which
numbers matter.

**The gap it closes** is the one nothing else in this repo can. `check_watch.py`
asserts `watch.SENSOR_STALE_AFTER_S == 3600` under a comment *naming*
`staleness.ts` — and stays green when `staleness.ts` is edited to 1800, because
a Python script cannot read a `.ts` file. Verified by introducing exactly that
drift.

Numbers currently carried across the boundary: the three staleness windows, the
two pairing distances, both borrowed thresholds, the plausibility band, the
disclaimer in both languages, the depth unit boundary, the haversine, the
depth-peak presets, `RETENTION_DAYS` and both clamp bounds.

**If another shared number appears, it goes there.** A comment saying "keep
these in step" is exactly what this replaced.

⚠️ **The plausibility band is in that list for a DIFFERENT reason from the rest,
and the difference got sharper on 2026-08-15.** Every other number there is
written down twice, once per language. `IMPLAUSIBLE_MM` / `IMPLAUSIBLE_MIN_MM`
are **not** — there is no TypeScript copy of either, and there must not be. What
`parity.test.ts` asserts about them is an **ordering over the Python side
alone**: that the band never closes over `flood_event_mm` or `curb_height_mm`,
which would judge every real flood reading a fault and lose the depth signal
silently.

They reach the browser on `/api/status` as `IngestBounds`, so the sensor face
can name the bound a fault crossed. ⚠️ **That is what makes a TS constant
tempting and wrong.** A literal on that side would be a genuine second copy of a
**safety band**, held by nothing — and the obvious "improvement", pinning the
wire value against it here, would be this file asserting that a number agrees
with its own duplicate. **The band crosses as data, never as a constant.**

## `nta.py` is not a check and does not run in `check`

It regenerates `waterline/nta.py` — the 2020 NTA code → display name crosswalk —
from the DCP geography layer, **by hand**, and the output is committed, the same
rule `web/scripts/` follows. It is the only file here that touches the network.

⚠️ **It replaced `rodent.py` on 2026-08-14 and the difference is the point.**
That script aggregated DOHMH rat-inspection findings to NTA and emitted
`waterline/rodent_nta.py` as `code -> (name, rate, inspections)`; the feature it
fed is deleted. The **names** were never rodent data — DOHMH supplied the counts
and the DCP layer supplied the names — and two live surfaces need them, so the
crosswalk was carved out rather than dropped: `selected-detail.tsx`'s sensor face
renders a `neighbourhood` row, and `instrument-query.ts` searches on it.
Coverage went **up**, 213 NTAs to 262, because the old file could only name a
neighbourhood the city had inspected that year.

⚠️ `rodent.py`'s `$select` never *requested* the address columns — the NTA-scale
rule enforced at the point of the query rather than after it, because data you
did not fetch cannot be aggregated too finely by mistake. **That property is
inherited rather than lost**: `nta.py` asks for `nta2020` and `ntaname` and
there is nothing finer in the dataset it reads.

## ⚠️ What `./scripts/check` cannot see

The runner is import-clean by design — no network, no DB, no `.env` — and that
draws a real boundary. Three defects once shipped with it at 8/8:

| what broke | why nothing here could see it |
|---|---|
| a deploy script passing two mutually exclusive flags | no script runs a deploy tool |
| a host reserving `/healthz` at its edge, so the UI polled a path that 404s | the route resolves fine in-process; only a request through the real edge disagrees |
| a vision parser reading a response it did not understand | that module had **no script at all** |

Two of the three are *deployment* facts rather than *code* facts. **The
post-deploy `curl` is the test for that class of thing.** The third was ordinary
Python that a script could have covered, and the module is deleted now.

## Adding a script

1. Same shape: a `check(label, got, want)` helper, accumulate, print a report,
   `sys.exit(1)` on any failure.
2. Name it `check_<module>.py` and add it to the `check` runner's list.
3. Keep it import-clean — no network, no DB, no `.env`.
4. **Break the thing it checks and watch it fail with a named assertion.** If it
   crashes instead, add a gate that bails to the report first.
5. Add a row to the root `CLAUDE.md` map and to the fourth column of
   `waterline/CLAUDE.md`'s layer table — including when the honest answer for a
   layer is ⚠️ **nothing**.
