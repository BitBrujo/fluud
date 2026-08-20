# CLAUDE.md — the UI

Next.js + shadcn, compiled to a **static export** and served by `api.py`.

**Five routes plus twelve generated auth views.** `/` is the **landing page**
(photographic hero, four sections, footer), `/about` the **inventory and the
credit**, `/terms` the terms of service, `/map` the instrument. `/auth/<view>/`
is twelve more, and **that is where the sign-in card lives**.

⚠️ **`/watch/` is the fifth, since 2026-08-16, and it is the page every Fluud
email opens.** `?confirm=` confirms an address, `?watch=` manages or unsubscribes
one. **It is deliberately NOT wrapped in `RequireSession`** — it was
`/map/?confirm=` and `/map/?watch=` until then, and `/map` is gated, so every
link ever mailed sent a subscriber with no Fluud account to a sign-in page. It
mounts the full chrome including `SiteFooter`, renders no reading, and polls
`/api/healthz` and nothing else. Signed out it can drop an instrument, edit
settings and delete the record; it **cannot add** one, because that needs the
gated `/api/sensors`, and it says so rather than leaving a gap.

⚠️ **`/` has been SIX things and is a landing page as of 2026-08-16.**
Landing page → stub → sign-in with the stub's chrome → stripped to the door →
prose landing page → **rebuilt to a supplied design the same day**. The full
chrome — `SiteNav`, `PaintRule`, `SprayDefs`, `SiteFooter` — came back with it.
⚠️ **The sign-in card moved to `/auth/sign-in/`**, which already existed and is
generated; `/`'s CTA points there.

❌ ⚠️ **`/`'s NOTIFICATIONS SECTION IS A VIDEO AND FOUR WORDS**, since
2026-08-16 on the owner's instruction. Its label, body paragraph, three-step
`<ol>` and illustrated `EmailCard` were all deleted;
`notify-walkthrough.tsx` renders two cuts of one 27s HyperFrames piece —
1920×1080 above `sm`, 1080×1350 below — looping. **The first
video this site has ever served**, 2.7MB of committed build input in
`public/motion/`, rendered by hand from `scripts/motion/`. ⚠️ **That section's
copy is pixels**: the `sr-only` block in that component is its only home,
nothing can check it against two MP4s, and none of the rules the drawn interface
borrows — no depth in the rows, distances never coloured, rings and chips on
`--wl-select`, the quiet-hours sentence verbatim — is reachable by `tsc`,
`vitest` or `./scripts/check`.

⚠️ **It stopped being full-bleed the same day.** The video is a **framed left
column** at `xl` and up, with a 300px title rail on the right — an envelope glyph
over *Set your alerts*, vertically centred against the video — and the band's
`px-6 py-24 sm:px-12 sm:py-32 lg:px-20` came back with the column. **Measured at
1440**: video 916px in a 1px `--border` frame, rail 300px, 64px gap, both centres
within 0.1px, zero horizontal overflow. **At 390 it stacks, title first, tall
cut at 342px, zero overflow.** ⚠️ **The border and the radius are classes on the
`<video>` and the `<img>` and may not move to a wrapper** — the resting `none`
branch renders no media, and a wrapper's frame would draw as an empty box.
⚠️ **The split is `xl`, not `lg` like every other band**: at 1024 the column
leaves the wide cut ~500px, close enough to the 340px smear the second cut exists
to escape.

⚠️ **That band left the shared wash on 2026-08-17**, owner's instruction. It
takes **`--wl-wash-vertical`** — a blue gradient down the band, light at the top
and dark at the foot, same hue and same refusals as `--wl-wash`, about twice the
strength. **It is the only band on either page that diverges**, so retuning the
wash from one page no longer retunes both. Vertical is the one axis `--wl-wash`
refuses; the exception is bought by having **two stops and no inflection**, and
the argument is at the declaration in `src/app/globals.css`. **Unmeasured** — see
`src/app/CLAUDE.md` for the two things a browser owes.

⚠️ **THREE COPY CHANGES landed on `/` and `/about` the same day**, all owner's.
`LandingInstruments`' eyebrow went `Public data` → **`+5 Sources`** and its title
`Two data feeds from the city` → **`Data feeds from the city`**; the title
stopped counting and the eyebrow started, because a title naming a number the
eyebrow above it then adds to is two counts of one inventory. `LandingDashboard`'s
title went `…and the corner at once` → **`…and the street at once`**. And the
site description — **one string on both pages** — went from two sentences to one:
*"Fluud is a hyperlocal flood watch for New York City that lets you monitor and
craft custom alerts based on the city's embedded water sensors."*
⚠️ **The deleted second sentence named the camera pairing, so neither
description mentions the cameras now.**

⚠️ **`+5 Sources` is a THIRD figure on `/` that rots and the first that rots
against a LIST.** `UNCARDED_SOURCES` is `about-sections.tsx`'s seven-entry
`SOURCES` minus the two that band draws cards for. `probe` is no authority for
it and no re-measurement catches it — **an eighth source is what moves it.**

⚠️ **`/` RENDERS A DEPTH now, and it is the one route that does outside
`/map`.** Two illustrated cards — a `180 mm` sensor face on the depth ramp and a
`WARNING` email at `57 mm` — **on the owner's instruction**, reversing a Never
rule that had said no reading at all on the non-instrument routes. **Every
figure is a fixed literal and the page still does not poll.** ❌ ⚠️ **The
`EXAMPLE · not a live reading` label above each card was DELETED later the same
day**, on the owner's instruction — it was the fourth of the narrowed rule's four
conditions and the only one visible to a reader. The other three hold. The
conditions are in the root `CLAUDE.md`; the argument is in
`src/components/landing/landing-sections.tsx`. **`/about` and `/terms` are
unchanged and render no figure of any kind.**

⚠️ **`/about` was CUT to a supplied design the same day** — six numbered
sections down to a masthead, the two inventory counts, the sources table and a
photo band. **The second-witness rule, the coverage rule, the never-safe rule
and the MIT licence statement all lost their only prose home**, and the page
stopped polling `/api/status`, so it is a **server component** again.
⚠️ **The counts and the sources were then MERGED into one grid**, later the same
day on the owner's instruction — counts stacked left, the seven sources as a
`<dl>` on the right — so it is **two bands and a photograph**, `AboutInventory`
is the one export, and the table's `overflow-x-auto` box is gone with the table.
The section-by-section accounting is in
`src/components/about/about-sections.tsx`.

⚠️ **The pages with NO chrome are the `/auth` views now, and `/map` lost its
footer.** The auth views are a 50-50 split — the card and a photograph — with the
wordmark as the only way off. **`Terms` / `Privacy` under the card are the
footer's job**, because `/terms` is reached from `SiteFooter` and nowhere else
and it is where the sign-in record is disclosed. ✅ **`/about` is reachable from
`/` again**, which pays a debt recorded since 2026-08-14. ⚠️ **`/map` now
carries the prototype disclaimer nowhere** — that is the new cost, recorded in
`src/components/CLAUDE.md`.

⚠️ **There is a SIGN-OUT as of 2026-08-16, and it is the first one this app has
ever had.** `/auth/sign-out/` was generated and linked from nothing.
`SessionMenu` in the masthead is the door — see `src/components/CLAUDE.md`.

⚠️ **`/map` is behind a session; `/about` and `/terms` are NOT and must stay
that way.** A reader cannot agree to terms they have to sign in to read, and
`/terms` §04 is where the sign-in record is disclosed.

⚠️ **Sign-in is Google OR email-and-password**, since `credentials` was turned
on in `auth-provider.tsx` on 2026-08-14. Email sign-up means Neon stores a
password hash, so **that prop and `/terms` §04 move together** — see
`src/components/CLAUDE.md`.

⚠️ **Only `/map` polls `/api/status` now.** The other three did until the
sign-in landed. With the gate on that request is a guaranteed 401 on pages read
by somebody with no session, surfacing through `lib/messages.ts` as *cannot
reach the service* — an error banner about the instrument, shown to a reader who
is merely signed out. ⚠️ **`/`, `/about` and `/terms` pass `mode={null}`** and
`ModeBadge` says `UNKNOWN`, which is the truthful answer before anybody has
proved anything. **`/` mounts the badge again since 2026-08-16 and still must not
poll**; the auth views have no `ModeBadge` at all.

⚠️ **`RequireSession` is a curtain, not a lock.** The export is static files
served to anyone, so every component is in the bundle and nothing secret may
live there on its strength. **`waterline/auth.py` is the lock.** It wraps
`/map` rather than sitting inside it, because that page starts four polling
hooks on its first line and a hook runs on mount — an early return would still
have fired all four at 401.

⚠️ **Nothing on any page raises a warning any more.** The on-page alert system
was unwired: there is no SSE stream, no warning block, no alert list and no
drill. `warning-block.tsx`, `alert-list.tsx`, `rat-figure.tsx`,
`drill-controls.tsx`, `lib/warning-feed.ts` and `lib/hooks/use-warnings.ts` are
kept as files with no mount, so putting it back is a re-wire rather than a
rebuild.

⚠️ **The page therefore has NO `aria-live` region.** That is the deliberate
consequence rather than an accessibility regression to be found later: nothing
announces because nothing is announced. **Restoring the warning restores the
live region, and it must be the only one on the page.**

The instrument polls `/api/status` every 15s, `/api/healthz` every 30s,
`/api/history/{id}` every 60s for the selected camera, `/api/gauge-history`
every 60s, and `/api/sensors` every 60s **only while** the sensor list, the
sensor map layer **or the PAIR layer** is on. ⚠️ The third joined on 2026-08-16
and its reason is not obvious: `CameraStatus.sensor_id` is an **id, not a
coordinate**, so a link line cannot be drawn without that payload.

⚠️ **`/api/watch/mine` is a THIRD gated fetch as of 2026-08-17, and it is the
only one that is not polled at all.** One request, once, when the session
settles, from `watch-panel.tsx` — *does this reader's own proven address already
have a watch?* If it does, **the wizard does not run**: the panel mounts
`ManageFace` with the real subscription instead of walking somebody through
pick → alerts → email → submit for a row `api.watch_subscribe` will not change.
⚠️ **It carries no reading, no depth and no age, so there is nothing on it that
can go stale** — which is why it is not on a 15s or 60s clock like the other
five. ⚠️ **It takes no address**, which is what keeps the *"is this address on
Fluud"* oracle out of it.

⚠️ **`/api/cameras` is a SECOND gated fetch as of 2026-08-16 and it is lazier
than the first.** `/api/sensors` starts the moment a layer goes on; this one
makes **no request at all** until the reader touches the camera filter, and then
polls at 60s — it carries a depth, and a depth fetched once and left on screen is
the frozen-poller failure with no age to betray it. ⚠️ **Its
`depth_observed_at` is FloodNet's publication clock**, so it takes
`sensorFreshnessOf` (1h/3h) and never `freshnessOf` (5m/30m), which is what
`CameraStatus.observed_at` means. The distinct field name is the safeguard and
`city-map.tsx`'s `DrawnCamera` is where the choice is made — **once, in two
converters, so nothing downstream can make it again.**

## The routes, the routing flag, the display face and the theme

⚠️ **All of that lives in `src/app/CLAUDE.md`.** Four of its rules bind this
whole directory:

- ⚠️ **`trailingSlash: true` in `next.config.ts` is load-bearing, not a
  URL-style preference.** Adding a route means adding a **directory** to the
  export; without it the route 404s in production while `next dev` serves it
  perfectly, so the failure never appears in development.
- ⚠️ **`globals.css`'s shadcn slots are a supplied master.** Do not hand-tune
  one to fix a component.
- ⚠️ **`@neondatabase/auth/ui/tailwind` is imported ABOVE the theme in
  `globals.css` and the position is load-bearing.** The auth UI declares its own
  `:root` values for slots this app owns, at equal specificity, so the later
  declaration wins — moved below, a third-party stylesheet becomes the master
  for every page. One import method only; never also `ui/css`.
- ⚠️ **`@import "tailwindcss"` is SPLIT INTO THREE at the top of `globals.css`
  and the third line is deliberately UNLAYERED.** That same auth stylesheet also
  ships an unlayered `* { border-color: var(--neon-border) }`, and unlayered CSS
  beats every layered rule at any specificity — so with the utilities in
  `@layer utilities`, a zero-specificity `*` from a third-party package
  outranked every border-colour utility in the app and they silently stopped
  applying. **Re-collapsing the three lines restores the bug and nothing catches
  it.** `layer(base)` on the auth import fails the build: it contains an
  `@source`, which Tailwind refuses to nest.
- ⚠️ **A token defined as `var()` of a palette slot goes in the
  `:root, [data-palette]` block, never in `:root` alone**, and that block stays
  below the palette blocks. `var()` in a custom property resolves on the element
  that declares it, so at `:root` these freeze to the base palette the moment a
  `data-palette` lands on anything below `<html>` — which is exactly how the
  design system is used.
- ⚠️ **Nothing that carries a reading or an age is set in `--font-display`.** A
  dead font host costs headline styling and nothing else.

## The shape of the page

```
 ▦ Fluud  LIVE  ⚠ 1 notice    newest reading 8s ago · 27 of 27  ← sticky, and
                                                                  RE-MEASURE it
────────────────────────────────────────────────────────────────
┌──────────┬────────────────────────┬──────────────────┐
│ cameras  │ MAP         27 plotted │instr│gaug│wat│not²│ ← 44px TAB BAR
│ sensors ⌕│ ┌──────┐    ┌─────────┐ ├──────────────────┤
│ search   │ │● 10mm│    │●cameras │ │ selected  ‹ n/N ›│  ONE SCREEN tall,
│ sort     │ │◇ gaug│    │○sensors │ │ still + depth    │  all three columns
│ chips    │ │○ sens│    │⁄pairs   │ │ + trace          │
│ ┄┄┄┄┄┄┄┄ │ └──────┘    │◇gauges  │ │                  │  ONE panel at a time,
│ 425 rows │             │·outfalls│ │                  │  filling the track
│ ▁▄█ bar  │  the drawing└─────────┘ │                  │
│ scrolls  │  FILLS this frame  ┌─┐  │                  │
└──────────┴────────────────────┴─┴──┴──────────────────┘
   312px            1fr                   372px
footer ───────────────────────── the description
```

⚠️ **The rail is TABBED at `xl` as of 2026-08-15** — `instrument · tide + wx ·
monitor · notices`, one filling the track at a time.

⚠️ **The second tab's VALUE is `"gauges"` and only its label moved**, the third
label/value split on this page after `watch`→`monitor`. Its panel gained an NWS
alert block above the gauge grid, which is what the second noun is for.
⚠️ **The label is `tide + wx` and not `tide & weather` because of a
measurement**: 84.0px of text in an 84.5px box, against 54.0 for the shipped
string and 60.0 for `instrument`. Half a pixel is a label that fits by rounding.
`PanelTitle` one row below says *Tide, stream and weather* in full. ⚠️ **The third tab's VALUE
is still `"watch"`** and only its label moved; the mobile bar's button and
`Start Monitor` on the sensor face carry the same word, and the wire
(`/api/watch/*`, `min_level: "watch"`, the WATCH alert level) is untouched. **Below `xl` it still
stacks**, and the four panels are rendered exactly ONCE either way: CSS decides
which are painted, on the same rule the sheet layout below `md` runs on. See
`src/components/CLAUDE.md`.

⚠️ **The NOTICES strip was under the masthead until 2026-08-14, went to the foot
of the rail, and is a TAB now.** The middle state put the frozen-poller rule's
backstop below the fold; a tab is not below the fold, and its count is in the bar
at all times. ⚠️ **`NoticeBadge` in the masthead is unchanged and is not
retired** — the tab bar is `max-xl:hidden`, so on a phone the badge is still the
only always-visible fault signal, and it carries the worst fault's own title
rather than a count. `--wl-notices` stays deleted; the grid and the mobile map
are still a plain `calc(100dvh-5rem)`.

⚠️ **Every list row carries a DEPTH BAR since 2026-08-15** — the row's own depth
against curb height, with the flood-event tick on the track. It cost three
visible rows at 1440 with the controls strip open (7 → 4) against a floor of
three. **The margin is one row; anything further added to a row re-measures.**

⚠️ **The map pans and zooms as of the same day.** `+` / `−` / `whole city` sit
in a small box at the bottom right **of the drawing**, never in `PanelHeader`
and never as an `inset-0` overlay. ⚠️ **A SECOND small box joined it at the top
right on 2026-08-16** — five layer switches, one per marker class, and the two
that were in `PanelHeader` moved into it. Same rule, and it binds harder there:
that box is interactive, so `pointer-events-none` is not available to it. Plain wheel still scrolls the page;
`ctrl`/`⌘`+wheel zooms. See `src/components/CLAUDE.md` and
`src/lib/hooks/CLAUDE.md`.

⚠️ **PRESSING `+` MOVED THE `+`, and it was fixed on 2026-08-17.** Two lines in
`PanelFooter` toggled on `zoomed` in opposite directions, a footer line is **in
flow**, and the drawing is the `flex-1` between a fixed `h-11` header and that
footer — so one more footer line came straight out of the drawing's height and
the bottom-anchored control cluster moved with the edge it is anchored to.
⚠️ **The cluster was innocent**, and a fix applied there would have been a fix in
the wrong file. **`FrameLine` is one slot holding both lines, reserved by a
ghost render of the same components rather than by a measured literal.** The
invariant it buys is **height is a function of the layer configuration, never of
the frame**; a layer switch still moves the footer. The argument, and the blank
strip it costs at rest, are in `src/components/CLAUDE.md`.

**Three tracks, and the widths are measured rather than taken from the mock.**
The design drew 296 / 1fr / 340; at those widths this app's real chrome does not
fit — `PanelHeader` puts a title beside a pager and two chips, so the rail
truncated to *"SELECTED INS…"* and a 296px list row wrapped `27s ago` onto two
lines. Both fixed tracks gained the least that cleared it.

⚠️ **`xl`, not `lg`.** 312 + 372 of fixed track plus two gaps leaves the map
under 400px at `lg`'s 1024 — narrower than the list beside it, on a drawing of a
city. Below `xl` the three stack in reading order: list, map, rail.

**Measured at 1440×900:** header 54px (53 at 390), columns 312 / 676 / 372, each
820px = `calc(100dvh - 5rem)`, zero horizontal overflow.

⚠️ **The wordmark is a two-word name and that is a layout risk the character
count hides.** A wordmark that wraps takes the masthead to two lines and breaks
the 54px above. **Re-measure after any change to it rather than reasoning about
it**, and **check the height, not the client rects**: `Range.getClientRects()`
returns 2 at 1440 on a single visual line — that is `Spray`'s filter structure,
not a wrap. The test that decides it is `height ≈ line-height`.

⚠️ **The extra space reaches the DRAWING as of 2026-08-15, on both axes.** It
used to go to whitespace: the map was `width: 100%` under a `MAP_MAX_W` cap of
606px, locked to `MAP_ASPECT` and centred, so a track of any other shape left
panel background down both sides. **The cap and the CSS aspect lock are both
deleted and the surface is `h-full w-full`.**

⚠️ **The aspect agreement moved from CSS into `lib/geo/viewport.ts`, it did not
go away.** A `ResizeObserver` measures the surface, and the viewBox and the
marker percentages are both derived from that one number — so the viewBox is the
container's shape by construction and there is no letterbox to drift against.
**Do not put `aspect-ratio` back on that element.**

⚠️ **At full view the frame CONTAINS the city rather than equalling it.** A wide
frame shows background either side of the drawing and the city is centred by
arithmetic. **Nothing is cropped at full view** — the drawing is as large as it
can be without cutting boroughs out of the state the page opens in, so this
change moved the empty space inside the border rather than removing it.

⚠️ **The map panel still needs a definite height at every breakpoint.** `xl` gets
one from the grid track; below it `map/page.tsx` carries
`max-md:h-[calc(100dvh-5rem)]` and `md:max-xl:h-[70dvh]`.

⚠️ **The workspace has NO `max-w` since the same day** — it was
`max-w-[1600px] mx-auto`. The two fixed tracks are unchanged at 312 / 372, so
every pixel of extra page width goes to the map's `minmax(0,1fr)`. **Nothing in
a fixed track re-measures**, because neither fixed track moved.

⚠️ **The NOTICES strip's height is a CONSTANT and must stay one.** It is
`h-[112px] md:h-[192px] shrink-0` in the rail — a literal since `--wl-notices`
was deleted, and the same two numbers the token carried with its folded-in
`gap-4` taken out. **A `min-h` or an `h-auto` re-creates the unbounded push the
component exists to remove**, and in the rail that push moves the whole column
rather than the workspace.

⚠️ **The 2026-08-07 measurement below it belongs to the OLD position** — strip
192px, grid 612px, grid bottom 890 against a 900px viewport, with the strip
above the workspace. It is kept as the record of what the subtraction was doing.
**The rail figures are a browser measurement this move still owes.**

**Everything in the right column scrolls internally.** The list has always
scrolled; the detail body is `min-h-0 flex-1 overflow-y-auto`; the baseline
pages rather than scrolls. **Anything added to this column has to do the same** —
one panel that sizes to its content pushes the workspace past a screen and takes
the bottom panel below the fold. `dvh`, not `vh`: the difference is a phone's
collapsing address bar, on a page people open outdoors.

Measured at 1440×900: **list 314px, detail 266, baseline 256** — 868 with the
two 16px gaps, exactly `calc(100dvh-2rem)`.

❌ ⚠️ **256 WAS the load-bearing one and it is gone, along with the layout it
described.** It was the two-up card height at which neither gauge face had to
scroll. Two-up and its pager were replaced on 2026-08-15 by a five-card grid with
an NWS block above it, so there is no two-up for the number to be about.

⚠️ **It is not replaced by a bigger floor, deliberately.** The equivalent floor
for the new layout is ~742px, and unlike 256 it would *bind*: the rail is
`xl:overflow-hidden`, so under about 866px of viewport height that `min-h` pushes
the panel's bottom out of the track and **clips it**, losing the last gauge card
with no scrollbar to reach it. A card back that scrolls internally is strictly
better than a card that is not there. So above `xl` the slot is `xl:flex-1` and
nothing else.

**The guarantee is now conditional and says so: no face scrolls at ≥900px of
viewport height, and below that it degrades to an internally-scrolling card
back.** Measured at 1440×800 — cards shorten, backs scroll, nothing clipped.

⚠️ **The numbers that ARE load-bearing now**, all measured, all in
`MEASUREMENTS.md`:

| | value | what it is |
|---|---:|---|
| `NwsAlerts` | **112px** | a CONSTANT, `message-strip.tsx`'s idiom. Zero alerts or eight is the same box |
| grid rows | **0.8fr / 1fr / 1fr** | short row **FIRST** — the wide tide card needs 154px, each narrow creek card 197px |
| below `md` | **776px** | measured at 390×844 |
| `md`–`xl` | **704px** | 648 was 16px short and 680 was 7px short; both were measured, not reasoned about |

⚠️ **The row fractions are the trap.** A card back's height is set by how many
lines its closing paragraph wraps to, so the **wide** card is the cheapest row
rather than the most expensive — the opposite of what the arithmetic predicted.
Short row last measured 162.6px against a 197px need and scrolled both bottom
backs by 35px. **Turn every card over before believing a change here.**

⚠️ **ONE surface turns over**: a gauge card, flipping to what its number is
measured against. The selected-instrument panel flipped to its neighbourhood's
DOHMH rat-inspection tag until 2026-08-14, and that feature is deleted —
component, wire fields, generator and flip.

`flip-card.tsx` stays a shared component on one caller, because what it holds is
not layout: it is what ends up in the accessibility tree and what happens under
`prefers-reduced-motion`, which is exactly what a second flipping surface
re-implements badly.

## The buildless trade, stated rather than dropped

The page this replaces defended having no build step: *"a build step is one more
thing to break at 11pm."* That was a real argument and it lost to two things a
buildless page could not have:

1. **A missing case is now a build error.** The old page did
   `SEV[c.severity] || 'sev-dry'` — a class added server-side and not here
   rendered silently as dry, the wrong direction to fail in a flood tool.
   `lib/depth-band.ts` and `lib/levels.ts` are exhaustive `Record`s, so the same
   mistake now stops `next build`.
2. **Staleness.** The buildless page never rendered `observed_at`, so a frozen
   poller looked perfectly healthy while serving forty-minute-old water levels.

What keeps the 11pm argument honest: the build runs **in Docker**, in its own
stage, from `package-lock.json`; `npm run prod:local` reproduces the production
serving path exactly; and a failed build cannot ship a half-built page —
`api.py` mounts `waterline/web/` only when it exists and 503s with the command
to run when it doesn't. You get *no UI*, never a broken one.

### The test dependency is `vitest`

```bash
cd web && npm test          # 350 tests over src/lib/
cd web && npm run test:watch
```

Three things about it are decisions rather than configuration:

- ⚠️ **`web/tests/` and `vitest.config.mts` are in `.dockerignore`, and not for
  tidiness.** `COPY web/ ./` would carry them in and `next build` typechecks
  `**/*.ts` — so a type error in a **test** file would fail the **production
  image build**. `npm run typecheck` covers them instead.
- ⚠️ **The config is `.mts` and must stay `.mts`.** As `.ts` it loads as
  CommonJS and Vite warns its ESM syntax is unsupported by the loader mode
  planned to become the default.
- ⚠️ **`environment: "node"`. There is no jsdom and adding it is a decision** —
  see the refusal below.

The scope is **`src/lib/` only**, which is where the rules a compiler cannot see
live: the depth band's boundaries, `parseServerTime`, the two comparators, the
three staleness clocks, and `queryIsActive` excluding `origin`.

⚠️ **One of those tests is not hermetic and that is the point.**
`tests/parity.test.ts` shells `python3 scripts/parity_constants.py` and asserts
that the numbers duplicated across the two languages still agree. It skips with
a named reason when Python is absent.

## `.design-sync/` — this UI is also a design system

⚠️ **Since 2026-08-15, 56 of these components are exported to a claude.ai/design
project**, where an LLM composes them into new screens. Everything the export
needs lives in `web/.design-sync/`, and it ships nothing this app serves.

⚠️ **THE TREE IS UNTRACKED as of 2026-08-20 and this section describes something
a clone does not have.** It was committed until this repo went public;
`.gitignore` now excludes all of it rather than only the machine state, and
`.dockerignore` excluded the whole thing for weight all along. **It is still on
the owner's disk and `/design-sync` still runs** — untracked, not deleted.
Verified the same day: with the tree moved aside, `npm run typecheck` and
`npm run build` are both clean, so `package.json`'s
`"types": ".design-sync/entry.tsx"` pointing at a missing file costs a clone
nothing.

**Read the rest of this section as the record of how that export works**, not as
a description of files beside you.

```
config.json        the converter's config — pinned project id, overrides,
                   the two hand-written prop bodies
conventions.md     ⭑ prepended to the generated README and INLINED INTO THE
                   DESIGN AGENT'S SYSTEM PROMPT. The safety rules live here or
                   they do not reach it at all
NOTES.md           what cost time, and the re-sync risks. Read before re-syncing
entry.tsx          ⚠️ the library entry. HAND-WRITTEN — it names the export
                   surface, and a component missing from it is not in the
                   design system
process-shim.ts    imported FIRST in entry.tsx; see below
fluud-root.tsx     `FluudRoot`, the DS's root wrapper
fixtures.ts        stub payloads for the app-coupled previews
previews/*.tsx     56 authored preview files, one per component
ds-tailwind.css    the DS's own Tailwind entry
fonts/             Archivo · Archivo Black · IBM Plex Mono, OFL, 16 faces
```

**This repo is an application, not a library**, and three consequences follow:

- **`package.json` carries `"types": ".design-sync/entry.tsx"`.** That one line
  is what lets the prop contracts extract; without it every `<Name>.d.ts` ships
  an empty props body. ⚠️ **Its removal is silent** — the build still succeeds.
  It has no effect on Next.
- **Adding a component to the design system means adding a line to
  `entry.tsx`.** Nothing discovers it otherwise. Renaming or deleting one means
  editing that file too, or the next sync fails resolving it.
- ⚠️ **`process-shim.ts` must stay the FIRST import in `entry.tsx`.**
  `next/link` and `@neondatabase/auth` read `process.env` at **module
  evaluation**, and `lib/api.ts` imports the auth client — so the auth SDK and
  the Next runtime are in the graph the moment any instrument component is. In
  a browser IIFE with no bundler-injected `process`, the whole bundle throws
  before one export is assigned and **all 56 components fail at once**. This is
  the same rule, for the same reason, as `lib/crypto-shim.ts` sitting above the
  SDK in `lib/auth-client.ts`. **An import sorter that moves it down restores
  the crash.**

### `FluudRoot` is `layout.tsx` in a form a design can mount

There is no light theme: one palette at `:root` and it is the dark one, and the
dark variant is `@custom-variant dark (&:is(.dark *))` — so every `dark:`
utility needs a `.dark` **ancestor**. `FluudRoot` supplies it plus the body
background, mirroring `<html className="dark …">` and `<body>`. Before it
existed, 36 of 56 components fell back to the converter's floor card and the
rest rendered dark token values against a white page. **If `layout.tsx`'s root
classes change, this changes with them.**

### ⚠️ The design system ships a stylesheet WE compile

`cfg.cssEntry` points at a gitignored compiled file, not at `globals.css`, and
not at Next's output. Both were tried:

- **`src/app/globals.css` is Tailwind SOURCE.** It carries the tokens and no
  utilities, so every component renders unstyled.
- **Next's compiled CSS is content-hashed**, so no stable path can name it.

`ds-tailwind.css` imports `globals.css` **verbatim** — the tokens, the three
palettes and the shadcn master are unchanged — and adds scan coverage plus a
safelist. ⚠️ **That safelist is LAYOUT ONLY and that is a rule.** No colour,
border-colour or text-colour utility is in it, because a colour beside a
reading may not vary with that reading and the scales are components rather
than utilities. If a design agent reports missing utilities, extend the
**layout** families; never add colour.

### ⚠️ Two toolchains skip dot-directories, and both bite here

`.design-sync/` is hidden, and **neither Tailwind's scanner nor TypeScript's
`include` wildcards match inside it.**

- **Tailwind** will not scan `previews/`, so an authored preview may only use
  utilities the shipped stylesheet already emits. Every `@source` spelling was
  tried. The consequence is a rule rather than a defect: it is exactly the
  constraint a design built with this library works under, so a card that could
  style itself with classes no design can reach would be a card that lies. Use
  an inline `style` for anything else.
- **`tsc` never checks this tree.** Verified by planting a deliberate type
  error in a preview and watching `npm run typecheck` pass. ⚠️ **So the entry
  barrel, the shims and all 56 previews are unchecked TypeScript** — which is
  also why they cannot fail the production image build the way a file in
  `tests/` could. The gate on them is the converter's own render check.

### Re-syncing

`/design-sync`. It reads `config.json` and `NOTES.md` first, and the uploaded
project's `_ds_sync.json` is what lets it skip components that have not
changed. `NOTES.md`'s **Re-sync risks** section is the watch-list — chiefly that
`fixtures.ts` duplicates wire shapes from `lib/api-types.ts` through `as never`
casts, so **the compiler will not catch a field the API renames or drops.**

## Never render untrusted HTML

Everything downstream of `fetch()` is untrusted: camera names come straight from
the NYC DOT API. **Never use React's raw-HTML prop** — the one whose name starts
with "dangerously". A security hook flagged the first draft of the page this
replaces for exactly this concern, and it was a real finding. The rule costs
nothing: JSX children are escaped by construction.

## Stale is not current

Each camera in `/api/status` carries `observed_at`, and the page renders it.

| Age | Map marker | List row · detail |
|---|---|---|
| < `STALE_AFTER_S` (300s) | solid, on the band (hollow if uncalibrated) | normal |
| ≥ 300s — **stale** | **hollow amber, off the band** | pill neutral-outlined, age amber, panel border amber |
| ≥ `DEAD_AFTER_S` (1800s) — **dead** | **hollow red, off the band** | age red, panel border red, still replaced |

**Never blanked, never zeroed.** A blank card reads as calm, which is the
failure this whole treatment exists to prevent. The digits stay; what changes is
the claim being made about them. The pill is *removed from the scale* rather
than downgraded, because an hour-old reading in a confident colour is the worst
thing on this page.

⚠️ **There are THREE clocks, and only the first measures whether Fluud is
healthy.** A camera's `observed_at` is stamped by *our poller*. A gauge's is the
operator's publication time and a sensor's is FloodNet's own — both keep ticking
whether or not we are alive, and both run far behind by design.

| instrument | clock | stale | dead | helper |
|---|---|---:|---:|---|
| camera | our poller | 300s | 1800s | `freshnessOf` |
| gauge | NOAA / USGS publication | 3h | 12h | `gaugeFreshnessOf` |
| sensor | FloodNet publication | **1h** | **3h** | `sensorFreshnessOf` |

The sensor numbers are measured, not guessed — the failure the gauges already
taught. Lag across all 425 deployments in one request: **p50 1.0 min, p90 2.2,
p99 22.5, max 48.1**. Against the camera thresholds roughly one sensor in twenty
would render amber on every load. One hour is 2.7× the p99. ⚠️ **Three hours for
dead rather than six is deliberate**: `floodnet.MAX_AGE` bounds the depth query
at 6h, so a sensor past that has no reading in the payload at all — setting dead
at the window boundary would make that red band unreachable.

⚠️ **The gauges were the first exception and they need their own numbers.**
Measured over 48 hours, the USGS sites' newest published point runs **21 to 81
minutes** behind wall clock while sampling every 15 minutes exactly. Sampling
interval and publication lag are different quantities, and the first draft set
staleness against the wrong one: at 30 minutes, three of four perfectly healthy
gauges rendered amber on first load. **An indicator that is always warning is an
indicator nobody reads.**

**All four camera surfaces have to agree**, which is why `freshnessOf()` is
shared and nothing recomputes its own thresholds. A map that keeps showing a
confident colour while the cards beside it have gone amber reads as the cards
being broken rather than the data being old.

**Per-card age is the primary way a frozen poller becomes visible, not the
banner.** `/api/healthz` reports `polling` from `_poller.is_alive()`, and a
thread the host has stopped scheduling is **alive** — it is simply never run. So
`polling: false` only ever catches a poller that has *exited*. `last_tick_at`
closes most of that gap, but the cards catch every case, because they measure
the data rather than the thread.

A timestamp from the *future* is treated as neither fresh nor stale: it is a
clock disagreement, it says so in words, and it is excluded from "newest
reading" rather than winning it.

## The wire types are checkable

`waterline/models.py` declares a `response_model` for every route with a body,
so `/openapi.json` describes real shapes. `lib/api-types.ts` is hand-written —
there is no codegen step and adding one would put a generator between two files
a person can diff in a minute — but it can be *verified*:

```bash
curl -s localhost:8080/openapi.json | jq '.components.schemas.CameraStatus'
```

**This file may be more lenient than the server, in one direction only.** A
field the server always sends may be optional here when the fallback is safe:
`HealthResponse.last_tick_at` (a rolling deploy can have a browser load the
shell from a new instance and poll an old one), `SpeakEvent.drill` (a missing
flag is falsy, so an unlabelled event is treated as a **real warning**),
`HealthResponse.mail_delivers` (read as `=== false` so *the server did not say*
never renders as *nothing was sent*), and `HealthResponse.auth_required` (read
as `=== true`, so *the server did not say* never renders a sign-in prompt over
an open deployment). The reverse — promising a field the server may omit — is a
bug nothing catches until it renders as `undefined`.

⚠️ **`HealthResponse.writes` is on that list and it has THREE absences rather
than two.** Undefined is an older instance; `null` is *we could not ask*, or a
database with no `poll_ticks` yet; and a **present block with a null `tick_at`**
is *no poller has ever ticked in this mode*, which is a claim and renders as a
fault. Its numbers are read as `=== null` and never by truthiness — `stored: 0`
is falsy and means *this tick stored nothing new*, which is a real state.

⚠️ **`auth_required` is CONFIGURATION, never a verdict on a token.** `true` says
the gate is on. It does not say any particular session would be accepted, and no
surface may word it that way.

⚠️ **`WatchMineResponse` is the one watch shape with NO parameter, and that is
the control.** Added 2026-08-17 so the wizard can stop re-asking a reader who
already subscribed. Every other lookup in this feature takes an address or a
token; this reports on the session's own `email_verified` claim and nothing else,
so there is no address to aim it at. **Read `watching`, never the presence of
`manage_token`** — the two are written together on the server, and a client
keying off the token is one field rename from treating an unverified reader as
subscribed. `watching: false` covers no session (including `REQUIRE_AUTH=false`),
an unverified address, a verified address with no confirmed row **and a failed
fetch**, and all four mean *run the wizard*.

⚠️ **`WatchSubscribeResponse.status` is a TWO-MEMBER union since 2026-08-16** —
`"pending" | "confirmed"` — and `manage_token` is optional in the safe
direction: absent means the UI offers no shortcut link. `confirmed` is reachable
only when the server matched a verified `email_verified` claim to the address
being subscribed, so the identical-answer property still holds for every caller
who did not prove that address. ⚠️ **The token is a non-expiring bearer
credential and may never be persisted** — see `src/lib/CLAUDE.md`.

The watch shapes carry **no reading, no depth and no age**, and that is a rule:
a manage surface that rendered live state would be a second place a number can
appear without its plausibility and its freshness beside it. ⚠️ **Two fields
look like state and are not** — `alert_permitted` and `silent` — and both are
recomputed server-side on every read, because both can change after somebody
subscribes and the reader is owed the reason.

⚠️ **`silent` is a boolean and it may never become an age.** The server holds
the timestamp and reduces it in the route, specifically so nothing can render
*"47 minutes ago"* beside an instrument name.

## A missing case is a build error

`lib/depth-band.ts` and `lib/levels.ts` are exhaustive `Record`s. **No index
signatures, no `|| fallback`, no `as any` in those two files.** That is the
entire reason this app has a compiler.

**`tests/levels.test.ts` does not duplicate that gate and must not try.** `tsc`
is the stronger enforcement and needs no test. What the compiler *cannot* see is
**the colour a rest state takes**, and colours are strings:
`LEVEL_EDGE.clear = "border-l-[var(--wl-clear)]"` typechecks perfectly and puts
a reassuring green beside the wordmark. So the ramps are asserted as substrings,
and `DEPTH_BAND_PILL.none` / `DEPTH_BAND_PIN.none` are asserted not green — the
low end of that scale is the absence of a claim, not a claim of absence.

### ⚠️ No jsdom, and vitest raises the price of that rule rather than paying it

**Every layout fact in this file is measured in a real browser** — the legend's
height reserve, the rail's 256px gauge slot, the masthead's height, the wordmark
holding one line. jsdom lays nothing out; `getBoundingClientRect` returns zeros.
So a jsdom assertion about any of those is not a weaker version of the real
check — it is a **green test over an unmeasured page**, which is worse than no
test, because the hand measurement stops getting done.

## Absence of depth is not zero

A camera with no co-located sensor has **no depth information**. Render the
em-dash and the explanatory line — never a `0`, never a blank that reads as
calm:

```
no co-located sensor — no depth is measured at this camera
```

The `calibrated` flag drives this. 137 of 969 cameras are paired at all; most of
the map has no ground truth and the UI has to say so. Note that `depth_mm: 0` is
a different thing entirely — that is a sensor reporting zero, and it renders as
`0 mm`.

⚠️ **The same rule covers ~35 silent sensors.** `SensorStatus`'s four reading
fields are null together, and a sensor that has never reported renders an
em-dash with **no fault mark** — a fault is a claim about a number, and there is
no number.

### `depth_plausible` — the digits stay, the claim changes

A faulted reading is **never blanked and never zeroed** — the number is the
evidence that the instrument is broken. What changes is the claim: the list row
drops to muted and takes a neutral-outlined `FAULT` chip in `--wl-stale`, the
detail face says *"sensor fault — this is not a depth"* and which bound was
crossed, the map does not fill the marker, and the comparator sorts it below
every plausible reading.

⚠️ **`plausible === false`, never `!plausible`** — it is `null` on a sensor that
has never reported, and absence is not a fault.

## Style

Dark, editorial, tabular numerals. There is no light theme — `dark` on `<html>`
exists so shadcn's `dark:` variants resolve, not as a toggle. Depth is the one
big number on a card; the pill carries which side of the two borrowed thresholds
it falls on. `.num` (mono + `tabular-nums`) on anything numeric so digits don't
jitter between polls.

**Every region below the masthead is a `Panel`** (`components/panel.tsx`): same
border, same corner, same chrome bar. It is not a shadcn component — it is a div
with a border — and it exists so that "the map and the list are equal frames" is
a structural fact rather than two class strings that drift apart. `PanelHeader`
is a fixed `h-11` on purpose: at their intrinsic heights the map's and the
list's headers differ by about eight pixels, small enough to look like a
rendering artifact and large enough to see.

Two shared tokens carry the chrome: `--wl-panel` (one step below `--card`) and
`.wl-scroll` (thin, border-coloured scrollbars — the platform default is a light
slab down the middle of a dark page). `--radius` is `0.5rem`.

> **A colour beside a reading may not vary with that reading unless it is on a
> scale that says so.**

shadcn components in use: **card, badge, alert, button. Nothing else.**

## Local dev

```bash
POLL_IN_SERVICE=true uvicorn waterline.api:app --reload --port 8080  # terminal 1
cd web && npm run dev                                                # terminal 2
```

`next.config.ts` proxies `/api/*` and `/healthz` to :8080 in dev only. Override
the target with `WATERLINE_API=…`, which is read at **dev-server startup** — a
change to it needs the server restarted, unlike `NEXT_PUBLIC_*`, which
recompiles on save.

⚠️ **`POLL_IN_SERVICE` defaults to FALSE and a bare `uvicorn` collects
nothing.** The API serves every route perfectly and writes no readings, so
`/api/sensors` returns all 425 rows with a null depth, indefinitely, on a
service reporting healthy. That is not a bug to find in this directory — it is
the poller not running, and `/api/healthz`'s `writes.last_store_at` is what says
so.

⚠️ **A port collision here presents as a bug in OUR code, and that is the trap
worth writing down.** If something else owns the proxy target, the page loads,
the shell paints, and the notices strip says *cannot reach the service* — which
sends you to read `api.py`. `lib/messages.ts` early-returns on a `/api/healthz`
error, so **every other row is suppressed** and the more specific poller faults
never get a chance to speak. Measured 2026-08-15: the default `:8080` was
another service entirely, which answered all four polls with HTML and a 404.
**Check `ss -ltnp` before reading code**, and confirm the API separately rather
than trusting that *something* answered.

⚠️ **Opening the dev server by LAN IP needs `allowedDevOrigins`, and the failure
does not look like a permissions problem.** Next blocks cross-origin requests to
`/_next/*` and `/_next/hmr`, and **only** those — so the HTML document arrives,
every chunk and the HMR socket come back `403 Unauthorized`, and you get a page
that renders its shell, runs no JavaScript and never refreshes. The 403s are
logged to `.next/dev/logs/next-development.log` and do not appear in the
terminal's normal output, which is how this costs an hour.

**It is configured for you**: `next.config.ts` defaults `allowedDevOrigins` to
the machine's own non-internal IPv4 addresses, so the **Network:** URL `next
dev` prints in its own banner works without setup. `WATERLINE_DEV_ORIGINS`
**replaces** that list — use it for a host this cannot discover (a tunnel, a
container host, an mDNS name), or to narrow it.

⚠️ **It takes hostnames, not origins.** `192.168.1.50` or `*.example.dev`, never
`http://192.168.1.50:3000` — Next reduces the request's `Origin` to a hostname
before matching, so a scheme or a port simply never matches. IPv4 only; see the
comment at the config for why a v6 address there would silently never match.

### ⚠️ Reaching the dev server by LAN IP is an INSECURE CONTEXT, and the auth SDK dies in one

`allowedDevOrigins` gets the phone past the 403s. A second, unrelated thing
breaks immediately after, and it is worth knowing before it costs an evening.

`crypto.randomUUID` is exposed **only in a secure context** — HTTPS, or the
`localhost` exemption. `@neondatabase/auth` calls it at **module evaluation**,
and `AuthProvider` is mounted in the root layout, so on `http://<LAN-IP>:3000`
the throw comes out of `RootLayout` and **every route renders Next's "This page
couldn't load"** — `/about` and `/terms` included. Measured in the page at
`http://192.168.1.166:3000`:

```
isSecureContext          false
crypto.randomUUID        undefined
crypto.subtle            undefined
crypto.getRandomValues   function
```

**`lib/crypto-shim.ts` fixes the rendering** and is imported above the SDK in
`auth-client.ts`, because ES modules evaluate in import order. ⚠️ **The order of
those two import lines is load-bearing** — an import sorter that moves the shim
below restores the crash.

⚠️ **It does NOT make signing in work over http-on-LAN and must not try.**
`crypto.subtle` is missing in the same contexts, and a hand-rolled substitute for
WebCrypto on the path that handles session tokens is far worse than the failure
it replaces. **What the shim buys is the page rendering, which is what checking a
layout on a phone actually needs.** To complete a sign-in use `localhost` or
`next dev --experimental-https`.

⚠️ **Production is unaffected in both directions.** Over HTTPS the shim never
runs. So this whole class of failure is invisible to `./scripts/check`, to
`next build`, and to every test — it appears only in a browser, on one class of
origin.

⚠️ **`rewrites()` do not exist under `output: 'export'`.** In production the same
relative paths work for a different reason — FastAPI serves the bundle and the
API from one origin. The app code is identical; the mechanism is not. Use
`npm run prod:local` to test the real thing: the mount, the `_next` paths, the
Cache-Control override, the 404 page.

⚠️ **`compress: false` in the dev config is not about speed.** The dev server
gzips proxied responses, and a gzipped SSE stream *buffers* — so a stream
delivers nothing while sitting in `readyState: OPEN` looking healthy. curl
doesn't send `Accept-Encoding` by default, so curl works and the browser
doesn't. Kept for the dormant SSE path.

---

@AGENTS.md
