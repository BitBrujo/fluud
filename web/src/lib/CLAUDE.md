# CLAUDE.md — the pure layer

Everything the components lean on and the compiler cannot check for them. This
is the only part of the UI with a test suite (`web/tests/`), and it is where a
rule goes when being sure of it matters more than where it renders.

```
api.ts            the client. RELATIVE and same-origin, always — and it now
                  attaches a BEARER TOKEN, because the session cookie cannot
api-types.ts      the wire contract, hand-written, checkable against openapi.json
auth-client.ts    ⚠️ Neon Auth. The site's THIRD third-party origin, and the
                  one whose failure costs the map. `NEXT_PUBLIC_NEON_AUTH_URL`
                  is baked in at BUILD time
auth-views.ts     the twelve auth routes, as plain data. ⚠️ DIRECTIVE-FREE on
                  purpose — `generateStaticParams` runs on the server
camera-filter.ts  ⭑ the CAMERA LAYER's two facets, and every word the map says
                  about what it is NOT drawing. `nws.ts`'s argument one feature
                  over: the copy is here so a test can sweep it, and what makes
                  the filter legal is that sentence rather than the chips.
                  ⚠️ `unpaired` is the WIRE value and `not paired` is the
                  reader's; *gold* / *golden* / *silver* may never reach one
crypto-shim.ts    ⚠️ `crypto.randomUUID` for insecure contexts. Without it the
                  WHOLE SITE dies on `http://<LAN-IP>:3000`. ⚠️ it has a SIBLING
                  outside this tree since 2026-08-15 —
                  `.design-sync/process-shim.ts` — under the same load-order
                  rule for the same reason: both must evaluate before the auth
                  SDK does, and an import sorter breaks either one
depth-band.ts     ⭑ a depth against the two BORROWED thresholds -> pill, marker
                  and (since 2026-08-15) the list row's BAR. Replaced
                  `severity.ts`, which is deleted
depth-window.ts   the depth timeframe — presets, bounds, labels
format.ts         parseServerTime · formatDepth · ageSeconds · frameUrl.
                  ⚠️ `frameUrl` appends a cache-buster QUERY STRING, so it
                  cannot be handed a `data:` URI — which is why no camera still
                  can be faked in a design-system preview
geosearch.ts      ⚠️ the ONLY absolute URL in this app. Browser-only
instrument-query.ts  filter · search · sort · Origin, over BOTH classes, plus
                  LIST_PAGE_SIZE — the list's 20-row page. ⚠️ `tidalOnly` is
                  the one facet that narrows on what an instrument IS
levels.ts         the alert ramps + LEVEL_RAT / LEVEL_RAT_LOOP. ⚠️ the two
                  rat records point at DORMANT images nothing mounts
messages.ts       ⭑ what the NOTICES strip says — the four service faults, as
                  data. `body` is a string and never a ReactNode
nws.ts            ⭑ what the NWS block may say, and mostly what it may NOT.
                  FOUR feed states over one empty list; only `current` may say
                  nothing is active. Returns plain strings, same rule as
                  `messages.ts`, which is what keeps it testable
staleness.ts      the THREE clocks, plus TWO poller constants. ⚠️ five numbers,
                  and `TICK_COLD_AFTER_S` / `STORE_COLD_AFTER_S` measure
                  DIFFERENT quantities — our loop's cadence, and whether a new
                  FloodNet reading landed
utils.ts          `cn`
watch-settings.ts ⭑ the watch flow's ONLY testable seam — DEFAULT_SETTINGS,
                  `overridesFor`, `quietHoursIncomplete`. Here rather than in a
                  component because `web/tests/` may only reach `src/lib/`, and
                  because `watch-panel.tsx` and `watch-manage.tsx` both run them
                  and must not import each other. ⚠️ `overridesFor`'s ID FILTER
                  is the safety property: unfiltered, dropping a sensor keeps
                  its override on the wire and re-adding that instrument
                  resurrects a setting the reader believed they removed.
                  ⚠️ midnight is `0` and `0` is falsy — `quietHoursIncomplete`
                  compares absences, never truthiness.
                  ⚠️ THREE more since 2026-08-17, and they end the flow:
                  `SENT_AUTO_CLOSE_S`, `sentFaceAutoCloses` and
                  `sentFaceClosingNote`. The CONFIRMED receipt closes the
                  wizard by itself — there is no next step on that path — and
                  the gate is a FUNCTION because `mailDelivers === false` may
                  never close it: on that branch the on-screen link is the only
                  copy of a non-expiring bearer credential the reader will get.
                  The test reads it against `sentFaceNote(...).fault` rather
                  than against a literal, so the copy and the timer cannot drift
                  ⚠️ THREE more exports since 2026-08-16: `watchManageHref`
                  (⚠️ `/watch/`, NEVER `/map/?watch=` — the shape that made
                  every mailed link dead in production, asserted negatively
                  here as `check_mail.py` asserts it on the server side) and
                  `sentFaceNote` / `sentFaceHeading`, which are the `sent`
                  face's copy moved out of JSX so it can be SWEPT. The
                  confirmed branch may not send anybody to an inbox — there is
                  no confirmation step on that path and nothing is coming that
                  they have to act on. `nws.ts`'s argument, one feature over
geo/              distance.ts · project.ts · viewport.ts · ⭑ pairs.ts +
                  GENERATED nyc.ts, cso.ts
hooks/            the React edge — its own file, hooks/CLAUDE.md
⚠️ DORMANT, no caller:
warning-feed.ts   the SSE reducer — two guards, both load-bearing
```

## Why anything is here at all

Two reasons, and both are about being *sure*:

1. **A rule that is a pure function can be tested without a browser.** The depth
   band's boundaries, the two comparators, the three staleness clocks and
   `queryIsActive` all live here for that reason.
2. **`ordered` is derived in `page.tsx` and read by three surfaces** — the list
   renders it, the pager indexes into it, the map de-emphasises what is not in
   it. A pager walking a different order from the one on screen looks like the
   selection jumping at random, so the ordering is one pure function rather than
   three call sites agreeing by luck.

**Derived during render, never synced in an effect.** `picked`, `useHistory`'s
answer, `useDepthPeak`'s answer and the harbor window all follow this. An
effect-based reset always renders once with the stale value first, and in a tool
about depth at a location, one location's numbers under another's name is the
exact error the rest of this UI is built to avoid.

## The three auth modules, and the two rules that are about ORDER

- ⚠️ **`crypto-shim.ts` must be imported ABOVE the SDK in `auth-client.ts`.**
  `@neondatabase/auth` reads `crypto.randomUUID` at module evaluation, and that
  function exists only in a secure context. ES modules evaluate in import order,
  so that one line is the entire fix — and an import sorter moving it below is
  not a formatting change, it restores a crash that takes down **every route**,
  `/about` and `/terms` included, on any http-on-LAN origin. A statement at the
  top of the file body would not work either: imports hoist.
- ⚠️ **`auth-views.ts` carries NO `"use client"` and must not gain one.**
  `generateStaticParams` runs on the server during the export. When this list
  lived in a client module the build failed with
  `AUTH_VIEW_PATHS.map is not a function` — Next replaces a client module's
  exports with client *references*, so the array arrives as an opaque proxy.
  **A directive is not a hint about where code runs; it changes what an import
  evaluates to.**

⚠️ **Nothing checks `auth-views.ts` against the library and nothing can.** The
obvious guard fails: `AuthViewPath` is `keyof AuthViewPaths`, so it is the
SCREAMING_CASE keys while the routes are the kebab-case values, each typed as
plain `string`. An upstream rename lands as a 404 at the end of a Google
redirect. Review property, like variant *i* in `en` matching variant *i* in `es`.

⚠️ **`auth-client.ts` uses `createInternalNeonAuth`, not `createAuthClient`.**
The documented one is literally `createInternalNeonAuth(url, config).adapter` —
it discards `getJWTToken`, which is the only supported way to get a signed token
out of the SDK, and without one our API cannot authenticate anything. Both are
exported from the package root and both are typed. **But `internal` is in the
name and the package is `0.5.0-beta`**, so it is the thing most likely to move.

### ⚠️ `useSession` and `signOut` are re-exported here because the SDK's TYPE is wrong

Added 2026-08-16 with the app's first sign-out. `createInternalNeonAuth`'s return
is typed as a **union over every adapter the package ships**, so
`adapter.useSession` resolves to the *vanilla* client's shape — a nanostore
`Atom`, which is not callable. Under `BetterAuthReactAdapter()` the runtime value
is a React hook, exactly as the package's own `llms.txt` documents. Calling it
directly fails the build with *"This expression is not callable. No constituent
of type 'Atom<…>' is callable."*

⚠️ **The cast is pinned in `auth-client.ts` and never at the call site**, on
`createInternalNeonAuth`'s own rule one paragraph up: this is the thing most
likely to move under a version bump, and a cast repeated in components is a cast
nobody can find. **If a later release types it correctly, delete the cast and
keep the export.**

⚠️ **`SessionState` is declared as narrowly as the callers need.** Two callers
read `email` — `site-header.tsx`'s `SessionMenu` and, since 2026-08-16,
`map/page.tsx`, which passes it to `WatchPanel` as `sessionEmail`. Widening it is a
deliberate edit rather than a cast quietly admitting more: `neon_auth.user` also
holds a name, an `image`, a role and ban fields, and **none of them belongs on
this site.** ⚠️ **This is the one place `tsc` was load-bearing and nearly
missed** — `site-header.tsx` shipped calling `authClient.useSession()` directly
and `npm run build` failed on it. `./scripts/check` does **not** typecheck the
web, so the runner was green through the whole of it.

⚠️ **`emailVerified` is deliberately NOT here, and the reason is a positive
design decision rather than minimalism.** The watch's fast path turns on whether
the signed-in address is provider-verified, and that decision belongs to
`waterline/auth.py` and `api.watch_subscribe`, which read the claim off a token
they verified against Neon's JWKS. **A client that read it would be making a
security claim** — and the moment the two disagreed (a stale token, a beta SDK
shape change, a provider reporting it differently) the UI would either promise a
shortcut the server refuses or hide one it would grant. What the client needs is
`email`, to decide what to *draw*; the outcome comes back in
`WatchSubscribeResponse.status`. **Widening this to add it is the edit to
refuse.**

## `api.ts` is relative; `geosearch.ts` is not, and they must stay apart

⚠️ **`api.ts` is relative-and-same-origin by explicit design.** In production
FastAPI serves the bundle and the routes from one process; in dev
`next.config.ts` proxies. The app code is identical, the mechanism is not.

⚠️ **"No env var in `api.ts`" now holds for the API PATHS only.**
`auth-client.ts` reads `NEXT_PUBLIC_NEON_AUTH_URL`, so this bundle does contain
one build-time origin that can be wrong — it is just not this one. Keep the
distinction sharp: a wrong auth URL stops people signing in, a wrong API base
would point a flood UI at another service's readings. `api.ts` still refuses the
second.

⚠️ **`api.ts` attaches a bearer token and FAILS SILENTLY when it cannot get
one.** The Neon session cookie is scoped to Neon's origin, so it is never sent
to `/api/*` and a token is the only thing that crosses. When `getJWTToken`
throws, the header is simply omitted — turning that into a rejected request
would replace a truthful *401, sign in* with a network-error banner about the
instrument, and on a deployment with the gate off it would break a request that
was going to succeed.

⚠️ **`getHealth` calls `/api/healthz`, and the bare `/healthz` is a trap.** The
server answers both, and some hosts reserve that exact path at their edge and
return their own 404 before the request reaches the service. Because
`messages.ts` turns any error from this call into *"cannot reach the service"*,
pointing it at the bare path put a **permanent false outage banner on a
completely healthy deployment**.

**The general shape is worth more than the path.** This is a route that is
reachable in `next dev`, in a local uvicorn and in Docker, and unreachable in
production — so no test in this repo can see it, and none did. Same-origin does
not mean same-behaviour once something else owns the edge.

⚠️ **`geosearch.ts` is a SEPARATE client and that separation is a rule, not
tidiness.** It calls NYC Planning Labs GeoSearch with an address a reader typed.
Routing it through `api.ts` would give it `ApiError` — the type `messages.ts`
reads to say *cannot reach the service* — which would put **our** outage banner
on **somebody else's** outage.

Three things it may never do, all argued in LIMITATIONS §16:

- **Never send a typed address to any Fluud endpoint.** Not a body, a query
  string, a header or a log line. There is no route to receive one and there may
  not be.
- **Never cache.** Not `localStorage`, not `sessionStorage`, not IndexedDB, not
  a module-level `Map` "to make it feel faster". A geocode cache is
  accumulation, and it is exactly what a later performance pass adds.
- **Never debounce.** Submit only. A debounce sends a growing prefix of a home
  address six or eight times per lookup.

⚠️ A **server-side geocoder "so there is no third party" is the worst version of
this**, not the safest: it trades the third-party origin for the address in our
own request logs, next to the table of who watches which corner.

⚠️ **`fireDrill` is dormant** — `/api/rat/drill` is deleted with the rest of the
on-page alert path. Kept beside the unmounted `drill-controls.tsx`.

## `depth-band.ts` replaced `severity.ts`

A camera used to produce an ordinal class over a frame; that layer is deleted,
so what a pill or a marker says now is arithmetic over a calibrated millimetre:
below FloodNet's flood event, at or above it, at or above curb height.

⚠️ **`DEPTH_BAND_PIN` gained a second consumer on 2026-08-15** — the list rows'
`depth-bar.tsx`, which draws the row's depth against curb height. It reads the
same `Record` as the map markers rather than mapping bands to colours again,
which is the point of the `Record` existing: **a bar and a marker for one
instrument may not be able to disagree about which band it is in.**

⚠️ **The thresholds come from `/api/status` and may never be hard-coded here.**
Both live in `waterline/config.py` and ride on `StatusResponse.thresholds`. A
literal in this file would be a seventh number duplicated across the two
languages with nothing in `parity.test.ts` holding it.

⚠️ **`none` is neutral and may never be `--wl-clear`.** A green chip under 10 mm
is this app reporting that a block is fine. **This scale has a warning end and
no reassuring end**, deliberately, and `tests/levels.test.ts` asserts that of
every band rather than only of `none`.

⚠️ **A peak never takes the band, and that rule binds TWO components now.**
`depth-cell.tsx` stays uncoloured and `depth-bar.tsx` goes neutral in windowed
mode — a peak is history and the band is about now.

⚠️ **The bar is where this rule is easiest to lose**, because the design it came
from draws windowed rows banded and the divergence looks like an oversight. It
is not: a bar is more confident than a chip, and a banded bar under a historical
maximum is a severity claim about a moment that has passed. **Stale and dead
leave the band there too**, taking the staleness colours, on the same idiom the
pill and the markers already follow.

## ⚠️ `nws.ts` is where the never-safe rule became a TEST

Every other statement of that rule on this site is a review property or a string
in a component. This one is a pure function, so `tests/nws.test.ts` sweeps the
whole generated copy set — four feed states × three local counts × three
elsewhere counts × three ages — for *all clear*, *no flooding*, *is clear*,
*you are safe* and the rest, and asserts every state names the National Weather
Service. **That is stronger than any other enforcement of never-safe in the
repo**, and it is only possible because the copy is not in JSX.

⚠️ **Four states, because an empty alert list has four meanings** and two of
them are *we do not know*: `cold`, `unreachable`, `stale`, `current`. **Only
`current` may say nothing is active.** The precedence is asserted —
`cold` outranks `unreachable` (with nothing ever read, "the feed is down"
overstates what we know) and `unreachable` outranks `stale` (a failed attempt is
more specific than an old success).

⚠️ **`reachable === false`, never `!reachable`** — `mail_delivers`' precedent, a
third time. A body that arrived without the field is not a body reporting an
outage.

⚠️ **`NWS_COLD_AFTER_S` is not a fourth clock and must not grow into one.** A
cold NWS read and a frozen poller are the same underlying fault and the notices
strip already reports the second one properly. What this number does is stop the
panel *asserting* on data it should not assert on.

## ⚠️ `camera-filter.ts` is the SECOND copy sweep, and the absence is partial

`nws.ts` is the precedent and this is the harder case. A layer *switch* is binary
and its off-state is **total**, so `HiddenNote` counting what is off accounts for
every camera. This filter produces **partial** absence — 130 drawn, 838 not — and
a reader looking at 130 pins has no cue whatever that 838 are missing.

⚠️ **So the property the whole control rests on is asserted, not promised:
every non-empty state either prints its denominator or says the registry has not
arrived.** `tests/camera-filter.test.ts` sweeps the generated state set — every
tier subset × 0/1/2/5 boroughs × registry present/absent × six counts, 576
states — for that, and for the forbidden phrases, and for the owner's copy rule.

Five states and the precedence is load-bearing:

```
rest             default filter, no registry — names what is drawn, NO denominator
in flight        a filter touched and no list yet — no number at all
no borough       a borough picked and not one camera carries one — a DEPLOYMENT fact
zero matches     a real empty result — refuses the reading, says how to get out
drawn            the ordinary case — ALWAYS prints the denominator
```

⚠️ **`no borough` outranks `zero matches` and both have `drawn === 0`.** It is
the more specific fact: the drawing is empty because nothing ran
`python -m waterline.poll bootstrap` since `cameras.borough` landed, and *widen
the filter* is advice that cannot work. `cameraFilterRefuses` is a **separate
predicate** rather than a richer return, because `cameraFilterNote` must stay a
plain string — that is what keeps it testable under `environment: "node"`.

⚠️ **`applyCameraFilter` never matches a null `borough`.** Null means the
registry has not been re-bootstrapped, never *outside the city*, so admitting it
to every borough would put a camera under a neighbourhood name nobody
established. It counts as withheld and the denominator says so.

⚠️ **`boroughsOfCameras` reads the PAYLOAD, never `NYC_BOROUGHS`.** Those are
the basemap's names and DOT's `area` is a different agency's vocabulary this
repo deliberately does not normalise — a facet the picker cannot offer is
coverage removed with nothing saying so. `boroughsOf` in `instrument-query.ts`
is the idiom it mirrors.

⚠️ **No tier may reach a marker, in any channel.** *Never colour a distance*
binds any monotone ramp over distance and not only hue: dash-vs-solid,
thick-vs-thin and large-vs-small are the same ramp somewhere else, and every one
of those channels on a camera pin is already spoken for. The tier lives in the
control, in this copy, in the header chip's denominator and in a pin's `title`.

⚠️ **There is deliberately no TypeScript copy of `GOLD_PAIR_M`.** The tier
crosses the wire as a classified string, on `IngestBounds`' rule that the band
crosses as data and never as a constant, so this side never needs to know where
the inner bound falls. `FAR_M` (which is `cameras.MAX_PAIR_M`) is already on the
parity path and is what the hover copy and the unpaired panel's sentence
interpolate.

## `staleness.ts` holds THREE clocks and they are not interchangeable

⚠️ **It also holds two poller constants, and they are a FOURTH and FIFTH number
rather than a fourth clock.** `TICK_COLD_AFTER_S` (180s) asks whether our loop is
running, against our own clock. `STORE_COLD_AFTER_S` (900s) asks whether a new
FloodNet reading has landed, and a new row appears only when FloodNet publishes
one — the same p99 22.5 min lag the sensor clock is set against. **Reusing 180
for the second would be the gauges' mistake a third time.** ⚠️ 900 is a
proposal; the reading it owes is at the constant.

| instrument | clock | stale | dead | helper |
|---|---|---:|---:|---|
| camera | **our poller** | 300s | 1800s | `freshnessOf` |
| gauge | NOAA / USGS publication | 3h | 12h | `gaugeFreshnessOf` |
| sensor | FloodNet publication | 1h | 3h | `sensorFreshnessOf` |

⚠️ **Only the first measures whether Fluud is healthy.** A camera's
`observed_at` is stamped by our poller at the moment it wrote the row. The other
two keep ticking whether or not we are alive and run far behind by design —
judging one against another's thresholds is the same mistake twice, and it
shipped once: at 30 minutes, three of four perfectly healthy USGS gauges
rendered amber on first load. **An indicator that is always warning is an
indicator nobody reads.**

The sensor numbers are measured, not guessed — lag across all 425 deployments is
p50 1.0 min, p90 2.2, p99 22.5, max 48.1. One hour is 2.7× the p99.

⚠️ **Two of these numbers are shared with Python** and are held by
`tests/parity.test.ts`, because a Python script cannot read a `.ts`. So is
`FAR_M`, both haversines, the depth unit boundary, and the depth-peak window
bounds.

## The colour rules that live in this directory

`levels.ts` and `depth-band.ts` are exhaustive `Record`s so a missing member is a
build error. What the compiler cannot see is **which** colour, and these are
strings:

- ⚠️ **`LEVEL_EDGE.clear` and `LEVEL_PANEL_BG.clear` are NEUTRAL.** The ramp
  starts at *watch*. Green at rest beside the wordmark is the never-safe rule
  arriving as a colour, and `LEVEL_ACCENT` was deleted rather than kept beside
  `LEVEL_EDGE` precisely because it differed only in having that green rest
  state — which makes it the token somebody reaches for by mistake.
- **A colour beside a reading may not vary with that reading unless it is on a
  scale that says so.** This is the test that decides every token spend in the
  app. `--wl-select` varies with *selection*, a fact about the reader.
  `--wl-graph` is constant across every level an instrument can report, so it
  cannot encode one. A depth, a band pill, a gauge level and a map marker may
  take neither.

  ⚠️ **The rule is about VARIANCE and never about hue, which is what let both
  tokens change colour on 2026-08-15 and stay legal.** Estuary ships, so both
  are `#4d8dff` where they were magenta. Nothing about the argument moved: a
  trace whose hue is the same at every depth still encodes no depth. **A future
  palette may move them again and this paragraph does not need editing** —
  what would break the rule is a token that follows a reading, in any colour.

`tests/levels.test.ts` asserts the rest states as substrings for exactly this
reason.

## The hooks are the React edge

⚠️ **They have their own file — `hooks/CLAUDE.md`.** What belongs here is the
seam: **everything else in `src/lib/` is a plain function**, and that is what
makes it testable without a browser. A rule that needs state, a subscription or
the network goes down one level; a rule that does not stays up here.

## `api-types.ts` may be more lenient than the server — in ONE direction

A field the server always sends may be optional here **when the fallback is
safe**: `HealthResponse.last_tick_at` (a rolling deploy can have a browser load
the shell from a new instance and poll an old one), `SpeakEvent.drill` (a
missing flag is falsy, so an unlabelled event is treated as a **real warning**
rather than a rehearsal — the safe direction), and
`HealthResponse.mail_delivers`.

⚠️ **`HealthResponse.writes` joined that list on 2026-08-15 with THREE
absences.** Undefined is an older instance. `null` is *we could not ask*, or a
database with no `poll_ticks` yet. **A present block with a null `tick_at` is a
claim**: no poller has ever ticked in this mode, which is the bare-`uvicorn`
shape and renders as a fault. Its numbers are read as `=== null`, never by
truthiness — `stored: 0` means *this tick stored nothing new*, which is what a
quiet FloodNet looks like. ⚠️ **This block is what let `messages.ts` stop gating
the poller row on `poll_in_service`**: it comes out of Postgres, so it is true
whether the loop runs in this process or another one.

**The reverse is a bug**: promising a field the server may omit is caught by
nothing until it renders as `undefined`.

⚠️ `plausible === false`, never `!plausible` — it is `null` on a sensor that has
never reported, and **absence is not a fault**.

### ⚠️ `Thresholds` and `IngestBounds` are TWO models on purpose

Added 2026-08-15. Both are numbers on `/api/status` that the UI may never
hard-code, and the split carries a claim about **who chose them**:

| | `Thresholds` | `IngestBounds` |
|---|---|---|
| what | `flood_event_mm` 10, `curb_height_mm` 150 | `implausible_min_mm` −200, `implausible_mm` 600, `reading_max_age_s` 21600 |
| whose | **borrowed** — FloodNet's flood-event definition, NYC curb height | **derived in this repo**, from what the instruments actually did |
| server-side | `settings`, i.e. configurable env | `floodnet.py` module constants, deliberately **not** in `config.py` |
| changing one | needs a new source named | needs a new measurement, at the constant |

⚠️ **A surface saying "FloodNet's 10 mm threshold" is attributing correctly.
One saying "FloodNet's 600 mm ceiling" would not be.** That is the whole reason
these are not one model with five fields — folding them would put a number this
project chose under a docstring promising it did not, and the attribution is
what a reader is owed when a page tells them an instrument is lying.

⚠️ **They are on the wire for `depth-band.ts`'s reason and the argument is
stronger here.** A literal on this side is a number duplicated across the two
languages with nothing in `tests/parity.test.ts` holding it — and this one would
be a **safety band** drifting silently. ⚠️ **That extends to fallbacks:**
`map/page.tsx` gives `ingest` no `??` default, unlike the two thresholds. Those
have one because `depthBand` must return a band on the first paint; `ingest`
only drives sentences, and a sentence can simply not be there yet.

⚠️ **`reading_max_age_s` is a bound on the QUERY, never a staleness
threshold.** `staleness.ts` owns when a reading *looks* old; this owns whether
it was fetched at all. Collapsing them would be the gauges' mistake a third
time. It is what lets the detail face say what a silence is measured over — the
~29 deployments with broken real-time clocks have nothing inside it and arrive
looking exactly like a sensor that stopped.

### `SensorStatus.ground_height_mm` is a pole, not a depth

On the wire since 2026-08-15, from FloodNet's `height_ground_mm`, typically
2–3 m. ⚠️ **It may never take a depth band, a pill, a bar or a marker colour,
and it may never share an axis with `depth_mm`.** What it is for is the
phantom-flood argument: a `FAULT` chip over `1452 mm` explains itself the moment
a reader knows the instrument is two metres up. Nullable, and **absence gets
words rather than a blank**.

⚠️ **`mail_delivers === false`, never `!mail_delivers`, and it is the same rule
one payload over.** It is `undefined` before the first `/api/healthz` settles and
on an older instance mid-deploy, and **absence is not a verdict**. The watch
panel's confirm face reads it to swap *"Check that address"* for *"No email was
sent"*, so `!` would print that on a perfectly healthy deployment and tell a
reader to stop watching their inbox — losing them a real confirmation.

⚠️ **THREE surfaces read it as of 2026-08-16, and two of them were forks.** The
`sent` face has had it since 2026-08-06; `resend()`'s success copy and
`/watch/`'s confirm banner both promised delivery ungated until then, on a
deployment whose shipped default sends nothing. **Any copy in this app that
promises mail takes this gate.**

⚠️ **What it means is CAPABILITY, never delivery.** `outbox.status = 'sent'`
already means only *handed to a relay*, and this means less again. ⚠️ **And it
is a claim about THIS process** — with a second loop draining the same outbox,
`true` here does not mean the message this reader is waiting on will be sent by
a process that can send it. See the outbox race in `waterline/CLAUDE.md`.

⚠️ **`AlertStatus` is kept as a type with no route returning it**, so the
unmounted `alert-list.tsx` and `warning-block.tsx` still compile.

### ⚠️ `WatchMineResponse` is the one watch shape with NO parameter, and that is the control

Added 2026-08-17 with `getMyWatch`. It answers *does the signed-in reader's own
proven address already have a watch*, and the panel uses it to **not run the
wizard** at all for somebody who does — `api.watch_subscribe` does not apply
picks to an existing row, so that flow ended in a receipt that changed nothing.

⚠️ **There is no address to aim it at.** Every other lookup in this feature takes
one — an address, a confirm token, a manage token — and this reports on
`session.email` and nothing else. That is what keeps the *"is this address on
Fluud"* oracle unreachable here rather than merely unimplemented, and it is the
property to protect if this route ever grows a parameter.

⚠️ **Read `watching`, never the presence of `manage_token`.** The two are written
together on the server and a client keying off the token is one field rename from
treating an unverified reader as subscribed. `watching: false` has three causes —
no session (including `REQUIRE_AUTH=false`), an unverified address, and a
verified address with no confirmed row — and **all three mean run the wizard**,
which is the safe direction: the shortcut is what has to be earned.

⚠️ **`manage_token` here is a non-expiring bearer credential and this is its
THIRD exit from the server.** The other two are mail and
`watch_subscribe`'s verified-self branch, which hands the same token to the same
reader on the same proof — so this adds no capability. **Component state only:
never persisted, never in a `router.push`, never logged.**

### ⚠️ THREE sensor fields, three questions, and reading them as one shipped a falsehood — twice

`SensorStatus` carries `alert_visible`, `alert_permitted` and
`watched_camera_id`. They are not a ladder:

| question | field | today |
|---|---|---:|
| may an **email** go to a subscriber | `alert_permitted` | 343 |
| is the deployment healthy by FloodNet's own reckoning | `alert_permitted` | 343 |
| does this sensor's depth label a camera view this page shows | `watched_camera_id` | 21 |

⚠️ **`waterline/watch.py` has no camera in it at all**, so a pairing is not what
admits a sensor to the watch. **And `watched_camera_id` gates nothing** — the
on-page alert system was unwired, so nothing on any page raises a warning from
anything.

⚠️ **Claims built on that field have been wrong twice.** First *"display only"*,
which was false for the 325 deployments this app will mail somebody about; then
*"warns on this page"*, which went false with the unwiring. `api-types.ts` and
`instrument-query.ts` both carry this at the definition, because they taught the
first error. **A claim built on any of the three has to name its path.**

Verify against the real schema rather than trusting the file:

```bash
curl -s localhost:8080/openapi.json | jq '.components.schemas.CameraStatus'
```

## `geo/viewport.ts` — the map's frame, and TWO predicates that are not one

The pan-and-zoom arithmetic, added 2026-08-14 when the map stopped being a
fixed-extent drawing. A viewport is `{ x, y, w }` in the same unit square
`project()` returns: corner plus side length, `w = 1` is the whole city,
`zoom = 1 / w`.

⚠️ **THE FRAME STOPPED BEING SQUARE on 2026-08-15, when the map started filling
its track.** It was square because CSS locked the container to `MAP_ASPECT`, so
one `w` drove both axes and there was no second number to get wrong. The
container is now whatever shape the grid track gives it.

⚠️ **There is still exactly one axis a caller can move.** A viewport carries an
optional `aspect` — the container's own width ÷ height, measured from the DOM by
`use-map-viewport.ts` — and the frame's height is **derived** through `frameH`,
never stored and never settable. `withAspect` is the only writer.

⚠️ **`svgViewBox` and `toContainer` both read that one function**, which is what
keeps the marker alignment: the viewBox rect is the container's shape by
construction, so `preserveAspectRatio` has no letterbox to add and the marker
percentages have none to correct for. **A local `w * something` anywhere else
re-opens the drift** — every marker off by half the letterbox, consistently
enough to read as bad map data rather than as a bug. `tests/viewport.test.ts`
pins the rect's shape against the container's at five aspects and five zooms.

⚠️ **`aspect` is OPTIONAL and absent means `MAP_ASPECT`**, so the whole
pre-2026-08-15 suite stands unchanged as the square-frame regression case, and
the non-square tests sit beside it.

⚠️ **At full view the frame CONTAINS the city rather than equalling it.** `fullW`
is the LARGER of the two axes' requirements — a wide frame shows background
either side and `x` goes negative. Fitting the tighter axis would crop boroughs
out of the state the page opens in, and `whole city` promises a whole city.
Breaking that `Math.max` to a `Math.min` fails a named test reading *expected
0.813 to be greater than or equal to 1*.

⚠️ **`isFullView`, never `w < 1`.** `1` was the whole city only while the frame
was square; on a wide frame the resting `w` is greater than 1, and the old
comparison reports an untouched map as zoomed.

⚠️ **`isVisible` is about the FRAME; `project.inViewport` is about the CITY, and
they must not be collapsed.** `inViewport` means *inside `NYC_BOUNDS`* and keeps
that meaning: the map's three off-map counters are built on it and should read
zero forever. `isVisible(v, p)` means *inside the frame right now*. A point can
be the first and not the second, and that is the ordinary case once anybody
zooms. **The vocabulary follows the split** — *"the mapped area"* is
`NYC_BOUNDS`, *"this frame"* is the viewport, and the map's footer never words
them as one thing.

⚠️ **`clampViewport` returns the SAME OBJECT when nothing changes, and so do
`panBy`, `zoomAt` and `centerOn`.** Three call sites skip a 425-marker
re-render on that identity: a pan already at the edge, a zoom already at a stop,
and the recentre guard. The internal `settle` helper compares against the
**input** viewport rather than against its own argument, because the three
callers build a candidate literal first — a clamp that only checked its own
argument would allocate on every frame of exactly the two gestures that repeat
at frame rate. `tests/viewport.test.ts` holds all four with `toBe`.

⚠️ **Marker sizes are not in this file and may never be.** `toContainer` moves a
marker; nothing scales one. The unreachable-marker table in
`src/components/CLAUDE.md` is measured against 11px / 15px / 7px boxes.
**Positions move; sizes do not.**

`MAX_ZOOM = 12` is a measurement, not a preference — see its docblock.

## ⚠️ `geo/pairs.ts` — the camera→sensor join, and its DIRECTION is the trap

Added 2026-08-16 with the map's pair layer. `pairLinks(cameras, sensors)` returns
one unit-square link per paired camera, and it is here rather than in
`city-map.tsx` for the reason everything else in this directory is: it is the one
part of that feature a runner can hold. Everything else about the layer — the
stroke, the dash, the z-order, the colour — is a browser fact with no jsdom.

⚠️ **The join runs CAMERA → SENSOR through `CameraStatus.sensor_id`, and NEVER
sensor → camera through `SensorStatus.watched_camera_id`.** Those two fields are
not inverses. `watched_camera_id` names **one** camera per sensor, and 21 distinct
sensors serve the 27 watched cameras because four serve more than one and one
serves four — so the reversed join draws 21 lines and **silently drops six**. A
mark quietly missing from a map is the failure the off-map counters exist to
prevent, and nothing in a browser would flag it. `tests/pairs.test.ts` pins the
direction with a sensor pointing at a camera that does not point back.

⚠️ **Fan-out, never a bijection.** One link per camera, so four links may share a
`to`. **Deduping by `sensorId` draws one line for four pairings and drops three.**

It returns unit-square `Point`s and knows nothing about `Viewport` or
`VIEWBOX_*` — the scaling happens at the render site, as `CSO_POINTS` does. A
local frame derivation there would re-open the letterbox drift.

## `geo/nyc.ts` and `geo/cso.ts` are GENERATED and committed

Never hand-edit them. `web/scripts/CLAUDE.md` has the regeneration commands and
the reason the generators may never run in the build.

⚠️ **`geo/distance.ts` takes named fields, never four positional numbers.**
`project()` is lon-first and `cameras.haversine_m` is lat-first, and a
transposition returns a plausible large distance rather than crashing — it puts
NYC in the southern Indian Ocean and reads like a coverage story rather than a
bug. Its agreement with the Python implementation is asserted to within a
millimetre in `tests/parity.test.ts`, which is what makes that duplication
allowed.
