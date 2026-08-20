# CLAUDE.md — the components

Every rule here binds one file in `src/components/`. The cross-cutting UI rules
are in `web/CLAUDE.md`, the pages in `src/app/CLAUDE.md`, the pure functions in
`src/lib/CLAUDE.md`.

⚠️ **56 of these are exported as a design system since 2026-08-15**, and that
gives every file here a second caller you cannot see from this directory: an
LLM in a claude.ai/design project that composes them into new screens. Three
things follow, and all three live in `web/.design-sync/` — see `web/CLAUDE.md`.

- **Adding, renaming or deleting a component means editing
  `.design-sync/entry.tsx`.** It is a hand-written barrel; nothing discovers a
  component that is not named in it.
- **Changing a prop means the exported `.d.ts` changes**, which is the API
  contract that agent codes against. ⚠️ Two components have their prop bodies
  **hand-written** in `.design-sync/config.json` because the extractor lost the
  meaning — `ModeBadge` (the `| null` that means UNKNOWN) and `SiteNav`. If you
  change those props, change those entries.
- **A rule stated only in a docblock here does not travel.** What reaches that
  agent is the prop comments, the per-component `.prompt.md`, and
  `.design-sync/conventions.md`. Anything load-bearing about safety belongs in
  the prop comment at the prop it constrains, where both readers meet it.

Four are deliberately NOT exported: `auth/auth-provider.tsx` and
`auth/require-session.tsx` (they need the live Neon service), the `about/` and
`terms/` prose (this site's own words, not reusable parts), and the dormant
alert set — `warning-block.tsx`, `alert-list.tsx`, `rat-figure.tsx`,
`drill-controls.tsx`. ⚠️ **If the on-page warning is ever re-wired, that last
group is the first thing to add to the barrel.**

⚠️ **`landing/` is a fifth exclusion and it joined them on 2026-08-16.** Three
files now — `landing-hero.tsx`, `landing-sections.tsx`, `landing-cta.tsx` — plus
`photo-cta.tsx`. They are this site's own front door rather than reusable parts:
they hard-code paths into `public/photoz/` that no design outside this app can
resolve, `landing-cta.tsx` needs the live Neon service, and
`landing-sections.tsx` renders a depth under an `EXAMPLE` label, which is the
last thing a design agent should be handed as a reusable card. **The count stays
56.**

⚠️ **`SiteNav` gained a `cta` prop in the same change and `config.json` moved
with it.** That is one of the two hand-written `dtsPropsFor` bodies, so the
extractor would not have carried the *never both* rule on its own — the rule
above, exercised.

```
  auth/auth-provider.tsx   ⚠️ Neon Auth's context, mounted in the ROOT LAYOUT so
                           it wraps all five routes. Three props are decisions:
                           ⚠️ `credentials` ON since 2026-08-14 — email sign-up
                           writes a PASSWORD HASH to Neon. Moves with /terms §04,
                           `organization={false}`, `defaultTheme="dark"`
  auth/require-session.tsx ⚠️ the gate. It WRAPS `/map` and may never be called
                           inside it. A CURTAIN, not a lock — `waterline/auth.py`
                           is the lock
  spray.tsx                the sprayed TITLE treatment — display face plus a
                           LOCAL SVG paint filter. The split is the point: a
                           blocked font kit degrades to the system stack still
                           wearing the paint
  paint-rule.tsx           the four-colour band. ⚠️ BACK on `/` 2026-08-16 and
                           OFF the auth views the same day; still off `/map`.
                           `/`, `/about` and `/terms` are its whole surface.
                           ⚠️ its fourth band is LIME, not the design's green —
                           that green is --wl-live and may not sit there
  panel.tsx                `Panel` / `PanelHeader` / `PanelTools` / `PanelFooter`.
                           A div with a border, so "equal frames" is structural.
                           `PanelHeader` is a fixed `h-11` so the map's and the
                           list's contents start on the same line
  site-header.tsx          the masthead — ONE LINE: logomark + wordmark + LIVE
                           pill + a freshness summary (md and up) + ⚠️ a
                           SESSION MENU since 2026-08-16, which is the app's
                           FIRST sign-out. ⚠️ was 54px at 1440 / 53 at 390
                           WITH the paint rule; that band came off 2026-08-15,
                           so both are ~5px / 4px shorter and OWED A
                           RE-MEASURE — and the session menu is a SECOND
                           unmeasured change to the same bar. Carries NO
                           warning text.
                           ⚠️ FLAT `--wl-panel` since 2026-08-14 — brick came off.
                           Also `NoticeBadge`, which carries the worst fault's
                           own TITLE and never a bare count, and which is doing
                           MORE work since the strip left the top of the page.
                           ⚠️ the wordmark link is the ONLY route off `/map`
                           since `SiteFooter` came off it on 2026-08-16
  message-strip.tsx        ⭑ NOTICES — the three service faults in one
                           FIXED-HEIGHT box that scrolls internally, every row
                           with a ✕. ⚠️ At the FOOT OF THE RAIL since
                           2026-08-14, under `watch by email`, so it is below
                           the fold. ⚠️ The judgement is NOT here — it is
                           `lib/messages.ts`, pure and tested
  site-footer.tsx          the ONLY footer. ⚠️ NO `mt-12` since 2026-08-16 —
                           against `/` and `/about`'s closing `PhotoCta` that
                           margin painted a 48px BLACK BAR of page background
                           between the photograph and this footer's panel
                           ground. The prose-ending pages carry their own
                           `pb-12` on `<main>` instead. ⚠️ FOUR pages — `/`, `/about`,
                           `/terms`, `/watch/` — as of 2026-08-16. It came BACK on `/`
                           with the landing page and came OFF `/map` and every
                           `/auth` view in the same change. ⚠️ the AUTH VIEWS
                           now carry `Terms` and `Privacy` themselves, because
                           this footer is the site's only route to `/terms` and
                           the sign-in card is where agreeing happens.
                           Logomark, wordmark, a hard-coded English
                           description, four routes. No JavaScript at all
  station-list.tsx         the instrument list, its controls and the two strips
  list-controls.tsx        search, sort and filter as LABELLED GROUPS, with the
                           ADDRESS block leading in its own bordered box
  address-lookup.tsx       the address field: input, candidate list, failure
                           branches and the four-word geocoder line, as ONE
                           component behind both /map mounts
  sensor-row.tsx           one FloodNet deployment in the list. NO ReadingAge
                           (425 one-second subscribers). ⚠️ a MONITOR RING on a
                           rail beside it since 2026-08-15 — outside the row,
                           because the row is itself one button — WITHHELD where
                           `alert_permitted` is false
  depth-cell.tsx           ⭑ the row's depth — current, or the PEAK over the
                           picked window. SHARED by both row kinds
  depth-bar.tsx            ⭑ the same depth drawn against CURB HEIGHT, plus one
                           phrase. SHARED by both row kinds for `DepthCell`'s
                           reason. ⚠️ `aria-hidden` and never the sole carrier —
                           the digits are in the cell beside it. FOUR states
                           take no fill, and a peak takes no band
  rail-tabs.tsx            the rail's chrome bar, as four tabs. ⚠️ `xl` AND UP
                           ONLY — below it the rail still stacks. It is what
                           takes NOTICES off the wrong side of the fold
  depth-band-pill.tsx      where a depth falls against the two borrowed
                           thresholds. Replaced `severity-pill.tsx`
  depth-window-menu.tsx    the depth TIMEFRAME popup. `role="dialog"`, not
                           `menu`. MOUNTED TWICE, driving ONE window
  step-button.tsx          the `‹ ›` button, shared by both pagers
  highlight.tsx            the list's match mark, from `matchRange`
  selected-detail.tsx      the selected instrument, stacked: the still across
                           the full rail, everything else under it. ⚠️ THREE
                           faces since 2026-08-16 — a watched camera, a sensor,
                           and `RegistryCameraFace` for one of the 941 cameras
                           this poller does NOT collect. That third one renders
                           NO depth row, NO band pill, NO sparkline and NO
                           em-dash: an em-dash means *this instrument reported
                           nothing*, and nothing measures there
  city-map.tsx             the drawn map, its marker layers, and — since
                           2026-08-14 — PAN AND ZOOM. ⚠️ since 2026-08-16 EVERY
                           layer switches off, from `LayerSwitches` at top
                           RIGHT — the two header toggles MOVED there — and the
                           PAIRS layer is new. ⚠️ **the CAMERA layer also
                           FILTERS**, on borough and pairing tier, from
                           `CameraFacets` under that pill — which is what lets
                           the map reach more than 27 of the city's 968 cameras
                           at all. ⚠️ **it is SIX marker layers now**: the
                           camera layer is split on `calibrated`, with the
                           no-sensor half BELOW the sensor rings, because
                           Manhattan + `not paired` is 316 marks and falsifies
                           the densest-at-the-bottom ordering. ⚠️ TWO control clusters are now
                           small boxes in corners and NEITHER may be `inset-0`.
                           ⚠️ since 2026-08-15 it FILLS its frame — no CSS
                           aspect lock, the agreement is in `viewport.ts` — and
                           the LEGEND is a column ON the drawing, top left,
                           `pointer-events-none` for the same reason.
                           ⚠️ **PRESSING `+` MOVED THE `+` until 2026-08-17.**
                           Two footer lines toggled on `zoomed` in opposite
                           directions, a footer line is IN FLOW, and the drawing
                           is the `flex-1` above it — so the footer growing
                           shrank the drawing and dragged the bottom-anchored
                           zoom cluster with it. **`ZoomControls` was innocent.**
                           `FrameLine` is the fix: ONE slot for both lines, its
                           height reserved by a GHOST render of the same
                           components rather than by a measured literal
  harbor-baseline.tsx      the five gauges, TWO CARDS AT A TIME with ‹ ›
  gauge-sparkline.tsx      AUTOSCALES, unlike depth-sparkline
  depth-sparkline.tsx      refuses to autoscale its floor
  flip-card.tsx            one flip. ⚠️ ONE surface now — a gauge card
  watch-panel.tsx          pick sensors, set how to be notified, give an email.
                           ❌ ⚠️ **the WIZARD DOES NOT RUN for a reader who
                           already has a watch**, since 2026-08-17. Two faces
                           sit in front of it — `checking` (one
                           `/api/watch/mine` round trip, said out loud) and
                           `have`, which mounts `ManageFace` with the real
                           subscription. ⚠️ it was not a redundant flow, it was
                           a flow that did NOTHING: `watch_subscribe` does not
                           call `set_subscriptions` on an existing row.
                           ⚠️ `watch a second address` is the escape and is not
                           optional. ⚠️ `addable` is supplied HERE and withheld
                           on `/watch/` — adding needs the gated `/api/sensors`.
                           ⚠️ the import runs ONE WAY: this file imports
                           `ManageFace` and `watch-manage.tsx` may never import
                           back. ⚠️ the CONFIRMED receipt CLOSES ITSELF and the
                           fourth step reads `✓ confirmed`; the gate is
                           `sentFaceAutoCloses`, and `mailDelivers === false`
                           may never close it
                           ⚠️ FOUR wizard faces since 2026-08-16 — `manage` MOVED OUT.
                           ⚠️ the ADDRESS face has TWO STATES since the same
                           day: a signed-in reader sees their account address
                           read-only and gets NO confirmation step, and the
                           input is behind `use a different address`. The
                           `sent` face branches on the server's `status` and
                           the confirmed branch may not mention an inbox —
                           its copy is in `lib/watch-settings.ts` so it can be
                           tested
  watch-manage.tsx         ⭑ the manage face. ⚠️ TWO callers since 2026-08-17 —
                           `/watch/`, which an emailed link opens, and
                           `watch-panel.tsx`'s `have` face, which is what a
                           reader with an existing watch meets instead of the
                           wizard. Renders NO `Panel` — both callers frame it,
                           and both print `email_masked` in their own chrome
                           bar. ⚠️ it may NEVER import from `watch-panel.tsx`
  watch-parts.tsx          what both of those render — the four button idioms,
                           `SettingsFields`, `HonestyLine`. A THIRD module so
                           the two cannot import each other and cycle
  mode-badge.tsx           LIVE / REPLAY / UNKNOWN. Provenance, not decoration
  reading-age.tsx          one age. ⚠️ never in a long list
  freshness-line.tsx       the strip under the list's chrome bar
  fluud-mark.tsx           the three-line logomark, `aria-hidden`. ⚠️ the middle
                           line is a WAVE since 2026-08-15 and it is fixed
                           geometry — it takes no input and does not move, on
                           `.wl-swell`'s rule. ⚠️ `src/app/icon.svg` and
                           `public/fluud-mark.svg` are COPIES of this mark with
                           the Estuary hexes baked in, and neither follows the
                           palette. ⚠️ `className` overrides the BOX ONLY, for
                           `/about`'s 82px masthead mark — the geometry, the
                           stroke and the three colours are not overridable
  numbered-section.tsx     the numbered-section shell, plus Rules/Rule.
                           ⚠️ ONE caller since 2026-08-16 — `terms-sections.tsx`.
                           `/about` was cut to a supplied design and dropped it,
                           so this is no longer "the shell both document pages
                           use".
                           ⚠️ optional `id` — a fragment target, so `/` can link
                           `Privacy` at `/terms/#privacy`. A NAME, never a
                           numeral: `/about` renumbered once already
  site-nav.tsx             the top bar on `/`, `/about` and `/terms`. ⚠️ BACK
                           on `/` since 2026-08-16 with the landing page, and
                           OFF every `/auth` view in the same change. ⚠️ was
                           `landing/landing-nav.tsx`, OUTLIVED that directory,
                           and now renders beside it again. ⚠️ takes
                           `mode={null}` on all three — none polls
                           `/api/status`, because with the gate on that is a
                           guaranteed 401 rendered as a service fault.
                           ⚠️ `cta` picks ONE door: `login` on `/`, `map`
                           elsewhere. NEVER both
  about/ · terms/          the two document pages' sections. ⚠️ `about/` was
                           CUT to a supplied design on 2026-08-16 — six numbered
                           sections down to a masthead, two counts and the
                           sources table. FOUR rules lost their only prose home;
                           the accounting is in that file's docblock.
                           ⚠️ the counts and the sources were then MERGED into
                           ONE grid the same day — `AboutInstruments` and
                           `AboutSources` are one `AboutInventory`, counts
                           stacked left, the seven sources a `<dl>` right. ALL
                           SEVEN survived and none may be dropped to fit a
                           column; the `<table>`'s scroll box went with the
                           `<table>`, and anything wide added back brings it
                           with it.
                           ⚠️ **The SITE DESCRIPTION went from TWO sentences to
                           ONE on 2026-08-17**, owner's — *"…that lets you
                           monitor and craft custom alerts based on the city's
                           embedded water sensors."* **It is the same string as
                           `landing-hero.tsx`'s and an edit to either is an edit
                           to both.** ⚠️ the deleted second sentence named the
                           CAMERA PAIRING, so **neither description mentions the
                           cameras** — what still states it is `/`'s
                           *"See the depth and the street at once"* section,
                           this page's DOT camera count, and the map's pairs
                           layer. ⚠️ it is a PRODUCT claim where the old one was
                           an instrument claim; it still states no condition,
                           which is the property both pages are held to
  landing/                 ⚠️ DELETED 2026-08-14, BACK 2026-08-16, rebuilt to
                           a supplied design the same day. FOUR files —
                           `landing-hero.tsx`, `landing-sections.tsx`,
                           `landing-cta.tsx`, `notify-walkthrough.tsx`.
                           ⚠️ the deleted set rendered LIVE readings (citywide
                           card, block search); this one renders ILLUSTRATED
                           ones — every figure a LITERAL, no live clock, and
                           the page still does not poll. ❌ ⚠️ the
                           `EXAMPLE · not a live reading` label above each card
                           is DELETED (2026-08-16, owner), and it was the only
                           one of those conditions a READER could see.
                           ⚠️ the never-safe line went in the same change —
                           see `site-footer.tsx` below.
                           ❌ ⚠️ **`LandingNotify` IS A VIDEO AND FOUR WORDS**,
                           since 2026-08-16 on the owner's instruction. The
                           label, the body paragraph, the three-step `<ol>` and
                           the illustrated `EmailCard` were all DELETED, so
                           `Step`, `EmailCard` and `EXAMPLE_WARNING_MM` are
                           gone from `landing-sections.tsx`. **That section's
                           words are pixels**; the text equivalent is one
                           `sr-only` block in `notify-walkthrough.tsx` and it
                           is the only copy left.
                           ⚠️ **TWO COLUMNS at `xl`** since later the same day —
                           the framed video left, a 300px rail right with an
                           ENVELOPE glyph over `Set your alerts`,
                           `xl:self-center` against the video. **An envelope and
                           NEVER a bell**: this app writes and does not speak,
                           and the on-page alert system is unwired. The glyph
                           takes `--wl-select` (a fact about the READER, which
                           is what a setting is) and shares `SensorGlyph`'s
                           `strokeWidth="0.85"` — all three move together.
                           ⚠️ the TITLE IS FIRST IN SOURCE and painted right by
                           `xl:order-2`, `Section`'s rule for its reason.
                           ⚠️ **`--wl-wash-vertical`, NOT `--wl-wash`**, since
                           2026-08-17 on the owner's instruction — a blue
                           gradient DOWN this band, light at the top and dark at
                           the foot. **The only band on either page that
                           diverges from the shared wash.** Same hue, same
                           refusals, ~2× the strength, and VERTICAL, which is
                           the one axis `--wl-wash` refuses; the exception is
                           bought by having TWO STOPS and no inflection.
                           `bg-card` still has to be the ground. Argument at the
                           declaration in `globals.css`
                           ⚠️ **THREE COPY CHANGES on 2026-08-17**, owner's:
                           `LandingInstruments`' eyebrow `Public data` →
                           **`+5 Sources`** and its title
                           `Two data feeds from the city` →
                           **`Data feeds from the city`** — the title stopped
                           counting and the eyebrow started, because a title
                           naming a number the eyebrow above it then adds to is
                           two counts of one inventory. `LandingDashboard`'s
                           title `…and the corner at once` →
                           **`…and the street at once`**. And the site
                           description on `landing-hero.tsx` went from TWO
                           sentences to ONE — see `about/` below, it is the same
                           string on two pages.
                           ⚠️ **`UNCARDED_SOURCES` is a THIRD figure on `/` that
                           rots**, and the first that rots against a LIST rather
                           than a feed: it is `about-sections.tsx`'s seven-entry
                           `SOURCES` minus the two this band draws cards for.
                           `probe` is no authority for it. **An eighth source
                           moves it**, and nothing in `./scripts/check`, `tsc`
                           or `vitest` holds the pair together
                           ⚠️ the shared `Section` shell is STILL refused, on a
                           NEW reason — the old one (a title rail beside a
                           SEQUENCE reads as a comparison) was overtaken by the
                           instruction that put a rail here. What keeps it
                           inline is that `Section` REQUIRES a `label`, and the
                           `Notifications` label is deleted; `label=""` renders
                           an empty `<p>` with `mb-4` under it
  notify-walkthrough.tsx   ⚠️ the notifications section's VIDEO. TWO cuts of a
                           27s HyperFrames piece — 1920×1080 above `sm`,
                           1080×1350 below, because the wide cut at 340px puts
                           1920px of drawn interface in a 340px box and smears
                           it. Committed build input; source and the five rules
                           it draws are in `web/scripts/motion/README.md`.
                           ⚠️ NOT decoration — a video cannot be read, so it is
                           the section's CONTENT and owes the `sr-only` text
                           equivalent it carries. ❌ ⚠️ that block's `<h2>` is
                           DELETED — the section has a VISIBLE title now, and
                           two `<h2>`s in one `<section>` name it twice to a
                           screen reader. The paragraphs and the `<ol>` stay:
                           they are what the video DRAWS and the title is not.
                           ⚠️ the FRAME — `rounded-sm border` — is on the
                           `<video>` AND the `<img>`, never on a wrapper: the
                           resting branch draws no media, so a wrapper's frame
                           would be an empty bordered box. Both elements carry
                           the same three classes and MOVE TOGETHER.
                           ⚠️ LOOPS, on the owner's
                           instruction, and the cost is stated at the prop:
                           there is no longer an `<ol>` beside it holding the
                           three steps still. ⚠️ the resting state is NOTHING
                           and both posters are the LAST frame, never the first
  photo-cta.tsx            ⚠️ the closing photo band, SHARED by `/` and
                           `/about`. ⚠️ `scale` DEFAULTS TO `scale-100` and for
                           TWO of the seven photographs that default is WRONG:
                           `night_01_elevated_tracks` and `night_14_rooftop_tanks`
                           have a WHITE PRINT BORDER baked into the file (13.8%
                           / 12.2% a side), so they need 1.38 / 1.32 minimum or
                           the band renders white bars. The other five measure
                           zero and want none. **A `scale` here is not a taste
                           knob.** Measured table is in the prop's docblock.
                           Pair any scale with a `position` — free — and check
                           the subject at 390, ~824 and 1440.
                           Decoration rules travel with it: empty
                           `alt`, `aria-hidden`, and never a mark, scale or
                           overlay on the photograph
  neighborhood-back.tsx    the rodent tag, with the DOHMH aggregate behind it
  ⚠️ UNMOUNTED, kept as files:
  warning-block.tsx        the whole warning, once, at the foot of the rail
  alert-list.tsx           the open-alert band
  rat-figure.tsx           the alert rat — four stills, one loop
  drill-controls.tsx       the drill menu. The rat image was its only trigger
```

## ⚠️ The two auth components, and the one that is easy to get backwards

**`require-session.tsx` WRAPS the page it gates. It may never be called inside
one.** `/map` starts `useStatus`, `useHealth`, `useSensors` and `useDepthPeaks`
on its first lines, and a hook runs on mount — so a check further down the body,
however early it returns, has already fired all four. For a signed-out reader
that is four endpoints answering 401 on 15-, 30- and 60-second intervals, each
turned by `lib/messages.ts` into *cannot reach the service*. **Not being signed
in would render as the instrument being broken.** Wrapped, the workspace never
mounts and no request is made. `map/page.tsx` is `MapRoute` → `RequireSession` →
`MapWorkspace` for exactly this.

⚠️ **It is a CURTAIN, not a lock.** The export is static files served to anyone,
so every component here is in the bundle and readable signed out.
**`waterline/auth.py` is the lock.** Nothing secret may live in the bundle on
this component's strength.

⚠️ **Its `AuthLoading` branch is not decoration and its second sentence is not
filler.** Resolving a session is a network round trip, so without an explicit
pending state the first paint is `SignedOut` and a signed-in reader gets bounced
to sign-in on every cold load. And when the auth service is **unreachable** the
query never settles at all — neither `SignedIn` nor `SignedOut` ever mounts, so
the page sits there. Measured against an unresolvable host: `/` rendered an
**empty column** and `/map/` a bare *"Checking your session…"*, indefinitely.
Both now say *"If this does not clear, the sign-in service is not answering.
That is about signing in, not about the water."* — `geosearch.ts`'s rule, on a
different third party: **name which thing failed.**

⚠️ **`auth-provider.tsx` is mounted in the ROOT LAYOUT, which makes its blast
radius every page.** That is deliberate — `/about` and `/terms` need no session
but still need `SignedIn` / `SignedOut` to be answerable. The cost is that
anything that throws at module scope inside the SDK takes down the whole site,
which is exactly what `crypto.randomUUID` did on http-on-LAN before
`lib/crypto-shim.ts`. See `web/CLAUDE.md`.

**Three of its props are decisions rather than configuration**, and the first is
a person-record commitment:

- ⚠️ `credentials` — **ON since 2026-08-14, on the owner's instruction.** Email
  sign-in and sign-up sit beside Google. It was `false`, and the reason it was
  false is what the flip cost: Better Auth writes a hash to
  **`neon_auth.account.password`**, a column verified present on the live
  database. **`/terms` §04 was rewritten in the same commit** — it named only the
  Google shape of the sign-in record and was wrong for anybody who never used
  Google.

  ⚠️ **The rule survives the flip and now runs the other way: this prop and §04
  move together.** A passkey, a magic link or a second provider each add a row
  to that record, and a terms page listing the old shape is worse than one
  listing none.

  ⚠️ **`schema.sql` is untouched and stays untouched.** The hash is in Neon's
  managed schema, which this repo does not define and cannot trim. `subscribers`
  is still ours and still minimal. **Do not "harmonise" the two.**
- `organization={false}` — Neon Auth ships teams, invitations and roles. None is
  wanted and all of it renders by default.
- `defaultTheme="dark"` — the auth UI bundles `next-themes` set to `system`, and
  this site has no light palette to toggle to. Without it a reader on a
  light-mode phone gets a white card bolted to a dark site. ⚠️ It is also why
  `<html suppressHydrationWarning>` stays *cosmetic*: `next-themes` rewrites that
  element's class either way, and this prop is what stops it choosing `light`.

## ⚠️ The alert UI is unmounted, not deleted

`warning-block.tsx`, `alert-list.tsx`, `rat-figure.tsx` and `drill-controls.tsx`
have no mount and no import. The on-page alert system was unwired: no
`/api/events`, no `/api/speak`, no `/api/rat/drill`, no `alerts` on
`/api/status`. They stay so putting the warning back is a re-wire rather than a
rebuild, and `AlertStatus` stays in `api-types.ts` so they still compile.

**Three rules travel with them if they ever come back**, and none of them was
ever about where the warning sat:

- **The text is verbatim**, templated server-side, rendered **exactly once**.
  `truncate` and `line-clamp` are forbidden — clipping the tail of a sentence is
  editing it.
- **There is exactly one live region for it on the page.** EMERGENCY is
  `assertive`; everything else waits its turn. ⚠️ **The page has NO live region
  today**, which is correct: nothing announces because nothing is announced.
- **A height reserve comes back with it if it moves above other content.**
  Warning text arrives at an arbitrary moment, so a block that sizes to its
  contents shoves whatever is under it down at the exact moment somebody is
  reading it. The reserve was `min-h-[7lh] sm:min-h-[5lh] xl:min-h-[4lh]` — the
  `lh` unit resolves against the paragraph's own line-height and survives the
  font-size step. The templates render **113–272 characters** and
  `check_escalation.py` caps every variant at **300**; the desktop header held
  flat to 330 and a 390px phone to 300. **If a template gets longer or a column
  track changes, re-run that arithmetic** — the failure mode is silent.

⚠️ **`WatchPanel` is the bottom of the rail now**, which retires the rule that
nothing may sit below the warning. If the warning returns it goes at the foot
and the panel goes above it.

## The masthead — `site-header.tsx`

One line: logomark, wordmark (a link back to `/`), `ModeBadge`, a freshness
summary, and — since 2026-08-16 — `SessionMenu`. Its job is what a bar at the top
of an instrument is for: what this is, whether the data is real, and whether the
loop is running.

### ⚠️ `SessionMenu` is the app's FIRST sign-out, and there was none anywhere

Added 2026-08-16 on the owner's instruction. `/auth/sign-out/` has existed since
Neon Auth landed — it is in `AUTH_VIEW_PATHS` and it is generated — and **nothing
in the entire UI linked it.** A reader could sign in and had no way to stop being
signed in short of clearing site data.

- ⚠️ **No severity colour, and never green.** It is a fact about the **reader**,
  so it takes `--border` and muted ink. **`--wl-select` is not available here
  either** — that token means *the reader picked this instrument*, and a session
  is not an instrument. The two admitted exceptions in this bar remain
  `ModeBadge` (provenance) and `NoticeBadge` (a fault signal); this is neither.
- ⚠️ **No avatar and no dropdown.** `neon_auth.user` holds an `image`, and
  putting it here would fetch a third-party asset into the masthead of a page
  whose whole basemap is committed so it survives a dead network. A menu would be
  a popover with an outside-press listener for one item — see
  `drill-controls.tsx` for how that goes wrong.
- ⚠️ **It renders NOTHING until it can say something true.** `!authConfigured`
  and a pending session both return null rather than an empty button or a flash
  of one — `ModeBadge`'s rule at a different corner.
- ⚠️ **`router.replace`, never `push`.** After signing out, `/` is a landing page
  whose CTA is `Log in`; with `push`, Back returns to `/map`, which mounts
  `RequireSession` and bounces forward again.
- ⚠️ **The navigation is in a `finally`.** If Neon is unreachable the sign-out
  call rejects and the reader would otherwise be stuck on an instrument they
  asked to leave, watching a button say `signing out…` forever. Landing on `/`
  with a stale cookie is the recoverable half — `RequireSession` and `auth.py`
  both re-check on the way back in.
- ⚠️ **It is not a security boundary.** Pressing it clears the session Neon
  holds; what stops a signed-out request reading data is `waterline/auth.py`,
  which fails closed.

⚠️ **`useSession` and `signOut` come from `lib/auth-client.ts`, never off
`authClient` directly.** The SDK types its adapter as a union over every shape it
ships, so `authClient.useSession` is a nanostore `Atom` to the compiler and not
callable. **This shipped wrong once and `next build` caught it** — see
`src/lib/CLAUDE.md`. `./scripts/check` does not typecheck the web.

⚠️ **ONE `ml-auto`, on the group wrapper.** It was on `FreshnessSummary`'s own
`<p>`; with a second right-hand child carrying its own, flexbox splits the free
space between the two auto margins and the freshness line lands in the middle of
the bar. The group takes the margin and both children sit at the end.

⚠️ **The address is `max-lg:hidden` and the BUTTON is not.** The masthead has to
stay one line at 390 and at 1440 — `FreshnessSummary` is already `max-md:hidden`
for that reason, and `map/page.tsx` carries a hard-coded `sticky top-[49px]` that
a two-line masthead puts the mobile search bar behind. A sign-out that disappears
on a phone is a sign-out that does not exist for most readers, so the address is
what gives way. ⚠️ **That offset is now owed TWO re-measurements** — the paint
rule's removal was arithmetic rather than a reading, and this bar has since
grown a child.

⚠️ **The freshness summary is `max-md:hidden`.** At 295px wide it wrapped the
masthead to two lines on phones, which broke the mobile search bar's hard-coded
`top-[49px]` sticky offset — ⚠️ **53 until the paint rule came off on
2026-08-15**, and that number is arithmetic on `h-1` rather than a fresh
measurement. Below `md` the frozen-poller signal falls back to
`FreshnessLine` and the per-card ages. **Re-measure that offset if the masthead
changes.**

### ⚠️ Nothing in the masthead carries a level colour

This is the corner where the freshness dot is muted-never-green, precisely
because a reassuring colour beside a live-looking number reads as "conditions
are fine" no matter what the words say.

**Two exceptions, both deliberate.** `ModeBadge` is provenance rather than
condition. `NoticeBadge` spends `--wl-stale` / `--wl-dead`, the two tokens
already in this corner, and it is a **fault** signal.

⚠️ **`NoticeBadge` carries the worst fault's own TITLE, not a count, and that is
what keeps a dismissible fault honest.** `message-strip.tsx` puts a `✕` on every
row including faults, so dismissing one has to *move* the claim rather than
delete it. **Shortening this to a number is the change that would quietly close
that hole.** Below `sm` it is a count only — the masthead has to stay one line —
so on a phone a fully-dismissed fault falls back to the per-card ages. That is
the cost of the dismissal, stated rather than discovered.

⚠️ **Since 2026-08-14 it is doing more than that.** The strip moved to the foot
of the rail, so it is off screen until somebody scrolls — **this badge is now
the only always-visible statement that a service fault exists**, dismissed or
not. Its `title` names where the strip went, and that string moves if the strip
does.

### ❌ ⚠️ The paint rule came off this masthead on 2026-08-15

On the owner's instruction. The four-colour band was this header's first child;
`/about`, `/terms` and every `/auth` view still mount `PaintRule` and are its
whole surface now. **`/map` is the second page to lose it**, after `/` was
stripped to the sign-in door.

⚠️ **The rule it carried travels with the component, not with the mount**: the
bands are decoration and take no `alt` and no label, and the fourth is **lime
rather than green** because a full-width green band above the wordmark reads as
*everything is fine* across a room. **If it comes back here it comes back lime.**

⚠️ **Two measured numbers move with it and neither has been re-read.** The
masthead is 4px shorter at 390 and 5px at 1440, so `map/page.tsx`'s mobile bar
went `top-[53px]` → `top-[49px]` **by arithmetic on `h-1`, not by measurement**,
and the `5rem` the three columns subtract is now ~15px more than the masthead
plus padding actually takes. The first would show as the bar tucking under the
wordmark or a strip of workspace scrolling through a gap; the second only as the
columns ending slightly short of the fold.

### ⚠️ The ground is FLAT `--wl-panel` now, and the brick is not coming back here

The masthead wore `.wl-brick` so the instrument and the landing page would read
as one site. It came off on 2026-08-14, when `/` was a sign-in screen with no
chrome and there was no brick left to match. The flat ground is what says *this
is the frame*, on the same step below `--card` every `PanelHeader` under it
takes.

⚠️ **The PREMISE of that removal reversed on 2026-08-16 and the decision did
not.** `/` is a landing page again, so there is a page to read as one site with —
and this masthead is still flat, deliberately. **Restoring the brick here is a
decision to take on its own merits, not an obligation inherited from that page
coming back.** The same shape as the alert rat: the reason a thing was removed
going away does not by itself put it back. ⚠️ **`SiteHeader` renders on `/map`
alone** now that the auth views carry their own wordmark, so it is no longer
adjacent to any brick-bearing page in a reader's session except by navigation.

⚠️ **A SWAP, never a removal.** The header is `sticky`; an absent background
lets the workspace scroll under the wordmark. ⚠️ **`.wl-brick` stays in
`globals.css` and is down to ONE caller** — `terms-sections.tsx`.
`about-sections.tsx` dropped it on 2026-08-16 when that page was cut to a
supplied design that draws a flat masthead. **A class with one caller is a class
one edit from being dead**, and if `/terms` ever loses it too the rule is to
delete it rather than orphan it — the standing precedent for decorative CSS
nobody mounts.

⚠️ **`ModeBadge` stays OUTLINED, never filled.** `--wl-live` is `#22c55e`, and a
*filled* green slab that size at the top of a flood page reads as "everything is
fine" from across a room. A green rule and green letters say provenance; a green
block says all clear. **Do not give it a background.** It starts at **UNKNOWN**,
never at LIVE — a default that is itself a claim cannot enforce anything.

## The notices strip — `message-strip.tsx`

It **replaced `service-banners.tsx`, which is deleted**: that component sized to
its contents in normal flow, so a fault pushed the whole workspace down by an
unpredictable amount and nothing could be dismissed.

### ⚠️ It moved to the FOOT OF THE RAIL on 2026-08-14, and the cost is real

It was the first child of `<main>`, above the workspace. It sits under
`WatchPanel` now, on the owner's instruction — so on desktop it is off screen
until the reader scrolls the rail, and below `md` the rail is `order-4`, which
puts it at the bottom of the page.

**This strip is the frozen-poller rule's BACKSTOP.** What still carries the
claim always-visible is **`NoticeBadge` in the sticky masthead**, which carries
the worst fault's own title rather than a bare count — precisely what it was
built for, now load-bearing in a way it was not when it summarised something
three inches below it. `onShowAll` still un-dismisses and no longer reveals
anything without a scroll.

⚠️ **`--wl-notices` is DELETED with the move.** The token existed only because a
strip above the workspace pushed it down, so both the desktop grid and the
mobile map subtracted its height back out. In a scrolling rail there is nothing
to subtract from. The height is a literal — `h-[112px] md:h-[192px]`, the same
two constants with the folded-in `gap-4` taken out, so the box is unchanged in
pixels.

⚠️ **The rule the token enforced SURVIVES it: the height is a constant and must
stay one.** A `min-h` or an `h-auto` re-creates the unbounded push it exists to
remove, and in the rail that push moves the whole column. No test can see that.

⚠️ **The judgement is `lib/messages.ts`**, pure and tested. `body` is a string
and never a ReactNode, so that file stays testable under `environment: "node"`.

## The footer — `site-footer.tsx`

Logomark, wordmark, a hard-coded English description, four routes.

⚠️ **THREE pages render it as of 2026-08-16 — `/`, `/about`, `/terms`.** It came
**back** on `/` with the landing page and came **off** `/map` and every `/auth`
view in the same change, on the owner's instruction. **On those three it is not
optional.**

⚠️ **Wherever it is removed, something else has to take its job**, and the job is
always the same: this footer is the site's only route to `/terms`, which is where
the sign-in record is disclosed.

- **The `/auth` views** carry `Terms` and `Privacy` under the card themselves.
  That is the page where a reader agrees to terms, so it is the page that may
  least afford to have no route to them. **A future edit deleting those two links
  deletes the site's only route to `/terms` from the surface where agreeing
  happens.**
- **`/map`** relies on the masthead wordmark being a real `<Link>` to `/`, which
  is a landing page carrying all four route links and the description. So a
  reader on the instrument is one press from everything. ⚠️ **The cost is real:
  `/map` no longer carries the prototype disclaimer anywhere.** It is on `/`, on
  `/terms` §01 and in every warning email, and it is a page away from a reader
  who opened the map and stayed there. **This is the same shape of loss as the
  never-safe paragraph below and belongs in the same row.**

✅ ⚠️ **`/about` is reachable from `/` again**, by both this footer and
`SiteNav`. It was unreachable from 2026-08-14 and that was a recorded debt rather
than a settled decision. **Debt paid.**

⚠️ **`/watch/` is a fifth route and is NOT a fifth link, deliberately.** That
page needs a token in its query string to say anything; linked bare from a footer
it is a door that always renders its error face. **The link into it is the one in
the email, and there is no other.**

⚠️ **Its four links stay the four public ROUTES and must not gain a fifth for
sign-in.** `/auth/sign-in/` exists and is reachable, and `SiteNav`'s `cta="login"`
is the door on `/`. A footer link as well would be two names for one door in one
page's chrome.

⚠️ **The served disclaimer no longer renders anywhere.** The string survives on
the wire and in every warning email. What the footer says instead is the
description, which ends *"This is a prototype. It is not an emergency
service."* — the claim survives on every page as description, **in English
only**. A Spanish reader gets no localised version on any page; that is the cost
to know about.

❌ ⚠️ **It carried the never-safe rule in a second paragraph and that was
removed.** It read: *"This system reports what its instruments observe. **It
never reports that anywhere is safe** — 'no flooding detected' is a statement
about a camera and a sensor, not about your block. Cameras watch intersections
and highways; the residential side streets and basement apartments most at risk
are the least observed places in the city."*

**It was the only unconditional statement of that refusal anywhere on this
site.** Every other surface making it is an empty state, a card back or a page a
reader has to choose. **What still carries it**: `/terms` §03 and
`station-list.tsx`'s empty states, both a press or a page away — plus one line
on `/`, below.

⚠️ **That list was three surfaces longer and has lost three.**
`citywide-card.tsx` and `block-search.tsx`'s four `AddressNote` branches went
with the landing page on 2026-08-14, and they were the two a reader met
**without choosing anything**. ⚠️ **`/about`'s *"What it cannot see"* rules went
on 2026-08-16** when that page was cut to a supplied design — see
`src/app/CLAUDE.md`.

❌ ⚠️ **REPAID on 2026-08-16 and UNPAID the same day.** The landing page's
notifications section ended *"Fluud reports what the sensors see."* — the first
unconditional statement of the rule since the deletion, and for a few hours the
only one a reader met without choosing anything. **It was deleted on the owner's
instruction**, along with `landing-sections.tsx`'s `EXAMPLE` labels.

⚠️ **So the claim has ONE home: `/terms` §03, a legal page reached only from
this footer.** Neither deleted empty state came back, so nothing converts an
empty result into a refusal to call a place clear; and ⚠️ **`/map` lost this
footer entirely in the same 2026-08-16 change**, so a reader who opens the
instrument and stays there gets the claim from nowhere at all. **If one sentence
goes back anywhere on this site, it is this one, here, as a second
always-visible paragraph.** Not a
`<details>` — this footer has been through that round trip once. Not a `title`,
and not a link.

Three rules on the wordmark: `aria-hidden` and **not a link** (the `<nav>`
beside it already links Home); it does **not** override `Spray`'s `--wl-spray`,
which is on no scale at all; and the description under it stays `--font-sans`.

**No JavaScript.** This is the part of the page that must still work when
everything else has failed — plain text and four links, not even a `<details>`.

## The map — `city-map.tsx`

### ⚠️ It pans and zooms as of 2026-08-14, and the vocabulary split is the rule to hold

Until then it was a fixed-extent drawing of a whole city at ~82 m/px — no wheel
handler, no drag handler, no viewport state, no `touch-action` anywhere in the
path. The frame is `lib/geo/viewport.ts` (pure, tested) driven by
`lib/hooks/use-map-viewport.ts` (the DOM seam, no test — its four decisions are
written down there).

> ⚠️ **"The mapped area" always means `NYC_BOUNDS`. "This frame" always means
> the viewport. The two may never be worded as one thing.**

That is not a style note. A reader told that instruments are *"outside the
mapped area"* after panning would understand that they had left the city, and
the off-map counters exist precisely to say that upstream feeds have moved.
Which counters are which:

| counter | scope |
|---|---|
| `N plotted` (header chip) | `NYC_BOUNDS` |
| `offMap` / `offMapGauges` / `offMapSensors` | `NYC_BOUNDS`, and they should read zero forever |
| `unmarked` / `silent` | `NYC_BOUNDS` — what the marks withhold across the whole drawing. Made frame-relative they would flicker on every pan |
| `FrameNote`'s *"N instruments sit outside it"* | ⭑ the **frame**. The only frame-relative number here |

⚠️ **Zoom SHARPENS the unobserved-not-clear problem** and `FrameNote` is the
answer: a reader zoomed into a neighbourhood with no FloodNet coverage gets a
frame that is empty because it is *small*, and that reads as *nothing is
happening here* far harder than an empty corner of a city-wide drawing does. It
renders only while zoomed, because at full view the frame **is** the mapped area
and the sentence would be a claim about nothing.

⚠️ **The map CLIPS, it does not CULL.** All 425 markers stay in the DOM at every
zoom; `overflow-hidden` paints the frame. Culling would churn `SensorLayer`'s
roving-tabindex index arithmetic on every pan frame and rebuild hundreds of
nodes for nothing. That leaves one hole — a keyboard-focused marker outside the
frame is invisible — and `onFocus` → `showPoint` is what closes it.

⚠️ **The control cluster is `absolute right-2 bottom-2` and NEVER `inset-0`.** A
full-size positioned box is hit-testable whether or not it paints, and this one
sits above the crosshair's `z-40` layer, so an `inset-0` wrapper would swallow
every click on the map. Same trap as `MARKER_LAYER` below, which has already
broken the gauge diamonds once and all 425 sensor markers once. It is on the
drawing rather than in `PanelHeader` because that header is a fixed `h-11`
already holding two pill toggles and `N plotted`, and three more buttons risk
wrapping it at 390px — which cascades into `map/page.tsx`'s hard-coded
`sticky top-[49px]`.

⚠️ **`+` / `−` may never be dropped as redundant with the wheel and pinch.**
Under the cooperative-wheel policy a mouse-only desktop reader has no wheel zoom
at all, and a touch reader gets reliable pinch only once the frame is already
off full view.

### ⚠️ NEVER SCALE A LAYER, and three things must not scale with the frame

Everything inside the `<svg>` is in viewBox units, so tightening the frame
magnifies it — right for the coastline's *shape*, wrong for everything below:

| thing | why | how |
|---|---|---|
| coast `strokeWidth={1.5}` | an 18px coastline at ×12 | `vectorEffect="non-scaling-stroke"` |
| CSO `<circle r={3.5}>` | 427 dots become blobs | `r={CSO_R * view.w}` — there is no `non-scaling-radius` |
| the violet 46px lattice | ⚠️ it is decoration in **screen space** and corresponds to nothing on the ground. A grid that moves with the map looks like it is measuring the map, which is the first step toward its being read as a scale | it stays a sibling of the SVG on the container, outside every transform |
| marker sizes, `SELECT_HALO` | the measured hit-target table below | **positions move; sizes do not** |

### Why it is drawn and not fetched

There is **no map library and no tile CDN**. Leaflet or MapLibre would have made
this the app's first third-party runtime origin, and a blocked tile host during
a storm is a grey rectangle where the instrument used to be. The basemap is
`lib/geo/nyc.ts`: ~1,400 committed coordinates, 27KB. Regenerate by hand, never
in the build — the Docker UI stage has no egress.

### ⚠️ The aspect ratio is load-bearing

Markers are **HTML buttons positioned in percentages on top of the SVG**, not
children of it — which buys real focus rings, hit targets and `aria-pressed`.
The cost is that the container's `aspect-ratio` and the SVG's `viewBox` must be
the same number, or `preserveAspectRatio` letterboxes the drawing inside a box
the percentages know nothing about and **every marker drifts by half the
letterbox** — consistently and plausibly enough to look like bad map data rather
than a layout bug. Both come from `MAP_ASPECT`.

`MAP_ASPECT` is computed from the *mercator* extent, not the degree extent:
`(east - west) / (north - south)` gives ~1.35 instead of ~1.01, i.e. a map
stretched by a third with a New Jersey-shaped Manhattan.

### ⚠️ The frame IS the box as of 2026-08-15, and the aspect lock left the CSS

`MAP_MAX_W` is deleted and so is the container's `aspect-ratio`. The drawing was
capped at 606px wide and centred, so a track of any other shape left panel
background down both sides; it fills the track now, `h-full w-full`, and there is
no empty space around it.

⚠️ **The marker-alignment rule did not go with the lock — it MOVED.** The rule
was that this box's shape and the SVG's `viewBox` must agree or every marker
drifts by half the letterbox. That agreement is now arithmetic in
`lib/geo/viewport.ts`: the hook measures this element with a `ResizeObserver`,
and `svgViewBox` and `toContainer` both derive the frame's height from that one
measurement through `frameH`. **The viewBox is the container's shape by
construction.** `tests/viewport.test.ts` pins it at five aspects and five zooms.

⚠️ **Do NOT put `aspect-ratio` back on the surface.** A second shape there is the
drift bug with a new door, and it would fight a `ResizeObserver` reading that
element's own rect. `city-map.tsx` no longer imports `MAP_ASPECT` at all, and an
import of it there would be somebody re-deriving the agreement locally.

⚠️ **At full view the frame CONTAINS the city rather than equalling it**, so a
wide frame shows background either side and the drawing is centred by
arithmetic rather than by CSS. Nothing is cropped at full view — `whole city`
promises a whole city.

⚠️ **Marker sizes did not change, so the unreachable-marker table below was
measured against a SMALLER full view than ships today.** It is pessimistic
rather than wrong. **Re-run it at the new full view before quoting a figure.**

### What a marker may and may not claim

| Marker | Means |
|---|---|
| **solid, on the band** | fresh *and* calibrated — a current measured depth |
| **hollow, on the band** | `calibrated: false`. No ground truth; a solid marker would imply one |
| **hollow amber** | stale. **Off the band entirely** |
| **hollow red** | dead. Off the band |
| **crosshair, `--wl-select`** | ⚠️ **not an instrument.** The address the reader typed. It has **no interior**, so it can never be filled — structural rather than stylistic, because fill is what this map uses for *at or above the threshold*. Not interactive, not in the tab order, `aria-hidden` |

**Stale markers leave the band rather than dimming.** An hour-old reading in a
confident colour is worse on a map than on a card, because a card at least has a
timestamp beside it.

⚠️ **The camera band's `none` is `--muted-foreground`, not `--wl-sensor`.**
Camera markers and sensor rings are both circles and colour is the only thing
separating them; borrowing the instrument slate would make an under-threshold
camera indistinguishable from a sensor.

⚠️ **The legend's two band keys NAME their numbers**, interpolated from
`/api/status` and never typed here. A colour keyed as "flood" leaves a reader to
guess which depth that is, and those two figures are the whole of what the
colours say. The `none` key is neutral and **may never be green**: under the
threshold is the absence of a claim, not a claim of absence.

⚠️ **THE LEGEND IS ON THE DRAWING as of 2026-08-15 — top left, read downward,
one key per line**, on the owner's instruction. Two rules came with the move and
the first is correctness: it is `pointer-events-none`, because a positioned box
over the markers is hit-testable whether or not it paints — the `MARKER_LAYER`
trap, which has already killed the gauge diamonds once and all 425 sensor
markers once. Nothing in it is interactive, which is what makes that free. And
it is `absolute top-2 left-2`, a **small** box, never `inset-0` — `ZoomControls`
in the opposite corner, same rule.

❌ ⚠️ **Its `min-h` reserve is RETIRED, not dropped.** It held the all-keys-on
height so a toggle, an address or a filter could not grow the footer and shove
the page — and the depth band broke it by 17px once, through a change with
nothing to do with layout. **Out of flow the block pushes nothing, so the
failure cannot happen**; reserving height now would reserve an empty slab of
panel over the city. **If the legend ever goes back into the footer the reserve
goes back with it, re-measured at both widths with every key forced on.** Do not
restore the old literals — the key list has changed since they were taken.

⚠️ **The footer is now GATED on having a line to draw.** Every remaining child
is conditional, so without the gate the resting state is an empty bordered strip
under the map, which reads as something that failed to load. It also strips
`mt-2 border-t pt-2` off whichever line lands first, since those three classes
were a separator from the legend that is no longer above them.

### ⚠️ A FOOTER LINE IS NOT THE FOOTER'S BUSINESS ALONE — `FrameLine`, 2026-08-17

**Pressing `+` moved the `+`.** Two footer paragraphs toggled on `zoomed` in
opposite directions — `FrameNote` appeared, the pair layer's full-view line
disappeared — and a footer paragraph is **in flow**. The panel is a fixed `h-11`
header above a `flex-1` drawing above this footer, so one more line here comes
straight out of the drawing's height, and `ZoomControls` is `absolute right-2
bottom-2` **of the drawing**. The whole drawing resized and the control walked
away from the cursor.

⚠️ **`ZoomControls` was innocent and the fix is not in it.** It puts
`whole city` FIRST in a bottom-anchored column, so its box grows upward and
`+` / `−` hold their positions. **A fix applied there would have been a fix in
the wrong file.**

**`FrameLine` is one slot holding both lines**, and its height is reserved by a
**ghost** rather than by a literal: every candidate renders twice, once
`invisible` in its own `[grid-area:1/1]` cell and once for real, so the slot is
as tall as the tallest candidate at whatever width it is rendered at.
⚠️ **The ghosts render the SAME components, never a copy of the prose** — a
hand-written ghost string is a second author of this copy and would drift
silently, leaving a reserve that matches a sentence the page stopped saying.
⚠️ **`reserve` is `drawn.length`, the EXACT upper bound on `outsideFrame`**, so
it stays right as the registry grows.

⚠️ **A `min-h` in `lh` was the obvious fix and was refused.** That is the
retired legend reserve's idiom, and here it would be **arithmetic rather than a
reading** — `/map` is behind the session gate and this footer's width varies
with the window. The legend's reserve was broken once by a change with nothing
to do with layout; a literal here breaks the same way.

⚠️ **What is bought: height is a function of the LAYER CONFIGURATION, never of
the FRAME.** Zoom, pan, reset and a changing `outside` count all resolve inside
a slot that was already tall enough. **A layer switch still moves the footer**
and that is out of scope rather than fixed.

⚠️ **The cost is a blank strip at full view with the pair layer off**, which is
this page's resting state. It is **whitespace and never a bordered box** — the
border and the spacing are on the paragraphs inside the slot, not on the slot,
which is what keeps it clear of the gating rule above. **Do not move the border
onto the wrapper to tidy the markup.** ⚠️ **If that strip is ever unacceptable,
the fix is COPY**: an unconditional *"empty space here is unobserved"* fills it
and pays the debt recorded below as the weakest point in the UI.

⚠️ **The depth band turned two camera keys into four and broke this**, which is
the failure this reserve exists to prevent, arriving through a change that had
nothing to do with layout. Maximum cells went 10 → **12**, and with all twelve
forced on the row renders **3 rows / 45px** at 1440×900 and **5 rows / 79px** at
390×844 — against reserves of 28 and 62, so both were **17px short** and a
toggle would have grown the footer under the reader.

**Re-measured through the real static mount after the fix**, by cloning the five
conditional cells in and reading the box before and after:

| | 7 keys | 12 keys forced | reserve |
|---|---:|---:|---:|
| 1440×900 | 2 rows, 45px | 3 rows, **45px** | `sm:min-h-[45px]` |
| 390×844 | 3 rows, 79px | 5 rows, **79px** | `min-h-[79px]` |

The panel footer holds at **70px** across both states at 1440, and document
overflow is zero at both widths. **A new key, a longer label or a font-size
change moves all of this — re-measure with every key forced on, at both
widths.**

⚠️ **EVERY key is gated on its own layer as of 2026-08-16**, on the rule the
block already carried — *zero hides the key, because a key for a mark that is not
on the drawing implies a mark to look for.*

| key | gate |
|---|---|
| `N mm, flood` · `N mm, curb` · `under, measured` · `camera only, no sensor` | **cameras drawn.** All four are `DEPTH_BAND_PIN`, which only a camera pin wears |
| `stale` · `no recent reading` | **any of cameras / gauges / sensors drawn** |
| `selected` | ⚠️ **NEW GATE: any of the three drawn.** It was unconditional on the premise *"the page always has a selection, so the mark is always on the drawing"* — **that premise breaks the moment every instrument layer is off** |
| `N camera-sensor pairs` | pairs drawn, and > 0. Counts links **DRAWN**, never pairings that exist — the gap is the footer's |
| gauges · outfalls · sensors · `not in this search` · `where you searched` | unchanged |

⚠️ **The four band keys stopped being unconditional and are still FIRST**, which
is what keeps the block's growth predictable: a key switching on moves the keys
below it, never the keys above.

⚠️ **A sensor at or above flood takes `--wl-watch` and has NO KEY**, and never
has. It is a pre-existing gap, it is not the layer switches' to fix, and **it must
not be closed by loosening the camera gate** — a sensor wears no curb treatment
at all, so those four keys really are camera-only.

⚠️ **One grid keys every mark on the drawing**, markers and diamonds and
outfalls alike. It was four keys with the gauge and outfall keys stacked
underneath as prose lines, so the footer read as a legend followed by two
footnotes — and the two marks least likely to be understood were the two
presented least like legend entries.

### ❌ ⚠️ The caption is gone, and the unobserved-not-clear rule went with it

The map used to carry *"Pins are the cameras this instrument watches. Everywhere
else is unobserved, not clear."* **Removed, and nothing replaced it
unconditionally.**

Coverage is anticorrelated with risk: cameras watch intersections and highways,
and the residential side streets and basement apartments most at risk have none.
A map is the one surface where that bias is invisible unless stated, because
empty space reads as "nothing happening here" rather than "nobody looked".

⚠️ **Going from five markers to twenty-seven made this worse, not better.** Five
read as a sample and a reader supplies the caveat themselves. Twenty-seven
scattered across five boroughs read as *coverage* — enough to look like a
survey, nowhere near enough to be one.

✅ **Half of it is back, conditional on an address.** With an origin set,
`PanelFooter` states: *"The crosshair is where you searched, not an instrument —
nothing is measured there. Empty space around it is unobserved, not clear."*
That is the deleted caption returning in the place it should go — but a reader
who never types an address still gets a legend-less expanse with nothing saying
what it means, which is the majority case. **This is still the weakest point in
the UI. If one more thing goes back, it is this same sentence without the
condition.** ⚠️ **It got weaker on 2026-08-16**, when `/about`'s *"What it
cannot see"* went with that page's cut — that was the one surface stating the
coverage rule in prose to somebody who had not opened the instrument, and
`LIMITATIONS.md` §2 is now the only place it is argued at all.

Unconditionally, the sensor layer's footer states what its own marks withhold —
*"N sensors are reporting a depth their instrument cannot support and are not
marked. M have not reported at all."* That is the first thing on the drawing to
say that an unremarkable mark is not a reassuring one.

Cameras outside the drawn viewport are **counted and named** in the footer, not
silently dropped. Measured: all 968 DOT cameras and all 425 sensors fit inside
`NYC_BOUNDS` with margin, so **that counter should read zero forever**. It
appearing means an upstream feed has moved, not that the viewport is too small.

### The gauges are diamonds

⚠️ **Shape carries the distinction, because colour cannot.** A gauge may never
be on the depth band — there is no scale the five share, and painting one green
at "normal" would be this page saying the harbor is clear. So a diamond in
neutral slate, taking colour only from **its own** published threshold or from
having stopped reporting, and filled only when it is over its own flood stage.

⚠️ **They age on `gaugeFreshnessOf`, never `freshnessOf`** — shared with the
baseline panel so the map and the panel cannot disagree. A healthy USGS site
runs 21–81 minutes behind by design; the camera thresholds would paint every
diamond permanently amber.

⚠️ **The diamonds stay neutral even though the gauge cards' traces are
magenta.** A coloured marker on a flood map reads as a reading on a scale
whatever the panel means by it. The link between a card and its diamond is
*selection* — `--wl-select` on both — not hue. **Do not "fix" the inconsistency
by colouring the diamonds.**

### ⚠️ EVERY layer is switchable as of 2026-08-16, from one cluster on the drawing

Five switches — `cameras`, `sensors`, `pairs`, `gauges`, `sewer outfalls` — in
`LayerSwitches`, a small box at `absolute top-2 right-2 z-50`. **The two that
lived in `PanelHeader` moved out here**, so that fixed `h-11` bar now carries
only its title and the `N plotted` chip, and the wrap risk at 390px it was always
warned about went down rather than up.

| switch | state lives | default | why |
|---|---|---|---|
| `cameras` | `CityMap` local | **on** | rides on `/api/status`. No fetch to gate, no second consumer |
| `sensors` | `map/page.tsx` | off | gates the ~150KB `/api/sensors` fetch |
| `pairs` | `map/page.tsx` | off | ⚠️ **gates the SAME fetch** — a camera carries its sensor's **id, not its coordinates** |
| `gauges` | `CityMap` local | **on** | same payload as cameras |
| `sewer outfalls` | `CityMap` local | off | committed data; 427 dots over 27 pins buries the subject |

⚠️ **First paint is unchanged** — 27 pins, 5 diamonds, no rings, no dots, no
lines. Verified in a browser rather than assumed.

⚠️ **Nothing is persisted and persisting would be a POLICY change**, not a code
change: `/terms` §05 promises no cookies, no local storage and no session
storage. Every default is what a reader gets on every load.

**Four rules the cluster is built on:**

- ⚠️ **A SMALL box, NEVER `inset-0`.** `ZoomControls`' rule, binding harder: the
  legend can afford to be wide because it is `pointer-events-none`, and an
  interactive control cannot take that escape. It is opaque and it blocks — marks
  under it are hidden and unpressable, on the same *Equivalent* argument the 15px
  hit target runs on.
- ⚠️ **A COLUMN, and that is a measurement.** Five pills at this idiom are ~395px,
  wider than the ~374px a 390px phone gives the drawing. Measured at 390: legend
  162px wide ending at x=200, cluster 120px starting at x=261 — **61px of gap, no
  overlap, no pill wrapping.** If they ever collide, **the legend's `max-w` gives
  way and never the cluster**; a pill that wraps is unpressable.
- ⚠️ **Never collapsed, and that is a safety refusal.** A `layers 3 / 5` trigger
  puts *which layers are off* one press away, and that is exactly what the
  drawing may not go quiet about.
- ⚠️ **The swatch keeps the SHAPE and the colour carries the state.** The outfall
  toggle's "a swatch that fills" does not scale to five, because **fill is a
  channel this map already owns** — filled dot is an outfall, hollow ring a
  sensor, hollow diamond a gauge — so a sensor swatch that filled on would draw
  the outfall's glyph. ⚠️ **The camera pill may not take its layer's colour**: a
  camera pin wears `DEPTH_BAND_PIN`, so it takes plain `--foreground`.

⚠️ **A layer switch is NOT the search box, and the distinction is the whole
licence for this control.** `SensorMarker` refuses to remove a marker because of
a *text box*; `instrument-query.ts` refuses to let a facet become a map
treatment. A switch changes **which marks are drawn** and never **what a mark
says** — selection, `ordered`, the list, the pager and the de-emphasis are all
untouched. **What makes it legal is not the toggle. It is `HiddenNote`.** Delete
that line and this control becomes the thing those rules forbid.

### ⚠️ `CameraFacets` — the camera layer FILTERS too, and it is sharper than the five

Added 2026-08-16, under the `cameras` pill and **only while that layer is on** —
a filter on a layer that is not drawn is a control with no effect, which is how
a reader concludes the map is broken. Three tier chips (`paired` · `near` ·
`not paired`) and one chip per borough the registry carries. Private to
`city-map.tsx`, like `LayerToggle` / `HiddenNote` / `MapLegend`, so
`.design-sync`'s export count stays 56.

⚠️ **Everything `LayerSwitches` argues applies and then goes further.** A switch
is binary and its off-state is **total**, which is why `HiddenNote` can say
*"27 cameras are switched off"* and be complete. This produces **partial**
absence — 130 drawn, 838 not — and a reader looking at 130 pins has no cue
whatever that 838 are missing. **What makes it legal is `cameraFilterNote`, in
`lib/camera-filter.ts`, swept by `tests/camera-filter.test.ts`.**

- ⚠️ **NEVER collapsed.** The `layers 3 / 5` refusal at full force: which
  cameras are off is exactly what this drawing may not go quiet about.
- ⚠️ **`--foreground` and nothing on a scale.** Not `DEPTH_BAND_PIN`'s three —
  the camera pill already refuses them, because a camera pin's colour **is** the
  depth band. And not `--wl-select`, which means *the reader picked this
  instrument*: a filter is not an instrument. `SessionMenu`'s call, one bar over.
- ⚠️ **No swatch.** Every glyph in this cluster previews its own layer's mark
  and a tier has no mark — *never colour a distance* closes hue, and its
  argument closes dash, weight, size and opacity with it.
- ⚠️ **`h-6` is 24px and it is a FLOOR.** WCAG 2.5.8's *Equivalent* exception
  does not apply: unlike a sensor marker, which the list and the pager both
  reach, there is no second route to this control anywhere in the app. If a
  thumb fails it at 390 the answer is `h-7 sm:h-6` rather than padding.
- ⚠️ **The borough chips do not render until the registry has arrived**, because
  before that there are no names to offer and inventing them from `NYC_BOUNDS`
  would offer a facet whose DOT spelling may differ. The footer says why.

⚠️ **THE HIGHEST-RISK LINE IN THAT CHANGE IS THE LAYER SPLIT, not this
control.** The camera layer is two `<ul>`s now — with-a-sensor on top where the
whole layer used to be, without-a-sensor **below the sensor rings** — because
Manhattan + `not paired` puts 316 marks in the camera layer and falsifies the
*densest at the bottom* ordering outright. **Both are `MARKER_LAYER` with
`MARKER_HIT` on every marker**, and a second `absolute inset-0` box without the
pass-through is the trap that has already broken the gauge diamonds once and all
425 sensor markers once.

⚠️ **`pairLinks` takes `drawnCameras`, not `cameras`.** Given the unfiltered
list it draws a link from every paired camera including the filtered-out ones — a
line to a mark that is not there. That was a real bug the moment the layer could
be filtered, and `vitest` cannot see the call site; it is a review property plus
a browser check.

⚠️ **The legend's camera gate SPLIT.** The three banded keys and the
`camera only, no sensor` key used to rise and fall together, which stops being
true the moment the filter draws a set that is all one or all the other. The
three banded keys stay **first**, so *a key switching on moves the keys below it
and never the keys above* survives. **The key set changed, so the legend owes a
re-measure with every key forced on at both widths.**

⚠️ **The header chip carries the denominator** — `130 of 968 plotted` — the
moment the registry has arrived. That is the cheapest possible statement of what
is withheld: always-visible chrome, no scroll, no hover. Before the registry
arrives there is no denominator to print and none is invented.

### ⚠️ `HiddenNote` — what the drawing says when a layer is off

The map's idiom for absence is already fixed: instruments outside the viewport
are **counted and named** in the footer, never silently dropped. A switched-off
layer is the same absence with a different cause, so it gets the same answer, on
every load.

> **`{list} {is|are} switched off. A layer that is off says nothing about the
> water.`**

⚠️ **The legend structurally cannot do this job**, and "grey out the key" is the
obvious cheap fix. Its own rule is *zero hides the key* — so **the legend goes
quieter exactly as the drawing goes emptier.**

⚠️ **Outfalls and pairs are never listed**, and "list all five" is what somebody
will symmetrise it to. An outfall is plumbing rather than an observation. Turning
pairs off removes no instrument — every pin and ring is still drawn.

⚠️ **There may be NO NUMBER, and a zero is not available.** With sensors and
pairs both off, `/api/sensors` has never been fetched, so the map does not know
how many rings it is not drawing. It says *"the sensor layer"* rather than
*"0 sensors"*, which would read as *there are no sensors*.

**All three instrument classes off replaces the list with a stronger paragraph:**

> **`No instrument is drawn. This drawing reports nothing. Switch a layer on to
> see what is being measured.`**

⚠️ **`text-foreground`, and specifically not `--wl-stale` or `--wl-dead`.** The
off-map counters take amber because they mean an upstream feed has moved — a
*fault*. This is the reader's own switch, and painting a control's consequence in
the fault vocabulary is how that vocabulary stops meaning anything. The map's
emptiest state gets the page's plainest, strongest type.

⚠️ **The header chip changes its WORD and keeps its number**: `27 plotted` →
`27 not shown`. `plotted` is a claim about `NYC_BOUNDS` and stays true either
way; `0 plotted` would read as *there are no cameras*. ⚠️ **It gained a
DENOMINATOR on 2026-08-16** — `130 of 968 plotted` — once the camera registry has
arrived. See `CameraFacets` above.

⚠️ **`HiddenNote` was EXTENDED for the camera filter, not reused.** It takes
`filterNote` and `filterRefuses`, renders the filter's sentence **first**
(because how much of the city is on the drawing outranks which classes are off),
and falls back to the layers line under it. All of that copy is
`lib/camera-filter.ts`'s and **nothing in this component composes any of it** —
that is what lets a runner sweep it. ⚠️ **`nothingDrawn` widened too**: cameras
switched on but filtered to zero, with the other two classes off, is an empty
drawing by a different route and gets the same strong paragraph.

### ⚠️ The pairs layer, and the pixel it is a pixel long

27 dashed `<line>`s inside the existing `<svg>`, above the outfall dots and under
every marker layer. `lib/geo/pairs.ts` is the derivation and it is tested.

- ⚠️ **The join runs CAMERA → SENSOR through `sensor_id`, never sensor → camera
  through `watched_camera_id`.** The two are not inverses: 21 distinct sensors
  serve the 27 watched cameras, because four serve more than one and one serves
  four. The reversed join draws 21 lines and **silently drops six.**
- ⚠️ **`vectorEffect` goes on the `<line>`, not the `<g>`** — it is not inherited,
  so on the group it silently does nothing and a 1-unit stroke at ×12 is a
  twelve-pixel rope. **Measured: `1px` stroke and a `3px 2px` dash at both full
  view and ×12**, so the dash does not grow and no fallback was needed.
- ⚠️ **`butt`, never `round`.** A round cap on a very short link draws a dot, and
  a filled dot on this map means a sewer outfall. `pairLinks` drops coincident
  endpoints as the other half of that guard.
- ⚠️ **Non-interactive.** A `<line>` with a stroke is hit-testable by default, and
  the next person will want to make one hoverable to name the pair.
- **`--wl-pair`**, declared in `:root` so no palette can retint it. Every existing
  token means something else here — the instrument slates say *instrument*,
  `--wl-cso` says *plumbing*, `--wl-coast` says *shore* (the misread the dash
  prevents, arriving through hue), `--muted-foreground` is the camera band's
  `none`, `--wl-select` is selection only.

⚠️ **MEASURED 2026-08-16, and it is the feature's real limit: at full view every
link is about a PIXEL long.** All 27 came out between **0.11px and 1.31px** on a
650px drawing, median **0.75**, seventeen under one pixel. That is not a defect —
`cameras.MAX_PAIR_M` is 250 m and full view is ~75 m/px, so a co-located camera
and sensor are three pixels apart at most. **The switch therefore looks like it
does nothing at the view every reader opens in**, which is the outfall toggle's
own recorded failure. So the footer says so, at full view only, on `FrameNote`'s
rule inverted.

⚠️ **The fix to refuse is a MINIMUM LENGTH on the line.** Drawing a link longer
than the distance it spans would put two instruments further apart than they are,
on a map, to make a control feel responsive.

### The sensor layer — 425 rings

Behind a toggle, off by default, and the one layer whose data is **not** already
on the page: turning it on is what makes `use-sensors.ts` fetch at all.

⚠️ **`plottedSensors` stopped being gated on `showSensors` on 2026-08-16**, and
the gate it lost was standing in for a data-presence check — the pair layer needs
those coordinates with the sensor layer off. **Two consumers that meant "on the
drawing" now say so explicitly**: `outsideFrame`, which must not count an
instrument that is not drawn, and the `shownFor` recentre, whose **camera branch
gained a gate it never had**. Delete either and the pager's guarantee silently
becomes *"reaches every instrument and shows you a frame it isn't in"*.

⚠️ **Switching a layer ON does not re-run the recentre**, because `shownFor` is
keyed on the selection. Select a sensor with the layer off, switch it on, and the
mark appears possibly outside the frame with nothing moving. That is right — a
layer switch is not a selection event.

**Layer order is densest at the bottom: sensors (425) → gauges (5) → cameras
(27).** The sparser and more important a class is, the higher it paints.

⚠️ **Every layer `<ul>` is `pointer-events-none` and every marker
`pointer-events-auto`, and this is correctness rather than tidiness.** Each
layer is `absolute inset-0`, i.e. a full-size transparent box, and a positioned
box is hit-testable whether or not it paints anything — so the topmost `<ul>`
swallows every click aimed at any layer beneath it. **Measured: this was already
broken before the sensors arrived**, and adding a third layer made it total.

**A hollow ring, not a dot**, because the outfall dots are filled and both
layers can be on at once. Filled only when fresh, plausible and at or above the
10 mm threshold. Stale, dead, implausible or silent: never filled.

#### ⚠️ Most markers are not clickable AT FULL VIEW, and that is measured

| **at full view** | 1440×900 | 390×844 |
|---|---:|---:|
| markers with **no reachable point** | 145 / 425 (**34%**) | 268 / 425 (**63%**) |
| worst 50px cluster | 22 markers, 8 unreachable | 50 markers, **36 unreachable** |

⚠️ **"At full view" is load-bearing on this table since zoom landed.** Somebody
re-running it at ×12 gets a much better number and concludes the padding can be
raised. **It cannot: this is a full-view property**, and full view is where the
page opens, where every reader who never touches the controls stays, and where
the pager's guarantee has to hold on its own.

**Do not describe this layer as addressable by pointer.** What makes every
sensor reachable is the `‹ ›` pager, which walks the filtered list — the two are
one feature, and since zoom that pairing extends: the frame follows a selection
arriving from the pager, so *reaches every sensor* became *reaches every sensor,
and the frame follows*.

⚠️ **Counter-intuitively, a BIGGER touch target makes it worse — at full view**:
7px box → 11% unreachable, 15px → 34%, 25px → 60%, 39px → 77%. The padding is
invisible, so at this density every pixel of it is hit area stolen from a
neighbour. The plan for this feature specified ">= 24px for touch" and
measurement inverted it. The shipped value is **15px**, and WCAG 2.5.8 is
satisfied through its *Equivalent* exception — the same selection is available
from the list and the pager. ⚠️ **Do not raise the padding without re-running
that table AT FULL VIEW.** A number taken zoomed in is a number about a state
most readers are never in.

⚠️ **Roving tabindex, not 425 tab stops.** One tab stop enters the group, arrows
and Home/End move within it. Camera markers keep individual stops; 27 is fine.

⚠️ **De-emphasis, never omission.** With a query active, non-matching sensors
drop to 25% opacity and **nothing is ever removed**. A map that hides
instruments because of a text box is a map whose empty space has quietly
acquired a new meaning.

### The sewer outfall layer

427 outfalls, generated by hand and committed. Off by default, behind one
`Button` with `aria-pressed`.

- **They are drawn inside the SVG, not as HTML markers.** They are
  non-interactive backdrop and there are forty times as many; 427 more buttons
  would cost real layout work to deliver nothing clickable.
- ⚠️ **The whole caveat now lives in the toggle's `title`, and nothing a touch
  user can see explains what an outfall is.** The key read *"427 combined sewer
  outfalls — where storm water and sewage discharge together when the pipes
  fill. Locations from the 2015 registry, not discharge activity; this page
  cannot see when one is running."* and is now *"427 sewer outfalls"*. Dots on a
  map with no qualifier read as "something is happening here" when what they
  mean is a permanent fact about the plumbing. **If it comes back, it comes back
  as text under the grid**; a longer tooltip is not a restoration, because the
  whole failure is that a tooltip does not exist on a phone.
- ⚠️ **The toggle had to be made to look like a toggle.** Its only on-state was
  its label turning blue, which is indistinguishable from a label that happens
  to be coloured — so the control read as a static caption and 427 outfalls were
  a feature nobody found. It has a **border** now, and a **swatch that fills**,
  which is the state itself rather than a restatement of it.

## The selected-instrument panel — `selected-detail.tsx`

STACKED: the still across the full rail at its own `352/240` ratio, everything
else under it. It was two columns with the still at 42%, which in a 372px rail
is a **145px** thumbnail — the thing the two-column layout existed to escape.

⚠️ **`max-h-[300px]` is for the stacked case below `xl`**, where the rail is the
full page width and an unclamped box would be a 700px-tall photograph of a
street. `SensorFace` matches it exactly, because the panel must not lurch
between kinds when the pager steps from a camera to a sensor.

### The two faces were aligned, and what could NOT follow

**What moved**, all of it the "must not lurch between kinds" rule applied to
parts that had drifted: the age across from the title (`items-baseline`,
`min-w-0` on the title, `shrink-0 whitespace-nowrap` on the age, because **the
age may never be the thing that wraps**); the deployment id as a mono subtitle;
`Start Monitor` into the left column under the depth; and the corner across from
the depth taking a `FAULT` chip.

**What could not follow:**

- **No depth trace on the sensor face.** `/api/history/{camera_id}` is
  camera-only; adding a sensor series is a route, a model and a hook. **This is
  the one remaining asymmetry between the two faces**, and it was left undone
  rather than faked.
- **No flip on the sensor face.** ⚠️ **RESOLVED by deletion, not by building
  one**: the camera face's flip is gone with `neighborhood-back.tsx`, so neither
  face turns over and the asymmetry is closed.

⚠️ **The measured 569.9px / 820px gap between the two panels is gone with it.**
It existed only because the camera face was inside `FlipCard` and the sensor
face was not. Both are plain `Panel`s with the same root now — `cn("relative
h-full", border, className)` — so a later measurement finding them equal is the
fix landing rather than a regression.

### ⚠️ The corner across from the depth is the QUALIFIER's, on both faces

It held a camera-confidence chip until that layer was deleted, and the sensor
face was built to match it — measured flush right on 27/27 cameras. **An empty
corner reads as something failing to load**, so it takes the sensor face's
`FAULT` chip instead, on the same predicate.

⚠️ **It is `sensor-row.tsx`'s chip verbatim** — neutral-outlined `--wl-stale`,
the "removed from the scale" idiom — because a reader who saw `FAULT` in the
list has to meet the same mark here. **The three surfaces must not fork on it.**

⚠️ **The MARK is there and the WORDS are not.** A chip cannot carry an
explanation; the sentence naming which bound was crossed stays in the flow
below. ⚠️ **`depth_plausible === false`, never `!`** — it is `true` on a camera
with no paired sensor.

⚠️ **A camera's own depth ESTIMATE rendered under the description and is GONE**
with the layer that produced it. **If a camera is ever asked to produce a number
again, it comes back as prose with the word `estimate` in it and the method
named — never in depth type and never in a colour.**

### ⚠️ The watch toggle is `Start Monitor`, and it is across from the depth

- **`items-start`, not `items-center`.** `DepthReadout` grows a `last known`
  line when the reading is stale, so centring would slide the button down half a
  line the moment a poller froze.
- ⚠️ **Only the BUTTON is up here on the sensor face.** The refusal — *"Fluud cannot warn from this sensor, so it cannot be watched"* — stays in the
  flow below, because a paragraph beside a 26px number reads as a caption on the
  reading. Where the answer is no there is **no control at all**, because
  offering one the server would refuse reads as a promise.
- ⚠️ **REST is `--wl-cyan`, PRESSED is `--wl-select`.** The hue never varies
  with the **reading** — every instrument at every depth wears the same cyan at
  rest — so it cannot encode one. What it varies with is whether the reader
  picked this instrument, which is `--wl-select`'s own licence, and the two ends
  are the right way round. Green was never available; violet is `--wl-replay`'s.
  ⚠️ **The 10.48:1 figure was measured against BITUMEN and is stale.** Estuary
  ships as of 2026-08-15, so the rest colour is `#35d6f2` on `--card` `#0d131b`
  and the pressed one is `#4d8dff`. Both need re-reading.
- ⚠️ **The row's monitor ring is the second door to this set and it is not this
  button.** It carries no word, so it takes `--border` at rest rather than cyan;
  425 cyan rings down a list would be a colour field beside 425 depths. Filled,
  it is `--wl-select`, which is this button's pressed state — **the two ends
  agree where it matters.** See `sensor-row.tsx`.
- ⚠️ **`watch-panel.tsx`'s empty-pick copy names this button verbatim and wears
  its rest colour**, so **the copy run and the button's rest state move in the
  same commit**. An instruction naming a control that is not on screen is worse
  than no instruction.

**Measured through the real static mount**, both faces, both states: rest
**113.3px**, pressed (`monitoring — press to stop`) **204.5px**, zero depth-row
overflow at 1440 and 390. ⚠️ **At 390 the worst case is ~53px of slack** —
thinner than it was, because the column now holds three things. **If either
string grows, or a preset label gets longer, re-run this**; the failure is the
button wrapping and taking the row with it, which is silent.

⚠️ **What is left of the description renders NOTHING rather than an empty
`<p>`.** An empty paragraph would still cost its line box and its `mt-2.5`,
opening a gap under the depth that reads as something failing to load.

### ⚠️ The pairing sentence has been wrong twice

It said *"Display only — Fluud does not raise a warning from this sensor"*,
which was false for every deployment `alert_permitted` admits — the email watch
takes no camera at all, so ~343 sensors can warn a subscriber with no pairing.
It was repaired to *"Drives the warning at X"* — and that went false in turn
when the on-page alert system was unwired.

**So it says what a pairing IS**, because a pairing gates nothing: this sensor's
depth is the one labelling that camera's view. `alert_permitted` is the separate
question the button above is gated on. **A claim built on either field has to
name its path** — that is what both errors had in common.

### ⚠️ The provenance run gained FOUR statements on 2026-08-15

The sensor face is where a reader goes to find out **why an instrument says
what it says, or says nothing**. Four facts that answered exactly that were
already in the database, already on the wire or one field away, and rendered
nowhere. Each is a sentence in the muted 11px run, or a row in the `<dl>` under
it. **This panel is the designated donor** — its body is `overflow-y-auto`, so a
line here costs a scroll rather than a measurement, which is why none of it went
in a list row.

| what | where | why it was owed |
|---|---|---|
| **the plausibility bound crossed** | the `FAULT` sentence | it named the direction and no figure. A reader met `FAULT` over `1452 mm` with nothing it was too deep *against* |
| **the mounting height** | the same sentence, deep branch only, plus a `mounted` row | the phantom-flood argument in one clause: a lost echo reports the pole |
| **why the watch is refused** | the `!alert_permitted` branch | it stated the refusal and withheld the reason, on a control the reader can see is missing |
| **what a silence is measured over** | a new branch on `observed_at == null` | a bare em-dash left *nobody looked* and *this instrument is broken* looking identical |

Five rules hold them, and four generalise past these sentences:

- ⚠️ **The bound is attributed to Fluud and never to FloodNet.** 10 mm and
  150 mm are borrowed; `implausible_mm` is derived in this repo. *"FloodNet's
  600 mm ceiling"* would credit somebody else with a number this project chose.
  `IngestBounds` in `api-types.ts` is the split made structural.
- ⚠️ **`ingest` is nullable and every sentence is GATED on it. There is no
  fallback number on this side.** `floodEventMm` has one because `depthBand`
  must return a band on the first paint; a sentence has a third option a band
  does not, which is not being there yet. A `?? 600` here would put a safety
  bound in the bundle, silently authoritative whenever the fetch is slow and
  held by nothing in `parity.test.ts`.
- ⚠️ **The height clause is on the DEEP branch only.** A lost echo returns the
  distance to the mount, so the pole explains a large positive reading and
  explains nothing about a negative one. A real fact on the wrong branch is a
  non-sequitur wearing an argument's clothes.
- ⚠️ **The mounting height is NOT a depth and lives away from the reading.** It
  is a length in millimetres like the number above it, and the two may never
  share an axis, a band, a pill or a bar — one is the height of a pole, the
  other is water on the ground. It sits in the `<dl>` with borough and
  coordinates, and it renders in **metres** precisely so `2.4 m` beside
  `1452 mm` cannot be read as two points on one scale.
- ⚠️ **The silence sentence names the window and refuses to guess the cause.**
  ~29 deployments have a broken real-time clock, publish everything stamped
  decades ahead, and arrive exactly like a sensor that has stopped.
  `floodnet.skewed_deployments` can separate them and is diagnostic-only;
  doing it here is a stored column and an hourly upstream request, and **it is
  not built**. The copy says the page cannot tell them apart, and it ends on
  the never-safe rule — a silent instrument is where "no news" most wants to be
  read as "no water".

### ⚠️ The tidal sentence can reach the gauges now

It claimed *the harbor gauge is evidence about it* and gave no way to get
there — and since the rail was tabbed, the gauges are behind a tab **on the same
column**. `onShowGauges` is that claim cashing itself.

⚠️ **The control takes NO scale colour and specifically not `--wl-select`.**
That token means *the reader picked this instrument*; opening a tab is a
different fact, and borrowing it would put a selection colour beside a reading.
Muted with an underline is a link's affordance and nothing else. It is optional,
so the panel still mounts where there is no rail to switch.

## The depth timeframe — a PEAK over a window, and never a mean

`depth-window-menu.tsx` (the control) · `lib/depth-window.ts` (the pure rules) ·
`lib/hooks/use-depth-peak.ts` · `/api/depth-peak/{kind}/{id}` ·
`waterline/peaks.py`. **Both faces**, and the list.

⚠️ **The aggregate is a PEAK, and the choice was the whole safety question.** A
**mean** over a day across a two-hour flood renders that flood as a small
number, in the largest type on the page. A peak cannot fail in that direction;
the worst it can do is describe a moment that has passed, which is why `peak_at`
exists and why every label says the word `peak`. **`peakLabel` cannot produce a
string without it**, and that is asserted.

⚠️ **The peak is taken over PLAUSIBLE readings only.** A faulted rangefinder's
`1451 mm` would otherwise *win a maximum* — promoted out of the list, where it
wears a `FAULT` chip, into a 26px figure wearing nothing.

⚠️ **Three silences, three sentences, and collapsing them is the bug to avoid.**
All three render an em-dash — never a `0`:

| `readings` | `faulted` | what the page says |
|---:|---:|---|
| 0 | 0 | *nothing recorded in this window. This is not a statement about conditions.* |
| 0 | >0 | *N readings in this window, every one a sensor fault. No believable depth.* |
| >0 | — | *from N readings* (and `(M faulted, excluded)` when any were) |

The middle row is not hypothetical — one live sensor sits there with **1,272
faulted readings and no believable one**. Reporting it as "nothing recorded"
would describe a broken instrument as an unobserved street.

Four more decisions:

- **`null` is the resting state and means the current reading.** A page about
  what is happening now must not open on what happened yesterday.
- ⚠️ **The stale `last known` treatment does NOT apply in windowed mode.** That
  label means *this is the newest thing we have and it is old*, which is a claim
  about a current reading. A peak is explicitly historical.
- ⚠️ **The window survives a selection change.** It is a fact about what the
  reader wants to know, not about an instrument. **Not persisted** across a
  reload.
- ⚠️ **The control sits UNDER the reading, never in the depth row.** That row's
  widths are measured; a third item would spend the slack and wrap the button
  silently.

**The ceiling is retention and it is named on the control**, before the request:
`last 7 days` is the widest window and the apply button previews the clamp. The
response echoes the window actually **used**, and the readout says so when they
differ — a seven-day peak labelled "last year" is the one way this feature can
understate a flood.

### ⚠️ Two bugs in this control, both worth not reintroducing

**1. Opening it flipped the panel over.** The camera face put an `onClick` on
the whole `Panel`, so the press that opened the menu bubbled into it and the
reading turned into a rodent wall. ⚠️ **That panel no longer flips and no longer
carries a root handler, and the stop STAYS** — `harbor-baseline.tsx` still flips,
and the guard is the kind that is expensive to re-derive and free to keep. The
stop is on the component's **own root** —
not the trigger, because the popup is a DOM descendant and a trigger-only stop
leaves every press *inside* it still flipping the card, which is the worse half.
It is **in the component, not at the call site**, so a future mount on a
flipping surface is safe by construction. It cannot break dismissal, because
`usePopover` listens for `pointerdown`.

**2. In the list, the popup was clipped away.** `Panel` is `overflow-hidden` and
the list mounts this at the **right** end of a 312px track, so a left-anchored
240px panel ran past it. It takes an `align` prop now. A viewport-relative fix
was rejected: this popup lives inside two different scroll regions and has to
move with its trigger.

## The list — `station-list.tsx`, `list-controls.tsx`, `depth-cell.tsx`

### The word `peak` is on every windowed number

Two statements, both required: **a strip above the list** naming the window the
**server** used, and **the word above every number** in `depth-cell.tsx` —
⚠️ **including the rows showing an em-dash**, because a label that appeared only
on rows with figures would let the empty ones read as *currently nothing*.

⚠️ **The mode note below it gives up its last clause while a window is picked.**
It ends *"N are reporting a depth. The others show a dash."* — true of the
current reading, where the dash comes from a null `observed_at`. In windowed
mode the dash comes from the peak entry instead, so far more rows show one than
the count admits. **Two strips explaining one glyph have to agree about which
glyph they mean.**

⚠️ **`depth-cell.tsx` is ONE component behind both row kinds**, extracted
because the word has to appear on every windowed number in this list or on none
of them. It was briefly exported from `station-list.tsx`, which made
`sensor-row.tsx` import from the file that imports it — a real module cycle.

⚠️ **One request, not one per row.** `/api/depth-peaks/{kind}` groups the whole
reading table — **401 groups in 25.6 ms** over 442k rows. The obvious
implementation is one request per visible row, which at 425 sensors is 425
requests per change of window. **Do not turn the page size into a fetch size**
either.

⚠️ **A peak in a row takes no severity colour and never has**: the scale lives
in the row's pill and chips, and a peak is history.

### The list pages at 20 rows

`LIST_PAGE_SIZE` lives in `lib/instrument-query.ts` because two files need it.

- ⚠️ **The page is CLAMPED during render, never reset in an effect.** `ordered`
  shrinks whenever the reader types, and a stored index into a shrunken array
  renders an empty list under a pager reading `page 8 of 2`.
- ⚠️ **The page follows the selection in the SAME EVENT**, through `reveal`.
  The detail pager walks all of `ordered`, so stepping past row 20 would select
  something the list is not showing. Nothing drags the page afterwards, so
  manual paging is not fought by the next poll.
- **The counts are of `ordered`, not of the page.** Counting the slice would say
  `20` forever.

### The controls strip is FOUR lines, and the floor is three visible rows

Line 1 the **address block** in its own bordered box, so the one control that
leaves the browser is visibly a different kind of thing from the three local
controls under it; line 2 the search (a bare `<input>` — no shadcn `input`
exists and none may be added); line 3 four sort buttons; line 4 the filter chips.

⚠️ **The first sort button is LABELLED `depth` and its VALUE is `"worst"`**,
since 2026-08-15 on the owner's instruction — the fourth label/value split on
this page after `watch`→`monitor` and `gauges`→`tide + wx`, under the same rule.
`SortKey`, `DEFAULT_QUERY`, both comparators, the three origin-clearing patches
and `tests/instrument-query.test.ts` all read `"worst"`, so renaming the value
would touch the list's wiring to change a word. ⚠️ **`SORT_LABEL.worst` moved in
the same commit** to `deepest first` — a state line saying *worst first* under a
button saying `depth` is exactly the wrong-label-under-a-right-answer failure
that `Record` was built to stop, arriving through a rename rather than through a
missing case. **The two move together.**

⚠️ **The chip line gained a fifth sensor chip on 2026-08-15 — `tidal` — and it
did NOT cost a row.** That line is `overflow-x-auto`, so chips scroll sideways
rather than wrapping, and the strip is four lines whatever is in it. **That is
the property to check before adding another**, not the chip count: a chip added
to a wrapping row spends the one-row margin the depth bar left, and `web/CLAUDE.md`
records that the list is already down to four visible rows against a floor of
three.

⚠️ **`tidal` is the only chip here that narrows on what an instrument IS**
rather than on what it is reporting, which is why it sits with `watched` and
`reporting` inside the sensors-only branch. Its `title` says what the flag
means and nothing about conditions — *"sees coastal surge"* is a fact about the
instrument; anything about tides running high would be a filter control making
a claim about water.

⚠️ **The measured floor is at least three visible rows**, below which the list
reads as a stub that failed to load. Every row the strip adds comes out of the
scroll region. Measured at 1440×900 with 425 sensors, strip open: list panel
820px, scroll region 294–330px, row 41.8px, **7 fully visible rows**.

⚠️ **390px was overflowing before anyone measured it.** Below `xl` the columns
stack and `StationList` took a fixed `h-[320px]`; the panel's own chrome came to
**471px**, so `flex-1` resolved to **0** and the list showed **no rows at all**.
It is `h-[75dvh]` below `xl` now — 633px at 844 — leaving 3 fully visible rows.
`dvh` rather than `vh` for a phone's collapsing address bar.

⚠️ **`ActiveFilterLine` renders whether the strip is open or closed.** The strip
shows the *controls* and the line shows the *commitments*, and with the origin
chip living there it is the one statement of reader-set state that never moves.
It renders the origin chip **outside the `queryIsActive` gate**.

### ❌ ⚠️ The geocoder disclosure is four words

It read *"Looked up in this browser by NYC Planning Labs' geocoder. Fluud
never receives the address and never stores it."* and now reads **"Look up in
geocoder."** — which names the third party and states no privacy property. It
still renders under every mount of the field (`address-lookup.tsx`, no off
switch); the claim it carried renders **nowhere**. ⚠️ **The landing page's field
said nothing at all and that field is now deleted**, so `/map`'s two mounts are
the only address inputs on the site and four words are the whole disclosure.
`/terms` §05 and LIMITATIONS §16 still state it in full. **If it comes back, it
comes back under the field, as text.**

## ⚠️ The rail is TABBED at `xl` — `rail-tabs.tsx`

Imported from the design system's `1c`, 2026-08-15. The rail held four stacked
panels in a scrolling column. **It still does below `xl`**; at `xl` and up a tab
bar picks which one fills the track.

**What it is for is the NOTICES strip.** That strip moved to the foot of the
scrolling rail on 2026-08-14, which put the frozen-poller rule's backstop below
the fold — a cost `message-strip.tsx` records rather than solves. A tab is not
below the fold: the count sits in the bar whatever the reader is looking at, and
the strip is one press away.

⚠️ **It does not retire `NoticeBadge`.** The bar is `max-xl:hidden`, so below
`xl` there are no tabs and the masthead is still the only always-visible fault
signal. The badge also carries the worst fault's own **title**; this carries a
**count**, which `site-header.tsx` argues at length is the weaker thing.

### ⚠️ The `watch` tab is LABELLED `monitor`, and the value stays `"watch"`

Owner's instruction, 2026-08-15. `RAIL_TAB_LABELS` is the indirection, and the
split is the same call `watch-panel.tsx` already made for its third step, which
is labelled `email` while its `Mode` value stays `"address"`.

- ⚠️ **The value drives control flow.** `RailTab`, `pane()`, `setRailTab` and
  every comparison in `map/page.tsx` read it, so renaming it would touch the
  rail's wiring to change a word.
- ⚠️ **The mobile bar's button moved in the same commit.** Below `xl` there are
  no tabs and that button is the only door to the panel; above `xl` there are
  both. **Two doors to one panel carry one word**, or a reader who has met one
  reads the other as a second feature.
- ⚠️ **It also matches `Start Monitor` on the sensor face**, which is the
  control that puts a sensor *in* the set this panel manages. That button's
  string, `watch-panel.tsx`'s empty-pick copy which names it verbatim, and this
  label are now **one set that moves together**.
- ⚠️ **The wire is untouched and stays untouched.** `/api/watch/*`, the
  `?watch=` manage parameter, `watch_note`, `min_level: "watch"` and the WATCH
  escalation level are all unchanged. **`watch` as an alert LEVEL is a different
  noun** and must not be renamed to follow this one.

Four rules hold it together:

- ⚠️ **ONE TREE. The four panels are rendered exactly once** and CSS decides
  which are painted — the same constraint the sheet layout below `md` already
  runs on, for the same reason. A second mount is a second place for every rule
  in those four components to drift.
- ⚠️ **Every slot class is `xl:`-prefixed**, so below the breakpoint `pane()`
  contributes nothing and the stacked rail is the layout it was before. The
  watch panel's `max-md:` sheet classes and its `xl:` slot classes never meet:
  `watchOpen` owns the sheet, `railTab` owns the desktop slot.
- ⚠️ **`xl:h-auto` on the active slot is load-bearing.** Two of these panels
  carry `h-full` on their own roots, which resolves against the whole column and
  would run them through the tab bar above.
- ⚠️ **Every selection forces the tab back to `instrument`**, and a gauge
  diamond forces it to `gauges`. Pressing a row, a marker or the pager has to
  visibly do something *from where it was pressed*; a reader sitting on another
  tab who clicks a marker and sees nothing move has been told the map is broken.
  Same rule as `reveal` for the list's paging.

⚠️ **A hidden tab is `display: none`, NOT unmounted, so its hooks keep
running.** `HarborBaseline` fetches `/api/gauge-history` itself every 60s and
goes on doing it while the gauges tab is shut. **That is unchanged from the
stacked rail** — all four were always mounted — and it is written down because
the opposite is the natural assumption: tabs look like they unmount, and someone
reasoning that way would either expect a fetch to stop or "fix" the cost by
gating the mount. **Gating it would be the regression**, on `RequireSession`'s
rule one container over: unmounting on tab change throws away the panel's state
and re-fetches on every press.

⚠️ **The tabs are `aria-pressed` buttons and NOT `role="tab"`.** The bar exists
at one viewport width and not another, and there is no way to say that in ARIA —
`role="tabpanel"` on four panels that are plainly stacked below `xl` would be
describing a widget that is not there. It follows `ModeButton` below, which is
the same shape for the same reason.

⚠️ **The notices count is of what is NOT dismissed.** `MessageStrip` returns
null once every row is dismissed, so counting every message would sit at `3`
over an empty panel. When it reaches zero the tab renders a line saying so —
**a statement about Fluud, never about conditions** — with the same `show all`
that un-dismisses. An empty panel under a tab somebody just pressed is
indistinguishable from one that failed to load.

⚠️ **256px is a FLOOR for the gauges slot and never a ceiling.** It is the
two-up card height at which neither face has to scroll, so the tabbed slot may
give it the whole rail and may never give it less.

⚠️ **The tab and the panel's own `PanelTitle` both say the word on two of the
four.** Known and left: the header is still carrying the pager and the band
pill, and suppressing just the title means a prop through four components with
heavy measured invariants.

## The rows — `sensor-row.tsx`

⚠️ **No `ReadingAge`.** It subscribes to `useNow(1000)`, so 425 rows would be
425 leaf re-renders every second for data that changes once a minute. Rows take
the list's existing `useNow(15_000)` as a prop.

⚠️ **The over-threshold chip is `--wl-cyan`** — one of two recorded exceptions
to the poster-paint rule, so the fault chip (amber) and this differ by hue as
well as by word. The colour does not vary with the reading.

### ⚠️ Both rows gained a DEPTH BAR, and it cost three visible rows

`depth-bar.tsx`, 2026-08-15, from the design system's `1c` / `2a`. Both row kinds
became flex **columns**: the name/depth line is unchanged and the bar is a second
line under it at full width, because it is a scale and a scale in a 52px gutter
is a smear. **Shared between the two lists on `DepthCell`'s rule** — a bar on the
camera list and not the sensor list would read as the two measuring different
things.

⚠️ **A coloured bar that varies with the reading is legal here because it is ON
the scale**, the same two borrowed thresholds the pill uses, with the
flood-event tick drawn on the track so the scale states itself. It is the
exemption rather than a hole in the rule. It is `aria-hidden` and **never the
sole carrier**: every number it draws is printed in `DepthCell` beside it.

⚠️ **Four states take no fill and three of them are not about the water** — a
fault (a fault is not a depth), no value at all, and stale/dead, which take the
staleness colours and leave the band exactly as the pill and the markers do.
**Verified in a browser at five minutes stale**: amber bar, note `NOT A CURRENT
READING`. A bar left in a band colour there would have been the worst version of
this change.

⚠️ **A peak takes no band colour**, which is the one place this diverges from the
design. The design draws windowed rows banded; this app's rule is that a peak is
history and the scale is about now, so the fill goes neutral and the phrase still
names the arithmetic. The staleness branches are skipped in windowed mode too, on
`DepthReadout`'s rule.

⚠️ **`curbNote` can hide the CURB COMPARISON and nothing else**, added
2026-08-15 for designs that pair the bar with a `DepthBandPill` — no caller in
this app sets it, and the default is on. **It may never be widened past the two
curb phrases.** The four states that are not about the water — the fault, the
absence, dead and stale — print whatever it is set to, because a pill states a
band and does not state that the instrument is broken, that nobody looked, or
that what is drawn is an hour old. **An empty track under a suppressed fault
reads as calm.** With no note at all the `<span>` is dropped rather than rendered
empty, so the `gap-2` does not open a hole that reads as a phrase failing to
load.

⚠️ **The row-count table moved and it is in `MEASUREMENTS.md`.** At 1440×900 with
the controls strip open it is **4 fully visible rows, down from 7**; at 390×844 it
is **4**. The floor is three. **Anything further added to a row re-runs that
table** — the margin is one row.

### ⚠️ The row grew a MONITOR RING on 2026-08-15, and it is outside the row

From `Estuary-Dashboard-2A`. The `<li>` is a flex row now: the existing row
button, and a 28px ring on a rail beside it. **It cannot go inside** — the row is
itself one button and a button may not nest another — so the `<li>` draws the
divider and it spans both children, and the rail repeats the row's
`bg-[var(--wl-select)]/12` selection wash rather than layering a second one over
it.

- ⚠️ **WITHHELD, never disabled, on `!alert_permitted`.** FloodNet can turn
  alerting off for a deployment and the server refuses to subscribe to one.
  **Offering a control the server would refuse reads as a promise** — the same
  call `selected-detail.tsx` already makes for `Start Monitor`, and the reason
  there is no greyed ring. `alert_permitted` is already on the `sensor` prop, so
  this costs no fetch.
- ⚠️ **The row still says nothing on that branch.** The refusal copy is on the
  detail face, below the reading. 42px has room for one fact — see the paragraph
  below, which this change did not soften.
- ⚠️ **`watchFull` exists because `toggleWatching` SILENTLY no-ops at the cap.**
  That was invisible while the only doors were a button and a panel; on a row it
  is a control that does nothing when pressed. At the cap an unwatched ring is
  `disabled` and its label says why. **A press that does nothing reads as
  broken.**
- **Hollow `--border` off, filled `--wl-select` on.** Neither varies with the
  reading; both are facts about the reader. Never green.
- ⚠️ **It costs the list ~38px of a 312px track and the row-count table has to
  be re-run.** `web/CLAUDE.md` records the list already at four fully visible
  rows against a floor of three, and a 296px row wrapped `27s ago` onto two
  lines once. **This is the measurement this change owes.**

⚠️ **This row has survived two rounds of repair unchanged, and that is why the
silence on the negative branch is deliberate.** Every other surface making a
claim about a pairing has been wrong at least once. This one names the pairing
when there is one and says nothing when there is not, so neither error had
anywhere to land. **Do not "complete" it with a negative clause** — 42px has
room for one fact.

## Selection, and the pager

`page.tsx` holds one **`Pick = {kind: "camera" | "sensor"; id: string}`**.

⚠️ **A tagged union rather than a bare id**, because the two classes' ids come
from different namespaces. A plain `string` would work right up until the day
the two collide.

**`ordered` is derived in `page.tsx`, not passed up out of the list**, because
three surfaces need the same array: the list renders it, the pager indexes into
it, the map de-emphasises what is not in it. A pager walking a different order
from the one on screen looks like the selection jumping at random. **Derived
during render, never synced in an effect.**

⚠️ **Both comparators tier the same way**, over the paired sensor's depth for
cameras and its own for sensors: plausible first and deeper first within that,
faults grouped after while keeping their digits, no reading at all last.
**Sorting a fault to the bottom is a claim about the instrument; deleting it
would be a claim about the street.**

⚠️ **`compareCameras` would be VACUOUS on age alone.** `poll.tick` stamps every
camera in a tick with one `now`, so every row carries the same timestamp and an
age-only sort ranks nothing while still appearing to work. The depth tier is
required, not optional, and `tests/instrument-query.test.ts` asserts exactly
that.

**Auto-select is a fallback, not a subscription.** Derived during render:
`picked` if that instrument is still in the payload, otherwise the deepest. Two
things fall out of deriving rather than syncing: the page opens on the worst and
then **stays where the reader put it**, and a selected instrument vanishing from
the payload falls back to the same rule instead of rendering an empty panel.

**The `‹ ›` pager** is the other half of the clickable markers, not a
convenience on top of them. The index is **derived, never stored** — a stored
index into a live array points past the end the moment a poll changes the
payload. **No wrapping**: on a worst-first sort, wrapping teleports from the
worst instrument to the best. A filtered-out pick says `not in filter` rather
than lying about a position.

⚠️ **`Chip` and `Group` are exported, not duplicated.** `Chip` carries a rule
that must not fork — it is `--wl-select` when on, because selection is a fact
about what the reader asked for and never about the water.

## The sheet layout below `md`

⚠️ **It is ONE TREE positioned by CSS, and nothing renders twice.** That
constraint was not stylistic when the warning existed — a second mobile tree
would be two things competing to interrupt a screen reader — and it stays,
because two trees is two places for every rule below to drift.

The grid children take `max-md:order-*`: the sticky search bar
(`top-[49px]`, the masthead's height — ⚠️ derived rather than measured since
the paint rule came off), the map filling the first
screen, the list as a sticky bottom sheet at `55dvh`, then the rail.

**The filters strip and the watch panel present as fixed bottom sheets** with a
backdrop that closes on press. `controlsOpen` was **lifted to `page.tsx`** for
this — two controls open the same strip and a boolean owned by `StationList`
would leave the second pressing a door with no handle. The watch panel is
`max-md:hidden` when shut — `display: none` is out of the accessibility tree and
the tab order entirely, which is `inert`'s stronger cousin.

**Measured at 390×844**: bar 50px, map 764px, list sheet 464px with **5 fully
visible rows**, zero horizontal overflow.

## ⚠️ `nws-alerts.tsx` — somebody else's warnings, in a reserved box

Added 2026-08-15, above the gauge grid on the `tide + wx` tab. **The only
surface on this site that renders another agency's warnings**, and almost all of
it is restraint.

### ⚠️ The empty state is the dangerous one, and it is the common one

Most readers, most days, find nothing here. *"No alerts"* printed above five
water-level gauges reads as **all clear**, which this site does not say. NWS
products are county- and zone-scale, issued off radar rainfall rate; FloodNet
measures standing water at specific corners. **The two disagreeing is ordinary**
— `poll.validate` has said so in prose since long before this panel existed.

⚠️ **The copy is NOT in this component.** It is `lib/nws.ts`, pure, and
`tests/nws.test.ts` sweeps the entire generated set — every state × every count
× every age — for the sentence this page may not write. That is the never-safe
rule's newest enforcement point and the only one that is a *test* rather than a
review property. **This file does emphasis and layout.**

### ⚠️ An empty list has FOUR meanings and two of them are *we do not know*

```
cold         nothing read yet in this process
unreachable  the last attempt failed — what is shown is older
stale        reads succeeded but stopped arriving (the poll loop)
current      we asked, recently, and NWS listed nothing here
```

**Only `current` may say nothing is active.** Collapsing any other into it
renders *we could not ask* as *nothing is happening*, during exactly the weather
that breaks the feed. The precedence — cold > unreachable > stale — is asserted:
with nothing ever read, "the feed is down" overstates what we know.

⚠️ **When alerts ARE present and the feed is not current, the condition line
renders ABOVE them rather than instead of them.** The last thing NWS said is
still the best thing on screen; what changes is whether the page vouches for it
being current.

⚠️ **`cold` is deliberately NOT a fault colour.** A cold start is the ordinary
first seconds of the page, and painting it amber makes the indicator fire on
every load — `gaugeFreshnessOf`'s lesson, one panel over.

### ⚠️ NO severity ramp, in any colour

NWS's severity vocabulary — *extreme · severe · moderate · minor* — and this
app's depth band use several of the same words for different quantities. A red
row here beside an amber depth pill invites reading one against the other, and
they share no scale whatever. **The event name is the whole of the claim**, and
severity renders as an attributed word: `NWS severity · severe`, muted.

Ordering *by* NWS's rank is fine and happens server-side — **that is their
published scale, not one this app invented over somebody else's hazards.**

⚠️ **The only colour this block may spend is `--wl-stale` / `--wl-dead` on the
feed-condition line**, the fault-signal exception `NoticeBadge` already spends.
A fault here is about the service, never about the water. **No new colour token
was added**, which also keeps the three palettes' safety-colour audit unchanged.

⚠️ **The count readout is never a bare `0`.** A zero beside `NWS` is a number
where the reader expects a measurement, and this block sits directly above five
real ones. `none listed` is about a list; `0` reads as a quantity of hazard.

### The height is a CONSTANT — `h-[112px]`, every breakpoint

`message-strip.tsx`'s idiom and its smaller literal. **Zero alerts or eight is
the same box**, verified: `gridTop` identical to the tenth of a pixel across all
eight forced states at three widths. A `min-h` or an `h-auto` re-creates an
unbounded push, and here that push moves the gauge grid under a reader's hand as
an alert arrives on a 15s poll — the worst possible moment for the page to move.

⚠️ **It does NOT return null when empty**, the one place it diverges from
`MessageStrip`, `AlertList` and `HarborBaseline`. Those three are about Fluud's
own state, where absence reads fairly as nothing to say. This is about a feed a
reader came to check: an empty space where the weather should be is
indistinguishable from a panel that failed to load, and *we looked and NWS listed
nothing* is a real answer that has to be given **in words**. Reserving the box is
what makes saying it possible.

### ⚠️ The scope is narrowed and the narrowing is admitted

The request is statewide because that feeds the second witness; this panel shows
the five boroughs. **What falls outside is counted, never dropped** —
`NwsStatus.elsewhere`, spoken in the copy. A scope narrowed silently is a scope a
reader cannot audit, and it is also the difference between a quiet day and a
storm that happens to miss this city.

⚠️ **`area=NY` returns alerts that merely TOUCH New York** — a live sample also
covered Connecticut and Massachusetts zones — so the copy says *the statewide
feed*, never *in New York State*.

⚠️ **`selected-detail.tsx` reads a different thing and was reworded in the same
commit.** Its clause was *"NWS weather alert active for this area"* over a
statewide flood/rain boolean; it now says *"an NWS flood or rain alert is active
in New York State"*. **Two surfaces reading different things must not be worded
as though they read the same thing.**

## The harbor baseline

Five gauges: NOAA CO-OPS at The Battery, four USGS stream gauges. It answers a
question the page could not otherwise answer — 40 mm on a street means something
different depending on whether the harbor is high or a storm is draining — and
its whole risk is being read as more local than it is.

**One card per gauge, each with a trace on the front and a datum on the back.**
It was five rows, and rows made five gauges look like five points on one list —
the exact reading the datum caveat spends a paragraph undoing.

❌ ⚠️ **Two-up and its pager are GONE as of 2026-08-15. All five cards are on a
grid and it still does not scroll.** Two-up existed because the stacked rail gave
this panel a 256px slot, where five cards was a scroll window showing one and a
half — a panel that reads as failed to load. Tabbing the rail gave it the whole
776px track, so the window, its clamp, the map-selection override and both arrows
all went: **with every card on screen there is nothing to page to**, and a
diamond press now flips a card that is already visible. `step-button.tsx` keeps
its `selected-detail.tsx` caller and is not orphaned.

**The grid is `grid-cols-2` with rows `0.8fr / 1fr / 1fr`, and the tide gauge
spans both columns on the short first row.**

⚠️ **The wide cell is keyed on POSITION, never on a reading.** The server sorts
NOAA first, so the spanning card is the tide gauge — one tide gauge above four
creeks, which is what this set actually is. It says *which instrument this is*,
exactly as the diamond shape does on the map. **It may never be keyed on
`level_ft`, on `minor_flood_ft`, or on being above threshold**: card size would
become a severity ramp, and the never-compare rule would be broken by geometry
instead of by colour.

⚠️ **The short row is FIRST and that is measured, not chosen.** A card back's
height is set by how many lines its closing paragraph wraps to, so the wide card
at 350px needs **154px** while each 170px creek card needs **197px** — the wide
row is the cheapest, which is the opposite of what the arithmetic predicted.
Short row last measured 162.6 against a 197 need and scrolled both bottom backs
by 35px. Margins are now ~6–8px. **Anything added to a card back spends them, and
the check is turning every card over at 1440×900.**

⚠️ **`GRID_MAX = 5` mirrors `gauges.GAUGES` and is a capacity, not a policy.** A
sixth gauge upstream does not vanish — the panel counts what it could not place,
on the map's idiom for what its marks withhold.

⚠️ **There is deliberately no auto-select fallback**, unlike `picked` for
cameras. Nothing among five gauges on five datums is "worst", so opening on one
would be the page quietly asserting a ranking every card back explicitly
refuses.

### ❌ Three removals here

- **The footer is gone.** It was the only place stating the regional claim and
  the no-comparison rule **without a press**. What still carries them: every
  card back, which opens *"Not comparable to the other gauges."* and ends *"not
  a reading for any block"*; the per-marker tooltip; and the fact that no code
  path ranks, sums or shares an axis. **If it goes back, it goes back in a
  footer under the cards.**
- **The card front was pared back** to name, age, level, trace and endpoints.
  The real cost is *"no published flood stage"* on the four creeks: a reader who
  never turns a creek card over sees a number with no stated frame of reference.
  **Nothing was borrowed to fill the gap and nothing may be.**
- **The card BACK was shortened.** ⚠️ **The two claims that may not be shortened
  away both survive verbatim** — it still opens *"Not comparable to the other
  gauges."* and still closes *"not a reading for any block"*.

**What may never leave that face**: the age, the at-or-above-threshold line, and
the sparkline's printed endpoints.

⚠️ **Nothing here is ever green.** The **level** is muted at rest and takes
colour only when a gauge crosses its own threshold or stops reporting.

⚠️ **The trace is an exception to "muted", never to "never green".** It rests in
`--wl-graph` magenta, and what makes that safe is not that magenta is quiet — it
is that **the colour does not vary with the reading**, so a mark whose hue is
constant across every level a gauge can report cannot encode one.

### ⚠️ The gauge sparkline autoscales, and the depth sparkline refuses to

Both are right, and the difference is the whole reason `gauge-sparkline.tsx`
exists instead of a shared component with a flag.

A **depth** is measured from the road surface: it has a true zero, and a fixed
floor is what stops 2 mm of puddle filling the box. A **gauge level has no true
zero** — it is feet above a datum chosen for surveying convenience. Anchoring at
zero renders a six-foot tidal swing as a flat line near the top of the box.

So it scales to its own data — and pays for that with **the endpoints printed
underneath**. That caption is the compensating control for the missing floor.
Without it the shape implies a magnitude it does not have, and a creek moving
four hundredths of a foot draws the same dramatic curve as the harbor moving
three feet. **If you restyle this, the numbers survive.**

Two refusals inherited from `depth-sparkline.tsx`: **fewer than two points draws
nothing** (one dot in an empty box invites reading a slope that isn't there),
and **a gap in the data is a gap in the line** — break, don't interpolate, with
the threshold taken from the data rather than the network's documented cadence,
because the two disagree exactly when the poller has missed a beat.

**The flood-stage line is drawn only when it falls inside the window.** A
Battery threshold of 6.90 ft against a window spanning 1.34–4.92 would flatten
the trace into the bottom eighth of the box to include a line the water is
nowhere near.

## Cards with backs — `flip-card.tsx`

Three things in it are load-bearing and none is visual:

- ⚠️ **Both faces are stacked in one grid cell (`[grid-area:1/1]`), not
  absolutely positioned.** That makes the card as tall as the *taller* face, so
  neither can be clipped. The obvious implementation sizes the card to the front
  alone, and a back one line longer then overflows.
- ⚠️ **That cell is `minmax(0,1fr)` on *both* axes, and the zeros are the
  point.** Left implicit, the single row and column are auto-sized to content —
  right for a card, wrong the moment a face is inside a box with a definite
  size, because an auto track keeps growing and the face's `h-full` resolves
  against an indefinite track, so its own `overflow-y-auto` never engages. Both
  failures are silent: measured at 1440×900, a 335px slot rendering a 464px
  panel that *overlapped* the panel below it.
- ⚠️ **The hidden face is `inert`, not merely rotated away.**
  `backface-visibility: hidden` is a paint rule; it does not remove the face
  from the tab order or the accessibility tree. (Playwright's ARIA snapshot does
  *not* filter inert subtrees — check the attribute, not the snapshot.)

⚠️ **ONE surface uses this now — a gauge card.** The selected-instrument panel
turned over too until 2026-08-14, and both its rules are recorded because they
are the ones a second flipping surface would get wrong again:

- **It did NOT use `FlipTrigger`.** Cards can afford an absolutely-positioned
  button across the whole face because nothing on a card scrolls. That panel's
  body does, and an overlay button is a *sibling* of the scroll container —
  wheel events over it would find no scrollable ancestor and the panel would
  silently stop scrolling. The accessible control was a real `rats ›` button
  carrying `aria-expanded`, with a panel-wide `onClick` as convenience. Both set
  state to a **value** rather than toggling, so the button's click bubbling to
  the panel was idempotent.
- **Its flip state was keyed on the camera id and reset when selection changed**,
  derived during render: leaving it turned over would answer a question about
  instrument A with a wall about instrument B's neighbourhood.

⚠️ **`flip-card.tsx` stays a shared component on one caller**, because what it
holds is not layout — it is the accessibility tree and the reduced-motion
behaviour, which is exactly what a second surface re-implements badly.

## ❌ ⚠️ The neighbourhood tag — `neighborhood-back.tsx` — is DELETED

Removed 2026-08-14 with the rename to Fluud, and it is a feature deletion rather
than an unmount: the component, the DOHMH aggregate (`waterline/rodent_nta.py`),
its generator (`scripts/rodent.py`), the three wire fields
(`rodent_activity_rate`, `rodent_inspections`, `rodent_as_of`) and the
selected-instrument panel's flip all went together.

It rendered DOHMH rat-inspection rates for a camera's NTA — *"N% of M
inspections found rat activity"* over a `DOHMH · <date>` line, beside a
technicolour graffiti rat. **It was the only number on the page that was not
about water.**

⚠️ **The NTA display NAME survived and is a different thing.** It is geography,
not rat data: `api._nta_name` resolves it from `waterline/nta.py`, the sensor
face renders a `neighbourhood` row, and `instrument-query.ts` matches the search
box against it so a reader can type a neighbourhood and find its instruments.
Coverage went **up** as a result, 213 NTAs to 262 — see `scripts/nta.py`.

### Four rules died with it, and three of them generalise

Keep these; they bind the *shape*, not the file.

1. ✅ **A non-water number carries its denominator and its date, on the face that
   renders it.** Below 30 inspections the rate was suppressed and the face read
   `UNRATED` with the count. **If any figure that is not a depth ever returns to
   this UI, this is the rule it arrives under** — not in a tooltip, not in a
   disclosure.
2. ✅ **No colour, no pill, no scale, no map layer, on that number.** ⚠️ **It was
   never tinted by rate**, and nothing like it may be.
3. ✅ **Its collection bias is stated where it is shown.** Inspection routing is
   partly complaint-driven, so a neighbourhood the city inspects hard looks
   ratty and one it ignores looks clean. That claim had already been removed from
   the face before the feature was, and the debt is now settled by deletion
   rather than by repayment.
4. ❌ **"Not a flood measurement"** — retired outright. There is no non-flood
   measurement left to disclaim.

### ⚠️ Two techniques worth not re-deriving

- **`ratFor` was a hash, never `Math.random()`.** That component re-rendered on
  every 15s poll, so a draw re-rolled each time and the image changed while
  somebody was looking at it. The avalanche step at the end of the FNV-1a was
  load-bearing: bare, the low bits are weakly mixed and UUIDs share most of their
  structure, so `% 6` clumped — measured `[6, 4, 1, 2, 8, 6]` over 27 cameras,
  which reads as a broken shuffle, against `[4, 4, 7, 4, 3, 5]` with the
  finisher. **`agent.variant_index` is the same construction and is now the only
  one left in the repo.**
- **`SprayDefs` renders once per document**, because an SVG filter id is
  document-scoped. `spray.tsx` still holds this and every route that renders a
  wordmark mounts it. The displacement noise has to be **fine** — a low frequency
  warps a glyph into a wobble that reads as a rendering fault — and the grime was
  `turbulence` + `mix-blend-screen` rather than `fractalNoise` + `overlay`,
  because on a dark card overlay multiplies mid-grey noise back into the black.

## The watch panel — `watch-panel.tsx`, `watch-manage.tsx`, `watch-parts.tsx`

⚠️ **One component until 2026-08-16, three now, and the split was a bug fix.**
`watch-panel.tsx` is a **four**-face wizard — `pick → alerts → address → sent` —
with a four-step line in the chrome bar. **`manage` is `watch-manage.tsx`**,
mounted by `src/app/watch/page.tsx`. `watch-parts.tsx` holds what both render.

⚠️ **Why `manage` moved:** its links pointed at `/map/`, which is gated, so no
subscriber without a Fluud account could ever reach it — see the first decision
in the list below. ⚠️ **Why it was DELETED here rather than left dormant:**
`setMode("manage")` had exactly one call site, inside the URL-token effect, and
with the links repointed nothing could put the panel into that state again. Two
copies of one surface with only one reachable is what `step-button.tsx`'s
precedent refuses.

⚠️ **`watch-parts.tsx` is a THIRD module, not an export from the panel.** If
`watch-manage.tsx` imported `SettingsFields` from `watch-panel.tsx` and the panel
imported `ManageFace` back, that is the module cycle `station-list.tsx` /
`sensor-row.tsx` already hit when `DepthCell` was briefly exported from the list.
It also carries `DANGER`, a **name** for the delete button's class string, which
was the only one of the four idioms left inline.

⚠️ **`ManageFace` renders no `Panel` chrome and that is a rule.** `email_masked`
belongs in `PanelTools`, which only the caller can reach, and a `Panel` inside a
`Panel` breaks the equal-frames rule. ⚠️ **TWO callers since 2026-08-17** —
`/watch/` and `watch-panel.tsx`'s `have` face — **and both frame it and both
print `email_masked` in their own bar**, which is the rule holding rather than a
coincidence. ⚠️ **Its `addable` prop is optional and
absent means the add control does not render AT ALL** — withheld, never disabled,
on `sensor-row.tsx`'s rule that offering a control the server would refuse reads
as a promise. **The two callers differ on exactly this prop, and the difference
is the session**: `/watch/` withholds it because adding needs the gated
`/api/sensors`, and the panel supplies it because `/map` already has the
registry. The **existing** rows cost no request either way, because
`WatchSensorRef` carries `name` and `borough`.

⚠️ **`web/src/lib/watch-settings.ts` is the pure half** — `DEFAULT_SETTINGS`,
`overridesFor`, `quietHoursIncomplete` — and it is in `src/lib/` because that is
the only directory `web/tests/` may reach. `tests/watch-settings.test.ts` is the
first assertion this feature has ever had.

Two rules it follows that everything else here follows: it renders **no reading,
no depth, no age and no severity colour**, and its honesty line is
always-visible text above the submit rather than a `<details>` — the sentence
comes from the server (`agent._TEMPLATES["watch_note"]`), so it is the same
reviewed copy the confirmation email carries, **byte-identical and asserted**.

⚠️ **The `alerts` face's EMERGENCY sentence is load-bearing.** The server sends
an emergency whatever the settings say, and a face that implied one could be
muted would sell a silence this system refuses to sell. All of it is preference,
none of it is a reading — the trigger chips are `--wl-select` whatever level
word they carry.

⚠️ **The third step is LABELLED `email` while its `Mode` value stays
`"address"`.** The value drives `order`, `stateFor` and every `setMode`, so
renaming it would touch the wizard's control flow to change a word. On a site
where *"the address you searched"* means a **street** address, the shorter word
is the unambiguous one. **The `next · email` button names the step verbatim** —
a button naming a step that is not on the line is the same defect as an
instruction naming a button that is not on screen.

⚠️ **Cameras are GONE from this panel.** They were picks in a second namespace
with a combined cap; the camera watch is dormant and both write routes refuse
`camera_ids` with a 400. The manage face's `cameras` group is unmounted, so a
reader with old camera rows sees a sensors-only list — which is the honest
version, because nothing will be mailed about a camera.

**What each face is for:**

- **pick** states the alert-permitted rule *before* the server's 400: a pick
  FloodNet does not permit renders as a dashed amber chip and the submit reads
  `watch the other {n}`. **A failed submit keeps the server's `ApiError` message
  on a muted line** — the design's copy alone would swallow a 400 that names a
  real reason.

  ⚠️ **TWO recovery doors — `verify email` and `resend link`.** The single
  button they replaced read *"already subscribed? email me my link"*, which asks
  a first-time reader a question they cannot answer and offers them a link they
  do not have. **Both press the same action, and the forgiveness is the point**:
  the intent is a **label only** and deliberately does not reach the server, so
  a reader who picks the wrong door still gets the message they are owed.
  Sending the intent as a request field reads as more honest and is worse —
  a reader who guessed wrong gets silence, and silence is what this route exists
  to rescue somebody from. **Neither may be reworded into a promise about which
  email arrives.**

  ⚠️ **The two doors are their own `w-full` row**, measured rather than assumed:
  in one wrapping row of three the break landed *between* them, pairing one with
  the filled submit and orphaning the other.
### ⚠️ The WIZARD DOES NOT RUN for a reader who already has a watch (2026-08-17)

Owner's instruction. Two faces sit in front of `pick`, derived rather than
stored — `face`, not `mode`, is what the panel renders:

- **`checking`**, while `/api/watch/mine` is in flight. ⚠️ **The wizard is not
  painted first and then swapped.** A face replaced under a reader who had
  started reading it is the page moving on its own, and the wait is one round
  trip on a page that is already behind a session. It says which thing is
  happening, on `geosearch.ts`'s rule.
- **`have`**, when that address already has a confirmed watch. It mounts
  **`ManageFace`** — the same component `/watch/` mounts.

⚠️ **It was not a redundant flow. It was a flow that did NOTHING.**
`api.watch_subscribe` deliberately does not call `set_subscriptions` on the
existing-row branch, because that function is delete-then-insert and would
silently replace a list the panel cannot see. So a subscriber who walked pick →
alerts → email → submit again landed on a receipt whose own chips are labelled
`asked for` precisely because nothing had been stored. **The fix is to ask
first.**

⚠️ **`ManageFace` is MOUNTED, never re-drawn.** The reason `manage` was cut from
`watch-panel.tsx` on 2026-08-16 was two copies of one surface with only one
reachable; building a second manage face in this panel a day later would be that
exact mistake with the components the other way round. **The import runs one
way** — this file imports `ManageFace`, `watch-manage.tsx` may never import back,
and `watch-parts.tsx` is what stops the cycle.

⚠️ **`addable` is supplied HERE and withheld on `/watch/`, and the difference is
the session.** Adding an instrument needs the full registry from the gated
`/api/sensors`. So the one thing `/watch/` says in words it cannot do is exactly
what this face adds — which is what makes landing a subscriber here better than
landing them on step one. **Only `permittedPicks` are offered**, on
`sensor-row.tsx`'s rule: the PUT would refuse the rest with a 400.

⚠️ **`watch a second address` is the escape and it is not decoration.** Without
it this face is a dead end for anybody subscribing a second mailbox and the
wizard is unreachable for the whole session. It forces the typed field, because a
second address is by definition not the one this browser is signed in with. **Its
copy says what it opens** — *"a different address"* alone would read as switching
this watch to another mailbox, which no route here does.

⚠️ **NO STEP LINE on either face.** A four-step progress line over a face that is
not a step reads as a flow somebody is part-way through, which is the impression
this change exists to remove.

⚠️ **`watching: false` has three causes and all three run the wizard** — no
session (including `REQUIRE_AUTH=false`), an address the provider has not
verified, and a verified address with no confirmed row. **A failed fetch is a
fourth and it is also `false`**, never a fault banner: the wizard is the fallback
and it works, while an error here would be a claim about the instrument shown to
somebody whose watch simply could not be looked up.

### ⚠️ The confirmed receipt CLOSES the wizard, on a timer (2026-08-17)

Owner's instruction, and the other half of the same one: on the fast path the row
is created, the watch is live and there is no next step, so a terminal face left
up is the flow claiming an unfinished step it does not have.

- ⚠️ **The fourth step reads `✓ confirmed`, `done` rather than `current`.** Only
  where the **server** said `confirmed`; `pending` is the resting value, so every
  branch that has not heard it keeps the unfinished step. `confirm` is an
  instruction and `confirmed` is a fact.
- ⚠️ **`closeFlow` re-asks `/api/watch/mine` rather than returning to `pick`.**
  Landing a reader who has just subscribed back on step one of the flow they
  finished is the defect this whole change is about; what they get is the `have`
  face. It also drops `manageToken` — a bearer credential goes with the face that
  rendered it.
- ⚠️ **`sentFaceAutoCloses` is a function, not `status === "confirmed"`, and
  `mailDelivers === false` is why.** On that branch `sentFaceNote` says in words
  that the link on the face is the **only copy** the reader will get, and a timer
  that wiped it would destroy a non-expiring credential nothing can re-issue.
  `tests/watch-settings.test.ts` reads the two functions against each other so
  the copy and the timer cannot drift apart.
- ⚠️ **The PENDING face never closes itself.** It is not a receipt — it is the
  one surface telling somebody a confirmation link is on its way, and taking it
  away on a timer leaves a reader who looked up from their inbox with no
  statement of what they were waiting for.
- ⚠️ **`keep this open` is what makes the timer defensible**, not a courtesy.
  WCAG 2.2.1 wants a time limit turnable off, and this face holds a credential
  somebody may be part-way through copying. It cancels outright rather than
  extending — a second countdown after a cancel is the same interruption twice.
- ⚠️ **The countdown is NOT in a live region**, or a screen reader announces a
  new number every second over the receipt above it. And it is **muted, never
  `--wl-stale`**: this is the reader's own flow ending on schedule, and putting
  the deployment-fault vocabulary on an ordinary success is how that vocabulary
  stops meaning anything.
- ⚠️ **`onClose` closes the mobile SHEET and may never switch the rail tab.**
  Closing a sheet the reader opened is undoing their own action; moving them off
  a tab they chose, on a timer, with no press, is the page moving under them.
  Above `md` the panel is permanent chrome and the call is a no-op, which is why
  the face reset happens either way.

### ⚠️ The address face has TWO states as of 2026-08-16, and the input is the second one

A signed-in reader is shown their **account address**, read-only, with no input
at all. `/api/watch/subscribe` was never in `api._AUTH_EXEMPT`, so with the gate
on every subscriber was already a verified Neon Auth session — and this panel was
asking them to retype an address the app held and then mailing them a link to
prove they owned it. When the server agrees the address is theirs and their
provider has verified it, there is no confirmation step at all.

- ⚠️ **A `<p>`, never a disabled `<input>`.** A greyed-out field reads as a
  control that has failed rather than as a fact. Same border and ground as the
  input it replaces, so the face does not lurch between the two states.
- ⚠️ **`sessionEmail` decides what is DRAWN and nothing else.** The outcome is
  the server's, taken against an `email_verified` claim, and reported in
  `status`. **This component makes no claim that the address is verified and
  must not** — `SessionState` deliberately does not expose `emailVerified`; see
  `src/lib/CLAUDE.md` for why a client reading it would be worse than one that
  cannot. The prop is optional, so a design-system preview and a signed-out
  reader both get today's typed field unchanged.
- ⚠️ **This panel still imports NOTHING from `@/lib/auth-client`.**
  `map/page.tsx` does the `useSession()` read and passes a string down, which
  keeps the auth SDK out of this module's graph and keeps the panel mountable in
  `.design-sync/`.
- ⚠️ **`use a different address` is not decoration.** The wizard can subscribe
  *any* address, and double opt-in is the only thing between that and
  subscribing a stranger — so the typed door exists and lands on the unchanged
  flow, confirmation and all. **The pick face's two recovery doors force it
  too**, because a recovery errand is by definition about a mailbox that may not
  be the one this browser is signed in with.
- ⚠️ **The recovery button is WITHHELD while the session address is in use**, on
  `sensor-row.tsx`'s rule. A reader with a live session has no lost link to
  recover, and pressing it would mail them the credential the next press is about
  to hand them.

- **sent** replaces the form and freezes the address and picks at submit, so the
  face cannot drift while the reader keeps picking. ⚠️ **`status` and the manage
  token are frozen with them**, for the same reason.

  ⚠️ **FOUR strings since 2026-08-16, not two, and they live in
  `lib/watch-settings.ts`.** *"Check that address. Nothing is sent until you
  confirm"* is false for a reader who was subscribed outright — it sends them to
  watch a mailbox for a message that is not a step. The copy moved to `src/lib/`
  so `tests/watch-settings.test.ts` can sweep the grid for the sentences the
  `confirmed` branch may not contain, which is `nws.ts`'s argument arriving in
  this feature. The heading moves with it: `waiting on` is a claim that something
  is coming.

  ⚠️ **The `confirmed` branch also drops two controls.** `send it again` would
  mail a confirmed address the manage link it is already holding two lines down,
  so an `<a href>` built by `watchManageHref` replaces it — ⚠️ **an `<a>`, never
  a `router.push`, which would put a bearer credential in the history stack.**
  And `stop waiting` does not render: all four of its sentences are about an
  unconfirmed row, there is nothing to stop waiting for, and
  `db.prune_unconfirmed` cannot reach a confirmed address.

  ⚠️ **The panel cannot tell a NEW row from an EXISTING one and must not try.**
  The server answers both with the same shape on purpose — token-presence would
  otherwise be a *"was this address already here"* oracle — and it does **not**
  apply the picks to an existing subscription, because `set_subscriptions` is
  delete-then-insert. So the confirmed copy has to be true either way: it may say
  the watch is live and here is the link, and it may **not** say *"now watching
  these N"*. The frozen chips' label already reads `asked for`, which is exactly
  the right word — they say what was submitted, never what is stored, and
  `/watch/` is the authority for what is stored.

  ⚠️ **Its one paragraph is gated on the server being able to keep the promise
  in it.** *"Check that address…"* is a claim that mail is coming, and
  `MAIL_TRANSPORT=log` is the shipped default. So `mailDelivers === false` swaps
  it for *"No email was sent. This deployment has no mail transport configured.
  Your request is stored. The confirmation link cannot reach you."*

  ⚠️ **THREE surfaces carry this gate now, and two of them were forks.** This
  face had it since 2026-08-06; `resend()`'s success copy and `/watch/`'s
  confirm banner both made the same promise ungated until 2026-08-16, so
  pressing `verify email` on a fresh deployment said mail was on the way when it
  had gone to a log file. **A promise about delivery anywhere in this feature
  takes the gate**, and the two clauses that are true either way stay on both
  branches.

  ⚠️ **The gate gained a FOURTH reading later the same day, and it is the first
  one whose answer is neither branch's.** On the `confirmed` path the watch is
  live whether or not a transport exists, so `mailDelivers === false` cannot mean
  *nothing was sent, and your request is stuck* — what a missing transport costs
  there is the **durable copy of the settings link**, not the subscription. It is
  still gated, because that branch still mentions mail; it just says something
  else. **Do not collapse the four strings back to two.**

  ⚠️ **`=== false`, never `!`.** It is `undefined` before the first poll settles
  and on an older instance mid-deploy. **Absence is not a verdict** — printing
  *"nothing was sent"* on a healthy deployment would tell a reader to stop
  watching their inbox and lose them a real confirmation. ⚠️ **It reports
  CAPABILITY, never delivery.**

  ⚠️ **`stop waiting` is a PAGE state and the copy may not imply more.** The
  confirm token reaches the inbox and never this browser, so nothing here can
  withdraw the request and no route would take it. That rules out a bare
  `cancel`. Three sentences under the button row carry the residue: *"Stop
  waiting clears this panel. The confirmation link still works. An address that
  never confirms is deleted."* All three are true of the code. **The deletion
  window is deliberately not named**, because a number here would be a seventh
  figure duplicated across the two languages with nothing holding it.
- **manage** renders **rows, not chips**, which is what lets each
  `alert_permitted` / `silent` note sit under the row it is about instead of
  naming instruments in prose. `citywide_silence` stays panel-level — it is a
  statement about Fluud, not about a row. `stop and delete` opens an
  in-panel confirm box, and **the honesty line stays whole on it** — a shorter
  version would make the component the second author of reviewed copy.

⚠️ **The manage face carries the silence signal, and it replaced an email.** A
watched instrument quiet for over an hour used to queue a message; it is now one
`--wl-stale` line. Two branches, exclusive by construction because the server
forces every `silent` false when `citywide_silence` is true — half the registry
dark is our feed rather than their hardware, and naming a reader's corner then
would be a true-shaped sentence about the wrong subject.

**Know the trade rather than inheriting it: a page cannot reach somebody who is
not looking at it**, and this was the one signal in the feature whose whole
purpose was arriving uninvited. What it bought is that the notice cannot fan out
during a FloodNet outage (measured at **50 emails from one tick**), cannot go
stale, and needs no dedupe. **If it ever goes back to being an email, it goes
back with `citywide_silence` still gating it.**

Six more decisions:

- ❌ ⚠️ **"It adds no route, which sidesteps the `trailingSlash` trap" was the
  first decision here and it was WRONG.** The links pointed at
  `/map/?confirm=…` and `/map/?watch=…`; `/map` is wrapped in `RequireSession`,
  so a subscriber with no Fluud account was redirected to sign-in before this
  panel — and therefore the effect reading the token — ever mounted. **Every
  confirmation and every unsubscribe link in every email was unreachable in
  production**, which is exactly what `api._AUTH_EXEMPT` exempts
  `/api/watch/confirm` and `/api/watch/unsubscribe` to prevent. Fixed
  2026-08-16 by adding the route it avoided: `/watch/`, ungated. **Avoiding a
  route is not free when the page you land on is gated.**
- ✅ ⚠️ **Two rules from that decision SURVIVE it, in `watch/page.tsx`.** The URL
  is still read from `window.location.search` in an effect rather than through
  `useSearchParams` (which under `output: "export"` forces a Suspense boundary),
  and **the parameter is still stripped with `replaceState`**: a confirm token
  is single-use and a manage token is a bearer credential.
- ⚠️ **The URL read is one effect whose every `setState` is inside an async
  continuation.** The obvious two-effect version flashes an empty manage face
  before the subscription lands, so a bad link puts the reader on a surface that
  then fails underneath them.
- **This is the app's first `<form>`, and it is not a shadcn one.** A native
  `<form onSubmit>` with a bare `<input type="email" required>` buys
  Enter-to-submit and the browser's own validation for nothing.
- ⚠️ **The picked set lives in `page.tsx`, not in the panel**, because two
  surfaces need it. It is also **not persisted**: until an address is confirmed
  it is a draft, and storing it would be this page keeping a record of what
  somebody is interested in without their having asked for one.
- ⚠️ **The recovery submit shares the email field rather than growing a second
  one.** Two inputs asking for the same thing four lines apart is how a reader
  types their address into the wrong one. It is `type="button"` and second in
  the DOM so Enter in the field still means *watch these*.
- ⚠️ **Neither `subscribe` nor `resend` may say what happened.** Both answer
  identically whether or not the address is known, so *"we sent it"* is a claim
  this component cannot support — and making it conditional would leak exactly
  what the identical response exists to hide. The copy says what was **asked
  for**: *"If that address is on Fluud, the email it needs is on the way."*
  ⚠️ **Naming either outcome would tell the reader which state that address is
  in.** So it names neither.

`WATCH_MAX_SENSORS` is a constant in `map/page.tsx` mirroring the server's, and
it is **deliberately not on the wire**: `/api/status` exists to carry readings,
and a config knob there would be a field every open tab fetches every 15 seconds
to render one counter. The cost is a number in two places, so the panel's copy is
worded as a courtesy, the server refuses an over-long list with a 400 naming the
real limit, and `WatchSubscriptionResponse.max_sensors` carries the
authoritative figure on the one surface where being wrong would matter.

## The origin — an address, and the second third-party host

A reader types an address, it is geocoded **in the browser**, and the FloodNet
deployments are ordered by distance from it. Three files: `lib/geosearch.ts`,
`lib/geo/distance.ts`, `lib/instrument-query.ts`.

⚠️ **The address never reaches `api.py`.** Not in a body, a query string, a
header or a log line.

**Verified end to end through the real static mount:** exactly one request to
the geocoder per submit and **zero** same-origin requests carrying any part of
the address; typing eight characters without submitting fires **zero** geocoder
requests; `localStorage`, `sessionStorage` and cookies **empty** before and
after; a blocked geocoder renders the *unreachable* copy with the map, list,
pager and nav all still working and **no unhandled rejection**.

⚠️ **`[lon, lat]` is verified by construction rather than by reading the
destructure.** A Brooklyn address returns Brooklyn sensors; a transposition puts
NYC in the southern Indian Ocean, `inViewport` rejects every feature, and the
surface renders *no New York address matches* instead of a wrong answer.

### ⚠️ It orders. It filters nothing.

`queryIsActive` **deliberately excludes `origin`**, and this is the one thing in
the feature that is severe if got wrong. It gates `matchingSensorIds`, so
including the origin would drop 404 of 425 markers to 25% opacity the moment
somebody types an address — an address would make the city look empty.

But an origin is reader-set state and may never be invisible, so it gets its own
always-visible chip **outside** that gate. Both hold at once and neither is
optional.

### The placeholder has to be an address that resolves

⚠️ **Measured, and the first draft was wrong.** It said `234 Union St, Brooklyn`
and the geocoder returns **zero features** for it, so a reader who typed the
example verbatim got *"No New York address matches that"* as their first
experience of the feature. **Re-check it against the live endpoint if it is ever
changed.**

### No `Combobox`, no `Command`, and no AS-YOU-TYPE list

`AddressLookup` renders **the submitted lookup's candidates** as a list of
buttons. **The distinction is the request pattern, not the dropdown shape**:
what `geosearch.ts` refuses on privacy grounds is a debounce sending a growing
prefix of a home address six or eight times per lookup. The candidate list costs
**zero additional requests** — the endpoint already returned five and already
dropped out-of-viewport features; this renders what one submit brought back
instead of silently taking the first. Rows carry `properties.label` verbatim:
re-assembling an address from parts is forbidden.

### Colour: the crosshair takes `--wl-select` and the distance takes nothing

Two opposite calls, and they are consistent. `--wl-select` means *the reader
picked this*. An address **is** that; a computed nearest-rank is not.

The printed distance takes `text-muted-foreground` **at every distance,
forever**, and no other direction is available: reddening with distance is a
severity scale built out of coverage, greening as it shrinks is reassurance
beside a depth. **The far case takes no colour — it takes more words.**

## Drills were real, and the buttons proved it

⚠️ **`drill-controls.tsx` is unmounted with the rest of the alert UI.** Kept
because its two rules are exactly the sort that get reintroduced by a copy:

- ⚠️ **The outside-press listener is `pointerdown`, not `click`.** A document
  `click` listener fires *after* the trigger's own handler on the same gesture,
  so the menu reopens the instant the trigger closes it — the button appears not
  to work.
- ⚠️ **`clear` is deliberately not listed with the three escalations.** Beside
  watch / warning / emergency with a coloured dot, "Stand down" reads as the
  bottom of a scale, i.e. a claim about the street; below a rule and labelled
  **Cancel drill**, it reads as what it is, which is a claim about the
  rehearsal.

## The rat stills and loops — `rat-figure.tsx`

⚠️ **Unmounted with the warning, and this is the ONLY rat left in the repo.**
Everything below is the **alert** rat. The graffiti rats it had to be kept apart
from were deleted on 2026-08-14 with the card backs that carried them, so there
is no longer a pair to confuse — but the separation rule comes back the moment
any decorative rat does.

⚠️ **This whole section describes a dormant layer.** Nothing renders it, and
re-wiring the on-page warning is the decision point at which any of it becomes
live again — including whether a shrinking character belongs beside warning copy
that no longer has one.

Two sets, both baked, both committed: **stills** (`rat-{level}.webp`, 37KB the
set) and **loops** (`rat-{level}-loop.webp`, 760KB). Both are exhaustive
`Record<Level, string>`.

⚠️ **The still is switched off once the loop is running.** The two images are
the same animal in the same frame, so a still left lit under a cycle that has
walked away from it composites as a second, motionless rat. State is the *level*
that loaded rather than a boolean, so a load belonging to the previous loop can
never hide the current one's still.

⚠️ **`onLoad` alone does not catch this, and the cached case is the common
one.** An image served from cache finishes before React attaches the handler, so
the event never arrives. Measured: it reproduced on the very first reload.
`complete` in a ref callback is the only way to observe it.

**Why baked and not a model.** `c3bd80a` deleted a Live2D rat that pulled three
CDN scripts into a PIXI WebGL canvas. Rendering offline gives all of that back —
no third-party origin, no WebGL, no StrictMode hazard, and a page that still
draws when the venue's wifi does not. **Adding motion did not re-open any of
it**, because motion arrived as more frames in a file rather than as a renderer.
Keep that distinction.

**The character ramp is enforced in pixels, and it is the enforcement the copy
cannot soften.** The key light falls from 18W to nothing while the rim climbs
from 60W to 235W; the catchlight is gone by WARNING; the pose walks from a
settled idle with its back turned to a full gallop with no face. **The tempo is
the third enforcement** — 24 frames @ 12fps at `clear` to 16 @ 30fps at
`emergency`. ⚠️ **The pacing lives in the WebP's own frame durations, not in a
CSS animation**: a `steps()` timing function makes "soften the EMERGENCY rat" a
one-line change by someone who has never read this file.

One honest caveat: `watch` *looks* brighter than `clear`, because at −60° more
of its lit side faces camera. The monotonic property is in the numbers, not in
apparent brightness. **Check the columns, not the renders.**

Counter-intuitively the rat gets *bigger* as it escalates (`fill` 0.70 → 0.94):
`fill` measures the longest on-screen axis and a galloping rat is nose-to-tail
twice a sitting one, so equal `fill` renders the run frames at half the body
mass — a first pass produced a 33px speck at EMERGENCY.

`clear` is the frame to be careful with. It must read *indifferent*, not
friendly — turned away, not looking up, cool rim rather than golden. `clear`
means "no instrument has reported water", and the rat must never upgrade that to
"safe".

#### ⚠️ The loops are stacked differently, and both differences are load-bearing

**One loop, not four.** Four stacked animated WebPs would all decode
continuously even at `opacity: 0` — the browser does not stop animating an image
it is still compositing. That is four rats' worth of battery to show one, on a
phone, during a flood. It is keyed on the level so React swaps the element
instead of mutating a playing animation's `src`.

**Reduced motion is served by `<picture>`, not by `hidden`.** The loop layer's
reduced-motion `<source>` points at the *still* — a URL the stack underneath has
already fetched. `motion-reduce:hidden` was the obvious version and it is wrong:
`display: none` does not reliably prevent the fetch, so the reader most likely
to be on a metered connection would pay for an image they were told they would
not see.

**Deleting the stills to save bytes breaks two things at once**: the
reduced-motion rendering *and* the no-empty-box guarantee.

#### ⚠️ You cannot verify loop playback in headless Chrome

Headless Chrome does not advance animated-image frames, so the obvious check —
`drawImage` twice and diff the pixels — returns **zero difference forever**, on
a file that is perfectly good. Verify the **file** instead:

```python
from PIL import Image; import numpy as np
im = Image.open("web/public/rat/rat-emergency-loop.webp")
print(im.n_frames, im.info["duration"])        # 16, 33  -> 16 frames @ 30fps
im.seek(0); a = np.asarray(im.convert("RGBA")).astype(int)
im.seek(1); b = np.asarray(im.convert("RGBA")).astype(int)
print(np.abs(b - a).sum())                     # large -> frames really differ
```

That catches every failure the bake can produce. Playback in a real browser is
the one thing you have to check with your eyes.

#### ⚠️ The loops cost 760KB, twenty times the stills

| | clear | watch | warning | emergency | total |
|---|---:|---:|---:|---:|---:|
| still | 10KB | 13KB | 7KB | 8KB | **37KB** |
| loop | 225KB | 303KB | 124KB | 108KB | **760KB** |

**Two obvious economies were tried and do not work. Do not retry them:**

- **Quality is not the lever.** 88 → 58 saves only ~28% and bands the
  gradients. A dark rim-lit subject is almost entirely soft falloff, which is
  the exact content low-quality WebP ruins.
- **Inter-frame compression does not engage.** `minimize_size` and `allow_mixed`
  save under a thousand bytes across all four. The subject is composited on
  transparency, so the alpha silhouette edge changes on every frame and there is
  almost no inter-frame redundancy. An animated WebP of a moving cut-out is
  close to a pile of independent stills.

**The lever that does work is frame count**, and the tempo ramp stays valid
because it only requires `fps` to rise and cycle length to fall.

Regenerate by hand, never in the build:

```bash
B="blender -b --factory-startup --python web/scripts/rat-bake.py --"
$B prep && $B probe && $B sheet          # import once, inspect, contact sheet
python3 web/scripts/rat-bake.py tile     # composite it (Blender has no Pillow)
#  ... choose poses, edit web/scripts/rat-poses.json ...
$B bake && python3 web/scripts/rat-bake.py webp          # four stills
$B loop && python3 web/scripts/rat-bake.py loopwebp      # four loops, 84 renders
```

**Bake the stills first and look at them.** `loop` shares the poses, lighting
and framing with `bake`, so finding out otherwise costs four renders instead of
eighty-four. The one thing `loop` does differently is solve the camera **once**,
against the union of every frame in the cycle — framing per frame is the obvious
implementation and it makes the camera breathe around a walk cycle, so the rat
appears to bob on a boom.

`webp` and `loopwebp` share `deliver()`, which premultiplies alpha before
resizing. Blender writes straight alpha with black RGB in transparent pixels,
and a naive Lanczos downsample bleeds that black into the edge and haloes the
silhouette. It is one function precisely so the two paths cannot disagree.

Needs **Blender 4.2 LTS** specifically; the script's docstring says why 4.0 and
5.x are both wrong. **Provenance:** the model is `assets/black-rat/`, gitignored,
licensed to be rendered rather than redistributed. Only the WebPs are committed.
