# Limitations, assumptions, and the things this system refuses to do

Fluud is an instrument. Every instrument has a field of view, and the honest
version of a flood tool is the one that tells you where its field of view ends.

---

## 1. It never says you are safe

This is the load-bearing rule and it is enforced in code, not just in copy.

Fluud can say **"no flooding detected at this camera."** That is a claim
about a camera and a sensor. It cannot say **"you are safe"** — that would be a
claim about the world, and the world includes the side street behind the camera,
the basement under the building, and the storm drain that clogged four minutes
ago.

Enforced in `agent.py` (template copy and the rules injected into the live
conversation context), in `watch.py` (levels are monotonic within an episode),
and in the empty states of every surface that could otherwise convert an empty
list into a statement about conditions.

⚠️ **It was also in the UI footer, unconditionally, on all four pages, and that
paragraph was removed.** `/terms` §03 and `/about` still say it in prose, both
a page away. A reader who never leaves the map is told this is a prototype and
is not told what it refuses to claim.

## 2. The people most at risk are the least observed

DOT cameras watch intersections, arterials, and highway ramps. Basement
apartments are on residential side streets that no one points a camera at.

So Fluud's coverage is **anticorrelated with the risk it cares most about**.
Absence of detection is not absence of flooding — it is very often absence of a
camera. Any map produced from this system inherits that bias, and saying so is
part of using it.

This is the same failure mode as 311: it measures who reports, not what happens.

**Watching more cameras does not fix this, and can disguise it.** The watch list
went from five hand-picked corners to all 27 gold-tier pairs, which is a real
gain in instrument coverage and no gain at all in *whose* flooding gets seen —
the new 22 are more intersections, arterials and highway ramps, because that is
what DOT points cameras at. On the map the change is worse than neutral: five
pins read as a sample and a reader supplies the caveat, while twenty-seven
across five boroughs read as a survey. More instruments, same bias, higher risk
of being mistaken for coverage.

⚠️ **A reader can now switch the instruments OFF, as of 2026-08-16, and the map
has to survive that.** Every marker class on `/map` has a toggle — cameras,
sensors, pairs, gauges, sewer outfalls — so the drawing can be reduced to a
coastline with nothing on it. That is a legitimate thing to ask for and it is
this section's problem at its sharpest: an empty map reads as an empty city.

**What keeps it honest is that the drawing counts and names what it is not
drawing**, in the footer, on every load — never in the legend, whose own rule
makes it go quieter as the drawing goes emptier. With every instrument class off
it refuses the reading outright rather than listing counts: *"No instrument is
drawn. This drawing reports nothing."* **A change that removes that line removes
the only thing separating a reader's own switch from this section's failure.**

⚠️ **The camera layer also FILTERS as of the same day, and it can make coverage
look better or worse than it is.** A reader can narrow the drawing to a borough,
to a pairing tier, or to both — which is what lets the map reach past the 27
cameras this instrument polls to the ~970 DOT operates at all. Two directions of
error, and the second is this section's:

- **Better than it is.** `not paired` in Manhattan draws 316 pins. That is 316
  *cameras*, not 316 measurements — none of them has a FloodNet sensor within
  250 m and none reports a depth. A dense field of marks on a flood map reads as
  a dense field of instruments.
- **Worse than it is, which is the more dangerous one.** `paired` in the Bronx
  draws **one** camera and Staten Island draws three. A borough-plus-tier view
  can be nearly empty, and an empty drawing of a borough during a storm is
  exactly the *nothing is happening here* this section is about.

**What keeps it honest is the same mechanism and a harder version of it.** A
layer switch's off-state is *total*, so counting what is off accounts for
everything. A filter's is **partial**: 130 pins on a drawing of New York City
look exactly like 130 pins on a drawing of New York City. So the footer prints
the **denominator** on every non-empty state — *"130 of 968 cameras are drawn;
838 are not. A camera that is not drawn says nothing about the water."* — the
header chip carries `130 of 968` in always-visible chrome, and an empty result
refuses the reading rather than listing a zero. That copy is a pure function
(`web/src/lib/camera-filter.ts`) precisely so a test can sweep it, and the
property asserted is that no state can narrow this drawing without saying how
much of the city is missing.

⚠️ **The tiers reach no marker treatment of any kind** — not colour, not dash,
not weight, not size. A monotone ramp over distance is a severity ramp built out
of coverage, which is this section's bias re-drawn as if it were a reading.

**A reader can now measure that gap themselves, and this surface exists because
of this section rather than in spite of it.** Typing an address on `/` or `/map`
returns the nearest FloodNet deployments **with the distance printed on each**,
and it never returns nothing — there is no radius, precisely because a radius
that comes back empty reads as *nothing near me, so I am fine*. When the nearest
sensor is farther than this project will pair a sensor to a camera at all, the
copy says the distance out loud and then says *"Nothing near you is measured.
This is not a statement about conditions."* That is this section stated to the
one reader it is actually about, at the moment they are asking. See §16 for why
an address is allowed to exist on this page at all and the five properties that
have to hold for it to stay that way.

## 3. We do not map basement apartments

We considered it. We're not doing it, and the reason matters.

Most basement units in NYC are unregulated, and their residents are
disproportionately low-income and frequently undocumented. A public, addressable
map of "where the vulnerable basement units are" is a targeting list regardless
of the intent behind it, and it would be trivially repurposable by a landlord,
an enforcement agency, or anyone else.

Exposure is therefore modelled at **neighborhood (NTA) scale** using the DEP
stormwater flood maps, never at building scale. If you fork this, keep that line
where it is.

## 4. Cameras: what we look at and what we discard

**Nothing is fetched from a camera at all any more.** The server stops at the
camera's *index* — id, name, coordinates, still URL — and never at its pixels.
A reader's own browser loads the still directly from DOT.

So the three sections this file used to carry here are one sentence: there was
a frame fetch, there was a water-segmentation model over it, and there was a
`calibration` table storing frame URLs against sensor depths for a training set
nobody assembled. All three are deleted.

What this system does **not** do, and will not be extended to do:

- No face detection or recognition
- No license plate reading
- No person re-identification, and no tracking across cameras
- No counting people entering or leaving any specific building
- No demographic inference of any kind

The database schema contains no image column and no frame URL — check
`schema.sql`. What persists is readings.

## 5. We do not measure depth from cameras

You cannot recover true depth from an uncalibrated monocular camera, and any
system that reports one from a traffic cam is guessing with false precision.

**A camera reports nothing here.** It had an ordinal class over the frame and,
briefly, the segmentation model's own depth estimate in centimetres — a mask
measured against a *drawn* reference line with a 15 cm curb assumed. On a real
frame at South St @ Broad St that read 22.5 cm for a 4.78% water patch: 225 mm,
past the 150 mm curb threshold, from a guess about a guess. Beside a calibrated
millimetre the two were indistinguishable to everything downstream.

Only FloodNet reports millimetres. A camera paired to a sensor shows that
sensor's depth beside its view; the rest show
`no co-located sensor — no depth is measured at this camera`, rather than
silently rendering a blank as zero.

## 6. Known failure modes of the vision layer

**Deleted with the layer.** This table listed seven — night, lighting drift,
prolonged flooding, a repointed camera, snow, rain on the lens, and a process
restart losing the in-memory dry baselines — three of them unmitigated. None of
them can occur, because nothing looks at a frame.

⚠️ **The section number stays.** Code comments cite these by number and a
renumber would silently repoint every one of them.

## 7. The pairing assumption

A sensor 40 m from a camera is ground truth for that corner. A sensor 900 m away
is a different puddle — different catch basin, different grade, possibly a
different sewershed.

Measured against the live feeds on 2026-08-04 (**479 sensors, 969 cameras**):

| Radius | Cameras paired | Verdict |
|---|---|---|
| ≤ 100 m | **28** | Gold. Same corner |
| ≤ 250 m | 137 | Silver. Same block |
| ≤ 500 m | 360 | Same neighborhood at best |
| ≤ 1000 m | 674 | Meaningless |

The gold tier is not a guess. At those distances the two datasets **name the same
intersection independently** — DOT's `South St @ Broad St` sits 8 m from
FloodNet's `M - Broad St/South St`; `3 Ave @ Union St` sits 12 m from
`BK - 3rd Ave/Union St`. Two agencies, two naming conventions, same corner. That
agreement is the strongest evidence we have that the pairing is sound, and it
cost nothing to check.

So the code runs two thresholds: `GOLD_PAIR_M = 100` is what `WATCH_CAMERAS`
was selected on, and `MAX_PAIR_M = 250` gates what may be **operated on** at
all. A silver pair still yields a useful depth beside a view; it is the same
block rather than the same puddle.

⚠️ **`GOLD_PAIR_M` had a second job and lost it.** It gated what could become a
training label for the water-segmentation model. That model is deleted; the
constant is unchanged and is still the distance at which two agencies name the
same intersection.

Both numbers remain judgement calls at the margin. The honest summary: 28
cameras is a small gold set, enough to validate the method and not enough to
claim citywide coverage, and this project does not claim citywide coverage.

**`WATCH_CAMERAS` is exactly that gold set.** Note that the count moves: this table
measured 28 on 2026-08-04 and a later `bootstrap` against 425 deployments pairs
27. Deployments are added and retired, so a gold set is a snapshot and the
generated list in `.env.example` has a date on it for that reason. Neither
number is wrong; they are different days.

## 8. Thresholds are borrowed, not invented

- **10 mm** — FloodNet's own published definition of a flood event. We adopt
  their threshold rather than inventing one so our numbers stay comparable to
  theirs.
- **150 mm** — approximately NYC curb height. Physically meaningful: above it,
  water has left the roadway and is on the sidewalk, which is the path to
  basement stairwells.
- **6.90 ft MLLW** — minor flood stage at The Battery, from NOAA's published
  flood levels for station 8518750. **It is a converted number, and the
  conversion is the whole point.** NOAA publishes `nos_minor: 10.19` in feet
  above *station datum*; `gauges.py` requests water level referenced to *MLLW*,
  and MLLW sits 3.29 ft above station datum, so the comparable figure is
  10.19 − 3.29 = 6.90. Checked from the other side: that is 1.85 ft above MHHW,
  i.e. 0.56 m, which is NOAA's own published minor-flood figure for the
  Battery. Comparing the raw 10.19 against an MLLW reading would never fire —
  the Battery reads 2–5 ft MLLW on an ordinary day. See the derivation comment
  in `gauges.py` before changing it.

The four **USGS stream gauges have no threshold at all**, and the UI says so in
those words rather than borrowing the Battery's. NWS publishes flood stage for
some USGS sites, but not through the endpoint we read, and a threshold we made
up would be the exact thing this section exists to forbid.

⚠️ **There was a third set of thresholds here — the ordinal cuts a
water-segmentation model's output was banded at — and they were labelled
guesses in the source.** That layer is deleted, so the only thresholds left in
this app are the two borrowed ones and each gauge's own published stage.

## 9. Language

`agent.SUPPORTED` ships English and Spanish. Everything in
`agent.PENDING_REVIEW` is scaffolded and deliberately left **untranslated**.

Machine-translating a flood warning and putting it in front of someone in an
emergency is worse than saying nothing — a mistranslated instruction to shelter
instead of evacuate is the failure mode. `/api/speak` returns a 400 for
unreviewed languages. Get a native speaker to review before shipping any of them.

Warnings are delivered as **text only**. There is no synthesized speech, which
removes one accessibility failure (an audio-only alarm excludes deaf and
hard-of-hearing users, and is inaudible on a muted device) and leaves another
standing: a text-only warning excludes people who cannot read the language it is
written in, which is exactly what §9 is about.

⚠️ **"Text only" is now literal in a way it was not.** The page used to render a
still image of a rat beside the warning, on a ramp from settled to fleeing. That
warning is unmounted and the rat went with it; the graffiti rats elsewhere on the
site were deleted outright on 2026-08-14. **No page renders a picture that
carries any part of a warning.**

The rule those images were held to survives them and binds anything decorative
that follows: `aria-hidden`, empty `alt`, **no information**. Giving decoration
descriptive alt text puts words in front of somebody that the server never
templated, and the templating is what makes the copy reviewable.

## 10. Reproducibility

Every external source is listed in the README with its access method. No scraped
sources, no undocumented private feeds beyond `FLOODNET_API_BASE`, which is
operator-supplied and explicitly optional.

⚠️ **One source in that table is not fetched by this codebase at all.** NYC
Planning Labs GeoSearch is called by the **reader's browser**, from
`web/src/lib/geosearch.ts`, and never by `waterline/`. It is listed there anyway
because a source a reader's data goes to is a source, whichever process makes the
request — and because being absent from that table is exactly how an undisclosed
third party would look. It is the only runtime third-party request on this site
besides the Adobe Fonts kit, it stores nothing, and §16 carries the argument.

### What this rule cost us: real-time combined sewer overflow

This is the clearest case of the rule above being expensive, so it is written
down rather than quietly dropped.

Combined sewer overflow is the mechanism this project was named for until
2026-08-14. NYC's sewers carry storm water and waste in one pipe; when rain fills
them past capacity they discharge, and rats leave through the drains ahead of the
water — which is where the old name came from and why the messenger was a rat. A
live CSO discharge signal would still be the single most on-thesis feed
available, and the rename changed nothing about that.

**There is no public machine-readable feed for it.** Under the Sewage Pollution
Right to Know Act, discharges are reported through **NY-Alert** — a subscription
email and SMS system — and DEC posts a rolling seven-day HTML page. No API, no
RSS, no JSON. Getting it would mean scraping, which this section forbids. And
the underlying record is known-incomplete: in December 2023 a NYS Supreme Court
ruling found that NYC DEP had failed to report CSO discharges as required.

So Fluud ships the **outfall locations** — 427 of them, from NY State DEC's
registry (`ephi-ffu6`), committed as geometry and drawn as an optional map
layer. That is a permanent fact about the city's plumbing and a genuinely useful
one. It is **not** discharge activity, the map layer says so in its caption, and
nothing in this system can tell you whether an outfall is running right now.

The registry is dated **2015**. Outfalls are civil infrastructure and rarely
move, but the UI states the vintage rather than letting a committed file imply
currency.

Modes are partitioned in the database (`observations.mode`,
`sensor_readings.mode`, `sensor_episodes.mode`) so replay data can never be
mistaken for live history. The UI badge is not
decorative — it is the provenance label.

## 11. Sensors fault, and a threshold alone will cry wolf

The single most consequential thing we learned by pointing this at live data.

On **2026-08-04**, in dry weather, with zero NWS flood alerts active anywhere in
New York State, four FloodNet sensors were reporting:

| Sensor | Depth | | FloodNet `flood_detected` |
|---|---|---|---|
| Q - Namesake Ave/Chandler St | 1452 mm | 4.8 ft | `false` |
| M - W 143rd St/Frederick Douglass | 876 mm | 2.9 ft | `false` |
| BK - Richardson St/N 11th St | 751 mm | 2.5 ft | `false` |
| BK - W 31st Ave/Neptune Ave | 666 mm | 2.2 ft | `false` |

These are faulted ultrasonic rangefinders, not floods. The sensors are mounted
2–3 m above the ground; one that loses its echo, ices over, or ranges off a
parked truck reports a large apparent depth.

A naive `depth_mm >= 10` rule — which is what this repo shipped in its first
commit, and what the FloodNet-published threshold literally says — fires **four
EMERGENCY alerts for floods that do not exist**, in clear weather.

In a life-safety tool this is not a cosmetic bug. Crying wolf is the mechanism by
which the next real warning gets ignored. It is the mirror image of the false
negative in §1 and it is just as dangerous.

**The rule now:** depth below the plausibility ceiling
(`floodnet.IMPLAUSIBLE_MM`, 600 mm) is trusted on its own — that is the regime
where the sensor is reliable and where this failure mode does not live. Above it,
alerting requires an **independent second witness**: FloodNet's own
`flood_detected`, an active NWS alert, or the harbor above minor flood stage
under a tidal sensor. One rangefinder corroborating itself does not count.

⚠️ **There were four witnesses and the fourth was the camera seeing water.** It
went with the water-segmentation layer. `escalation._depth_is_credible` and
`watch.is_credible` now take the same three, and `check_watch.py` asserts they
agree over the whole 288-combination matrix rather than trusting it.

Rejections are logged loudly rather than dropped silently, because a sensor
reading 4.8 feet in July is information — about the sensor.

### ⚠️ That rule gates alerting. It does not gate the display, and widening the
### watch list made that visible

`_depth_is_credible` decides whether a depth may raise a warning. Nothing decided
whether it may be *shown*. `/api/status` carried `depth_mm` and no plausibility
flag at all, and none of the wire fields said "this number is suspect".

Going from five watched cameras to all 27 gold pairs put two faulted sensors on
screen immediately, on a clear night, both rendered in the same typography as a
real reading:

| Camera | Shown as | Should read as |
|---|---|---|
| Northern Blvd @ Bell Blvd | `-466mm` | a fault. Negative depth is not a depth |
| BQE @ Queens Blvd | `38.1in` | a fault. 967 mm, `flood_detected` false |

Neither raised an alert, so the second-witness rule did its job. But **a
nonsense number displayed in the depth slot is its own false claim**, and this project's whole
argument is that the number and the claim it makes have to agree. `-466mm` is
worse than the 38-inch one: it is not even wrong in a direction a reader could
reason about, and it sits where a card otherwise says `0mm`.

This was always true and the five-camera list simply never contained a faulted
sensor. Widening the list did not create the gap; it stopped hiding it. Closing
it means putting plausibility on the wire and giving the UI a way to render "the
sensor is faulted" that is distinct from both a depth and an absence — the same
distinction `calibrated` already draws between `0 mm` and no sensor at all.

### ✅ Closed on 2026-08-05 — and the flag had a hole in it

Plausibility is on the wire: `depth_plausible` on every `/api/status` camera and
`plausible` on every `/api/sensors` row. The UI renders the fault as its own
state, distinct from both a depth and an absence — a neutral-outlined `FAULT`
chip in the list, a *"sensor fault — this is not a depth"* line on the detail
face naming which bound was crossed, an unfilled ring on the map, and a sort
that puts every believable reading above it. The digits stay: they are the
evidence that the instrument is broken, and blanking them would hide the fault
rather than report it.

⚠️ **One correction to the table above, and it matters.** `-466 mm` was called
*plausible* by the code at the time. The rule was `depth < IMPLAUSIBLE_MM` —
a ceiling with **no floor** — so the reading this section names as the worse of
the two would have passed the flag even once the flag existed. Adding
`IMPLAUSIBLE_MIN_MM` was therefore part of closing this, not a separate tidy-up.

Its value is derived from measurement rather than chosen, and the derivation is
in the constant's comment: `depth_filt_mm` has never been observed negative
(0 of 388 rows), but `floodnet._first_num` falls back to `depth_raw_mm`, an
uncorrected range that is negative on 96% of rows and documented as sitting near
−20 mm. The floor has to clear raw's normal excursion (worst observed −116)
without admitting the faults (nearest −261), and the data leaves a wide empty
band between them.

**Widening the band cannot change a single alerting decision**, in either
direction: `escalation.level_for` only raises a level at
`depth_mm >= flood_event_mm`, and every affected reading is below zero.
`scripts/check_escalation.py` asserts exactly that, at *both* plausibility
verdicts, so the claim is checked rather than argued.

### ⚠️ What is NOT closed: absence rendered as zero, one layer up

While closing the above, a second and quieter version of the same fault turned
up in the ingest layer. `floodnet._first_num` returned **`0`** when a row's
`depth_filt_mm`, `depth_proc_mm` and `depth_raw_mm` were all null — so a sensor
that published nothing became a confident `0.0 mm`, which is a claim that the
street is dry. Measured: **8–9 of ~399 rows on every poll.** At 27 paired
sensors it plausibly never fired, which is how it survived.

It now returns `None`, and the caller counts and logs the drop. Recorded here
because the general lesson is the same one §11 is about: **a default value and a
dropped row are not the same thing, and the default is the more dangerous** —
absence that looks like an answer.

## 12. We defer to FloodNet on which sensors may alarm

`deployments.alert_visibility` and `sensor_status` are published by FloodNet
precisely because not every deployment is fit to raise a public alarm — some are
newly installed, under maintenance, or known-noisy.

Fluud honours that flag. A sensor FloodNet has disabled still appears in the
display, with its reading, but **cannot be watched by email** — the API refuses
such an id with a 400 naming the reason rather than dropping it silently, and
the panel offers no control where the answer is no. Overriding the operator's
own judgement to make a demo louder would be exactly the wrong trade here.

### ⚠️ "Alert-enabled" is three numbers, and only one of them promises anything

This section used to say "346 are alert-enabled", which matched neither of the
two real counts and has been re-measured rather than adjusted:

| | today | what it means |
|---|---:|---|
| `alert_visible` | **401** | FloodNet permits this deployment to alarm |
| `alert_permitted` | **343** | ...and its sensor is currently healthy |
| `watched_camera_id` | **21** | paired to a camera in `WATCH_CAMERAS` |

The first two are FloodNet's judgement about their own hardware.
`alert_permitted` is the one that gates anything: it is what the email watch
admits, and `waterline/watch.py` is a sensor-only state machine with **no
camera in it at all**, so any deployment FloodNet considers healthy can send a
subscriber a warning with no pairing whatsoever.

`watched_camera_id` names the camera whose view that sensor's depth labels. It
gates nothing.

⚠️ **This section has been wrong about that field twice, and the shape of both
errors is the same.** It said a sensor with no camera was *inert* — false for
the 325 deployments this app will mail somebody about. It was repaired to *"the
warning is raised on the page"* — and that went false in turn when the on-page
alert system was unwired. **Nothing on any page raises a warning from anything now.**
A claim built on either field has to name its path.

⚠️ **21 and not 27.** Twenty-seven cameras are watched, but four sensors serve
more than one of them — one serves four — so the distinct sensor count is lower.

All three ship on `/api/sensors`, and the sensor list states them in words above
the rows, because a list of 425 instruments on a flood page otherwise reads as
425 things watching out for you.

## 13. The harbor baseline is regional, and it is not your block

Fluud reads five water-level gauges: NOAA CO-OPS at The Battery, and four
USGS stream gauges (Bronx River, Alley Creek, Richmond Creek, Lemon Creek).
Together they are the **baseline** — the thing that tells you whether 40 mm on a
street is a storm draining or the harbor sitting high.

**They do not measure anyone's street.** The Battery is a single point at the
southern tip of Manhattan; the other four are creeks. A gauge miles away can
tell you what the water around the city is doing and can never tell you what is
happening on a given block. The panel says this in those words.

**Levels are not comparable between gauges.** NOAA here is referenced to MLLW;
each USGS gage height is referenced to that site's own local datum. 0.65 ft at
Bronx River and 4.50 ft at the Battery are not two points on one scale, and
nothing in this system ranks, averages or plots them against each other.

**The tide is allowed to corroborate a depth, and only under a tidal sensor.**
An implausibly large depth requires an independent second witness (§11). A Battery reading above minor flood stage counts as one — but only for
a sensor FloodNet marks tidally influenced, because that is one body of water
reaching two instruments. Under an inland stormwater sensor the same number
corroborates nothing, and admitting it there would manufacture evidence out of a
coincidence. All four of the phantom sensors in §11 are non-tidal and remain
rejected on a day when the harbor is high.

The witness also **expires in 60 minutes** (`gauges.WITNESS_MAX_AGE`). Without
that, a gauge that died at high water would keep testifying indefinitely, and
the only thing it gates is whether a suspect depth may raise an alarm.

**Sampling interval is not publication lag**, and confusing the two is the trap
here. Measured over 48 hours, all four USGS sites sample every 15 minutes with
no gaps — but their newest published point runs **21 to 81 minutes behind wall
clock**, because the telemetry arrives late. A gauge an hour old is a healthy
gauge. Staleness thresholds are set against the lag, not the interval, so the
panel is not permanently amber.

Finally, USGS returns dead gauges as active: `01406710 Raritan River at South
Amboy` answers a `siteStatus=active` query with a value from **2016**. Any gauge
that stops must reach the page reading *dead* — never dropped, never shown as
current.

## 13a. An NWS alert is not a reading, and a quiet feed is not a dry street

Since 2026-08-15 the same panel carries every active National Weather Service
alert for the five boroughs. Four things about that are limitations rather than
features.

**Fluud does not issue these and does not speak for NWS.** It reads
`api.weather.gov/alerts/active`, renders the event name, the headline, the
severity NWS assigned and the expiry NWS published, and adds nothing. It does not
rank them against each other beyond NWS's own severity order, and it never
combines one with a depth reading to produce a third thing.

**The scale is wrong for a block, in the opposite direction to a sensor.** An
NWS product covers counties or forecast zones and is issued largely off radar
rainfall rate. FloodNet measures standing water at a few hundred specific
corners. **Rain falling and water ponding are different quantities**, so a flood
warning with every instrument reading zero, and 200 mm at a corner with no alert
anywhere, are both ordinary. Neither is evidence the other is wrong. `poll
validate` prints both and has always refused to draw a conclusion.

**An empty list is the ambiguous case, and the panel refuses to resolve it.**
Nothing listed can mean the feed was read and NWS has nothing active, or that we
could not reach it, or that the poll loop stopped. Those are different claims and
the panel says which one it is holding — it will say *we do not know* rather than
report quiet. **What it will never say is that anywhere is clear**, because an
absence of warnings is not an observation of a street.

**The alerts shown and the alerts that affect a warning are different sets, on
purpose.** Only a flood or rain product can corroborate an implausible depth
reading (§11). A Tornado Warning or a Heat Advisory is displayed and is *not*
evidence about water, so it cannot make this system believe a faulted rangefinder
or raise anybody's sensor. That asymmetry is deliberate and asserted in
`scripts/check_watch.py`.

For official warnings, and for anything you would act on: **[NWS New
York](https://www.weather.gov/okx/)** and Notify NYC. This panel is a convenience
copy of a public feed, sitting next to instruments that measure something else.

## 14. ❌ Rodent inspections — REMOVED, and the number is retired

⚠️ **The section number is kept deliberately.** Sections here are cited by
number from `CLAUDE.md`, the check scripts and half a dozen components;
renumbering to close a gap would silently repoint every one of them. There is no
§14 content any more, and this entry is what §14 says.

**What it described.** The selected-instrument panel's back showed one line of
DOHMH rodent-inspection context for the camera's neighborhood — the share of
inspections in that NTA that found rat activity, with its denominator and the
date it was published. It earned its place when the messenger was a sewer rat.

**What happened.** The project was renamed to Fluud on 2026-08-14, the rat went
with the name, and the feature went with the rat: `neighborhood-back.tsx`,
`waterline/rodent_nta.py`, `scripts/rodent.py`, the `rodent_activity_rate` /
`rodent_inspections` / `rodent_as_of` wire fields, and the panel flip that
reached them are all deleted. **No number on this site is about anything but
water.**

⚠️ **The NTA display NAME survived and is not the same thing.** It is geography
rather than rat data — DOHMH supplied the inspection counts and the DCP 2020 NTA
layer supplied the names — and two live surfaces need it: the sensor face renders
a `neighbourhood` row, and the instrument search matches on it.
`scripts/nta.py` generates it from the DCP layer alone, and coverage went **up**
as a result, 213 NTAs to 262, because the old file could only name a
neighbourhood the city had inspected that year.

### The rules this section stated, and which of them outlived the data

- ✅ **NTA is the floor and nothing may go finer** — no block, no building, no
  address. §3 is the general form and it is untouched. The enforcement idiom
  survives too: `rodent.py`'s `$select` **never requested** the address columns
  the source dataset carries (`bbl`, `bin`, `house_number`, `street_name`,
  `latitude`, `longitude`), because not-asking is stronger than
  asking-and-discarding — a discard is one careless edit away from a leak and a
  `$select` is not. `nta.py` asks for two columns of pure geography.
- ✅ **A figure that is not a flood measurement carries its denominator and its
  date, on the face that renders it**, and is never put on a scale or tinted by
  value. **If any non-water number ever returns to this UI, that is the rule it
  arrives under.**
- ✅ **Collection bias is stated where the figure is shown.** Inspection routing
  is partly complaint-driven, so it measured where the city *looked* as much as
  what it found — the same objection §2 raises against 311.
- ❌ **"It never touches a decision, and the rat never cites it."** Retired: there
  is no such figure and no rat. The general rule it was an instance of — nothing
  outside the instruments may reach `watch.py` or `agent.py` — is unchanged and
  is enforced by those modules being pure.
## 15. This is a prototype

Fluud is not an emergency service and is not affiliated with FloodNet, NYC
DOT, NYC Emergency Management, or the National Weather Service.

For official warnings: **[NWS New York](https://www.weather.gov/okx/)** and
**[Notify NYC](https://a858-nycnotify.nyc.gov/notifynyc/)**.

If water is rising and you are below street level, leave and go up. Call 911.

## 16. A watch is a promise this system cannot fully keep

Fluud can email you when a FloodNet sensor you picked changes state. That
feature stores the only person record in this database, and it makes a promise
whose failure mode is silence — so both halves are written out here rather than
left to be discovered.

⚠️ **This is the only thing in the app that writes to a person.** Nothing on
any page raises a warning: the on-page alert system was unwired, so the pages
are an instrument and the inbox is the alarm.

### ⚠️ It was broken in production, and this is the record of it

From the day the sign-in gate landed until **2026-08-16**, **every link Fluud
mailed was unreachable.** Confirm and manage both pointed at `/map/?confirm=…`
and `/map/?watch=…`; `/map` is wrapped in `RequireSession`, so a subscriber with
no Fluud account was redirected to sign-in before the component that reads the
token ever mounted, and a reader who *did* sign in came back with the query
string stripped and the token lost. **No address could be confirmed, and no
unsubscribe link worked.**

That defeated a deliberate exemption. `api._AUTH_EXEMPT` carries
`/api/watch/confirm` and `/api/watch/unsubscribe` precisely so somebody with no
account can use a mailed link, on the argument that an unsubscribe link demanding
a sign-in is indefensible — and a gated page in front of them made the exemption
unreachable. **An exemption is a claim about a reader's whole path, not about one
request.**

Nothing caught it. `./scripts/check` was green because `check_mail.py` passed the
path *as an argument* to the helper it was testing; `tsc`, `vitest` and
`next build` have no opinion about which page a string names. It is the same
class of gap as the CSS rules and the `en`/`es` variant parity: **a rule that
exists is not a rule that is checked.** There is a caller-path section in
`check_mail.py` now, with a negative assertion on `/map/?`.

The fix is `/watch/`, a route with no session gate, and
`/api/watch/subscription` joining the exemption so the manage face can load.
**Two costs are stated rather than hidden**, both because the surfaces that would
close them live behind the gate:

- ⚠️ **Signed out, a reader cannot ADD an instrument.** That needs
  `/api/sensors`, which stays gated. Dropping one, editing settings and deleting
  the whole record all work. The page says which is which, because a withheld
  control with a silent gap reads as something failing to load.
- ⚠️ **Signed out, a reader whose token is gone has no recovery door.**
  `/api/watch/resend` is deliberately **not** exempt — it is the only route a
  stranger can cause mail to be sent from — so both recovery doors are in the
  wizard on `/map`. A dead token gets a 404 and an explanation of why the page
  cannot say *which* of expired, used or deleted it was: the server answers
  identically for all three so a caller cannot use it to test whether an address
  is on Fluud.

### The record grew on 2026-08-06: cameras, and notification settings

Two additions, recorded here because §16's whole method is listing what is
held.

- ⚠️ **`camera_subscriptions` is DORMANT.** It joined a subscriber to DOT
  cameras so an `alerts` episode already published on the page could be
  repeated by mail. That path was unwired and the `alerts` table went with it,
  so nothing writes here and nothing reads here: both write routes refuse
  `camera_ids` with a 400 naming the reason, and the wire shape is deleted. The
  table stays because a `drop` in `schema.sql` would destroy rows on every
  deploy — see that file's header. Any rows a reader already had are
  un-dropped and unread, and nothing will ever be mailed about them.
- **Notification settings**: a minimum level, a frequency (`every` / `first`),
  optional quiet hours (America/New_York), and per-instrument copies of the
  first two. Preferences about mail, not facts about a person — no location,
  no behaviour, nothing derived. ⚠️ **The two rules that keep them honest are
  in `notify.py` and asserted by `check_notify.py`**: a preference may only
  ever subtract messages, and an EMERGENCY passes every preference. Quiet
  hours **suppress rather than delay** — a warning held until morning is
  a past emergency presented as a current one, by appointment — and the wizard,
  the terms (§04 on
  `/terms`) and the confirm flow all say the emergency exemption out loud.
  One honest caveat: quiet hours are two small integers that describe when
  somebody sleeps. That is the closest this table comes to a fact about a
  person's day, it is optional, and it is deleted with everything else.

### Silence is ambiguous, and that is the biggest risk in the feature

On the page, a frozen poller is visible: every card carries its own age, the
freshness line summarises them, and the notices strip reads `/api/healthz`.
**In an inbox there
is no card.** A subscriber's entire evidence about whether this system is alive
is whether an email arrived, and there are at least six ways to receive nothing
from a system that is completely broken:

1. The host suspended the container between requests and the poll thread
   stopped ticking — no error, no crash, invisible from a mailbox.
2. The drain stopped and `/api/healthz` still says the process is alive.
3. SMTP is unconfigured, or configured and rejecting. ⚠️ **The first half of
   this is surfaced as of 2026-08-06, and only at sign-up.** `/healthz` carries
   `mail_delivers` (`mail.transport_delivers()`) and the watch panel's confirm
   face says *"No email was sent"* outright rather than *"check that address"*,
   so nobody is sent to an inbox against `MAIL_TRANSPORT=log` — the shipped
   default. It is **capability, not delivery**: a configured transport that is
   rejecting, greylisting or filing to spam still reads as healthy here, and a
   subscriber past confirmation is told nothing at all. This narrows the
   window in which silence is ambiguous; it does not close it.
4. The message was accepted by a relay and filed as spam. `outbox.status =
   'sent'` means **handed to a relay** and nothing more; there is no mailbox on
   this side to read a bounce from, and there will not be one.
5. Your sensor stopped reporting.
6. There is no sensor where the water is — §2, and it cannot be fixed.

⚠️ **Failure 5 is surfaced, half of failure 3 is surfaced at sign-up, and NONE
of the six is mitigated in the inbox.** That
changed on 2026-08-05, **on the owner's instruction**, and it is the most
consequential thing in this section — so it is written out rather than folded
into the sentence above.

**What it was.** `watch.silence_notice_due` queued one email per silence when a
watched instrument had been quiet for an hour, and `mail_silence` ended on *"This
is not a statement about conditions."* Failure 5, and only failure 5, reached a
reader who was not looking at the page.

**What it is.** `watch.is_silent` sets a boolean on each instrument in
`/api/watch/subscription`, and `watch-panel.tsx` renders one `--wl-stale` line
naming the quiet ones. **No email is sent.** The threshold did not move — it is
the same hour `staleness.ts` calls a sensor stale — and the copy still refuses to
describe conditions in the same words.

⚠️ **A page cannot reach somebody who is not looking at it**, and this was the
one signal in the feature whose entire purpose was arriving uninvited. So the
honest statement is now the plain one: **a subscriber who receives nothing has no
way to distinguish any of the six cases, and must open the page to learn
anything.** The mitigation moved from the transport that reaches people to the
one that does not.

**What the move bought, stated so the trade is legible rather than implied:**

- **The fan-out cannot happen.** The notice was per-sensor, which is right when
  one instrument stops and catastrophic when the feed does — a FloodNet outage
  put every subscribed sensor past the threshold in the same tick. Measured on
  five subscribers watching ten instruments each: **50 emails from a single
  tick**, a mail-reputation event and a false signal at once. A line on a page
  cannot multiply.
- **It cannot go stale.** An email asserts a fact at queue time and is read
  whenever it is read. The line is recomputed on every load and disappears on its
  own when the instrument reports again — there is no notice to dedupe, so
  `db.silence_notified_since` and the `silence` outbox kind are both gone.
- **It cannot be wrong about whose fault it is.** `watch.citywide_silence` still
  gates it, because that half of the argument never depended on the transport:
  when at least half the registry is dark the instruments did not fail, we lost
  the feed, and naming a reader's corner would be a true-shaped sentence about
  the wrong subject. The panel says so instead. The margin is measured rather
  than guessed — about 30 of 425 deployments are legitimately silent on any given
  tick, a **7%** resting floor, so the threshold sits seven times above what a
  bad afternoon produces. ⚠️ Coverage is counted out of Postgres
  (`db.registry_coverage`) rather than from a poller's memory, because the
  in-process version read `(0, 0)` on an API-only instance and claimed a
  permanent outage. **Water episodes are never suppressed by any of this**: a
  reading that actually arrived is still evidence, whatever happened to the other
  four hundred.

The honest fix remains a **positive heartbeat** — a periodic "still watching, N
instruments, last reading X" message, so that silence stops carrying information
it cannot carry. **It is not built**, and the removal above makes that the more
defensible criticism rather than the less. What exists instead: the confirmation
email states the problem before anybody relies on it, the panel states it above
the submit button rather than in a disclosure, and `poll probe` reports the
oldest queued message, which is the delivery-side analogue of `last_tick_at`.

### ⚠️ The stand-down email is gone, and nothing replaced it

Also 2026-08-05, also **on the owner's instruction**. When an episode closed
after `clear_readings_to_stand_down` consecutive clear readings, `mail_standdown`
said what had closed — one instrument, one threshold, a counted run of readings —
and then refused the inference twice, ending on *"This is not a statement about
conditions."*

It was the most dangerous message this feature sent, because whatever it said the
reader heard *it's over*, and two paragraphs of refusal were the price of sending
it at all. **The episode still closes**: `poll._watch_sensors` writes the
transition to `sensor_episodes` exactly as before, and `watch.should_notify` no
longer lists `close`. What is gone is the message.

**What that costs.** A subscriber told *"water above the curb"* is never told the
instrument went back under the mark. Their last word from Fluud about that
corner is the worst one, and the only way to learn otherwise is to open the page.
That is defensible — an inbox is a bad place to learn something is over, and this
system may never say anywhere is safe — but it is a real asymmetry
and it is the reason it is written here rather than in a commit message.

### Email is slow, and a warning can arrive after the water

Up to 60s of poll, plus a drain, plus relay queuing, plus greylisting, plus spam
filtering. `mail.MAX_AGE_S` drops anything older than 15 minutes rather than
sending it — the stale-replay rule applied to a second transport, because a
flood warning
that arrives late presents a past emergency as a current one and the reader acts
on it. NWS and Notify NYC have paths to a phone that this does not, and every
message says so.

### `(email, sensor_id)` is the same shape as the targeting list §3 refuses

§3 refuses to map basement apartments because *"a public, addressable map of
'where the vulnerable basement units are' is a targeting list regardless of the
intent behind it"*, and §14 sets the standard: *not-asking is stronger than
asking-and-discarding*. A table joining an address to the corners it cares about
is that shape, and it is defensible on exactly three grounds. **All three must
hold; if any stops being true, the table stops being defensible.**

1. **Self-selected.** §3's objection is to a *derived* map — exposure inferred
   about people who never participated. This is somebody volunteering a corner.
   That is the load-bearing difference.
2. **Instrument granularity, never building.** A `sensor_id` is a FloodNet
   deployment at a signalised intersection whose location FloodNet already
   publishes. It is coarser than a block and far coarser than a unit — the same
   discipline the NTA-scale rule sets, reached by a different route.
3. **Hard-deleted and never accumulated.** Unsubscribing is a `delete`, and the
   cascade takes the interests and every queued message with it. No IP, no
   user-agent, no referrer, no session, no open tracking, no click tracking, no
   `last_seen_at`, no soft-delete tombstone, and no history of what one person
   was sent beyond the outbox retention window.

⚠️ **All three were re-checked against the verified-self subscribe on
2026-08-16 and all three hold — one of them more strongly than before.** That
change lets a reader signed in with a provider-verified address be subscribed
without a confirmation step. Ground 1 gets *stronger*: the volunteering is now
attached to a proven mailbox rather than to a typed string, so a row created that
way cannot be somebody else's address. Ground 2 is untouched — the granularity is
the same `sensor_id`. Ground 3 is untouched: no column was added, `subscribers`
is unchanged, and the delete still cascades. ⚠️ **And the gap above narrows**,
because that reader's row is never unconfirmed: they hold a manage token from the
first response, so the state with no reader-held key is one they never enter.

**Two costs come with it and neither is small enough to leave unwritten.**

- ⚠️ **The manage token gained a SECOND exit from the server.** It travelled only
  in mail until then. `POST /api/watch/subscribe` now returns it in a JSON body
  on that one branch, so it is in the browser's memory, in devtools, and in
  anything between us and the reader that logs bodies. The UI holds it in
  component state, renders it as one `<a href>`, and **may not persist it** — no
  storage, no cache, and never a `router.push`, which would put a bearer
  credential in the history stack.
- ⚠️ **Changing a Neon account's address to one that already subscribes hands
  that account holder the subscriber's token**, if the provider marks the new
  address verified. What bounds it is that `email_verified` is provider-attested
  rather than self-asserted, and that the same person could already press
  `resend link` and have the token mailed to that mailbox — so this is a faster
  route to something the resend widening above already permits, not a new one.

⚠️ **What would break ground 1 is dropping the `email_verified` check.** A
session alone is not proof of a mailbox: Better Auth's password sign-up writes
`neon_auth.account.password` with `emailVerified` false, so trusting any session
would let somebody sign up with an address they do not hold and be subscribed to
it without a link ever being sent. **That check is the whole of what makes this
defensible**, and `REQUIRE_AUTH=false` disabling the branch entirely is the same
argument at the deployment level.

⚠️ **Ground 3 has a gap before confirmation, and it is written here rather than
left to be discovered.** Unsubscribing is a hard delete because the reader holds
the manage token. **An unconfirmed row has no reader-held key at all** — the
confirm token goes to the mailbox and never to the browser — so somebody who
types an address and changes their mind one second later cannot delete it on
request. `db.prune_unconfirmed` sweeps it, and until then a row holding an
address somebody typed outlives the moment they wanted it gone.

**Three things bound it, and they are why this is a gap rather than a breach.**
The row is inert: nothing but its own confirmation is ever sent to it, which is
`schema.sql`'s double opt-in and the real abuse control on an unauthenticated
POST. It expires on its own. And it carries no interests that can act — the
`subscriptions` rows exist, and `db.watched_sensor_rows` filters on
`confirmed_at is not null`, so an unconfirmed record joins no fan-out.

⚠️ **All three still hold, and the first one was WIDENED on 2026-08-06 — stated
here rather than left to be discovered, because from a distance it looks like
the double opt-in being relaxed.** *"Nothing but its own confirmation"* is
unchanged and is the whole property. What changed is that
`/api/watch/resend` will now send that confirmation **again**, up to
`api.CONFIRM_RESENDS_MAX` (3) for the row's lifetime.

**Why it had to.** A reader whose confirmation was filtered, deleted or never
delivered had **no way back at all**: re-submitting hits `subscribers.email
unique`, `db.create_subscriber` returns None, nothing is queued, and the panel
still says `pending`. The resend route refused them by design. So the one
message the feature exists to deliver was the one message it could not re-send,
and the only thing that ever touched such a row was `db.prune_unconfirmed`,
seven days later. That is the same class of state the resend route was written
for — *"not a state this feature may leave anybody in"* — arriving one step
earlier in the flow.

**What it costs, in the terms this section uses.** The bound stopped being
structural and became counted. `subscribers.email unique` made *"an
unauthenticated POST can mail a stranger once"* true by construction; a repeat
on request cannot be, so it is a lifetime ceiling read out of the outbox
(`db.confirm_message_count` — 30-day retention outliving the 7-day row, so a
prune cannot reset it). **The worst case goes from one message to a stranger to
three**, and each is byte-for-byte the message `subscribe` already sent, so it
discloses nothing new about the address. ⚠️ **A counter column on `subscribers`
was the intuitive implementation and it is the one to refuse** — ground 3 is
that this table never accumulates, and the outbox already records that somebody
was written to.

**Four properties hold across both branches** and each is on the route:
`confirmed_at is null` only, so the manage token — a bearer credential — is
never sent to an address that has not proved it owns the mailbox; the response
is identical for confirmed, unconfirmed, capped and unknown; the existing rate
bucket applies; and nothing composes a new message. ⚠️ **Those are the same
three the deletion route below is required to answer**, which is not a
coincidence: they are what any route taking a bare address has to satisfy.

⚠️ **The panel says this rather than implying otherwise.** `watch-panel.tsx`'s
confirm face gained `stop waiting` on 2026-08-06, and it is a **page state**:
it clears the panel and drops the typed address, and three sentences under it
say the link still works and the address is deleted. The button may not be
called `cancel` for exactly that reason — see the **Never** entry in the root
`CLAUDE.md`.

**The honest fix is a route, and it is not built.** It would take an address
with no credential behind it, so it has to answer three things first: it must
delete only rows where `confirmed_at is null`, it must answer identically for a
known and an unknown address (the property `subscribe` and `resend` already
hold), and it must carry its own rate-limit bucket. Until it exists the gap is
the pruning window, and the panel does not pretend otherwise.

Each of the following is a plausible "improvement" that breaks one of those
three, and none may be added:

- ✅ ⚠️ **A street address field, to find somebody their nearest sensor —
  ESCAPE TAKEN on 2026-08-05.** See the section below, which replaces this
  bullet rather than deleting it: the rule was always a ban on the **coupling**,
  it named its own escape in its second sentence, and the escape is now taken.
- ⚠️ **Open tracking, a pixel, or link wrapping.** That turns a subscription
  list into a behaviour log of who reads flood warnings and when.
- ⚠️ **A soft-delete flag.** A record of a person who asked to leave is a record
  of a person.
- ⚠️ **Keeping the sender IP "for abuse".** The rate limit in `api.py` is global
  rather than per-IP precisely so this is not needed, and the comment there says
  so.
- ⚠️ **An admin surface listing subscribers by sensor.** There must not be one.
  `db.watch_counts()` returns aggregates for `poll probe` and there is
  deliberately no function that lists who is watching a corner.
  `db.confirmed_subscriber_by_email` takes an address the caller already typed
  and answers about that one row; it cannot enumerate, and the route above it
  cannot report what it found.

### ✅ ⚠️ The address field: the escape that bullet named, taken on 2026-08-05

The bullet above read, in full:

> ⚠️ **A ZIP or street address field, to find somebody their nearest sensor.**
> That is building scale arriving through the front door. **Geocode in the
> browser or not at all; the server must never receive it.**

**That was always a ban on the coupling, not on the feature, and its own second
sentence is the escape.** The threat model this section states is a database
dump yielding *"these addresses care about these corners"*. A browsing surface
that never touches `subscribers` and stores nothing produces no such record —
there is no row to dump. So `/` and `/map` now take a typed address, geocode it
**in the browser**, and order the FloodNet deployments by distance from it.

This is recorded here as an amendment rather than left to look like a quietly
relaxed rule, because from a distance it looks exactly like drift.

**Five properties, and ALL of them must hold.** If any one stops being true the
feature stops being defensible, on the same terms as the three grounds above:

1. **It never reaches `api.py`.** Not in a body, not in a query string, not in a
   header, not in a log line. `web/src/lib/geosearch.ts` calls NYC Planning Labs
   directly and is the only absolute URL in the application; it deliberately does
   **not** go through `lib/api.ts`. The check is that
   `git diff --stat -- waterline/ ':(exclude)waterline/CLAUDE.md'` for this
   change comes back **empty** — no route, no model, no column, no env var. That
   emptiness is the proof. (`waterline/CLAUDE.md` itself gained a section stating
   the rule from the Python side, which is prose rather than code.)
2. **It is never stored.** Nowhere: not `localStorage`, not `sessionStorage`, not
   IndexedDB, and not a module-level `Map` "to make it feel faster". A geocode
   cache is accumulation, which is ground 3. It lives in React state and dies
   with the tab.
3. ⚠️ **It is not coupled to the watch flow, and this is the load-bearing one.**
   The address does not pre-select instruments, does not pre-fill the watch
   panel, and is never submitted alongside a subscription. An address that chose
   somebody's watched corners would make `(email, sensor_id)` a **derived**
   record of where they live — precisely what ground 1 refuses. The two surfaces
   share `ordered` and nothing else.
4. **It only reorders.** It filters nothing, removes nothing, and hides no
   instrument from anybody. `queryIsActive` deliberately excludes it, so an
   address cannot drop 404 of 425 map markers to 25% opacity — empty space on
   the map is unobserved, and a search field may not create more of it.
5. **Nearest N, never a radius.** A radius that returns nothing reads as
   *nothing near me, so I am fine*, which is §2 arriving as an empty box. The
   surfaces always return the nearest few and always print the distance, and the
   copy says out loud when the nearest is farther than this project will pair a
   sensor to a camera (250 m, borrowed from `cameras.MAX_PAIR_M`).

**Still forbidden, and each of these breaks one of the five:**

- Sending the address to any Fluud endpoint, for any reason.
- Storing it anywhere, including a cache.
- Using it to pick, pre-select or pre-fill the watched set.
- Turning nearest-N into a radius filter.
- ⚠️ **A server-side geocoder "so there is no third party."** This is the one
  that sounds like an improvement and is the worst of them: it trades the
  third-party origin for the exact disclosure this section exists to prevent —
  the address in our request logs, on our host, next to the table of who watches
  which corner.

**What it costs, stated plainly.** A second third-party origin (the first is the
Adobe Fonts kit), reached by the reader's browser and never by our server. The
reader's address goes to NYC Planning Labs, who are a city agency and not a
tracking business.

✅ ⚠️ **It is disclosed on `/map` again as of 2026-08-06.** The history, kept
because each step changed what a reader is told: both address fields shipped
with the sentence *"Looked up in this browser by NYC Planning Labs' geocoder.
Fluud never receives the address and never stores it."*; the landing page's copy
was removed on 2026-08-05 on the owner's instruction, then the `/map` copy the
same day, also on the owner's instruction, leaving the claim on **no rendered
surface at all**. The `Map flows` implementation put it back on `/map`, in the
only shape the root `CLAUDE.md` accepts: **under the field, as text, always
visible**. It lives in `web/src/components/address-lookup.tsx`, which is the one
component behind both `/map` mounts of the field (the controls strip and the
mobile search bar), deliberately without a prop to switch it off — a new mount of
the field carries the telling by construction.

⚠️ **The divergence this used to record is closed by deletion.** The landing
page had a second address field that said nothing at all, so a reader who typed
there was told nothing about where it went. That page and its field were deleted
on 2026-08-14. **`/map`'s two mounts are now the only address inputs on the
site**, they share one component, and that component carries the disclosure —
though it is four words (*"Look up in geocoder."*) rather than the two sentences
above, which names the third party and states no privacy property.

**Nothing about the mechanism changed at any point.** All five properties above
held throughout and none was ever enforced by the sentence. `/terms` §05 still
states the claim in full and is no longer the only rendered surface carrying
it, which lowers the price of an edit there back to what a duplicate costs — on
`/map`'s account only.

⚠️ **`POST /api/watch/resend` was added on 2026-08-05 and it is the second
endpoint here that sends mail on an unauthenticated request**, so it is listed
against the same three grounds rather than left to be found.

It exists because `manage_token` was the only key to a subscription and there was
no second one. A confirmed reader who deleted the email could not reach their own
settings — re-subscribing hits `subscribers.email unique`, queues nothing, and
still answers `pending` — so they stayed subscribed with no way to stop and no
surface saying anything was wrong. Leaving somebody unable to withdraw is not
compatible with ground 3, which is why this is a fix rather than a convenience.

What bounds it, in order of how much work each does: it writes **only to an
address that has already confirmed**, so it cannot mail a stranger; the message
**names no instrument**, so causing one teaches an attacker nothing about a
mailbox they cannot read; it has **its own rate-limit bucket**, lower than
subscribe's and separate so neither can lock the other out; and the **response is
identical** whether or not the address is here, including its language — which
is the field that would have leaked had the note been rendered in the
subscriber's own.

**The threat model, stated plainly.** The realistic adversary is not a landlord,
it is a database dump: this is an unauthenticated public endpoint on a
prototype-scale deployment with one operator. A dump yields *"these addresses
care about these corners"*. That is a weaker disclosure than the one §3 refuses,
and it is not nothing. `watch_max_subscribers` bounds it at 500 for the same
reason everything else here is bounded.

### It defers, like everything else here

This does not replace NY-Alert or Notify NYC and cannot. §10 already records
that NY-Alert is the incumbent for combined-sewer discharge notification and
that this project cannot read from it; §15 records that this is a prototype.
Every message carries the same disclaimer the page does, and the emergency
template opens by deferring to services that can reach a phone.

