# MEASUREMENTS.md — Fluud

Every number in this repo that came from running it. `CLAUDE.md` is the map and
holds the invariants. `LIMITATIONS.md` holds what the instrument cannot see.
This file holds what was measured, dated, in the order it was measured.

⚠️ **This file is RE-MEASURED, never edited.** A figure here is a reading with a
date on it. Correcting one by hand turns it into an assertion, and an assertion
that nobody ran is the thing this file exists to not be. Re-run the command in
the section, write down what it says, and date it. The superseded reading stays
in this file under its own date.

⚠️ **Several surfaces quote these numbers into rendered copy**, so this file rots
outward. `landing-hero.tsx`, `landing-sections.tsx` and `about-sections.tsx`
hard-code counts from **Verified live** and each says so at the top of the file;
`web/src/components/CLAUDE.md` records which page rots first. `README.md` quotes
the **Verified live (2026-08-04)** registry figures — 425 deployments, 968
cameras, 27 gold pairs, 131 silver. Re-verify with
`python -m waterline.poll probe` before quoting any of them again.

⚠️ **This file was SPLIT OUT of `CLAUDE.md` on 2026-08-07, and the text moved
VERBATIM.** Every paragraph below is byte-identical to what it replaced; what
changed is which file it sits in. The map was over the 150,000-character ceiling
a `CLAUDE.md` is read under, and 41,133 of those characters were this — record
rather than rule, and the largest block in the file that binds no directory.
**A claim here that reads as new is a claim that moved.** The map keeps a
pointer, and the sections keep their own headings so every reference to
*"Verified live"* still lands.

**Nothing here is a rule.** If a number below is load-bearing for a safety
property, the property is stated in `CLAUDE.md` and the number is its evidence.
Read the rule there first.

⚠️ **Some of what follows measures things that no longer exist**, and it mostly
stays, because the rule of this file is *re-measure, never edit*. A section is
not wrong because the code moved under it — it was true on the day it was taken,
and deleting it erases evidence rather than updating it. Any figure counting an
`alerts` row is in that state: the on-page alert system was unwired, the tables
and the components are kept whole, and the numbers still describe them. **Read
the heading before quoting a section.**

❌ ⚠️ **THE RULE WAS BROKEN ONCE, ON 2026-08-20, AND THIS IS THE RECORD OF IT.**
Two sections were **deleted** rather than re-measured, before this repo went
public: the **vision workflow** measured 2026-08-07, and the **Cloud Run
deployment** measured the same day. Both described infrastructure this project
had already removed and does not intend to return to, and neither had a live
counterpart a reader could re-run. **What went with them is real and is named
here rather than left to be discovered**: the 22.5 cm depth estimate a
segmentation mask produced for a 4.78% water patch on a real frame, which is the
worked evidence behind *never let a camera produce a number*; and two deployment
defects — a route reachable in every local shape and unreachable in production,
and a piped exit code reporting success for a deploy that did nothing. **Both
lessons survive as rules in `CLAUDE.md`. Their evidence is in the archived
pre-public history and nowhere else.**

⚠️ **A handful of identifiers were replaced in the same pass** — a sending
domain, a subscriber's masked address, a deployment hostname. Those are edits to
readings and they are the second exception. **No figure was changed.**

⚠️ **THE COMMIT HASHES BELOW RESOLVE TO NOTHING IN THIS REPO.** The history was
squashed to a single initial commit on the same day, so `6bd5597`, `18f4512` and
`b576739` — each of them a deploy this file records running from a clean tree —
are dangling here and live only in the archived pre-public bundle named in
`CLAUDE.md`. **They are kept because a reading is nothing without what it was
taken against**, and a hash naming the tree is the most precise form of that.
**Read one as a label rather than as something you can check out.**

---

## The monitor flow stops re-asking a confirmed subscriber (2026-08-17) — DEPLOYED, NO BROWSER PASS

⚠️ **The server half was driven and the two new UI faces were not**, on
`The camera borough-and-pairing filter`'s terms and for the same reason: both
faces live in `watch-panel.tsx` on `/map`, which is behind `RequireSession`, and
the interesting branch additionally needs a Neon session whose `email_verified`
address already has a confirmed row. **The browser checks are listed at the end
and they are owed.**

### What changed

`GET /api/watch/mine` — the signed-in reader's own watch, if their proven address
has one. The monitor panel asks once when the session settles and, when the
answer is yes, **mounts `ManageFace` instead of running the wizard**. The
confirmed `sent` face additionally counts down and ends the flow.

### The runners

```
./scripts/check      8 passed, 0 failed, 0 skipped
npm test             350 tests, 15 files, 325ms   (was 342)
npm run typecheck    clean
npm run build        compiled, 20 static pages, /watch still exported
```

The eight new tests are `sentFaceAutoCloses` (5) and `sentFaceClosingNote` (3).
**Both breaks were run**, on this file's own standard:

| break | fails |
|---|---|
| `sentFaceAutoCloses` → `status === "confirmed"` (drop the mail gate) | 2 named — *no mail transport means the face stays up*, *it never runs on a branch whose copy says the link is the only one* |
| closing note → `Watch your inbox. This closes in ${n}s.` | 2 named — *it states the confirmation before the consequence*, *it never sends anybody to an inbox* |

### The route, driven locally

Bare `uvicorn` on :8081 with **`POLL_IN_SERVICE=false` and
`MAIL_TRANSPORT=log`** overriding `.env`, so no tick ran and nothing called
`mail.drain` — the outbox race in `CLAUDE.md`'s *Deploying* section is exactly
what a default-env local process against this database would have re-created.
`/api/healthz` confirmed it: `polling: false`, `mail_delivers: false`.

| request | answer |
|---|---|
| `GET /api/watch/mine`, `REQUIRE_AUTH=false` | **200** `{"watching":false,"manage_token":null,"subscription":null}` |
| `GET /api/watch/mine`, `REQUIRE_AUTH=true`, signed out | **401** |
| `GET /api/watch/mine`, `Authorization: Bearer nope` | **401** `{"detail":"Invalid session."}` |
| `GET /api/watch/subscription`, `REQUIRE_AUTH=true`, no token | **422** — still exempt, unchanged |
| `GET /api/sensors`, `REQUIRE_AUTH=true`, signed out | **401** — unchanged |

⚠️ **The first row is the one worth keeping.** With the gate off,
`_verified_session` returns `None` and the route answers `watching: false` — so
the shortcut is unreachable on an unauthenticated deployment and the wizard runs.
That is the safe direction, and getting it backwards is the same failure
`watch_subscribe`'s verified-self branch is held to.

`app.openapi()` lists `/api/watch/mine` among the six watch paths, and
`api._AUTH_EXEMPT` is unchanged at five entries — the new route is **not** one of
them.

### The deploy, 2026-08-16 22:28 UTC

`railway up` to project/service `fluud`, from a clean working tree at `6bd5597`.
**No `bootstrap` was needed** — this change adds no DDL, which is the difference
from the camera-filter deploy below.

⚠️ **The discriminator was `/openapi.json`, and the obvious one does NOT work.**
`_session_gate` runs **before routing**, so with `REQUIRE_AUTH=true` a signed-out
`GET /api/watch/mine` answers **401 on the old build too** — the route not
existing and the route being gated are the same bytes. What only the new build
has is the path in the schema, and `/openapi.json` is not under `/api/` so the
gate does not cover it. **Read before: 5 watch paths. After: 6.** New build
serving ~40s after the image pushed.

| check | before | after |
|---|---|---|
| `/openapi.json` watch paths | 5 | **6, `/api/watch/mine` present** |
| `GET /api/watch/mine`, signed out | 401 (gate, no route) | **401 (gate, route exists)** |
| `GET /api/watch/subscription`, signed out | 422 | **422** — still exempt, unchanged |
| `GET /api/sensors` · `/api/status`, signed out | 401 | **401** |
| `/api/healthz` · `/healthz` | 200 | **200** |
| `/` · `/map/` · `/watch/` · `/auth/sign-in/` | 200 | **200** |
| `/about` · `/terms` | 307 → 200 | **307 → 200** |

`/api/watch/confirm` answers **404** to a GET on both builds, which is correct
rather than broken: it is POST-only, Starlette treats a method mismatch as a
partial match, and `Mount("/")` is a full match for every path — so it falls
through to the 404 page. That is the documented reason the route-order test has
to use a route's **real method**.

**Two ticks, to separate a loop that is running from a loop that is storing:**

```
t1  2026-08-16T22:28:20.513836Z   readings 393   stored 290   tick_ok true
t2  2026-08-16T22:29:19.544986Z                  stored 329   tick_ok true
    last_store_at == tick_at at both
polling true · mail_delivers true · auth_required true
```

⚠️ **`writes` cannot say WHICH process that was**, on the outbox-race section's
terms — one upserted row per `mode`, so two loops in the same mode overwrite each
other. `polling: true` is the field that stays honest, because `is_alive()` is
process-local to whichever container answered. Nothing local was ticking here:
the only local process during this work was a bare `uvicorn` started with
`POLL_IN_SERVICE=false` and `MAIL_TRANSPORT=log`, and it was stopped before the
deploy.

**The baked auth URL was confirmed inside the served bundle**, which is the only
way to check it: the Neon endpoint string is present in
`/_next/static/chunks/12gzn4vyyn-tm.js`. A container built without
`NEXT_PUBLIC_NEON_AUTH_URL` is a site nobody can enter, with no error naming the
cause and no restart that helps.

### ⚠️ What a browser owes this change

Every one of these needs a signed-in session, and the second group needs a
confirmed subscriber whose address is that session's:

1. Signed in, **not** subscribed — the `checking` line appears and gives way to
   the pick face. Time it: if the round trip is long enough to read, that line's
   wording is doing real work and should be checked at 390 as well.
2. Signed in, **subscribed** — the `have` face draws `ManageFace`, the chrome bar
   prints `email_masked` in `--wl-cyan`, and **no step line renders**.
3. The `have` face's `addable` control appears only when a picked instrument is
   not already on the subscription, and adding one saves through the PUT.
4. `watch a second address` reveals the wizard on the typed field, and the manage
   face does not come back until the flow finishes.
5. Delete from the `have` face → the removal sentence renders and the wizard
   returns.
6. A fresh confirmed subscribe → the fourth step reads `✓ confirmed`, the
   countdown runs from **10**, and the panel lands on the `have` face rather than
   on `pick`.
7. `keep this open` cancels the countdown and does not restart it.
8. `mail_delivers: false` on the confirmed branch → **no countdown at all**, and
   `open your watch` stays on screen.
9. Below `md`: the sheet actually closes when the countdown ends, and the rail tab
   does **not** change above `xl`.
10. The rail slot's height with `ManageFace` in it — that component was measured
    inside `/watch/`'s 560px column and has never been drawn in a **372px** rail.
    **This is the one that can force a rethink**, on the row-count table's terms.

---

## The camera borough-and-pairing filter (2026-08-16) — DEPLOYED, NO BROWSER PASS

⚠️ **The database half is MEASURED against production and the browser half is
NOT**, on `The estuary palette`'s half-measured terms. What is recorded is what
the runners said, what came off the live database before and after the deploy's
`bootstrap`, what the deployed route actually returned — and, at the end, **the
numbered checks a browser still owes.** `/map` is behind the session gate, which
is why that half is owed rather than taken.

### The deploy, 2026-08-16

`railway up` to project/service `fluud`, then `railway ssh python -m
waterline.poll bootstrap`. ⚠️ **The bootstrap was not optional and the deploy was
broken without it**: `schema.sql`'s `alter table cameras add column if not
exists borough` is applied only by `db.init()`, from `poll.bootstrap()` and
`poll.probe()`, **never at API startup** — so the column did not exist and
`db.camera_registry` selects `c.borough`. Verified before running it:
`information_schema` gave `camera_id, image_url, lat, lon, name` and nothing
else. **`/api/cameras` would have 500'd for the first reader who touched the
filter, on a service reporting perfectly healthy** — the exact shape this file's
deploy notes describe for a missing relation.

⚠️ **A health check could not have caught the new build**, per the same notes.
`polling: true` with a fresh `writes.tick_at` was equally true of the container
being replaced, and **`/api/cameras` was not a discriminator either** —
`_session_gate` runs before routing, so it answers 401 for an unregistered path
too. What named the new build was the **public static bundle**: the gate does not
cover the UI mount, so `/_next/static/chunks/09k83qsrvty5o.js` containing the
string `/api/cameras` is the proof, which is the same technique that confirmed
the baked auth URL.

⚠️ **THE SECOND DEPLOY'S DISCRIMINATOR WAS WRONG, and the way it was wrong is
the thing to take from this.** It polled the served `/about/` for the string
`973` — the new rendered camera count — and matched **immediately, on the old
build**, because `973` is a substring of the Next module id `97367` in that
page's own flight data. The check reported the new build was serving while
`>968</p>` was still on the page. **A bare number is not a discriminator on a
page that ships module ids, chunk hashes and byte offsets.** The working one was
`>973</p>` — the number *with its markup* — which cannot collide. Read as: name
something only the new build has, **and make the pattern specific enough that
only that thing can produce it.**

Post-deploy, signed out, `REQUIRE_AUTH=true`: `/api/cameras`, `/api/sensors` and
`/api/status` all **401**; both `healthz` paths **200**; `/`, `/map/`, `/watch/`,
`/about/`, `/terms/`, `/auth/sign-in/`, `/auth/callback/` all **200**.
`mail_delivers: true`, `auth_required: true`.

**The loop is ticking AND storing**, checked across two ticks rather than one:
`tick_at` 20:32:20 → 20:33:17 with `last_store_at` moving **with** it, which is
the claim `last_tick_at` alone structurally could not make. `stored` per tick over
four consecutive ticks: **324 / 325 / 332** of ~394 readings — steady. ⚠️ **One
tick read 155 and it was the first after the container restart, not a second
loop.** Ruled out directly: no `waterline` process on this machine, and the
`:8080` uvicorn is `open_webui`, a different project.

⚠️ **`git status --ignored` before uploading found 70MB about to ship** —
`web/.ds-sync/` (62MB) and `web/ds-bundle/` (7.9MB), both gitignored, neither in
`.dockerignore`, both inside `web/` and therefore inside `COPY web/ ./`. Added in
the same session. **`railway up` uploads the working tree and that file is the
only filter**, which is what makes reading the ignored list a deploy step rather
than hygiene.

### What the runners said

`./scripts/check` — **8 contracts, 0 failed**, then `npm test` at **342 tests**
(297 before; `camera-filter.test.ts` is 45). `cd web && npm run typecheck` clean,
`npm run build` clean with the same 20 static pages and no new route.

**Each new assertion was broken once and read**, per `scripts/CLAUDE.md`:

| break | what failed, and how it read |
|---|---|
| `pair_tier`'s gold bound made exclusive | `the gold bound is INCLUSIVE: got 'near', want 'paired'` |
| a stale row past `MAX_PAIR_M` labelled `near` | `a stale row past the bound WITHHOLDS rather than labels: got 'near', want 'unpaired'` |
| `area` dropped from `camera_from_row`'s name fallback | `a nameless row still falls back to \`area\` for its NAME: got 'abc', want 'Bronx'` |
| `distance_m` added back to `CameraEntry` | 2 assertions, incl. `CameraEntry declares no distance_m` |
| `depth_observed_at` renamed to `observed_at` | 2 assertions, both named |
| `applyCameraFilter` returns the unfiltered list | 6 named vitest tests |
| the denominator dropped from the note | the sweep fails **printing the offending sentence** |
| `not paired` swapped for `silver` | the label test **and** the internal-name sweep |
| a null `borough` admitted to every borough | the null-borough test |
| the deployment-fact branch moved below the zero-match branch | the precedence test |

### The numbers behind the tiers — off the live database, 2026-08-16

⚠️ **The `before` column came from the plan's measurement pass; the `after`
column was read off PRODUCTION immediately after the deploy's `bootstrap`.**
`python -m waterline.poll probe` is the authority for registry counts, and
**`bootstrap` re-runs `pair_cameras` and rewrites `pairs`** — so a camera can
move between tiers as a side effect of adding the `borough` column, and one did.

| | before | after bootstrap |
|---|---:|---:|
| `cameras` rows | 968 | **974** |
| DOT feed returned | 968 | **973** |
| `sensors` rows | 424 | **425** |
| `pairs` rows | 130 | **133** |
| `paired` | 27 | **27** |
| `near` | 103 | **106** |
| `not paired` | 838 | **841** |

```
                  cameras
Manhattan            378
Brooklyn             209
Queens               207
Staten Island        100
Bronx                 79
(null)                 1
```

⚠️ **THE CHECK THE LAZY DEFAULT RESTS ON STILL HOLDS: the `paired` tier is
byte-identical to `WATCH_CAMERAS`, 27 ids, set equality, verified in production
BOTH before and after the bootstrap.** That is a coincidence of the data rather
than a property — at rest the `paired` chip describes `WATCH_CAMERAS` rather
than the `pairs` table. **Re-check it after any `bootstrap`**; if it has
diverged the default needs re-taking before the resting page can be trusted.

⚠️ **974 stored against 973 fetched, and the one extra is a finding rather than
a rounding error.** `db.upsert_cameras` is `on conflict do update` and **never
deletes**, so a camera DOT retires keeps its row forever. The orphan is
`0ad90cca-a6b0-4968-abdd-ca81ae497848`, *Henry Hudson @ 137 St*, absent from the
live feed and therefore never re-upserted — which is why it is also **the one
null borough**. Two consequences, both recorded rather than fixed:

- The map draws a camera DOT no longer operates, whose still will not load.
- `borough: null` has **two** causes, not one, and the field comments in
  `models.py` and `api-types.ts` were corrected the same day. **The UI's refusal
  fires on `anyBorough` — *not one camera carries one* — rather than on a single
  row, which is what makes it right for both**: one null among 974 is a retired
  camera, 974 nulls is a database nobody bootstrapped.

`/api/cameras` exercised in the container against production: **974 rows, tiers
27 / 106 / 841, 126 carrying a live depth, 0 implausible, 1 null borough, and
`distance_m` absent from every row** — the negative wire property holding on
real data rather than only in `check_models.py`.

⚠️ **Bronx + paired is ONE camera and Staten Island + paired is three.** A
borough-plus-tier view can be nearly empty, which is where the
*unobserved is not clear* rule bites hardest — and why no "few" threshold was
invented for it.

### ⚠️ What a browser owes this change

1. ⚠️ **THE MOST IMPORTANT ONE: the resting page is unchanged.** 27 pins, 5
   diamonds, no rings, no dots, no lines, chip reads `27 plotted`, **and no
   `/api/cameras` request in the network panel.** The one intended difference is
   the added footer sentence.
2. All fifteen borough×tier states driven: pin count, chip text, legend keys
   present, `HiddenNote` text, footer height.
3. **Bronx + paired (1)** and **Staten Island + paired (3)**, read out loud.
4. The zero-match state; the registry-in-flight state (throttle to Slow 3G) —
   it must not print a number it does not have; the borough-all-null state,
   forced.
5. ⚠️ **THE `MARKER_LAYER` TRAP, at Manhattan + not paired (316 pins).** Press a
   gauge diamond, a sensor ring, a camera pin in **each** of the two `<ul>`s,
   and a layer switch. This is the highest-risk line in the change and it has
   broken this map twice before.
6. An unpaired camera selected: still, name, the sentence, **no depth row, no
   pill, no sparkline, no em-dash**.
7. Pairs layer with the filter on: links only from **drawn** cameras, and the
   legend count equal to the lines on screen.
8. At 390: the cluster's box with the facet group open, against the recorded
   legend 162px / gap 61px / cluster 120px, and a thumb on a 24px pill.
9. **The legend with every key forced on, at both widths** — the key set changed
   when the camera gate split, so the figures under *Five layer switches* are
   about a different set.
10. Resting drawing box and footer height at both widths, before and after. The
    footer gained a sentence at rest and this `Panel` is a flex column with a
    `shrink-0` footer, so the body loses that height at every breakpoint — the
    exact shape of the depth band's 17px.

⚠️ **The unreachable-marker table is a BLOCKER, not an item.** It is already
owed a re-run twice — since the map started filling its frame (2026-08-15) and
since the cluster took hit area (2026-08-16) — and this file already says *do
not quote 145/425 or 268/425 as current*. Unpaired cameras are **selectable**,
so this change adds up to **316 more hit targets in one borough**. Re-run at
full view, at rest **and** in the Manhattan + not-paired state, at both widths.
**Do not claim a number** — marker sizes are 11 / 15 / 7px and never scale, so
the figure has to be measured where the page opens.

⚠️ **968 and 425 are quoted in rendered copy** by `landing-sections.tsx` and
`about-sections.tsx`, which **re-measure together**. The sensor registry has
already drifted to 424.

---

## `/about`'s inventory grid — the counts and the sources in one band (2026-08-16)

⚠️ **MEASURED IN A REAL BROWSER at 1440×900 and 390×844**, through the **real
static export** (`npm run build`, `python3 -m http.server` over `out/`) rather
than `next dev`. `/about` is outside the session gate, so this is one of the two
pages that costs nothing to check.

`AboutInstruments` and `AboutSources` were two full-bleed bands and are one
`lg:grid-cols-2` section: the two counts stacked left, the seven sources as a
`<dl>` right. The question this had to answer is the one the deleted `<table>`
was carrying — **whether anything in the band is still wide enough to push the
page sideways at 390.**

### The runners

```
./scripts/check                8 contracts, 0 failed
cd web && npm test             vitest ok (nothing in src/lib moved)
cd web && npm run typecheck    clean
cd web && npm run build        20 static pages, clean
```

### 1440×900

| | px |
|---|---:|
| document horizontal overflow | **0** |
| section | 1440 × 666 |
| left column · right column | 720 × 665 · 720 × 665 |
| the two count cells | 333 · **332** |
| `425` top · `Where the data comes from` top | 577 · **577** |
| left content starts at | x = **80** — `lg:px-20`, the document gutter |
| widest `<dl>` row | 560, in a 560 track |

⚠️ **The two cells are 333 / 332 because they are `lg:flex-1`, and that is the
one thing here that was changed after looking at it.** The sources column is the
taller of the two and a grid stretches the counts column to match; left to size
themselves the counts sat at the top and the whole difference — about 200px —
became one slab of empty `--card` under the second count. Halved, the divider
lands near the middle.

⚠️ **`425` and the `<h2>` share a top edge at 577** without anything aligning
them: both columns carry the same `lg:py-11`, and the count's own type sits on
the same first line as the heading's. **A change to either column's top padding
breaks it silently** — nothing enforces it.

### 390×844

| | px |
|---|---:|
| document horizontal overflow | **0** |
| `document.body.scrollWidth` vs `clientWidth` | 390 vs **390** |
| elements inside the band whose `scrollWidth` exceeds their `clientWidth` | **none** |
| stacking order | counts (494) then sources (652) |
| widest `<dl>` row | **342**, in a 342 track |

⚠️ **That last row is the whole point of the measurement.** The `<table>` this
replaced carried `min-w-[460px]` inside an `overflow-x-auto` box, because
`Source` beside `What it gives` does not fit a phone. A stacked `<dt>` / `<dd>`
pair has no minimum width, so at 390 the widest row is exactly the track it sits
in and **the scroll box had nothing left to do.** The rule it enforced is
satisfied by construction rather than repealed — **anything wide added back to
that column brings the box back with it.**

⚠️ **All seven sources render at both widths and none is truncated.** This list
is the only credit on the site; the merge trimmed two phrases and no rows.

---

## Five layer switches, and the pair link that is a pixel long (2026-08-16)

⚠️ **MEASURED IN A REAL BROWSER at 1440×900 and 390×844**, through `next dev`
against the live API on :8081, with `RequireSession` temporarily lifted for the
pass and restored after. Chrome, estuary palette, `auth_required: false`.

Every marker class on `/map` became switchable — cameras, sensors, pairs,
gauges, sewer outfalls — from one cluster on the drawing, and `pairs` is a new
layer.

### The token survives the palette

`--wl-pair` resolves to `#7b8190` on `<html data-palette="estuary">`, read with
`getComputedStyle`. `--wl-cso` `#4d7d94` and `--wl-gauge` `#93a4b8` alongside it,
unmoved. It is declared in `:root` and no palette block overrides it, which is
what the byte-identical three-palette audit already covers.

### The hit-test pass — the trap that has broken this map twice

`document.elementFromPoint` at each marker's centre, all five layers on:

| marker | result |
|---|---|
| camera pin | **its own button** |
| sensor ring | **its own button** |
| gauge diamond, 4 of 5 | **its own button** |
| gauge diamond, The Battery | a camera pin's span |

⚠️ **The Battery result is the documented layer order, not a regression.**
Cameras paint highest by design, that gauge sits under the downtown pin cluster,
and the result is **identical with the sensor layer on and off**. It is the same
class of fact as the unreachable-marker table: density at full view.

### The pair layer

27 links drawn from 27 paired cameras, matching the legend's count.

⚠️ **`non-scaling-stroke` holds the DASH as well as the width**, which was a
browser question rather than a spec reading:

| | viewBox span | stroke-width | stroke-dasharray |
|---|---|---|---|
| full view | 1022 × 1115 | `1px` | `3px, 2px` |
| ×12 | 85 × 89 | `1px` | `3px, 2px` |

**No fallback was needed.** The named fallback — solid at `strokeOpacity 0.55` —
was not spent.

### ⚠️ Every link is about a PIXEL long at full view, and this is the finding

On a 650px-wide drawing, all 27 on-screen link lengths:

| min | p25 | median | p75 | p90 | max |
|---:|---:|---:|---:|---:|---:|
| 0.11px | 0.43px | 0.75px | 1.04px | 1.19px | 1.31px |

**17 of 27 are under one pixel. All 27 are under two.**

⚠️ **That is what a pairing IS, not a defect in the layer.**
`cameras.MAX_PAIR_M` is 250 m and full view is roughly 75 m/px, so a co-located
camera and sensor are three pixels apart at the absolute most and usually one.
**The consequence is that the switch looks like it does nothing at the view every
reader opens in**, which is the outfall toggle's own recorded failure — a control
that read as a caption, so 427 outfalls were a feature nobody found.

The drawing says so instead, at full view only: *"27 pairings are drawn. A camera
and its sensor share a corner. Each link is about a pixel at full view. Zoom in
to see one."*

⚠️ **The fix to refuse is a minimum length on the line.** Drawing a link longer
than the distance it spans would put two instruments further apart than they are,
on a map, to make a control feel responsive.

### The footer spends drawing height, and here is the bill

The gate is effectively retired — the sensor layer is off at rest, so
`hiddenLayers` is non-empty on every load and the footer is always present.

| | drawing BEFORE | drawing AFTER, at rest | footer at rest |
|---|---|---|---|
| 1440×900 | **750 × 650** | **709 × 650** | **41px** |
| 390×844 | ~694 × 361 *(arithmetic)* | **637 × 361** | **57px** |

The panel is 820px at 1440 and 764px at 390 in both states. At 390 with the pair
layer on the footer carries two lines, goes to **106px**, and the drawing falls
to **588px**.

⚠️ **The 1440 pair is a genuine before-and-after** — the before was read off
`main` with the change stashed. **The 390 before is arithmetic** on the measured
footer, and is owed a reading.

### The cluster at 390, with every layer switched on

| | x | width | right |
|---|---:|---:|---:|
| legend | 38 | 162 | 200 |
| cluster | 261 | 120 | 381 |

**61px of gap, no overlap.** All five pills 24px tall, none wrapped. Surface
361px wide. ⚠️ **11 legend keys were forced, not 13** — `not in this search` and
`where you searched` need a query and an address and were not driven. Both are
shorter than the longest label present, so the block's WIDTH is covered; its
height is not, and the two boxes sit side by side rather than stacked.

### Horizontal overflow — 13px at 390, and it is NOT this change

`document.documentElement.scrollWidth` is **403 against a 390 client width, both
before and after**, verified by stashing the change and re-reading. All 95
offending elements are in the mobile bar (`sticky top-[49px] md:hidden`) and the
station list; **none is in the map, the legend or the cluster.** Zero overflow at
1440 in both states. **A pre-existing defect, recorded here because it was
measured, and not attributable to the switches.**

### The states, driven

| state | legend keys | chip | footer |
|---|---:|---|---|
| all five on | 10 | `27 plotted` | — |
| cameras off | 6 | `27 not shown` | *27 cameras are switched off…* |
| cameras + gauges off | 5 | `27 not shown` | *27 cameras and 5 gauges are switched off…* |
| all three instruments off | 1 | `27 not shown` | *No instrument is drawn. This drawing reports nothing…* |
| pairs off | 9 | `27 plotted` | — |

⚠️ **`selected` is gone from the legend in the all-off row**, which is the key
whose premise this change broke: it was unconditional because *"the page always
has a selection, so the mark is always on the drawing"*.

⚠️ **The resting default is unchanged from `main`** — cameras and gauges on,
sensors, pairs and outfalls off; 27 pins, 5 diamonds, no rings, no dots, no
lines; chip `27 plotted`.

### The registry has drifted to 424

`/api/sensors` returned **424** deployments, **0** outside `NYC_BOUNDS`. The
legend reads `424 FloodNet sensors` and the off-map counter correctly reads zero.
⚠️ **Several surfaces still hard-code 425.** `python -m waterline.poll probe` is
the authority and this is a re-measure those surfaces owe.

### What this pass did NOT cover

1. **The 390 before-height** is arithmetic rather than a reading.
2. **The legend at 390 with all 13 keys** — a query and an address were not driven.
3. **A thumb on a 24px pill.** ⚠️ WCAG 2.5.8's *Equivalent* exception does **not**
   apply here: unlike a sensor marker, there is no second route to a layer switch
   anywhere in the app, so 24px is a floor. If it fails, `h-7 sm:h-6`.
4. **Press-and-drag starting on a pill** — the cluster sits inside the surface's
   pointer handlers, as `ZoomControls` already does. Not driven with real pointer
   events; the state changes were verified with `.click()`.
5. **The unreachable-marker table**, still owed a re-run since 2026-08-15 and now
   owed one more reason: the cluster occupies hit area in the top right. **Do not
   quote 145/425 or 268/425 as current.**

---

## The mailed links come out from behind the gate (2026-08-16)

⚠️ **THE SERVER SIDE IS MEASURED END TO END, INCLUDING A REAL SEND. The BROWSER
pass is owed** and listed at the end. The sending domain was verified in Resend
mid-session, so everything below the transport heading is a reading rather than
a prediction.

**What was wrong.** From the day the session gate landed until this change,
every link Fluud mailed was unreachable. `mail.py` built `/map/?confirm=…` and
`/map/?watch=…`, `/map` is wrapped in `RequireSession`, and a subscriber with no
Fluud account was redirected to sign-in before the component that reads the token
mounted. **No address could be confirmed and no unsubscribe link worked.**
`./scripts/check` was green throughout — `check_mail.py` passed the path *as an
argument* to `_link`, so it pinned the base-joining and never a call site.

### The runners

- `./scripts/check` — **8 passed, 0 failed, 0 skipped**. Seven Python contracts
  then vitest.
- `cd web && npm test` — **274 tests, 13 files, 289ms**. Was 256; the 18 new ones
  are `tests/watch-settings.test.ts`, the first assertions this feature has ever
  had.
- `npx tsc --noEmit` — clean.
- `npm run build` — compiled in 1178ms, TypeScript in 3.4s, **20 static pages**,
  and `/watch` in the route table.

### The new assertion catches the bug that shipped

Repointing one call site back to `/map/?confirm=` and re-running `check_mail.py`:

```
FAIL — 4 assertion(s):
  · [en] the confirmation links at /watch/?confirm=: got False, want True
  · [es] the confirmation links at /watch/?confirm=: got False, want True
  · [en] no rendered body links into /map/: got True, want False
  · [es] no rendered body links into /map/: got True, want False
```

Restored: `mail contract OK`. **The negative assertion is the one that matters** —
it is what a future revert lands on.

### The route, through the real static mount

`npm run prod:local`, then `uvicorn` on 8099 with `REQUIRE_AUTH=true`:

| path | status |
|---|---:|
| `/watch` | **307** |
| `/watch/` | **200** |
| `/map/` | 200 |
| `/nonsense/` | 404 |

`waterline/web/watch/index.html` — 15,667 bytes on disk. The `trailingSlash`
trap navigated the ordinary way.

### The gate, signed out

| request | status | means |
|---|---:|---|
| `GET /api/healthz` | 200 | exempt, unchanged |
| `GET /api/sensors` | **401** | still gated |
| `GET /api/status` | **401** | still gated |
| `GET /api/watch/subscription?token=x` | **404** | **exempt** — reached the route, bad token |
| `PUT /api/watch/subscription` | **404** | **exempt** — the gate is method-blind |
| `POST /api/watch/resend` | **401** | still gated, deliberately |
| `POST /api/watch/subscribe` | **401** | still gated, deliberately |

⚠️ **404 rather than 401 is the whole proof.** A 401 would mean the middleware
answered; a 404 means the route did.

### The rendered message, against the live config

`mail.render("confirm", "en", …)` with `PUBLIC_BASE_URL=http://127.0.0.1:8081`:

```
Confirm it was you: http://127.0.0.1:8081/watch/?confirm=CONFTOKEN
…
Stop these emails, or change what you watch:
http://127.0.0.1:8081/watch/?watch=MANAGETOKEN
```
```
List-Unsubscribe: <http://127.0.0.1:8081/watch/?watch=MANAGETOKEN>
```

### The transport

Resend over SMTP, which needed **no code** — `mail._send` is stdlib
`smtplib.SMTP` + `starttls()` + `login()`, exactly Resend's 587 shape.

- `mail.transport_delivers()` → **True**.
- A real `smtplib` connection to `smtp.resend.com:587`, STARTTLS, `login()` →
  **AUTH OK**. The key is live and the port and TLS mode are right.
- ⚠️ **The key was in `web/.env.local`, which is the BROWSER's env file.** Next
  bakes only `NEXT_PUBLIC_*`, so it was not leaking and Python never read it
  either — `MAIL_TRANSPORT` fell back to `log` and nothing had ever been sent.
  One rename to `NEXT_PUBLIC_RESEND_API` would have compiled a mail-sending
  credential into a static export served to anybody. Moved to the root `.env` as
  `SMTP_PASSWORD`.
- ⚠️ **`PUBLIC_BASE_URL` was still a retired host's URL**, so even a working
  transport would have mailed links to a dead host.
- ⚠️ **A subdomain of a verified domain is NOT verified.** `SMTP_FROM` was
  `alerts@fluud.example.com` against a verified `example.com`; the provider
  treats the subdomain as an entry it has never seen. It is `fluud@example.com`.

### The real send

`mail.deliver` against the live config, one confirmation to a real mailbox:

```
from   : Fluud <fluud@example.com>
status : sent
```

⚠️ **`sent` means handed to a relay.** Not delivered, not accepted by the
recipient's server, not read. A bounce arrives at a mailbox this process does not
read.

### ⚠️ THE DEPLOYED POLLER IS RACING THE OUTBOX, AND IT SWALLOWS MESSAGES

The first queued confirmation came back **`skipped`, attempts 1**, from a local
process whose `transport_delivers()` was `True`. It was not this process that
handled it.

**Railway is running against the same Neon database, its poll loop ticks every
minute, and `poll.tick` calls `mail.drain`.** `db.pending_outbox` claims rows
with an `update … skip locked`, so whichever process gets there first owns the
message — and the deployed one has no `MAIL_TRANSPORT`, so it renders to a log
inside a container nobody reads and marks the row `skipped`. Proved by queuing a
second message and draining in the same breath:

```
local transport: smtp | delivers: True
drain -> {'sent': 1}
  outbox id 1  confirm  skipped  attempts 1   ← the deployed container took it
  outbox id 2  confirm  sent     attempts 1   ← this process won the race
```

⚠️ **Two things follow and the second is the trap.** Configuring mail *locally*
against a shared database does not make mail work — the loop that ticks every
minute wins nearly every race. And a half-configured deployment is **worse than
an unconfigured one**: `skipped` is a terminal status, `db.prune_outbox` treats
it as finished, and nothing retries. The messages are not delayed; they are gone.
**Set the `SMTP_*` variables on the host that runs the loop, or run no loop
beside it.**

### The full round trip, unauthenticated, `REQUIRE_AUTH=true`

`/api/healthz` first: `mail_delivers: true`, `auth_required: true`, and a
`writes` block from the deployed loop — `readings: 394, stored: 62`.

| step | how | result |
|---|---|---|
| subscribe | in-process (the route is gated, as a signed-in reader would) | `pending`, 327 of 424 sensors `alert_permitted` |
| `POST /api/watch/confirm` | **unauthenticated HTTP** | `confirmed: true` + `manage_token` |
| `GET /api/watch/subscription` | **unauthenticated HTTP** | the watch, `email_masked` `j••••••@example.com`, `silent: false`, `citywide_silence: false` |
| `PUT` settings | **unauthenticated HTTP** | `warning` / `first` / 22→07 stored |
| `PUT` half a quiet window | **unauthenticated HTTP** | **400** *"quiet hours need both a start and an end, or neither"* |
| `PUT` with `camera_ids` | **unauthenticated HTTP** | **400** naming the reason |
| `POST /api/watch/unsubscribe` | **unauthenticated HTTP** | `removed` |
| the same token again | **unauthenticated HTTP** | **404** |
| the cascade | SQL | `subscribers 0 · subscriptions 0 · outbox 0` |

⚠️ **Every row of that middle block would have been a 401 before this change**,
and the two mutations at the bottom were reachable only to a reader who had a
Fluud account — which a mailed link's recipient may not have. The refusals still
refuse, so the exemption widened the door and not the contract.

### The deploy, and the race closing

`railway up` from a clean tree at `18f4512`, after setting the seven `SMTP_*`
variables as **service variables** with `--skip-deploys`.

⚠️ **The first health check passed against the OLD container and meant nothing.**
`polling: true` with a fresh `writes.tick_at` is true of the previous build too,
so a wait condition built on it returns immediately and reads as success.
**`/watch/` returning 200 is the only signal that says the new code is serving** —
it was **404** for the first ~20s while `mail_delivers` was still `false`. A
post-deploy check has to name something the new build has and the old one does
not.

Against the deployed origin, signed out:

| path | status |
|---|---:|
| `/watch` → `/watch/` | **307 → 200** |
| `/` · `/about/` · `/terms/` · `/map/` · `/auth/sign-in/` | 200 |
| `/nonsense/` | 404 |
| `/api/healthz` · `/healthz` | 200 |
| `/api/sensors` · `/api/status` | **401** |
| `GET` + `PUT /api/watch/subscription` | **404** |
| `POST /api/watch/confirm` · `/unsubscribe` | **404** |
| `POST /api/watch/resend` | **401** |

`healthz`: `mail_delivers: true`, `auth_required: true`, `readings: 392`,
`stored: 165`.

⚠️ **404 rather than 401 on the four exempt routes is the whole proof**, and
`resend` staying 401 is the other half — the exemption widened the door and left
the contract alone.

**The race, measured closing.** A confirmation queued from a local process and
left alone: **`queued` → `sent` in 40s**, drained by the *deployed* poller. The
identical row came back `skipped` before the variables were set. Then the full
round trip over HTTPS, unauthenticated — confirm → subscription → unsubscribe →
`subscribers 0 · subscriptions 0 · outbox 0`.

### ⚠️ What a BROWSER still owes this change

The routes and the wire are measured above. **Nothing below has been through a
browser**, and the first is the one that would make the rest moot:

1. Open `…/watch/?confirm=<tok>` **signed out, in a clean profile**. Expect the
   manage face, the token gone from the address bar, and no redirect to sign-in.
2. Drop an instrument, edit settings, then `stop and delete` — from the page
   rather than from curl.
3. `/watch/?watch=<bad>` — the error face, not an empty one.
4. `/map/?watch=<tok>` signed out **and** signed in: both land on `/watch/`, and
   Back does not bounce.
5. DevTools on `/watch/`: **zero** requests to `/api/sensors` and `/api/status`.
6. `SiteFooter` present, `/terms` reachable from it.
7. The withheld add-control reads as withheld rather than missing.
8. `verify email` four times on an unconfirmed address — the fourth capped by
   `CONFIRM_RESENDS_MAX`, same response on the wire.
9. With `MAIL_TRANSPORT=log`, `verify email` again: the amber *"No email was
   sent"* wording rather than the promise. **`log` is the only way to see that
   branch**, and it is the second defect this change fixed.

⚠️ **1 and 4 need `PUBLIC_BASE_URL` pointing at whatever is serving the page**,
and the local value is `http://127.0.0.1:8081`. A link built against one origin
and opened on another is a token in the wrong browser.

---

## The full-width workspace and the map that fills its frame (2026-08-15)

⚠️ **This section is UNMEASURED and says so at the top.** Four changes landed on
the owner's instruction and **not one of them has been through a browser**,
because `/map` is behind the session gate. What is recorded here is what the
runners said, what was verified in isolation, and — at the end — the full list of
what a browser still owes. **A prediction below is marked as a prediction.**

### What landed

1. **`<main>` lost `max-w-[1600px] mx-auto`.** The two fixed tracks are unchanged
   at 312 / 372, so every pixel of extra page width goes to the map's
   `minmax(0,1fr)`. `SiteHeader`'s inner container lost the same cap in the same
   pass, or the wordmark would sit indented while the list ran to the page edge.
2. **`MAP_MAX_W` (606px) and the container's `aspect-ratio` are deleted.** The
   surface is `h-full w-full` and fills its track on both axes.
3. **The legend moved onto the drawing**, top left, one key per line.
4. **`PaintRule` came off the masthead**, and the first sort button is labelled
   `depth` with its value still `"worst"`.

### The aspect agreement moved from CSS into arithmetic

The rule was that the container's shape and the SVG's `viewBox` must agree or
`preserveAspectRatio` letterboxes the drawing and every marker drifts by half the
letterbox. A `ResizeObserver` now measures the surface, and `svgViewBox` and
`toContainer` both derive the frame's height from that one number through
`frameH`.

`Viewport` gained an optional `aspect`; absent means `MAP_ASPECT`, so **all 245
pre-existing tests pass byte-unchanged** as the square-frame regression suite.
**11 new tests**, 256 total. Three deliberate breaks, each run:

| break | fails | message |
|---|---|---|
| `toContainer` uses `v.w` vertically | 2 | the zoom anchor and the viewBox/marker edge agreement |
| `fullW` fits the tighter axis (`min` for `max`) | 2 | *expected 0.813 to be greater than or equal to 1* — the city, cropped |
| `withAspect` always returns a fresh object | 1 | the identity `toBe` — a 425-marker re-render |

### The one thing that WAS measured, and it was measured in isolation

The CSS fit was the risky half of an earlier draft and was checked in a real
browser against a standalone harness, at aspect 1.0106:

| frame | surface | ratio |
|---|---|---|
| 1100 × 820 | 806 × 798 (height-bound) | 1.0106 |
| 420 × 820 | 396 × 392 (width-bound) | 1.0106 |
| 390 × 770 | 366 × 362 (width-bound) | 1.0106 |

⚠️ **That harness is not this app** and the shipped implementation is no longer
the one it tested — the `min()` fit was replaced by the aspect-aware viewport.
It is recorded because it is what established that a `max-*` clamp on the derived
axis breaks the ratio rather than shrinking the definite axis, which is why the
agreement had to move out of CSS at all.

### ⚠️ Two numbers moved by ARITHMETIC and neither has been re-read

- **The masthead is 4px shorter at 390 and 5px at 1440**, `PaintRule` being `h-1`
  / `h-[5px]`. `map/page.tsx`'s mobile bar went `top-[53px]` → `top-[49px]` on
  that subtraction alone. **Prediction:** the bar sits flush under the masthead
  at 390. The failure is visible — it tucks under the wordmark, or a strip of
  workspace scrolls through a gap.
- **The `5rem` the three columns subtract is now ~15px more than the masthead
  plus padding takes.** Left alone deliberately: the existing value was arrived
  at by measuring, and 7rem → 5rem was itself a correction to this exact
  symptom. **Prediction:** the columns end ~15px above the fold.

### ⚠️ What a browser owes, in full

1. The frame at 1440×900 and at a wide viewport — the drawing filling its track
   on both axes, with the coastline centred and the city not cropped.
2. **The unreachable-marker table at the NEW full view, at both widths.** Marker
   sizes did not change and the drawing got larger, so 145/425 at 1440 and
   268/425 at 390 are **pessimistic rather than wrong** — but nothing may quote
   them as current until they are re-run.
3. The legend column against the frame at 390 and at 1440: its height, whether
   it crowds the top-left markers, and that it swallows no press (it is
   `pointer-events-none` over four marker layers).
4. The panel footer with every conditional line forced on, now that the legend
   has left it and the first line's `mt-2 border-t pt-2` is stripped.
5. The footer's gate: at rest, unzoomed, no origin, no sensor layer — **no empty
   bordered strip under the map.**
6. `top-[49px]` at 390, and the columns' bottom against the fold at 1440.
7. Pan and zoom on a wide frame: the point under the cursor staying under it,
   `whole city` returning to a frame that holds the whole city, and `FrameNote`
   **absent** at rest.
8. A rail tab change and the controls strip opening, both of which resize the
   map's box — the `ResizeObserver` path, which no test can reach.
9. The list's row count at the new widths, against the floor of three.
10. The masthead with the paint rule gone, at both widths, holding one line.

---

## The estuary palette, the cascade, and the monitor ring (2026-08-15)

`Estuary-Dashboard-2A`, a claude.ai/design artifact built out of this UI, came
back with a six-item token delta. Three items were colour, two were bugs, and one
diagnosis was wrong in a way that pointed at the second bug. Everything below was
read off a real build.

⚠️ **This section is HALF MEASURED.** The cascade and the token values were read
out of the compiled stylesheets and are facts. **The browser pass is owed and
listed at the end**, including the one measurement that could force a redesign.

### The unlayered `*` rule — the bug the design found by accident

`@neondatabase/auth/dist/ui/theme.css:194` emits, outside every cascade layer:

```css
* { box-sizing: border-box; border-color: var(--neon-border); outline-color: var(--neon-ring) }
```

Unlayered CSS beats every layered rule at any specificity. Read out of
`web/.design-sync/.cache/compiled.css` **before** the fix:

| | byte offset |
|---|---:|
| `@layer utilities` | 9931 – 128007 |
| the unlayered `*` rule | **134288** |
| `.border-\[var\(--wl-live\)\]` | 50078, inside `@layer utilities` |

So the utility was **emitted and did not apply**, and with it every other
border-colour utility in the app: `ModeBadge`'s `--wl-live` / `--wl-replay`
provenance outline, `SensorRow`'s `border-l-[var(--wl-select)]` selection edge,
and the `--wl-stale` / `--wl-dead` panel borders. The design's own diagnosis was
that the utility was missing from the build. It was not; it was outranked.

**The fix is splitting `@import "tailwindcss"` into its three parts and dropping
the layer on the utilities.** `layer(base)` on the auth import was tried first
and fails the build outright — `` `@source` cannot be nested ``.

Read off both stylesheets **after** the fix:

| | app (`out/_next/static/chunks/2a2iujb2qcaq7.css`) | design system (`compiled.css`) |
|---|---|---|
| top-level layers | `properties` · `theme` · `base` · `components` | same |
| `@layer utilities` | **gone** | **gone** |
| the `*` rule | unlayered, byte 97136 | unlayered, byte 134896 |
| `.border-\[var\(--wl-live\)\]` | unlayered, byte 26502 | unlayered, byte 50078 |

Both unlayered, so the cascade is decided on specificity: (0,1,0) against
(0,0,0). The utility wins wherever it sits.

### The thirteen frozen tokens

`--wl-panel: var(--muted)` and twelve like it were declared at `:root`. A `var()`
inside a custom property substitutes at computed-value time **on the element that
declares it**, and the result inherits — so they computed against the base
palette and a `[data-palette]` on a descendant never moved them.

Invisible in the app, because the attribute is on `<html>` and `<html>` *is*
`:root`. Total in the design system, where the agent wrapped a
`<section data-palette="estuary">` and every `PanelHeader` in the scope painted
bitumen's `#1c1726`.

Read out of the built app stylesheet after the fix — one occurrence, emitted
after both palette blocks, which is the load-bearing part:

```
:root,[data-palette]{--wl-panel:var(--muted);--wl-select:var(--primary);
--wl-graph:var(--primary);--wl-cyan:var(--accent);--surface-page:var(--background);
--surface-card:var(--card);--surface-chrome:var(--wl-panel);--text-body:var(--foreground);
--text-quiet:var(--muted-foreground);--edge-frame:var(--border);--edge-band:var(--wl-rule);
--mark-selected:var(--wl-select);--mark-trace:var(--wl-graph);--neon-border:var(--border);
--neon-ring:var(--ring);--neon-foreground:var(--foreground)}
```

### Estuary, retuned and shipped

`layout.tsx` carries `data-palette="estuary"`. Read out of the built stylesheet:

| token | was | is |
|---|---|---|
| `--primary` | `#ff2f88` | **`#4d8dff`** |
| `--ring` | `#ff2f88` | **`#4d8dff`** |
| `--wl-rule` | `#1e2833` | **`#152030`** |
| `--wl-violet` | `#8a6cff` | **`#1e62d0`** |

`--wl-select` and `--wl-graph` follow `--primary` through the derived block and
are not declared in the palette. So selection and both sparkline traces are blue;
`--wl-graph` is still constant across every level an instrument can report.

**The safety audit is unchanged.** No depth band, staleness, provenance or
instrument-slate token is touched by any palette.

### Runners

```
npm run typecheck   clean
npm run build       19 static pages, 12 auth views
npm test            245 passed (12 files)
./scripts/check     8 passed, 0 failed, 0 skipped
```

### ⚠️ What this change owes a browser

Nothing in `./scripts/check` reaches CSS, and none of the below has been run.

1. **The row-count table at 1440×900 and 390×844**, controls strip open, with the
   monitor ring rendering. The ring's rail takes ~38px out of a 312px track, and
   the list was already at **4 fully visible rows against a floor of 3** before
   it. **This is the one that can force a redesign** — a 296px row wrapped
   `27s ago` onto two lines once.
2. `ModeBadge` LIVE draws a green outline. This is the cascade fix landing, and
   it is the cheapest possible check on it.
3. A selected `SensorRow` draws its `--wl-select` left edge.
4. A stale and a dead panel draw `--wl-stale` / `--wl-dead` borders.
5. `/` and `/auth/sign-in/` still render. Un-layering the utilities changes what
   the auth card's own rules compete with.
6. `Start Monitor`'s contrast on estuary's `--card` `#0d131b` — rest `#35d6f2`,
   pressed `#4d8dff`. **The 10.48:1 figure in `components/CLAUDE.md` was measured
   against bitumen and is stale until this is read.**
7. Three blues near each other: `--wl-violet` `#1e62d0` on `PaintRule`,
   `--wl-select` `#4d8dff` on the selection edge, `--wl-cyan` `#35d6f2` on the
   row's over-threshold chip. The last two land **in the same row**.
8. The ring at the `WATCH_MAX_SENSORS` cap, and on a `!alert_permitted` sensor,
   where there must be no control at all.
9. A scoped palette: `getComputedStyle` a `<div data-palette="estuary">` and read
   `--wl-panel`. It must be `#151d28`.

---

## The sign-in (2026-08-14)

Neon Auth replaced the `/` stub with a sign-in page, and `/map` went behind a
session. Everything below was run rather than reasoned about.

**The database had been destroyed and was recreated against a new Neon
endpoint.** `python -m waterline.poll bootstrap` on an empty `public` schema:
**424 sensors, 968 cameras, 130 pairs**. `probe` immediately after: **395 of 424
reporting, 15 above 10 mm, 10 implausible** (2 below the −200 mm floor, 8 above
the 600 mm ceiling), lag **p50 1.0m, p90 2.9m, p99 30.9m, max 335.1m**, 5 gauges
reporting, Battery 5.49 ft MLLW against a 6.90 minor-flood threshold.

⚠️ **The previous Neon endpoint had two independent failures and both are worth
recording, because the first one wasted the most time.** Against
`ep-noisy-wind-ax4enhe4`: libpq resolved the host to an **IPv6** address, the
machine had no IPv6 route, and libpq did **not** fall back to the three A
records — raw TCP to `16.59.10.57:5432` opened fine. The error said `Network is
unreachable` and named only the v6 address, which reads as "Neon is down". Under
`hostaddr=<v4>` the real problem appeared: `password authentication failed for
user 'neondb_owner'`, reproduced across three DSN variants. **The replacement
endpoint `ep-old-wildflower-ax35afuc` connected on the first try with no
`hostaddr`**, so the v6 fallback issue is not currently reproducible and no
workaround was committed for it.

**Neon Auth was already provisioned** — `neon_auth.project_config` read: project
name `Fluud`, `social_providers: [{id: google, isShared: true}]`,
`email_and_password.enabled: true`, `allow_localhost: true`, `trusted_origins:
[]`. Nine tables: `account`, `invitation`, `jwks`, `member`, `organization`,
`project_config`, `session`, `user`, `verification`. ⚠️ **`neon_auth.session`
carries `ipAddress` and `userAgent`**, and `neon_auth.account` carries
`accessToken` / `refreshToken` / `idToken`. That is the measurement behind
`/terms` §04's new paragraph and behind the second-person-record section in
`CLAUDE.md`.

⚠️ **The auth service's own URL was NOT discovered.** `<endpoint>.auth.<region>`
fails TLS — the wildcard cert does not cover a third-level subdomain — and every
path on the database host answers `400 "query is not supported"` from the SQL
proxy. The package's `llms.txt` gives the shape as
`https://<project>.neon.tech/auth`. **It is supplied by hand as
`NEON_AUTH_URL` / `NEXT_PUBLIC_NEON_AUTH_URL` and nothing here derives it.**

**What the SDK cost, measured on the built export.** `npm install
@neondatabase/auth@0.5.0-beta` added **145 packages**. JS chunks in the export
went **868 KB → 1.9 MB**, 12 files → 16: **2.2×, about +1.0 MB**, on a site read
outdoors on a phone. The dependency chain under the UI is
`@neondatabase/auth → auth-ui → @daveyplate/better-auth-ui → @triplit/client →
@triplit/db`, and `auth-ui` pulls three captcha SDKs (hCaptcha, Turnstile,
reCAPTCHA), `react-hook-form`, `sonner`, `vaul`, `next-themes`, `ua-parser-js`
and its own `lucide-react@0.555` beside the app's `1.28`. ⚠️ **The one
high-severity `npm audit` finding is PRE-EXISTING and build-time only** —
`nanoid <3.3.18` via `postcss`, from Next and Tailwind, not from auth. The auth
tree's own `nanoid@5.1.16` is unaffected.

**The export, through the real FastAPI mount** (`prod:local`, then
`TestClient`): `/` 200, `/map` 307 → `/map/` 200, `/about/` 200, `/terms/` 200,
`/auth/callback` 307 → `/auth/callback/` 200 (15,369 bytes), `/auth/sign-in/`
200, `/auth/nonsense/` **404**. Twelve directories under `out/auth/`. That last
404 is `dynamicParams = false` working; the `callback` 200 is the one that would
otherwise have failed in production only.

**The gate, exercised in both directions.** With `REQUIRE_AUTH=false`:
`/api/healthz` 200, `/api/status` 200, `/api/languages` 200. With
`REQUIRE_AUTH=true`: `/api/healthz` **200** (exempt), `/api/status` **401**
`{"detail": "Sign in to read the instruments."}`, `/api/languages` **401**,
`/api/watch/confirm` reaches routing rather than being refused. Four bad
credentials, all **401** and none a 500: garbage bearer, `Basic` scheme, empty
bearer, and an `alg: none` forgery carrying `sub: attacker`.

⚠️ **One copy bug was found by that last test and fixed.** A malformed token
answered *"the auth service did not answer"* — blaming Neon for a string the
client sent. `get_signing_key_from_jwt` parses the JWT header before it fetches
anything, so a parse failure arrived on the same path as a dead JWKS host.
Split: malformed is now `Invalid session.` and only a genuine fetch failure
names the service.

⚠️ **`iss` is NOT checked by default and that is deliberate.** The plausible
guess is that it equals `NEON_AUTH_URL`; it was never confirmed against a token
this project issued, and a wrong value rejects **every** session — an outage
presenting as "sign-in succeeds, then 401". The signature is already checked
against this project's own JWKS, so a foreign token fails regardless.
`NEON_AUTH_ISSUER` turns the check on once somebody has read the claim off a
real token.

### ⚠️ The browser pass found two defects the whole test suite could not

`./scripts/check`, `npm run typecheck`, `npm run build` and the `TestClient`
route sweep were **all green** while both of these were live. Neither is
reachable by anything in the runner, and the first one broke the entire site on
one class of origin.

**1. `crypto.randomUUID is not a function` — every page dead on http-on-LAN.**
Loaded at `http://192.168.1.166:3000/` (the **Network:** URL `next dev` prints):
`TypeError` at module evaluation inside
`node_modules_@neondatabase_auth_dist_*.js`, stack
`auth-client.ts → auth-provider.tsx → page.tsx → RootLayout`, and the page
rendering Next's *"This page couldn't load"*. ⚠️ **Because `AuthProvider` is
mounted in the ROOT LAYOUT, this killed every route** — `/about` and `/terms`
included, the two deliberately left readable signed out. Measured in the page:

```
origin            http://192.168.1.166:3000
isSecureContext   false
crypto.randomUUID undefined
crypto.subtle     undefined
crypto.getRandomValues  function
```

`randomUUID` is secure-context-only, so **production over HTTPS and
`localhost` were both fine and only the phone-on-LAN workflow was broken** —
the one `next.config.ts`'s `allowedDevOrigins` block exists to support, and the
one the immediately preceding commit was about. Fixed by `lib/crypto-shim.ts`,
imported above the SDK in `auth-client.ts` because ES modules evaluate in import
order. ⚠️ **It restores RENDERING, not sign-in**: `crypto.subtle` is missing in
the same contexts and must not be polyfilled, so completing a sign-in still
needs `localhost` or `--experimental-https`.

**2. A hydration mismatch on `<html>`, on every page load.** `next-themes`,
pulled in by `@neondatabase/auth-ui`, rewrites the element on mount: server
`class="dark h-full antialiased"`, client `class="h-full antialiased dark"` plus
`style="color-scheme: dark"`. Fixed with `suppressHydrationWarning` scoped to
that one element.

**3. An empty slot with no words when the auth service is unreachable.** With
`get-session` failing `ERR_NAME_NOT_RESOLVED`, neither `SignedIn` nor
`SignedOut` ever mounts — so `/` rendered a wordmark, a paragraph and an **empty
column**, and `/map/` sat on a bare *"Checking your session…"* indefinitely.
Both now carry the second sentence: *"If this does not clear, the sign-in
service is not answering. That is about signing in, not about the water."*

**What the browser confirmed working**, against a deliberately fake auth host:
`/` renders the wordmark, the paint rule, the brick and a **"Sign in with
Google"** button in the site's own dark theme; `/map/` does **not** mount the
workspace, so none of its four polling hooks fire for a signed-out reader —
which was the entire reason `RequireSession` wraps the page instead of sitting
inside it. The SDK calls `<base>/get-session`, confirming the
`https://<project>.neon.tech/auth` base-URL shape.

`./scripts/check`: **8 passed, 0 failed, 0 skipped** (173 vitest tests).
`npm run typecheck`: clean. `npm run lint`: 2 warnings, both **pre-existing**
`react-hooks/exhaustive-deps` in `map/page.tsx`, shifted 21 lines by the gate
wrapper and otherwise untouched.

## The poller's heartbeat — `poll_ticks`, and why the map was empty (2026-08-15)

⚠️ **This section is MEASURED on the server side and OWES a browser pass.** Every
figure below came out of a run against the live Neon database. The four numbered
checks at the end are what a browser still owes, and none of them has been done.

### What was actually wrong

The question was why sensor data appears sometimes and not others. Read off the
live database before changing anything:

```
sensor_readings   391 rows, all mode LIVE, newest 2026-08-15 04:50:57Z
                  389 distinct observed_at — i.e. ONE tick's worth
observations      27 rows, newest 2026-08-15 04:46:22Z
MODE              'LIVE'          (matches every stored row)
WATCH_CAMERAS     27
POLL_IN_SERVICE   True
```

**The poller had run once, roughly 17 hours earlier, and not since.** The config
was correct in every particular. Nothing anywhere reported this: `/api/healthz`
answered `ok: true`, and with the loop not running in the API process
`last_tick_at` was `null` — which `lib/messages.ts` gated on `poll_in_service`
and therefore rendered as **no message at all**.

### `record_sensor_readings` now returns rows INSERTED, and the two differ

The one mechanism the plan flagged as unverified. Three consecutive live ticks:

| tick | readings handed to the insert | rows actually inserted |
|---|---:|---:|
| 1 | 391 | 332 |
| 2 | 392 | 348 |

⚠️ **psycopg 3.2.3 does sum `rowcount` across `executemany`**, and against
`on conflict do nothing` that is the count of new rows. The gap — 59 and 44 —
is FloodNet republishing an unchanged `observed_at`, which is the ordinary
state. **`stored: 0` is therefore a legitimate value and not a fault**, which is
why the UI judges `last_store_at` rather than this number.

### The heartbeat row, read back after three ticks

```
mode           LIVE
tick_at        2026-08-16 01:45:25.027002+00:00
tick_ok        True
readings       392
stored         348
last_store_at  2026-08-16 01:45:25.027002+00:00
```

One row, upserted, not three. `/api/healthz` serves it in **0.017 ms** on a
memoised call against a 10 s TTL.

⚠️ **The `/api/healthz` payload from that same process is itself the argument
for the change**: `poll_in_service: true`, `polling: false`, `last_tick_at:
null` — all three of the old fields saying nothing usable — beside a `writes`
block correctly describing the poller that ran.

### The three failures, forced

**A MODE mismatch.** `MODE=REPLAY python -m waterline.poll probe` against a
database of `LIVE` rows:

```
db  FAIL  RuntimeError: MODE=REPLAY and sensor_readings holds NO rows under it,
          while LIVE has 2,227. Every read in db.py filters on mode, so every
          surface will be empty while the table is full. Mode is compared exactly.
```

Exit status **1**. This is the only thing in the repo that can see that state.

**A failed write**, simulated by replacing `db.record_sensor_readings` with a
raise, leaving the rest of the tick untouched:

```
sensor reading write FAILED (RuntimeError): simulated: insert denied
  — 392 readings in hand, none stored
SNAPSHOT stage=write readings=392 stored=0
tick_at MOVED:        True
last_store_at FROZEN: True
tick_ok:              False
```

⚠️ **That is the whole point of the table in six lines.** The loop is running,
the tick is completing, and nothing is reaching the database — and `tick_at`,
which is all `last_tick_at` ever was, keeps moving straight through it.

**A never-ticked mode.** Before the first heartbeat, `db.poll_health()` returned
`None` and `probe` printed *no heartbeat row — no poller has ticked in this
mode*, without raising. That is the bare-`uvicorn` state and it now reaches the
page as `service:poll-absent`.

### Cost

The `db` line of `probe`, which previously called `db.init()` and nothing else,
now also counts the registry, runs the mode census and reads the heartbeat:
**1.06 s** total (21:38:42.162 → 21:38:43.221) against 2,227 rows.

⚠️ **That census is a full scan and it will grow.** No index leads on `mode`, by
choice — one on `(mode, observed_at desc)` is permanent write amplification on
~560k inserts a day. At the seven-day retention ceiling this table holds ~4M
rows, so **the figure above is not the figure that matters** and it has to be
re-taken on a full table before anybody calls `probe` cheap.

### Runners

`./scripts/check`: **8 passed, 0 failed, 0 skipped** — seven Python contracts
plus vitest at **264 tests** (up from 256; eight new cases in
`messages.test.ts`). `npm run typecheck` clean, `npm run build` clean, 19 routes.

⚠️ **Both new test groups were verified by breaking the implementation**, per
`web/tests/CLAUDE.md`. Dropping the `writes` block fails four named tests;
turning the `else if` chain into two `if`s fails three, including *a stopped
loop does not also get the dry row*. Renaming `last_store_at` on the model fails
`check_models.py` naming both sides of the wire.

### ⚠️ What a browser still owes

1. `/map` with a warm heartbeat and `poll_in_service: false` — **no poller row
   at all**. This is the healthy two-process deploy and the false positive the
   whole design exists to avoid.
2. `/map` against a bootstrapped database with no `poll_ticks` row —
   `service:poll-absent` rather than an unexplained empty map.
3. `/map` with `last_store_at` past `STORE_COLD_AFTER_S` — `service:poll-dry`,
   and **not** the frozen row beside it.
4. The strip's fixed `h-[112px] md:h-[192px]` with the new row forced, plus the
   masthead `NoticeBadge` carrying its title. A row added to a fixed-height box
   is exactly how the legend regression of 2026-08-14 arrived.

### ⚠️ One number here is not measured

`STORE_COLD_AFTER_S = 900` in `staleness.ts` is reasoned, not read. It is the
one value in this change that can produce a **false fault**. The measurement it
owes: the longest gap between two consecutive ticks with `stored > 0` over 24
hours. Three ticks is not that measurement.

## The provenance run — bounds, the pole, the silence, the tidal facet (2026-08-15)

Five facts that were already in the database or one field away, and rendered
nowhere: the plausibility bound a `FAULT` was judged against, the height the
rangefinder is mounted at, why a watch is refused, what a silence is measured
over, and the tidal flag as something a reader can filter on. Plus one rename —
the rail's `watch` tab and the mobile bar's button both read **`monitor`**, with
the value left at `"watch"`.

**What the automated runners said.** `./scripts/check`: **8 passed, 0 failed, 0
skipped**. `npm test`: **200 tests, 11 files** — 198 plus the two new
`the tidal filter` cases. `npm run typecheck`: clean. `npm run build`: clean, 19
static pages, all four routes plus the twelve auth views.

**Verified without a browser.** `IngestBounds` round-trips through pydantic to
`{implausible_min_mm: -200.0, implausible_mm: 600.0, reading_max_age_s: 21600}`,
and rejects an undeclared key, so `Wire`'s `extra="forbid"` still holds on the
new model. 21600 s renders as `6 hours` through `windowLabel`. `SensorStatus`
accepts `ground_height_mm: 2400` and `None`.

⚠️ **THIS SECTION IS UNFINISHED ON PURPOSE. It has had no browser pass, and the
list below is what it owes one.** The same gap the strip's legend regression
came through — nothing in `./scripts/check` can see any of it.

- ⚠️ **The detail panel's height with every new sentence forced on**, at 1440
  and at 390. It is `min-h-[340px] shrink-0` with an `overflow-y-auto` body, so
  the expected cost is a scroll rather than a shove — **that is a prediction,
  not a measurement**. The worst case is a faulted, silent, unwatched, tidal
  sensor with a mounting height, which renders four of the five new statements
  at once.
- ⚠️ **The controls strip is still four lines with the fifth chip.** That row is
  `overflow-x-auto`, so `tidal` should scroll rather than wrap — **predicted,
  not measured**. If it wraps it spends the one-row margin the depth bar left,
  and the list is already at four visible rows against a floor of three. **Force
  the sensors branch open at both widths and count the rows.**
- ⚠️ **The `mounted` row's width in the `<dl>`.** It is the longest value in
  that list (`2.4 m above the roadway`) against a `grid-cols-[auto_1fr]`, and
  the rail is a 372px track.
- ⚠️ **The `harbor gauges ›` button inside a flowing paragraph** — that it does
  not break the line badly at 390, and that its focus ring is not clipped by the
  panel's `overflow-hidden`.
- ⚠️ **The tab bar with `monitor` in it.** Four labels share the bar with
  `flex-1` each; `monitor` is one character longer than `notices` and two longer
  than `gauges`, and the bar is `overflow-hidden` at `h-11`.
- ⚠️ **The fault sentence against a real fault.** The measured faults are the
  four phantoms (1452 / 876 / 751 / 666 mm) and the −466 mm at Northern Blvd @
  Bell Blvd, which is the one row that exercises the shallow branch.

## The design-system import — tokens, the tabbed rail, the depth bar (2026-08-15)

The Fluud design system was imported from `claude.ai/design` (project *Fluud map
dashboard mockups*): the token layer, and the `1c → 2a → 3a/3b` thread of its
`/map` redesigns. Three things landed — named constants and two more palettes in
`globals.css`, the rail's four panels as **tabs** at `xl`, and a **depth bar**
on every list row.

**What the automated runners said.** `./scripts/check`: **8 passed, 0 failed, 0
skipped**, over the same **198 vitest tests**. `npm run typecheck`: clean.
`npm run build`: clean, 19 static pages, all four routes plus the twelve auth
views.

⚠️ **Everything below was measured in a real browser**, against the dev server
on `:3002` proxying a read-only API on `:8081`, with a live `/api/status` — 27
cameras, 5 gauges, `mode: LIVE`. **`/map` is behind `RequireSession`, which
gates on the Neon SDK rather than on `auth_required`**, so the pass was taken
behind a temporary local passthrough in that component, reverted with
`git checkout` immediately after. No account was created and nothing was written
to the auth store.

### The frame, at 1440×900

| | measured |
|---|---:|
| masthead | **54px** |
| columns | **312 / 676 / 372** |
| all three columns | **820px** = `calc(100dvh - 5rem)` |
| rail bottom | **890** against a 900 viewport |
| horizontal overflow | **0** |

⚠️ **The three tracks are unchanged by any of this**, which is the result worth
having: the tabs and the bar were added inside the measured widths rather than
by spending them.

### The tabbed rail

Each of the four tabs was pressed and the rail re-read. Every one resolved to
**exactly one visible panel at 776px** — 820 less the 44px tab bar — with its
bottom at **890**. The tab bar is `PanelHeader`'s **44px**, not the design's 40,
so it lines up with the map's and the list's chrome.

⚠️ **NOTICES is no longer below the fold, which is the whole point of `1c`.** It
was the last panel in a scrolling rail as of 2026-08-14 and that cost is
recorded in `message-strip.tsx`. It is one press away now, with its count in the
bar at all times. **`NoticeBadge` in the masthead is unchanged and still carries
the worst fault's own title** — the tab bar is `max-xl:hidden`, so on a phone the
badge is still the only always-visible fault signal.

⚠️ **The gauges tab renders at 776px against a 256px floor.** 256 is the
two-up card height at which neither face has to scroll, so the slot may give it
more and may never give it less; it is `xl:min-h-[256px]` alongside the slot's
`xl:flex-1`. **Below `xl` it is still exactly 256px** — verified at 390.

### The rows, and what the depth bar cost

The bar is a second line on every row, so rows got taller and the list shows
fewer. The floor is **at least three fully visible rows** with the controls
strip open, below which the list reads as a stub that failed to load.

| 1440×900 | strip closed | strip open |
|---|---:|---:|
| scroll region | 694px | **371px** |
| row height | 77.5px | 77.5px |
| **fully visible rows** | **8** | **4** |

At **390×844**: masthead **53px** (so the mobile bar's hard-coded `top-[53px]`
is still right), list sheet **464px**, scroll region **328px**, **4 fully
visible rows**, horizontal overflow **0**.

**Both widths clear the floor**, with one row of margin at the tightest. ⚠️ **It
was 7 rows at 1440 with the strip open before this** — the bar spends three of
them. **Anything further added to a row re-runs this table.**

⚠️ **Some rows measure 94px rather than 77.5, and it is PRE-EXISTING.** The
meta line wraps when a sensor id is long, because that span carries `truncate`
without `min-w-0` and a flex item does not shrink below its content without it.
It predates the bar and the bar did not cause it; it is simply more visible now
that rows are taller. **Fixing it would give back ~16px on the affected rows.**

### Below `xl` nothing moved, and that was the constraint

The rail is one tree at every width — the four panels are rendered **once** and
CSS decides which are painted, on the same rule the sheet layout below `md`
already ran on. Verified at 390×844: the tab bar is `display: none`, the rail
stacks all four in flow, and **the watch bottom sheet still opens** — `position:
fixed`, flush at 844, backdrop present, zero overflow.

### The palettes, and the property that matters

`data-palette` was set to each value in turn and the computed styles read off
`<html>`:

| | Bitumen | Estuary | Sodium |
|---|---|---|---|
| `--background` | `#0b0a0d` | `#06090e` | `#0c0906` |
| `--card` | `#121016` | `#0d131b` | `#14100b` |
| `--wl-panel` | `#1c1726` | `#151d28` | `#1e1810` |
| `--accent` | `#29d3ee` | `#35d6f2` | `#2fc6d2` |

⚠️ **The six frozen safety colours are BYTE-IDENTICAL across all three** —
`--wl-warning`, `--wl-emergency`, `--wl-stale`, `--wl-replay`, `--wl-live`,
`--wl-gauge`. That is the property the whole two-class split exists for, and it
is the one thing in this section worth re-checking if a palette is ever added: a
palette that could retint the depth bands would be a theme with an opinion about
how deep the water is.

### The stale path, observed rather than contrived

The readings aged past `STALE_AFTER_S` during the pass, which put the whole
staleness treatment on screen at once: pills dropped to a neutral `LAST KNOWN`,
ages went amber, map markers went hollow amber **off the band**, the freshness
line read *"newest reading 5m ago — the poller has stopped collecting"*, and the
new depth bars went amber under the note **`NOT A CURRENT READING`**.

⚠️ **That is `DepthBar` obeying "stale leaves the scale" in a real frame**, which
is the one thing about the component no test can see. A bar left in a band colour
at five minutes would have been the worst version of this change.

## The tide-and-weather tab — the NWS block and the gauge grid (2026-08-15)

The gauges tab became `tide + wx`: five gauge cards on a grid instead of two-up
with a pager, and a reserved NWS alert block above them. **Everything below was
measured in a browser** — the arithmetic that preceded it got two things wrong
and both are recorded, because the wrong prediction is the useful part.

### The runners

```
./scripts/check                8 contracts, 0 failed
cd web && npm test             13 files, 245 tests (was 200 — `nws.test.ts` adds 45)
cd web && npm run typecheck    clean
cd web && npm run build        19 static pages, clean
```

⚠️ **`check_watch.py`'s 288-combination credibility matrix and
`check_escalation.py` both passed UNCHANGED**, which is the evidence the second
witness did not move when the display feed widened to every NYC alert.

### The live feed, through `fetch_nws_alerts_all()`

```
GET api.weather.gov/alerts/active?area=NY   200
total active in NY        1
in NYC (SAME codes)       0
witness (flood/rain)      0
events                    ['Special Weather Statement']
sample geocode.SAME       ['009005', '025003', '036043']
```

⚠️ **The SAME-code guess was RIGHT and the scope wording was WRONG.**
`properties.geocode.SAME` is the correct key and the codes are 6-digit FIPS, so
`NYC_SAME` matches. But `area=NY` returns alerts that merely *touch* New York —
that sample also covers Connecticut (`009…`) and Massachusetts (`025…`). So the
copy says **"elsewhere in the statewide feed"** rather than "elsewhere in New
York State", which would have been a claim the request does not support.

### The frame at 1440×900, gauges tab active

| | px |
|---|---:|
| workspace `calc(100dvh − 5rem)` | 820 |
| − `RailTabs` `h-11` | 44 |
| **active pane** | **776** |
| − border + `PanelHeader` | 45 |
| − body padding `p-2.5` ×2 | 20 |
| − `NwsAlerts` | 112 |
| − gap | 10 |
| **grid box** | **589** |

Predicted 776 / 112 / 589 exactly. **The three tracks did not move**: 312 / 676
/ 372, zero horizontal overflow.

### ⚠️ The row fractions were BACKWARDS, and the arithmetic could not have caught it

Natural face heights, measured by cloning each face into an unconstrained probe
of the same width:

| card | width | natural height |
|---|---:|---:|
| The Battery (spanning) | 350 | **154** |
| each of the four creeks | 170 | **197** |

**A card back's height is set by how many lines its closing paragraph wraps to**,
so the *wide* card is the cheapest row, not the most expensive. Shipping the
short row last — the obvious reading of "the last row can give up slack" — was
measured at **162.6px against a 197px need: both bottom card backs scrolled by
35px** while the wide card sat on 49px it had no use for.

`[minmax(0,0.8fr) minmax(0,1fr) minmax(0,1fr)]`, short row **first**:

| row | cell | need | margin |
|---|---:|---:|---:|
| 1 — The Battery, `col-span-2` | 350 × 162.6 | 154 | +8.6 |
| 2 — two creeks | 170 × 203.2 | 197 | +6.2 |
| 3 — two creeks | 170 × 203.2 | 197 | +6.2 |

**Zero scrolling faces, all five cards, both faces each.** The margins are ~6–8px
and anything added to a card back spends them.

### The reserved block holds — 8 states, 3 widths

`NwsAlerts` forced through zero / one / eight alerts and all four feed states.
At 1440×900:

```
state                 nws   gridTop  gridH  rows  nwsOver  faceOver  ovfX
zero-current          112     236     589     0      0        0       0
zero-elsewhere        112     236     589     0      0        0       0
one                   112     236     589     1      0        0       0
eight                 112     236     589     8    458        0       0
unreachable           112     236     589     0      0        0       0
unreachable-holding   112     236     589     2    130        0       0
stale                 112     236     589     0      0        0       0
cold                  112     236     589     0      0        0       0
```

⚠️ **`gridTop` is identical to the tenth of a pixel across all eight.** An alert
arriving on a 15s poll cannot move the gauge grid under a reader's hand, which is
the whole reason the height is a literal. The block scrolls internally instead
(`nwsOver` 458 at eight alerts). Same table at 1440×800 and 1280×900.

### The degradation the deleted `min-h` chooses, at 1440×800

```
rail 720  nws 112  grid 489
cells  350×134 (back over 21)   170×167.5 (back over 30)
clippedBelowRail  −11      ovfX 0
```

Cards shorten, **card backs scroll internally, nothing is clipped** — the
negative figure is the grid sitting inside the rail. This is the argument for
deleting `xl:min-h-[256px]` rather than replacing it with a ~742px floor: that
floor would have pushed the last card out of an `overflow-hidden` rail with no
scrollbar to find it.

### ⚠️ `md:h-[648px]` was WRONG by 16px and took two passes

Below `xl` the rail is the whole page column, so the cards are wide and their
backs are short — but there are still three rows plus the 112px block. Measured
with the rail forced to 700 / 860 / 1000 / 1240px (the figure does not vary with
rail width, only the cell widths do):

| `md:h-[…]` | grid | worst face overflow |
|---|---:|---:|
| 648 (predicted) | 460 | **16** |
| 680 | 492 | **7** |
| **704** (shipped) | 516 | **0** |

`--gauges-h` follows it. Below `md` the panel is `h-[776px]`, measured at
390×844: nws 112, grid 588, **every face fits**, zero horizontal overflow.

### The tab label — the measurement that changed the word

Four `flex-1` columns in a 372px bar, `font-mono text-[10px] tracking-[0.1em]
px-1` → **92.5px box, 84.5px available**. Uppercase widths:

| label | width | verdict |
|---|---:|---|
| `instrument` (incumbent longest) | 60.0 | — |
| `tide & weather` | **84.0** | ✗ **0.5px margin** |
| `tide+weather` | 72.0 | 12.5px |
| **`tide + wx`** (shipped) | **54.0** | ✓ 30.5px |
| `weather` | 42.0 | 42.5px |

⚠️ **`tide & weather` fits and that is not the same as passing.** Half a pixel is
a label that fits by rounding; the next change to the type scale, the tracking or
the tab padding turns a control into a different word. `tide + wx` sits in the
same class as `instrument`. What pays for the abbreviation is `PanelTitle`
directly below it, measured at **178.1px, one line, unclipped** — *Tide, stream
and weather* in full.

Bar after the change: **44px**, four labels, one line each, none clipped. With
the `1 above minor flood` chip **forced on**, the header is still 44px and one
line — title 178.1 + chip 96.6 in 370px of header, no overflow.

### What this section does NOT cover

- **The palettes.** `estuary` and `sodium` were not read off `<html>` for this
  change. The block declares no new colour token and spends only `--wl-stale` /
  `--wl-dead`, both `:root` safety colours a palette may not move — so the
  expectation is no change, and **that is a prediction, not a measurement.**
- **The phone gesture pass** and the real `/map` page under a live session. The
  geometry above was measured through a temporary harness mounting
  `HarborBaseline` and `RailTabs` at the real rail widths, because `/map` is
  behind Neon Auth and the eight alert states cannot be produced from live data
  on demand. **The harness was deleted.** The rail widths, the tab bar and the
  panel chrome are the real components; what is simulated is the payload and the
  column around them.

## The front door, the notices and the map's frame (2026-08-14)

Four changes, landed together: `/` redirects a signed-in reader to the map, the
NOTICES strip moved to the foot of the right-hand rail, the masthead's brick
became flat `--wl-panel`, and **the map pans and zooms for the first time**.

**What the automated runners said.** `./scripts/check`: **8 passed, 0 failed, 0
skipped**, now over **198 vitest tests** — up from 173, the 25 new ones all in
`tests/viewport.test.ts`. `npm run typecheck`: clean. `npm run build`: clean,
19 static pages, all four routes plus the twelve auth views.

**The new tests were verified by breaking the implementation**, on this repo's
standing rule that a test never seen to fail is a test nobody has checked. Three
breaks, three named failures:

| break | fails |
|---|---|
| `settle` always returns a fresh object | **4** tests, every identity one |
| zoom about the frame's centre rather than the cursor | the 2 anchor tests |
| `+ 1` on the viewBox origin | both `FULL_VIEW` identity tests |

The four-test result for the first is the point of it: the identity contract is
what lets three call sites skip a 425-marker re-render, and it is lost most
easily inside `panBy` / `zoomAt` rather than in `clampViewport` itself. The
first draft of `clampViewport` compared against its own argument and **failed
exactly those tests**, which is how the `settle` helper came to exist.

⚠️ **`MAX_ZOOM = 12` is derived from a figure in this file rather than measured
fresh.** The worst 50px cluster at 390×844 holds **50 markers, 36 unreachable**;
×12 spreads it to 600px. **The unreachable-marker table has NOT been re-run** —
neither at full view to confirm the recorded 34% / 63% survived the threading,
nor at ×12.

### ⚠️ What this change owes a browser and has not been given one

Nothing in `./scripts/check` can see any of the four. It reaches no CSS, no
layout and no route, and `next build` proves only that the page compiles. The
list is recorded here rather than left to be rediscovered:

- **Step 2 as a pixel no-op** — marker screen positions before and after the
  `FULL_VIEW` threading. This is what makes every later number attributable, and
  the two `FULL_VIEW` identities in `tests/viewport.test.ts` are the arithmetic
  half of it, not the rendered half.
- **Masthead height after the brick swap.** It is **54px at 1440, 53px at 390**,
  and `map/page.tsx`'s mobile bar has a hard-coded `sticky top-[53px]` against
  it. A background swap should not move it. Confirm rather than assume.
- **The rail with a fault present** — NOTICES at 192 / 112px, the rail scrolling,
  nothing pushed below the fold, and the workspace holding its full
  `calc(100dvh-5rem)` now that `--wl-notices` is gone.
- **`NoticeBadge` still showing the worst fault's title with the strip off
  screen.** It is the only always-visible statement of a fault now.
- **The legend footer with all twelve keys forced on AND the zoomed paragraph.**
  The reserve is `min-h-[79px]` / `sm:min-h-[45px]` and the depth band already
  broke it once by 17px at both widths through a change with nothing to do with
  layout. `FrameNote` is a footer sibling rather than a legend cell, so it
  should spend the footer's 70px and not the grid's reserve — **that is a
  prediction, not a reading.**
- **The counter-scales at ×12** — coast stroke 1.5px, CSO dots 3.5px, markers
  11 / 15 / 7px, the violet lattice 46px in screen space.
- **The phone gesture pass** — one-finger drag scrolls the page at full view,
  pans once zoomed, and `whole city` returns both the frame and page scrolling.
- **Keyboard** — arrowing the sensor group moves the frame with focus, and
  arrows still move within the group rather than panning. Stepping the `‹ ›`
  pager onto an off-screen sensor recentres in the same paint, with no flash of
  the old frame.
- **`/` signed out, then signed in, then reloaded with a session** — the card
  with `Terms` / `Privacy`, then a landing on `/map`, then a redirect with no
  card and no Back bounce.

## Verified live (2026-08-04)

Numbers that came from running it, not from documentation. Re-verify before
quoting them — sensors get added and go down.

From `python -m waterline.poll probe` and the database it has bootstrapped.

- **425** FloodNet deployments, **21** of them without coordinates
- **401** alert-*visible*, of which **343** are also in a healthy status.
  **These are two different numbers and both are correct** — `alert_visible` is
  FloodNet's permission, `floodnet.should_alert()` additionally requires
  `sensor_status`, and only the second gates a warning. The `sensors` table
  stores the first, so a `select count(*) … where alert_visible` answers 401 and
  looks like it contradicts this file. It doesn't. See `waterline/CLAUDE.md`.
- **390–399 of 425 reporting a depth in ONE request**, ~3 above the 10 mm
  flood-event threshold. ⚠️ **Re-measured 2026-08-05 and the old figure was an
  artefact.** It read "354 reporting" and came from a query with `limit: 2000`
  and a `[:400]` slice in `probe` — at 425 deployments that window spans under
  five minutes, so slow-publishing but perfectly healthy sensors fell off the
  end and arrived as not-reporting. `distinct_on: [deployment_id]` asks for one
  row per sensor instead. See trap 3 in `floodnet.py`
- **8–9 deployments publish a row with no depth column at all** (filt, proc and
  raw all null). Those used to become a confident `0.0 mm` — `_first_num`
  returned `0` for absence. They are now dropped and counted
- **3–4 implausible on a clear day, and both signs are represented**: today
  `-1236 mm` and `-263 mm` below the floor, `1451 mm` and `834 mm` above the
  ceiling. `depth_filt_mm` is **never** negative (0 of 388 rows); every negative
  comes from `_first_num` falling through to `depth_raw_mm`, which is negative
  on 96% of rows and documented at ~-20 mm. That gap is the floor's derivation
- **FloodNet publication lag: p50 1.0 min, p90 2.2, p99 22.5, max 48.1.**
  Printed by `probe` on purpose — it is what `SENSOR_STALE_AFTER_S` (1h) and
  `SENSOR_DEAD_AFTER_S` (3h) are set against. The camera thresholds
  (300s/1800s) would render ~1 sensor in 20 permanently amber, which is the
  gauges' regression at twenty times the scale
- **968** NYC DOT cameras
- **27** gold pairs ≤100 m, **131** silver ≤250 m — from the stored pairing,
  which is only recomputed by `bootstrap`, not by a probe
- **`WATCH_CAMERAS` is all 27 of the gold tier**, so the watch list and the
  training-label tier are now the same set by construction rather than by
  coincidence. It was five, hand-picked. The list in `.env.example` is generated
  from `pairs`, not maintained by hand — regenerate it after a `bootstrap`
  rather than editing it, or it silently drifts from the pairing it claims to be
- **A tick fetches all 27 concurrently** (`poll._look`, `FETCH_WORKERS = 8`).
  Serially this was one frame fetch plus one inference call per camera against a
  60 s budget — fine at five, over budget at twenty-seven. Measured at 27
  cameras: every frame retrieved inside ~1 s wall clock. That number is
  *without* the inference credential set, so it is the floor, not the deployed
  cost — that half was the expensive one and it was a no-op locally
- ✅ **CLOSED 2026-08-05: `/api/status` now carries `depth_plausible`, and so
  does every row of `/api/sensors`.** This bullet used to end "this is the
  clearest open honesty gap in the UI" and it was right. It read: *"2 of the 27
  render a faulted depth on screen — `-466 mm` at Northern Blvd @ Bell Blvd and
  `967 mm` at BQE @ Queens Blvd, on a clear night. Neither alerted, so invariant
  5 held; but `_depth_is_credible` gates alerting and nothing gates the
  display."*

  ⚠️ **Worse than recorded: the original `plausible` rule did not catch
  `-466 mm` at all.** It was `depth < IMPLAUSIBLE_MM` with **no floor**, so the
  reading this file named as the *worse* of the two was being called believable
  the whole time — the flag existed and would have passed it. `IMPLAUSIBLE_MIN_MM`
  closes that, derived from measurement rather than guessed (see the constant).
  `scripts/check_escalation.py` asserts the widening cannot change one alerting
  decision, at both plausibility verdicts, rather than arguing it.

  The digits still render. What changed is the claim: a `FAULT` chip, a
  *"this is not a depth"* line naming which bound was crossed, an unfilled map
  ring, and a sort that puts every plausible reading above it
- ⚠️ **The masthead is 54px (53 at 390) as of 2026-08-06 — the left cluster
  matches `LandingNav`'s and the freshness summary is `md`-and-up — and the
  two bullets below are HISTORY.** The 54.5 figure below is the 2026-08-05
  measurement. The
  2026-08-05 rebuild replaced the three-column masthead with a one-line bar and
  moved the warning to `warning-block.tsx` at the foot of the rail, so the
  reserve, the rat's arithmetic and the 228.5 are all retired. They are kept
  because the reserve becomes necessary again the moment a warning sits above
  other content, and the character counts are the part nobody would re-derive.

  **What replaced them, measured at 1440x900:** header **54.5px**, workspace
  columns **312 / 676 / 372**, each **820px** = `calc(100dvh - 5rem)`, zero
  horizontal overflow, and **exactly one `aria-live` region on the page** —
  which is the check that matters most, since the warning moved. The columns
  were 788px at `7rem` until the map's legend was reported as looking clipped;
  they now end 9px above the fold, and `PanelFooter` gained 4px of bottom
  padding so the last legend line is not flush against its own border.

  *Historic —* the masthead's padded block was 228.5px, down from 299: a quarter
  removed **on the owner's instruction**, and every pixel of it came from the
  rat and the outer padding rather than from the warning's line reserve. The
  rat card used to set the row (44px bar + 16 + a 164px rat + 16 = 242); the
  warning card only ever needed 193.5. So the rat dropped to 140px and stands
  on the bottom edge of its card (`items-end`, `pb-0`) instead of floating in
  the middle of it, the outer padding went `pt-7 pb-7` → `pt-4 pb-4`, and **the
  words now set the masthead** with the decoration following.
- *Historic, and the numbers to reuse if a warning ever sits above content
  again* — **the no-jump reserve, measured rather than assumed.** The
  rat's 48.5px of slack was never what protected it. At 1440 the header held
  at 228.5px up to **330 characters** and first grows at 350; on a 390px phone
  it holds to **300** and grows at 330. The longest template is 272 (the
  Spanish `watch`), so the headroom is 78 characters on desktop and 28 on a
  phone. ⚠️ **The phone margin is the thin one — re-run this if a template
  grows, a language lands or a column track changes.** The failure is silent,
  and it is now silent with less room than it had.

  ⚠️ **The "templates run 188–272" figure that used to end this bullet is
  retired, and the reason is that there are sixty of them now.** Measured at
  `Northern Blvd @ Bell Blvd` with a 150 mm depth, the 2026-08-05 variant set
  renders **113–272**, and the longest is still the Spanish `watch` variant 0 —
  the original. A single range stopped being a useful summary the moment the
  copy became a distribution, so the bound is enforced instead of recorded:
  `check_escalation.py` fails any variant rendering over **300 characters**.
  That is the number to change if this reserve ever comes back, and 300 was
  chosen to sit under the 330 the desktop header holds while leaving the phone
  margin exactly as thin as it already was.
- ⚠️ **HISTORY — the right-hand column was one screen tall and split
  314 / 266 / 256 px** at 1440x900: the list, the selected instrument, and the
  gauges. That column no longer exists; the 2026-08-05 rebuild moved the list
  into its own first track and left the rail holding detail, gauges and the
  warning. **The 256 survived the move and is still the one number here that may
  not be traded** — it is the two-up gauge card height at which neither face has
  to scroll. The
  bottom number is load-bearing: it is the two-up gauge card height at which
  neither face has to scroll. Re-measure after changing a weight in `page.tsx`;
  the failure is silent, and it is *clipping* rather than a scrollbar.
  ⚠️ It was 302 / 277 / 256 until the controls strip landed: with the strip and
  the invariant-9 note open the list had **one** visible row against a floor of
  three, so it took 11px off the *detail* panel, which scrolls internally by
  design. The gauges' 256 was not touched and may not be
- **`/api/sensors` is 150 KB uncompressed and answers in ~13 ms** (FastAPI does
  no compression). That number is why the fetch is gated rather than folded into
  the 15s `/api/status` poll
- **Marker occlusion, measured with all 425 in view: 145 unreachable at
  1440x900 (34%), 268 on a 390px phone (63%).** The worst 50px cluster holds 50
  markers on a phone and 36 of them cannot be pressed. ⚠️ **A bigger touch
  target makes this worse, not better** — 7px box → 11% unreachable, 15px →
  34%, 25px → 60%, 39px → 77%, because invisible padding at this density is hit
  area stolen from a neighbour. The `‹ ›` pager is what actually makes every
  sensor reachable; the map alone is not addressable and
  `web/src/components/CLAUDE.md` says so
- **425 rows and 425 markers on screen cost 28 DOM mutations/second at idle** —
  that is the 27 camera rows' own `ReadingAge`, not a 1 Hz storm across the
  list. Typing six characters filters 425 → 124 rows in 207 ms. This is the
  measurement that says `sensor-row.tsx` was right not to mount `ReadingAge`
- **The map legend holds 42px at 1440 and 92px at 390 in all four layer
  combinations.** The sensor key is the seventh cell, which does open a new row
  — the reserve is what stops a toggle from shoving the page
- **760 KB of rat loops** against 37 KB of stills, one loop loaded per view.
  Measured, and neither quality nor inter-frame compression reduces it. See
  `web/src/components/CLAUDE.md`
- **84 renders in ~6 minutes** for `rat-bake.py loop`, OptiX on an RTX 3090 Ti
- **4** implausible depths rejected on a clear day (786–1458 mm, all with
  FloodNet's own `flood_detected` false) — invariant 5 earning its keep on every
  single probe, not hypothetically
- NWS reachable, 0 flood alerts active. Neither it nor the gauges need a key
- **5 gauges reporting, 0 stale.** Battery **4.46 ft MLLW** against a minor-flood
  stage of **6.90** — that pairing is printed by `probe` on purpose, because a
  datum mistake is invisible in one number and obvious in two. The four USGS
  creek gauges publish no flood stage and the UI says so rather than borrowing
  the Battery's
- **USGS lag is 21–81 min, and sampling is every 15 min exactly** (190 points
  per 48h, median gap = max gap = 15m, all four sites). Those are different
  quantities and the staleness thresholds are set against the *lag*. Assuming
  they were the same shipped a first draft that rendered three healthy gauges
  permanently amber
- **213 NTAs** in the rodent aggregate, 183 of them above the 30-inspection
  rating floor, ranging 0% to 72% rat activity over denominators from tens to
  13,877. All **27** watched cameras resolve an NTA. That spread over that range
  of denominators is why the number is shown beside its count and never as a
  colour
- **427 CSO outfalls** across 60 receiving waterbodies, all inside the map
  viewport, registry dated 2015
- **All 5 gauges plot inside the map viewport**, so the gauge off-map counter is
  defensive on the same terms as the camera one
- **`/api/gauge-history` returns 5 series**, and their lengths are wildly uneven
  by design — the Battery had 56 points over 5.5h against 6-7 for each creek,
  because CO-OPS publishes every ~6 min and USGS every ~15. That is why the
  query takes the last N *per gauge* rather than a flat limit
- **6 graffiti rats, 418KB**, at 448px/q74. Distribution over the 27 watched
  cameras is `[4, 4, 7, 4, 3, 5]` with the avalanche step in `ratFor`, and
  `[6, 4, 1, 2, 8, 6]` without it — measured, and the reason that step exists
- **12 ComfyUI candidates to ship 6.** Four were rejected because the white key
  failed outright, and the tell is the `ink` column: a clean cutout runs 45-70%
  and a failed one 84-89%
- Every camera and every sensor falls inside the map viewport with margin, so
  the "outside the mapped area" counter in `city-map.tsx` is defensive rather
  than expected. If it ever fires, the upstream feed has moved, not the map

### ⭑ The strip, measured 2026-08-14 while doing it

Three layers were removed — the water-segmentation vision layer, the on-page
alert system, and Google Cloud Run — and the product was renamed to **Sewer Rat**. Everything here came from running the result.

**The suite.** `./scripts/check` **8/8**. `npm test` **173** (was 165): four new
groups over `depthBand`'s two threshold boundaries and `compareCameras`'
tiering, minus the five ordinal-class tests that went with the layer.
`npm run typecheck` and `next build` both clean.

**Five deliberate mutations, each failing with a named assertion**, because a
green run proves nothing about an assertion nobody has seen fail:

| mutation | fails |
|---|---|
| re-add `severity` to `Observation` | `Observation carries no camera judgement` |
| re-add `vision_estimate_cm` to `Observation` | `Observation carries no estimate field…` |
| add a fourth witness to `_depth_is_credible` | **16** in `check_escalation`, **24** in `check_watch` |
| re-add `vision_estimate_cm` to `CameraStatus` | `CameraStatus carries no \`vision_estimate_cm\`` |
| re-add `StatusResponse.alerts` | `StatusResponse carries no alerts` |

Two more on the web side: painting `DEPTH_BAND_PILL.none` green fails two named
tests and making the flood boundary exclusive fails two more; reducing
`compareCameras` to an `observed_at` comparison fails three, **including the one
asserting it is not vacuous when every timestamp is identical**. That is the
whole point of that test — `poll.tick` stamps every camera with one `now`, so
an age-only sort ranks nothing while still appearing to work.

**The wire, through `/openapi.json` on the real mount.** `Severity`,
`VisionResult`, `AlertStatus`, `WatchCameraRef` and `SpeakEvent` are all
**absent** from the schema. `CameraStatus` is
`calibrated · camera_id · depth_mm · depth_plausible · image_url · lat · lon ·
name · nta · nws_active · observed_at · rodent_* · sensor_id` — no `severity`,
no `severity_label`, no `confidence`, no `vision_estimate_cm`.
`StatusResponse` has no `alerts`. FastAPI title: **Sewer Rat**.
`/api/events`, `/api/speak` and `/api/rat/drill` all **404**.

**Routes, through the real `StaticFiles(html=True)` mount.** `/` 200, `/map`
307 → `/map/` 200, `/about/` 200, `/terms/` 200. All four titled *Sewer Rat —
NYC flood watch*, **zero** occurrences of the old name in any served HTML, no
`Roboflow`, no `display only`.

**The browser pass**, `prod:local` rather than `next dev`, with `/api/status`
stubbed over seven camera states (curb · flood · under · faulted · unpaired ·
stale · dead):

| | 1440×900 | 390×844 |
|---|---:|---:|
| masthead | **54px** | **53px** |
| columns | **312 / 676 / 372** | stacked |
| gauge slot | **256px** | — |
| list sheet | — | **464.2px**, 6 visible rows |
| sticky bar offset | — | **53px**, matching the masthead |
| `aria-live` regions | **0** | **0** |
| horizontal overflow | **0** | **0** |
| wordmark | 1 rect, 20.9px = line-height | same |

⚠️ **Zero `aria-live` regions is the deliberate consequence of unmounting the
warning**, not an accessibility regression to be found later. Nothing announces
because nothing is announced.

**The only green on the page is the outlined `LIVE` badge** —
`rgb(34, 197, 94)` on ink and rule with a transparent ground. Nothing else in
`main` or `header` matches `--wl-live` or `--wl-clear`. Marker fills read
`rgb(220,38,38)` at curb, `rgb(217,119,6)` at flood, `rgb(141,132,160)` under,
hollow `rgb(245,158,11)` stale and hollow `rgb(220,38,38)` dead. The `under`
and `last known` pills are neutral outlines with **no ground at all**.

**The comparator holds against a faulted rangefinder.** With 1451 mm marked
implausible in the payload, that row sorts **sixth of seven** — behind every
believable reading and ahead only of the camera with no depth — and keeps its
digits under a fault title. The unpaired camera renders an em-dash, never a `0`.

#### ⚠️ The depth band broke the map legend's no-jump reserve, and it was measured rather than noticed

Two camera keys became four, so the maximum cell count went 10 → **12**. With
all twelve forced on the legend renders **3 rows / 45px** at 1440 and **5 rows
/ 79px** at 390, against reserves of **28** and **62** — both **17px short**.
A layer toggle would have grown the panel footer under the reader, which is the
exact failure that reserve exists to prevent, arriving through a change that
had nothing to do with layout.

Raised to `min-h-[79px] sm:min-h-[45px]` and re-measured: the legend is
**45px at 1440 and 79px at 390 in both the 7-key and the 12-key state**, the
panel footer holds at **70px** across both, and document overflow is zero.

#### The two things this pass could NOT exercise

- **`/api/status` against the live database.** This machine has no IPv6 default
  route and the Neon pooler refuses an IPv4 connection (`password
  authentication failed` by raw IP, `Inconsistent project name inferred from
  SNI` with an endpoint option). An environment condition, not a code one —
  `polling: true` with a fresh `last_tick_at` proves the loop is running, which
  is exactly what that field is for when a tick keeps raising.
- **The subscribe-to-mail round trip**, for the same reason. `mail.render` was
  driven directly instead, which is pure: both languages carry **Sewer Rat** in
  the subject and the disclaimer, the body contains
  `agent.warning_text_for_depth` **verbatim**, and `watch_note` is
  byte-identical inside `mail_confirm`.

---

### ⭑ FloodNet during a Flash Flood Warning, measured 2026-08-07 22:11–22:22Z

**The most useful calibration reading in this file**, because it is the first
one taken while NWS had an active Flash Flood Warning over the city. The
question it answers is *are the sensors broken*, and the answer is no. From
`python -m waterline.poll validate`, which was written for this and is the
command to re-run.

- **425 deployments with coordinates, 21 without** — identical to 2026-08-04.
  ⚠️ **The raw `deployments` query answers 446, and comparing THAT against the
  425 here reports drift that does not exist.** The Socrata join drops the 21;
  every pinned figure in this file counts `fetch_sensors()` output.
  `poll.PINNED_DEPLOYMENTS` carries the same warning at the constant
- **408 alert-visible** — unchanged from the 2026-08-07 deploy section below,
  against the 401 of 2026-08-04. **352 alert-permitted**, against **343**. The
  registry moved by 9 on the gate that mails somebody
- **392 of 425 reporting** inside the 6 h window. Lag **p50 1.0 min, p90 3.5,
  p99 65.3, max 254.2** — the feed is live and fast
- ⚠️ **17 deployments published a row with every depth column null**, against
  the **8** measured 2026-08-05. `_first_num` drops and counts them, so none
  became a fabricated `0.0 mm`. The number roughly doubled in two days and
  nothing else changed; worth watching rather than acting on
- **376 of 392 read exactly 0.0 mm — 96%.** Six plausible readings at or above
  10 mm, two at or above 150 mm. Ten implausible and rejected (the largest
  1979 mm, the smallest −1218 mm), every one with `flood_detected` false
- ⚠️ **The storm arrived DURING the measurement, which is the whole value of
  this section.** Four runs across 17 minutes: readings at or above 10 mm went
  **6 → 9 → 11**, and at or above 150 mm **2 → 4 → 3**. The implausible floor
  reached **−7443 mm** on the last run. Nothing here is a resting state — it is
  a rising one, and the figures above should be read as a snapshot of a city
  taking on water rather than as a baseline
- ⚠️ **`flood_detected` is DORMANT, and reading it alone says something false.**
  It was true on **zero of ~390 rows** across four runs — including on
  instruments FloodNet's own annotator had opened a flood event for minutes
  earlier. Taken by itself it reads as *we never agree with FloodNet*, which
  would send somebody hunting a parser bug that is not there. **`flood_events`
  is the channel that was live.** The two have different latencies and neither
  substitutes for the other, so `validate`'s agreement block reads **both**
- ✅ **Our detection LEADS their annotation, measured twice inside 20 minutes.**
  At 22:11 `validate` flagged `visually-endless-martin` at **111 mm** and
  `purely_fancy_kite` at **58 mm** as raises FloodNet had not confirmed. By
  22:28 FloodNet had opened annotated flood events on **both** — martin at
  22:10:55 (confidence rising 0.636 → 0.733) and kite at 22:15:36 — while the
  same sensors read **161 mm** and **67 mm**. That is the strongest available
  evidence that the parse is correct: the pipeline saw the water first and
  upstream agreed afterwards. It is also why the "we raise, they have not
  annotated" line is `INFO` rather than a warning
- **Both facts are true at once and the reconciliation is the point.** NWS
  issues a flash flood warning from radar-estimated rainfall rate across whole
  counties. FloodNet measures standing water at a few hundred specific corners.
  Central Park reported "Clear" at 20:51Z with null precipitation. **Rain
  falling and water ponding at an instrumented intersection are different
  quantities**, and this is invariant 17 in live data rather than in prose
- **The deployed service was correct throughout.** 25 alerts open: **24 WATCH**
  raised by `nws_active` through `escalation.level_for`, and **one WARNING** —
  3 Ave @ Union St, peak **44 mm** — the only corner where a sensor saw water.
  `last_tick_at` 16 s old, all 27 cameras at 1.0 min reading age
- ⚠️ **29 deployments have nothing inside the window because their newest row
  is dated 2080.** Trap 1, counted for the first time by
  `floodnet.skewed_deployments`. They arrive as silent, which is
  indistinguishable from quiet without this query

#### ⚠️ `fetch_flood_events` returned nothing but the broken clocks

Found by the same run, and it had been true for the whole life of the function.
`order_by: {start_time: desc}` carried **no time bound**, so the 2080 devices
sorted straight to the top: **all ten newest annotated events were dated 2080**
and no real storm was reachable at any `limit`.

It had **zero callers**, so nothing was wrong on a page. What was wrong is that
its docstring offers replay as the way to test this pipeline against a storm a
human confirmed, and the offer did not stand up.

- Bounded on both sides now, default 7 days. **65 real events in the last 7 d**,
  newest `2026-08-07T10:42:19` — three that morning at
  `unexpectedly-drowsy-penguin`, one at confidence **0.999**. 327 over 30 days
- ⚠️ **`flood_events.start_time` is `timestamp`, NOT `timestamptz`** — the one
  time column on this API carrying no offset, with `depth_data.time` next door
  being the other kind. Declaring `timestamptz!` is a hard Hasura validation
  error, which is the good outcome; the bad one is reading the naive values as
  local and shifting every bound by four hours
- `scripts/check_ingest.py` pins the rule through `floodnet._in_clock_window`.
  **Mutation-tested per `scripts/CLAUDE.md`**: dropping the future bound — the
  one-sided `now - max_age <= ts` that looks like an ordinary freshness check —
  fails **4 named assertions**, including at a hundred-year age bound
### The depth timeframe, measured 2026-08-06 while building it

Driven through the real static mount against the live registry, not reasoned
about.

- **All three answer shapes exist in live data**, which is why the response
  carries `readings` and `faulted` separately rather than one count. A real peak
  (`dryly_receptive_rabbit`: 0 mm now and over the last hour, **200 mm** within
  the last day — the case the feature exists for); an empty window; and
  ⚠️ **every reading a fault** — `closely_muddy_scurvy` at **1,264 faulted and
  0 believable**. That third one is not hypothetical and it is the reason the
  two zero-peak branches say different sentences
- **Route behaviour, through the mount**: unknown id → **404**, bad `kind` →
  **400**, `minutes=525600` → **200 echoing 10080**. ⚠️ The 404 is the *opposite*
  of `/api/history`'s and the contrast is deliberate — see `waterline/CLAUDE.md`
- **The control fires no request at rest.** Measured by wrapping `fetch`: **0**
  calls to `/api/depth-peak` over 3s on the current reading, **1** after picking
  a window. Same gating instinct as `use-sensors.ts`
- **Popup, at 1440 and 390**: `role="dialog"` + `aria-haspopup="dialog"` (not
  `menu` — it holds a number input and a `<select>`), presets are `aria-pressed`
  buttons, Escape closes **and returns focus**, an outside `pointerdown` closes,
  picking closes. At 390 the panel is 240×344 with its right edge at **269** of
  390, so it never leaves the viewport
- **Copy**: `90 minutes` renders `last 90 min`, never `last 1.5 hours` — units
  step up only where they divide exactly. A 365-day request previews its own
  clamp on the button (`apply · last 7 days`) rather than only reporting it
  afterwards. An empty field disables apply
- **Layout unchanged**: header **54px** at 1440 / **53** at 390, columns
  **312 / 676 / 372** at 820, depth-row overflow **0**, document overflow **0**,
  and **exactly one `aria-live` region** throughout
- ⚠️ **151 vitest tests, up from 136**, and the new ones were verified by
  BREAKING them: drifting `RETENTION_DAYS` to 30 fails two named parity tests,
  and changing a preset fails two more. A test never seen to fail is a test
  nobody has checked
- ⚠️ **A stale-poller artefact was found and is worth knowing about, because it
  looked exactly like a product bug.** 666 `observations` rows carried
  `depth_plausible = true` while sitting outside the −200…600 mm band (up to
  1573 mm), so a long-window camera peak rendered **61.9 in**. `sensor_readings`
  was clean throughout. Cause: **five uvicorn servers were running with
  `POLL_IN_SERVICE=true`**, four of them started before `b576739` (2026-08-05
  09:41) added `IMPLAUSIBLE_MIN_MM`, each still writing under the old rule.
  `sensor_readings` escaped because its unique key is FloodNet's own timestamp
  so duplicate writes collapse; `observations` keys on **tick** time, so every
  poller adds its own row. Resolved by stopping the four and correcting the flag
  — `update … set depth_plausible = false`, **not** a delete, because a faulted
  reading is the evidence the instrument broke (`prune_outbox`'s rule).
  **The lesson is operational**: `ps aux | grep waterline` before trusting local
  history, and note that N pollers write N× the observations

### The list peaks and the pager, measured 2026-08-06 while building them

Driven through the real static mount against the live registry, not reasoned
about. Full argument in `web/src/components/CLAUDE.md`; these are the numbers.

- **The bulk peak query is 25.6 ms**, `401 groups` over **442,537**
  `sensor_readings` rows at the seven-day ceiling, and 14.9 ms at an hour. That
  measurement is the whole reason `/api/depth-peaks/{kind}` exists instead of
  425 calls to the single-instrument route
- **Every windowed row wears the word `peak` — 20 of 20**, and **zero** rows
  render an unlabelled zero. The strip above the list states it in a sentence as
  well. Both were checked by reading the rendered rows rather than the code
- **All three silences appear in live data.** A real peak with exclusions
  (*"highest believable reading of 355 in this window (799 faulted, excluded)"*),
  a clean peak, and the faulted-only case the feature's three sentences exist
  for. The em-dash is never a `0`
- **Pagination**: cameras `1–20 of 27` → `page 1/2` → `21–27 of 27` with Next
  disabled at the end; sensors `page 2/22`. Row height **41.8px** unchanged and
  **5 fully visible rows at 390** against the measured floor of three
- **The detail pager drags the list page with it** — 22 steps moved the list to
  `page 2/2` in the same event, never an effect
- ⚠️ **Two control bugs, both found by the owner.** Opening the timeframe menu
  **flipped the camera panel over**, because the press bubbled into the
  panel-wide flip handler; the stop is on the menu's own root, so every press
  *inside* the popup is covered too. And in the list the popup was **clipped
  away entirely** — `Panel` is `overflow-hidden` and a left-anchored 240px panel
  at the right end of a 312px track is simply not drawn. After the fix, measured
  with the menu open: **13px inside** the panel's right edge at 1440 and at 390,
  all six controls present
- ⚠️ **A module cycle was created and removed.** The shared depth cell was first
  exported from `station-list.tsx`, which made `sensor-row.tsx` import from the
  file that imports it. It typechecked. It lives in `depth-cell.tsx` now
- ⚠️ **The camera detail panel is 569.9px and the sensor one is 820px**, because
  only the first is inside `FlipCard`. **Pre-existing**, measured while aligning
  the two faces, and deliberately not changed — recorded so a later measurement
  does not read it as a regression
- **151 vitest tests still pass and `./scripts/check` is 8/8.** ⚠️ Nothing in
  either can see a CSS clip or a bubbling click, so this feature's enforcement
  is the prose above and the review that reads it — the same standing gap
  `.wl-swell` records

### The confirmation recovery, measured 2026-08-06 while building it

Driven through the real routes against the real database, and through the real
static mount in a browser. Not reasoned about.

- ⚠️ **The gap was real and it was total.** Before this, an unconfirmed address
  whose mail never arrived had **no route at all**: `subscribe` hits
  `subscribers.email unique` and queues nothing, `resend` refused on
  `confirmed_at is not null`, and the panel says `pending` either way. The only
  thing that ever touched the row was `db.prune_unconfirmed`, **seven days**
  later. `/api/watch/resend` has two branches now
- **The cap holds and the response never moves.** Four resend calls against
  `CONFIRM_RESENDS_MAX = 3` produced confirm counts `2, 3, 3, 3` — the third
  and fourth are no-ops — and **all four states answer byte-identically**:
  confirmed, unconfirmed, capped and unknown all return
  `{"status": "pending", "note": …}`. Checked as an equality, not by eye
- **The repeat is byte-identical to the original.** Three `confirm` rows for one
  subscriber, one distinct subject and one distinct body across all of them. So
  the second envelope cannot disagree with the first about which corners were
  asked for, and the first link stays live
- **The branches do not leak into each other.** After confirming, the next
  resend wrote a `resend` row carrying `?watch=` and **no** `?confirm=`; the
  confirm count stayed frozen at 3 while the resend count grew to 4. The
  confirmed branch is deliberately uncapped — it only ever writes to an address
  that completed double opt-in
- ⚠️ **A test-harness trap that cost a re-run, and it is worth knowing.**
  `RESEND_PER_MINUTE = 5` is a global sliding-minute bucket, so a drive script
  making seven calls gets **429s on the last two** — and those two carried the
  known-vs-unknown and post-confirm assertions, which therefore never ran while
  the script reported success. The rate limit was working correctly. Clear
  `api._resend_hits` between phases, or measure fewer things per minute
- **`PUBLIC_BASE_URL` was unset and the confirm link was a sentence.** `_link`
  was rendering `(this deployment has no public URL configured; token: …)` into
  every confirmation, so the whole flow could be completed and never confirmed.
  It renders `http://localhost:8090/map/?confirm=<token>` now. ⚠️ **Local is
  8090, not 8080** — 8080 is SearXNG on this machine, and it answers `/healthz`
  with a 200, which is exactly as misleading as it sounds.
  ⚠️ **THE PATH IN THIS READING IS THE OLD ONE AND IT WAS THE BUG.** `/map` is
  gated, so this link was unreachable to the reader it was for. It is
  `/watch/?confirm=<token>` since 2026-08-16 — see the entry dated that day. The
  reading stands as what the link said on the day it was taken
- **`mail_delivers` is on the wire and both UI branches render.** At 1440×900
  against an instance reporting `false`: the amber line at
  `rgb(245, 158, 11)` on the `WAITING ON …` face, *"Check that address"*
  **absent**, `stop waiting` and its three sentences intact, **exactly one
  `aria-live` region**, zero document overflow, header **54px**. Against a
  server that **omits the field** — the real version-skew case, driven on an
  instance running the older code — the original copy renders and the amber
  line does not. At 390 the panel is the closed sheet and the page-level checks
  hold at header **53px**
- ⚠️ **The transport check was verified by BREAKING it.** Dropping the
  `smtp_host` half of `mail.transport_delivers()` fails `check_mail.py` with a
  named assertion (`transport_delivers('smtp', host=''): got True, want False`).
  A check never seen to fail is a check nobody has checked
- **`./scripts/check` is 8/8 and `npm run typecheck` is clean.** ⚠️ Nothing in
  either can reach `api.py`'s branch predicates or the cap — that module is one
  of the three holes in `waterline/CLAUDE.md`'s coverage table, and exercising
  it needs a database and a process. **The docstrings and the review that reads
  them are the enforcement**, the same standing gap `.wl-swell` records
- **Test rows were driven and removed.** Two subscribers confirmed then
  unsubscribed through the real route (cascade to zero), one deleted directly.
  ⚠️ The drive ran with `POLL_IN_SERVICE=false` throughout — N pollers write
  N× the `observations` rows, which is the artefact recorded above
- ⚠️ **The pick face's one recovery button was BOTH confusing and incomplete,
  and it was the owner who caught it.** *"already subscribed? email me my
  link"* asks a first-time reader a question they cannot answer and offers a
  link they do not have — and the unconfirmed branch above made it describe
  only half of what the route does, because somebody who signed up and never
  got the confirmation matches neither clause. It is **two doors** now,
  `verify email` and `resend link`, and the email face's submit renders
  whichever was pressed. **A feature that widens what a route does has to be
  read back against every label pointing at it**; this one was not, until it
  was looked at
- ⚠️ **They wrap badly as three in a row, measured rather than assumed.** Left
  as two more children of the submit's row, the break at 1440 landed *between*
  the doors — `verify email` beside the filled submit, `resend link` orphaned
  underneath. Their own `w-full` row fixes it structurally, which is
  `stop waiting`'s rule arriving a second time. After: 1440 submit alone at
  `top 1118` and both doors at `1153`; 390 with the sheet open, submit at
  `767` and both doors at `802`, right edge **250 of 390**. One `aria-live`
  region and zero overflow at both
- **The success copy had to get VAGUER, not clearer.** It said *"If that
  address has a confirmed watch, its link is on the way"*, which was accurate
  with one branch and now names the outcome — telling a reader which state
  their address is in, the one thing the identical server response exists to
  withhold. It reads *"If that address is on Sewer Rat, the email it needs is
  on the way"*

### The sensor watch, measured 2026-08-05 while building it

- **The whole rail still fits, with the watch panel in it.** Re-measured at
  1440x900 rather than reasoned about: header **54.5px**, columns
  **312 / 676 / 372** at **820px** each, the gauges' **256px** untouched, zero
  horizontal overflow, and **exactly one `aria-live` region on the page** — still
  the warning's, still `polite`. The panel is **323px** and the rail scrolls,
  which it already did. That last check is the one that mattered most: a second
  live region would mean two things competing to interrupt a screen reader
  during a flood
- ⚠️ **`outbox_once` on `(subscriber, kind, episode_id)` silently ate the
  escalation email**, and this is the bug worth remembering because of how it
  presented. An episode gets exactly one `watch` message for its whole life under
  that key, so a subscriber told *"water on the street"* could never be told it
  went above the curb: the escalation was written to `sensor_episodes`, the
  message hit `on conflict do nothing`, and **nothing anywhere logged a failure**.
  It was caught by driving a real episode through and noticing the outbox ids ran
  `6, 7, 9`. `level` is in the key now — a repeat tick at one level is still a
  no-op, and a real escalation is a different row
- ⚠️ **A queued reading loses to a FloodNet row whose clock runs ahead**, which
  is a test-harness trap rather than a product bug and cost twenty minutes. The
  local clock sat ~17s behind FloodNet's `observed_at`, so injected readings
  stamped `now()` were older than rows already in the table and
  `watched_sensor_rows`' `order by observed_at desc` never saw them. Inject
  relative to `max(observed_at)`, not to `now()`
- **`select … for update skip locked` does not work in this codebase's idiom**,
  and it fails silently. Every function here commits at the end of its
  `with conn()`, so the row lock is gone by the time the caller holds the rows and
  a second drainer sees them as free. The claim is the `update` itself —
  `db.pending_outbox` takes rows rather than reading them, and `requeue_stalled`
  frees ones a dead process left in `sending`
- **`_depth_phrase` was English-only, and had been the whole time.** The Spanish
  `warning` read *"Hay agua en la calle en Ave C @ 23 St. about 2 inches."* —
  the one clause carrying the actual number, in the wrong language, mid-sentence.
  `unknown_depth` was localised beside it, which is exactly why it survived: the
  absence case read correctly and the present case did not. Found by rendering
  every template in both languages side by side and **reading them**, which is
  the check no assertion in this repo would have made
- **All 425 deployments are offered, 343-ish are watchable.** The subscribe route
  refuses a non-`alert_permitted` id with a 400 naming the reason rather than
  dropping it quietly — a reader who thinks they subscribed to twelve corners and
  got eight has been told something false about what this app will do for them
- ⚠️ **HISTORY — one FloodNet outage would have been one email per subscription,
  and the measurement is why the notice is not an email any more.** The silence
  notice was per-sensor: right when one instrument stops, catastrophic when the
  feed does, because every subscribed sensor crosses the threshold in the same
  tick. Measured with five subscribers watching ten instruments each: **50 emails
  from a single tick**, suppressed to **0** by `watch.citywide_silence`. Silence
  became a panel line on 2026-08-05 so that fan-out cannot happen at all. **The
  suppressor survives and still earns its keep**, because the other half of its
  argument never depended on the transport: half the city dark is our feed, not
  their instrument, and naming a reader's corner then is false on a page exactly
  as it was in an inbox. Threshold unchanged — half the registry against a **7%**
  resting floor (~30 of 425 legitimately quiet on any tick). Water episodes are
  never gated on it
- **Nothing sends by default.** `MAIL_TRANSPORT=log` renders, logs in full and
  marks `skipped`; verified that `smtp` with `SMTP_HOST` unset stays `queued` and
  logs an error rather than silently falling back. Against a real socket the
  message is `text/plain`, no `multipart`, with `List-Unsubscribe` — captured and
  read, not assumed

### The 2026-08-05 changes, verified against the live registry

Driven end to end through the real API and the real database, not reasoned about.
Registry at the time: **425 deployments, 343 alert-permitted, 394 reporting
inside the hour, 1 that has never reported at all.**

- **`silent` is per-instrument and it is real.** A subscription to
  `dryly_receptive_rabbit` (reporting) and `rarely_intent_donkey` (has never
  reported) came back `silent=false` and `silent=true` respectively, with
  `citywide_silence=false` beside them. That single never-reported deployment is
  the whole reason the `last_seen_at is None` branch could be exercised against
  live data rather than a fixture
- ⚠️ **Coverage is counted out of Postgres, and the in-process version was
  wrong.** `poll.LAST_COVERAGE` is only ever stamped in a process running the
  poll loop, so on an API-only instance (`POLL_IN_SERVICE=false`) it stays
  `(0, 0)`, `citywide_silence` reads that as unmeasurable and suppresses, and the
  panel claims a **permanent FloodNet outage on a healthy deployment**. Caught by
  running the API without the poller. `db.registry_coverage` counts the same two
  numbers from `sensor_readings`, so every process agrees and it survives a
  restart. The global is **deleted, not orphaned**
- ⚠️ **The window for that count is `SENSOR_STALE_AFTER`, the same hour
  `is_silent` uses.** Two thresholds for one question is how a panel comes to
  suppress a line it would never have drawn, or draw N lines while denying the
  outage they add up to
- **`List-Unsubscribe` carries the manage token**, captured off a real
  `EmailMessage`: `<https://…/map/?watch=TOKEN>`. It was `<…/map/>` with no
  token, so a client's unsubscribe button landed an anonymous visitor on the map.
  ⚠️ **THE PATH HERE IS THE OLD ONE.** `/map` is behind the session gate, so
  this header sent a subscriber with no Fluud account to a sign-in page — the
  same defect as the body's link, arriving through a header a mail client acts
  on unread. `<…/watch/?watch=TOKEN>` since 2026-08-16, and
  `mail.unsubscribe_header` is a pure function now so `check_mail.py` asserts it
  instead of a person capturing it.
  With `PUBLIC_BASE_URL` unset the header is **absent** rather than malformed —
  `_link`'s explanatory sentence is right in a body and wrong in a header, and it
  would have shipped a live token inside it
- **`/api/watch/resend` answers `200 application/json`**, which is the only proof
  that a route sits above the UI mount — a GET to a POST-only route returns the
  404 *page*, so the obvious test cannot see the difference
- **The response is identical for a known and an unknown address**, byte for
  byte. ⚠️ The first draft was not: it rendered `note` in the *subscriber's*
  language, so the reply varied with whether the address existed and leaked which
  language they picked. It renders the **requested** language now
- **Unsubscribe still cascades to zero** — subscribers, subscriptions and outbox
  all 0 after one call

### The 30 rat speeches, measured 2026-08-05 while building them

- **60 strings**, 30 per language: 16 watch / 11 warning / 3 emergency. They
  render **113–272 characters** at `Northern Blvd @ Bell Blvd` with a 150 mm
  depth, and the longest is still the Spanish `watch` variant 0 — the sentence
  that already shipped. `check_escalation.py` caps every one at **300**
- **Read all 60 side by side, in both languages.** That is the check no
  assertion in this repo makes, and it is the one that caught `_depth_phrase`
  rendering *"Hay agua en la calle en Ave C @ 23 St. about 2 inches."* ⚠️ The
  Spanish 30 have NOT had a native-speaker pass and are owed one
- **Five subscribers to one episode receive one body**, byte for byte, and it is
  the body the page rendered for the same alert — driven through `mail.render`
  and `agent.warning_text` with a shared seed rather than reasoned about
- **40 episodes at one corner produce 10 distinct openings** at `warning`
  (11 variants), and **8 corners produce 4 distinct variants** at `watch` with no
  episode — collisions at 8 samples over 16 slots are the birthday paradox, not
  a clumping hash
- **An escalation re-rolls the slot**: one episode walked watch → warning →
  emergency landed on 9/16, 7/11, 1/3. **The drill repeats**: 1 distinct
  sentence over 20 presses, because it is deliberately unseeded
- **Distribution over 500 seeds is flat enough to assert**, so the coverage and
  spread checks cannot be flaky — every variant reachable, none above twice its
  share. That is the clearest statement of what the hash buys over a draw
- ⚠️ **Eight mutations were driven through the checker and every one now fails
  with a NAMED assertion.** Two did not at first, and both were the same defect
  in the checker rather than in the copy: a bare-string level key made
  `Formatter().parse` raise *"Single '{' encountered"*, and a typo'd slot made
  `.format` raise `KeyError: 'plce'` inside the purity grid. In both cases the
  correct assertion had already recorded its failure and **never got to print**,
  because `check()` accumulates and a later line crashed first. Two gates now
  bail to the report before anything renders. **The lesson generalises: in a
  script that accumulates failures, any assertion downstream of a crash is
  decorative** — test the checker by breaking the thing it checks
- ⚠️ **The missing-comma trap has TWO forms and only one is a type error.**
  Dropping the comma from a one-element tuple gives a `str` — measured,
  `emergency` became 161 characters whose `[0]` is `'W'`, so `variants()`
  reported 161 of them. Dropping the comma *between* two variants is not a type
  error at all: Python welds them into one sentence and the count drops by one.
  `isinstance` catches the first; only the en/es **count parity** catches the
  second

