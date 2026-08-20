"""Every record that crosses a boundary is a model, never a bare dict.

Strict models for things we author. Lenient models for anything arriving from
an API we don't control (FloodNet, Socrata, DOT, NWS, NOAA, USGS) — those
upstream schemas change without warning and a hard validation error at 9pm on
hackathon night is not a tradeoff worth making.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Lenient(BaseModel):
    model_config = ConfigDict(extra="allow")


# ⚠️ **There was an ordinal class over a camera frame here and there must not
# be one again.** The water-segmentation layer that produced it was deleted
# outright. A camera is a view now: it carries a still, a pin, a name and its
# paired sensor's depth, and it judges nothing. Only FloodNet reports
# millimetres.
class Level(str, Enum):
    """Public alert level. Escalation is monotonic within an event."""

    CLEAR = "clear"
    WATCH = "watch"
    WARNING = "warning"
    EMERGENCY = "emergency"

    @property
    def rank(self) -> int:
        return {"clear": 0, "watch": 1, "warning": 2, "emergency": 3}[self.value]


# --- upstream --------------------------------------------------------------
class Sensor(Lenient):
    # FloodNet's internal deployment_id — this is what joins depth_data.
    sensor_id: str
    # The human-readable slug, e.g. 'M-avenue-c-e-20th-st-2zpcro'. Matches the
    # `sensor_id` column in the Socrata mirror, which is a different thing than
    # this model's sensor_id. Blame the upstream naming, not the model.
    slug: str | None = None
    lat: float
    lon: float
    name: str | None = None
    deployed_at: datetime | None = None
    status: str = "unknown"
    # FloodNet's own judgement about whether this deployment is fit to raise a
    # public alarm. We do not override it. See floodnet.should_alert().
    alert_visible: bool = False
    ground_height_mm: int | None = None
    # NTA is the aggregation unit we commit to in LIMITATIONS.md §3 — exposure
    # is reported at neighborhood scale, never at building scale. It ships with
    # the dataset, so there is no excuse for going finer.
    nta: str | None = None
    borough: str | None = None
    # Distinguishes coastal/tidal flooding from stormwater flooding. Different
    # phenomenon, different warning, different time constant.
    tidal: bool = False


class DepthReading(Lenient):
    sensor_id: str
    observed_at: datetime
    # The filtered, fully processed value. This is the number to trust.
    depth_mm: float
    # Uncorrected ultrasonic range. Goes negative near zero (-20mm is normal).
    # Kept for provenance only — never alert on it.
    raw_mm: int | None = None
    # FloodNet's own flood determination for this reading. This gates alerting.
    flood_detected: bool = False
    # False when the depth exceeds physical plausibility for a street sensor —
    # i.e. the rangefinder has faulted. See floodnet.IMPLAUSIBLE_MM.
    plausible: bool = True


class Camera(Lenient):
    camera_id: str
    name: str
    lat: float
    lon: float
    image_url: str
    # DOT's own `area` string, verbatim. Five values across 968 rows today.
    #
    # ⚠️ **Not normalised against `sensors.borough`, and it must not be.** The two
    # come from two agencies with two vocabularies, and rewriting DOT's string to
    # match FloodNet's would be this repo inventing a value and then attributing
    # it upstream. If they ever disagree, that is a fact to record rather than a
    # difference to erase.
    #
    # ⚠️ **`Camera` is `Lenient`, so `area` was already KEPT — it just was not
    # readable.** An undeclared key survives on the model and reaches nothing;
    # declaring it here is what makes it a field the rest of the app can use.
    borough: str | None = None


class WeatherAlert(Lenient):
    """One active NWS product. `Lenient` — these are someone else's bytes.

    ⚠️ **Everything past `expires` arrived for the DISPLAY path** and nothing on
    it may reach a decision. What corroborates a depth is
    `feeds.is_witness_alert`, which reads `event` and nothing else.
    """

    event: str
    severity: str | None = None
    headline: str | None = None
    expires: datetime | None = None
    # NWS's own alert identifier. The panel keys rows on it; nothing joins on it.
    nws_id: str | None = None
    urgency: str | None = None
    certainty: str | None = None
    area_desc: str | None = None
    # SAME/FIPS codes for the zones covered. `feeds.in_nyc` reads these, for
    # scope on the page only — the REQUEST stays statewide. See feeds.py.
    same_codes: list[str] = Field(default_factory=list)
    onset: datetime | None = None
    ends: datetime | None = None


class GaugeReading(Lenient):
    """One water level from one gauge, NOAA CO-OPS or USGS.

    ⚠️ `level_ft` is only comparable to the same gauge's own history and its own
    thresholds. NOAA here is referenced to MLLW; each USGS gage height is
    referenced to that site's own local datum. Two gauges' levels are not two
    measurements of one quantity — see `gauges.py`.
    """

    gauge_id: str
    # 'noaa' | 'usgs'. A plain string rather than an enum because it names an
    # upstream we do not control, and a new network should not be a crash.
    network: str
    observed_at: datetime
    level_ft: float


# --- ours ------------------------------------------------------------------
class GaugeSite(Strict):
    """A gauge we have chosen to watch, and what we know about it.

    Curated by hand in `gauges.GAUGES` rather than discovered, because "which
    gauges exist near New York" and "which gauges say anything about New York"
    are different questions and only the second one is useful.
    """

    gauge_id: str
    network: str
    name: str
    lat: float
    lon: float
    # Minor-flood stage in the same datum the reading arrives in. None where the
    # operator publishes no threshold for this endpoint — which is every USGS
    # site here. Inventing one would be exactly what LIMITATIONS §8 forbids.
    # See the derivation comment in `gauges.py`: this is a CONVERTED number.
    minor_flood_ft: float | None = None



class Pair(Strict):
    """A DOT camera matched to its nearest FloodNet sensor.

    `distance_m` is the whole ballgame: a sensor 40m away is ground truth for
    that camera, a sensor 900m away is a different puddle. Anything over
    `MAX_PAIR_M` is treated as unpaired.
    """

    camera_id: str
    sensor_id: str
    distance_m: float


class Observation(Strict):
    """One reading for one camera at one moment.

    ⚠️ **The only depth here is the paired FloodNet sensor's.** A camera
    produces no number of its own — no ordinal class, no confidence, no
    estimate — and no field may be added that lets one arrive. That is what
    keeps `escalation.level_for` structurally unable to read anything but a
    calibrated millimetre.
    """

    camera_id: str
    observed_at: datetime
    depth_mm: float | None = None
    sensor_id: str | None = None
    nws_active: bool = False
    mode: str = "LIVE"
    # Carried through from the reading: FloodNet's own flood call, and whether
    # the depth is physically believable. Both gate escalation.
    flood_detected: bool = False
    depth_plausible: bool = True
    # Whether this camera's sensor is tidally influenced (`sensors.tidal`), and
    # whether the harbor was at or above minor-flood stage on this tick. They
    # are only meaningful together: a Battery reading corroborates a *tidal*
    # sensor, because that is the same water arriving at two instruments. For a
    # stormwater sensor inland it corroborates nothing, and treating it as a
    # witness there would be worse than having no witness at all. Read only by
    # `escalation._depth_is_credible`, and only as a pair.
    tidal: bool = False
    harbor_above_flood: bool = False


class SensorReadingFacts(Strict):
    """Everything `watch.py` is allowed to decide from, for ONE sensor.

    The sensor-path analogue of `Observation`, and ⚠️ **deliberately not
    `Observation` — the two must not be collapsed.** `Observation` is what a
    watched camera produces; this is what one FloodNet deployment reports with
    no camera involved at all.

    `alert_visible` and `status` are carried **raw** so that `watch.is_permitted`
    can put them through `floodnet.alert_permitted`, which is that predicate's
    single authority. A pre-computed boolean here would be a second one.
    """

    sensor_id: str
    # None when this deployment has never reported. Absence, not zero — the
    # `sensor_readings.depth_mm not null` rule, carried up into the record.
    observed_at: datetime | None = None
    depth_mm: float | None = None
    flood_detected: bool = False
    plausible: bool = True
    alert_visible: bool = False
    status: str = "unknown"
    # The harbor witness and its gate. Only meaningful together, for the reason
    # spelled out on `Observation`: the Battery corroborates a tidal sensor and
    # corroborates nothing under an inland stormwater one.
    tidal: bool = False
    harbor_above_flood: bool = False
    # A witness here, never a trigger — see the `watch.py` docstring.
    nws_active: bool = False
    # ⚠️ **Always None now.** It carried the worst OPEN camera `alerts` level so
    # a paired sensor would defer to the camera's episode rather than run a
    # second state machine beside it. The on-page alert system was unwired, so
    # nothing populates it and `watch.effective_level` returns `sensor_level`.
    # Kept with `effective_level` so re-wiring is one commit rather than a
    # rebuild.
    camera_level: Level | None = None


class Alert(Strict):
    """⚠️ **Dormant.** The on-page alert system was unwired: nothing constructs
    this and the `alerts` table is gone from `schema.sql`. Kept beside
    `escalation.py` so re-wiring is one commit."""

    camera_id: str
    level: Level
    opened_at: datetime
    peak_depth_mm: float | None = None
    message_en: str = ""
    spoken: bool = False


# --- the HTTP contract -----------------------------------------------------
# What `api.py` actually puts on the wire, one model per route. These are the
# authority for the response shapes; `web/src/lib/api-types.ts` mirrors them by
# hand and `/openapi.json` is now generated from them rather than reporting
# `{}` for every body.
#
# Keep these SEPARATE from the domain records above. `Observation` is what the
# poller fuses; `CameraStatus` is what a browser is told. They overlap today
# and will not always — collapsing them would make a UI change able to alter
# what escalation sees.


class Wire(BaseModel):
    """Base for response models.

    `extra="forbid"` is the point of the base class. FastAPI's `response_model`
    silently *drops* undeclared keys by default, so a handler that grows a
    field nobody added here would return it to no one and look fine from the
    server side. Forbidding extras turns that into a loud 500 instead — the
    same fail-loud preference the ingest layer follows, applied to our own
    output. Not frozen: these are built once and serialised, never mutated.
    """

    model_config = ConfigDict(extra="forbid")


# Timestamps we produce from the database are `AwareDatetime`, not `datetime`.
# Pydantic accepts a naive datetime into a plain `datetime` field perfectly
# happily, and a naive timestamp on the wire is the bug `parseServerTime` in
# the UI carries a defensive workaround for: `Date.parse` reads an offsetless
# string in the VIEWER's zone, which in NYC silently shifts every age by four
# or five hours and renders a five-hour-old reading as current. Requiring
# awareness here makes that a 500 in our logs instead of a wrong number on
# someone's phone.
class Thresholds(Wire):
    """Borrowed numbers, not invented ones. See the root CLAUDE.md."""

    flood_event_mm: int
    curb_height_mm: int


class IngestBounds(Wire):
    """The poller's own judgement bounds — **invented here**, unlike `Thresholds`.

    ⚠️ **These two models are deliberately not one, and the split is the
    point.** 10 mm is FloodNet's flood-event definition and 150 mm is NYC curb
    height: both are borrowed, and the root CLAUDE.md requires a source for any
    change to them. Everything here was derived in this repo from what the
    instruments actually did, and `floodnet.py` carries each derivation at the
    constant. Folding them into `Thresholds` would put a number this project
    chose under a docstring promising it did not.

    They ride on `/api/status` for the same reason the thresholds do: the UI
    must never carry its own copy. `web/src/lib/depth-band.ts` records why —
    a literal on the TypeScript side is a number duplicated across the two
    languages with nothing in `tests/parity.test.ts` holding it.

    What the UI does with them is say **which bound a fault crossed** and
    **which window a silence is measured over**. Both were invisible: a reader
    met `FAULT` with no number behind it, and a sensor with no reading at all
    rendered a bare em-dash that could as easily have meant nobody had looked.
    """

    # `floodnet.IMPLAUSIBLE_MIN_MM` / `IMPLAUSIBLE_MM`. Floats, because the
    # floor is derived from `depth_raw_mm`'s documented excursion rather than
    # from a round number, and rounding it here would be this file quietly
    # widening a safety band.
    implausible_min_mm: float
    implausible_mm: float
    # `floodnet.MAX_AGE`, in seconds. The clock-skew window's back edge, and
    # the reason ~29 deployments with broken real-time clocks arrive as silent:
    # everything they publish is stamped decades ahead, so they have nothing
    # inside it. ⚠️ **It is a bound on the QUERY, not a staleness threshold.**
    # `web/src/lib/staleness.ts` owns when a reading looks old; this owns
    # whether it was fetched at all, and the two must not be collapsed.
    reading_max_age_s: int


class CameraStatus(Wire):
    camera_id: str
    name: str
    lat: float
    lon: float
    image_url: str
    observed_at: AwareDatetime
    # null for an unpaired camera. NOT zero — `calibrated` is how the UI knows
    # which of the two it is looking at.
    depth_mm: float | None
    sensor_id: str | None
    nws_active: bool
    calibrated: bool
    # Neighborhood Tabulation Area DISPLAY NAME, reached through this camera's
    # paired sensor and resolved by `api._nta_name`. None for an unpaired
    # camera, or one whose sensor has no NTA upstream.
    #
    # ⚠️ **Two DOHMH rodent-inspection fields travelled beside this and are
    # deleted** — `rodent_activity_rate` and `rodent_inspections`, removed
    # 2026-08-14 with the card back that rendered them. The name stayed because
    # it is geography rather than rat data; `api._nta_name` records the split.
    nta: str | None
    # Whether this camera's depth was physically believable, as judged by
    # `floodnet.IMPLAUSIBLE_MIN_MM` / `IMPLAUSIBLE_MM` at ingest.
    #
    # Required rather than defaulted, and `true` when `depth_mm` is null:
    # absence has no plausibility to doubt, and a nullable fourth state would
    # make every consumer handle "unknown" for a case that cannot occur.
    #
    # This closes the gap MEASUREMENTS.md called the clearest open honesty
    # problem in the UI — `_depth_is_credible` has always gated *alerting* on
    # this, but nothing gated the *display*, so a faulted rangefinder rendered
    # its number in the same type as a real one.
    depth_plausible: bool


class SensorStatus(Wire):
    """One FloodNet deployment, whether or not this page watches it.

    ⚠️ **A row here is not an alarm.** The list is every deployment in the
    city; only an `alert_permitted` one can mail a subscriber, and nothing on
    the page warns from any of them.

    | field | today | means |
    |---|---|---|
    | `alert_visible` | 401 | FloodNet permits this deployment to alarm |
    | `alert_permitted` | 343 | ...and its sensor is currently healthy |
    | `watched_camera_id` | **21** | paired to a camera in `WATCH_CAMERAS` |

    The first two are FloodNet's judgement and are carried so the UI can
    distinguish "upstream disabled this" from "we do not watch it", which are
    different silences. `alert_permitted` is what the email watch admits —
    `watch.py` takes no camera at all.

    `watched_camera_id` names the camera whose view this sensor's depth
    labels. It gates nothing: the on-page alert system was unwired.

    ⚠️ **21, not 27.** That is a count of *cameras*: four sensors serve more
    than one watched camera, so the distinct sensor count is lower and
    `db.sensor_status`' `lateral … limit 1` is what keeps the rows unique.

    `alert_permitted` is computed by `floodnet.alert_permitted`, never in SQL —
    that predicate has exactly one authority. `slug` is deliberately not sent:
    it is a join key for the Socrata mirror and means nothing to a reader.
    """

    sensor_id: str
    name: str | None
    lat: float
    lon: float
    borough: str | None
    # The NTA display NAME, not the code — same treatment as `CameraStatus.nta`.
    nta: str | None
    # Tidal deployments see coastal surge, the rest see stormwater. Different
    # phenomenon, different time constant. Also the gate on the harbor witness:
    # the Battery corroborates a tidal sensor and nothing else.
    tidal: bool
    # FloodNet's `sensor_status`, passed through as a plain string. Upstream we
    # do not control, so a new value must not be a crash — the same reasoning
    # that makes `GaugeReading.network` a str rather than an enum.
    status: str
    alert_visible: bool
    alert_permitted: bool
    # The watched camera this sensor drives, or null. Null does NOT mean
    # unpaired — 131 pairs exist and 27 are watched.
    watched_camera_id: str | None

    # How far above the roadway the rangefinder is mounted, from FloodNet's
    # `height_ground_mm`. Stored since the registry was first ingested and on
    # the wire since 2026-08-15.
    #
    # ⚠️ **It is a length in millimetres and it is NOT a depth.** It may never
    # take a depth band, a pill, a bar or a marker colour, and it may never be
    # compared to `depth_mm` on any shared axis — one is the height of a pole
    # and the other is water on the ground. What it is FOR is the phantom-flood
    # argument: a reader meeting a `FAULT` chip over `1452 mm` has no way to
    # know why we disbelieve it until they know the instrument is 2-3 m up.
    #
    # Nullable, because `floodnet._int` returns None for a deployment that
    # publishes no height — and an absent mounting height gets words rather
    # than a blank, on `_first_num`'s rule that a default is absence wearing a
    # measurement's clothes.
    ground_height_mm: int | None

    # ⚠️ **These four are null TOGETHER.**
    # No row in `sensor_readings` means no reading, so there is nothing to
    # report — and `plausible: true` on a sensor that has never reported would
    # be a claim about a number that does not exist. The UI renders an em-dash,
    # never a `0`, and never a fault mark on an absent reading.
    observed_at: AwareDatetime | None
    depth_mm: float | None
    flood_detected: bool | None
    plausible: bool | None


# ⚠️ **The wire vocabulary, and it is not the reader's vocabulary.** `unpaired`
# crosses the wire; a reader sees `not paired`. That is the fourth label/value
# split on this page after `watch`→`monitor`, `gauges`→`tide + wx` and
# `worst`→`depth`, and it exists because a wire value is an identifier and a
# label is copy. **The words `gold` and `silver` appear in neither.** They are
# the internal names of `cameras.GOLD_PAIR_M` / `MAX_PAIR_M` and they may not
# reach a reader — `web/tests/camera-filter.test.ts` asserts it.
PairTier = Literal["paired", "near", "unpaired"]


class CameraEntry(Wire):
    """One DOT camera from the registry, with its pairing tier and depth.

    ⚠️ **`distance_m` is deliberately NOT here, and adding it is the change to
    refuse.** The tier crosses as a classified string, which is
    `alert_permitted`'s shape: the judgement is made once, server-side, by
    `cameras.pair_tier`. A UI handed 968 raw distances is one commit from
    printing one beside a camera name or sorting a list on it — and *never
    colour a distance* is a Never bullet precisely because a monotone ramp over
    distance is a severity ramp built out of coverage.

    ⚠️ **Deliberately not `CameraStatus`.** That model is what a WATCHED camera
    reports through `observations` — our poller's clock, `nws_active`,
    `calibrated`, the NTA. This is the registry row, and the two answer
    different questions about different sets. See the banner above `Wire`.
    """

    camera_id: str
    name: str
    lat: float
    lon: float
    image_url: str
    # DOT's `area` verbatim, un-normalised against `sensors.borough`. See
    # `Camera.borough`.
    #
    # ⚠️ **Null has TWO causes and neither is *outside the city*.**
    #
    # 1. **The registry has not been re-bootstrapped** since this column landed.
    #    Nothing else fills it — `poll.tick` never touches the `cameras` table —
    #    so a borough filter over a stale database empties the drawing for a
    #    *deployment* reason, and the UI says so in words rather than rendering
    #    an empty city.
    # 2. ⚠️ **DOT RETIRED the camera and the row survived.**
    #    `db.upsert_cameras` is `on conflict do update` and never deletes, so a
    #    camera that leaves the feed keeps its row, keeps whatever it was last
    #    upserted with, and never gets a borough. **Measured in production
    #    2026-08-16, immediately after the first bootstrap that filled this
    #    column: 973 fetched, 974 stored, one null** —
    #    `Henry Hudson @ 137 St`, absent from the live feed.
    #
    # The two are told apart by the COUNT, which is why the UI's refusal fires
    # on *not one camera carries a borough* rather than on *this camera has
    # none*. One null among 974 is a retired camera; 974 nulls is a database
    # nobody bootstrapped. **A single-row check would have reported the second
    # message for the first fact.**
    borough: str | None
    # The paired FloodNet deployment, or null. Null and `tier == "unpaired"`
    # always travel together.
    sensor_id: str | None
    tier: PairTier
    depth_mm: float | None
    # ⚠️ **`depth_observed_at`, never `observed_at`, and the name is the
    # safeguard.** This is **FloodNet's publication clock** — the same one
    # `/api/sensors` carries — so it takes `sensorFreshnessOf` (1h/3h) and never
    # `freshnessOf` (5m/30m), which measures OUR poller's tick and is what
    # `CameraStatus.observed_at` means. Judging one against the other's
    # thresholds already shipped once, when three of four healthy USGS gauges
    # rendered amber on first load. A distinct field name is what stops a
    # third time.
    depth_observed_at: AwareDatetime | None
    # ⚠️ **`true` when `depth_mm` is null** — absence has no plausibility to
    # doubt — so this is never a third state and every consumer checks the depth
    # first. Same contract as `CameraStatus.depth_plausible`.
    depth_plausible: bool


class CameraRegistryResponse(Wire):
    """Every DOT camera this build knows about, unfiltered.

    **No counts and no aggregates**, on `SensorsResponse`' rule — and here the
    rule is load-bearing rather than tidy. The browser filters these rows, so the
    browser is the only thing that can say *"130 of 968 are drawn"*. A server
    that returned only matching rows would have to send a separate total beside
    them, which is a second place for that number to be computed and therefore a
    second place for it to disagree with the marks underneath it.
    """

    cameras: list[CameraEntry]


class SensorsResponse(Wire):
    """Every FloodNet deployment this build knows about.

    **No counts and no aggregates, deliberately.** Every total the UI needs —
    how many are reporting, how many are watched, how many are over threshold —
    is derivable from the list it already has. Sending them too would be a
    second place for those numbers to be computed and therefore a second place
    for them to disagree with the rows underneath them.
    """

    sensors: list[SensorStatus]


class AlertStatus(Wire):
    """⚠️ **Dormant.** No route returns this — `StatusResponse` dropped its
    `alerts` list when the on-page alert system was unwired. Kept beside
    `escalation.py` and the unmounted warning UI so re-wiring is one commit."""

    id: int
    camera_id: str
    name: str
    level: Level
    opened_at: AwareDatetime
    peak_depth_mm: float | None
    # `alerts.message_en` is `default ''` and every write path supplies a
    # string, so this is not nullable in practice.
    message: str
    conversation_id: str | None


class GaugeStatus(Wire):
    """One harbor/stream gauge, for the baseline panel.

    `minor_flood_ft` is null for every USGS site — see `models.GaugeSite`. The
    UI must therefore render a threshold-less gauge as a bare level with an age,
    and must not infer a threshold from the other gauges in the list.
    """

    gauge_id: str
    network: str
    name: str
    lat: float
    lon: float
    level_ft: float
    observed_at: AwareDatetime
    minor_flood_ft: float | None


class NwsAlert(Wire):
    """One active NWS product, as the gauges panel renders it.

    ⚠️ **Carries no flag saying whether it corroborates a depth.** That question
    is `feeds.is_witness_alert`, it is answered server-side, and putting the
    answer here would invite a surface that marks some alerts as the ones that
    "count" — which is this app ranking somebody else's warnings.
    """

    event: str
    # ⚠️ NWS's severity vocabulary and this app's depth band use several of the
    # same words for different quantities. It renders as an ATTRIBUTED WORD and
    # never as a colour; see `web/src/components/nws-alerts.tsx`.
    severity: str | None
    urgency: str | None
    certainty: str | None
    headline: str | None
    area_desc: str | None
    onset: AwareDatetime | None
    ends: AwareDatetime | None
    expires: AwareDatetime | None


class NwsStatus(Wire):
    """What NWS said, and when we last managed to ask.

    ⚠️ **`checked_at` and `attempted_at` are two fields because they are two
    claims.** *We asked and nothing was active* and *we could not ask* are
    opposite answers that both arrive as an empty list, and a reader in a
    hurricane is owed the difference. `checked_at` moves only on a successful
    read, so `alerts` is always the last thing NWS actually said, ageing in
    place, rather than being emptied by an outage.

    ⚠️ **Rides `/api/status` rather than a route of its own, deliberately.** The
    map already has that body on first paint. A `/api/nws` on its own 60s hook
    would render the nothing-active copy for up to a minute on every cold load —
    *no alert is active* shown during a hurricane warning — which is precisely
    the ambiguity this block exists to remove. The cost is a handful of rows on
    the 15s poll, smaller than the gauges block already there.
    """

    # Last SUCCESSFUL read. None means the feed has never been read in this
    # process, which the UI must render as *not read*, never as *nothing active*.
    checked_at: AwareDatetime | None
    # Last ATTEMPT, successful or not.
    attempted_at: AwareDatetime | None
    reachable: bool
    # The five boroughs only, ordered by NWS's own published severity rank.
    alerts: list[NwsAlert]
    # Active in the statewide feed but outside the five boroughs. **Counted,
    # never dropped** — a scope this page narrowed is a scope it has to admit to.
    elsewhere: int


class StatusResponse(Wire):
    # ⚠️ **Dropping a field from this body is a contract change and `Wire` makes
    # it a loud one.** `extra="forbid"` means a client still sending a field this
    # model no longer declares gets a validation error rather than a silent drop,
    # which is the whole reason that base class exists. Two fields left here on
    # 2026-08-14 on those terms.
    mode: str
    disclaimer: str
    thresholds: Thresholds
    # ⚠️ Separate from `thresholds` on purpose — borrowed numbers there,
    # numbers this repo derived here. See `IngestBounds`.
    ingest: IngestBounds
    cameras: list[CameraStatus]
    gauges: list[GaugeStatus]
    # ⚠️ On `/api/status` rather than a route of its own — see `NwsStatus`.
    nws: NwsStatus


class HistoryPoint(Wire):
    t: AwareDatetime
    depth_mm: float | None


class HistoryResponse(Wire):
    camera_id: str
    points: list[HistoryPoint]


class DepthPeakResponse(Wire):
    """The highest PLAUSIBLE depth one instrument reported over a window.

    ⚠️ **A peak, and never a mean.** `peaks.py` carries the argument in full;
    the short version is that a mean over a day across a two-hour flood renders
    the flood as a small number, in the largest type on the page. Do not add an
    `average_mm` beside this.

    ⚠️ **Four fields exist to keep three different silences apart**, because
    they all reduce to "no peak" and they mean entirely different things:

    | `readings` | `faulted` | means |
    |---|---|---|
    | 0 | 0 | nobody looked — the window has no readings at all |
    | 0 | >0 | the instrument reported, and every reading was a fault |
    | >0 | — | a real peak, from `readings` believable readings |

    Collapsing the first two into one message would tell a reader that a broken
    rangefinder is an unobserved street, which is the second-witness rule's display half
    failing in exactly the direction it was written to prevent.
    """

    kind: Literal["camera", "sensor"]
    instrument_id: str
    # The window actually used, in minutes, AFTER `peaks.clamp_minutes`. The
    # client compares it to what it asked for and says so when they differ — a
    # seven-day peak labelled "last year" is the one way this feature can
    # understate a flood.
    minutes: int
    # Null when no plausible reading fell in the window. NEVER 0.0 — that is a
    # depth, and it claims a dry street.
    peak_mm: float | None
    peak_at: AwareDatetime | None
    readings: int
    faulted: int
    # Newest reading in the window, plausible or not: this answers "when did we
    # last hear from this instrument", which a faulted reading answers fine.
    newest_at: AwareDatetime | None


class DepthPeakEntry(Wire):
    """One instrument's peak inside `DepthPeaksResponse`.

    `DepthPeakResponse`'s three fields that carry meaning, without the two that
    only a single-instrument reader needs. See `db.camera_depth_peaks` for why
    `peak_at` and `newest_at` are absent rather than null here.
    """

    instrument_id: str
    # Null when no plausible reading fell in the window. NEVER 0.0 — the same
    # rule as the single-instrument model, and it matters MORE here: this
    # number lands in a 42px list row, where a `0` beside a street name is the
    # most confident way this app could claim a dry block.
    peak_mm: float | None
    readings: int
    faulted: int


class DepthPeaksResponse(Wire):
    """Every instrument's peak over one window, for the instrument list.

    ⚠️ **A peak, and never a mean** — `peaks.py` carries the argument and it is
    not weakened by being asked in bulk.

    ⚠️ **An instrument MISSING from `peaks` is the empty window**, i.e. exactly
    the `readings: 0, faulted: 0` row of `DepthPeakResponse`'s table. It is not
    an error and it is **not a zero depth**. The client renders it as an
    em-dash, on the same rule that governs every other absent depth in this app.

    ⚠️ **The three silences still have to stay apart** — nobody looked, every
    reading faulted, a real peak. That is why `readings` and `faulted` ride with
    every entry rather than being dropped as list-row noise: a row that showed a
    dash without them could not say which of the two silences it was, and the
    two mean opposite things.
    """

    kind: Literal["camera", "sensor"]
    # The window actually used, AFTER `peaks.clamp_minutes`, on
    # `DepthPeakResponse.minutes`' terms. The client renders the window it GOT.
    minutes: int
    peaks: list[DepthPeakEntry]


class GaugeHistoryPoint(Wire):
    t: AwareDatetime
    # In the gauge's OWN datum. There is no depth here and no common zero —
    # see `GaugeStatus` and the derivation comment in `gauges.py`.
    level_ft: float


class GaugeSeries(Wire):
    gauge_id: str
    points: list[GaugeHistoryPoint]


class GaugeHistoryResponse(Wire):
    """Every gauge's recent trace, in one body.

    ⚠️ Grouping five gauges into one response is a transport decision, not a
    claim that they share a scale. Nothing here is sorted by level, normalised,
    or aggregated across gauges, and the UI draws each series against its own
    range with its own endpoints printed. Do not add a field that spans them.
    """

    series: list[GaugeSeries]


class PollWrites(Wire):
    """What POSTGRES says about the poller, rather than what a module global in
    the API's own memory says.

    ⚠️ **This is correct in both deployment shapes and `last_tick_at` is not.**
    With the poller in its own container, `poll.LAST_TICK_AT` is `None` in the
    API process forever, which is why the UI gated the whole frozen-poller row
    on `poll_in_service`. Whichever process runs the loop writes `poll_ticks`,
    and whichever process serves the request reads it. See the `LAST_COVERAGE`
    tombstone in `poll.py` for the same argument made about coverage first.

    ⚠️ **EVERY FIELD IS NULLABLE AND THE BLOCK'S PRESENCE IS THE SIGNAL.** Three
    absences with three different meanings, and collapsing any two of them puts
    a service that has never collected anything behind the same blank space as
    a service whose database is unreachable:

    · the whole block **absent** — a server built before this field existed
    · the whole block **null** — the read failed, or `poll_ticks` has not been
      created on this database yet
    · block present, `tick_at` **null** — the table is there and **no poller has
      ever ticked in this mode**. That is the bare `uvicorn` shape, and it is a
      positive statement rather than a silence.

    ⚠️ **`stored` is rows ACTUALLY INSERTED**, from `db.record_sensor_readings`'
    `rowcount` against an `on conflict do nothing` insert. Zero is a real claim
    — FloodNet published nothing new this tick — and it is different from a
    write that failed, which is what `tick_ok` carries.
    """

    tick_at: AwareDatetime | None
    tick_ok: bool | None
    readings: int | None
    stored: int | None
    # The last tick at which `stored` was above zero. ⚠️ **The field this whole
    # block exists for.** A loop that ticks forever and stores nothing moves
    # `tick_at` every minute and leaves this frozen, and that is the one failure
    # `last_tick_at` structurally cannot report.
    last_store_at: AwareDatetime | None


class HealthResponse(Wire):
    ok: bool
    mode: str
    poll_in_service: bool
    polling: bool
    last_tick_at: AwareDatetime | None
    # ⚠️ **`last_tick_at` above is a process global; this is a fact out of
    # Postgres.** Both stay. The global is the fallback for a database where
    # `poll_ticks` does not exist yet, and this is the only one that is correct
    # with the poller in its own process.
    writes: PollWrites | None
    cameras: int
    # Whether a message queued now could reach a mailbox — `mail.transport_
    # delivers()`, which is the single authority and is checked against
    # `deliver` by `check_mail.py`. ⚠️ **Capability, never delivery.** It says a
    # transport is configured and nothing beyond that: not accepted by the
    # recipient's server, not out of a spam folder, not read. `outbox.status =
    # 'sent'` already means less than a reader assumes and this means less
    # again, so no surface may word it as a message having arrived.
    mail_delivers: bool
    # Whether this deployment requires a verified Neon Auth session on
    # `/api/*` — `settings.require_auth`, reported rather than inferred.
    #
    # ⚠️ **It answers a question a caller otherwise cannot ask without being
    # refused**, and it is on the one route that stays exempt from the gate so
    # it is readable signed out. A deploy where the API gates and the UI was
    # built without `NEXT_PUBLIC_NEON_AUTH_URL` is a site nobody can enter, and
    # the two values live in different places with nothing checking they agree
    # — so this is how a post-deploy `curl` catches it. Reports CONFIGURATION,
    # never that any particular token would be accepted.
    auth_required: bool
    # The two cadences this deployment actually polls on: the storm tick and the
    # scheduled window. `poll.POLL_SECONDS` and `poll.POLL_WINDOW_S`, reported
    # rather than assumed.
    #
    # ⚠️ **These are on the wire because the UI's staleness thresholds are
    # multiples of them, and the two halves can otherwise drift silently.**
    # `web/src/lib/staleness.ts` ships compile-time defaults mirroring these
    # constants and `parity.test.ts` holds those in step — but the *bundle* is
    # built from the repo while the *deployed* cadence is also a Railway cron
    # expression, which somebody can edit without a rebuild. When the two
    # disagree this is the one that is true, so `lib/messages.ts` sizes the
    # frozen-poller thresholds off these rather than off what it compiled with.
    #
    # ⚠️ **Reporting a cadence is not permission to set one.** Nothing may send a
    # cadence back, and no alerting decision may read these: they size a *this
    # looks stale* judgement and nothing else.
    poll_seconds: int
    poll_window_s: int


# --- rat events ------------------------------------------------------------
# ⚠️ `at` is a `str` here, and deliberately, unlike every other timestamp above.
#
# These dicts are built in `rat.py`, which stamps `at` with `.isoformat()`, and
# they go out over TWO transports: this HTTP response (through pydantic) and
# the `/api/events` SSE stream (raw `json.dumps`, no pydantic anywhere near
# it). Typing `at` as a datetime would make pydantic re-serialise it to `...Z`
# on the HTTP path while the SSE path kept emitting `...+00:00` — the same
# event in two formats depending on which pipe it came down. Passing the string
# through unchanged keeps the two transports byte-identical, which matters
# because `warning-feed.ts` dedupes on `at` and a format split would defeat it.


class SpeakEvent(Wire):
    type: Literal["speak"]
    # Templated by `agent._TEMPLATES` (the templated-copy rule). Passed through verbatim.
    text: str
    level: Level
    lang: str
    place: str
    mood: str
    depth_mm: float | None
    # Set inside `rat.speak()`, never stamped on afterwards — see that docstring.
    drill: bool
    at: str


class MoodEvent(Wire):
    type: Literal["mood"]
    level: Level
    mood: str
    at: str


# Discriminated on `type`, so a malformed event fails against the one shape it
# claims to be rather than against both in turn.
RatEvent = Annotated[SpeakEvent | MoodEvent, Field(discriminator="type")]

# NOTE: neither event model declares `replay`, and that is correct rather than
# an omission. `rat.recent()` returns `{**ev, "replay": True}` — a copy, made
# only on the SSE replay path, which no `response_model` touches. So the HTTP
# shapes above never carry the flag and must not advertise it. The browser's
# `RatEvent` union keeps `replay?: boolean` because it types the SSE frames,
# where the flag is real; the TS being a superset of this is the contract, not
# drift. Adding `replay: bool = False` here would put `"replay": false` into
# every drill response — a new key on the wire, describing a path that cannot
# produce it.


class SpeakResponse(Wire):
    text: str
    event: SpeakEvent
    level: Level


class DrillResponse(Wire):
    # None for a `clear` drill: standing down sets a mood and says nothing.
    #
    # Required rather than defaulted, so the schema matches the behaviour. With
    # `= None` FastAPI still serialises the key on every response but OpenAPI
    # advertises it as optional, and a generated client would type it
    # `text?: string` while the server always sends it.
    text: str | None
    event: RatEvent


class LanguagesResponse(Wire):
    supported: list[str]
    pending_review: list[str]
    note: str


# --- the sensor watch ------------------------------------------------------
# ⚠️ Nothing here carries a reading, a depth, an age or a severity, and that is
# a rule rather than a coincidence. A watch surface that rendered live state
# would be a second place a number can appear without its plausibility and its
# freshness beside it — the exact gap `depth_plausible` was added to close. The
# live state comes from `/api/sensors` like everywhere else, and these responses
# only ever say what somebody asked for.


class WatchSubscribeResponse(Wire):
    """⚠️ **Identical whether or not that address was already subscribed — for
    every caller who did not PROVE that address.**

    Two reasons and the second is the stronger one. A differing response lets
    anybody test whether a given address is on this list. And a confirmation
    message on demand turns an unauthenticated endpoint into a way to mail a
    stranger repeatedly — `subscribers.email unique` plus `on conflict do
    nothing` is what stops **this** route doing it at all, and this shape is
    what stops the caller finding out.

    ⚠️ **`/api/watch/resend` will now send a second and a third**, on request,
    to an unconfirmed address — the recovery path for a confirmation that never
    arrived. That is a deliberate widening with a counted ceiling
    (`api.CONFIRM_RESENDS_MAX`) and it does not reach this route: a repeat POST
    here still queues nothing. Read the two together before concluding either
    one can be relaxed.

    ⚠️ **`confirmed` landed 2026-08-16 and it NARROWS the sentence above rather
    than repealing it.** It is reachable only when `api._verified_session`
    returns a session whose `email_verified` claim, after
    `mail.normalise_address` on both sides, equals the address being subscribed.
    A signed-in reader typing somebody else's address gets `pending`, byte for
    byte, and so does every anonymous caller. `REQUIRE_AUTH=false` makes the
    whole branch unreachable, because an unproven claim must unlock nothing.

    **Why differing is safe there.** Both properties above go vacuous: the only
    address that can reach it is one the caller cryptographically proved they
    own, so there is no third party to learn about; and the one message queued
    goes to that same proven mailbox. **Within that path the shape does not vary
    by whether the row already existed** — a token on a new row and none on an
    old one would rebuild the oracle in a different place.

    ⚠️ **`manage_token` is a non-expiring bearer credential** granting read,
    edit and hard delete of that record, and this is its **second exit from the
    server** — mail was the only one. Two consequences, stated rather than left
    to be discovered:

    - It now travels in a JSON body, so it is in the browser's memory, in
      devtools, and in anything between us and the reader that logs bodies. The
      UI may not persist it — no `localStorage`, no cache, no history entry.
    - If a Neon Auth account's address is changed to one that already subscribed
      and the provider marks it verified, that account holder receives the
      subscriber's token. Bounded by `email_verified` being provider-attested,
      and by the fact that the same person could already press `resend link` and
      be mailed it.

    LIMITATIONS §16 carries the long version.
    """

    status: Literal["pending", "confirmed"]
    # ⚠️ Present ONLY on `confirmed`, and absent is the safe direction: a client
    # that does not see one simply offers no shortcut link.
    manage_token: str | None = None
    # `agent`'s words, not composed at the call site. The sentence that says our
    # silence is not information.
    note: str


class WatchSettings(Wire):
    """A subscriber's global notification preferences, echoed back verbatim.

    The wizard's three settings: the trigger (`min_level`), the frequency, and
    the timeline (quiet hours, America/New_York, half-open [start, end)). The
    vocabulary is `notify.MIN_LEVELS` / `notify.FREQUENCIES`, refused at the
    door with a 400 otherwise — see `api._validated_settings`.

    ⚠️ EMERGENCY ignores all three. That rule lives in `notify.allowed` and
    `check_notify.py` asserts it; this model just carries what was asked for.
    """

    min_level: str
    frequency: str
    quiet_start: int | None
    quiet_end: int | None


class WatchSensorRef(Wire):
    """One watched instrument, named well enough to recognise. No state.

    Deliberately not `SensorStatus` — see the banner above.
    """

    sensor_id: str
    name: str | None
    borough: str | None
    # Per-instrument overrides of the two overridable preferences. Null means
    # "the subscriber's global applies" — the resolution happens in
    # `notify.effective`, never on a surface.
    min_level: str | None = None
    frequency: str | None = None
    # Whether FloodNet still permits an alarm from this deployment. It can flip
    # after somebody subscribes, and when it does the watch goes quiet — so the
    # manage surface has to be able to say which of its instruments have stopped
    # being able to tell it anything.
    alert_permitted: bool
    # ⚠️ **A BOOLEAN, deliberately, and it is the second field here that looks
    # like state and is not.** This instrument has not reported for longer than
    # `watch.SENSOR_STALE_AFTER`, so Fluud cannot say anything about that
    # corner. It replaced the silence email on 2026-08-05.
    #
    # It is not an age and must never become one. The banner above
    # `WatchSubscribeResponse` is the rule: a watch shape carrying a timestamp
    # invites a surface that renders "47 minutes ago" beside an instrument name,
    # and that is a reading without its plausibility or its freshness idiom
    # beside it. `db.subscriptions_for` holds the timestamp; the route reduces it
    # here, and the panel says the sentence rather than the number.
    silent: bool


# ⚠️ **`WatchCameraRef` was here and is deleted rather than left dormant.** It
# is a wire shape, and a wire shape nothing sends is a contract claiming
# something the server does not do. The camera watch went with the on-page
# alert system: `camera_subscriptions` and `outbox`'s `camera` kind stay in
# the schema, and both write routes refuse `camera_ids` with a 400.


class WatchSubscriptionResponse(Wire):
    # ⚠️ MASKED. The holder of this token already knows their own address; a
    # leaked or shoulder-read link should not hand one over.
    email_masked: str
    confirmed: bool
    sensors: list[WatchSensorRef]
    settings: WatchSettings
    max_sensors: int
    note: str
    # ⚠️ **When this is true, every `silent` above is forced false**, and the
    # panel says one thing about Fluud instead of N things about the reader's
    # instruments. At least half the registry has stopped reporting, which means
    # the feed died rather than the hardware — see `watch.citywide_silence`.
    # Telling somebody "the sensor at Ave C has stopped reporting" during a
    # FloodNet outage is simply false, and it is false on a page exactly as it
    # was in the inbox this line used to be sent to.
    citywide_silence: bool


class WatchMineResponse(Wire):
    """What the signed-in reader's own **proven** address already has.

    ⚠️ **The whole point of this route is that the wizard stops asking somebody
    to do a thing they have already done.** A reader with a confirmed watch who
    opens the monitor panel was walked through pick → alerts → email → submit,
    and on the existing-row branch `watch_subscribe` deliberately does **not**
    call `set_subscriptions` — so the flow ended in a receipt that changed
    nothing. This answers the question that makes the wizard unnecessary.

    ⚠️ **It reads `_verified_session` and answers about ONE address: the
    caller's own, provider-verified.** It takes no parameter, so there is no
    address a caller can aim it at and no oracle to build — the only thing it
    can ever report on is a mailbox the caller cryptographically proved they
    own. `watching: false` is what an unverified session, a signed-out caller
    and `REQUIRE_AUTH=false` all get, which is `_verified_session`'s own rule
    that `None` means *no shortcut* whatever its cause.

    ⚠️ **`manage_token` is a non-expiring bearer credential and this is its
    THIRD exit from the server — and it is not a new capability.** The other two
    are mail, and `watch_subscribe`'s verified-self branch, which hands the same
    token to the same reader on the same proof. Anybody who can reach this route
    can already POST their own address to `subscribe` and be given it. **What
    would be new is answering for an address the caller did not prove**, and the
    absence of a request parameter is what makes that unreachable rather than
    merely unimplemented.

    ⚠️ **An UNCONFIRMED row answers `false`.** `db.confirmed_subscriber_by_email`
    carries `confirmed_at is not null` in SQL, and this route inherits it: a row
    waiting on a confirmation has not earned a manage token, and handing one over
    here would be the double opt-in bypass that `confirm_subscriber_by_email`
    does not exist in order to prevent.
    """

    watching: bool
    # Both null when `watching` is false. Absent rather than empty, so a client
    # cannot render a manage surface out of a shape that says there is nothing
    # to manage.
    manage_token: str | None = None
    # ⚠️ The same body `GET /api/watch/subscription` returns, built by that same
    # function rather than assembled again here — `citywide_silence` and every
    # `silent` / `alert_permitted` are recomputed per read, and a second
    # assembly is a second place for that to go stale.
    subscription: WatchSubscriptionResponse | None = None


class WatchConfirmResponse(Wire):
    confirmed: bool
    # The only response that ever carries this. A live confirm token is proof
    # the caller holds the mailbox, which is the one moment handing over the
    # long-lived token is not a downgrade.
    manage_token: str
    note: str


class WatchUnsubscribeResponse(Wire):
    status: Literal["removed"]
    note: str


class WatchResendResponse(Wire):
    """⚠️ **Identical whether or not that address is here.** Same rule as
    `WatchSubscribeResponse`, and it is load-bearing in the same way.

    This route exists because a subscriber who deletes the email has no other way
    back: `manage_token` is the only key, and re-subscribing hits
    `subscribers.email unique` and queues nothing. Without this a confirmed
    reader stays subscribed with no way to stop, and an unconfirmed one waits
    seven days for `db.prune_unconfirmed`. Neither is a state this feature may
    leave somebody in.

    ⚠️ **It answers FOUR states with one body** — confirmed, unconfirmed, capped
    and absent — which is more than it was written for and is the reason this
    shape matters more than it did. A reader learns what they asked for and
    nothing about what is stored.

    The cost is a second endpoint that sends mail on an unauthenticated request,
    so it is bounded on the route rather than here: each branch may send only
    the message its own state already received, an unconfirmed address is capped
    at `api.CONFIRM_RESENDS_MAX` for its lifetime, the manage link names no
    instrument, and the caller cannot tell from this response whether anything
    was sent. ⚠️ This paragraph read *"it writes only to an address that has
    already **confirmed**"* until 2026-08-06; that clause was the structural
    bound and the counted cap is what replaced it.
    """

    status: Literal["pending"]
    note: str
