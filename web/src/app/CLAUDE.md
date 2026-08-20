# CLAUDE.md — the five routes, and the twelve generated auth views

`src/app/` is the route tree, the root layout and the theme.

```
  src/app/auth/[pathname]/   ⚠️ TWELVE generated views. `generateStaticParams`
                             reads `lib/auth-views.ts`; a view missing from
                             that list 404s IN PRODUCTION ONLY. ⚠️ This is
                             where the SIGN-IN CARD LIVES since 2026-08-16 —
                             a 50-50 split with a photograph, NO chrome, and
                             `Terms` / `Privacy` under the card
  src/app/page.tsx           ⚠️ the LANDING page, at `/`. SIXTH shape, built
                             to a supplied design 2026-08-16 — photographic
                             hero, four sections, footer. ⚠️ It RENDERS TWO
                             ILLUSTRATED DEPTHS, which reverses a Never rule;
                             every figure is a LITERAL and it does not poll.
                             ⚠️ A signed-in reader STOPS here: the branch is a
                             BUTTON, not a redirect
  src/app/about/page.tsx     the ABOUT page — ⚠️ CUT to a supplied design on
                             2026-08-16: masthead, two counts, sources table,
                             photo band. ⚠️ the counts and the sources were then
                             MERGED into one grid — counts stacked left, sources
                             right, as a `<dl>` — so the page is TWO bands and a
                             photograph and `AboutInventory` is the one export.
                             ⚠️ the masthead is CENTRED on the
                             wordmark with `A flood watch for your block` as a
                             TAGLINE under it, later the same day. ⚠️ its photo
                             band's `scale` is MANDATORY — that file has a white
                             print border baked in FOUR rules lost their prose home with
                             the six numbered sections. Renders NO figure, and
                             no longer polls — a SERVER component again
  src/app/terms/page.tsx     the TERMS page. Renders NO reading either, and
                             every factual claim in it is checkable against
                             this repo — so a change to `schema.sql` or
                             `geosearch.ts` changes this page in the SAME commit
  src/app/map/page.tsx       the INSTRUMENT, at `/map`. ⚠️ Below `md` it is a
                             SHEET layout — sticky search bar, full-screen map,
                             bottom-sheet list, filters and watch as fixed
                             sheets — as ONE tree ordered by CSS. ⚠️ `MapRoute`
                             FORWARDS `?confirm=` / `?watch=` to `/watch/`
                             ABOVE the gate, for links already in inboxes
  src/app/watch/page.tsx     ⚠️ the MANAGE page, at `/watch/`, since
                             2026-08-16 — the ONLY page an emailed link opens.
                             NOT wrapped in `RequireSession`, deliberately.
                             Renders NO reading; polls `/api/healthz` alone
  src/app/layout.tsx         ⚠️ holds the ONE third-party origin on this site,
                             the Adobe Fonts kit for the display face
  src/app/globals.css        the theme. Its shadcn slots are a SUPPLIED MASTER,
                             dark half only
```

⚠️ **None of the five opens an SSE stream, because there is none.** The on-page
alert system was unwired. `/map` additionally polls `/api/healthz`,
`/api/history`, `/api/gauge-history` and (gated) `/api/sensors`.

⚠️ **`/api/healthz` is the one that says whether anything is COLLECTING**, since
its `writes` block landed on 2026-08-15. It reports the poller out of Postgres
rather than out of the API process's own memory, so it is correct with the loop
in a separate container — and `lib/messages.ts` therefore no longer gates the
poller row on `poll_in_service`. ⚠️ **A dev proxy aimed at the wrong service
hides all of it**: any error from that one hook early-returns *cannot reach the
service* over every other row.

## Routing, and the one flag that makes it work in production

⚠️ **`trailingSlash: true` in `next.config.ts` is load-bearing, not a URL-style
preference.** `api.py` mounts the export with `StaticFiles(html=True)`, which
falls back to `<path>/index.html` only when `<path>` is a **directory**. With
the flag off, Next exports `out/map.html`, a request for `/map` looks for a file
literally named `map`, finds nothing, and gets the 404 page — **while `next dev`
serves it perfectly**. So the failure appears only in production and nothing in
the build mentions it.

**Adding a route means adding a directory to the export.** Verify it through the
real mount: `/map` → 307 → `/map/` → 200, with `out/map/index.html` on disk. That
check is the whole cost of a new page and it is cheap.

⚠️ **`/auth/[pathname]` is the same trap arriving through a DYNAMIC segment.**
`output: "export"` resolves nothing on demand, so the route exists only for the
values `generateStaticParams` enumerates — read from `lib/auth-views.ts`, with
`dynamicParams = false`. A view missing from that list has no directory and gets
the 404 page, **in production only**, because `next dev` resolves dynamic params
on request whatever the list says.

⚠️ **The one that matters is `callback`.** Google redirects there after consent.
Without it a reader completes a Google sign-in and lands on a 404 **holding a
valid session** — which looks like the sign-in failing when it in fact
succeeded. Verified through the real mount: `/auth/callback` → 307 →
`/auth/callback/` → 200, twelve directories under `out/auth/`, and
`/auth/nonsense/` → 404.

⚠️ **`lib/auth-views.ts` carries no `"use client"` and must not gain one.**
`generateStaticParams` runs on the server; when that list lived in a client
module the build failed with `AUTH_VIEW_PATHS.map is not a function`, because
Next replaces a client module's exports with client *references*. **A directive
is not a hint about where code runs — it changes what an import evaluates to.**

⚠️ **A sibling failure has nothing to do with this flag: the platform can own a
path before either of ours does.** `/healthz` is a correctly registered FastAPI
route that some hosts answer at their own edge, so it 404s in production while
resolving fine in-process. **A route's reachability is a property of the
deployment, not of the code**, and only a request through the real edge can tell
you.

### ⚠️ The watch flow avoided adding a route, and that was the bug

It carried this reasoning until 2026-08-16: the confirm and manage links were
query parameters on `/map/`, so the `trailingSlash` trap was sidestepped rather
than navigated and no new directory had to resolve.

**It cost every mailed link.** `/map` is wrapped in `RequireSession`, so a
subscriber with no Fluud account was redirected to sign-in before `WatchPanel` —
and therefore the effect reading the token — ever mounted; and a reader who *did*
sign in came back to `AFTER_SIGN_IN`, the bare string `"/map"`, with the query
gone. No address could be confirmed and no unsubscribe link worked, for the whole
life of the gate. **Avoiding a route is not free when the route you land on is
gated and the one you needed is not.**

`/watch/` is that route, it has no gate, and the trap was navigated the ordinary
way: a directory under `src/app`, verified through the real mount — `/watch` →
307 → `/watch/` → 200, with `waterline/web/watch/index.html` on disk, and
`/api/watch/subscription` answering **404** rather than 401 signed out.

⚠️ **What survives unchanged is the `useSearchParams` refusal.** `/watch/` still
reads `window.location.search` in an effect and strips it with `replaceState`,
because that hook forces a Suspense boundary under `output: "export"` — and
because a confirm token is single-use and a manage token is a bearer credential.

⚠️ **`/map` keeps a pre-gate redirect for the old shape.** Manage tokens do not
expire and sit in every message already delivered, including archived
`List-Unsubscribe` headers. It is `replace` and never `push`, and it paints a
line rather than nothing.

### ⚠️ `/map` READS THE SESSION as of 2026-08-16, and it is the first page to

`MapWorkspace` calls `useSession()` and passes `session.data?.user?.email` to
`WatchPanel` as `sessionEmail`, which is what lets the wizard show a signed-in
reader their own address instead of an empty field. **The panel imports nothing
from the auth SDK** — the read is here so that module's import graph stays clear
and it stays mountable in a `.design-sync/` preview.

⚠️ **`useSession` comes from `lib/auth-client.ts`, never off `authClient`.** The
SDK types its adapter as a union over every shape it ships, so
`authClient.useSession` is a nanostore `Atom` to the compiler and not callable.
**That shipped wrong once and `next build` caught it**; `./scripts/check` does
not typecheck the web.

⚠️ **This page passes an address and NOT a verdict.** Whether the confirmation
step is skipped is `api.watch_subscribe`'s decision, taken against an
`email_verified` claim on a token it verified against Neon's JWKS, and reported
back in `WatchSubscribeResponse.status`. `SessionState` deliberately does not
expose `emailVerified` — a client reading it would be making a security claim,
and when the two disagreed the UI would either promise a shortcut the server
refuses or hide one it would grant. **`sessionEmail` decides what is drawn and
nothing else.**

⚠️ **Optional chaining is load-bearing on `isPending`.** Before the session
settles this is `undefined` and the panel draws the typed field, which is the
pre-2026-08-16 flow and is the right answer for a signed-out reader.

⚠️ **This is a session read, not a poll, and it does not touch the no-reading
rule.** `/`, `/about`, `/terms` and the auth views are unchanged: none polls
`/api/status` and none may start.

⚠️ **`/map` has TWO gated fetches as of 2026-08-16.** `/api/sensors` is 60s, but
**only while** the list's Sensors tab, the map's sensor layer **or the map's PAIR
layer** is on, and **no request at all** before one of the three is first
switched on. ⚠️ **The pair layer joined on 2026-08-16 and the reason is not
obvious**: `CameraStatus.sensor_id` is an id and not a coordinate, so a
camera→sensor link line cannot be drawn without this payload. It is 150 KB
uncompressed for a surface most readers never open.

⚠️ **`/api/watch/mine` is a THIRD gated fetch as of 2026-08-17, and it is the
only one that is never polled.** `watch-panel.tsx` asks it once, when the session
settles: *does this reader's own proven address already have a watch?* If it
does, **the wizard does not run** — the panel mounts `ManageFace` with the real
subscription, because `api.watch_subscribe` does not apply picks to an existing
row and that flow ended in a receipt that changed nothing. It carries no reading,
no depth and no age, so there is nothing on it to go stale, and it takes no
address, which is what keeps the *"is this address on Fluud"* oracle out of it.

⚠️ **`/api/cameras` is the second and its gate is STICKY.** `registryWanted`
starts false, so at rest the camera layer draws the 27 already on `/api/status`
and **nothing is requested**; the first change to the camera filter opens it and
it stays open for the session. Flipping the layer's source between 27 rows and
968 on every chip press would re-render the whole marker layer each time. ⚠️ **The
honest cost is at that `useState`**: at rest the `paired` chip describes
`WATCH_CAMERAS` rather than the `pairs` table, and those two sets being identical
is a fact about today's data rather than a property.

⚠️ **This page also resolves a selection against BOTH camera payloads now.**
`pickAlive` and `selectedRegistryCamera` are why pressing one of the 941
unwatched pins selects it instead of falling through to the worst-camera
fallback — which would read as the map being broken. **They are not merged with
a `??`**: the two rows carry different clocks, and a face built from whichever
field happened to be present would age a FloodNet timestamp on our poller's
thresholds.

## ⚠️ `/` is a LANDING PAGE again, and the sign-in card moved to `/auth/sign-in/`

⚠️ **SIXTH shape, 2026-08-16, on the owner's instruction — and the fifth lasted
part of one day.** The fifth was a hero, three prose `LandingSection`s and a
footer; the sixth is built to a supplied design and `landing-section.tsx` is
**deleted**, nothing having mounted it since. `src/components/landing/` now
holds four files: `landing-hero.tsx` (the photographic hero),
`landing-sections.tsx` (the inventory and the illustrated sensor face),
`notify-walkthrough.tsx` (⚠️ **the watch section, which is a LOOPING VIDEO and
nothing else**) and `landing-cta.tsx` (the session-aware door, shared by the
hero and the closing band). The closing band is `components/photo-cta.tsx`,
**shared with `/about`**.

❌ ⚠️ **The watch section was a header, a body paragraph, a three-step `<ol>`
and an illustrated `EmailCard`, and every one of them was DELETED on
2026-08-16, on the owner's instruction.** `LandingNotify` renders one full-bleed
`<video>` inside its band. **This is the first video this site has ever
served**, it is 2.7MB of committed build input across four files in
`public/motion/`, and it is the only surface here whose copy a compiler cannot
read. The `sr-only` block in `notify-walkthrough.tsx` is that copy's one home;
`web/scripts/motion/README.md` is the recipe and the rule list.

**The route was kept through all six shapes**, and that is not cosmetic:
`api.py` mounts the export with `StaticFiles(html=True)`, so a missing root
`index.html` answers with the 404 page.

⚠️ **What came back was a SHELL, and the sixth shape is not.** The deleted
landing components rendered **live** readings — a citywide card, an address
search, a verbatim WATCH template — and the prose shell that replaced them had
no slot a number could arrive through at all.

⚠️ **The design built on 2026-08-16 puts a depth back on this page, and it is
ILLUSTRATED rather than live.** A `180 mm` sensor face on the depth ramp and a
`WARNING` email at `57 mm`, **on the owner's instruction**, reversing the Never
rule that said no reading at all here. **Four conditions were to hold and all
four were load-bearing** — every figure a fixed literal, an
`EXAMPLE · not a live reading` label above each card, no live clock (`ReadingAge`
may not be mounted), and every offset on the ramp derived from one constant.
❌ ⚠️ **The label was DELETED later the same day on the owner's instruction**,
and it was the only one of the four a reader could see; the other three hold.
**A page carrying an unlabelled illustration of a depth is the standing cost, not
a satisfied rule.** The full argument is in
`src/components/landing/landing-sections.tsx`; the narrowed rule is in the root
`CLAUDE.md`.

⚠️ **The refactor to refuse is lifting those cards onto `/api/status`.** The
shapes are right there and the hook is one line, and that is precisely what the
deleted `citywide-card.tsx` was: a live figure on the page a signed-out reader
lands on, with no session to fetch it and no chrome to dress it. **This page
still does not poll and must not start.**

### ⚠️ The gutter and the type scale are SHARED, and unmeasured

⚠️ **`px-6 sm:px-12 lg:px-20` is the document gutter on `/` and `/about`**, as
of 2026-08-16 on the owner's instruction — it was `px-5 sm:px-8 lg:px-11`.
**`SiteNav` carries the same three values and must keep carrying them**: it is
full-bleed chrome above a full-bleed body, so a nav on a different gutter puts
the wordmark out of line with every heading under it. `PhotoCta` and the landing
hero are on it too. ⚠️ **`SiteFooter` is NOT** — it is a centred
`max-w-[1320px]` box with its own `px-6`, which is a different system and was
left alone.

⚠️ **The section type scale went up in the same change** — landing `<h2>` 26/30px
→ **32/42px**, the hero's strapline 24/34 → **28/40**, ledes 15.5/16.5 →
**16.5/18**, section padding `py-16 sm:py-20` → **`py-24 sm:py-32`**, the hero
540/580 → **580/660**, and the title rail 300 → **340px**. ⚠️ **`/about`'s `<h1>`
went the other way**, 48 → **30px**, because that masthead is centred on the
wordmark now and the two were competing.

⚠️ **NONE of it has been through a browser.** These are `/` and `/about`, which
are outside the session gate and therefore cheap to check — the wordmark holding
one line at 390 is the one that bites, and `web/CLAUDE.md` records how to measure
it (the **height** against the line-height, never `getClientRects().length`).

### ⚠️ The document WASH is shared, and it is TWO tokens now

`--wl-wash`, 2026-08-16 on the owner's instruction: a blue gradient on the flat
bands of both pages. Both alternate flat bands with full-bleed photographs, and a
flat band beside a photograph reads as a hole rather than as a surface.
**Nothing else on the site takes it**; `SiteNav`, `SiteFooter` and `/terms` are
untouched, and `/map` is not a candidate.

**Three bands take it and no more**: `LandingInstruments` on `/`, the masthead
and the inventory grid on `/about`. ⚠️ **It was five, then four, and it is
three** — the counts and the sources merged into one grid later on 2026-08-16
(two gradient boxes became one, and the sources moved from page background onto
`--card` with the counts), and then `LandingNotify` left for its own token. The
two pages landed an hour apart — `/about`'s with the token, `/`'s riding in with
the notifications video — so they read as two changes. **They are still one
decision**, and retuning the shared wash from one page is retuning both.

⚠️ **`--wl-wash-vertical` is the second token and `LandingNotify` is its ONE
caller.** Owner's instruction, 2026-08-16: a blue gradient down the *Set your
alerts* band, **light at the top and dark at the foot**, same hue and same
refusals, roughly twice the strength. **It is the only band on either page that
diverges**, and it is the reason the sentence above stopped being *retuning the
wash retunes the page* — a change to either token now has to be read against the
other, because two bands on `/` are meant to differ and a third state is drift.

⚠️ **Vertical is the one axis `--wl-wash` refuses, and the exception is bought
by having TWO STOPS.** The 160deg argument is that a mid stop on a vertical ramp
draws a horizontal edge across a full-bleed band, and a flat horizontal line is a
level this site does not mean to draw. A two-stop ramp has no inflection for one
to sit on. **A third stop added "to smooth it" restores exactly the failure the
angle was avoiding.**

⚠️ **It is TRANSLUCENT, which is why there is one token rather than one per
ground.** It composites over whatever the band already sat on, so `bg-card`
stays where it was and the tinted and untinted bands keep their one step of
separation. It is declared in `:root` and **not** in the derived
`:root, [data-palette]` block, because it holds no `var()` of a palette slot and
therefore cannot freeze — verified against a scoped `data-palette` descendant.

⚠️ **It was written as `color-mix` into `var(--background)` first and that
version shipped a bug.** Tailwind emits an `@supports` fallback for a
`color-mix` it can see, and that fallback **drops the percentage** — leaving
`#3d7fd0` at full strength across 58% of every band, i.e. a page of electric blue
slabs on any browser without `color-mix`. Read out of the built stylesheet.
**Do not put a `color-mix` back into a custom property Tailwind can see.**

⚠️ **It takes no input and it never may.** `.wl-swell`'s rule, which binds the
shape rather than the deleted file: a ground driven by a depth, a level, `mode`
or the time of day is a reading with no age, no plausibility and no scale — and
`/`'s two illustrated cards sit on top of one. The angle is off 180 for the same
family of reason: a flat horizontal edge across a full-bleed band is a level this
site does not mean to draw. The argument is at the declaration in `globals.css`.

✅ **Measured 2026-08-16 through the real static mount**, both pages at 1440×900
and 390×844: the two flat sections on `/` and all three on `/about` carry it, the
hero and both photo bands do not, `--card` is unchanged under the counts, and
**horizontal overflow is zero at both widths on both pages.**

⚠️ **That reading predates the split and describes `--wl-wash` alone.** It is
kept as what was true when it was taken. **`--wl-wash-vertical` has NOT been
through a browser** — the top row's hex is arithmetic (`~#16263c` over estuary's
`--card` `#0d131b`), and the two things to look at are whether the stronger blue
still lets the video frame's 1px `--border` read against it, and whether a
two-stop ramp bands visibly down a `py-32` band at 1440. `/` is outside the
session gate, so this is cheap.

### ⚠️ A signed-in reader STOPS here now, and that is a reversal

The previous shape's `SignedIn` branch was `OpenTheMap`, which `router.replace`d
straight to `/map`. That was right for a door and is **wrong for a page with
four sections on it** — a reader with a session could never read them. The
branch is a `CtaLink` to `/map/` now, in `landing-cta.tsx`, which the hero and
the closing band **share** rather than each holding a copy of the three
branches.

⚠️ **If a redirect ever goes back on this route, the four sections become
unreachable to everybody who is signed in.** The redirect's own rules are worth
keeping for whatever page next needs one: `replace` and never `push`, because
with `push` Back returns to `/` and redirects forward again; and paint a line
rather than nothing, because a blank frame during navigation is
indistinguishable from a dead auth service.

⚠️ **All three `LandingCta` branches paint something**, which is the surviving half of
that. `SignedIn` and `SignedOut` both render nothing until the session query
settles, and against an unreachable auth host it never settles at all — so
without `AuthLoading` a dead Neon is a hero with a hole under it, indefinitely.

### ⚠️ Two recorded debts are PAID and one is not

- ✅ **`/about` is reachable from `/` again.** It went with `SiteFooter` on
  2026-08-14 and was recorded as a debt rather than a decision. Both `SiteNav`
  and `SiteFooter` link it now.
- ❌ ⚠️ **The never-safe claim was repaid here and then DELETED, on the same
  day.** The notifications section ended *"Fluud reports what the sensors
  see."*; `/about`'s rules block stated it too and went with that page's cut, and
  this line went hours later **on the owner's instruction**. **`/terms` §03 is
  what is left**, and it is a page away, behind the footer.
  `src/components/CLAUDE.md` called this the weakest point on the site when the
  claim had three homes. **It has one, and no reader meets it without choosing
  something. If one sentence goes back anywhere, it is this one, here.**
- ❌ **The verbatim WATCH template did NOT come back.** Nothing on any page shows
  a reader what a warning looks like. `check_escalation.py`'s `LANDING_QUOTE`
  assertion is still deleted, and **a quote returning here returns with that
  assertion beside it.**

⚠️ **The copy carries COUNTS again as of the sixth shape** — 425 and 968, in
`landing-sections.tsx`. `MEASUREMENTS.md` records the surfaces hard-coding
425 / 968 / 27 that rot, and this page rejoins that list: `about-sections.tsx`
quotes the same two and **the two re-measure together.**
`python -m waterline.poll probe` is the authority.

### ⚠️ The photographs are committed at 2200px and the sources are not

`web/public/photoz/*.webp` — seven files, 2.0MB, **committed**. The camera
originals are seven 5504×3072 JPEGs at 79MB in `web/photoz-src/`, **gitignored
and dockerignored**, with the `cwebp` recipe written at the `.gitignore` entry.
Same trade as `assets/black-rat/` and the graffiti generator: keep the source on
disk, keep the megabytes out of history, commit only what ships.

⚠️ **`COPY web/ ./` would drag all 79MB into the Node stage and then into the
image**, for files nothing serves — which is why the dockerignore entry is not
optional.

⚠️ **Decoration: empty `alt`, `aria-hidden`, no `title`.** Describing them
invents copy nobody reviewed. **They may never carry a reading, a mark, a scale
or an overlay** — a photograph of water with anything drawn on it reads as a
measurement of that water.

### ⚠️ `/` no longer polls `/api/status`, and that has not changed

`SiteNav` takes `mode={null}`, so `ModeBadge` says `UNKNOWN` — the truthful
answer before anybody has proved anything. With `REQUIRE_AUTH` on, a poll here
is a guaranteed 401 on the one page whose whole job is that the reader has no
session yet, rendered by `lib/messages.ts` as *cannot reach the service*.

## ⚠️ The auth views are the sign-in surface now, and they carry no chrome

`auth-page-client.tsx` is a 50-50 split: the card and a fixed photograph. **One
component serves all twelve views**, which is the property to keep — a second
sign-in surface looking different from this one would be two doors wearing two
faces.

⚠️ **No `SiteNav`, no `PaintRule`, no `SiteFooter`.** The wordmark at top left
is a real `<Link>` back to `/` and is the only way off the page.

⚠️ **These are the pages with no footer now, and `Terms` / `Privacy` under the
card are what pay for it.** `/terms` is reached from `SiteFooter` and nowhere
else, and it is the page disclosing what signing in stores about a reader — §04
names `neon_auth.session`'s `ipAddress` and `userAgent`, and
`neon_auth.account.password` since `credentials` went on. **A reader cannot agree
to terms they have no route to, and this is the page where the agreeing
happens.** `/` carried this pair for exactly this reason until it became a
landing page; **the job moved with the card.** Removing those two links is
removing the footer's last job here.

⚠️ **`Privacy` points at `/terms/#privacy` by NAME, never by numeral.**
`NumberedSection` carries an optional `id` and `TermsPrivacy` carries
`id="privacy"`. `/about` renumbered 01–07 → 01–06 once already, so `#05` would
have silently moved. **Renaming that anchor means fixing this file in the same
commit.**

⚠️ **This is the one anchor exception to `site-nav.tsx`'s
every-navigation-is-a-route rule.** That rule exists because the nav renders on
several bodies, so an in-page anchor is broken on at least one. A link naming its
page *and* its fragment resolves from anywhere.

⚠️ **The photograph is FIXED and must not be randomised or rotated.** A reader
who fails a sign-in and retries would meet a different picture on the same page,
which reads as having landed somewhere else — `ratFor`'s argument, one deleted
component over. It is `hidden lg:block` on the **wrapper**, so below `lg` the
`<img>` is not in the DOM and is never fetched; the reader most likely to be on a
metered connection is the one on the phone.

⚠️ **Nothing here polls, renders a reading, or shows a mode**, for `/`'s reason.

### What the 2026-08-14 deletion cost, and where each thing went

Recorded here rather than in git, because three of these were carrying rules and
only one of the rules has another home.

⚠️ **This is the record of what the OLD landing page was carrying, and the page
coming back on 2026-08-16 did NOT restore it.** One entry is now partly paid —
the never-safe claim, by section 03 — and it says so inline. **Everything else
below is still gone.** Read this list before assuming a returned landing page
brought its contents with it.

- ❌ ⚠️ **Two never-safe enforcement points.** `citywide-card.tsx` refused the
  design's *"No flooding right now"* headline — rendered at 30px in green above
  a column of green pills — and said instead *"This is a statement about 27
  instruments, not about your block — everywhere they are not is unobserved, not
  clear."* `block-search.tsx`'s four `AddressNote` branches said the same thing
  about a search that found nothing, including a **far** branch that fired when
  nothing near a reader was measured at all.

  **The rule is unchanged and still enforced** in `station-list.tsx`'s empty
  states, `/terms` §03 and `/about`'s rules.

  ❌ ⚠️ **PARTLY PAID on 2026-08-16 and UNPAID the same day.** The new landing
  page's section 03 ended *"Fluud reports what the sensors see."* — the
  unconditional statement this entry said was missing — and it was removed **on
  the owner's instruction** hours later. The pair of EMPTY-STATE refusals never
  came back either, so nothing anywhere converts an empty result into a refusal
  to call a place clear. **This entry is back to its original state and `/terms`
  §03 is the only prose left.**
- ❌ **The one verbatim WATCH template this site ever showed a reader**, under an
  `Example · one of the WATCH templates, verbatim` chip, with `{place}` left
  visible as a slot so it could not be mistaken for a live warning about a real
  corner. `check_escalation.py`'s `LANDING_QUOTE` pinned it and is deleted with
  it. **Nothing on any page now shows what a warning looks like.**
- ❌ ⚠️ **`.wl-swell`, the site's only moving decoration**, and the Never rule it
  carried: a water animation may never take an input, and must rest **high**
  under `prefers-reduced-motion` because that reader sees one frame forever and
  water that has gone down is the claim this site never makes. Deleted from
  `globals.css` rather than orphaned, with the argument preserved as a comment at
  the point of deletion — **nothing in `./scripts/check` can reach CSS**, so that
  comment and this entry are the whole of the enforcement.
- ❌ **The address search on this page.** `lib/geosearch.ts` and
  `address-lookup.tsx` are untouched and still mounted twice on `/map`. What is
  gone is the copy of the field a first-time reader met.
- ❌ **`.wl-pulse`**, the freshness dot on the citywide card. Deleted, on the
  standing precedent that dead decorative CSS is how a stylesheet accumulates
  rules nobody dares touch.

### What survived, and why it is worth knowing

- ✅ **`SiteNav`, `PaintRule`, `SprayDefs` and `SiteFooter`** — the chrome the
  non-instrument routes share. `PaintRule`'s fourth band is still **lime, not
  green**: a full-width green band above the wordmark reads as "everything is
  fine" across a room. ⚠️ **All four are back on `/` since 2026-08-16** and the
  set now renders on `/`, `/about` and `/terms`. ⚠️ **The `/auth` views DROPPED
  three of them in the same change** for their split layout, and `/map` dropped
  `SiteFooter`. **`SprayDefs` is the one every wordmark-bearing route must
  mount**: an SVG filter id is document-scoped.
- ✅ **`ModeBadge`, outlined and never a filled green slab**, starting at
  `UNKNOWN`. ⚠️ **Back on `/` with `SiteNav`, and still `mode={null}`** — that
  page does not poll and must not start.
- ⚠️ ❌ **`/` HELD the no-reading rule through the fifth shape and the sixth
  narrowed it.** It was a word, a card and two links, then a hero and three
  prose sections whose props had no slot a number could arrive through. The
  design built later on 2026-08-16 puts two **illustrated** depths on the page,
  on the owner's instruction. **What the rule was protecting is unchanged and is
  what the four conditions above enforce**: a number here comes with none of the
  chrome — timestamp, plausibility, freshness — that makes a number on `/map`
  legible, which is exactly why every figure on `/` is a literal wearing an
  `EXAMPLE` label rather than anything off the wire. ⚠️ **`/about` and `/terms`
  still hold the rule outright and render no figure at all.**

### ⚠️ Numbers this page quotes, and the two filenames that came back

The deleted `landing-hero.tsx` and `landing-sections.tsx` hard-coded counts from
`MEASUREMENTS.md`'s **Verified live** section — 425 deployments, 968 cameras, 27
pairs, 213 NTAs — and each said so at the top of the file. ⚠️ **Both filenames
exist again as of 2026-08-16 and are not the same components**, so a note about
either predating that date is about code that is gone.

⚠️ **The new `landing-sections.tsx` quotes 425 and 968.** 27 and 213 did not
come back. **`about-sections.tsx` quotes the same two**, so the two files rot
together and re-measure together. `python -m waterline.poll probe` is the
authority.

⚠️ **The first 2026-08-16 landing page did not bring them back and the SECOND
one did.** 425 and 968 are in `landing-sections.tsx`'s inventory cards, so this
section's warning now applies to two pages: `about-sections.tsx` and `page.tsx`
quote the same two figures and **they re-measure together.** The counts the old
page carried that did *not* return are 27 pairs and 213 NTAs.

## The About page

⚠️ **CUT to a supplied design on 2026-08-16, on the owner's instruction, from
six numbered sections to TWO bands and a photograph.** It is a masthead, one
inventory grid, and a `PhotoCta` closing band shared with `/`.
`NumberedSection` is gone from this page; `/terms` is its only caller now.

⚠️ **The grid is a merge, later the same day and also on the owner's
instruction.** The two inventory counts were their own full-bleed band and the
sources table another; they are one `lg:grid-cols-2` section now — counts stacked
left, sources right — so `AboutInstruments` and `AboutSources` are gone and
`AboutInventory` is what the page mounts. **All seven sources survived it**, and
a source may never be dropped to make that column fit. The argument for the
single ground, and for the two phrases that were trimmed, is at the component.

### ⚠️ Four rules lost their only prose home in that cut

**This is the accounting and it is deliberately here rather than only in git.**
The section-by-section version is the docblock in
`src/components/about/about-sections.tsx`.

- ❌ ⚠️ **The second-witness rule.** *"How it decides"* was the only page-facing
  explanation of why this app does not trust a bare depth threshold, and it
  stated the two borrowed figures with their sources. The rule is still enforced
  in `watch.is_credible` and `escalation._depth_is_credible` and pinned equal by
  `check_watch.py`; **no surface explains it to a reader.** The two thresholds
  survive as figures on `/`, under an illustration, without their argument.
- ❌ ⚠️ **The coverage rule in prose.** *"What it cannot see"* said that empty
  space on the map is unobserved and that absence of coverage is not absence of
  flooding. `LIMITATIONS.md` §2 still argues it and the map's panel footer still
  counts what its marks withhold — **but no page says it to somebody who has not
  opened the instrument.**
- ❌ ⚠️ **The never-safe rule in prose.** It was in the intro's rules block.
  `/`'s notifications section carried one line — *"Fluud reports what the sensors
  see."* — for part of the same day and it was deleted too. **`/terms` §03 is
  what is left**, and no reader meets it without choosing something.
- ❌ ⚠️ **The MIT licence statement**, with the sources section's three closing
  paragraphs: *every source is public*, the basemap being ~1,400 committed
  coordinates with no tile server and no map library, and the display face being
  the one thing fetched from elsewhere. **Nothing on this site states the
  licence now.** The `Access` column went with them, so the table no longer says
  which sources are fetched by hand.

### ⚠️ The masthead is CENTRED and the closing headline is a question

⚠️ **Both landed 2026-08-16, on the owner's instruction.** The masthead was a
two-column band — label and `<h1>` left, mark and wordmark right; it is a centred
stack now, wordmark first with *"A flood watch for your block"* as a **tagline**
under it. Two consequences are written at the component: the `<h1>` dropped
48 → 30px so the wordmark stays the subject, and the mark lost `max-lg:hidden`,
which was right beside a heading and would have left a phone with no masthead
above one.

⚠️ **The `PhotoCta` headline is *"Got alerts?"***, eleven characters against a
`max-w-[22ch]` line at 38px. **If it reads too small for the band, the lever is
the headline's type size in `photo-cta.tsx` — which `/` SHARES**, so a bump there
moves both pages' closing bands.

⚠️ **`AboutContext` went too** — the five gauge datums that are never one scale,
and the CSO outfalls being a dated registry rather than tonight's discharge.
**That last one was a recorded debt being partly paid here and it is unpaid
again**; the root `CLAUDE.md` still owes it as text in the map's panel footer.

⚠️ **The page shipped with seven sections and this is the second cut.**
`AboutWords` — *"The words"* — went on its own, taking the only copy that said
**unreviewed languages are refused rather than machine-translated**
(`agent.PENDING_REVIEW`, `api.speak`'s 400). That rule already had no page-facing
home before this change; it now has company.

### ⚠️ What the page still is, and what it must stay

**It renders no figure of any kind** — no depth, no age, no severity colour, no
count of what is happening right now. It is inventory and credit.
⚠️ **`/` stopped holding that property on the same day** and this page is **not
to follow it**: there is nothing on `/about` for an illustration to illustrate.

⚠️ **It no longer polls `/api/status`, and dropping the hook dropped
`"use client"` with it.** It fetched two things — the borrowed thresholds and
the mode badge — and the thresholds went with the section that quoted them.
`SiteNav` takes `mode={null}` and `ModeBadge` says `UNKNOWN`, which is `/`'s rule
arriving here for `/`'s reason: with `REQUIRE_AUTH` on that request is a
guaranteed 401 for a signed-out reader, rendered as *cannot reach the service*.

⚠️ **It must stay readable SIGNED OUT.** A reader cannot agree to terms they
have to sign in to read, and this page and `/terms` are the two documents that
argument covers.

⚠️ **It quotes no warning copy, and nothing does.** The landing page carried the
one verbatim template this site ever showed and it is still gone, so adding one
here would make this the only copy of a string that lives in `agent._TEMPLATES`.
If a quote returns anywhere it returns with `check_escalation.py`'s
`LANDING_QUOTE` assertion beside it.

⚠️ **Nothing on it takes a severity colour.** The two count accents are poster
paint — `--wl-cyan` and `--wl-select` — and there is no reading beside them for a
colour to encode. A count tinted by severity would be this page reporting a
condition.

⚠️ **`.wl-brick` came off this page with the cut and `/terms` is its last
caller.** The design draws a flat masthead. The argument for the texture was
that the map and the landing page should read as one site; `/` is a photographic
landing page now and matching it means flat. **Restoring the brick anywhere is a
decision on its own merits.**

❌ ⚠️ **The sources table's scroll box is GONE, because the table is.** It was
`overflow-x-auto` around a `min-w-[460px]` two-column table — the rule every wide
surface on this site follows, and the failure it prevented was measured at 390px
on an earlier shape of this page: an implicit `auto` column floored at the
table's own `min-w`, resolving to 568px and scrolling the whole document sideways
by 194px. Half a page is not enough for `Source` beside `What it gives`, so the
pair stacks in a `<dl>` and **there is no wide surface left to wrap**. ⚠️ **The
rule is satisfied by construction rather than repealed** — measured at 390 after
the merge, document overflow zero and not one element in the band scrolling
sideways. **Anything wide added back to that column brings the box back with
it.**

## The Terms page

Seven numbered sections in `NumberedSection` — the same shell `/about` uses,
which is why that component was extracted rather than copied. Reached from the
footer and nowhere else: a legal link beside the product's only call to action
would trade the thing a first-time reader is there for.

⚠️ **Every factual claim on it is checkable against this repo, and that is the
standard it is held to.** A terms page is the one surface a reader is entitled
to treat as a commitment, so an overstated privacy property here is worse than
having no terms page at all. Three sections are code in prose and each moves
when the code moves, **in the same commit**:

- **§04 is `schema.sql`'s subscriber record**, listed in full rather than
  summarised, with the explicit absences. It also states that unsubscribing is a
  hard delete with a cascade, and that **silence is ambiguous**. ⚠️ **It is also
  the sign-in record**, which is Neon's and bigger than ours, and it names
  `ipAddress` and `userAgent` because the paragraph above it says we hold
  neither.

  ⚠️ **It carries TWO sign-in shapes since 2026-08-14 and it moves with
  `auth-provider.tsx`'s `credentials` prop.** That prop went on, so email
  sign-up sits beside Google and Neon writes a hash to
  `neon_auth.account.password`. §04 named only the Google fields and was
  rewritten in the same commit — **a record description covering one of two
  sign-in paths is wrong for every reader who took the other.** A passkey, a
  magic link or a second provider each owe this section an edit.
- **§05 is `lib/geosearch.ts`'s guarantees**: geocoded in the browser, never
  received here, never stored including in a cache, never coupled to the watch
  flow, and no cookies / local storage / session storage / analytics.
  ⚠️ **A server-side geocoder would make this section a lie the same day.**
  ⚠️ **It carries `id="privacy"`** because `/`'s `Privacy` link targets it.
  **The anchor is a name, not the numeral** — this page renumbered once already.
  Renaming it means fixing `src/app/page.tsx` in the same commit.
- **§06 names the upstream owners** and states that the code is MIT licensed
  while the artwork is not.

⚠️ **`EFFECTIVE` is a constant at the top of `terms-sections.tsx` and it is
bumped with any edit below it.** A terms page whose effective date lags its own
text tells a reader they have read the version they agreed to when they have
not.

⚠️ **`CONTACT` is `null` and the contact paragraph does not render.** Publishing
an address is the owner's call, so it is one line to change rather than an
omission to rediscover.

⚠️ **§03 carries the never-safe rule in words**, alongside the coverage and
coverage-bias rules and *call 911*. The footer's never-safe paragraph was
removed, so this and `/about`'s rules are the two places the claim is stated in
prose — both a page away.

## The display face, and the trade behind it

⚠️ **`src/app/layout.tsx` links an Adobe Fonts kit. It is one of two
third-party origins on this site.** Adobe's licence forbids re-hosting, so
"commit the asset and serve it ourselves" — what this repo does for the basemap,
the rats and everything else — is genuinely unavailable here.

`components/spray.tsx` is where the two halves meet, and the split is the whole
reason this is survivable:

- **the face** is `--font-display`, fetched;
- **the paint** is a local SVG displacement filter, not fetched.

So a blocked kit degrades to the system stack at its heaviest weight *still
wearing the paint*. `font-black` against a kit that ships 400/700 is deliberate:
CSS matching resolves 900 to the kit's real 700 while the fallback takes 900 and
renders as heavy as the system allows. One declaration, both paths at their
heaviest.

⚠️ **Nothing that carries a reading or an age is set in this.** All of it is
`--font-sans` / `--font-mono`.

## The theme — `globals.css`

### ⚠️ The Tailwind import is SPLIT INTO THREE, and the third line is unlayered

`@import "tailwindcss"` is exactly `theme.css layer(theme)` +
`preflight.css layer(base)` + `utilities.css layer(utilities)`. This file writes
the three out and **drops the layer on the last one**, which is the fix for a bug
that had been live since Neon Auth landed.

`@neondatabase/auth/dist/ui/theme.css:194` emits, outside every cascade layer:

```css
* { box-sizing: border-box; border-color: var(--neon-border); outline-color: var(--neon-ring) }
```

⚠️ **Unlayered CSS beats every layered rule regardless of specificity.** So a
zero-specificity `*` from a third-party package outranked
`.border-\[var\(--wl-live\)\]` at (0,1,0) — and with it `ModeBadge`'s provenance
green and grey-violet, `SensorRow`'s `border-l-[var(--wl-select)]` selection
edge, and the `--wl-stale` / `--wl-dead` panel borders. **Every one of them was
emitted into the stylesheet and none of them applied.** Measured in
`.design-sync/.cache/compiled.css` before the fix: `@layer utilities` spanned
bytes 9931–128007 and that rule sat at 134288.

⚠️ **Unlayered, our utilities win on specificity alone**, wherever the auth
import sits — which is what makes this a fix rather than one more ordering rule.

⚠️ **`layer(base)` on the auth import was the obvious fix and it is not
available.** That stylesheet contains `@source "./.safelist.html"` and the build
fails with `` `@source` cannot be nested ``. Do not retry it.

⚠️ **Re-collapsing the three lines restores the bug silently** — the utilities
stay in the stylesheet and stop applying. Nothing in `./scripts/check` reaches
CSS. The check is a browser: the LIVE badge draws a green outline, or the import
has been collapsed.

### ⚠️ The auth UI's stylesheet is imported ABOVE the theme, and the position is load-bearing

`@import "@neondatabase/auth/ui/tailwind"` sits with the other imports at the
top of the file, before `@theme inline` and the `:root` block. That is not
tidiness. The auth UI declares its **own** `:root` values for slots this file
owns — `--background`, `--primary`, `--border`, `--radius` and more — at the
same specificity, so the later declaration wins. Imported above, Fluud's palette
overrides the library's and the sign-in card comes out in this site's theme.
**Moved below, a third-party stylesheet silently becomes the master for every
page**, because this file loads once for the whole app.

That is the "supplied master" rule below arriving through an import rather than
through a hand-tuned slot, and the response is the same: **if the auth card ever
looks wrong, check that this line has not moved** — do not tune a slot beneath
it.

⚠️ **ONE import method.** The package ships this Tailwind entry and a compiled
`@neondatabase/auth/ui/css`. Importing both duplicates every rule. This project
is Tailwind v4, so it takes the Tailwind one and `ui/css` must never appear.

⚠️ **Nothing in `./scripts/check` can reach CSS**, so this section, the comment
at the import, and a browser pass are the whole of the enforcement.

### ⚠️ `<html suppressHydrationWarning>` is for `next-themes`, and it is scoped

`@neondatabase/auth-ui` bundles `next-themes`, which rewrites `<html>`'s class on
mount and adds `style="color-scheme: dark"`. Measured: server renders
`class="dark h-full antialiased"`, client produces
`class="h-full antialiased dark"` plus the style, and React logs a hydration
mismatch on every load.

⚠️ **The attribute is on that one element and does not inherit**, so a genuine
mismatch anywhere inside the tree still reports normally. ⚠️ **What keeps this
cosmetic is `defaultTheme="dark"` in `auth-provider.tsx`** — `next-themes`
defaults to `system`, and without that prop a reader on a light-mode phone gets
the class flipped to `light` on a site with no light palette. That would not be a
warning to suppress; it would be a page to fix.

### ⚠️ `layout.tsx`'s root classes are MIRRORED outside this tree

Since 2026-08-15 `.design-sync/fluud-root.tsx` re-states `<html className="dark
…">` and `<body>` as a mountable `FluudRoot`, because a design built from this
library has no `layout.tsx` to inherit them from. It is the reason `dark:`
variants resolve there at all: the variant is `&:is(.dark *)`, so it needs a
`.dark` **ancestor**, and without one 36 of 56 exported components rendered
nothing and the rest put dark token values on a white page.

**If the root classes here change, that file changes with them.** Nothing
enforces the pairing — same gap as the CSS rules above. See `web/CLAUDE.md`.

### ⚠️ THREE palettes, and ESTUARY is the one that ships

Imported from the Fluud design system on 2026-08-15, on the owner's instruction,
and **estuary was retuned and wired the same day** — `layout.tsx` carries
`data-palette="estuary"` on `<html>`. Bitumen is the `:root` block and
`[data-palette="sodium"]` is the third; both are available and neither is
mounted. `[data-type="proposed"]` is a self-hostable type stack and is still
unwired. Change the palette by editing that one attribute. **There is no toggle
in the UI and there must not be one on the page itself.**

⚠️ **What shipping estuary moved, and what it deliberately did not.**
`--primary` and `--ring` went from magenta to `#4d8dff`, `--wl-violet` to a deep
`#1e62d0`, `--wl-rule` to `#152030`. Because `--wl-select` and `--wl-graph` are
`var(--primary)`, **selection and both sparkline traces went blue with it** —
`--wl-graph` is still constant across every level an instrument can report, so
it still encodes nothing. Not one depth band, staleness, provenance or
instrument-slate token moved, and the byte-identical audit across all three
still holds.

⚠️ **`--wl-cyan` is `#35d6f2` here, which is `Start Monitor`'s rest colour** —
the 10.48:1 figure in `components/CLAUDE.md` was measured against bitumen's
`--card` and is stale until somebody re-reads it against `#0d131b`.

### ⚠️ Thirteen tokens were derived through `var()` at `:root` and FROZE

`--wl-panel`, `--wl-select`, `--wl-graph`, `--wl-cyan` and the nine semantic
aliases were all `var()` of a slot a palette moves. **A `var()` inside a custom
property substitutes at computed-value time on the element that declares it, and
the result inherits** — so declared at `:root` they compute against the base
palette and a `[data-palette]` on a **descendant** never moves them.

⚠️ **Invisible here, total in the design system.** On this site the attribute is
on `<html>`, which *is* `:root`, so the two rules match one element and it
resolves correctly by accident. In `web/.design-sync/` a design agent wraps a
`<section data-palette="estuary">` and thirteen tokens freeze at once — every
`PanelHeader` in the scope painted bitumen's purple chrome. Found that way, in
`Estuary-Dashboard-2A`.

They are declared in a `:root, [data-palette]` block near the bottom of the
file. ⚠️ **It must stay BELOW every palette block** — all three selectors are
(0,1,0), so position is the whole mechanism, and moved above them the fix
silently does nothing. ⚠️ **Only tokens that DEPEND on a palette slot belong in
it**: `--wl-sensor: var(--wl-gauge)` stays in `:root`, because no palette
overrides `--wl-gauge` and it cannot freeze.

⚠️ **Three of Neon's `--neon-*` are re-pointed there too**, for the identical
reason in somebody else's package — `--neon-border`, `--neon-ring` and
`--neon-foreground`, the three consumed by rules that reach every element on the
page. **Not a general mirror of their token set; do not grow it into one.**

⚠️ **This is NOT the light half coming back.** The master's light values were
dropped rather than carried unused, because a half-present light palette invites
the toggle this page must not have. Both of these are dark and neither can be
switched into a white one — the rule they were dropped under is about a page read
at night, in rain, on a phone.

⚠️ **What a palette may move: the neutrals, the poster paint, the basemap. What
it may NEVER move: the safety colours.** The depth bands, staleness, provenance
and the instrument slates are declared once in `:root` and no palette block
overrides one. **Verified in a browser across all three**: `--wl-warning`,
`--wl-emergency`, `--wl-stale`, `--wl-replay`, `--wl-live` and `--wl-gauge` are
byte-identical. That split *is* the system — a palette that could retint the
depth bands would be a theme with an opinion about how deep the water is.

⚠️ **Specificity is EQUAL and source order is what makes them work.** `:root` and
`[data-palette="…"]` are both (0,1,0). The palette blocks win because they come
after. **Moving them above the master silently disables them** — the same failure
mode as the auth stylesheet's import position at the top of this file, arriving
through a different door.

⚠️ **`--depth-flood-bg` / `--depth-curb-bg` ARE re-derived per palette**, and
that is not a contradiction: they are grounds, not ink. The ink comes from
`--wl-warning` / `--wl-emergency` and does not move. A ground is a relationship
to `--card`, and `--card` is a palette's to set — so the contrast arithmetic in
the `:root` block has to be re-run against any new `--card`, and if one lands
past L 0.22 the lever is `depth-band-pill.tsx` rather than the two values.

⚠️ **`data-type="proposed"` is interesting and is not real yet.** Every face in
it (Archivo, IBM Plex Mono, Archivo Black) *can* be self-hosted, which would
remove the Adobe kit and the last third-party origin that costs a reader
anything. **None of the three is self-hosted here either**, so switching it on
today swaps one unfetched stack for another. Making it real means woff2 files in
`public/fonts/` and `@font-face` rules — **never a font CDN**, which is the
origin the whole exercise removes. Its display slot keeps a real fallback for
`--font-display`'s own reason.

### The measured constants are NAMED as of 2026-08-15

`--track-list`, `--track-rail`, `--panel-header-h`, `--gauges-h`, `--notices-h`,
`--row-h`, the `--text-*` scale, `--radius-pill`, the two shadows and the motion
tokens. Every one was already a literal somewhere in `src/`.

⚠️ **`--gauges-h` changed meaning on 2026-08-15 and `--nws-h` joined it.** It was
256px, "the two-up card height at which neither face scrolls"; two-up is gone, so
it is **704px** — the `md`–`xl` height for a five-card grid with the alert block
above it. Above `xl` the slot is `flex-1` and this token does not apply. `--nws-h`
is **112px** and is a constant on `--notices-h`'s terms: a `min-h` there
re-creates an unbounded push, and here that push moves the gauge grid under the
reader as an alert lands on a 15s poll.

⚠️ **704 took three measurements.** 648 was 16px short and 680 was 7px short —
both predicted, both wrong, both caught only by turning card backs over in a
browser. See `MEASUREMENTS.md`.

⚠️ **Naming a constant does not make it authoritative.** The components still
carry these as Tailwind literals, because a class string is what Tailwind scans.
These are the record and the reference. **Where the two disagree the browser
measurement wins and both get fixed** — these are measured, not derived, and
`--track-list` / `--track-rail` in particular are the 312 / 372 the design's
296 / 340 had to grow to.

### The shadcn slots are a supplied master; the safety colours are not

**The master.** Every shadcn slot in `:root` is a theme supplied whole and
pasted verbatim. Do not hand-tune one to fix a component; fix the component, or
replace the master and re-derive everything defined in terms of it. **Only the
dark half is here** — a half-present light palette invites someone to wire up
the toggle this page must not have.

**Derived from it:** `--wl-panel` and `--wl-land` / `--wl-coast`. A hex carried
over from a previous palette is how the city ends up drawn darker than the cards
floating on it.

⚠️ **`--wl-panel` gained a caller on 2026-08-14: the instrument's masthead**,
which wore `.wl-brick` until then. That is the token doing exactly its job — it
is one step below `--card`, so a framed region reads as an object with a chrome
bar, and the masthead now reads as the same kind of chrome as the panel headers
under it. `.wl-brick` stays for `/about` and `/terms`.

❌ ⚠️ **`--wl-notices` was a token in this block and is DELETED**, the same day
and in the same change. It carried the height the NOTICES strip took out of the
workspace so both the desktop grid and the mobile map could subtract it back
out; the strip moved to the foot of the scrolling rail, where there is nothing
to subtract from. **The rule it enforced survives it and is now a comment at the
point of deletion in `globals.css`:** the strip's height is a constant, and a
`min-h` re-creates the unbounded push it exists to remove. ⚠️ **Nothing in
`./scripts/check` reaches CSS**, so that comment and this entry are the whole of
the enforcement — the same terms `.wl-swell` left on.

**Not derived from it, and not the master's to set:** the level ramp, the depth
band grounds, provenance, staleness, `--wl-cso`, `--wl-gauge`, `--wl-sensor` and
`--wl-spray`. The master has no severity slot and must not be given one.

⚠️ **`--wl-sensor` is an explicit alias of `--wl-gauge`, and the aliasing is the
statement**: a sensor marker and a gauge marker are the same *kind* of thing — an
instrument deliberately off the depth band — so they must not drift into two
neutral slates that look like a distinction nobody meant. What separates the
classes is **shape**: a diamond for a gauge, a hollow ring for a sensor, a
filled dot for an outfall.

⚠️ **`--depth-flood-bg` and `--depth-curb-bg` are two of the eight `--sev-*`
values, renamed and unchanged.** There were four pairs, one per ordinal class a
camera used to guess at; that layer is deleted, a depth falls in one of three
bands, and **the lowest band takes no ground at all**. `--sev-dry-bg` was a dark
green, and a green chip under 10 mm is this app reporting that a block is fine.
The four `--sev-*-fg` values were byte-identical duplicates of the ramp tokens
and were deleted outright.

⚠️ **The master's `--accent` used to be an electric green and two call sites had
to stop using it.** This master's accent is the poster cyan, which is on no
scale and cannot be read as "clear" — but **the refusals in `station-list.tsx`
and `drill-controls.tsx` stay anyway**, one master change away from being needed
again, and neither costs anything.

### ⚠️ The master's magenta IS spent, and the rule that allows it is not "it looks fine"

`--primary` reached the page only as the focus `--ring`. Two aliases now spend
it, both **on the owner's instruction**:

| token | value | where |
|---|---|---|
| `--wl-select` | `var(--primary)` | station row, gauge-card ring, both map markers' selected halo, the active filter chips, and the pager hover. ⚠️ **`/`'s `Open the map` button was the sixth and is gone** — that branch redirects now, so **no call site outside `/map` spends this token** |
| `--wl-graph` | `var(--primary)` | `gauge-sparkline` and `depth-sparkline` trace, at rest |

⚠️ **The most surprising call site was the landing page's waterline and it is
deleted with that page.** It is worth keeping the reasoning, because it is the
clearest worked example of the rule in the repo: that was a *moving* magenta
mark in the one section that also rendered real FloodNet depths, and it passed
the same test the other call sites pass — **nothing about it varied with any
reading**. `--wl-cyan` was rejected for that section specifically, because
`SensorResult` printed a fresh depth in it.

**Why this is not the `--accent` mistake wearing a different hue.** Green is
banned for what it *is*: green means clear, so it is a claim about the water
wherever it lands. Magenta is on no scale in this file, so it makes no claim.

> **A colour beside a reading may not vary with that reading unless it is on a
> scale that says so.**

Both aliases pass. `--wl-select` varies with *selection*, a fact about the
reader; `--wl-graph` is constant across every level an instrument can report.
What may **never** take either: the depth, the band pill, the gauge level, the
map's markers.

Three consequences, each a deliberate call:

- ⚠️ **The map's selected halo stopped being a ramp colour.** It was
  `color-mix(… ${colour} 35% …)` — the marker's own colour — so pressing a
  quiet marker haloed it more loudly. It is `SELECT_HALO` now, one constant
  shared by markers and diamonds.
- ⚠️ **Both sparkline traces stopped being green.** The depth trace was
  `--wl-live` — the *provenance* token, borrowed as a chart colour, painting
  green directly under a depth number. The dashed threshold lines keep
  `--wl-watch` and `--wl-warning`, because those lines genuinely *are* claims
  about magnitude.
- **A five-colour per-gauge palette was built and then cut** to one magenta on
  the owner's instruction — the reasoning survives at `seriesColour`.

⚠️ **`--font-sans` and `--font-mono` are still unfetched and must stay that
way.** `next/font/google` fetches at build time and the Docker UI stage has no
egress — the same constraint that keeps the basemap, the CSO layer and the rats
committed. Those two carry every reading and age on the page. **The display
exception is for titles only.**

The page column is `max-w-[1320px]`. shadcn components in use: **card, badge,
alert, button. Nothing else.** No `Button` uses the `default` variant and no
`Badge` does either, so `--primary` reaches the page through **no shadcn variant
at all**.
