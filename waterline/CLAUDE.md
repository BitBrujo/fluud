# CLAUDE.md — the package

Module conventions for `waterline/`. The repo-wide rules are in the root
`CLAUDE.md`; read that first.

⚠️ **The package is `waterline`; the product is Fluud.** The split is
deliberate — the name reaches users, the identifier does not. This package,
every import, the `waterline-poll` thread and the `waterline/0.1` User-Agent all
keep the old string; `agent._TEMPLATES`' disclaimer (en and es), `api.py`'s
FastAPI title and its 503 body all say **Fluud**. The rule for a new
string: **if a reader sees it, it is Fluud; if a machine resolves it, it is
`waterline`.**

## Layers

Flat package, but it has a clear grain. Work with it.

| Layer | Modules | Rule | Checked by |
|---|---|---|---|
| **Ingest** | `floodnet.py` `feeds.py` `cameras.py` `gauges.py` | Talks to external APIs. Fails soft, logs loud. Returns models, never raw dicts | `check_ingest.py` (`feeds.py` ⚠️ **not**) |
| **Decision** | `watch.py` `agent.py` `notify.py` `peaks.py` · ⚠️ `escalation.py` DORMANT | The safety-critical core. Pure functions, no I/O, fully testable | `check_watch.py` · `check_escalation.py` · `check_notify.py` · ⚠️ **`peaks.py` has none**; its constants are held by `web/tests/parity.test.ts` |
| **Output** | `mail.py` · ⚠️ `rat.py` DORMANT | The one module that pushes to a person | `check_mail.py` · `check_rat.py` |
| **Gate** | ⚠️ `auth.py` | Verifies a Neon Auth JWT against JWKS. The only thing standing between an unauthenticated caller and a reading | ⚠️ **nothing** — it needs a network and a real token |
| **Infra** | `config.py` `models.py` `db.py` · `nta.py` GENERATED | Settings from env, models at every boundary, DML only. `nta.py` is a committed constant table — `python3 scripts/nta.py > waterline/nta.py`, by hand, never in the build | `check_models.py` (`db.py` and `nta.py` ⚠️ **not**) |
| **Entrypoints** | `poll.py` `api.py` | Orchestration only — no business logic | ⚠️ **nothing** — see below |
| **Presentation** | `web/` (build output) | Not source. See `../web/CLAUDE.md` | `cd web && npm test` |

⚠️ **There was an Inference layer — `vision.py` — and it is deleted**, with the
Roboflow settings, `pillow`, `numpy`, `cameras.fetch_frame` and the
`calibration` table. Nothing here fetches a frame. A camera contributes no
judgement of any kind, and `check_escalation.py` asserts `Observation` has no
field one could arrive through.

⚠️ **`escalation.py` and `rat.py` are DORMANT — no caller.** The on-page alert
system was unwired: no `alerts` table, no `/api/events`, no `/api/speak`, no
`/api/rat/drill`. Both files stay and both check scripts keep running, so
putting the warning back on the page is a re-wire rather than a rebuild.
**`watch.py` is the live state machine** and it must never import
`escalation.py`.

`watch.py`, `agent.py`, `escalation.py` and `notify.py` are pure by design.
That is what lets the whole safety contract be tested in a few asserts with no
database and no network. **Keep them pure.** If you need a feed value there,
pass it in on the `Observation` or the `SensorReadingFacts`.

⚠️ **The fourth column is the honest one and it has FOUR holes now.** `db.py`,
`auth.py` and both entrypoints have no script on them, and the holes are where
the cheap idiom stops working: `db.py` is DML and covering it would mean
asserting that SQL is SQL; `poll.py` and `api.py` need a database and a running
process; and `auth.py` needs a network and a token signed by somebody else.

⚠️ **`auth.py` is the worst of those four to have uncovered**, because it is the
only one where a bug is a *security* bug rather than a wrong number. What stands
in for a check script is `poll probe`'s `auth` line, which fetches the real key
set, and a hand pass against four bad credentials — malformed, wrong scheme,
empty, and an `alg: none` forgery — recorded in `MEASUREMENTS.md`. **Re-run that
pass by hand after touching this module.** `./scripts/check` will stay green
through anything you do to it.

**Do not read a covered row as "safe to change freely".** The scripts assert the
contract each module was written to hold; they do not assert that the module is
correct, and `poll probe` against the live feeds is still the check that catches
an upstream schema moving.

⚠️ **The "no database" claim is about assertions, not imports.** `mail.py`
imports `db`, which imports `psycopg`, so `check_mail.py` needs that dependency
**installed** even though it opens no connection. `scripts/check` prefers
`.venv/bin/python` for exactly this.

## ⚠️ `feeds.py`'s NWS section is ONE fetch and TWO derivations

Since 2026-08-15 the gauges panel renders every active NWS product for the five
boroughs, and `nws_active` is still a second witness. Both read one HTTP
response and nothing joins them again:

```
fetch_nws_alerts_all() -> NwsRead(alerts, reachable, detail)
   ├─ is_witness_alert()  -> nws_active: bool -> Observation -> watch/escalation
   └─ nws_reads (Postgres) -> api._nws_status() -> /api/status -> nws-alerts.tsx
```

- **`is_witness_alert` is the whole of the credibility side** and is `"flood" or
  "rain" in the event name — unchanged since first contact. ⚠️ **It already
  matches `Freezing Rain Advisory`, which is wider than the rule's name
  suggests.** That is pre-existing and deliberately left alone: tightening it
  *moves the second witness*, which is a change to what this app is willing to
  believe about a faulted sensor. `check_watch.py` pins it, that case included.
- **`fetch_nws_alerts()` is unchanged in meaning** — it is the `all` call
  filtered by the predicate. `poll.probe` and `poll.validate` both still mean
  that narrower set.
- ⚠️ **`NwsRead` carries `reachable` because `except: return []` threw it
  away.** *We asked and NWS said nothing* and *we could not ask* are opposite
  claims arriving as identical bytes.
- ⚠️ **`in_nyc` is DISPLAY SCOPE ONLY and the request stays `area=NY`.** See the
  root `CLAUDE.md`'s Never bullet. An alert with no recognisable geocode answers
  False, so it lands in the counted "elsewhere" tail rather than being claimed as
  local — the safe direction for a scope claim.

⚠️ **`nws_reads` has three COLUMNS because there are three states.**
`attempted_at` moves on every try; `checked_at` and `alerts` move only on a
successful one. So a dead feed can never silently empty the list — the last thing
NWS actually said stays on screen, ageing, under a line saying the feed could not
be read. `db.record_nws_read` enforces that in SQL with a `coalesce` and a
`case`, on `record_poll_tick`'s rule that the database decides what survives.
`_record_nws` is wrapped so a display failure cannot take down a tick that writes
readings.

⚠️ **It was three module globals on `poll` until 2026-08-20, and that was the
`LAST_COVERAGE` defect for the third time.** They were only ever populated in a
process running the loop, so when the poller moved to a scheduled container the
panel would have claimed forever that NWS had never been read, on a perfectly
healthy deployment. `poll.py` carries the tombstone. **One row per mode, written
by whichever process polls and read by whichever process serves** — the same fix
`poll_ticks` was, and the reason `api._nws_status` no longer reaches into `poll`
at all.

⚠️ **`alerts` is the only `jsonb` in the schema and the exception is argued.**
Nothing joins, filters or orders on it — it is read back whole and handed to
`WeatherAlert`, which is `Lenient` precisely so a field NWS adds survives. A
column-per-field table would discard exactly what that model exists to keep.

### ⚠️ Two deployment shapes, and the SHIPPED one is now the scheduled run

Since 2026-08-20 production runs `python -m waterline.poll window` as a Railway
cron service on `*/15`, and the API container serves requests with
`POLL_IN_SERVICE=false`. **The reason is money, and it is worth stating plainly:**
Neon bills for the compute being awake, and anything touching Postgres every
sixty seconds means autosuspend can never fire. Measured before the change, the
database was awake **86.8% of wall-clock time** — `active_time` 394,556s of
~454,600s — at roughly 305 compute-hours a month.

`poll.run_window` ticks once and then keeps ticking **only while `_storm` says
something is happening** — three borrowed witnesses, OR'd: NWS's own alert,
FloodNet's own `flood_detected`, NOAA's own harbor stage. Quiet runs last about
ten seconds and exit, so between them there is no process at all. The saving
comes entirely out of quiet weather; a flood still gets a 60-second tick.

⚠️ **`POLL_WINDOW_S` and the cron expression are one fact written twice.** A
window longer than the schedule does not stack — Railway skips a run while the
previous one lives — it silently becomes the cadence.

⚠️ **A cadence change is not local to this repo's Python.** Every threshold in
`web/src/lib/staleness.ts` is a multiple of one of the two cadences, and at the
wrong values the page declares a healthy poller frozen. Both are exported by
`scripts/parity_constants.py` and asserted by `web/tests/parity.test.ts`, and
`/api/healthz` reports them so the UI can size against what is actually
deployed rather than what it was built with. They live in `waterline/cadence.py`,
a leaf module, so that script can read them without importing `fastapi`.

`api.py` still starts `poll.run()` on a daemon thread when `POLL_IN_SERVICE=true`
— the local-development shape, and the one every note below is about.
Consequences:

- **It runs off the main thread.** No signal handlers, no `input()`, nothing
  that assumes it owns the process.
- **It shares memory with request handlers.** New module-level mutable state is
  genuinely shared; treat it accordingly.
- **`poll.run()` must never return.** It catches per-tick exceptions itself; if
  it ever exits, the service keeps serving stale data with no error.
- **It stamps `poll.LAST_TICK_AT` every iteration**, including after a tick that
  raised — the question that field answers is "is the loop running", not "did
  the last tick succeed". It is how `/api/healthz` can see a loop the host has
  stopped scheduling, because `is_alive()` is true for that thread.
- ⚠️ **It also writes `poll_ticks` every iteration, and THAT one survives the
  split.** `db.record_poll_tick` / `db.poll_health` put liveness in Postgres, so
  a deployment running the poller in its own container gets a truthful
  `/api/healthz` — which the global above can never give, being `None` in an
  API-only process forever. Read the `LAST_COVERAGE` tombstone in `poll.py`: this
  is that instruction applied a second time, to a second global with the same
  defect. **The two are not redundant** — `LAST_TICK_AT` is the fallback for a
  database where the table has not been created yet.
- ⚠️ **`last_store_at` is the field neither global could ever have carried.**
  `tick_at` keeps moving through a failed write, an empty registry and an unset
  `WATCH_CAMERAS` alike, so *the loop is running* and *the loop is collecting*
  were one answer until 2026-08-15. `_sensor_snapshot` returns a `_Snapshot`
  naming which of its four exits it took, and `record_sensor_readings` returns
  rows **inserted** rather than rows offered.

## Models at every boundary

Everything crossing a boundary is a Pydantic model in `models.py`, never a bare
dict.

- **`Strict`** (`extra="forbid"`, frozen) for records we author — `Observation`,
  `Pair`.
- **`Lenient`** (`extra="allow"`) for anything arriving from an API we don't
  control — FloodNet, Socrata, DOT, NWS, NOAA, USGS. Those schemas change
  without warning and a hard validation failure at 9pm is not a trade worth
  making.
- **`Wire`** (`extra="forbid"`, not frozen) for what `api.py` puts on the wire.
  One model per route body.

Direction is the whole distinction: `Lenient` is for bytes coming *in* from
someone else, `Wire` is for bytes going *out* to our own browser, `Strict` is
for records that never leave the process.

**Do not collapse `Wire` models into the domain records they resemble.**
`Observation` is what the poller writes; `CameraStatus` is what a browser is
told. If they were one type, a change made for the UI would silently alter what
the decision layer sees.

Three things about the contract models that are easy to undo by accident:

- **`Wire` sets `extra="forbid"`.** FastAPI's default is to silently *drop*
  undeclared keys, so a handler that grows a field nobody added to the model
  returns it to no one and looks fine server-side.
- **DB timestamps are `AwareDatetime`, not `datetime`.** Pydantic accepts a
  naive datetime into a plain `datetime` field, and a naive timestamp on the
  wire is parsed in the *viewer's* zone — which in NYC shifts every age by four
  or five hours and renders a five-hour-old reading as current.
- **`SpeakEvent.at` / `MoodEvent.at` are `str`, and must stay `str`.** Typing
  `at` as a datetime makes pydantic re-serialise it to `…Z` while the dormant
  SSE path would keep emitting `…+00:00`, which defeats `warning-feed.ts`'s
  dedupe on that field.

## Error handling: fail soft, log loud

Ingest catches broadly so one dead feed can't stop the poll. **But it must say
what it dropped.**

```python
except Exception as e:  # noqa: BLE001
    dropped += 1
    log.warning("row rejected (%s): %s", type(e).__name__, e)
```

This convention exists because of a real bug. `except (TypeError, ValueError):
continue` silently ate **all 479 FloodNet sensors** — Socrata's `location`
column is a GeoJSON dict, not a name string, and pydantic's `ValidationError`
subclasses `ValueError`. The probe reported "OK, 0 sensors" and looked fine.

### ⚠️ A silent DEFAULT is the same bug wearing better clothes

`floodnet._first_num` returned **`0`** when every depth column on a row was
null. That is not a dropped row — it is worse. A dropped row is absent and the
count says so; a fabricated zero is *present, confident, and wrong*: a sensor
asserting the street is dry when what it published was nothing at all.

**Measured: 8–9 of ~399 returned rows have no depth column at all**, so it fires
on every poll. It returns `float | None` now and the caller counts and logs the
drop.

The general form: **in a parse loop, a default value and a bare `continue` are
the same failure.** Both replace "we do not know" with something that looks like
an answer. Return `None`, count it, log it.

## FloodNet: three identifiers, and confusing them returns nothing

| Field | Example | Joins |
|---|---|---|
| `deployment_id` | `curly_orange_shrimp` | `depth_data` — this is `Sensor.sensor_id` |
| `slug` | `M-avenue-c-e-20th-st-2zpcro` | the Socrata mirror's `sensor_id` column |
| `dev_id` | — | the physical LoRaWAN device |

`Sensor.sensor_id` holds the **deployment_id** and `Sensor.slug` holds the slug,
which the Socrata mirror confusingly also calls `sensor_id`. Blame upstream.

The API is public Hasura at `https://api.floodnet.nyc/v1/graphql` — no auth,
introspection on. Explore it before guessing field names.

### "alert-enabled" is THREE different counts, and only one gates anything

A single `poll probe` logs **401 alert-enabled** from `floodnet.py` and
**343 alert-enabled** from `poll.py`, seconds apart. Neither line is wrong —
they count different predicates:

| Source | Predicate | Today |
|---|---|---|
| `floodnet.fetch_sensors` log | `alert_visible` | 401 |
| `poll.probe` log | `should_alert()` — visible **and** healthy | 343 |
| `/api/sensors` `watched_camera_id` | paired to a camera in `WATCH_CAMERAS` | **21** |

⚠️ **`alert_permitted` (343) is the one that gates anything.** It is what the
email watch admits, and `watch.py` has no camera in it at all — so a sensor
with no pairing is **not inert**: it is polled, its readings are stored, and it
can mail somebody.

⚠️ **`watched_camera_id` gates nothing.** It names the camera whose view that
sensor's depth labels. It gated the on-page warning until that path was
unwired, and **claims built on it have been wrong twice** — first "display
only" of the 325 deployments this app will mail about, then "warns on this
page" after the unwiring. A claim about either field has to name its path.

⚠️ **21, not 27.** `WATCH_CAMERAS` holds 27 cameras, but four sensors serve
more than one of them — one serves four — so the distinct sensor count is
lower. This is why `db.sensor_status` joins `pairs` through a `lateral … limit
1`: a plain join multiplies those four sensors into duplicate rows. Derive the
number from the payload; never hard-code it.

⚠️ **The `sensors` table stores only the first one.** There is no
`should_alert` column, so `select count(*) from sensors where alert_visible`
answers 401. If you need the gating count from SQL you have to filter on
`status` too — and don't: `floodnet.alert_permitted` was extracted so
`/api/sensors` computes it in Python over rows it already holds. **A hand-copied
`status in (...)` in a `where` clause is a second authority for a life-safety
predicate that must have one.**

## Three data traps. The first two bite on contact; the third only at scale

**Clock skew.** Some devices report timestamps decades ahead. A naive
`order_by: {time: desc}` returns readings dated **2080** and no live data at
all. Every depth query is bounded on both sides — see `MAX_FUTURE` / `MAX_AGE`.

⚠️ **This trap bit a SECOND function and went unnoticed for that function's
whole life.** `fetch_flood_events` sorted `start_time desc` with no bound, so
all ten newest annotated events came back dated 2080 and no real storm was
reachable at any `limit`. Two things generalise. **A guard applied at one call
site is not a guard**: `fetch_depths` had carried this bound since first
contact and the function next door still shipped without it, so the rule lives
in `_in_clock_window` now, which `check_ingest.py` asserts with no network. And
⚠️ **`flood_events.start_time` is `timestamp`, not `timestamptz`** — the one
time column on this API with no offset. Declaring `timestamptz!` is a hard
Hasura error, which is the good outcome; the bad one is reading the naive
values as local and shifting every bound by four hours.

`floodnet.skewed_deployments` counts the cost, for diagnostics only — 29
deployments had nothing inside the window because their newest row was 2080.
They arrive as silent, and silence is indistinguishable from quiet without
asking. **Nothing on the alerting path may call it**: what it returns is a list
of readings we have already decided not to trust.

**Phantom floods.** On a clear day with no NWS alert in the state, four sensors
reported 666–1452 mm — up to 4.8 feet of water. All faulted rangefinders, all
with FloodNet's own `flood_detected` set false. A bare `depth >= 10mm` rule
fires four EMERGENCY alerts in that weather.

Hence `IMPLAUSIBLE_MM` and the credibility gate: below the ceiling trust the
sensor, above it demand an independent second witness. **Do not remove this
gate.** Crying wolf is how the next real warning gets ignored.

⚠️ **That gate had a ceiling and no floor**, so a sensor reporting a large
*negative* depth was called believable — including the −466 mm `MEASUREMENTS.md`
names as the worse of the two faults visible on screen. `IMPLAUSIBLE_MIN_MM`
closes it, and the derivation is measurement rather than choice: `depth_filt_mm`
is never negative (0 of 388 rows), but `_first_num` falls back to
`depth_raw_mm`, an uncorrected range that is negative on 96% of rows and sits
near −20 mm. The floor clears raw's normal excursion (worst legitimate −116)
without admitting the faults (nearest −261). **Widening the band can only reject
more readings, never admit one** — `check_escalation.py` asserts that.

**A row `limit` on a multi-deployment depth query is silently lossy, and how
lossy depends on how many sensors you ask about.** This is the dangerous one,
because it looks exactly like silence. `limit: 2000` with a client-side dedupe
spans ~12 h at 27 deployments and **under 5 minutes at 425**; a healthy sensor
publishing just outside that window arrives as not-reporting. `fetch_depths`
uses `distinct_on: [deployment_id]`, so the result size is the number of sensors
rather than a guess at how many rows that takes. Measured: **one request returns
390–399 of 425.**

⚠️ `poll.tick` reuses that one snapshot for the watched cameras as well as the
display list, and it may **only** because `distinct_on` makes it complete per
deployment. `floodnet.DEPTHS_COMPLETE_PER_DEPLOYMENT` is the guard: set it False
in the same commit as any fallback to chunking or any reintroduced `limit`.

## `sensor_readings` is the biggest thing in the database

Every deployment's own depth, every tick — not just the ≤27 paired to a watched
camera. `observations` answers *what is at this camera*; this answers *what is
this instrument reporting*, and the city has 425 of them.

⚠️ **The poller's heartbeat is deliberately NOT in this table.** `poll_ticks` is
one upserted row per mode, and the three reasons are at the DDL: `observed_at`
here is **FloodNet's** publication clock rather than ours; `on conflict do
nothing` makes a tick that stored zero and a tick that stored 390 leave
`max(observed_at)` identical whenever upstream is frozen; and a per-mode maximum
would need a `(mode, observed_at desc)` index, which is permanent write
amplification on 560k inserts a day, on the ingest path.

Shaped deliberately like `gauge_readings`: append-only, Postgres as the single
source of truth, **no second in-process cache**.

⚠️ **`depth_mm` is `not null`, and that is the honesty rule in DDL form: no row
means no reading.** A sensor that has never reported, or has stopped, is an
*absent row* — never a row with a null in it and never a row with a zero in it.
That column shape is what makes `_first_num`'s old fabricated zero unstorable.

**Arithmetic:** ~390 reporting deployments × 1440 ticks ≈ **560k rows a day**,
against `observations`' 39k. `db.prune_sensor_readings` runs on its own hourly
clock inside `_sensor_snapshot` — hourly rather than per tick because a delete
that finds nothing is still a scan, sixty times an hour. ⚠️ **7 days is a
proposal; the 560k/day is the fact.**

## Camera pairing: gold vs silver

`GOLD_PAIR_M = 100` is what `WATCH_CAMERAS` was selected on: at 8–100 m the DOT
camera and the FloodNet sensor are demonstrably at the same intersection
(compare "South St @ Broad St" to "M - Broad St/South St", 8 m apart).
`MAX_PAIR_M = 250` is what may be operated on — a silver pair is the same
block rather than the same puddle.

⚠️ **`GOLD_PAIR_M` had a second job and lost it.** It gated what could become a
training label for the water-segmentation model. That model is deleted; the
constant is unchanged and is still pinned by `check_ingest.py`, printed by
`parity_constants.py` and asserted in `parity.test.ts`.

⚠️ **It gained a THIRD job on 2026-08-16 and that one reaches a reader.**
`cameras.pair_tier(distance_m)` classifies a stored pairing as `paired` /
`near` / `unpaired` — both bounds **inclusive**, matching `pair_cameras`' own
`best[0] <= max_m` — and `/api/cameras` puts every registry row through it. It
lives beside the two constants so the classification cannot drift from the
numbers it is a classification of, and `check_ingest.py` pins both boundaries
and the unreachable-today branch past `MAX_PAIR_M`, which returns `unpaired`
because **withholding a depth is the safe direction for a stale row**.

⚠️ **The reader's three words are `paired`, `near` and `not paired`, and
*gold*, *golden* and *silver* may never reach one.** They stay the internal
names — here, in `GOLD_PAIR_M` / `MAX_PAIR_M`, and in code comments. The wire
value is `unpaired`; `not paired` is `web/src/lib/camera-filter.ts`'s label.
Both halves are asserted rather than promised: `check_ingest.py` on the values
this module returns, `web/tests/camera-filter.test.ts` case-insensitively over
every string a reader can meet.

⚠️ **`distance_m` never leaves the server.** `db.camera_registry` selects it raw
and `api.camera_registry` classifies it; `models.CameraEntry` declares no such
field and `check_models.py` asserts the absence. That is `alert_permitted`'s
shape — one authority, in Python, over a row already in hand — and the reason is
the *never colour a distance* Never bullet, which binds any monotone ramp over
distance and not only hue.

⚠️ **`cameras.borough` is DOT's `area` verbatim and is NOT normalised against
`sensors.borough`.** Two agencies, two vocabularies; rewriting one to match the
other would be inventing a value and attributing it upstream. If they ever
disagree, record it. ⚠️ **Only `bootstrap` fills that column** — `poll.tick`
never touches the `cameras` table — so a database that has not been
re-bootstrapped since it landed has a null on **every** row, and null means *not
asked* rather than *outside the city*.

⚠️ **`upsert_cameras` NEVER DELETES, so a null borough has a second cause.** It
is `on conflict do update`, which means a camera DOT retires keeps its row
forever, keeps whatever it was last upserted with, and never gets a borough.
**Measured in production 2026-08-16, on the first bootstrap that filled the
column: 973 fetched, 974 stored, exactly one null** —
`Henry Hudson @ 137 St`, gone from the feed. Two things follow and neither is
fixed: the map draws a camera DOT no longer operates, whose still will not load;
and *"the registry has not been re-bootstrapped"* is only one of the two reasons
a `borough` is null. **The UI tells them apart by COUNT** — its refusal fires on
*not one camera carries a borough*, never on a single row — which is why one
orphan among 974 says nothing and 974 nulls says the database was never
bootstrapped. **A per-row check would report the second message for the first
fact.**

Prefer `floodnet.sensors_near()` over the local haversine — FloodNet owns the
sensor geometry. `haversine_m` stays for offline work and for scoring pairs we
already hold.

## Adding a feed

1. Model it in `models.py` as `Lenient`.
2. Fetch in the right ingest module. Fail soft, log loud, count drops.
3. Add it to `poll.probe` so it's visible before a demo.
4. If it can influence a decision, thread it onto `SensorReadingFacts` — never
   reach for it inside `watch.py`.
5. Write down where its numbers come from in `LIMITATIONS.md`.

`gauges.py` is the worked example and it adds three lessons:

- **Check the datum before the value.** NOAA publishes the Battery's flood
  thresholds in feet above *station datum* and serves water level in whatever
  datum you ask for. We ask for MLLW, which sits 3.29 ft higher, so the
  published `nos_minor: 10.19` is `6.90` in the units we hold. Getting this
  wrong is not a visible bug — it is a threshold that never fires. Derive it
  twice, from different directions, and write both derivations down.
- **Fetch on the feed's clock, not the loop's.** CO-OPS publishes every ~6
  minutes and USGS every ~15, so gauges refresh every 5 minutes. The readings go
  to Postgres and both `tick` and `/api/status` read them back from there.
- **Sampling interval is not publication lag.** The USGS sites sample every 15
  minutes with no gaps, and their newest published point is 21–81 minutes old.
  Staleness has to be judged against the second number.

⚠️ **A feed may be worth adding even when the part you wanted does not exist.**
Real-time combined sewer overflow is the most on-thesis signal available and
there is no public machine-readable feed for it. What shipped is the outfall
*geometry*, clearly labelled as not being discharge activity — LIMITATIONS §10.

## `waterline/web/` is build output

The Next.js static export, gitignored. **Never edit it and never commit it.**
Source lives in `web/src`.

`api.py` mounts it at `/` with `StaticFiles(html=True)`, guarded by `is_dir()`
because `StaticFiles` raises at *import* time on a missing directory — which in
a fresh clone would stop the API starting at all and take the poll loop with it.

**That mount must stay the last thing registered.** Starlette matches routes in
registration order, so anything added below it is unreachable: the mount
swallows the path and answers with `404.html`. Two consequences we accept:
`/api/typo` returns the 404 page rather than `{"detail": …}`, and every new
route goes above the mount.

⚠️ **A GET to a POST-only route returns the 404 PAGE, not a 405**, so the
obvious route-order test does not work. Starlette treats a method mismatch as a
partial match and keeps looking, and `Mount("/")` is a full match for every
path. The proof that a route is above the mount is a `200` with a JSON body
from calling it with its real method.

## `auth.py` is the lock, and the middleware is default-closed

`api._session_gate` refuses `/api/*` without a verified Neon Auth JWT when
`REQUIRE_AUTH` is on. It is a **middleware with a list of exemptions**, not a
dependency on each route, and the direction is the whole point: **a route added
to `api.py` is gated by default.** Decorating routes individually leaves a new
one open by omission and nothing anywhere says so.

⚠️ **`_AUTH_EXEMPT` has FIVE entries as of 2026-08-16 and each one earns it.**
Both `healthz` paths, because a 401 there makes a healthy service look dead to
the post-deploy `curl`. And `/api/watch/confirm`, `/api/watch/subscription` and
`/api/watch/unsubscribe`, because those are reached **from a link in an email**
by somebody who may have no Google account at all — they already carry a
single-purpose bearer token in the URL, which is a stronger claim about that one
mailbox than a session is. **An unsubscribe link that demands a sign-in is
indefensible.**

⚠️ **`subscription` is the newest and it closes a hole the other two could not
see.** The confirm and unsubscribe exemptions were **unreachable in practice for
the whole life of the gate**: both links pointed at `/map/?…`, `/map` is wrapped
in `RequireSession`, and a signed-out subscriber was redirected before the
component that reads the token ever mounted. The links point at `/watch/` now,
which has no gate — and the manage face that page renders has to be able to
*load*, which is this route. **Exempting the two mutations while gating the
surface between them was an exemption in name only.**

⚠️ **The gate is METHOD-BLIND.** `_session_gate` matches
`request.url.path.rstrip("/")` and nothing else, so one entry opens GET, PUT and
whatever verb is registered on that path next. PUT is acceptable *a fortiori*:
`watch_update` starts with `db.subscriber_by_manage_token` or a 404 so it touches
one row, it cannot create an address, and `camera_ids` / the cap /
`_permitted_sensor_ids` / `_validated_settings` all still refuse. **And
`unsubscribe` is already exempt and hard-deletes that same row with a cascade** —
if the destructive operation is defensible on a mailed token, editing it is
strictly less.

⚠️ **`/api/watch/resend` is NOT exempt and that refusal is the point.** It is the
only route in this app a stranger can cause mail to be sent from, which is why it
has its own bucket and `CONFIRM_RESENDS_MAX`. `/watch/` does not call it. **The
honest cost: a reader whose token is gone gets a 404 with no recovery door**,
because both doors live in the wizard on `/map`, behind the gate. LIMITATIONS §16
records it.

⚠️ **The gate KEEPS what it verified as of 2026-08-16, and TWO routes read it.**
`_session_gate` stashes the `Session` on `request.state` and
`api._verified_session` reads it back; `api.watch_subscribe` and — since
2026-08-17 — `api.watch_mine` are the callers.
**That is not the per-route dependency this section refuses.** That rule is about
*who decides admission*, and admission is unchanged — one middleware, still
default-closed, still method-blind, still impossible to forget. This is a read of
a decision already taken, and a `Depends(auth.require_session)` on a handler is
still forbidden even though it would look similar in a diff.

⚠️ **`None` from `_verified_session` has three causes and every one means *no
shortcut*** — `REQUIRE_AUTH` off, an exempt path, or the gate not having run.
Collapsing them is the safe direction by construction: with the gate off this API
is open to anybody, so a `session.email` nobody had to prove must unlock nothing.
**Getting that backwards is a self-confirming subscribe on an unauthenticated
deployment**, which is why the `REQUIRE_AUTH=false` case is the single most
important thing to test after touching this.

Four rules, and the first two are the ones worth refusing a refactor over:

- ⚠️ **Never let it fail open.** `auth.verify` refuses when it cannot reach the
  JWKS. The temptation arrives exactly when Neon is down and the map is dark,
  and an auth check that admits requests it could not verify is not an auth
  check. **The lever is `REQUIRE_AUTH=false`, never a fallback in the verifier.**
- ⚠️ **Never decode with `verify_signature=False` to "just read the email".** An
  unverified JWT is a string the client wrote.
- **Raise inside the middleware, answer with a `JSONResponse`.** An
  `HTTPException` thrown there does **not** reach FastAPI's handlers — Starlette
  has already left the routing layer — so it would surface as a 500 with a
  traceback. This was found by expiring a token.
- ⚠️ **`iss` is unchecked by default and `NEON_AUTH_ISSUER` turns it on.** The
  plausible guess is that it equals `NEON_AUTH_URL`; it was never confirmed
  against a token this project issued, and a wrong value rejects **every**
  session — an outage presenting as *"sign-in works, then 401"*. The signature is
  already bound to this project's own key set, so this is defence in depth. Set
  it from a real token, not from a guess.

⚠️ **Two variables hold one value and nothing checks they agree.**
`NEON_AUTH_URL` is runtime env here. The browser's copy is
`NEXT_PUBLIC_NEON_AUTH_URL`, **baked into the bundle at build time** — so a
container built without it can never sign anybody in and a restart changes
nothing. `/api/healthz` carries `auth_required` so a post-deploy `curl` can catch
the mismatch, which is the only thing that can.

### ⚠️ The UI calls a third party the server must never see

The browser geocodes a typed address against **NYC Planning Labs GeoSearch** in
order to sort the deployments by distance from it. That is entirely in
`web/src/lib/geosearch.ts` and there is **nothing here to receive it** — no
route, no model, no column, no env var, no log line. Recorded in this file
because the temptation arrives from *this* side: a `/api/geocode` proxy looks
like the tidy version of a cross-origin fetch, and it is the one thing
LIMITATIONS §16 forbids outright.

- **Never add a geocoding endpoint, a proxy, or a passthrough.** "So there is no
  third party" trades the third-party origin for the address in *our* request
  logs, next to the table of who watches which corner.
- **Never accept an address, a ZIP, a coordinate or a place string on any
  route** — including as an optional field on a watch subscribe, and including
  "just for analytics".
- **The regression check is `git diff --stat -- waterline/`** for anything
  claiming to be about the address search. If it touches *code* in this
  package, read it twice.

`cameras.haversine_m` is duplicated in `web/src/lib/geo/distance.ts` and that is
**not** a second-authority violation. The single-authority rule is about
`alert_permitted` — a *judgement*, where two implementations disagreeing tells a
reader something false. A haversine is arithmetic with one right answer, and
`web/tests/parity.test.ts` recomputes both over three pinned coordinate pairs
and requires agreement to within a millimetre. **The duplication is allowed
because it is checked.**

### What the UI actually consumes

Every route that returns a body declares a `response_model=`, and the models
live in `models.py` under **"the HTTP contract"**. `web/src/lib/api-types.ts` is
hand-written and can be checked against `/openapi.json` rather than trusted.

| Route | Used by |
|---|---|
| `/api/status` | ⚠️ **`/map` ONLY, every 60s** — 15s until 2026-08-20, when the poller went to a schedule and four requests a minute reaching past the server's read memo held the database open by themselves. 60s is the fastest the rows can change, since that is the storm tick. All four routes polled it until the sign-in landed; `/`, `/about`, `/terms` and every `/auth` view stopped, because with the gate on that request is a guaranteed 401 on pages read by somebody with no session — rendered by `lib/messages.ts` as *cannot reach the service* to a reader who is simply signed out. They pass `mode={null}` and the badge says `UNKNOWN` |
| `/api/healthz` (and `/healthz`) | the notices strip; polled every 30s. ⚠️ **TWO paths** — some hosts reserve the bare one at their edge. Also carries `mail_delivers` and `auth_required`, both **capability, never a verdict**. ⚠️ **The only `/api/*` pair EXEMPT from the session gate**, so a post-deploy `curl` still works signed out |
| `/api/history/{camera_id}` | the selected-camera sparkline, every 60s |
| `/api/depth-peak/{kind}/{id}` | the detail panel's depth readout when a timeframe is picked. ⚠️ Its 404 is the OPPOSITE of `/api/history`'s |
| `/api/depth-peaks/{kind}` | the same aggregate for EVERY instrument of one kind, backing the list's depths. ⚠️ It has **no 404 branch** |
| `/api/gauge-history` | the harbor baseline's five sparklines, every 60s |
| `/api/sensors` | the sensor list and the map's sensor layer — **gated**, every 60s only while one is on |
| `/api/cameras` | ⚠️ **the map's CAMERA LAYER beyond the 27, since 2026-08-16.** The whole 968-row registry with each camera's tier and its paired sensor's newest reading — **gated**, every 60s, and **no request at all** until a reader touches the camera filter. ⚠️ **A different SET from `/api/status`'s camera list, not a superset by contract**: that one comes from `observations`, which the poller writes only for `WATCH_CAMERAS`. ⚠️ **No query parameters** — the browser filters, because the browser is the only thing that can say *"838 of 968 are not drawn"* |
| `/api/languages` | **nothing** |
| `/api/watch/*` | **TWO callers since 2026-08-16.** `watch-panel.tsx` on `/map` — subscribe · resend · ⚠️ **mine**, all three **gated**. `watch/page.tsx` + `watch-manage.tsx` on `/watch/` — confirm · subscription (GET/PUT) · unsubscribe, all four **exempt**, because that page is what an email link opens. ⚠️ **`subscribe` and `mine` are the two routes that READ the session** rather than merely being admitted by it — see the abuse-controls section |

⚠️ **`/api/sensors` is deliberately not folded into `/api/status`, and the gate
is not an optimisation.** `/api/status` is polled by every open tab.
`/api/sensors` is **150 KB uncompressed** for a surface most readers never open
— merging them would put that on every tab every minute, on a phone, during a
flood.

⚠️ **All three big reads are MEMOISED for `_READ_TTL_S` (30s), and that is
load-bearing rather than tidy.** `/api/status`, `/api/sensors` and
`/api/cameras` are identical for every visitor and change only when the poller
writes, so without the memo the database's cost is a function of how many tabs
are open rather than of time — and since the poller went to a schedule
specifically so Neon could suspend, a handful of readers would hold it awake and
undo the whole change. Measured: 15 requests across the three routes went from
25 connections to 5. ⚠️ **The TTL must stay strictly BELOW `POLL_SECONDS`** — the
cache may never be the reason a rising depth is late during a storm. And nothing
polls at all while a tab is hidden; see `web/src/lib/hooks/visible-interval.ts`.

⚠️ **`/api/gauge-history` deliberately does not 404, and `/api/history` does.**
`/api/history/{camera_id}` answers about **one named instrument**, so "nothing
recorded" is a real answer and the UI renders nothing. `/api/gauge-history` is a
**batch**: an empty `series` means the poller has not stored a reading in the
window, and each card still has its level, threshold and age from
`/api/status`. A 404 there would blank five sparklines under five good numbers.

⚠️ **`/api/depth-peak`'s 404 means the INSTRUMENT is unknown, never that the
window was empty.** An empty window is a 200 carrying `peak_mm: null` and
`readings: 0`, because it is a real answer about a real instrument. That is why
both queries in `db.py` select from `cameras` / `sensors` and hang the aggregate
off a `left join lateral`: an aggregate query alone cannot tell a typo'd id from
a quiet hour, and would report the first as the second.

⚠️ **The BULK sibling has no 404 at all**, and that is the same argument
arriving at the opposite answer: a caller is iterating a list it already holds,
so an id **missing from `peaks` IS the empty window**. It also drops `peak_at`
and `newest_at` — `array_agg(… order by …)` per group would sort every row in
the window across every instrument, and no list row renders either figure.

⚠️ **What is IDENTICAL across all four and may not diverge**: the peak is over
`plausible` readings only, and the faulted rows are **counted** rather than
merely excluded. A caller handed a peak without its two counts cannot tell
*nobody looked* from *the instrument is broken and reporting constantly*, and
those render as the same em-dash. Measured: **401 groups in 25.6 ms** at the
seven-day ceiling, over 442k rows.

⚠️ **An out-of-range window is CLAMPED, not refused.** `peaks.clamp_minutes`
brings it inside retention and the response echoes the window actually used. The
honest answer to *"show me the last year"* is the seven days that exist, **said
out loud**.

### ⚠️ `/api/status` carries TWO number blocks and they are not one

`thresholds` and `ingest`, split on 2026-08-15. `Thresholds` is **borrowed** —
10 mm is FloodNet's flood-event definition, 150 mm is NYC curb height — and it
comes off `settings`, so it is configurable. `IngestBounds` is **this repo's own
judgement about when an instrument is lying**: `IMPLAUSIBLE_MIN_MM`,
`IMPLAUSIBLE_MM` and `MAX_AGE`, read straight off `floodnet.py` where each
derivation is written at the constant.

⚠️ **Read off `floodnet`, never off `settings`, and that is the point of the
split.** Putting a plausibility bound in `config.py` would make a safety band
something an environment variable can widen at 9pm — exactly the change
`IMPLAUSIBLE_MM`'s docblock argues against. It also keeps the attribution
honest downstream: the UI says *"Fluud rejects anything at or above 600 mm"* and
*"FloodNet's 10 mm flood-event threshold"*, and a single merged block is how
those two sentences end up crediting the same author.

⚠️ **They exist on the wire so the UI carries no copy.** `web/src/lib/CLAUDE.md`
has the argument; the short version is that a literal on that side is a number
duplicated across two languages with nothing in `parity.test.ts` holding it.

⚠️ **`/api/sensors` gained `ground_height_mm` in the same commit**, straight off
the `sensors` table. It is the height of the mount and **not a depth** — the
detail face renders it in metres, away from the reading, for exactly that
reason. It is what makes the phantom-flood rejection legible to a reader rather
than only to this file.

⚠️ **`GaugeHistoryResponse` groups five gauges into one body, and that is
transport only.** Nothing in it is sorted by level, normalised or aggregated
across gauges. **Do not add a field that spans them.**

## `mail.py` is the only outbound egress in this repo

Everything else talks to the outside world by *asking* it questions; this
pushes, and it pushes to a person rather than to a browser that chose to
connect. Two things keep that survivable:

- **The default transport sends nothing.** `MAIL_TRANSPORT=log` renders every
  message, writes it to the log in full and marks the outbox row `skipped`. The
  whole feature is exercisable with no provider and no credential, and the
  honest headline is that this ships as a watch that cannot yet notify. `smtp`
  is stdlib `smtplib` — no new dependency, no third-party origin.
- **`status = 'sent'` means handed to a relay.** Not delivered, not accepted by
  the recipient's server, not read. A bounce arrives at a mailbox this process
  does not read and never will. Nothing in this repo may be worded as though
  that column knew more than it does. LIMITATIONS §16.
- ⚠️ **`drain` is a RACE between every loop pointed at the database, and the
  loser destroys the message.** `db.pending_outbox` claims rows with an
  `update … skip locked`, and `poll.tick` calls `drain` — so a second process
  ticking against the same database competes for every row. One without
  `MAIL_TRANSPORT` marks what it wins **`skipped`**, which is terminal:
  `prune_outbox` treats it as finished and nothing retries. **Measured
  2026-08-16** — a local process with `transport_delivers() == True` queued a
  confirmation and read it back `skipped`, taken by the deployed container.
  **A half-configured second deployment is worse than no second deployment.**
- ⚠️ **A FULLY-configured second loop destroys nothing and is still wrong, and
  the reason is `render`'s purity.** The body is stored **as rendered**, so it
  carries the `PUBLIC_BASE_URL` of whichever process **queued** it — not of
  whichever one sends it. Found running on 2026-08-16: a local `uvicorn`, up
  11h52m against the production database with a live relay, had queued and sent
  a real confirmation whose confirm and unsubscribe links both read
  `http://127.0.0.1:8081`. **Both resolved perfectly for the person running the
  server and for nobody else**, which is how it survived a night. Nothing was
  lost — both loops could send — so `outbox.status` said `sent` and meant it.
  **`PUBLIC_BASE_URL` is the field to read before pointing any local process at
  a shared database**, and `_link`'s existing warning covers only the case where
  it is *unset*, not the case where it is set to something local.

⚠️ **Every link it builds points at `/watch/`, and `check_mail.py` asserts the
CALL SITES rather than the helper.** They pointed at `/map/?…` until 2026-08-16,
which is a gated route, so every confirmation and every unsubscribe link ever
sent was unreachable to a subscriber with no Fluud account. **The check was green
throughout**, because it passed `"/map/?watch="` as an *argument* to `_link` and
so pinned the base-joining and nothing else. There is a caller-path section now,
both languages, every kind, plus a negative assertion that **no rendered body
contains `/map/?`** — that last one is what catches a revert.

⚠️ **`unsubscribe_header` is public and pure for the same reason.** The
`List-Unsubscribe` value is the one link a mail client acts on without the reader
reading it, it carries a bearer credential, and it lived inside `_send`, which
opens a socket and cannot be driven from a check script.

⚠️ **`mail_confirm`'s honesty paragraph is `watch_note` VERBATIM**, asserted by
both `check_escalation.py` and `check_mail.py`. Edit one and the containment
check catches you.

⚠️ **The `{sensors}` lines carry the borough** — `api._sensor_names` composes
`name · borough` and `mail.render` lists what it is given verbatim. Composing
the line is the caller's job; the template re-splitting or re-joining it would
be a second author.

## The watch routes, and the abuse controls

The real control is **double opt-in: nothing is ever sent to an unconfirmed
address except that address's own confirmation.** `subscribe` answers
**identically** whether the address was new or already known — differing would
both leak whether an address is on the list and turn the endpoint into a way to
mail a stranger repeatedly.

### ⚠️ That sentence is NARROWED as of 2026-08-16, and it is narrowed by a proof

`subscribe` has a second answer, `status: "confirmed"` with a `manage_token`,
and it is reachable **only when `api._verified_session` returns a session whose
`email_verified` claim equals the address being subscribed**, after
`mail.normalise_address` on both sides. A signed-in reader typing somebody
else's address gets `pending`; so does every anonymous caller; and
`REQUIRE_AUTH=false` makes the branch unreachable, because `_verified_session`
returns `None` and `None` means *no shortcut* whatever its cause.

⚠️ **Why the identical-answer property is not being spent.** Both things it
protects go vacuous on that branch. The only address reachable is one the caller
cryptographically proved they own, so **there is no third party to learn
about** — the route cannot be aimed at anybody else. And the one message queued
is `mail.render("resend", …)` to that same proven mailbox, so it is not a way to
mail a stranger. What it replaces is a redundancy: `/api/watch/subscribe` was
never in `_AUTH_EXEMPT`, so with the gate on **every subscriber was already a
verified Neon Auth session**, and the app then asked them to retype an address it
held and mailed them a link to prove they owned it.

⚠️ **The shape may not vary by row existence inside that branch.** A token on a
new row and none on an existing one would make token-presence a *"was this
address already here"* oracle — the same reflex, rebuilt one field over. The
`row is None` branch therefore looks the row up (two lookups, **kept as a
partition**, exactly like `resend`) and returns the same shape.

⚠️ **An unconfirmed row for the caller's own verified address is confirmed on
that path**, through `db.confirm_subscriber` with the row's own confirm token —
never a new `confirm_subscriber_by_email`, so this repo still has exactly one
`update … set confirmed_at`. A provider-attested `email_verified` is a
**stronger** claim about the mailbox than a clicked link: the link proves
somebody reading that inbox pressed it, the claim proves the provider checked.

⚠️ **`set_subscriptions` is NOT called on the existing-row branch.** It is
delete-then-insert, so applying the picks would silently replace a watch list the
reader cannot see from the panel they pressed. They get the token and `/watch/`.

⚠️ **Two costs, written down rather than discovered.** The manage token is a
non-expiring bearer credential and this is its **second exit from the server** —
mail was the only one. And if a Neon account's address is changed to one that
already subscribed, and the provider marks it verified, that account holder
receives the subscriber's token; bounded by `email_verified` being
provider-attested, and by the fact that the same person could already press
`resend link` and be mailed it. LIMITATIONS §16 carries both.

⚠️ **Everything before the branch is unchanged and stays before it.** The lang
check, `normalise_address`, the `camera_ids` refusal, the cap,
`_permitted_sensor_ids`, `_validated_settings` / `_validated_overrides`,
`_rate_limited()` and the `watch_max_subscribers` ceiling all run first — the
fast path is a **strict subset** of the slow path's checks, so there is nothing a
reader can find that it skips.

⚠️ **What is COUNTED rather than structural is how many times the one permitted
message may go out.** `/api/watch/resend` answers an **unconfirmed** address by
re-queueing its confirmation, because the alternative was a reader whose mail
was filtered having no way back and a seven-day wait for
`db.prune_unconfirmed`. The bound is `api.CONFIRM_RESENDS_MAX` (3) for the row's
lifetime, via `db.confirm_message_count`, which counts `outbox` rows — whose
30-day retention outlives the 7-day unconfirmed row, so a prune cannot reset it,
and no column is added to `subscribers`.

⚠️ **The two branches are a PARTITION and must stay one.**
`db.confirmed_subscriber_by_email` (`confirmed_at is not null`) sends the manage
link; `db.unconfirmed_subscriber_by_email` (`confirmed_at is null`) re-sends the
confirmation. Both predicates are in SQL, and the unconfirmed branch may never
send the `resend` message — that message's entire content is the manage token,
which is a bearer credential. **Collapsing the two lookups into one is the
refactor to refuse.** The route answers **four** states — confirmed,
unconfirmed, capped, absent — with one body.

### ⚠️ `/api/watch/mine` — the one lookup with NO parameter (2026-08-17)

It answers *does the signed-in reader's own proven address already have a
confirmed watch*, and the panel uses it to **not run the wizard** for somebody
who does.

⚠️ **The wizard was not redundant for those readers. It did nothing.**
`watch_subscribe` deliberately does not call `set_subscriptions` on the
existing-row branch — delete-then-insert would silently replace a list the panel
cannot see — so a subscriber walking pick → alerts → email → submit again ended
on a receipt that changed no row. Asking first is the fix.

⚠️ **There is no address to aim it at, and that is the whole enumeration
control.** Every other lookup in this feature takes an address or a token; this
reads `session.email` and nothing else, so the *"is this address on Fluud"*
oracle the rest of the feature spends its length refusing has no door here.
`mail.normalise_address` on the claim, matching every other comparison against a
stored address.

⚠️ **It is NOT in `_AUTH_EXEMPT` and adding it would BREAK it, not loosen it.**
`_verified_session` returns `None` on an exempt path by design, so an entry there
turns this into a route that silently always answers `false`.

⚠️ **An UNCONFIRMED row answers `false`.** It reuses
`db.confirmed_subscriber_by_email`, whose `confirmed_at is not null` lives in
SQL — a row waiting on a confirmation has not earned a manage token, and handing
one over here would be the double opt-in bypass that
`confirm_subscriber_by_email` does not exist in order to prevent.

⚠️ **It is `manage_token`'s THIRD exit from the server and adds no capability.**
The other two are mail and `watch_subscribe`'s verified-self branch, which hands
the same token to the same reader on the same proof — anybody who can reach this
route can already POST their own address to `subscribe` and be given it. **What
would be new is answering for an address the caller did not prove**, and the
absent request parameter is what makes that unreachable rather than merely
unimplemented.

⚠️ **It calls `watch_subscription` rather than re-assembling the body**, as
`watch_update` already does. `citywide_silence` and every `silent` /
`alert_permitted` in that body are recomputed per read because each can flip
after somebody subscribes, and a second assembly is a second place for that to go
stale.

**Verified locally 2026-08-17**, against a bare `uvicorn` with `POLL_IN_SERVICE=false`
and `MAIL_TRANSPORT=log` so nothing ticked and nothing drained the outbox:
`REQUIRE_AUTH=false` → `200 {"watching":false,…}` (the safe direction — no
session means no shortcut); `REQUIRE_AUTH=true` signed out → **401**, so the
route is genuinely gated; a garbage bearer → **401 Invalid session.**;
`/api/watch/subscription` still **422** on a missing token, i.e. still exempt.

⚠️ **None of the six routes deletes an unconfirmed row on request.**
`unsubscribe` takes a manage token, and an unconfirmed subscriber has no
reader-held key at all — the confirm token goes to the mailbox. So the only
thing that removes one is `db.prune_unconfirmed`. The page says so rather than
implying a withdrawal it cannot perform.

## The watch tables, and what they cost

- `subscribers` / `subscriptions` are bounded by `watch_max_subscribers` (500)
  and `watch_max_sensors` (10). Ceilings, not capacity planning — they bound
  the blast radius of both a database dump and a mail-bombing script.
- ⚠️ **The notification judgement is `notify.effective` / `notify.allowed`, in
  Python, at the queue site — never a `where` clause.** A SQL predicate
  encoding "wants this level" would be a second authority for a rule
  `check_notify.py` can only see in one place.
- `sensor_episodes` gains a row only on a **transition**, never per tick, so it
  is hundreds of rows a year against `sensor_readings`' ~560k a day. It is
  deliberately not pruned: it is the record of what was decided.
- `outbox` grows at subscribers × episodes and rides the hourly prune clock.
  ⚠️ **`prune_outbox` never deletes `failed` or `expired`** — a message that
  could not be sent is the evidence somebody was *not* told, and deleting it
  makes an undelivered warning indistinguishable from one never queued.
- ⚠️ **`camera_subscriptions` and `outbox`'s `camera` kind are DORMANT.**
  Nothing writes them and nothing reads them; both write routes refuse
  `camera_ids` with a 400. They stay because `schema.sql` has no `drop`.

⚠️ **There is no function here that lists subscribers, and there must not be
one.** `db.watch_counts()` returns aggregates for `poll probe`. A surface
answering *"who is watching this corner"* is the targeting list LIMITATIONS §16
spends its length arguing this table is not.
`db.confirmed_subscriber_by_email` is the closest thing and is not one: it takes
an address the caller already typed, answers about that single row, and the
route above it cannot report what it found.

⚠️ **`alert_permitted` never appears in a `where` clause in `db.py`.** These
functions return the raw `alert_visible` and `status` columns and the caller
puts them through `floodnet.alert_permitted`. `confirmed_at is not null` **is**
in SQL, and the distinction is worth keeping straight: that is a fact about a
row in this database, not a life-safety judgement about a sensor.

## Adding config

`config.py` is `pydantic-settings` over env. Two rules:

- **Secrets only via env**, never argv, never a default in code.
- ⚠️ **Never pass `.env` through a comma-delimited deploy flag.**
  `WATCH_CAMERAS` is a comma-separated list of 27 camera ids, so one variable
  becomes twenty-seven broken ones.

Two traps the mail settings added:

- ⚠️ **`SMTP_STARTTLS` defaults to `True` and an EMPTY value cannot turn it
  off** — pydantic re-applies the default for a key that arrives empty. Write
  the literal string `false`.
- ⚠️ **`SMTP_PASSWORD` is a plain environment variable.** There is no
  secret-manager integration anywhere in this repo, so treat it as readable by
  anybody who can read the service's configuration.

And one the sign-in added, which is a different shape from both:

- ⚠️ **`NEON_AUTH_URL` has a twin the browser reads, and it is not env at
  runtime.** `NEXT_PUBLIC_NEON_AUTH_URL` is substituted into the static export
  at **build** time. Setting only the one in this file gives you an API that
  gates correctly and a UI that can never produce a token it will accept — with
  no error naming the cause, and no restart that helps. Adding any
  `NEXT_PUBLIC_*` means adding a matching `ARG` to the Dockerfile's UI stage.
