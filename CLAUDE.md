# CLAUDE.md — Fluud

Hyperlocal NYC flood watch. It reads FloodNet's 425 calibrated depth sensors,
draws every one of the city's ~970 DOT camera views on a map — labelling the
~130 that sit on a corner a sensor watches with that sensor's depth — and emails
you when a sensor you picked changes state.

⚠️ **Those two are approximate ON PURPOSE.** DOT's registry moves: it returned
968 on 2026-08-04 and 973 on 2026-08-16, and `pairs` went 130 → 133 in the same
bootstrap. **`MEASUREMENTS.md` holds the dated figures and
`python -m waterline.poll probe` is the authority.**

⚠️ **It COLLECTS 27 and DRAWS 968, and the two numbers are different
questions.** `poll.tick` writes `observations` rows only for the ids in
`WATCH_CAMERAS`, which is what `/api/status` carries and what the panel, the
list, the sparkline and the pager all page through. `/api/cameras` serves the
registry, so the map's camera layer can reach the rest. **A claim about "the
cameras" has to say which set it means.**

It writes; it does not speak. The one place it says anything is an email.

## What this is, after the strip

⚠️ **FIVE things were removed and the shape of the app is what is left.** Read
this before reasoning from anything that mentions them. The last two landed on
2026-08-14 with the rename from **Sewer Rat** to **Fluud**, and between them
they took the mascot, the voice, one whole page and a live data feature.

- **The vision layer is gone.** `waterline/vision.py` is deleted, with the
  Roboflow settings, `pillow`, `numpy`, `cameras.fetch_frame` and the
  `calibration` table. Nothing fetches a frame. A camera is a **view**: a still
  a reader's own browser loads from DOT, a pin, a name, and its paired sensor's
  depth. It contributes no judgement of any kind.
- **The on-page alert system is unwired, not deleted.** No `alerts` table, no
  `/api/events`, no `/api/speak`, no `/api/rat/drill`, no warning panel.
  `escalation.py`, `rat.py`, `warning-block.tsx`, `alert-list.tsx`,
  `rat-figure.tsx`, `drill-controls.tsx`, `lib/warning-feed.ts` and
  `lib/hooks/use-warnings.ts` are all kept as files with no caller and no
  mount, and their check scripts keep running, so putting the warning back is a
  re-wire rather than a rebuild.
- **The camera email watch is dormant.** `camera_subscriptions` and `outbox`'s
  `camera` kind stay in the schema holding rows nothing reads;
  `/api/watch/subscribe` and the `subscription` PUT refuse `camera_ids` with a
  400 naming the reason.
- ⚠️ **The SENSOR email watch was DEAD IN PRODUCTION and was repaired on
  2026-08-16.** Every link Fluud mailed pointed at `/map/?confirm=…` or
  `/map/?watch=…`, `/map` is wrapped in `RequireSession`, and a subscriber with
  no Fluud account was redirected to sign-in before the component that reads the
  token ever mounted — so no address could be confirmed and no unsubscribe link
  worked. That defeated `api._AUTH_EXEMPT`'s own argument. **There is a fifth
  route, `/watch/`, with no session gate**, and the links point at it. See
  *Five routes* below.
- **The rat is gone, in every sense a reader could meet.** No graffiti rats, no
  character in the warning copy, no rodent data. `web/scripts/rat-graffiti.py`
  and the six `rat-graffiti-*.webp` are **deleted**; `agent._TEMPLATES` is plain
  at every level in both languages; `waterline/rodent_nta.py`, `scripts/rodent.py`
  and `neighborhood-back.tsx` are **deleted** with the three wire fields behind
  them. ⚠️ **The ALERT rat is the exception and it is untouched** —
  `rat-figure.tsx`, `rat.py`, `check_rat.py`, `rat-bake.py` and the eight
  `rat-{level}[-loop].webp` all stay, dormant, on the same terms as the rest of
  the unwired warning system. It is unmounted, so no reader meets it.
- **The landing page was deleted and CAME BACK, and what returned is a shell.**
  ⚠️ **`/` has been SIX things; since 2026-08-16 it is a LANDING PAGE again** —
  and it was rebuilt to a supplied design later the same day: a photographic
  hero, the instrument inventory, an illustrated sensor face, ⚠️ **the watch as
  a LOOPING VIDEO**, and a closing band. The full chrome
  (`SiteNav`, `PaintRule`, `SprayDefs`, `SiteFooter`) is restored. It was the
  landing page until 2026-08-14, then a stub, then a sign-in page, then stripped
  to the door, then a prose landing page.
  ⚠️ **The sign-in card moved to `/auth/sign-in/`**, which already existed and is
  generated. `web/src/components/landing/` is back as **four files**.

  ❌ ⚠️ **THE NOTIFICATIONS SECTION IS A VIDEO AND FOUR WORDS**, since
  2026-08-16 on the owner's instruction. Its label, body paragraph, three-step
  `<ol>` and illustrated `EmailCard` were all **deleted**, and what a reader
  meets is `notify-walkthrough.tsx` — two cuts of one 27s HyperFrames piece,
  1920×1080 above `sm` and 1080×1350 below, looping. **That section's words are
  pixels**: the text equivalent is one `sr-only` block in that component and it
  is the only copy left in the repo. It is the first video this site has ever
  served. See `web/scripts/motion/README.md` for what the compositions draw and
  the five rules that bind them, none of which any check script can see.

  ⚠️ **The video went into a FRAMED LEFT COLUMN later the same day, with a title
  rail on the right reading *Set your alerts* over an envelope glyph** — the
  owner's instruction, and the section's padding came back with it. **Four words
  returned, not the section.** The `sr-only` block's `<h2>` was **removed** in the
  same change: the visible title heads the section for everybody, and two `<h2>`s
  in one `<section>` name it twice to a screen reader. ⚠️ **The frame is on the
  `<video>` and the `<img>`, never on a wrapper** — on a wrapper it would still
  draw in the resting `none` branch, as an empty bordered box. ⚠️ **The split is
  `xl` and not `lg`**, which is arithmetic: at 1024 the column would give the
  wide cut ~500px, and 1920px of drawn interface at 340px is already recorded as
  a smear.

  ⚠️ **The deleted page rendered LIVE READINGS, this one renders ILLUSTRATED
  ones, and the difference is the whole of what makes it allowed.** Two cards on
  `/` show a depth — `180 mm` on the depth ramp, and a `WARNING` email at
  `57 mm` — **on the owner's instruction, 2026-08-16**, which reverses the Never
  bullet below. **Every figure is a fixed literal in `landing-sections.tsx` and
  the page still does not poll.**

  ❌ ⚠️ **The `EXAMPLE · not a live reading` label was DELETED later the same
  day, on the owner's instruction, and it was the only one of those conditions a
  reader could see.** Three still hold — literals, no live clock, one constant
  behind every offset on the ramp — and nothing on the page now says that
  `180 mm` is drawn rather than measured. Read that file's docblock before adding
  a third card.

  ⚠️ **Three things went with the deletion that were carrying rules**: two
  never-safe empty states (`citywide-card.tsx`, `block-search.tsx`), the one
  verbatim WATCH template this site ever showed a reader, and `.wl-swell`.
  **None of the three came back.** See the docblock in `web/src/app/page.tsx`
  and the accounting in `web/src/app/CLAUDE.md`.

  ✅ ⚠️ **ONE recorded debt is paid.** `/about` is reachable from `/` again.

  ⚠️ **FOUR MORE CHANGES on 2026-08-17, all on the owner's instruction**, and one
  of them adds a figure this repo has to keep true:

  - **The notifications band left the shared wash.** It takes
    `--wl-wash-vertical` — a blue gradient down the band, light at the top and
    dark at the foot. **It is the only band on `/` or `/about` that diverges**,
    so retuning the wash from one page no longer retunes both. Vertical is the
    one axis `--wl-wash` refuses; the exception is bought by two stops and no
    inflection. Argument at the declaration in `globals.css`.
  - ⚠️ **`Public data` → `+5 Sources`, and it is a THIRD figure on `/` that
    rots.** The first two (425, 968) rot against a feed and `probe` is their
    authority. This one rots against a **list** — `about-sections.tsx`'s
    seven-entry `SOURCES` minus the two that band draws cards for — so no
    re-measurement will ever catch it. **An eighth source moves it**, and
    nothing in `./scripts/check` can see the pair.
  - **`Two data feeds from the city` → `Data feeds from the city`**, and
    **`See the depth and the corner at once` → `…and the street at once`**. The
    title stopped counting because the eyebrow started: a title naming a number
    that the eyebrow above it then adds to is two counts of one inventory.
  - ⚠️ **The site description went from TWO sentences to ONE, on BOTH pages** —
    *"Fluud is a hyperlocal flood watch for New York City that lets you monitor
    and craft custom alerts based on the city's embedded water sensors."* The
    deleted sentence named the camera pairing, so **neither `/` nor `/about`
    describes the cameras any more.** What still states it: `/`'s *"See the
    depth and the street at once"* section, `/about`'s DOT camera count, and the
    map's pairs layer. It is one string on two pages and an edit to either is an
    edit to both.

  ❌ ⚠️ **The never-safe one was paid and then UNPAID on the same day.** The
  notifications section ended *"Fluud reports what the sensors see."* — the first
  unconditional statement of the rule since the deletion — and it was **removed
  on the owner's instruction, 2026-08-16**, hours after `/about` lost its own
  prose version. The two deleted empty states never came back, and ⚠️ **`/map`
  lost `SiteFooter` in the same change**. **So `/terms` §03 is the whole of it**,
  and `/terms` is reached from the footer and nowhere else.

- ⚠️ **`/about` was CUT to a supplied design on 2026-08-16, and it took four
  rules with it.** It was six numbered sections; it is a masthead, one inventory
  grid and a photo band. ⚠️ **The masthead was
  re-centred on the wordmark later the same day**, with *"A flood watch for your
  block"* as a tagline under it, ⚠️ **and the two inventory counts and the
  sources table were MERGED into that one grid** — counts stacked left, the seven
  sources as a `<dl>` on the right. **All seven survived and none may be dropped
  to make a column fit.** **The second-witness
  rule's only page-facing explanation, the coverage rule in prose, the
  never-safe rule in prose, and the MIT licence statement are all gone**, along
  with the sources table's `Access` column and the page's `/api/status` poll.
  ⚠️ **That makes `/`'s one line and `/terms` §03 the only prose statements of
  never-safe on the site**, and the only one a reader meets without choosing
  anything is on `/`. The section-by-section accounting is in
  `web/src/components/about/about-sections.tsx`.

**The live state machine is `watch.py`, over `sensor_episodes`, and the only
thing in this app that writes to a person is `mail.py`.**

## ⚠️ THE HISTORY WAS SQUASHED, and several files below say "in git history"

**On 2026-08-20, before this repo went public, 116 commits were replaced by one
initial commit.** Seven branches went with them. That was the owner's call,
taken over two alternatives — pushing the history as it stood, and rewriting
only the large blobs — and the cost is that **nothing in this repo predates the
initial commit.** `git log`, `git blame` and every seven-character hash quoted in
these files resolve to nothing here.

⚠️ **The pre-public history is ARCHIVED, not destroyed.** It is a git bundle
outside this working tree, at

```
/home/bitbrujo/Projects/waterline-prepublic-history.bundle
```

on the owner's machine only. **A clone does not have it, and no reader of this
repo can open it.** That is why the phrase in these files is *the archived
pre-public history* rather than *git history*: the thing still exists, it is one
person's local file, and a claim that a deleted component "can come back" is a
claim about that bundle rather than about anything a contributor can reach.

⚠️ **Every deletion recorded in these files is now recorded ONLY in these
files.** That is a load rather than a formality. The unwired warning system, the
graffiti generator, the vision layer, three decorative animations — the argument
for each is prose here and its code is in a bundle nobody else has. **Write the
next deletion down more carefully than the last one, because there is no longer
a second copy of the reason.**

## Where things are

```
CLAUDE.md                    ← you are here (the map, and the rules that span it)
README.md                    the story, architecture, data sources, quickstart
LIMITATIONS.md               what the instrument cannot see and will not do
MEASUREMENTS.md              every number that came from RUNNING it, dated.
                             Re-measured, never edited
schema.sql                   sole DDL authority. No DDL from Python. ⚠️ it is
                             `create … if not exists` and has NO `drop` — a
                             removed block means a fresh clone has no table and
                             a deployed database keeps its rows, unread
Dockerfile                   Node stage builds the UI, python:3.11-slim ships it
scripts/check                THE RUNNER. One command before a deploy — the seven
                             Python contracts, then `npm test` in web/
scripts/                     the check scripts      docs: scripts/CLAUDE.md
waterline/                   the package            docs: waterline/CLAUDE.md
web/                         the UI source          docs: web/CLAUDE.md
  src/app/                   the FIVE routes + `/auth/[pathname]` — ⚠️ `/` is
                             the LANDING page again, the SIGN-IN CARD lives
                             at `/auth/sign-in/`, and ⚠️ `/watch/` is the
                             UNGATED page every email link opens
                                                docs: web/src/app/CLAUDE.md
  src/components/            every component rule
                                             docs: web/src/components/CLAUDE.md
  src/lib/                   the pure layer         docs: web/src/lib/CLAUDE.md
  src/lib/hooks/             the React edge    docs: web/src/lib/hooks/CLAUDE.md
  tests/                     356 vitest tests       docs: web/tests/CLAUDE.md
  scripts/                   the generators         docs: web/scripts/CLAUDE.md
  src/lib/geo/               the basemap. nyc.ts and cso.ts are GENERATED.
                             viewport.ts is the map's FRAME — pan and zoom,
                             pure, tested
  public/rat/                four stills + four loops of the DORMANT alert rat,
                             824KB. COMMITTED build input, mounted by NOTHING.
                             ⚠️ the six graffiti rats that also lived here are
                             DELETED, and so — since 2026-08-20 — are THREE
                             ORPHANS this entry never mentioned: a 20MB
                             `flood_rat_ascii…20s_loop.mp4` and a 4.4MB
                             `sewer-rat.obj`/`.mtl` pair, added in one-off
                             commits during the 3D era, referenced by NOTHING
                             and SERVED BY THE LIVE SITE. They were 24.6 of the
                             directory's 25MB. ⚠️ **Nothing in `./scripts/check`
                             counts what `public/` carries** — an unreferenced
                             file here ships forever and no runner can see it
  public/motion/             ⚠️ the site's ONLY VIDEO — two cuts of one 27s
                             piece plus their posters, 2.7MB, COMMITTED and
                             SHIPPED. It IS the landing page's notifications
                             section; that section has no text left. Source is
                             web/scripts/motion/, rendered BY HAND
  public/photoz/             ⚠️ seven photographs, 2200px, 2.0MB, COMMITTED and
                             SHIPPED — the landing sections and the sign-in
                             split. DECORATION: empty `alt`, `aria-hidden`, no
                             `title`, and never a mark, scale or overlay
  photoz-src/                ⚠️ their camera originals — seven 5504×3072 JPEGs,
                             79MB. GITIGNORED and DOCKERIGNORED, with the
                             `cwebp` recipe at the `.gitignore` entry
  .design-sync/              ⚠️ the DESIGN-SYSTEM export surface, 2026-08-15 —
                             a hand-written entry barrel, two shims, fixtures,
                             56 authored previews and 16 woff2. It feeds
                             claude.ai/design and NOTHING this app serves.
                             ⚠️ **UNTRACKED as of 2026-08-20** — it was
                             committed until this repo went public. It is on the
                             owner's disk and gitignored, so a CLONE DOES NOT
                             HAVE IT and every rule written about it below
                             describes a tree a reader here cannot open.
                             Dockerignored, and — being a dot-directory —
                             invisible to BOTH `tsc` and Tailwind's scanner.
                             A build without it is clean, verified
                                                   docs: web/CLAUDE.md
assets/black-rat/            GITIGNORED source art. Licensed to be rendered,
                             not redistributed
```

Knowledge is **distributed**: this file is the map and holds what spans the
repo. Ten scoped files hold the detail, nine of them beside the code they bind.
**Put detail in the nearest scoped file.** A rule that binds one directory does
not belong here.

## The safety properties

These are the rules the code is built around. **They are enforced by
`./scripts/check` and by the code itself, and the check scripts are the
record** — if you want to know whether one still holds, break it and run them.

| rule | what it means | where |
|---|---|---|
| **never safe** | Only ever what the instruments observe. No surface says anywhere is clear, and nothing at rest is green | `agent.py` copy · `levels.ts` · `depth-band.ts` · `station-list.tsx`'s empty states. ⚠️ **TWO enforcement points were deleted with the landing page** — `citywide-card.tsx` and `block-search.tsx` — and they were the only ones a reader met without choosing anything. ⚠️ **`/about` stopped saying it on 2026-08-16** when that page was cut to its design, and ⚠️ **`/`'s one line — *"Fluud reports what the sensors see."* — was DELETED the same day on the owner's instruction.** **`/terms` §03 is the ONLY prose statement of this rule left on the site**, and it is reached from `SiteFooter` and nowhere else. **No surface states it to a reader who has chosen nothing.** `station-list.tsx`'s empty states still refuse to convert an empty list into a claim, and they are behind the session gate |
| **monotonic** | Within an episode the level never walks back down | `watch.transition` · `escalation.transition` |
| **slow stand-down** | Closing needs `clear_readings_to_stand_down` consecutive clear reads, not one | the same two |
| **second witness** | A depth outside the plausibility band needs corroboration that is not the same rangefinder: FloodNet's own **flood/rain** alert, our own flag, or the harbor above flood stage **under a tidal sensor**. ⚠️ **Since 2026-08-15 the NWS fetch is SHARED with a display surface and the derivation is not** — `feeds.is_witness_alert` is the whole of the credibility side, pinned event by event by `check_watch.py` | `watch.is_credible` · `escalation._depth_is_credible` — asserted EQUAL by `check_watch.py` |
| **templated copy** | Warning copy is written in `agent.py` and never generated. The LLM is confined to Q&A | `agent.py` · `mail.py` fills slots and composes nothing |
| **reviewed languages** | An unreviewed language is refused, never machine-translated | `agent.PENDING_REVIEW` · `api.speak` → 400 |
| **alert permitted** | A deployment FloodNet has disabled may display but never mail | `floodnet.alert_permitted`, the single authority · `watch.is_permitted` · `api._permitted_sensor_ids` (a 400 naming the reason, never a silent drop) |
| **no frames** | Readings only. No images, faces, plates or tracks in the database | `schema.sql` — and nothing fetches a frame at all now |
| **NTA scale** | Exposure aggregates to neighbourhood, never to a building | policy — LIMITATIONS §3. ⚠️ **Its worked example is deleted**: `scripts/rodent.py`'s `$select` never *requested* the address columns, and that generator went with the rodent feature. `scripts/nta.py` replaces it and asks for two columns of pure geography |
| **frozen poller** | A stopped loop must be visible. Stale readings rendered as current are a false negative wearing a timestamp | `reading-age` + `freshness-line` (primary) · `/api/healthz`'s `writes` → `lib/messages.ts` → `message-strip` (backstop). ⚠️ **`writes` comes out of `poll_ticks` in POSTGRES since 2026-08-15 and is correct in BOTH deployment shapes**, which `last_tick_at` never was — that field is a module global, null forever on an API-only instance, which is why the row was gated on `poll_in_service` and therefore said nothing at all on a bare `uvicorn` run. It is kept as the fallback for a database with no `poll_ticks` yet. ⚠️ **It also carries a claim the old field structurally could not make**: `last_store_at` separates a loop that is ticking and collecting from a loop that is ticking and storing nothing, and both keep `tick_at` moving. ⚠️ **What it CANNOT say is WHICH loop, and that bit on 2026-08-16.** One upserted row per `mode` is what lets liveness cross a process split; two loops in the *same* mode overwrite each other, so a laptop polling the production database makes this block describe an unknown process. It misled a post-deploy check that day. **`polling` is the field that stays honest** — `_poller.is_alive()` is process-local to whichever process answers. See the outbox-race section under *Deploying* ⚠️ **The strip moved to the FOOT of the rail on 2026-08-14, so the backstop is now below the fold** — the masthead's `NoticeBadge` is the always-visible half, and it carries the worst fault's own title so dismissing a row moves the claim rather than deleting it |
| **narrowing variation** | ⚠️ **This was the shrinking-CHARACTER rule and the character is gone.** The copy is plain at every level in both languages. What the 6 / 4 / 3 variant counts encode now is how much VARIATION is permitted: `watch` fires most often and reaches somebody watching several corners, `emergency` is three separate reviews of one identical instruction block | `agent._TEMPLATES`, asserted as an **ordering** by `check_escalation.py` — which is why the counts could go 16/11/3 → 6/4/3 without touching the assert |
| **not an official** | It never claims to speak for the city, for FloodNet, or for any agency. It is an instrument and says so | `agent.conversation_context` |
| **stale leaves the scale** | An old or faulted reading comes OFF the scale rather than being downgraded. An hour-old reading in a confident colour is the worst thing this UI can render | `depth-band-pill.tsx` · `city-map.tsx` marker colours · `sensor-row.tsx`'s `FAULT` chip |
| **unobserved is not clear** | Empty space on the map is unobserved. Absence of coverage is not absence of flooding | LIMITATIONS §2 · the map's footer counts what its marks withhold · the empty states refuse to convert an empty list into a statement about conditions. ⚠️ **Zoom SHARPENS this** — a frame is empty partly because it is small, so `city-map`'s `FrameNote` says so while the frame is anything but full. ⚠️ **The predicate is `isFullView`, not `w < 1`** — the map fills its track since 2026-08-15, so the resting `w` is greater than 1 on a wide frame and the old comparison paints this note on an untouched page. ⚠️ **LAYER SWITCHES are the SECOND sharpener, since 2026-08-16**, and they are sharper than zoom: five of them let a reader produce an empty drawing of New York City, which reads as *nothing is happening anywhere*. **`HiddenNote` is the answer** — it counts and names every instrument class that is off, in the footer, on every load, and all three off gets a stronger paragraph refusing the reading outright. **What makes those switches legal is that line, not the toggles.** ⚠️ **The CAMERA FILTER is the THIRD sharpener, since 2026-08-16, and it is the sharpest of the three.** A layer switch's off-state is **total**, so counting what is off accounts for everything. A borough-plus-tier filter produces **partial** absence — 130 drawn, 838 not — and a reader looking at 130 pins has no cue whatever that 838 are missing. **`lib/camera-filter.ts`'s `cameraFilterNote` is the answer**, it is a pure function so `web/tests/camera-filter.test.ts` sweeps the whole generated state set, and the property it asserts is the licence: **every non-empty state either prints its denominator or says the registry has not arrived.** `city-map.tsx` |

⚠️ **Two of the seven photographs in `web/public/photoz/` have a WHITE PRINT
BORDER baked into the file** — `night_01_elevated_tracks` (13.8% a side) and
`night_14_rooftop_tanks` (12.2%) — so any full-bleed band mounting one needs a
`scale` of at least 1.38 / 1.32 or it renders white bars down both edges. The
other five measure zero and want none. **That is why `PhotoCta`'s `scale` prop
exists, and it is not a taste knob.** Measured 2026-08-16, after lowering the
default to `scale-100` put white bars on `/about`; the table is at the prop.

Thresholds are **borrowed, not invented**: 10 mm is FloodNet's own flood-event
definition, 150 mm is NYC curb height. If you change one, say where the new
number comes from.

⚠️ **The map's rail has a WEATHER tab as of 2026-08-15, and it is the first
surface on this site that renders somebody else's warnings.** The `gauges` tab
is labelled `tide + wx`, its five gauge cards moved from a two-up pager onto a
grid, and an NWS alert block sits above them in a 112px box whose height is a
constant. The tab's **value** is still `"gauges"` — the third label/value split
after `watch`→`monitor`. What the block may say is `web/src/lib/nws.ts`, pure and
swept by `web/tests/nws.test.ts`; **the empty state is the dangerous one**, and
only one of its four states is permitted to say nothing is active.

⚠️ **Not every number in this app is borrowed, and the wire says which is
which since 2026-08-15.** `/api/status` carries two blocks: `thresholds`, the
two borrowed figures, off `settings`; and `ingest` — `IMPLAUSIBLE_MIN_MM`,
`IMPLAUSIBLE_MM` and `MAX_AGE` — read straight off `floodnet.py`, where each
derivation is written at the constant. **They are two models rather than five
fields on purpose.** A page saying *"FloodNet's 10 mm threshold"* is attributing
correctly; one saying *"FloodNet's 600 mm ceiling"* would be crediting somebody
else with a number this project chose, and a merged block is how both sentences
end up with one author. It also keeps the plausibility band out of `config.py`,
where an environment variable could widen a safety bound at 9pm.

## Never

- Never add DDL to Python. `schema.sql` is the only place schema lives, and it
  has no `drop` — see its header.
- Never store frames, faces, plates, tracks, or per-building counts.
- Never present output as an official warning.
- Never let an LLM write the warning copy.
- Never trust a bare depth threshold. See the second-witness rule and
  LIMITATIONS §11.
- ⚠️ **Never widen `feeds.is_witness_alert` to serve a display need.** The
  tide-and-weather tab shows **every** active NWS product for the five boroughs
  — tornado, severe thunderstorm, heat, air quality — and it gets them from
  `feeds.fetch_nws_alerts_all()`, which needs nothing from that predicate. If
  those events reached `nws_active`, a Heat Advisory would become corroboration
  for a rangefinder reading four metres and a Tornado Warning would raise every
  subscribed sensor in the city. **One fetch, two derivations, and nothing joins
  them again.** `check_watch.py` pins the split event by event and greps
  `watch.py` / `escalation.py` for the display-only names.
- ⚠️ **Never narrow the NWS request from `area=NY`.** The request parameter
  belongs to the credibility path; a flood warning in Westchester corroborating
  an implausible depth under a tidal sensor is the behaviour, not a bug.
  **The NYC scoping happens AFTER the fetch, for the panel only**, and what
  falls outside is counted (`NwsStatus.elsewhere`), never dropped. ⚠️ It also
  does not mean *New York State*: `area=NY` returns alerts that merely touch
  NY, so the copy says *the statewide feed*.
- Never let a camera produce a number. It had an ordinal class and a depth
  estimate in centimetres — a segmentation mask against a *drawn* reference
  line, which read 22.5 cm for a 4.78% water patch on a real frame. Beside a
  calibrated millimetre the two were indistinguishable to everything
  downstream. `check_escalation.py` asserts `Observation` carries no field one
  could arrive through.
- Never reduce a window of depths to a mean, a median or an average. The
  timeframe control renders a **peak** and only a peak — a mean over a day
  across a two-hour flood renders that flood as a small number, in the largest
  type on the page. `waterline/peaks.py` and `web/src/lib/depth-window.ts` both
  carry the argument, and `peakLabel` cannot produce a label without the word.
- Never render a windowed depth without the word `peak` beside it — including
  on the rows showing an em-dash, because an unlabelled dash reads as
  *currently nothing* rather than as an answer about a window.
- Never take that peak over readings the poller judged implausible. All four
  queries in `db.py` filter the stored plausibility column and none re-derives
  the band. And never collapse *no readings* with *every reading faulted*: both
  render an em-dash and they mean opposite things.
- Never render a depth without its plausibility. The digits stay — they are the
  evidence the instrument is broken — and the *claim* changes. ⚠️ **And since
  2026-08-15 the sensor face names the BOUND that was crossed and the height
  the instrument is mounted at**, because *"too deep"* with no figure and no
  reason is a verdict rather than an argument. `ground_height_mm` is a length in
  millimetres and **is not a depth** — it may never take a band, a pill, a bar
  or a marker colour, and it renders in metres, away from the reading, so
  `2.4 m` beside `1452 mm` cannot read as two points on one scale.
- Never let a silent instrument render as a bare em-dash with nothing said. The
  detail face names the window the depth query is bounded by, so *nobody looked*
  and *this instrument is broken* stop looking identical. ⚠️ **And it refuses to
  guess which.** ~29 deployments have broken real-time clocks, publish rows
  stamped decades ahead, and arrive exactly like a sensor that stopped;
  `floodnet.skewed_deployments` can separate them, is diagnostic-only, and
  **nothing on the alerting path may call it**. Telling those two apart on a
  page is a stored column and an hourly upstream request, and it is not built —
  do not word the copy as though it were.
- Never mount `ReadingAge` in a long list. It subscribes to `useNow(1000)`, so
  425 rows would be 425 leaf re-renders every second for data that moves once a
  minute. Pass the list's own poll tick down instead.
- Never let a row `limit` bound a multi-deployment FloodNet depth query. It is
  silently lossy in proportion to how many sensors you ask about, and a
  truncated sensor is indistinguishable from a quiet one. See
  `floodnet.DEPTHS_COMPLETE_PER_DEPLOYMENT`.
- Never let a marker layer keep default `pointer-events`. Every layer is
  `absolute inset-0`, so it is a full-size hit-testable box and the topmost one
  swallows every click beneath it. `MARKER_LAYER` / `MARKER_HIT` in `city-map`.
  ⚠️ **The zoom control cluster is the same trap wearing a different shape** —
  it is `absolute right-2 bottom-2`, a SMALL box, and an `inset-0` wrapper there
  would swallow the whole drawing from above the crosshair's `z-40` layer.
- ⚠️ **Never scale a marker, and never scale a layer.** The map pans and zooms
  as of 2026-08-14; `toContainer` moves a marker and nothing sizes one. The
  unreachable-marker table is measured **at full view** against 11px / 15px /
  7px boxes, and it is a full-view property — re-running it zoomed in gives a
  much better number about a state most readers are never in. ⚠️ **Full view got
  BIGGER on 2026-08-15** when the drawing started filling its track, and marker
  sizes did not move with it, so those figures are now **pessimistic rather than
  wrong** — and they may not be quoted as current until they are re-run. Three things
  counter-scale on purpose: the coast's stroke, the CSO radius, and the violet
  lattice, which stays outside every transform because a grid that moves with
  the map looks like it is measuring the map.
- ⚠️ **Never word the frame and the mapped area as one thing.** *"The mapped
  area"* is `NYC_BOUNDS` and belongs to the three off-map counters, which should
  read zero forever. *"This frame"* is the viewport. A reader told instruments
  are outside the mapped area after a pan would think they had left the city.
  `lib/geo/viewport.ts`'s `isVisible` and `project.ts`'s `inViewport` are the
  two predicates behind the two words, and they must not be collapsed.
- Never compare one gauge's level to another's. NOAA CO-OPS is referenced to
  MLLW and each USGS site to its own local datum; they are not one scale.
  Nothing ranks, averages or shares an axis.
- Never present the CSO outfalls as discharge activity. There is no public feed
  for that and there cannot be one — LIMITATIONS §10.
- ❌ **Never bring the rodent data back.** DOHMH rat-inspection rates by NTA
  were context on the back of a camera card, always dated, always with their
  denominator, on no scale at all. The whole feature is deleted —
  `waterline/rodent_nta.py`, `scripts/rodent.py`, `neighborhood-back.tsx`, the
  `rodent_activity_rate` / `rodent_inspections` / `rodent_as_of` wire fields and
  the panel flip that reached them. ⚠️ **The NTA display NAME survived and is
  not the same thing**: it is geography, `instrument-query.ts` searches on it,
  and `scripts/nta.py` generates it from the DCP layer alone. **If any
  non-water number ever returns to this UI, it returns with its denominator, its
  date and its collection bias on the face that renders it, and it is never
  tinted by value.**
- Never register a FastAPI route **below** the `/` UI mount at the bottom of
  `api.py`. Starlette matches in registration order; anything under it is
  unreachable and answers with the 404 page instead.
- Never hand-tune one shadcn slot in `globals.css` to fix a component. Those
  values are a supplied master; fix the component, or replace the master and
  re-derive what is defined against it.
- ⚠️ **Never let a palette override a safety colour.** `globals.css` carries
  three complete dark palettes. ⚠️ **ESTUARY SHIPS as of 2026-08-15** —
  `layout.tsx` carries `data-palette="estuary"` on `<html>`, and Bitumen (the
  `:root` block) and `[data-palette="sodium"]` are the available two. A palette
  may move the neutrals, the poster paint and the basemap. It may never move the
  depth bands, staleness, provenance or the instrument slates, which are
  declared once in `:root` and verified byte-identical across all three. **A
  palette that could retint the depth bands would be a theme with an opinion
  about how deep the water is.** The palette blocks also win on SOURCE ORDER
  alone — equal specificity with `:root` — so moving them above the master
  silently disables them.
- ⚠️ **Never declare a token as `var()` of a palette slot inside `:root`
  alone.** A `var()` in a custom property substitutes at computed-value time on
  the element that declares it, and the *result* inherits — so `--wl-panel:
  var(--muted)` written at `:root` freezes to the base palette and a
  `[data-palette]` on a **descendant** never moves it. Thirteen tokens were
  built that way and all thirteen froze. They live in a `:root, [data-palette]`
  block that must stay **below** every palette block; above them it resolves
  against the base slots and does nothing at all. **It is invisible in this
  app** — the attribute sits on `<html>`, which *is* `:root` — **and total in
  the design system**, where an agent wraps a `<section data-palette="…">`.
  Found that way, in `Estuary-Dashboard-2A`, 2026-08-15.
- ⚠️ **Never re-collapse `globals.css`'s three-line Tailwind import back into
  `@import "tailwindcss"`.** That one line puts the utilities in
  `@layer utilities`, and `@neondatabase/auth`'s stylesheet ships an
  **unlayered** `* { border-color: var(--neon-border); outline-color:
  var(--neon-ring) }`. Unlayered CSS beats every layered rule regardless of
  specificity, so a zero-specificity `*` from a third-party package silently
  outranked **every border-colour utility in the app** — `ModeBadge`'s
  provenance green, `SensorRow`'s selection edge, the `--wl-stale` /
  `--wl-dead` panel borders. All emitted, none applying. Split, the utilities
  are unlayered too and win at (0,1,0), wherever the auth import sits.
  ⚠️ **`layer(base)` on that import is the obvious fix and it fails the
  build** — the stylesheet contains an `@source`, and Tailwind refuses a nested
  one. The check is a browser: the LIVE badge draws a green outline, or the
  import has been collapsed.
- Never put the theme's `--accent` next to a reading, and more generally: **a
  colour beside a reading may not vary with that reading unless it is on a
  scale that says so.** `--wl-select` varies with *selection*, which is a fact
  about the reader; `--wl-graph` is constant across every level an instrument
  can report, so it cannot encode one. A depth, a band pill, a gauge level and
  a map marker may take neither.
- Never pick a warning variant with `random.choice`, and never seed the pick on
  anything that varies within an episode. `agent.variant_index` hashes
  `(seed, place, level)`; a draw would render per subscriber, so five people
  watching one episode would get five different sentences about one body of
  water. ⚠️ **`_hash32` is now the only implementation of this in the repo** —
  `ratFor` in `neighborhood-back.tsx` was its TypeScript twin and went with the
  rodent card, so nothing compares them and no assertion may claim they match.
- Never let `agent.template()` return a level key. It holds a tuple, and
  `mail.py` would `.format` it into an `AttributeError` on the one transport
  that pushes to a person.
- Never give EMERGENCY variants different instructions. Only the opening
  sentence may vary; everything from `{depth}` onward is byte-identical across
  all three, in both languages, and asserted. Somebody below street level may
  have read it before, and recognition is speed.
- Never add a variant in one language only. `check_escalation.py` asserts the
  counts match, but **nothing can assert that variant *i* in `en` is the
  translation of variant *i* in `es`** — that is a review property.
- Never compose an outbound message at the call site. `mail.py` picks a key
  from `agent._TEMPLATES` and fills slots; a warning's body is
  `agent.warning_text_for_depth` **verbatim**. An f-string containing prose in
  that file is the templated-copy rule arriving by post.
- Never store more about a subscriber than an address, a language, two tokens,
  the sensors they asked for and their notification settings. No IP, no
  user-agent, no open or click tracking, no `last_seen_at`, no soft-delete
  flag. Never add a surface that lists who is watching a corner.
  LIMITATIONS §16 argues why the tables are defensible at all, and every one of
  these breaks that argument.
- Never let a notification preference add a message, and never let one silence
  an EMERGENCY. Quiet hours SUPPRESS and never DELAY — a delayed warning
  presents a past emergency as a current one. `check_notify.py` asserts both
  over the whole grid.
- Never couple a typed address to the watch flow. It may not pre-select
  instruments, pre-fill the panel, or ride along with a subscription. An
  address that chose somebody's watched corners makes `(email, sensor_id)` a
  **derived** record of where they live, which is the shape LIMITATIONS §3
  refuses.
- Never send a typed address to any endpoint here, and never store one.
  `lib/geosearch.ts` is a separate client from `lib/api.ts` and carries no
  cache of any kind. ⚠️ **A server-side geocoder "so there is no third party"
  is the worst version of this**, not the safest: it trades the third-party
  origin for the address in our own request logs, next to the table of who
  watches which corner.
- Never turn nearest-N into a radius. A radius that returns nothing reads as
  *nothing near me, so I am fine*.
- Never put `origin` in `queryIsActive`, and never colour a distance. The first
  would drop 404 of 425 map markers to 25% opacity the moment somebody types an
  address. The second has no available direction: reddening with distance is a
  severity ramp built out of coverage, and greening as it shrinks is
  reassurance beside a depth. ⚠️ **The second bullet binds any monotone ramp
  over distance and not only hue** — dash-vs-solid, thick-vs-thin and
  large-vs-small are the same ramp in another channel, which is why the camera
  layer's three pairing tiers reach no marker treatment of any kind.
- ⚠️ **Never let a filter narrow a marker layer without stating its
  denominator.** A layer *switch* is binary and its off-state is total, so
  counting what is off accounts for everything; a filter produces **partial**
  absence, and 130 pins on a drawing of New York City look exactly like 130 pins
  on a drawing of New York City. The count of what is withheld is the whole
  licence — `lib/camera-filter.ts` is where that copy lives so a test can sweep
  it, and the property asserted is that **every non-empty state prints its
  denominator or says the list has not arrived.** A filter whose copy is in JSX
  is a filter nothing can hold.
- Never let `outbox_once` drop the level from its key. `(subscriber, kind,
  episode)` alone means one message per episode for its whole life, so a reader
  told "water on the street" can never be told it went above the curb.
- Never let a watch surface render an age. `WatchSensorRef` carries `silent` as
  a **boolean** and the server reduces the timestamp before it reaches the
  wire, precisely so no amount of work in `watch-panel.tsx` can put "47 minutes
  ago" beside an instrument name.
- Never read coverage from a module global. `db.registry_coverage` counts it
  out of Postgres so every process agrees. ⚠️ **Since 2026-08-15 the same holds
  for the poller's own liveness** — `db.poll_health` over `poll_ticks`, for
  exactly the reason the `LAST_COVERAGE` tombstone in `poll.py` gives. A global
  in that module is correct in one deployment shape, and the other shape reads
  it as a permanent outage.
- ⚠️ **Never let a mode-filtered read be the only thing that can see a mode.**
  Four writers stamp `settings.mode` into a row and eleven readers filter on it,
  so changing `MODE` — or typing it as `live` — empties every surface while the
  table stays full, and not one of those eleven queries can say so.
  `db.sensor_reading_modes` is the one query that does not filter, it exists for
  that, and **adding the filter to it makes it a query that always reports
  itself healthy**. ⚠️ **And never "fix" this by normalising `mode` in
  `config.py`** — upper-casing at load would orphan every row a `MODE=live`
  deployment has already written. The argument is at the setting.
- Never let the confirm face claim it withdrew a request. `stop waiting` clears
  the panel and drops the typed address; the pending row and the confirm link
  survive it, because that token reaches the inbox and never this browser.
- Never render a watch response's `note` in the subscriber's stored language.
  `subscribe` and `resend` must answer identically whether or not the address
  is known, and `watch_note` reads differently in en and es. ⚠️ **`note` is
  `req.lang` on every branch and that is unchanged.** What did change on
  2026-08-16 is the identical-answer claim around it: `subscribe` has a second
  answer, `confirmed`, and it is reachable **only for a caller who proved the
  address** — an `email_verified` claim on a verified session, equal to the
  request after `mail.normalise_address` on both sides. Everybody else still
  gets `pending` byte for byte, and **within the confirmed path the shape does
  not vary by whether the row already existed**, or token-presence would rebuild
  the "is this address subscribed" oracle somewhere else. See
  `models.WatchSubscribeResponse` for the argument and the two costs.
- Never let `/api/watch/resend` send an address a message its own state did not
  already earn. Two branches, partitioned in SQL: `confirmed_at is not null`
  sends the manage link, `confirmed_at is null` re-sends that row's own
  confirmation, capped at `api.CONFIRM_RESENDS_MAX` for the row's lifetime. **A
  single lookup answering for both states is the refactor to refuse** — it is
  one edit from handing a bearer credential to an address that never proved it
  owned the mailbox.
- Never let `auth.verify` fail open. An auth check that admits a request it
  could not verify is not an auth check, and the temptation arrives precisely
  when Neon is down and the map is dark. **The lever is `REQUIRE_AUTH=false`,
  never a fallback inside the verifier.**
- Never decode a JWT with `verify_signature=False` to "just read the email". An
  unverified token is a string the client wrote. `auth.py` resolves a signing
  key first and every failure on that path is a 401.
- Never gate `/api/*` with a per-route dependency instead of `api._session_gate`.
  The middleware is a **default-closed** list of exemptions, so a route added
  without thinking about auth is closed; decorating each route leaves a new one
  open by omission and nothing anywhere says so. ⚠️ **Since 2026-08-16 the
  middleware KEEPS what it verified** — `request.state.session` — and
  `api._verified_session` reads it back. **That is not this rule being broken and
  a `Request` parameter in a handler is not the shape it refuses**: admission is
  still decided in one place that cannot be forgotten, and this is a read of a
  decision already taken. `Depends(auth.require_session)` on a route is still
  forbidden. ⚠️ **`_verified_session` returns `None` when `REQUIRE_AUTH` is off,
  and everything downstream must treat that as *no shortcut*** — with the gate
  off the API is open, so a `session.email` nobody had to prove may unlock
  nothing.
- ⚠️ **Never write `confirmed_at` from anything but a proven mailbox.** There are
  exactly two writers and both are named: `db.confirm_subscriber`, which takes
  the confirm token that went to the inbox, and `db.create_subscriber`'s
  `confirmed=` flag, whose one legal caller is `api.watch_subscribe`'s
  verified-self branch — where the address equals an `email_verified` claim on a
  JWT this server checked against Neon's JWKS. `grep -rn 'confirmed=True'
  waterline/` is the whole audit and it must return one line. **A
  `confirm_subscriber_by_email` is the function to refuse**: a primitive that
  stamps a confirmation from a bare address is one careless caller from being the
  whole of double opt-in. ⚠️ **THREE watch routes are
  exempt on purpose** — `confirm`, `subscription` and `unsubscribe`. They are
  reached from a link in an email by somebody who may have no Google account,
  they already carry a single-purpose bearer token, and an unsubscribe link that
  demands a sign-in is indefensible.
- ⚠️ **Never gate the PAGE an exempt route is reached from.** Exempting
  `confirm` and `unsubscribe` while the only surface calling them sat behind
  `RequireSession` was an exemption in name only, and it made every mailed link
  dead in production for the whole life of the sign-in gate. **An exemption is a
  claim about a reader's whole path, not about one request.**
- ⚠️ **Never assume `_session_gate` can see a method.** It matches
  `request.url.path.rstrip("/")` and nothing else, so an entry in `_AUTH_EXEMPT`
  opens **every** verb on that path, now and whenever one is added. That is why
  `/api/watch/subscription`'s PUT is argued for explicitly at the frozenset
  rather than inherited from its GET.
- Never add a `NEXT_PUBLIC_*` variable without remembering it is baked in at
  **build** time. `output: "export"` means there is no runtime read and no
  error naming the cause — a container built without one is permanently wrong.
  The Docker UI stage needs a matching `ARG`.
- Never let a signed-out reader mount a page that polls. `RequireSession` wraps
  `/map` rather than being called inside it, because hooks run on mount and an
  early return does not stop them: four endpoints answering 401 render through
  `lib/messages.ts` as *cannot reach the service*, telling a reader who is
  merely not signed in that the instrument is broken.
- Never treat `RequireSession` as a security boundary. The export is static
  files served to anybody; every component is in the bundle. **`waterline/auth.py`
  is the lock and that component is a curtain.** Nothing secret may live in the
  bundle on its strength.
- Never move the `@neondatabase/auth/ui/tailwind` import below the theme in
  `globals.css`. The auth UI declares its own `:root` values for slots this app
  owns, at equal specificity, so the later declaration wins — imported below,
  a third-party stylesheet silently becomes the master **for every page**.
  Never import `ui/css` as well; one method, not both.
- ⚠️ **Never put a LIVE reading, depth, age or severity colour on `/`,
  `/about`, `/terms` or any `/auth` view.** A number there arrives with none of
  the chrome — timestamp, plausibility, freshness — that makes a number on
  `/map` legible, and none of those routes may poll: with the API gated the
  request is a guaranteed 401 for a signed-out reader, which
  `lib/messages.ts` renders as *cannot reach the service*.

  ⚠️ **This said "a reading" until 2026-08-16 and now says "a LIVE reading",
  because `/` renders two ILLUSTRATED depths.** On the owner's instruction, and
  the narrowing was bounded rather than general — **four things were to hold,
  all four, and a card that dropped one was the old rule being broken rather
  than this one being applied**:

  1. ✅ **Every figure is a fixed literal in the component file.** Not one comes
     off the wire, and adding a fetch to that page re-breaks the rule.
  2. ❌ ⚠️ **An `EXAMPLE · not a live reading` label sat ABOVE each card, and it
     was DELETED on 2026-08-16 on the owner's instruction.** It was the whole of
     what separated an illustration from a claim about a real corner tonight,
     and it was the only one of these four a reader could see. **The other three
     are invisible to everybody but a person reading this repo**, so a reader now
     meets `180 mm` and a `WARNING` chip with nothing qualifying either.
  3. ✅ **No live clock.** `ReadingAge` subscribes to `useNow(1000)` and may not
     be mounted there; the age is a fixed string.
  4. ✅ **Every offset on a scale is derived from one constant.** The supplied
     design put the fill and the curb tick on a 250 mm track and the *10 mm*
     tick on a 150 mm one, so the tick labelled 10 sat where 16.75 falls. **A
     mislabelled threshold is not decoration.**

  ⚠️ **Read that as the standing cost rather than as licence.** Three conditions
  holding and one gone is not the amendment being satisfied; it is a page
  carrying an unlabelled illustration of a depth. **A third card added now
  compounds it.**

  ⚠️ **The temptation this rule now has to survive is lifting those cards onto
  `/api/status`** — the shapes are right there and the hook is one line. That is
  exactly what the deleted `citywide-card.tsx` was. **If a number on this site
  has to be current, it belongs on `/map`.** `/about` and `/terms` are unchanged
  and render no figure of any kind.
- Never put `/about` or `/terms` behind the session. A reader cannot agree to
  terms they must sign in to read, and §04 is where the sign-in record is
  disclosed.
- Never edit or commit `waterline/web/`. It is build output. Source is
  `web/src`.
- Never commit `assets/black-rat/`, and never make the rat bake part of the
  build. The model is licensed to be rendered, not redistributed, and the
  Docker UI stage has neither Blender nor egress.
- Never give the alert rat's images real `alt` text — stills or loops — if that
  layer is ever re-wired. They are `aria-hidden` decoration; describing them
  invents copy the server did not template. ⚠️ **The rule generalises past the
  rat and that is the part to keep**: `FluudMark` and the `PaintRule` bands are
  under it today, and the landing page's three stencilled SVG feature marks were
  until that page was deleted. Decoration takes no `alt`, no `<title>` and no
  `aria-label`, whatever it is a picture of.
- ⚠️ **Never drive a water animation from anything, if one ever returns.** Not
  a depth, not a level, not `settled`, not `mode`, not the tide gauges, not the
  time of day. `.wl-swell` was a fixed-period CSS loop on the landing page and
  is **deleted with it**; the moment such a thing takes an input it is a reading
  with no age, no plausibility and no scale beside it, on a site that renders
  real FloodNet depths. Three rules travelled with it and all three survive it,
  because they bind the shape rather than the file: it may never rest at its
  **low** position under `prefers-reduced-motion` (that frame is the only frame
  that reader ever sees, and water that has gone down is the claim this site
  never makes); no tick, number, graduation or fixed horizontal line may sit
  where the travel crosses it; and the surface may never be a straight edge — a
  line the surface crosses is a threshold, and a flat waterline that rises and
  falls is a gauge. ⚠️ **Nothing in `./scripts/check` can reach CSS**, so this
  bullet, the comment at the point of deletion in `globals.css`, and the review
  that reads them are the entire enforcement.
- Never let the site's plates and marks take a colour off any scale. They cycle
  `--wl-select` → `--wl-cyan` → `--wl-violet`, which is poster paint.
- Never drop the alert rat's stills while its loops exist. They are what a
  `prefers-reduced-motion` reader sees, and what keeps a level change from
  showing an empty box mid-fetch. Both sets are dormant; both stay complete.
- Never stack those loops the way the stills are stacked. Four animated WebPs all
  decode continuously even at `opacity: 0` — four rats' worth of battery to
  show one, on a phone, in a flood.

## There were two rats. One is deleted and one is dormant

⚠️ **No rat is mounted anywhere. A reader of this site meets none.**

| | the **alert** rat | the **graffiti** rats |
|---|---|---|
| Status | ⚠️ **DORMANT** — `rat-figure.tsx` unmounted with the warning | ❌ **DELETED**, 2026-08-14 |
| Where it was | the foot of the map's right-hand rail | the back of the selected-instrument panel, and three fixed spots on the landing page |
| What | 4 stills + 4 loops, baked from a rigged 3D model. Still committed | 6 images, 418KB, generated in ComfyUI. Removed from `public/rat/` |
| Driven by | alert level, in pose, lighting and tempo | a hash of the camera id, or fixed per section. Never a level |
| Made by | `web/scripts/rat-bake.py` (Blender), kept | `web/scripts/rat-graffiti.py` (ComfyUI), **deleted** |
| Says | how bad it is | nothing at all |

**Why the asymmetry.** The graffiti rats were mounted and decorative, so
removing the mascot removed them outright. The alert rat is one part of the
unwired on-page warning system, and that system is kept whole on purpose so
putting the warning back is a re-wire rather than a rebuild — pulling one
component out of it would make that promise false. ⚠️ **If the warning is ever
re-wired, the rat is a decision to take THEN**, not an obligation inherited from
these files still existing.

⚠️ **`ratFor`'s lesson outlived the rat and is worth keeping.** Which camera got
which graffiti image was a hash, never `Math.random()`: that component re-rendered
on every status poll, so a draw re-rolled each time and the image changed while
somebody was looking at it. The avalanche step at the end of the FNV-1a was
load-bearing too — bare, `% 6` clumped measurably over 27 UUIDs. **The same
argument is the reason `agent.variant_index` is a hash**, and that function is
now the only implementation of it left in the repo.

Both sets are `aria-hidden` decoration with empty `alt`, and neither may be
given real alt text.

⚠️ **If any rat ever comes back, the two sets stay apart.** Do not wire a
decorative rat to severity, and do not recolour the alert rat into graffiti.
They looked nothing alike on purpose, so a reader could never mistake a
decoration about rats for a warning about water.

⚠️ **"Animated" here never means "animated at runtime."** `c3bd80a` deleted a
Live2D rat that pulled three CDN scripts into a PIXI WebGL canvas, and the
reasons that was wrong are unchanged: a third-party origin, a WebGL context, a
StrictMode hazard, and a rat that disappears when the venue's wifi does. Motion
came back by baking more frames. **If a future change wants the rat to move in
response to something, bake the response; do not put a renderer on the page.**

CSS keyframes on non-rat decoration remain the standing precedent and stay
allowed. ⚠️ **Only `.wl-urgent` is left** — `.wl-pulse` and `.wl-swell` were
deleted with the landing page, so the precedent currently has one live example
and it sits on a component nothing mounts. What is forbidden is unchanged: a
**renderer**, a **third-party origin**, a **canvas**, and **animating a rat at
runtime**.

## THREE third-party origins, and they fail in very different ways

⚠️ **It was two until 2026-08-14. The third one gates the whole app.**

| | the **font kit** | the **geocoder** | ⚠️ the **auth service** |
|---|---|---|---|
| Who | Adobe Fonts (Typekit) | NYC Planning Labs GeoSearch (Pelias) | **Neon Auth** (Better Auth), `0.5.0-beta` |
| Where | `web/src/app/layout.tsx`, a `<link>` | `web/src/lib/geosearch.ts`, a `fetch` | `web/src/lib/auth-client.ts` **and** `waterline/auth.py` — both sides |
| Sends them | nothing but the request | **an address a reader typed** | **an identity, and it holds the person record** |
| Blocked, it costs | headline **styling** | the address search **outright** | ⚠️ **THE MAP.** Everything. `auth.verify` fails closed |
| Fallback | `--font-display`'s system stack | none — it says so, in words | none. `REQUIRE_AUTH=false` is the only lever |

⚠️ **Read the third column against the first two before adding anything to
it.** The ranking used to be the point of this table: a dead font host costs a
reader something they cannot name, a dead geocoder costs them a feature and
says so. **A dead auth service costs them the instrument**, on a site whose
basemap is ~1,400 committed coordinates specifically so the drawing survives
somebody else's outage. That trade was made on the owner's instruction, it is
recorded in `web/src/app/page.tsx`'s docblock, and `settings.require_auth` is
the one place it comes undone.

⚠️ **`auth.verify` fails CLOSED and must keep failing closed.** An auth check
that admits requests it could not verify is not an auth check. The temptation
when Neon is down is a fallback that serves readings anyway; that is the
refactor to refuse. **The lever is the setting, not a bypass in the verifier.**

⚠️ **Two variables, one value, two mechanisms, nothing checking they agree.**
`NEON_AUTH_URL` is ordinary runtime env read by `config.py`. The browser's copy
is `NEXT_PUBLIC_NEON_AUTH_URL`, **baked into the bundle at build time** by the
Docker UI stage — so a container built without it can never sign anybody in, no
matter what the runtime environment says, and a restart changes nothing. When
they disagree the site is one nobody can enter, and the only thing that catches
it is `curl $URL/api/healthz` reading `auth_required`.

A dead font host costs a reader nothing they can name. A dead geocoder costs
them a feature, which is why every failure branch in `geosearch.ts` and both
`AddressNote` / `LookupNote` say *this is about the lookup, not about the
water*. That is also why the geocoder deliberately does **not** go through
`lib/api.ts`: its `ApiError` is the type `lib/messages.ts` reads to say *cannot
reach the service*, so routing it there would put our own outage banner on
somebody else's outage.

The address is geocoded **in the browser**, reaches `api.py` in no form at all,
is never stored including in a cache, is not coupled to the watch flow, only
ever **reorders**, and returns nearest N and never a radius. LIMITATIONS §16
carries the argument.

Nothing that carries a warning, a reading or an age is set in `--font-display`.
Adobe's licence forbids re-hosting, so the escape hatch this repo uses
everywhere else — commit the asset, serve it ourselves — is genuinely not
available for that one.

The map is **drawn, not fetched** — ~1,400 committed coordinates in
`web/src/lib/geo/nyc.ts` and twenty lines of Mercator, no map library and no
tile CDN. It still draws when the venue's wifi does not.

⚠️ **It FILLS ITS FRAME as of 2026-08-15.** The `MAP_MAX_W` cap and the
container's CSS `aspect-ratio` are both deleted, so the drawing takes the whole
track. **The aspect agreement that lock enforced did not go away — it moved into
`lib/geo/viewport.ts`**, where a measured container shape drives the viewBox and
the marker percentages through one function, so the two cannot disagree. At full
view the frame now *contains* the city rather than equalling it: a wide frame
shows background either side and **nothing is ever cropped**, because
`whole city` promises a whole city.

⚠️ **EVERY MARKER CLASS SWITCHES OFF as of 2026-08-16**, from one cluster of
five pills on the drawing — cameras, sensors, pairs, gauges, sewer outfalls. The
two toggles that lived in the map's chrome bar moved into it, and **`pairs` is a
new layer**: a dashed line from each camera to the sensor whose depth labels its
view. ⚠️ **A pairing gates nothing and every link is the same line** — no depth,
staleness or plausibility may reach it. ⚠️ **The switches are only legal because
the footer counts and names what is off**; see the unobserved-is-not-clear row.

⚠️ **THE CAMERA LAYER ALSO FILTERS, on two axes, since 2026-08-16, and it is
how the map reaches more than 27 cameras at all.** The city has **~970** DOT
cameras and the `cameras` table has held every one since the first `bootstrap`;
what the UI could see was `observations`, which `poll.tick` writes only for the
27 ids in `WATCH_CAMERAS`. `/api/cameras` reads the registry instead, with the
paired sensor's own newest `sensor_readings` row for a depth — **no new polling
and no change to `WATCH_CAMERAS`.**

- **Two axes, on the camera layer only.** Sensors, gauges, outfalls and pairs
  stay citywide.
- **Three tiers, derived from the `pairs.distance_m` already stored** by
  `cameras.pair_tier`: `paired` (≤ `GOLD_PAIR_M`), `near` (≤ `MAX_PAIR_M`),
  `unpaired` (no row). ⚠️ **The reader's words are `paired` / `near` /
  `not paired`, and the words *gold*, *golden* and *silver* may NEVER reach
  one** — they are the internal constant names, and both halves are asserted
  (`check_ingest.py` on the wire values, `camera-filter.test.ts` on the copy).
- ⚠️ **`distance_m` never crosses the wire.** The tier crosses as a classified
  string, which is `alert_permitted`'s shape. `check_models.py` asserts the
  field's absence, and that is the assertion that catches a revert.
- ⚠️ **The tier gets NO marker treatment.** *Never colour a distance* binds any
  monotone ramp over distance, not only hue — dash, weight, size and opacity are
  the same ramp in another channel, and every one of them is already spoken for
  on a camera pin. The tier lives in the control, in the footer sentence, in the
  header chip's denominator and in the pin's `title`.
- ⚠️ **The default is `paired` and the registry is fetched LAZILY** — no request
  until a reader touches the filter, so at rest the page is pixel-identical to
  the one before this existed. **The honest cost:** at rest the `paired` chip
  describes `WATCH_CAMERAS` rather than the `pairs` table. Those two sets are
  byte-identical today and that is a coincidence of the data, not a property.
- ⚠️ **`borough` needs a re-bootstrap and there is no other path.** `poll.tick`
  never touches the `cameras` table, so until `python -m waterline.poll
  bootstrap` runs against a database every `cameras.borough` is null — and the
  UI has a state that says exactly that rather than drawing an empty city.

⚠️ **It pans and zooms as of 2026-08-14, and it is still drawn.** The frame is
twenty more lines of arithmetic in `web/src/lib/geo/viewport.ts` over the same
committed coordinates — **no tile host and no fourth third-party origin**, which
is the constraint that made a map library wrong in the first place and has not
moved. It was a fixed-extent drawing of a whole city at ~82 m/px until then,
which is why 34% of the sensor markers had no reachable point at 1440×900.
**Zoom is the first real fix for that and it does not close it** — the `‹ ›`
pager is still what reaches every sensor, and the two are one feature.

⚠️ **PRESSING `+` MOVED THE `+` for three days, and the lesson generalises past
the map.** Two lines in the map's footer toggled on `zoomed` in opposite
directions. **A footer line is IN FLOW**, and the drawing is the `flex-1`
between a fixed `h-11` header and that footer — so one more line came straight
out of the drawing's height, and the zoom cluster is `absolute right-2 bottom-2`
**of the drawing**. The reader pressed a button and the button walked away from
the cursor. ⚠️ **The cluster was innocent and a fix applied there would have
been a fix in the wrong file.** `FrameLine` holds both lines in one slot whose
height is reserved by a **ghost render of the same components**, never by a
measured literal — `/map` is behind the session gate, so a literal here would be
arithmetic, and the retired legend reserve is the record of what happens to
those. **This is the same shape as that legend regression**: a change with
nothing to do with layout spent a height somebody else was standing on.

## Five routes plus twelve auth views, and the instrument is behind a sign-in

`/` is the **landing page**, `/about` the **inventory and the credit**, `/terms`
the terms of service, `/map` the instrument. `/auth/<view>/` is twelve more,
generated, and **that is where the sign-in card lives**.

⚠️ **`/about` was "the long explanation" until 2026-08-16 and no longer
explains.** It was cut to a supplied design — a masthead, one inventory grid
(the two counts stacked left, the seven sources right), a photo band — and the
four rules it was carrying in
prose went with it. See the accounting near the top of this file, and the
section-by-section version in `web/src/components/about/about-sections.tsx`.

⚠️ **`/watch/` is the fifth and it landed on 2026-08-16.** It is the page every
Fluud email opens — `?confirm=` to confirm an address, `?watch=` to manage or
unsubscribe — and it is **deliberately NOT behind `RequireSession`**. It was
`/map/?confirm=` and `/map/?watch=` until then, which meant every link ever
mailed sent a subscriber with no Fluud account to a sign-in page. `/map` keeps
its gate and forwards the old shape, because manage tokens do not expire and sit
in every message already delivered.

⚠️ **THE WIZARD DOES NOT RUN AT ALL for a reader who already has a watch, as of
2026-08-17.** On the owner's instruction. `/api/watch/mine` answers *does the
signed-in reader's own proven address already have a confirmed subscription*, and
when it does the monitor panel mounts `ManageFace` — the same surface `/watch/`
opens — instead of walking them through pick → alerts → email → submit.
⚠️ **That flow was not merely redundant; it did nothing**:
`api.watch_subscribe` deliberately does not call `set_subscriptions` on the
existing-row branch, so the receipt at the end changed no row. **`watch a second
address` is the escape**, and it is what keeps the wizard reachable for somebody
subscribing a different mailbox. ⚠️ **The new route takes NO address** — it reads
`session.email` and nothing else, which is what keeps the *"is this address on
Fluud"* oracle out of the one place it would be easiest to build. It is **not**
in `_AUTH_EXEMPT`, and adding it there would silently break it rather than loosen
it, because `_verified_session` returns `None` on an exempt path.

⚠️ **And the CONFIRMED receipt closes the flow by itself**, same instruction. The
fourth step reads `✓ confirmed`, a countdown states what is about to happen, and
`closeFlow` re-asks `/api/watch/mine` so the reader lands on their own watch
rather than back on step one. **`mail_delivers === false` never closes it** — on
that branch the on-screen link is the only copy of a non-expiring bearer
credential, so `keep this open` and the mail gate are both load-bearing rather
than polish.

⚠️ **DOUBLE OPT-IN IS SKIPPED for a reader watching their own verified address,
as of 2026-08-16.** `/api/watch/subscribe` was never exempt, so with the gate on
every subscriber was already a verified Neon Auth session — and the wizard then
asked them to retype an address the app held and mailed them a link to prove they
owned it. When `api._verified_session` returns a session whose `email_verified`
claim equals the request, the row is created **already confirmed**, the response
carries the manage token, and `mail.render("resend", …)` goes out instead of the
confirmation. **Everybody else is unchanged, byte for byte**, and
`REQUIRE_AUTH=false` makes the branch unreachable. Two costs are recorded rather
than left to be found — the manage token gained a second exit from the server,
and an account-email change can hand it over. See `waterline/CLAUDE.md`'s
abuse-controls section, `models.WatchSubscribeResponse` and LIMITATIONS §16.
⚠️ **`/terms` §04 moved in the same commit**: it said *"Nothing is sent until you
confirm the address from a link"*, which is now false for one route in.

⚠️ **`/api/watch/subscription` joined `_AUTH_EXEMPT` with it**, on the same
argument the confirm and unsubscribe entries already carried: the manage token
is an opaque single-purpose bearer credential mailed to a proven mailbox.
**`/api/watch/resend` and `/api/watch/subscribe` did NOT** — `resend` is the one
route a stranger can cause mail to be sent from. The cost is stated: a reader
whose token is gone has no recovery door on `/watch/`, because both doors live
in the wizard on `/map`. ⚠️ **`/api/watch/mine` did not either, and there the
exemption would BREAK the route rather than loosen it**: `api._verified_session`
returns `None` on an exempt path by design, so an entry in that frozenset turns
it into a route that silently always answers `watching: false`.

⚠️ **Signed out, `/watch/` cannot ADD an instrument** — that needs
`/api/sensors`, which stays gated. Dropping one, editing settings and stopping
altogether all work, because `WatchSensorRef` carries `name` and `borough`, so
the watched rows name themselves at zero request cost. The page says so in
words: a withheld control with a silent gap reads as something failing to load.

⚠️ **Only `/map` polls `/api/status`** — the other four render no LIVE reading,
because with the API gated that request is a guaranteed 401 on pages read by
someone with no session, surfacing as *cannot reach the service* to a reader who
is simply not signed in. They pass `mode={null}` and the badge says `UNKNOWN`.
⚠️ **`/about` was the last of the four still polling and stopped on
2026-08-16** — it fetched the two borrowed thresholds and the badge, and the
thresholds went with the section that quoted them. It is a **server component**
again.

⚠️ **A signed-in reader STOPS on `/` now, and that is a reversal.** The
`SignedIn` branch was `OpenTheMap`, which `router.replace`d to `/map`. That was
right for a door and is **wrong for a page with four sections on it** — a reader
with a session could never read them. The branch is a button, in
`landing-cta.tsx`. ⚠️ **If a redirect ever goes back on this route, those
sections become unreachable to everybody who is signed in.** What survives from
the redirect is the reason all three `LandingCta` branches paint something: an
empty space is not an answer, and a blank frame is indistinguishable from a dead
auth service, which is what `AuthLoading` beside it disambiguates.

⚠️ **`/` has been SIX different things and is a landing page again.** A full
landing page until 2026-08-14 — hero, live citywide card, address search, three
method cards, three feature cards, a verbatim WATCH template and a graffiti rat
on an animated barrel. Cut to a stub the same day, then a sign-in page carrying
the stub's chrome, then **stripped to the door itself**, then **rebuilt as a
prose landing page on 2026-08-16**, then **rebuilt again to a supplied design
the same day** — a photographic hero, the inventory, an illustrated sensor face,
the watch in three steps with an illustrated email, and a closing band, ⚠️ **and
then that watch section was replaced ENTIRELY BY A LOOPING VIDEO, hours later on
the owner's instruction.** **The
route was kept through all six** because `api.py` mounts the export with
`StaticFiles(html=True)` and a missing root `index.html` answers with the 404
page. ⚠️ **The deletion accounting is still the record of what the OLD page was
carrying, and neither rebuild restored it** — see `web/src/app/CLAUDE.md`.

⚠️ **The pages with no `SiteFooter` are the TWELVE AUTH VIEWS and `/map`**, as of
2026-08-16. On the auth views, `Terms` / `Privacy` under the card are what pay
for it: `/terms` is reached from that footer and nowhere else, it is the page
disclosing what signing in stores about a reader, and **that is the surface where
the agreeing happens.** **`Privacy` points at `/terms/#privacy` by NAME, never by
numeral** — `/about` renumbered its sections once already, so `#05` would have
silently moved. **Removing those two links is removing the footer's last job
there.** On `/map` the masthead wordmark is the route out, and ⚠️ **that page now
carries the prototype disclaimer nowhere.**

⚠️ **`/watch/` mounts the full chrome and the footer there is not optional.** It
is the one page a stranger lands on straight from a flood email, holding a
credential, about to change or delete their own record — and `SiteFooter` is
this site's only route to `/terms`, whose §04 describes that record. It also
carries the prototype disclaimer, which is exactly what `/map` lost.

⚠️ **There is a SIGN-OUT as of 2026-08-16 and it is the first one ever.**
`/auth/sign-out/` was generated from the moment Neon Auth landed and **nothing in
the UI linked it** — a reader could sign in and had no way to stop being signed
in short of clearing site data. `SessionMenu` in the masthead is the door. It
takes no severity colour and not `--wl-select` either, it renders nothing until
it can say something true, and **it is not a security boundary**:
`waterline/auth.py` is the lock.

⚠️ **`/about` and `/terms` stay readable SIGNED OUT, and that is a rule.** A
reader cannot agree to terms they have to sign in to read, and `/terms` §04 is
the page that discloses what signing in stores about them. Those two plus the
never-safe and coverage rules in `/about` are the only prose statements of
several safety properties; putting them behind a Google account would leave
them unreachable to the reader they are for.

⚠️ **Adding an auth view means adding a string to `web/src/lib/auth-views.ts`.**
`generateStaticParams` enumerates that list at build time and `output: "export"`
resolves nothing on demand, so a view missing from it has no directory and
404s — **in production only**, because `next dev` resolves dynamic params on
request. The one that matters most is `callback`: Google redirects there after
consent, and without it a reader completes a Google sign-in and lands on a 404
holding a valid session. That file is deliberately **directive-free** — a
`"use client"` module's exports arrive in a server component as opaque
references, and the first draft failed the build with
`AUTH_VIEW_PATHS.map is not a function`.

⚠️ **`trailingSlash: true` in `web/next.config.ts` is what makes every route
below `/` reachable in production, and it is not a URL-style preference.**
`api.py` mounts the export with `StaticFiles(html=True)`, which falls back to
`<path>/index.html` only when `<path>` is a directory. Without the flag Next
exports `out/map.html`, a request for `/map` finds no file called `map`, and
the mount answers with the 404 page — while `next dev` serves it perfectly.
**Adding a route means adding a directory to the export.**

## The product is **Fluud**; the identifiers are still `waterline`

The split is deliberate and looks exactly like drift.

**Fluud** is everything a reader sees: both wordmarks, the `<title>` on all
five routes, the footer description, `agent._TEMPLATES`' disclaimer and every
mail subject in en and es, the FastAPI title, the "cannot reach the service"
banner, the 503 body, and all prose in the docs. ⚠️ **`SMTP_FROM`'s local part
is one of these** — `fluud@`, on a domain the deployment owns, because it is the
first thing a subscriber reads in an inbox.

⚠️ **It was `Sewer Rat` until 2026-08-14 and `MEASUREMENTS.md` still says so in
places.** That is correct rather than stale: entries there are dated readings
under a *re-measure, never edit* rule, so an entry recording what a page's
`<title>` said on 2026-08-06 keeps saying it. **Read the date before quoting
one.**

**`waterline` stays** in the Python package and every import, the **local
directory**, `WATERLINE_API` / `WATERLINE_DEV_ORIGINS`, `package.json`'s
`waterline-web`, the `--wl-*` token prefix, the `waterline-poll` thread name,
and the outbound `User-Agent: waterline/0.1` that FloodNet, NOAA and USGS see.
Changing that last one changes what upstream operators see us as.

⚠️ **THE GITHUB REPO NAME CROSSED TO THE FLUUD SIDE on 2026-08-20**, when this
went public. It was `BitBrujo/waterline` and it is `BitBrujo/fluud`. **The
directory on disk is still `waterline` and that is not drift** — a repo name is
the first thing a visitor reads, which puts it with the wordmark and the
`<title>`, and a directory name is read by nobody but its owner. GitHub redirects
the old path, so a stale clone URL still works and will keep working until the
name is claimed again.

⚠️ **`BitBrujo/fluud-deck` is a DIFFERENT PROJECT and it held this name first.**
It is the Fluud design deliverable — an 18-slide deck — and it was renamed out of
the way in the same pass. **It shares no code with this repo**, on the same terms
as the standalone rule below. Do not merge them and do not import across them.

## The database holds a person record, and `schema.sql` says so

`subscribers` holds an email address somebody typed in, two opaque tokens, a
language, two timestamps and the notification settings. `subscriptions` joins
it to the FloodNet deployments they asked about. That is the whole of it: no
name, no IP, no user-agent, no referrer, no session, no open or click tracking,
no `last_seen_at`, no soft-delete tombstone. Unsubscribing is a `delete` and
the cascade takes the interests and every queued message with it.

⚠️ **`(email, sensor_id)` is the same SHAPE as the targeting list
LIMITATIONS §3 refuses**, and §16 argues why it is defensible: self-selected,
at instrument granularity rather than building granularity, and hard-deleted.
**All three must hold.** §16 lists the plausible "improvements" that each break
one.

### ⚠️ There is a SECOND person record now, and it is bigger than the first

Neon Auth landed on 2026-08-14 and it brought its own schema, `neon_auth`, in
the same database. **This repo does not define it, does not control it, and
cannot trim it.** `schema.sql` is still the sole DDL authority for `public`; it
is no longer the only authority in the database.

Read off the live database rather than off Neon's docs:

| table | holds |
|---|---|
| `neon_auth.user` | `name`, `email`, `emailVerified`, **`image`**, role, ban fields |
| `neon_auth.account` | `providerId`, `accountId`, **`accessToken` / `refreshToken` / `idToken`**, and ⚠️ **`password`** — a hash, written since `credentials` went on 2026-08-14 |
| `neon_auth.session` | `token`, `expiresAt`, ⚠️ **`ipAddress`, `userAgent`** |
| `neon_auth.jwks` | the signing keys `waterline/auth.py` verifies against |

⚠️ **`ipAddress` and `userAgent` directly contradict the sentence above them.**
"No IP, no user-agent" is still true of `subscribers` and is now false of the
database as a whole. The rule was not quietly narrowed — `/terms` §04 names both
fields explicitly, because a terms page that let that slide would be the exact
kind of overstatement that section is held to.

⚠️ **There are TWO sign-in shapes since 2026-08-14, and `password` is the one
that arrived last.** `auth-provider.tsx` shipped with `credentials={false}` —
Google only, no password store — and that prop was turned **on** on the owner's
instruction, so email sign-up sits beside Google. Better Auth writes the hash to
`neon_auth.account.password`, verified present on the live database.

⚠️ **That prop and `/terms` §04 move TOGETHER, in both directions.** §04 named
only the Google fields and was rewritten in the same commit, because a record
description that covers one of two sign-in paths is wrong for every reader who
took the other. **A passkey, a magic link or a second provider each add a row to
this table and each owe §04 an edit.**

**Two consequences worth keeping straight:**

- **The minimal-person-record rule still binds `subscribers`.** It is our table,
  it is the one this project designed, and nothing about Neon's schema licenses
  adding a column to it. Do not "harmonise" the two.
- ⚠️ **Nothing in `./scripts/check` can see a managed schema.** If Neon changes
  those tables, `/terms` §04 is wrong until somebody re-reads them. That is a
  review property, like variant *i* in `en` matching variant *i* in `es`.

**What this feature cannot promise:** silence is ambiguous. A subscriber who
hears nothing cannot tell "no water" from "the poller froze", "the mail
bounced" or "your sensor stopped reporting". A positive heartbeat is the honest
fix and **is not built**. The stand-down email is gone too and nothing replaced
it, so a subscriber's last word about a corner is the worst one.

## The components have a FOURTH reader, and it is a machine

⚠️ **Since 2026-08-15 this UI is also a design system.** `web/.design-sync/`
exports 56 components to a claude.ai/design project, where an LLM composes them
into new screens. Three readers were people — a reader of `/map`, a subscriber
reading mail, somebody reading this repo. The fourth writes UI out of these
parts, hundreds of times, for people who never see this file.

⚠️ **THAT TREE IS NOT IN THIS REPO as of 2026-08-20.** It was untracked before
this went public — it is the owner's design tooling, it is gitignored and
dockerignored, and nothing this app serves comes out of it. **The whole of this
section therefore describes a directory a reader of a clone cannot open.** It is
kept rather than deleted for one reason: `conventions.md` is the only place
several of this app's safety rules reach that agent, so **the fourth reader is
still a reader, and a rule that binds the components still has to reach it.**
The mechanism is off in this copy; the obligation is not.

**That is why `web/.design-sync/conventions.md` exists and why it is prose about
safety rather than about style.** It is prepended to the generated README and
inlined into that agent's system prompt, and it is the ONLY place several of
this app's rules reach it: never say anywhere is clear, a colour beside a
reading may not vary with that reading, stale leaves the scale, absence and
fault and zero are three different things, a windowed depth always carries the
word `peak`, thresholds are borrowed. **A rule not written there does not bind
what that agent builds.**

⚠️ **Nothing in `./scripts/check` can see any of this**, the same gap the CSS
rules and the `en`/`es` variant-parity rule live in. The enforcement is the
conventions file, the per-component `.d.ts` comments, and a person reading them.

### ⚠️ The traffic runs BOTH WAYS, and the first return trip carried a live bug

`Estuary-Dashboard-2A`, a screen that agent built, came back on 2026-08-15 with
a comment block naming six problems in the token layer. **Three of them were
real and two were defects in the shipped app, not in the export**: thirteen
tokens derived through `var()` at `:root` froze in any scoped palette, and an
unlayered `*` rule from `@neondatabase/auth` was silently outranking every
border-colour utility in the app — `ModeBadge`'s provenance green and
`SensorRow`'s selection edge among them, emitted and not applying.

⚠️ **`tsc`, `vitest` and `next build` were all green through the whole of it,
and correctly so.** None of them asks whether a rule that exists also *wins*.
**The fourth reader is the only one that looks at rendered pixels**, and it found
in one screen what three runners and a review had walked past.

Two things follow, and the second is the one that costs something:

- **A delta that comes back is evidence, not a request.** That block's item 6
  was a wrong diagnosis of item 5, and its item 4 named two frozen tokens when
  thirteen were frozen. **Verify each claim against the repo before applying
  it** — the value is in what it noticed, not in what it concluded.
- ⚠️ **What that agent builds with is `.design-sync/.cache/compiled.css`, which
  is OUR build of `globals.css`.** So a cascade bug in this app is a cascade bug
  in every screen it produces, and there is no second stylesheet to catch it.
  `conventions.md` and the previews are how a rule reaches it; **the compiled
  CSS is how a defect does.**

⚠️ **The design system ships the brand faces and the app still may not.**
`.design-sync/fonts/` carries Archivo, Archivo Black and IBM Plex Mono as **SIL
Open Font License** copies from Google Fonts. That is a **separate grant** from
the Adobe kit `layout.tsx` links, and it does not soften the rule above it: the
Typekit kit is licensed to be linked and never re-hosted, and the display face
it serves is not in this set. Do not read the shipped woff2 as permission to
commit the kit's fonts into `web/public/fonts/`.

Four things are deliberately OUT of the export — the auth components (they need
the live Neon service), the `/about` and `/terms` prose (this site's own words,
not reusable parts), and the dormant alert system. See `web/CLAUDE.md`.

## This repo is standalone

Fluud does not import, read, or depend on any other repo on the owner's machine,
and nothing may be added here that does. It was written beside a private
second-brain project and shares no code with it.

## Commands

Building the UI needs **Node 20+**. Only for building — nothing runs Node in
production.

```bash
cd web && npm ci                      # once, and after any package.json change
cd web && npm run prod:local          # build + stage into waterline/web/
cd web && npm run dev                 # :3000, proxying /api to :8080

# ⚠️ THE SIGN-IN URL IS BAKED IN AT BUILD TIME. `output: "export"` means it is
# NOT read at runtime — a bundle built without it can never sign anybody in,
# and restarting with the variable set changes nothing.
cd web && NEXT_PUBLIC_NEON_AUTH_URL=https://…/auth npm run prod:local
docker build --build-arg NEXT_PUBLIC_NEON_AUTH_URL=https://…/auth .

# ⚠️ THE ONE COMMAND. Eight Python contracts, then the 356 vitest tests.
# `set -e` is deliberately off: it collects every failure and exits 1.
./scripts/check

# ⚠️ It does NOT typecheck the web. A wire mismatch passes the runner and
# fails `next build`.
cd web && npm run typecheck && npm run build

python -m waterline.poll bootstrap    # schema + deployments + cameras + pairing
python -m waterline.poll probe        # what's reachable right now
python -m waterline.poll validate     # ...and whether the numbers hold together
python -m waterline.poll once         # one verbose pass
python -m waterline.poll run          # the loop, in the foreground

# ⚠️ POLL_IN_SERVICE DEFAULTS TO FALSE. Without it the API serves every route
# and collects NOTHING — 425 sensor rows with a null depth, indefinitely, on a
# service reporting healthy. Either set it, or run the loop above beside it.
POLL_IN_SERVICE=true uvicorn waterline.api:app --reload --port 8080

# Regenerate the committed build inputs. BY HAND, never from the build — the
# Docker UI stage has no network, which is why they are committed.
cd web && python3 scripts/basemap.py > src/lib/geo/nyc.ts
cd web && python3 scripts/cso.py > src/lib/geo/cso.ts
python3 scripts/nta.py > waterline/nta.py
# ...and the DORMANT alert rat, which additionally needs Blender.
# See web/scripts/CLAUDE.md. ⚠️ `scripts/rodent.py` and the ComfyUI graffiti
# generator were here and are DELETED.

# The DESIGN SYSTEM export. ⚠️ THE WHOLE TREE IS UNTRACKED since 2026-08-20, so
# these two lines do nothing in a clone. Re-sync with the /design-sync skill,
# which reads web/.design-sync/NOTES.md first. See web/CLAUDE.md.
```

`waterline/web/` is gitignored build output, so a fresh clone has no UI until
you run `prod:local`. Until then `/` answers 503 with the command to run, and
the API works normally.

⚠️ **`probe` is the only thing in this repo that can catch a wrong
`NEON_AUTH_URL`.** `./scripts/check` cannot reach the network, and the
browser-side failure is a redirect loop between `/` and `/auth/sign-in/` that
reads as a front-end bug. The `auth` line fetches the key set and says what came
back — or says the API is open, when `REQUIRE_AUTH` is off.

`probe` is the pre-demo check: live sensor count, how many are above threshold,
newest timestamp, and every implausible reading it rejected. `validate` asks
the different question — whether what the feeds said holds up, including
whether our parse agrees with FloodNet's own `flood_detected` flag.

## Deploying

⚠️ **There is still no deploy script, and RAILWAY IS NOW EXERCISED.** This ran on
Google Cloud Run and no longer does. As of **2026-08-16** it is deployed on
Railway — project and service both `fluud`, one container from the `Dockerfile`,
against the same Neon database. The `Dockerfile` is portable and needs no
arguments. `README.md` has the five steps.

⚠️ **`railway up` uploads the WORKING TREE, not `HEAD`.** Uncommitted and
untracked files ship. `.dockerignore` is the only filter, and it is not
`.gitignore` — a file ignored by git but not by Docker goes into the image. **Check
`git status` before deploying**, and read that as *what am I about to ship*
rather than as *what have I not committed*.

⚠️ **`NEXT_PUBLIC_NEON_AUTH_URL` has to be a service VARIABLE on Railway**, not
just a local build arg. The Dockerfile declares the matching `ARG`, and Railway
passes service variables into the build — so both halves of the one-value/two-
mechanism pair are set from the same place. **Setting only `NEON_AUTH_URL` gives
a site nobody can enter**, with no error naming the cause.

**What the first deploy verified**, all of it from outside the container:
`/api/healthz` reporting `ok`, `polling: true` and a `writes` block whose
`last_store_at` moved with `tick_at` across two ticks — the loop ticking *and*
storing, which the old `last_tick_at` alone could never have said. `/api/sensors`
and `/api/status` answering **401** signed out with `REQUIRE_AUTH=true`, both
`healthz` paths **200**, and `watch/confirm` / `watch/unsubscribe` reaching their
routes rather than the gate. The baked auth URL was confirmed by finding the Neon
endpoint string **inside the served JS chunk** — which is the only way to check
it, and the reason `probe`'s `auth` line exists for the other half.

Two things about the shape survive any host:

- ⚠️ **It used to have to be ONE long-lived process, and since 2026-08-20 it is
  TWO services.** Production runs the API with `POLL_IN_SERVICE=false` and a
  separate Railway **cron service** on `*/15` running
  `python -m waterline.poll window`. The reason is cost and it is measurable:
  Neon bills for the compute being awake, a 60-second loop means autosuspend can
  never fire, and the database was awake **86.8% of wall-clock time**
  (`active_time` 394,556s of ~454,600s) at ~305 compute-hours a month. A run that
  exits when the city is quiet lets it sleep; `poll._storm` escalates back to a
  60-second tick whenever any of the three borrowed witnesses says otherwise, so
  the saving comes out of quiet weather alone.
  ⚠️ **What still needs one long-lived process is the API container**, for two
  reasons that did not move: `api._bucket_limited`'s in-process rate buckets and
  `rat.py`'s event buffer. Both live in the always-on web service, so Railway's
  `sleepApplication` stays **off** there. A host that suspends CPU between
  requests would still stop an in-service loop with no error at all — which is
  now a development concern rather than a production one.
  ⚠️ **The cron service needs the FULL environment, and two variables are traps.**
  `MODE` must be exactly `LIVE`: it is written into rows verbatim and compared
  exactly by eleven readers, so `live` on one service and `LIVE` on the other is
  two disjoint datasets — a poller filling the table while every surface reads
  empty. And `WATCH_CAMERAS` must be populated, because `tick()` returns *before*
  `_sensor_snapshot` when it is blank, which stops the city-wide sensor write
  too.
  ⚠️ **`poll.LAST_TICK_AT` was the third and came off this list on
  2026-08-15.** Liveness survives the split now: the loop writes `poll_ticks`
  and `/api/healthz` reads it back, so whichever process runs the loop and
  whichever process serves the request can be different ones. The global is
  kept as the fallback for a database that has not been re-bootstrapped.
  ⚠️ **It survives a SPLIT and not a DUPLICATE.** One upserted row per `mode` is
  the whole mechanism, so two loops in the same mode overwrite each other and
  the block stops naming a process. `polling` is the field that stays honest.
  See the outbox-race section below.
- ⚠️ **`bootstrap` has to be run once against a new database.** DDL is applied
  only by `db.init()`, from `poll.bootstrap()` and `poll.probe()`, and **never
  at API startup** — deliberately, because a schema migration on the path that
  serves warnings is a schema migration that can take the service down. A
  deploy without it leaves every `/api/watch/*` route 500ing on a missing
  relation while the rest of the app is perfectly healthy.

⚠️ **A health check alone cannot tell you the NEW build is serving.**
`polling: true` with a fresh `writes.tick_at` is equally true of the container
you are replacing, so a post-deploy wait built on it returns instantly and reads
as success. **Name something only the new build has** — after 2026-08-16 that is
`/watch/` answering 200, which was 404 for ~20s while the old container was still
up and `mail_delivers` still read `false`.

⚠️ **`curl $URL/api/healthz` is the post-deploy check.** Some hosts reserve the
bare `/healthz` at their edge and answer it themselves; the route is registered
at both paths and the UI polls the `/api/` one. A route can be reachable in
every local shape and unreachable in production, and **nothing in
`./scripts/check` can see it** — the post-deploy `curl` is the only thing that
catches that class of thing.

⚠️ **EVERY LOOP POINTED AT THE DATABASE COMPETES FOR THE OUTBOX, and a loop with
no transport DESTROYS what it wins.** `poll.tick` calls `mail.drain`, and
`db.pending_outbox` claims rows with an `update … skip locked` — so two processes
against one database is a race, not a redundancy. The one without `MAIL_TRANSPORT`
renders the message into a log nobody reads and marks the row **`skipped`**, which
is **terminal**: `db.prune_outbox` treats it as finished and nothing retries. The
message is not delayed. It is gone.

**Measured on 2026-08-16**: a local process with `transport_delivers() == True`
queued a confirmation and got it back `skipped`, because the deployed container
ticking every minute took it first. **Set `SMTP_*` on whichever process runs the
loop, and do not run a second loop beside it just to send mail.**

⚠️ **THE SAME DAY, THE OTHER SHAPE OF THIS WAS FOUND RUNNING, and it is worse
in a way the paragraph above does not predict.** A local `uvicorn` had been up
for **11h52m** against the **production** database with `POLL_IN_SERVICE=true`,
`MAIL_TRANSPORT=smtp` and a live relay. **Nothing was being destroyed** —
destruction needs a transport-*less* loser marking rows `skipped`, and both
loops here could send. Two other things were happening instead:

- ⚠️ **A message carries the base URL of whoever QUEUED it, not whoever sent
  it.** `outbox.body` is stored as rendered, deliberately, so a subscribe made
  through the laptop's API wrote a production row whose confirm and unsubscribe
  links both read `http://127.0.0.1:8081`. That reached a real inbox. **The
  links resolved perfectly for the person who ran the server and for nobody
  else**, which is exactly why it survived a night unnoticed. `PUBLIC_BASE_URL`
  is the field to check before pointing any local process at a shared database.
- ⚠️ **`poll_ticks` GOES AMBIGUOUS when two loops share a `mode`.** It is one
  upserted row per mode — that is what lets liveness survive the loop and the
  API being different processes — and two loops in the **same** mode overwrite
  each other, so `writes` cannot say which one is alive. **It misled a
  post-deploy check on this very day**: `tick_at` moving and `stored` rising was
  read as *the new container is collecting*, and it was equally consistent with
  the laptop doing all of it. `polling` is the field that stays honest, because
  `_poller.is_alive()` is process-local to whichever process answers the
  request. **Confirmed by stopping the laptop**: `stored` per tick went 24 →
  310 once the Railway container stopped splitting the work with it.

**Read those two together as one instruction: a development loop pointed at the
production database is not a read-only convenience.** It writes rows, it sends
mail as the product, and it makes the health endpoint stop answering the
question you are asking it.

`mail_delivers` is the third field on that response and answers a different
question: not whether we are observing, but whether anything decided can reach
a person. `false` means `MAIL_TRANSPORT` is not `smtp`, or is `smtp` with no
`SMTP_HOST` — the shipped default is the first, so **a fresh deploy reports
`false` and that is correct rather than broken**. It reports **capability,
never delivery**: a configured relay that bounces or files to spam still reads
`true`.

## The measured numbers are in `MEASUREMENTS.md`

Every figure in it is a reading with a date on it, and the rule is **re-measure,
never edit**. `python -m waterline.poll probe` is the authority for the registry
counts, and three rendered surfaces hard-code them — see that file's header for
which page rots first.

⚠️ **Some of its sections measure things that no longer exist**, and they stay
because a section is not wrong for having had the code move under it. Three are
marked HISTORICAL at their own headings: the vision workflow, the Cloud Run
deployment, and any figure counting an `alerts` row. **Read the heading before
quoting the section.**

⚠️ **`The strip` (2026-08-14) is the one to read first after this file.** It
records what the removals actually did — the five mutations driven through the
check scripts, the wire contract through `/openapi.json`, the browser pass at
both widths, and the one regression the strip introduced: the depth band added
two legend keys and broke the map legend's no-jump reserve by 17px at both
widths. ⚠️ **That reserve is retired** — the legend moved onto the drawing on
2026-08-15, where it is out of flow and pushes nothing — but the shape of the
failure is why the section is worth reading. That is the shape to watch for. **A change with nothing to do with
layout can still spend a measured reserve**, and only forcing every key on
finds it.

⚠️ **`The full-width workspace and the map that fills its frame` (2026-08-15) is
the newest section and it is UNMEASURED, which it says at the top.** Four changes
landed — the workspace lost its `max-w`, the map fills its frame, the legend
moved onto the drawing, and the paint rule came off the masthead — and **none of
them has been through a browser**, because `/map` is behind the session gate.
What it records instead is what the runners said, one isolated CSS measurement,
two numbers moved by arithmetic, and **ten numbered checks a browser owes**. Two
of those can force a rethink: the unreachable-marker table has to be re-run at
the new full view, and the masthead's `top-[49px]` is a subtraction rather than a
reading.

⚠️ **`The estuary palette, the cascade, and the monitor ring` (2026-08-15) is
HALF MEASURED, which it says at the top.** The
cascade and the token values were read out of both compiled stylesheets and are
facts — byte offsets, layer spans, the emitted `:root, [data-palette]` block.
**The browser pass is owed and listed at the end as nine numbered checks.** The
first of them can force a redesign: the monitor ring's rail takes ~38px out of a
312px track and the list was already at four fully visible rows against a floor
of three. **Read that list before adding anything to a row.**

⚠️ **`The design-system import` (2026-08-15) is the section under it and it is the
one that was actually MEASURED.** It records the browser pass the section below
it was owed: the frame at 1440×900, all four rail tabs, the row-count table at
both widths with the controls strip open, the mobile sheet, and the three
palettes read off `<html>`. **The three tracks did not move** — the tabs and the
depth bar were added inside 312 / 676 / 372 rather than by spending it. Two
figures in it are the ones to watch: the list is down to **4 fully visible rows**
at both widths against a floor of three, and some rows measure 94px rather than
77.5 for a **pre-existing** wrap the bar merely made visible.

⚠️ **`The front door, the notices and the map's frame` (2026-08-14) is
UNFINISHED on purpose.** It records what the runners
said — 8 contracts, 198 vitest tests, a clean typecheck and build — and then
lists, in full, **what that change owes a browser and has not been given.** The
masthead height against the mobile bar's hard-coded offset (⚠️ `top-[49px]`
since the paint rule came off on 2026-08-15, by arithmetic rather than by
measurement, and owed a browser), the rail with
a fault in it, the legend footer with all twelve keys forced on *and* the zoomed
paragraph, the counter-scales at ×12, the phone gesture pass, the
unreachable-marker table at both full view and ×12. **A prediction in that
section is marked as a prediction.** Nothing in `./scripts/check` can see any of
it, which is the same gap the strip's legend regression came through.
