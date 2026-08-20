# CLAUDE.md — the hooks

The React edge of `src/lib/`. Everything else in that directory is plain
functions; these are the only things in it that hold state, subscribe, or touch
the network — which is why they are the only part of the pure layer with no test
coverage, and why the rules below are written down instead.

```
use-polled.ts        the shared poller. Needs a STABLE module-level fetcher
visible-interval.ts  ⭑ NOT a hook. The interval + visibility machinery that all
                     six pollers share. ⚠️ NOTHING polls while the tab is
                     hidden, and returning to it fetches at once
use-status.ts        /api/status, 60s. The page's spine
use-health.ts        /api/healthz, 30s. ⚠️ NOT /healthz — see below
use-sensors.ts       /api/sensors, 60s, GATED — 150 KB, no request until asked
use-camera-registry.ts /api/cameras, 60s, GATED — the 968-row registry, and
                     ⚠️ NO request until a reader touches the camera filter.
                     Its depths take `sensorFreshnessOf`, never `freshnessOf`
use-history.ts       /api/history/{camera}, 60s. Keyed on the camera, aborts
use-gauge-history.ts /api/gauge-history, 60s. One request for all five
use-depth-peak.ts    /api/depth-peak/{kind}/{id}. The WINDOW is in the key
use-depth-peaks.ts   ⭑ its BULK sibling, for the list's rows
use-now.ts           the shared ticker. ⚠️ callbacks MUST stay memoised
use-popover.ts       dismissal, shared by the two hand-rolled popups
use-map-viewport.ts  ⭑ pan and zoom on the drawing. The only hook here that
                     touches NO network — it is a DOM seam over
                     `lib/geo/viewport.ts`
⚠️ DORMANT, no caller:
use-warnings.ts      the SSE connection. Plumbing over warning-feed.ts
```

## ⚠️ Nothing here polls while the tab is hidden

Since 2026-08-20 every interval in this directory goes through
`visible-interval.ts`, which skips the fetch while `document.hidden` and fetches
immediately on return. Six hooks each had their own copy of that machinery and
none of them stopped: a phone in a pocket with `/map` open ran `/api/status`
every 15 seconds all night, ~8,600 requests nobody would ever see, each one a
fresh Postgres connection.

⚠️ **This is now load-bearing rather than tidy.** The poller runs on a schedule
so Neon can suspend between runs; a single forgotten tab polling through the
night holds the compute open and undoes the entire saving. Adding a `setInterval`
directly in a hook here re-creates that, and nothing will fail — it will just
quietly cost money and never sleep.

⚠️ **The interval keeps running while hidden; only the FETCH is skipped.**
Tearing the timer down and rebuilding it around visibility resyncs its phase on
every return, so flipping between tabs would drive requests faster than the
interval — the same resync failure `use-now.ts` records.

⚠️ **`use-status.ts` went 15s → 60s in the same change**, which is that hook's
own comment finally being acted on: the poller never writes faster than 60s, so
the other three requests a minute were always buying nothing. **60s is the
floor, not a step on the way to the 15-minute dry cadence** — the poller
escalates back to 60s in a storm and the page has to keep up with that, not with
the quiet case.

⚠️ **`use-warnings.ts` has no caller.** The on-page alert system was unwired and
`/api/events` is deleted, so a mount would open an `EventSource` against a route
that answers with the SPA's 404 page. Kept with `lib/warning-feed.ts` and the
unmounted warning components so re-wiring is one commit.

## ⚠️ Every hook here now runs behind a session gate, and that changed WHERE they may mount

All of these reach `/api/*`, and `waterline/auth.py` refuses those without a
verified session when `REQUIRE_AUTH` is on. `lib/api.ts` attaches the bearer
token, so a signed-in reader is unaffected and none of these files needed to
change. **What changed is where mounting them is safe.**

⚠️ **A signed-out reader must never mount one.** Four of these start on `/map`'s
first lines, and a hook runs on mount — so `RequireSession` **wraps** that page
rather than being called inside it. Without that, being signed out means four
endpoints answering 401 on 15-, 30- and 60-second intervals, each turned by
`lib/messages.ts` into *cannot reach the service*: **the page telling a reader
the instrument is broken when they have simply not signed in.** That is
`use-health.ts`'s failure mode below, reproduced four times over by a routing
mistake rather than a path one.

⚠️ **This is why `/`, `/about`, `/terms` and the `/auth` views stopped calling
`use-status` at all.** They polled it for the mode badge alone, and that badge
was not worth a guaranteed 401 on the pages a reader without a session is most
likely to be on. They pass `mode={null}` and `ModeBadge` renders `UNKNOWN`.

⚠️ **`use-health.ts` is the exception and may be mounted signed out.**
`/api/healthz` is one of four paths exempt from the gate — see `_AUTH_EXEMPT` in
`api.py` — precisely so a health check still answers without a session. Nothing
currently mounts it outside `/map`.

⚠️ **`use-health.ts` is the one whose PATH is load-bearing.** Some hosts reserve
the bare `/healthz` at their edge and answer it themselves, and because
`lib/messages.ts` turns any error from this hook into *"cannot reach the
service"*, the wrong path here is a **permanent false outage banner on a healthy
deployment**. It is the only hook in this list whose failure mode is the page
lying about the page.

⚠️ **It also carries the POLLER's liveness since 2026-08-15, and that made this
hook the one that says whether anything is collecting at all.** `writes` comes
off `poll_ticks` in Postgres rather than out of a global in the API's own
process, so it is true whether the loop runs in that process or another one —
which is what let `lib/messages.ts` stop gating the poller row on
`poll_in_service`. ⚠️ **Its 30s cadence is now the resolution of that claim**: a
poller that stops is reported within one poll of this hook, not of
`use-status.ts`.

⚠️ **The wrong-path failure above swallows all of it.** `messages.ts` returns
over the whole array on `health.error`, so an unreachable `/api/healthz` renders
*cannot reach the service* and **none** of the poller rows can fire. Measured
2026-08-15, through a dev proxy pointed at another service on the default port:
the page said the service was unreachable while the API was healthy and the
poller was simply not running. **Fix the reachability before believing anything
this hook implies about the poller.**

## Four of them are deliberately not `usePolled`

`usePolled` takes its fetcher as a dependency and requires a stable module-level
reference. A **per-instrument** fetcher is a fresh closure every render, so it
would rebuild its interval on every pass and refetch forever. The fix is not to
memoise around it — it is to key the effect on the thing that actually changed.

- **`use-history.ts`** keys on the camera id, aborts on change, and carries the
  id in state so the answer is derived during render. There is never a frame in
  which the previous camera's trace is drawn under the new camera's name.
- **`use-depth-peak.ts`** does the same with the **window in the key**. The same
  failure there is worse, because the two numbers are indistinguishable: a peak
  fetched for `last day` still rendering under a `last 10 min` label is a 200 mm
  figure captioned as ten minutes. It fires **no request at all** while the
  readout is on the current reading.
- **`use-depth-peaks.ts`** answers the same question for EVERY instrument of one
  kind, backing the LIST's depths. `kind` and `minutes` are both in the key, and
  the mismatch is worse again at this scale — wrong across twenty rows at once.
  ⚠️ **While loading it returns an EMPTY map rather than the previous
  window's**, because keeping the old one would render exactly that mismatch for
  as long as the request takes, wearing the appearance of a fast UI. A missing
  id is the empty window and is never a zero.
- **`use-sensors.ts`** takes an `active` flag, does not fetch before it is first
  true, and keeps its last payload when it goes false. `/api/sensors` is 150 KB
  for a surface most readers never open.
- **`use-camera-registry.ts`** is that hook's shape line for line, for the same
  three reasons at ~100 KB. ⚠️ **Its 60s poll is not optional**: this payload
  carries a **depth**, and a depth fetched once and left on screen is the
  frozen-poller failure with no age to betray it. ⚠️ **Its ages are
  `sensorFreshnessOf` (1h/3h), never `freshnessOf` (5m/30m)** —
  `CameraEntry.depth_observed_at` is FloodNet's publication clock and
  `CameraStatus.observed_at` is our poller's tick. The distinct field name is
  the safeguard; `city-map.tsx`'s `DrawnCamera` makes the choice once, in two
  converters, so nothing downstream can make it again. ⚠️ **`active` is STICKY
  at the call site, not here** — see `map/page.tsx`.

⚠️ **`use-depth-peak.ts` and `use-depth-peaks.ts` are siblings and neither may
absorb the other.** The singular one answers `peak_at` and `newest_at`, which
the detail panel renders; the plural one is one request for hundreds of rows and
deliberately carries neither. Folding the panel onto the bulk map would cost it
the timestamp that makes a peak legible as history.

⚠️ **Never mount `ReadingAge` in a long list.** It subscribes to `useNow(1000)`,
so 425 rows would be 425 leaf re-renders every second for data that moves once a
minute. Pass the list's 15s tick down instead.

### `use-history.ts`'s two other differences, both load-bearing

- **It aborts.** Selection changes faster than the network answers; without the
  `AbortController` a quick pass down the list leaves five requests in flight
  and whichever lands last wins, which is not the one you clicked. Verified: 5
  rapid clicks, 4 cancelled, the clicked one rendered.
- **State carries the camera id it belongs to**, and the answer is derived
  during render. An effect-based reset always renders once with the stale data
  first. In a tool about depth at a location, one location's numbers labelled
  with another's is the exact error everything else here is built to avoid.

A **404 is not an error**: `/api/history` 404s when a camera has no observations
at all, which is a real answer meaning "nothing recorded here". It lands as
empty `points`, not a banner.

## `use-map-viewport.ts` — no test coverage, so the rules are written down

Added 2026-08-14, when the map stopped being a fixed-extent drawing. **It is the
one hook here that fetches nothing**: the arithmetic is pure and lives in
`lib/geo/viewport.ts` with `tests/viewport.test.ts` beside it, and what is left
in the hook is DOM wiring. `tests/CLAUDE.md`'s jsdom refusal applies directly —
jsdom lays nothing out, so a synthetic `wheel` against a zero-sized rect would
only re-assert the arithmetic that is already asserted. **The browser pass is
the instrument for this file.**

⚠️ **It MEASURES the container as of 2026-08-15, and that is new.** The map fills
its track now, so the drawing's shape is a DOM fact rather than a CSS constant:
a `ResizeObserver` on the surface feeds `withAspect`, and `lib/geo/viewport.ts`
derives the frame's vertical axis from it. Three things about that:

- ⚠️ **A `ResizeObserver`, never a window `resize` listener.** This box changes
  size without the window doing anything — a rail tab opening, the controls
  strip unfolding, a notice arriving. A window listener misses every one and the
  drawing stays laid out for the box it used to be in, which is the letterbox
  drift through the back door.
- ⚠️ **A zero-sized rect is not an answer.** A hidden tab or a first paint
  measures 0×0; re-shaping for it divides by zero and then snaps back, so it is
  skipped rather than applied.
- ⚠️ **`withAspect` returns the SAME OBJECT on an unchanged shape**, which is
  load-bearing here specifically: this fires on every frame of a drag-resize and
  each new object is a 425-marker re-render.

⚠️ **`reset` is `fullView(v.aspect)`, never the `FULL_VIEW` constant.** That
constant is the whole city in a `MAP_ASPECT`-shaped box, and handing a wide frame
a square one would shrink the drawing on the press labelled `whole city`.

Four decisions, each a failure mode rather than a taste:

- ⚠️ **Cooperative wheel.** Plain wheel scrolls the page; `ctrl`/`⌘`+wheel
  zooms. Below `xl` the map is a full-width panel in a document several screens
  long, and plain-wheel zoom would eat the scroll of a reader on their way to
  the list. **A trackpad pinch already arrives as `wheel` with `ctrlKey: true`**,
  so pinch on a trackpad falls out of the same branch. The cost is that a
  mouse-only desktop reader has no wheel zoom, **which is why `+` / `−` may
  never be dropped as redundant.**
- ⚠️ **The wheel listener is `addEventListener("wheel", h, { passive: false })`
  in an effect, never React's `onWheel`.** React attaches wheel listeners
  passively, so `preventDefault` in an `onWheel` handler is a **silent no-op** —
  the page scrolls anyway and it reads as the zoom being ignored rather than as
  a listener option.
- ⚠️ **`touch-action` is conditional on zoom** — `pan-y` at full view, `none`
  otherwise, asked as `isFullView(view)` since the frame stopped being square.
  Below `md` the map fills the entire first screen with the list
  as a sticky sheet under it, so a permanent `touch-action: none` traps a reader
  who then cannot scroll past it. At full view there is nothing to pan, so
  `pan-y` costs nothing; once zoomed the reader has opted in and `whole city` is
  the way back.
- ⚠️ **Pointer capture on the first `pointermove`, never on `pointerdown`.**
  Capturing on down steals the press from every marker button underneath and
  makes the map unclickable — the `MARKER_HIT` failure through a different door,
  and that one has already broken the gauge diamonds once and all 425 sensor
  markers once. A press that never moves is a click and must reach the marker.

⚠️ **`pointercancel` and `lostpointercapture` both clear the pointer map.** A
pointer the browser took away and this hook never forgot is a finger it believes
is still down, i.e. a map that pans forever.

⚠️ **`showPoint` is called during RENDER by `city-map.tsx`, not in an effect**,
and the reason is at its call site: an effect renders once with the stale frame
first, which puts a lit marker under the wrong neighbourhood. Its no-op path
returns the same object, so React bails out.

## `useNow` must keep its callbacks memoised

`use-now.ts` is a shared ticker behind `useSyncExternalStore`, and both callbacks
are wrapped in `useCallback`. **This is not a micro-optimisation.**
`useSyncExternalStore` re-subscribes whenever the subscribe function's identity
changes; with an inline arrow that is every render, so a lone subscriber tears
down its own interval and rebuilds it on each pass, the rebuild resyncs the
cached timestamp, the snapshot changes, and it renders again — forever.

It hides beautifully. While the churn stays inside one millisecond the resynced
value is identical and the loop terminates by luck. It only becomes an infinite
render on a machine slow enough for a render to cross 1ms, which is to say
somebody else's.
