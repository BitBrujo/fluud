# CLAUDE.md — the web tests

**350 tests, vitest, ~330ms.** Scope is `src/lib/` and only `src/lib/` — the
pure modules, where the rules a compiler cannot see live.

```bash
cd web && npm test
cd web && npm run test:watch
```

```
_fixtures.ts              shared payload builders
camera-filter.test.ts     ⭑ the CAMERA FILTER's copy, and the SECOND sweep in
                          this directory after `nws.test.ts`. ⚠️ the assertion
                          that earns it is that EVERY non-empty state prints its
                          denominator or says the registry has not arrived —
                          the absence this control produces is PARTIAL, which is
                          what a layer switch's never is. Also the owner's copy
                          rule as an assertion: no reader-facing string contains
                          `gold`, `golden` or `silver`
depth-window.test.ts      the depth timeframe's arithmetic and copy
format.test.ts            parseServerTime, formatDepth, the unit boundary
geo.test.ts               haversine, projection, formatDistance
instrument-query.test.ts  the comparator, the filters, queryIsActive. ⚠️ the
                          TIDAL facet is the one filter here that narrows on
                          what an instrument IS
levels.test.ts            the level ramps and the DEPTH BAND, as
                          SUBSTRINGS — see below
match-range.test.ts       the list's match mark
messages.test.ts          ⭑ what the NOTICES strip says and REFUSES to say —
                          unreachable suppresses everything, and `id` churns
                          where `slot` does not. Verified by breaking them.
                          ⚠️ since 2026-08-15 it also holds the POLLER gate:
                          the healthy separate-process deploy saying nothing is
                          the false positive the whole `writes` block exists to
                          avoid, and it is the assertion to keep
pairs.test.ts             ⭑ the camera→sensor link derivation. ⚠️ the one
                          assertion that earns the file is the JOIN DIRECTION —
                          `watched_camera_id` names one camera per sensor, so
                          the reversed join draws 21 lines where 27 pairings
                          exist and drops six SILENTLY. Verified by breaking it
parity.test.ts            ⚠️ the cross-language check. NOT hermetic
staleness.test.ts         the three clocks
watch-settings.test.ts    ⚠️ the watch flow's only assertions, and the whole of
                          what it can have here — the rest is components, and
                          jsdom is refused. `overridesFor`'s ID FILTER is the
                          one with teeth: unfiltered, dropping a sensor and
                          saving keeps its override on the wire, and re-adding
                          that instrument resurrects a setting the reader
                          believed they removed. Midnight is `0` and `0` is
                          falsy, so `quietHoursIncomplete` is checked on both
                          hours in both directions.
                          ⚠️ TWO more groups since 2026-08-16, both NEGATIVE.
                          `watchManageHref` is asserted never to produce the
                          gated `/map/?` shape — the same failure class
                          `check_mail.py` pins on the server side, arriving on
                          the UI side where no check script reaches. And the
                          `sent` face's copy is swept: the CONFIRMED branch may
                          not say *check*, *inbox*, *confirm*, *nothing is sent
                          until* or *waiting*, because on that path there is no
                          confirmation step and nothing is coming. Verified by
                          breaking the branch — two tests fail naming the real
                          sentence.
                          ⚠️ TWO more groups since 2026-08-17 — the timer that
                          ENDS the wizard. The assertion that earns them reads
                          `sentFaceAutoCloses` against `sentFaceNote(...).fault`
                          rather than against a literal: any input whose copy
                          says the on-screen link is the ONLY copy of the manage
                          token must never be one the timer runs on, because a
                          timer that wiped it would destroy a non-expiring
                          credential nothing can re-issue. Both breaks were run
                          — dropping the mail gate fails two named tests, and
                          putting *inbox* in the closing note fails two more
viewport.test.ts          ⭑ the map's frame. The clamp, the zoom anchor, and
                          the two FULL_VIEW identities that made threading it
                          through a pixel no-op
warning-feed.test.ts      ⚠️ the SSE reducer. The module is DORMANT — the
                          on-page alert path was unwired — and both tests keep
                          running against it, so a re-wire lands on a contract
```

## ⚠️ `.design-sync/` is covered by NOTHING, and it is not a gap to close here

The design-system export surface added on 2026-08-15 — a hand-written entry
barrel, two shims, `fixtures.ts` and 56 preview files — is outside this suite
**and outside `npm run typecheck`.** It is a dot-directory, and TypeScript's
`include` wildcards do not match inside one. That was verified rather than
assumed: a deliberate type error planted in a preview leaves `tsc --noEmit`
passing.

**Do not widen this suite to reach it.** Those files render real components in a
real browser and are gated by the converter's own render check plus a graded
screenshot of every card — which is a stronger check than anything `environment:
"node"` could offer, and it is the same argument as the jsdom refusal below.
What the suite still owns is `src/lib/`, and `fixtures.ts` duplicating
`api-types.ts` shapes through `as never` casts is a **review** property, like
`en`/`es` variant parity. See `web/CLAUDE.md`.

## ⚠️ Three of `src/lib/`'s modules are in scope and untested, on purpose

`auth-client.ts`, `auth-views.ts` and `crypto-shim.ts` live under `src/lib/` and
have no test. Two of them genuinely cannot have one here, and saying which is
which matters more than the count:

- **`auth-client.ts`** builds a live client against a third-party origin. There
  is no pure rule in it to assert — only wiring, and wiring that is wrong fails
  in a browser, not in node.
- **`auth-views.ts`** is the one that looks testable and is not. ⚠️ **The obvious
  assertion — that this list matches the library's `authViewPaths` — cannot be
  written**: `AuthViewPath` is `keyof AuthViewPaths`, the SCREAMING_CASE keys,
  while the routes are the kebab-case values, each typed as plain `string`.
  There is no union to compare against and a test would only re-state the
  literals. What catches a drift is `next build` emitting the directories and a
  human reading them.
- **`crypto-shim.ts`** is the sharpest case. Its *output* is testable — a v4 UUID
  has a checkable shape — but the thing that makes it necessary is
  `window.isSecureContext`, which **`environment: "node"` cannot express and
  jsdom would only pretend to**. A green test here would say the shim produces
  UUIDs while the bug it exists for — the whole site failing to render on
  `http://<LAN-IP>:3000` — went right past it. That is the jsdom refusal below,
  arriving through a different door.

⚠️ **The auth work's two real defects were both found in a browser while this
suite, `tsc`, `next build` and the route sweep were all green.** See
`MEASUREMENTS.md`. **Do not read a passing run here as the sign-in working.**

## ⚠️ No jsdom, and vitest raised the price of that refusal rather than paying it

`environment: "node"`. Under a plain node runner this refusal cost most of a
day's work to break; under vitest it is `environment: "jsdom"` plus one install,
which is exactly why it is written down instead of implied.

**Every layout fact in `web/CLAUDE.md` and `web/src/components/CLAUDE.md` is
measured in a real browser** — the
legend's reserve across all toggle states (⚠️ **retired** — that block moved
onto the drawing on 2026-08-15 and pushes nothing out of flow), the rail's 256px
gauge slot, the
masthead height, the wordmark holding one line, the depth row's slack, and
**since 2026-08-15 the rail's four tab slots and the list's row count with the
depth bar**. jsdom lays nothing out; `getBoundingClientRect` returns zeros.

So a jsdom assertion about any of those is not a weaker version of the real
check — it is a **green test over an unmeasured page**, which is worse than no
test, because the hand measurement stops getting done.

The one thing a component test could honestly cover is *"exactly one `aria-live`
region on the page"*, which is checked in a browser today and is the check that
matters most. **If it ever moves into vitest, it moves alone**, and this
paragraph gets amended.

### ⚠️ `nws.ts` is the counterpoint, and it is why the copy is not in the component

`nws-alerts.tsx` added no test; **`lib/nws.ts` added 45**, and the split between
them is this directory's whole thesis in one change.

What the panel renders is a box height and an emphasis, which the browser owns.
What it *says* is a judgement about whether an empty list means *nothing is
active* or *we could not ask* — and getting that wrong prints an all-clear over
five flood gauges during the weather that broke the feed. So the strings live in
a pure module returning plain `string`, `messages.ts`' rule, and the test sweeps
the **entire generated set** — four feed states × three local counts × three
elsewhere counts × three ages, plus every count label — for *all clear*,
*no flooding*, *is clear*, *you are safe* and eight more.

⚠️ **That is the strongest enforcement of the never-safe rule in the repo**, and
it exists only because the copy is not in JSX. Everywhere else that rule is a
review property or a string a grep would miss. **If copy is worth asserting, move
it to `src/lib/` rather than reaching for jsdom.**

⚠️ **It sweeps generated output, not a hand-listed set of strings.** A new branch
in `nwsNote` is covered the day it is written, with no test edit — which is the
opposite of the *"do not close it with a test that greps copy"* failure below,
because nothing here pins a phrase that is allowed to move. It pins the phrases
that are **not**.

All four assertions in it were checked by breaking the implementation: reordering
the state guards, leaking the quiet sentence into the unreachable branch, turning
the count label into a bare `0`, and swallowing the `elsewhere` count. Each
failed naming the real symptom.

### ⚠️ `camera-filter.test.ts` is the SECOND sweep, and the absence it guards is PARTIAL

Added 2026-08-16 with the camera layer's borough-and-pairing filter. Same
construction as `nws.test.ts` for a harder case, and the difference is the reason
the file exists:

> A layer **switch** is binary and its off-state is **total**, so `HiddenNote`
> counting what is off accounts for every camera. A **filter** draws 130 of 968,
> and 130 pins on a drawing of New York City look exactly like 130 pins on a
> drawing of New York City.

⚠️ **So the assertion that earns the file is a property over the generated set,
not a phrase:** every non-empty state either prints its denominator or says the
registry has not arrived. 576 states — every tier subset × 0/1/2/5 boroughs ×
registry present/absent × six drawn counts — and a branch added later is covered
the day it is written.

Three more things it holds, each of which a review would have to catch instead:

- **The forbidden-phrase list**, `nws.test.ts`' idiom, plus *nothing here* and
  *no cameras in* — the two an empty drawing invites.
- ⚠️ **The owner's copy rule as an assertion.** No reader-facing string may
  contain `gold`, `golden` or `silver`, case-insensitively, over the notes, the
  three labels and the three hover strings. `watch-settings.ts`' negative
  assertion (*no rendered body contains `/map/?`*) one feature over.
- ⚠️ **A null `borough` is never matched by a borough filter**, and it counts as
  withheld. Null means the database has not been re-bootstrapped, never *outside
  the city*, so admitting it to every borough would put a camera under a
  neighbourhood name nobody established.

**Five breaks were run.** Returning the unfiltered list fails six named tests;
dropping the denominator fails the sweep with the offending sentence printed;
swapping `not paired` for `silver` fails the label test and the internal-name
sweep; admitting a null borough fails the null-borough test; and swapping the
deployment-fact branch below the zero-match branch fails the precedence test —
which is the *"widen the filter"* advice that cannot work, arriving as an
assertion.

### ⚠️ `depth-bar.tsx` and `rail-tabs.tsx` added NO tests, and that is the rule holding rather than a gap

Both landed on 2026-08-15 and both are pure presentation over values computed
elsewhere. **Everything worth checking about them is a colour, a width or a
breakpoint**, which is precisely what this runner cannot see:

| the claim | where it is held |
|---|---|
| a stale bar leaves the band | the browser pass — **observed at 5m stale**, `MEASUREMENTS.md` |
| a peak's bar is neutral | the same pass, plus the reasoning in `lib/CLAUDE.md` |
| four tabs, one visible panel each | the same pass — four presses, 776px each |
| the tab bar is gone below `xl` | the same pass at 390×844 |
| a tab label fits its column | **measured** — `tide & weather` was 84.0px in an 84.5px box and became `tide + wx` at 54.0. A test could count characters and would have passed both |
| the NWS box does not move the gauge grid | **measured** — 8 forced states, `gridTop` identical to 0.1px |
| the list still clears its three-row floor | the row-count table, both widths |

⚠️ **The band arithmetic underneath the bar IS tested**, because it is
`lib/depth-band.ts` and it was already here. What the bar adds is a rendering of
it, and a jsdom assertion that a `<span>` received a class string would be the
**green-test-over-an-unmeasured-page** failure above, not a weaker version of the
real check.

## What is worth testing here, and what is not

⚠️ **Do not duplicate the compiler.** `lib/depth-band.ts` and `lib/levels.ts`
are exhaustive `Record`s, so a missing member is a build error — `tsc` is the
stronger enforcement and it needs no test.

⚠️ **And a URL STRING is past the edge of this suite, which cost a production
bug.** `getHealth` fetched `/healthz`, which is a perfectly valid path that the
server really does serve — so `tsc` was clean, every test passed, and the
deployed map still carried a permanent *"cannot reach the service"* banner,
because the host's frontend reserves that exact path and answers it before the
service does. The correct value is `/api/healthz`.

Nothing in this directory could have caught it and a mock would have made it
worse: a test asserting `getHealth` requests `/healthz` would have **pinned the
bug** and turned the fix into a failing test. The reachability of a route is a
fact about the deployment, and the only instrument for it is a request through
the real edge. Same family as the no-jsdom refusal below — **a green assertion
over the wrong thing is worse than no assertion**, because it stops the real
check from being made.

What `tsc` **cannot** see is the *colour a rest state takes*, and colours are
strings: `LEVEL_EDGE.clear = "border-l-[var(--wl-clear)]"` typechecks perfectly
and puts a reassuring green beside the wordmark. So the ramps are asserted as
**substrings** — `clear` neutral on `LEVEL_EDGE`, `LEVEL_PANEL_BG` and
`LEVEL_TEXT`, and the three warning levels genuinely on the ramp so that
dropping the rest state cannot flatten the whole thing.

⚠️ **The depth band is held the same way, and it has no reassuring end at all.**
`DEPTH_BAND_PILL.none` and `DEPTH_BAND_PIN.none` are asserted **not green**, and
so is every other band — a green chip under 10 mm is this app reporting that a
block is fine. Both threshold boundaries are asserted **inclusive**, because a
reading of exactly 10 mm IS FloodNet's flood event, and the bands are asserted
to follow the thresholds they are *given* rather than a literal, which is what
stops a hard-coded 10 or 150 creeping back into TypeScript.

⚠️ **`LEVEL_ALERT_BLOCK` is deliberately exempt and the test says so out loud.**
Its `clear` entry does carry `--wl-clear` and is unreachable in practice: an
alert episode only ever opened at watch or higher. That exemption is written
into the test rather than left for somebody to "fix" by adding the record to the
loop.

### ⚠️ `sensorTotals` is asserted as a SHAPE, and nothing here can see what it is called

`instrument-query.test.ts` pins the five counts with `toEqual`, which is worth
having — it is what keeps a copy edit from silently adding a sixth field. **What
it cannot see is the sentence built on them**, and on 2026-08-06 that sentence
was false: the mode-note strip read `watched` (21) as *what this app acts on* and
called the other 404 *"display only"*, while `waterline/watch.py` will mail a
subscriber about any `alert_permitted` sensor — 343 of them, no camera involved.
Four more surfaces said the same thing and `SensorFace` said it directly beneath
a working `Start Monitor` button. ⚠️ **The repaired sentence went false in turn**
when the on-page alert system was unwired, which is the same defect a second
time: a claim about a gate, in JSX, over numbers that were right.

**Every one of those tests stayed green throughout, and correctly so.** The
defect was a claim about two Python gates, in JSX, over numbers that were right.
The enforcement is the docblocks in `instrument-query.ts` and `api-types.ts` and
the review that reads them — the same standing gap CSS and the timeframe popup's
two control bugs record. (`.wl-swell` was this file's worked example of that gap
and is deleted with the landing page; the argument survives as a comment in
`globals.css`. ⚠️ **The cascade bug below is the better example now**, because it
shipped.) **Do not close it with a test that greps copy**: the string would move and the claim would not.

⚠️ **The provenance run added on 2026-08-15 is FOUR more claims in that same
blind spot**, and they are written down here rather than tested because they
cannot be tested from this directory. The sensor face now names the plausibility
bound a fault crossed, the height the instrument is mounted at, which half of
`alert_permitted` refused the watch, and the window a silence is measured over.
Every one is a sentence in JSX over numbers that are right, which is exactly the
shape of the two failures above. **The pure half is covered and the pure half is
not the risk**: `IngestBounds` and `ground_height_mm` are wire types the compiler
holds, and the two `the tidal filter` tests hold the one new rule that is a
function. The claims are a review property.

⚠️ **The silence sentence is the one to re-read hardest.** It says the page
cannot tell a stopped instrument from a clock-skewed one, which is true today
and would go false the moment anybody stores what `floodnet.skewed_deployments`
returns — a repair that would leave the copy quietly overstating a limit rather
than a capability, which is the direction nothing here would flag.

The check that would have caught it is the one this repo already prescribes for
layout — render the state and read it. It is written down under *"Verified
through the real static mount"* in `web/src/components/CLAUDE.md`, with the four
sensor states
to walk.

### ⚠️ The CSS gap stopped being hypothetical on 2026-08-15, and it had been live for a while

`.wl-swell` was this file's worked example of the CSS blind spot and it was a
weak one: a rule about a deleted animation nobody would reinstate by accident.
**The replacement is a bug that was actually shipped, in a safety colour, and
that nothing in this repo could see.**

`@neondatabase/auth` ships an **unlayered** `* { border-color:
var(--neon-border) }`. Unlayered CSS beats every layered rule at any
specificity, and Tailwind put this app's utilities in `@layer utilities` — so a
zero-specificity `*` from a third-party package outranked every border-colour
utility in the app. `ModeBadge`'s `--wl-live` provenance outline, `SensorRow`'s
`border-l-[var(--wl-select)]` selection edge and the `--wl-stale` / `--wl-dead`
panel borders were **all emitted into the stylesheet and none of them applied**.

⚠️ **Every runner stayed green, and correctly so.** `tsc` proved the class
strings' types. `levels.test.ts` proved the ramps are not green. `npm run build`
compiled the utilities. Nothing anywhere asks whether a rule that exists also
*wins*, because that is a property of the cascade and this directory is
`environment: "node"` with no jsdom and no layout.

⚠️ **It was found by a design agent in another product**, not by a runner here —
a claude.ai/design artifact came back with a comment block naming it. **That is
the shape to notice**: the fourth reader found a defect three runners and a
review had walked past for weeks, because it was the only reader looking at
rendered pixels.

**Do not try to close this with a test.** A vitest assertion that greps the
stylesheet for a selector would have passed on the broken build — the selector
was there. What decides it is `getComputedStyle`, which needs a real browser, and
the cheapest version is the one now written into `MEASUREMENTS.md`: **the LIVE
badge draws a green outline, or the cascade is broken.**

### ⚠️ The same shape landed again on 2026-08-06, and it was walked rather than tested

`watch-panel.tsx`'s confirm face now branches on `mail_delivers === false`,
swapping *"Check that address"* for *"No email was sent"* when the deployment
has no mail transport. **Nothing in this directory can see it**: the scope is
`src/lib/` and the branch is JSX, so the compiler proves the prop's type and
`vitest` proves nothing about which sentence renders. It is the
`sensorTotals` situation exactly — right numbers, and the claim built on them
living somewhere no assertion reaches.

So both branches were **driven in a browser through the real static mount**,
including the `undefined` one, against a server that genuinely omits the field.
The measurements are in `web/src/components/CLAUDE.md`. ⚠️ **Do not close this with a test that
asserts the string** — `=== false` versus `!` is the property that matters and a
copy assertion cannot see it, while the string itself will move.

**The count was unchanged by that work.** A feature that adds no test to this
directory is worth noticing rather than assuming; here it is correct, because
everything the feature added is either typed, asserted in `check_mail.py`, or
outside this suite's scope by design.

## ⚠️ A test never seen to fail is a test nobody has checked

The rule this directory is held to, and it is applied by **breaking the thing**,
not by reading the assertion.

- **`warning-feed.test.ts`** — both SSE guards were verified by removing them.
  Deleting `if (at < state.lastAppliedAt)` fails exactly one test with
  `expected 'T2' to be 'T5'`, which is the reconnect-mid-storm symptom
  reproduced. Blanking `latest` at every mood level fails exactly one other.
- **`parity.test.ts`** — drifting `RETENTION_DAYS` to 30 fails two named tests;
  changing a preset fails two more. Both were run.
- **`levels.test.ts`** — painting `DEPTH_BAND_PILL.none` green fails two named
  tests, and making the flood boundary exclusive fails two more. Both were run.
- **`instrument-query.test.ts`** — reducing `compareCameras` to an
  `observed_at` comparison fails three named tests, including the one asserting
  it is **not vacuous** when every timestamp is identical. That is the whole
  point of that test: `poll.tick` stamps every camera with one `now`, so an
  age-only sort ranks nothing while still appearing to work.
- **`pairs.test.ts`** — two breaks were run. Joining on `watched_camera_id`
  fails exactly one test with `expected [ { cameraId: 'cam-9', …(3) } ] to have a
  length of +0 but got 1`, which is the silent six-line loss arriving as an
  assertion. Deduping by `sensorId` fails two with `expected [ { cameraId:
  'cam-1', …(3) } ] to have a length of 2 but got 1`.
- **`viewport.test.ts`** — three breaks were run. Making `settle` always return
  a fresh object fails **four** named tests, all of them identity ones, which is
  the 425-marker re-render arriving as an assertion. Zooming about the frame's
  centre instead of the cursor fails the two anchor tests. Adding 1 to the
  viewBox origin fails both `FULL_VIEW` identity tests, which is the pixel no-op
  refusing to be quietly given up.

Two assertion shapes there are worth keeping if the reducer is ever rewritten:
the no-op case is **`toBe`, not `toEqual`** (the contract is that a caller can
skip a render, and a fresh object with equal contents does not deliver that), and
the clock guard is **`<` rather than `<=`** (two warnings can share a second, and
dropping the second would silently lose a real escalation).

## ⚠️ `parity.test.ts` is not hermetic, and that is the point

It shells `python3 scripts/parity_constants.py` and asserts that every number
written down in two languages still agrees. It **skips with a named reason** when
Python is absent, so a UI-only contributor gets an explanation rather than a red
suite — and a skipped suite is visible in the run output, which a silent pass
would not be.

**Why the web side drives**: vitest already resolves the TypeScript. The
alternative was teaching Python to load a `.ts` module, which is the twenty-line
resolve hook this suite deleted. So Python prints and this decides. ⚠️ **Never
add an assertion to `parity_constants.py`** — see `scripts/CLAUDE.md`.

**The gap it closes is real and nothing else can close it.** `check_watch.py`
asserts the Python half of the sensor-stale hour under a comment *naming*
`staleness.ts`, and stays green when `staleness.ts` is edited to 1800. Verified
by introducing exactly that drift.

⚠️ **Behavioural pairs are compared as a CHOICE, never as a rendered string.**
`formatDepth` and `agent._depth_phrase` print differently on purpose — whole
inches for prose, one decimal for a card. What may not diverge is *where they
change over*. The depth-peak clamps are compared the same way: sharing a ceiling
constant does not prove two implementations agree about `0`, a negative, or a
value one minute past the bound.

**If another shared number appears, it goes in this file.**

## Adding a test

1. `src/lib/` only. If the thing you want to assert needs layout, it is a browser
   measurement and it belongs in `web/CLAUDE.md` (page layout) or
   `web/src/components/CLAUDE.md` (a component) as a number.
2. Reach for `_fixtures.ts` rather than hand-rolling a payload — a fixture that
   drifts from the wire types is a test asserting something the server never
   sends. ⚠️ **Its defaults are HEALTHY, so the interesting case is the one a
   test says out loud.** `sensor()` returns a reporting, plausible, non-tidal
   deployment with `ground_height_mm: 2400` — a height rather than a null,
   because the absent case is the one worth naming at the call site.
3. **Break the implementation and watch your test fail with a message that names
   the real symptom.** If the failure message would not tell you what broke,
   the assertion is the wrong shape.
4. Keep it hermetic. `parity.test.ts` is the one exception and it carries its own
   skip.
