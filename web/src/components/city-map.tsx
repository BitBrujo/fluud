"use client";

import { useRef, useState } from "react";

import {
  Panel,
  PanelFooter,
  PanelHeader,
  PanelTitle,
  PanelTools,
} from "@/components/panel";
import { Button } from "@/components/ui/button";
import type {
  CameraEntry,
  CameraStatus,
  GaugeStatus,
  SensorStatus,
} from "@/lib/api-types";
import {
  applyCameraFilter,
  boroughsOfCameras,
  cameraFilterNote,
  cameraFilterRefuses,
  PAIR_TIERS,
  PAIR_TIER_LABEL,
  PAIR_TIER_TITLE,
  type CameraFilter,
  type PairTier,
} from "@/lib/camera-filter";
import { ageSeconds, depthText, parseServerTime } from "@/lib/format";
import { CSO_AS_OF, CSO_COUNT, CSO_OUTFALLS } from "@/lib/geo/cso";
import { NYC_BOROUGHS } from "@/lib/geo/nyc";
/* ⚠️ `MAP_ASPECT` was imported here and is not any more. This component no
   longer knows the drawing's shape: the box is whatever the track gives it and
   `lib/geo/viewport.ts` owns the agreement between that shape and the viewBox.
   **An import of it here would be somebody re-deriving that agreement locally**,
   which is the letterbox drift. */
import {
  VIEWBOX_H,
  VIEWBOX_W,
  inViewport,
  project,
  ringToPath,
  type Point,
} from "@/lib/geo/project";
import { pairKey, pairLinks } from "@/lib/geo/pairs";
import {
  isVisible,
  svgViewBox,
  toContainer,
  type Viewport,
} from "@/lib/geo/viewport";
import { useMapViewport } from "@/lib/hooks/use-map-viewport";
import { useNow } from "@/lib/hooks/use-now";
import { sensorAgeSeconds, type Origin } from "@/lib/instrument-query";
import { depthBand, DEPTH_BAND_PIN } from "@/lib/depth-band";
import {
  freshnessOf,
  gaugeFreshnessOf,
  sensorFreshnessOf,
  type Freshness,
} from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * The city, with the instruments on it.
 *
 * Built once at module scope — the geometry is a frozen constant, so rebuilding
 * this string per render would be pure waste on the largest string in the app.
 */
const LAND_PATH = NYC_BOROUGHS.flatMap((b) => b.rings.map(ringToPath)).join(" ");

/**
 * The 427 combined sewer outfalls, pre-projected once at module scope.
 *
 * Drawn **inside the SVG**, unlike the camera pins, and that difference is
 * deliberate rather than incidental. The pins are HTML buttons because they
 * need focus rings, hit targets and `aria-pressed`; outfalls are none of those
 * things — they are non-interactive backdrop, there are forty times as many of
 * them, and 427 more DOM buttons over the map would cost real layout work to
 * deliver nothing a reader can click. In the SVG they are 427 `<circle>`s in
 * one pre-computed array and they cannot disturb the load-bearing aspect ratio,
 * because they are in the same coordinate space as the coastline.
 */
const CSO_POINTS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < CSO_OUTFALLS.length; i += 2) {
    const p = project(CSO_OUTFALLS[i], CSO_OUTFALLS[i + 1]);
    out.push({ x: p.x * VIEWBOX_W, y: p.y * VIEWBOX_H });
  }
  return out;
})();

/**
 * ❌ ⚠️ **`MAP_MAX_W` was here and is DELETED, 2026-08-15, on the owner's
 * instruction: the drawing fills the frame it is in.**
 *
 * It was `600 * MAP_ASPECT` — a **max-width** rather than a max-height, because
 * clamping the height of a `width: 100%` box breaks the aspect ratio the marker
 * alignment depends on while clamping the width preserves it. NYC is very nearly
 * square in Mercator (MAP_ASPECT ≈ 1.01), so left to itself under that rule the
 * map took a full column-width of vertical space.
 *
 * ⚠️ **The reason it existed is unchanged and is now served differently.** The
 * ratio still may not be broken; what replaced the cap is a width computed
 * against the frame's own height with `min()`, so both axes bind and neither
 * one is clamped into violating the ratio. See the surface's `style` below.
 *
 * ⚠️ **The number itself is dead and must not come back as a floor.** A drawing
 * that fills its frame has no business carrying a figure measured against a
 * 1320px page that no longer exists.
 */

/**
 * The ring a selected marker wears, shared by both pins and diamonds.
 *
 * ⚠️ **It is deliberately not derived from the marker's own colour**, which is
 * what it used to be (`color-mix(… ${colour} 35% …)`). A pin's colour is a claim
 * about water and a halo is a claim about the cursor, and mixing the two meant
 * the depth band got 35% louder around whichever instrument a reader pressed
 * — including a green `clear` pin, on a flood map (the never-safe rule). `--wl-select`
 * is on no scale in this app, so the halo can say "this one" and nothing else,
 * and the marker's own fill and border stay the only things carrying a depth.
 *
 * One constant rather than two literals because the two markers have to stay
 * identical: pressing a pin and pressing a diamond are the same gesture on the
 * same drawing, and a halo that differed between them would read as a
 * distinction that does not exist.
 *
 * 45% rather than the old 35%: magenta at this size is a thin rim against a
 * dark ground, and the previous value was tuned against fills as bright as the
 * emergency red. Measured against the slate `--wl-gauge` diamond, which is the
 * faintest marker on the map and therefore the one that sets the floor.
 */
const SELECT_HALO =
  "0 0 0 3px color-mix(in srgb, var(--wl-select) 45%, transparent)";

/**
 * ⚠️ **Every marker layer must be `pointer-events-none`, and every marker
 * `pointer-events-auto`. This is a correctness rule, not a nicety.**
 *
 * Each layer is a `<ul>` with `absolute inset-0`, so it is a full-size
 * transparent box over the whole drawing — and a positioned box with default
 * `pointer-events` is hit-testable whether or not it paints anything. Stacked,
 * the topmost `<ul>` therefore swallows every click aimed at any layer beneath
 * it, no matter how small the markers in it are.
 *
 * **Measured, and it was already broken before the sensors arrived:** with
 * layers ordered gauges → cameras, `elementFromPoint` over a gauge diamond
 * returned the *camera* `<ul>`, so pressing a diamond on the map did nothing.
 * The gauge cards downstairs still worked, which is exactly why nobody caught
 * it — the feature appeared to be there and only half of it was.
 *
 * Adding a third layer under both made it total: all 425 sensor markers were
 * unclickable on arrival. Turning the layers into pass-through boxes fixes all
 * three at once, and it is the reason a marker's own `<button>` has to turn
 * hit-testing back on explicitly.
 */
const MARKER_LAYER = "pointer-events-none";
const MARKER_HIT = "pointer-events-auto";

/**
 * ⚠️ **Two things on this drawing must NOT scale with the frame, and both are
 * SVG geometry rather than CSS.**
 *
 * Everything inside the `<svg>` is in viewBox units, so shrinking the viewBox
 * to zoom in magnifies it — which is right for the coastline's *shape* and
 * wrong for its *stroke*. A 1.5-unit stroke at ×12 is an eighteen-pixel
 * coastline, and 427 CSO dots at `r=3.5` become blobs that read as a layer of
 * something rather than as points.
 *
 * - the coast takes `vectorEffect="non-scaling-stroke"`, so the line stays
 *   1.5 device pixels at every zoom;
 * - the outfall dots take `r={CSO_R * view.w}`, which is the same trick done
 *   by arithmetic because there is no `non-scaling-radius`.
 *
 * ⚠️ **A third thing must not scale and it is not in the SVG at all: the
 * violet lattice.** It is decoration in **screen space** and corresponds to
 * nothing on the ground — that is stated at its own comment and it is why it
 * may never be labelled or ticked. Scaling it with the frame is the first step
 * toward its being read as a scale, because a grid that moves with the map
 * looks like it is measuring the map. It stays a sibling of the SVG on the
 * container, outside every transform.
 *
 * ⚠️ **And marker sizes.** 11px / 15px / 7px and `SELECT_HALO` are what the
 * unreachable-marker table was measured against. **Positions move; sizes do
 * not.**
 */
const CSO_R = 3.5;

/**
 * One camera as this drawing needs it, from either of the two payloads that can
 * supply one.
 *
 * ⚠️ **This type exists because the two payloads carry DIFFERENT CLOCKS, and
 * that is the whole reason a plain union or a cast would be wrong.**
 * `CameraStatus.observed_at` is **our poller's tick** and ages on `freshnessOf`
 * (5m/30m). `CameraEntry.depth_observed_at` is **FloodNet's publication clock**
 * and ages on `sensorFreshnessOf` (1h/3h). Judging one against the other's
 * thresholds already shipped once, when three of four healthy USGS gauges
 * rendered amber on first load.
 *
 * So `freshness` is **already resolved** by the time it reaches this type. The
 * clock is chosen exactly twice, in the two converters below, and nothing
 * downstream can choose it again or choose it wrong.
 *
 * ⚠️ **`tier` is null for a camera off `/api/status`, and that is not the same
 * as `unpaired`.** The 27 watched cameras arrive with no tier information at
 * all — the registry is what carries it — so null means *not asked*, never *no
 * pairing*.
 *
 * ⚠️ **There is no `distance_m` here and there must not be one.** The wire does
 * not carry it, deliberately; see `CameraEntry`.
 */
interface DrawnCamera {
  camera_id: string;
  name: string;
  lat: number;
  lon: number;
  depth_mm: number | null;
  /** `sensor_id !== null`. What separates *no ground truth* from *a reading*. */
  calibrated: boolean;
  sensor_id: string | null;
  /** Resolved against this camera's OWN clock — see above. */
  freshness: Freshness;
  /** The pairing tier, or null when this row came off `/api/status`. */
  tier: PairTier | null;
}

/** A watched camera from `/api/status`, aged on **our poller's** clock. */
function fromStatus(c: CameraStatus, now: number): DrawnCamera {
  const at = parseServerTime(c.observed_at);
  const age = at ? ageSeconds(at, now) : 0;
  return {
    camera_id: c.camera_id,
    name: c.name,
    lat: c.lat,
    lon: c.lon,
    depth_mm: c.depth_mm,
    calibrated: c.calibrated,
    sensor_id: c.sensor_id,
    // A future timestamp is a clock disagreement, not an old reading. It stays
    // on the ramp rather than making a second, wronger claim about the same
    // fact — the rule this pin has always followed.
    freshness: !at || age < 0 ? "fresh" : freshnessOf(age),
    tier: null,
  };
}

/**
 * A registry camera from `/api/cameras`, aged on **FloodNet's** clock.
 *
 * ⚠️ **`sensorFreshnessOf`, never `freshnessOf`, and the distinct field name is
 * the safeguard that gets it here.** The depth on this row is the paired
 * deployment's own reading, published by FloodNet, which runs minutes behind by
 * design — the camera thresholds would paint most of the map permanently amber.
 */
function fromEntry(c: CameraEntry, now: number): DrawnCamera {
  const at = parseServerTime(c.depth_observed_at);
  const age = at ? ageSeconds(at, now) : 0;
  return {
    camera_id: c.camera_id,
    name: c.name,
    lat: c.lat,
    lon: c.lon,
    depth_mm: c.depth_mm,
    calibrated: c.sensor_id !== null,
    sensor_id: c.sensor_id,
    freshness: !at || age < 0 ? "fresh" : sensorFreshnessOf(age),
    tier: c.tier,
  };
}

export function CityMap({
  cameras,
  cameraRegistry,
  cameraFilter,
  onCameraFilter,
  gauges,
  sensors,
  showSensors,
  onToggleSensors,
  showPairs,
  onTogglePairs,
  sensorsLoading,
  selectedId,
  onSelect,
  selectedSensorId,
  onSelectSensor,
  matchingSensorIds,
  origin,
  floodEventMm,
  curbHeightMm,
  selectedGaugeId,
  onSelectGauge,
  className,
}: {
  /**
   * The 27 cameras this poller watches, off `/api/status`.
   *
   * ⚠️ **This is what the page draws AT REST**, and it is why the resting page
   * makes no `/api/cameras` request at all. It is a different SET from
   * `cameraRegistry`, not a subset of it by contract — see `DrawnCamera`.
   */
  cameras: CameraStatus[];
  /**
   * The whole 968-row DOT registry, or null before it has ever arrived.
   *
   * ⚠️ **Null is the resting state and it is not an error.**
   * `use-camera-registry.ts` makes no request until the reader touches the
   * filter, so at rest this is null, the drawing comes from `cameras`, and the
   * page is pixel-identical to the one before this feature existed.
   *
   * ⚠️ **Once it is non-null the drawing comes from HERE, filter or no
   * filter** — including when the reader puts the filter back to its default.
   * Flipping the source back and forth would re-render the whole camera layer
   * on every chip press. The honest cost of the resting arrangement is at the
   * `useState` in `map/page.tsx`: at rest the `paired` chip describes
   * `WATCH_CAMERAS` rather than the `pairs` table.
   */
  cameraRegistry: CameraEntry[] | null;
  /**
   * The reader's two camera facets — pairing tier and borough.
   *
   * ⚠️ **A layer FILTER, and it is sharper than the five layer switches.**
   * Those are binary and their off-state is total, so `HiddenNote` can say
   * *"27 cameras are switched off"* and be complete. This produces **partial**
   * absence — 130 drawn, 838 not — and a reader looking at 130 pins has no cue
   * that 838 are missing. **What makes it legal is `cameraFilterNote` in the
   * footer, not the chips.** Delete that line and this is a control that
   * quietly empties a flood map.
   *
   * ⚠️ **It is not the search box and may never become one.** It changes *which
   * marks are drawn* and never *what a mark says*: selection, `ordered`, the
   * list, the pager and the de-emphasis are untouched, and no tier reaches a
   * marker's colour, size, weight or dash. It must not go into `InstrumentQuery`
   * — `queryIsActive`'s docblock records that folding `origin` in would drop 404
   * of 425 markers to 25% opacity, and this is that failure at four times the
   * scale.
   */
  cameraFilter: CameraFilter;
  onCameraFilter: (f: CameraFilter) => void;
  /** The harbor baseline's five gauges, plotted as their own instrument class.
      `GaugeStatus` has carried lat/lon since the endpoint existed; like the
      cameras' coordinates before the map, nothing read them until now. */
  gauges: GaugeStatus[];
  /** All 425 FloodNet deployments. Empty until the layer has been switched on
      once — `use-sensors.ts` does not fetch before then. */
  sensors: SensorStatus[];
  showSensors: boolean;
  onToggleSensors: () => void;
  /**
   * Whether to draw a line from each camera to its paired sensor.
   *
   * ⚠️ **This gates the same `/api/sensors` fetch `showSensors` does, and the
   * reason is not obvious.** `CameraStatus.sensor_id` is an **id, not a
   * coordinate** — the paired sensor's lat/lon is only on that payload. So the
   * caller must fold this into `sensorsWanted` alongside the sensor layer, or
   * pressing it draws nothing forever.
   *
   * ⚠️ **Every link is the same line.** Colour, weight, dash and opacity are
   * constant across every depth either instrument can report, across staleness,
   * `plausible`, `calibrated` and `alert_permitted` — a connector encodes none
   * of them, because **a pairing gates nothing.** It means only that this
   * sensor's depth labels that camera's view.
   */
  showPairs: boolean;
  onTogglePairs: () => void;
  /**
   * Whether `/api/sensors` is in flight.
   *
   * ⚠️ **It gates the pair layer's own footer line**, so a fetch in progress
   * cannot render as a missing pairing. Without it, pressing `pairs` gives a
   * second of no lines with no explanation, which reads as the control not
   * working — and a one-frame *"27 pairings are not drawn"* flash on the way.
   */
  sensorsLoading: boolean;
  selectedId: string | null;
  onSelect: (cameraId: string) => void;
  selectedSensorId: string | null;
  onSelectSensor: (sensorId: string) => void;
  /**
   * The sensors matching the list's current query, or null when no filter is
   * on. Non-matching markers **de-emphasise**; nothing is ever removed.
   */
  matchingSensorIds: Set<string> | null;
  /**
   * The address the reader gave, or null. Drawn as a crosshair and nothing
   * else — it filters nothing, de-emphasises nothing and selects nothing.
   *
   * ⚠️ **It is deliberately NOT part of `queryIsActive`**, so an address does
   * not put 404 of 425 markers at 25% opacity. See that function.
   */
  origin: Origin | null;
  /** Both borrowed thresholds. `DepthBand` is arithmetic against them and they
      are never hard-coded on this side — see `lib/depth-band.ts`. */
  floodEventMm: number;
  curbHeightMm: number;
  /** Shared with `harbor-baseline.tsx`: the lit diamond and the flipped gauge
      card are one piece of state, so either surface answers both questions. */
  selectedGaugeId: string | null;
  onSelectGauge: (gaugeId: string | null) => void;
  /** Layout only — the mobile sheet layout gives the map the first screen.
      The panel's own chrome is not the caller's to restyle. */
  className?: string;
}) {
  // 15s, matching the status poll and `camera-card.tsx`. The thresholds this
  // feeds are 300s and 1800s, so a faster clock buys nothing but re-renders.
  // The gauges' own thresholds are hours (`gaugeFreshnessOf`), so this clock is
  // far faster than they need and costs them nothing.
  const now = useNow(15_000);

  // Off by default. The instruments are the subject of this map; 427 outfalls
  // painted over 27 pins on first load would bury them under the backdrop.
  const [showCso, setShowCso] = useState(false);

  /*
   * ⚠️ **The two layers that ride on `/api/status`, so they are local here.**
   * `map/page.tsx` argues every lifted boolean by naming its second consumer —
   * the bar is *two surfaces or a fetch gate* — and these meet neither. The
   * cameras and the gauges arrive in the payload the whole page already polls,
   * so nothing outside this component needs to know whether they are drawn.
   * `showCso` is the standing precedent.
   *
   * ⚠️ **Both default to `true`, so the first paint is unchanged**: 27 pins and
   * 5 diamonds, exactly as before these switches existed. The 27 instruments
   * this tool operates are the drawing's subject, and a map that opened with
   * them switched off would be answering a question nobody asked.
   *
   * ⚠️ **Nothing here is persisted and persisting it would be a POLICY change,
   * not a code change.** `/terms` §05 promises no cookies, no local storage and
   * no session storage, with a standing measured check that all three are
   * empty. So every default is what a reader gets on every load and a reload
   * resets all five — the same terms `dismissed` and the typed origin are on.
   * **Do not "improve" this with `localStorage`.**
   */
  const [showCameras, setShowCameras] = useState(true);
  const [showGauges, setShowGauges] = useState(true);

  /*
   * The frame. Every position on this drawing is routed through it — the SVG's
   * `viewBox` and all four HTML marker layers.
   *
   * ⚠️ **At `FULL_VIEW` it is arithmetically the identity**, which is what made
   * threading it through a pixel no-op: `toContainer(FULL_VIEW, p)` is `p`, and
   * `svgViewBox(FULL_VIEW)` is byte-identical to the literal that used to be
   * typed here. `tests/viewport.test.ts` asserts both, because a no-op is what
   * makes every measurement after it attributable.
   *
   * ⚠️ **The map CLIPS, it does not CULL.** All 425 markers stay in the DOM at
   * every zoom and the container's `overflow-hidden` paints the frame. Culling
   * would churn `SensorLayer`'s roving-tabindex index arithmetic on every pan
   * frame and rebuild hundreds of nodes for nothing.
   *
   * The gestures, the `touch-action` policy and the pointer bookkeeping are all
   * in `lib/hooks/use-map-viewport.ts`, which carries the four decisions.
   */
  const {
    view,
    zoomed,
    ref: surfaceRef,
    surfaceProps,
    zoomIn,
    zoomOut,
    reset,
    showPoint,
  } = useMapViewport();

  /*
   * ⚠️ **The camera layer has TWO sources and exactly one is live at a time.**
   *
   * At rest the registry has never been fetched, so this is the 27 watched
   * cameras off `/api/status` and the filter is not applied to anything. Once
   * the registry has arrived it is the source, filtered — including when the
   * filter is back at its default. See the `cameraRegistry` prop.
   *
   * ⚠️ **The clock is chosen inside the two converters and nowhere else.** The
   * two payloads carry different clocks and `DrawnCamera` arrives with
   * `freshness` already resolved, precisely so nothing below can pick the wrong
   * one. Do not add a raw timestamp to that type.
   *
   * Derived during render like the four filters under it — see the memoisation
   * note at `pairs`.
   */
  const drawnCameras: DrawnCamera[] =
    cameraRegistry === null
      ? cameras.map((c) => fromStatus(c, now))
      : applyCameraFilter(cameraRegistry, cameraFilter).map((c) =>
          fromEntry(c, now),
        );

  const plotted = drawnCameras.filter((c) => inViewport(c.lon, c.lat));
  const offMap = drawnCameras.length - plotted.length;

  /*
   * ⚠️ **The camera layer is SPLIT IN TWO, and the split is a claim about what
   * a mark is worth rather than a rendering detail.**
   *
   * The layer-order comment below says *densest at the bottom: sensors (425) →
   * gauges (5) → cameras (27)*, on the argument that the sparser and more
   * important a class is, the higher it paints. **That argument is falsifiable
   * the moment the filter can put 316 Manhattan cameras with no sensor into the
   * camera layer** — at which point cameras are the densest class on the drawing
   * and the least informative one, painting over 425 instruments that are
   * actually measuring something.
   *
   * So the ordering is fixed rather than inherited: a camera **with** a paired
   * sensor is an instrument and stays on top; a camera with **none** measures
   * nothing and paints below the sensor rings, above the outfall dots, on the
   * CSO layer's own test. `calibrated` is the same predicate the legend's
   * `camera only, no sensor` key already keys.
   */
  const withSensor = plotted.filter((c) => c.calibrated);
  const withoutSensor = plotted.filter((c) => !c.calibrated);

  const plottedGauges = gauges.filter((g) => inViewport(g.lon, g.lat));
  const offMapGauges = gauges.length - plottedGauges.length;

  /*
   * ⚠️ **No longer gated on `showSensors`, and the gate it lost was standing in
   * for a data-presence check.** The pair layer needs these coordinates with the
   * sensor layer off, and the footer needs the plotted count to say how many
   * rings it is not drawing. With no payload `sensors` is `[]` and both fall to
   * zero on their own, which is what the gate was really buying.
   *
   * ⚠️ **So every consumer that meant "on the drawing" now has to SAY so.** Two
   * did and both are below: `outsideFrame`, which counts instruments outside the
   * frame, and `shownFor`, which moves the frame to a selection. Each used to
   * get the sensor half of that for free.
   */
  const plottedSensors = sensors.filter((s) => inViewport(s.lon, s.lat));
  const offMapSensors = sensors.length - plottedSensors.length;

  /*
   * ⚠️ **Derived during render like the three filters above, deliberately.**
   * `plottedSensors` already walks 425 rows on every pan frame and this is 27
   * lookups against a `Map`. **Do not memoise one of these four without
   * memoising all four** — a lone `useMemo` in this file reads as a fix for a
   * cost nobody measured.
   *
   * The join direction is the trap and it is argued in `lib/geo/pairs.ts`:
   * camera→sensor through `sensor_id`, never sensor→camera through
   * `watched_camera_id`, which names one camera per sensor and would silently
   * drop six of the twenty-seven.
   */
  /* ⚠️ **`drawnCameras`, NOT `cameras`, and that was a real bug the moment the
     layer could be filtered.** Given the unfiltered list this draws a link from
     every paired camera including ones the filter removed — a line to a mark
     that is not there, which is the map inventing an endpoint. `pairLinks` does
     its own `inViewport` check, so the plotted narrowing is not needed here. */
  const pairs = showPairs ? pairLinks(drawnCameras, sensors) : [];
  /* Pairings that exist and cannot be drawn — the sensor is absent from the
     payload, an endpoint is off-map, or the two project to one point. One
     number for all three, because the footer's claim is the same either way.
     ⚠️ Counted over the DRAWN cameras for the same reason: a pairing belonging
     to a camera the reader filtered out is not a pairing this drawing failed to
     draw. */
  const unlinked = showPairs
    ? drawnCameras.filter((c) => c.sensor_id !== null).length - pairs.length
    : 0;

  /*
   * ⚠️ **The map withholds a mark rather than inventing a third one**, and then
   * says how many it withheld.
   *
   * A ring is filled or hollow — there is no legible third state at 7px — so a
   * sensor whose reading the instrument cannot support gets the same hollow ring
   * as one reporting a dry street. That is the honest rendering (the stale-leaves-the-scale rule:
   * a faulted or stale instrument leaves the scale, it is not downgraded), but
   * on its own it is silent about a real difference, and silence on a map reads
   * as "nothing here".
   *
   * So the footer counts them. This is a genuine strengthening of the region the
   * root `CLAUDE.md` calls the weakest in the UI — the map now states something
   * about what its own empty-looking marks mean.
   */
  const unmarked = plottedSensors.filter((s) => s.plausible === false).length;
  const silent = plottedSensors.filter((s) => s.observed_at == null).length;

  /*
   * ⚠️ **Instruments on the drawing that the FRAME is not showing**, for the
   * footer line zoom makes necessary. See `FrameNote`.
   *
   * ⚠️ **THE VOCABULARY RULE, and it is the thing to hold in this file:** *"the
   * mapped area"* always means `NYC_BOUNDS` and *"this frame"* always means the
   * viewport. **The two may never be worded as one thing.** Every counter below
   * this one — `offMap`, `offMapGauges`, `offMapSensors`, `unmarked`, `silent`,
   * and the header's `N plotted` — is about `NYC_BOUNDS` and stays that way.
   * This is the only frame-relative number on the drawing.
   *
   * `margin: 0`, unlike `showPoint`'s default: a marker half under the frame's
   * edge is on screen, and counting it as outside would overstate the number in
   * a sentence about what a reader cannot see.
   */
  /* ⚠️ **Only what is DRAWN, and every term needs its own gate now.** An
     instrument whose layer is switched off does not "sit outside the frame" —
     it is not on the drawing at all, and counting it would overstate a sentence
     about what a reader cannot see. The sensor term used to get this for free,
     because `plottedSensors` was `[]` while the layer was off; it is the full
     plotted set now, so all three say it explicitly. */
  const drawn = [
    ...(showCameras ? plotted : []),
    ...(showGauges ? plottedGauges : []),
    ...(showSensors ? plottedSensors : []),
  ];
  const outsideFrame = zoomed
    ? drawn.filter((i) => !isVisible(view, project(i.lon, i.lat), 0)).length
    : 0;

  /*
   * ⚠️ **The frame follows a selection made somewhere else, and it is a
   * RENDER-PHASE `setState` rather than an effect.**
   *
   * This is React's documented adjust-state-on-prop-change pattern, and it is
   * the only construction that satisfies both of this repo's rules at once. An
   * effect renders once with the **stale frame** first, which puts a lit marker
   * under the wrong neighbourhood for a paint — the exact class of error the
   * rest of this UI is built to avoid, and the same argument `use-history.ts`
   * and `picked` in `map/page.tsx` already make. **It looks like a mistake and
   * it will be "cleaned up" into a `useEffect` by somebody who has not read
   * this.**
   *
   * ⚠️ **The recentre and the `‹ ›` pager are ONE FEATURE.** The pager's
   * guarantee has been unconditional since the sensor layer arrived: it reaches
   * every sensor regardless of stacking, which is what makes 34% of the markers
   * being unclickable survivable. With zoom the pager can now select something
   * the frame is not showing, so the guarantee becomes *reaches every sensor,
   * and the frame follows*. **Gate this or remove it and the pager silently
   * becomes "reaches every sensor and shows you a frame it isn't in".**
   * `selected-detail.tsx` says the same at the pager's end.
   *
   * Two things make it safe rather than jumpy:
   *
   * - It is keyed on the selection, so it fires once per change and not on
   *   every poll.
   * - `showPoint` is a **no-op when the marker is already visible**, and the
   *   no-op returns the SAME OBJECT, so React bails out of the re-render
   *   entirely. Pressing a marker on the drawing therefore moves nothing —
   *   a marker you just clicked is visible by construction.
   */
  const selectionKey = selectedSensorId
    ? `s:${selectedSensorId}`
    : selectedId
      ? `c:${selectedId}`
      : null;
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (selectionKey !== shownFor) {
    setShownFor(selectionKey);
    /*
     * Only what is actually ON the drawing.
     *
     * ⚠️ **BOTH branches carry their own gate now, and the camera one is new.**
     * The sensor branch used to get this free — `plottedSensors` was `[]` while
     * the layer was off, so the lookup found nothing — and that array is the
     * full plotted set since the pair layer needed it. The camera branch has
     * never needed a gate and needs one the moment cameras can be switched off.
     * **Delete either and the pager's guarantee silently becomes "reaches every
     * instrument and shows you a frame it isn't in".**
     *
     * ⚠️ **Switching a layer ON does not re-run this**, because the key is the
     * selection. Select a sensor with the layer off, then switch it on: the mark
     * appears, possibly outside the frame, and nothing moves. That is right — a
     * layer switch is not a selection event, and one that jumped the frame would
     * be a control doing two things.
     */
    const target = selectedSensorId
      ? showSensors
        ? plottedSensors.find((s) => s.sensor_id === selectedSensorId)
        : undefined
      : selectedId
        ? showCameras
          ? plotted.find((c) => c.camera_id === selectedId)
          : undefined
        : undefined;
    if (target) showPoint(project(target.lon, target.lat));
  }

  /*
   * ⚠️ **What the drawing says when a layer is off**, and it is what makes the
   * switches legal rather than a way to quietly empty a flood map.
   *
   * The map already has an idiom for absence: cameras outside the viewport are
   * **counted and named** in the footer, never silently dropped, because a pin
   * quietly missing from a map is indistinguishable from a place with nothing
   * wrong. A switched-off layer is the same shape of absence with a different
   * cause, so it gets the same answer.
   *
   * ⚠️ **The legend structurally CANNOT do this job**, and "grey out the key" is
   * the obvious cheap fix. Its own rule is *zero hides the key — a key for a
   * mark that is not on the drawing is worse than no key* — so the legend goes
   * quieter exactly as the drawing goes emptier.
   *
   * ⚠️ **`NYC_BOUNDS`, like every counter here except `FrameNote`.**
   *
   * Two layers are deliberately NOT listed, and "list all five" is what somebody
   * will symmetrise this to:
   *
   * - **Outfalls never.** An outfall is a permanent fact about the plumbing
   *   rather than an observation, and the layer has been off by default since it
   *   shipped. Naming it here would put a claim about pipes in competition with
   *   a claim about coverage, in a line whose whole job is the second one.
   * - **Pairs never.** Switching pairs off removes no instrument — every pin and
   *   every ring is still drawn. A connector is an annotation on marks that are
   *   still there, so nothing about coverage changes.
   */
  const hiddenLayers: string[] = [];
  if (!showCameras) {
    hiddenLayers.push(`${plotted.length} camera${plotted.length === 1 ? "" : "s"}`);
  }
  if (!showGauges) {
    hiddenLayers.push(
      `${plottedGauges.length} gauge${plottedGauges.length === 1 ? "" : "s"}`,
    );
  }
  if (!showSensors) {
    /* ⚠️ **There may be NO NUMBER here, and a zero is not available.** With the
       sensor and pair layers both off, `/api/sensors` has never been fetched, so
       the map does not know how many rings it is not drawing. `0 sensors are
       switched off` is a measurement where there is none, and it reads as
       *there are no sensors*. (`use-sensors.ts` keeps its last payload when the
       gate closes, so after one fetch the real count is available.) */
    hiddenLayers.push(
      plottedSensors.length > 0
        ? `${plottedSensors.length} sensor${plottedSensors.length === 1 ? "" : "s"}`
        : "the sensor layer",
    );
  }
  /* Every instrument class off. The drawing is a coastline with nothing on it,
     and a list of counts is true without being a refusal. See `HiddenNote`.
     ⚠️ **Widened for the filter**: cameras switched ON but filtered to zero, with
     the other two classes off, is an empty drawing by a different route and it
     gets the same strong paragraph. `drawnCameras`, not `plotted` — an
     instrument outside `NYC_BOUNDS` is already the off-map counters' business. */
  const nothingDrawn =
    (!showCameras || drawnCameras.length === 0) && !showGauges && !showSensors;

  /*
   * ⚠️ **The sentence that makes the camera filter legal.** All of it is
   * produced by `lib/camera-filter.ts` so `tests/camera-filter.test.ts` can
   * sweep the whole generated state set for the words this site may not say —
   * `nws.ts`'s argument, one feature over. **Nothing here composes copy.**
   *
   * It renders whether or not a chip has been touched, because the resting
   * state is exactly where a reader has the least reason to suspect that 941 of
   * the city's cameras are not on the drawing.
   */
  const filterState = {
    filter: cameraFilter,
    registry: cameraRegistry !== null,
    drawn: drawnCameras.length,
    total: cameraRegistry?.length ?? 0,
    /* ⚠️ Over the WHOLE registry, never over the filtered rows. Asked of the
       filtered set it is vacuously false whenever a borough filter matches
       nothing, so every empty borough result would claim the database had not
       been re-bootstrapped. */
    anyBorough: (cameraRegistry ?? []).some((c) => !!c.borough),
  };
  /* ⚠️ **One state object, read by both.** The note and the refusal predicate
     have to be answering about the same thing; two literals here is two places
     for them to disagree about which sentence is on screen. */
  const filterNote = showCameras ? cameraFilterNote(filterState) : null;

  /* The borough picker's options, off the payload and never off `NYC_BOUNDS`'
     names — see `boroughsOfCameras`. Empty until the registry arrives, which is
     what keeps the control from offering a facet it cannot apply. */
  const cameraBoroughs = boroughsOfCameras(cameraRegistry ?? []);

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>Map</PanelTitle>
        <PanelTools>
          {/*
            ⚠️ **The two layer toggles that lived here MOVED onto the drawing on
            2026-08-16**, into `LayerSwitches` at the top right. Five switches do
            not fit a fixed `h-11` bar that also carries a title and this chip —
            the wrap risk at 390px this header has always been warned about,
            arriving for real. See `ZoomControls`, which is on the drawing for
            the same reason, and `LayerSwitches` for the rest of the argument.

            ⚠️ **The outfall toggle's `title` moved BYTE-IDENTICAL**, because it
            is the only place on the page that explains what an outfall is, and
            a move plus a reword in one commit is how a documented string is
            lost.
          */}
          <span
            className="num text-[11px] text-muted-foreground"
            /* ⚠️ Hover-only, so it is a bonus rather than the carrier. What
               says this in a place a phone can read it is the footer's hidden-
               layer line. */
            title={
              showCameras
                ? undefined
                : "The camera layer is switched off. These cameras are on the map and are not drawn."
            }
          >
            {/* ⚠️ **The NUMBER stays true and the WORD changes.** `plotted` is a
                claim about `NYC_BOUNDS` — how many cameras the mapped area
                holds — and that is as true with the layer off as with it on. It
                is `27 plotted` beside an empty map that would be the lie.
                `not shown` is verbatim from the three off-map counters below,
                so the chip and the footer share one phrase.
                ⚠️ Zeroing it was the obvious alternative and it is worse: `0
                plotted` reads as *there are no cameras*, which is a claim about
                the city rather than about a switch. */}
            {/* ⚠️ **The DENOMINATOR lands here the moment the registry has
                arrived**, and this is the cheapest possible statement of what
                is withheld: always-visible chrome, no scrolling, no hover.
                `130 of 968 plotted` says in four words what the footer says in
                three sentences. Before the registry arrives there is no
                denominator to print and none is invented — the same rule the
                footer's resting sentence follows. */}
            {plotted.length}
            {cameraRegistry !== null && showCameras && (
              <> of {cameraRegistry.length}</>
            )}{" "}
            {showCameras ? "plotted" : "not shown"}
          </span>
        </PanelTools>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 p-3">
        <div
          ref={surfaceRef}
          {...surfaceProps}
          /*
           * ⚠️ **The frame IS the box as of 2026-08-15, on the owner's
           * instruction.** It was `width: 100%` under a `MAP_MAX_W` cap of
           * 606px and, for a few hours, a `min()` against its own height — both
           * of which locked the box to `MAP_ASPECT` and centred it, so a track
           * of any other shape left panel background down both sides. It fills
           * the track now and there is no empty space around it.
           *
           * ⚠️ **THE ASPECT LOCK IS GONE FROM THE CSS AND THE MARKER-ALIGNMENT
           * RULE IS NOT.** The rule was: this box's `aspect-ratio` and the SVG's
           * `viewBox` must be the same shape, or `preserveAspectRatio`
           * letterboxes the drawing inside a box the marker percentages know
           * nothing about and every marker drifts by half the letterbox. **That
           * agreement moved into `lib/geo/viewport.ts`** — the hook measures
           * this element and `svgViewBox` and `toContainer` both derive the
           * frame's height from the measurement, through one function. The
           * viewBox is this box's shape by construction, so there is no
           * letterbox to correct for.
           *
           * ⚠️ **So do NOT put `aspect-ratio` back on this element.** A second
           * shape here is the drift bug with a new door, and it would fight a
           * `ResizeObserver` that is reading this element's own rect.
           *
           * ⚠️ `overflow-hidden` is what paints the frame, and it is the CLIP
           * half of clip-do-not-cull. Every marker outside the frame is still
           * in the DOM behind this edge.
           *
           * ⚠️ **The drawing's SIZE changed; its CONTENTS did not.** Marker
           * boxes stay 11 / 15 / 7px — positions move, sizes do not — so the
           * unreachable-marker table was measured against a smaller full view
           * than this and is now pessimistic rather than wrong. **Re-run it at
           * the new full view before quoting a figure from it.**
           */
          className="relative h-full w-full overflow-hidden rounded-md border border-border bg-background"
          style={surfaceProps.style}
        >
          {/*
            The plotting grid under the drawing.
            ⚠️ **Decoration, and it may never be read as a scale.** It is an
            even 46px lattice in screen space — not degrees, not metres, not
            anything projected — so it corresponds to nothing on the ground and
            must never be labelled, ticked, or given a legend cell. What it is
            for is saying "this is a drawing of a city, made by this
            instrument" rather than "this is a photograph of one", which is the
            same claim the hand-drawn coastline already makes.

            Violet at 9% is under the coastline's contrast and well under any
            marker, so nothing on the ramp competes with it. It is a CSS
            background rather than SVG lines on purpose: inside the `<svg>` it
            would share the coordinate space the pins are positioned against
            and could not be changed without someone checking `MAP_ASPECT`.
            Out here it is inert.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(color-mix(in srgb, var(--wl-violet) 9%, transparent) 1px, transparent 1px)," +
                "linear-gradient(90deg, color-mix(in srgb, var(--wl-violet) 9%, transparent) 1px, transparent 1px)",
              backgroundSize: "46px 46px",
            }}
          />

          {/* This viewBox is the container's own shape, and they have to be the
              same: the pins below are HTML positioned in percentages of the
              container, and any letterbox between the two would offset every
              one of them.

              ⚠️ **The agreement used to be a CSS `aspect-ratio` on the
              container matching a constant, and it is arithmetic now.** The
              container fills its track, the hook measures it, and `svgViewBox`
              and `toContainer` derive the frame's height from that one
              measurement through one function. **There is still exactly one
              number, and it is still impossible for these two to disagree** —
              what changed is that the number is read off the DOM instead of
              being pinned by CSS. See `lib/geo/viewport.ts`. */}
          <svg
            viewBox={svgViewBox(view)}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d={LAND_PATH}
              fill="var(--wl-land)"
              stroke="var(--wl-coast)"
              strokeWidth={1.5}
              /* ⚠️ Without this the coastline is eighteen pixels wide at ×12.
                 See the counter-scale docblock at `CSO_R`. */
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />

            {/* Outfalls sit above the land and below the pins — they are where
                the combined sewers discharge, which is a fact about the city
                rather than a reading from it. Rendered only when asked for, so
                the 427 nodes are not in the tree at all by default. */}
            {showCso &&
              CSO_POINTS.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  /* The radius counter-scales by hand, because SVG has no
                     `non-scaling-radius`. 427 dots at a fixed `r` turn into
                     blobs the moment the frame tightens. */
                  r={CSO_R * view.w}
                  fill="var(--wl-cso)"
                  fillOpacity={0.75}
                />
              ))}

            {/*
              ⚠️ **The pairings, drawn.** Topmost inside the SVG, so above the
              outfall dots and under every HTML marker layer.

              - **Above the outfalls** because instruments paint above
                infrastructure everywhere else on this drawing, and because a
                link crossing a shoreline run of 427 dots would otherwise vanish
                into it.
              - **Under both endpoint markers, by construction** — the whole
                `<svg>` is under all four marker `<ul>`s. A line drawn over a
                7px ring obscures the one thing that ring's fill says.
              - **Inside this `<svg>` rather than as a new overlay**, because it
                already carries `viewBox={svgViewBox(view)}`. Drawing these in
                container-percentage space would be somebody re-deriving the
                frame agreement locally, which is the letterbox drift with a new
                door. Same call the CSO circles make.

              ⚠️ **Non-interactive, and nothing in here may turn hit-testing back
              on.** A `<line>` with a stroke IS hit-testable by default, and the
              next person will want to make one hoverable to name the pair. There
              is no `<title>`, no handler and no `pointer-events` below this
              attribute; `aria-hidden` is inherited from the `<svg>`.
            */}
            {showPairs && (
              <g
                pointerEvents="none"
                stroke="var(--wl-pair)"
                /* Thinner than the coastline's 1.5: the coast is the drawing's
                   structure and this is an annotation on it. */
                strokeWidth={1}
                /* At full strength, 27 lines across five boroughs read as a
                   network diagram laid over the city. */
                strokeOpacity={0.7}
                /* ⚠️ **The dash is doing work, not decoration.** The only other
                   line on this drawing is the coastline, so a solid 1px line in
                   a second hue could read as a street or a watercourse — as
                   BASEMAP. A dashed line cannot: dashed means a link, never a
                   physical edge. */
                strokeDasharray="3 2"
                /* ⚠️ `butt`, never `round`. A round cap on a very short link
                   draws a DOT, and a filled dot on this map means a sewer
                   outfall. `pairLinks` also drops coincident endpoints; this is
                   the second half of the same guard. */
                strokeLinecap="butt"
              >
                {pairs.map((l) => (
                  <line
                    key={pairKey(l)}
                    x1={l.from.x * VIEWBOX_W}
                    y1={l.from.y * VIEWBOX_H}
                    x2={l.to.x * VIEWBOX_W}
                    y2={l.to.y * VIEWBOX_H}
                    /* ⚠️ **On the LINE, not on the `<g>`.** `vector-effect` is
                       not an inherited property, so on the group it silently
                       does nothing and a 1-unit stroke at ×12 is a twelve-pixel
                       rope between two markers. The coastline's rule, one
                       element over. */
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
          </svg>

          {/*
            ⚠️ **Layer order was densest at the bottom: sensors (425) → gauges
            (5) → cameras (27).** The sparser and more important a marker class
            was, the higher it painted, so the twenty-seven instruments this tool
            actually operates stayed reachable through the crowd rather than
            disappearing under four hundred rings.

            ⚠️ **The camera filter FALSIFIED that as a claim about cameras, so
            the ordering is now a claim about what is DRAWN.** Manhattan +
            `not paired` puts 316 marks in the camera layer — the densest class
            on the drawing and the least informative one, painting over 425
            instruments that are actually measuring something. So the layer is
            split on `calibrated`:

              outfalls (SVG) → cameras with NO sensor → sensors (425)
                → gauges (5) → cameras WITH a sensor

            A camera with no paired sensor measures nothing, which is the CSO
            layer's own test for being backdrop rather than instrument. **`not
            paired` is the case that would otherwise falsify the whole
            ordering.**

            ⚠️ **BOTH `<ul>`s are `MARKER_LAYER` with `MARKER_HIT` on every
            marker, and this is the highest-risk line in the change.** A second
            `absolute inset-0` box without the pass-through is the trap
            `MARKER_LAYER` documents, and it has already broken the gauge
            diamonds once and all 425 sensor markers once.
          */}
          {showCameras && (
            <ul className={cn(MARKER_LAYER, "absolute inset-0 m-0 list-none p-0")}>
              {withoutSensor.map((camera) => (
                <MapPin
                  key={camera.camera_id}
                  camera={camera}
                  view={view}
                  selected={camera.camera_id === selectedId}
                  floodEventMm={floodEventMm}
                  curbHeightMm={curbHeightMm}
                  onSelect={onSelect}
                  onShow={showPoint}
                />
              ))}
            </ul>
          )}

          {showSensors && (
            <SensorLayer
              sensors={plottedSensors}
              view={view}
              now={now}
              floodEventMm={floodEventMm}
              selectedId={selectedSensorId}
              onSelect={onSelectSensor}
              matching={matchingSensorIds}
              onShow={showPoint}
            />
          )}

          {/*
            Gauges are their own layer, under the camera pins. The instruments
            this tool operates are the subject of the drawing; the gauges are
            the baseline those readings are read against, so they sit behind
            them and are drawn as diamonds rather than circles. Shape is the
            variable that says "different class of instrument" — colour cannot,
            because colour here is the depth band and a gauge may never be
            on it.
          */}
          {showGauges && (
          <ul className={cn(MARKER_LAYER, "absolute inset-0 m-0 list-none p-0")}>
            {plottedGauges.map((gauge) => (
              <GaugeMarker
                key={gauge.gauge_id}
                gauge={gauge}
                view={view}
                now={now}
                selected={gauge.gauge_id === selectedGaugeId}
                onSelect={onSelectGauge}
                onShow={showPoint}
              />
            ))}
          </ul>
          )}

          {/* The upper half of the split — cameras whose view a sensor's depth
              labels. Topmost of the marker layers, where the whole camera layer
              used to be. */}
          {showCameras && (
          <ul className={cn(MARKER_LAYER, "absolute inset-0 m-0 list-none p-0")}>
            {withSensor.map((camera) => (
              <MapPin
                key={camera.camera_id}
                camera={camera}
                view={view}
                selected={camera.camera_id === selectedId}
                floodEventMm={floodEventMm}
                curbHeightMm={curbHeightMm}
                onSelect={onSelect}
                onShow={showPoint}
              />
            ))}
          </ul>
          )}

          {/* Above everything, because it is where the reader is and nothing
              should ever be painted over it. Its own layer for the reason every
              other layer has one — see `OriginMark`. */}
          {origin && <OriginMark origin={origin} view={view} />}

          {/*
            ⚠️ **THE LEGEND IS ON THE DRAWING as of 2026-08-15, top left, read
            downward — on the owner's instruction.** It was a wrapping row in
            `PanelFooter` under the map. Three things about that move:

            - ⚠️ **`pointer-events-none` is a CORRECTNESS rule here, not a
              nicety.** This is a positioned box over the drawing, and a
              positioned box is hit-testable whether or not it paints — the
              exact trap `MARKER_LAYER` documents, which has already killed the
              gauge diamonds once and all 425 sensor markers once. It sits above
              every marker layer, so left alone it would swallow every press in
              the top-left corner of the map. **Nothing in it is interactive**,
              which is what makes taking the events away free.
            - ⚠️ **It is `absolute top-2 left-2`, a SMALL box, and may NEVER be
              `inset-0`** — same rule as `ZoomControls` in the opposite corner.
            - ⚠️ **The height reserve went with the footer and that is a fix
              rather than a loss.** The `min-h` existed because a toggle, an
              address or a filter switching a key on grew the footer and shoved
              the page under the reader. Out here the legend is out of flow and
              pushes nothing at all, so the failure it reserved against cannot
              happen — **the measured 45px / 79px reserves are retired, not
              forgotten.** See `MapLegend`.

            The ground is the panel's own token at 88%, because a legend keyed
            to the drawing has to stay legible over land, over water and over
            the violet lattice alike. It is a surface colour on no scale.
          */}
          <div className="pointer-events-none absolute top-2 left-2 z-30 max-w-[calc(100%-1rem)] rounded-md border border-border bg-[var(--wl-panel)]/88 px-2.5 py-2 backdrop-blur-[2px]">
            <MapLegend
              floodEventMm={floodEventMm}
              curbHeightMm={curbHeightMm}
              /* ⚠️ **TWO camera gates now, because the four band keys and the
                 `camera only, no sensor` key stopped rising and falling
                 together.** With the filter on `not paired`, every drawn camera
                 is hollow neutral and not one wears a band — so four keys would
                 name colours no mark on the drawing is using, which is the
                 legend's own *zero hides the key* rule broken by a filter
                 instead of by a switch. */
              banded={showCameras ? withSensor.length : null}
              unbanded={showCameras ? withoutSensor.length : null}
              gauges={showGauges ? plottedGauges.length : null}
              outfalls={showCso ? CSO_COUNT : null}
              sensors={showSensors ? plottedSensors.length : null}
              pairs={showPairs ? pairs.length : null}
              origin={origin !== null}
              queryActive={matchingSensorIds !== null}
            />
          </div>

          {/*
            ⚠️ **The five layer switches, opposite the legend.** The left column
            says what the marks mean; this one says which are drawn.
          */}
          <LayerSwitches
            cameras={showCameras}
            onToggleCameras={() => setShowCameras((v) => !v)}
            cameraFilter={cameraFilter}
            onCameraFilter={onCameraFilter}
            cameraBoroughs={cameraBoroughs}
            sensors={showSensors}
            onToggleSensors={onToggleSensors}
            pairs={showPairs}
            onTogglePairs={onTogglePairs}
            gauges={showGauges}
            onToggleGauges={() => setShowGauges((v) => !v)}
            cso={showCso}
            onToggleCso={() => setShowCso((v) => !v)}
          />

          <ZoomControls
            zoomed={zoomed}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={reset}
          />
        </div>
      </div>

      {/*
        ⚠️ **The legend left this footer for the top left of the drawing** on
        2026-08-15, so what is left here is prose and every line of it is
        conditional. **The footer is gated on one of them being there**, because
        an empty bordered strip under the map reads as something that failed to
        load — and it would now be the resting state rather than a rare one.

        ⚠️ **Every line below opens with `mt-2 border-t pt-2`**, which was a
        separator from the legend above it. With the legend gone the first one
        rendered would draw a stray rule against the footer's own border, so the
        footer strips it off whichever line happens to be first. **A new line
        added here inherits that for free; one that does not open with those
        three classes has to be checked by eye.**
      */}
      {/*
        ⚠️ **The gate is effectively RETIRED as of 2026-08-16 and it stays in the
        code anyway.** The sensor layer is off at rest, so `hiddenLayers` is
        non-empty on every load and this boolean is true before a reader touches
        anything. It stays because the all-layers-on state is reachable in one
        press, and because the resting state now has a real sentence in it rather
        than the empty bordered strip this gate was built to prevent.

        ⚠️ **A permanently-present footer SPENDS DRAWING HEIGHT.** This `Panel`
        is a flex column with a `shrink-0` footer, so the body loses that height
        at every breakpoint. That is a measured reserve being spent by a change,
        which is the exact shape of the depth band's 17px — **measure the
        drawing at rest, both widths, before and after.**
      */}
      {(hiddenLayers.length > 0 ||
        filterNote !== null ||
        zoomed ||
        origin !== null ||
        (showSensors && (unmarked > 0 || silent > 0)) ||
        (showPairs && (sensorsLoading || unlinked > 0 || pairs.length > 0)) ||
        (showCameras && offMap > 0) ||
        (showGauges && offMapGauges > 0) ||
        (showSensors && offMapSensors > 0)) && (
      <PanelFooter className="[&>*:first-child]:mt-0 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0">
        {/* ⚠️ FIRST, above `FrameNote`. What a reader has switched off is the
            most consequential thing this footer can say about why the drawing
            looks the way it does. */}
        <HiddenNote
          layers={hiddenLayers}
          nothingDrawn={nothingDrawn}
          filterNote={filterNote}
          filterRefuses={cameraFilterRefuses(filterState)}
        />

        {/* ⚠️ ONE SLOT for both frame-dependent lines, and its height does not
            change with the frame. Two footer lines used to toggle on `zoomed`
            in opposite directions, and a footer line is IN FLOW: the drawing is
            the `flex-1` between a fixed header and this, so a paragraph
            appearing here shrinks the drawing and drags the bottom-anchored
            zoom cluster up with it. **Pressing `+` moved the `+`.** See
            `FrameLine`. */}
        <FrameLine
          zoomed={zoomed}
          outside={outsideFrame}
          reserve={drawn.length}
          pairsDrawn={
            showPairs && !sensorsLoading && pairs.length > 0
              ? pairs.length
              : null
          }
        />

        {/*
          The pair layer's own two lines. Both are `--muted-foreground` and
          neither takes `--wl-stale`: a camera whose `sensor_id` is not in
          `/api/sensors` is a gap in the registry, not a feed that has moved.
          Same category as `unmarked` and `silent` below.
        */}
        {showPairs && sensorsLoading && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            The sensor list has not arrived. No pairing is drawn yet.
          </p>
        )}

        {showPairs && !sensorsLoading && unlinked > 0 && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span className="num">{unlinked}</span> pairing
            {unlinked === 1 ? " is" : "s are"} not drawn. The paired sensor is
            not on this drawing.
          </p>
        )}

        {/*
          ⚠️ **MEASURED 2026-08-16, and it is the reason this line exists: at
          full view every link is about a PIXEL long.** All 27 came out between
          0.11px and 1.31px on a 650px-wide drawing, median 0.75, seventeen of
          them under one pixel.

          That is not a defect in the layer, it is what a pairing IS.
          `cameras.MAX_PAIR_M` is 250 m and full view is roughly 75 m/px, so a
          co-located camera and sensor are three pixels apart at the very most
          and usually one. **The switch therefore looks like it does nothing on
          the view every reader opens in**, which is the outfall toggle's own
          recorded failure — a control that read as a caption, so 427 outfalls
          were a feature nobody found.

          So the drawing says what it cannot show, which is this footer's whole
          job. It renders only at full view, on `FrameNote`'s rule inverted:
          that line speaks only while zoomed because at full view its sentence
          would be a claim about nothing, and this one speaks only at full view
          because zoomed in the links are plainly visible and the sentence would
          be false.

          ⚠️ **The fix to refuse is a MINIMUM LENGTH on the line.** Drawing a
          link longer than the distance it spans would put two instruments
          further apart than they are, on a map, to make a control feel
          responsive. The count is the honest signal that the layer worked.

          ⚠️ **It MOVED into `FrameLine` on 2026-08-17** and is `PairsDrawnNote`
          there. It is the other half of the pair that toggles on `zoomed`, so
          it has to share `FrameNote`'s slot or the slot cannot hold its height.
        */}

        {/*
          ✅ ⚠️ **Invariant 17 is partially back on the drawing, in the one place
          the root `CLAUDE.md` says it should go** — under the legend grid, not
          in a disclosure and not in a tooltip.

          It is here because the crosshair invites exactly the reading invariant
          17 forbids, and invites it harder than an empty map does: *the
          crosshair is me, there are no rings near it, so nothing is happening
          near me.* A mark that says "you are here" turns surrounding emptiness
          from unremarkable into reassuring.

          ⚠️ **This does NOT close the removal entry** in the root `CLAUDE.md` —
          the deleted caption was unconditional and this line is conditional on
          an address having been given, so a reader who never types one still
          gets a legend-less expanse of dark blue with nothing saying what it
          means. That entry is amended to *partially, and only when an address
          has been given*, and it stays on the list.
        */}
        {origin && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            The crosshair is where you searched, not an instrument — nothing is
            measured there. Empty space around it is unobserved, not clear.
          </p>
        )}

        {/*
          ⚠️ **What the drawing could not say, said in words.** A hollow ring
          means "not over the threshold", and it means that identically for a
          sensor reading 0mm, one whose rangefinder has faulted, and one that
          has never reported at all. There is no legible third mark at 7px, so
          the map withholds rather than inventing one — and then states what it
          withheld, because an unexplained absence on a map reads as nothing
          being there.

          This is the strongest invariant-17-shaped statement currently on the
          drawing. Do not remove it to save a line.
        */}
        {showSensors && (unmarked > 0 || silent > 0) && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {unmarked > 0 && (
              <>
                <span className="num">{unmarked}</span> sensor
                {unmarked === 1 ? " is" : "s are"} reporting a depth their
                instrument cannot support and {unmarked === 1 ? "is" : "are"} not
                marked.{" "}
              </>
            )}
            {silent > 0 && (
              <>
                <span className="num">{silent}</span> ha
                {silent === 1 ? "s" : "ve"} not reported at all.
              </>
            )}
          </p>
        )}

        {/*
          Cameras outside the drawn viewport are counted and named, never
          silently dropped — a pin quietly missing from a map is
          indistinguishable from a place with nothing wrong. Measured: all 968
          DOT cameras and all 425 FloodNet sensors sit inside NYC_BOUNDS with
          margin, so this should read zero forever. It firing means an upstream
          feed has moved, not that the viewport is too small.

          ⚠️ **Each is gated on its own layer as of 2026-08-16.** With a layer
          switched off, *"3 sensors outside the mapped area are not shown"* is
          true and useless — nothing in that class is shown, and the sentence
          competes with the hidden-layer line above for the same reader. The
          sensor one had this behaviour already, for free, because
          `plottedSensors` was empty while the layer was off; the gate is
          explicit now that the array is not.
        */}
        {showCameras && offMap > 0 && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-[var(--wl-stale)]">
            {offMap} camera{offMap === 1 ? "" : "s"} outside the mapped area
            {offMap === 1 ? " is" : " are"} not shown.
          </p>
        )}

        {showGauges && offMapGauges > 0 && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-[var(--wl-stale)]">
            {offMapGauges} gauge{offMapGauges === 1 ? "" : "s"} outside the
            mapped area {offMapGauges === 1 ? "is" : "are"} not shown.
          </p>
        )}

        {showSensors && offMapSensors > 0 && (
          <p className="mt-2 border-t border-border pt-2 text-xs text-[var(--wl-stale)]">
            {offMapSensors} sensor{offMapSensors === 1 ? "" : "s"} outside the
            mapped area {offMapSensors === 1 ? "is" : "are"} not shown.
          </p>
        )}
      </PanelFooter>
      )}
    </Panel>
  );
}

/**
 * What zoom does to the strongest standing rule on this drawing.
 *
 * ## ⚠️ Zoom SHARPENS the unobserved-not-clear problem, it does not create it
 *
 * Empty space on this map is **unobserved**. That is already the weakest point
 * in the UI — the unconditional caption saying so was removed, and what is left
 * is conditional on an address. Zoom makes it worse in a specific way: a reader
 * who zooms into a neighbourhood with no FloodNet coverage gets a frame that is
 * empty **because it is small**, and an empty frame reads as *nothing is
 * happening here* far harder than an empty corner of a city-wide drawing does.
 *
 * So the frame says what it is. Three short declaratives, matching the copy
 * voice rather than the older map lines: what this is, how much is missing, and
 * what the emptiness means.
 *
 * ⚠️ **THE VOCABULARY RULE.** *"This frame"* is the viewport. *"The mapped
 * area"* is `NYC_BOUNDS` and belongs to the three off-map counters below.
 * **The two may never be worded as one thing** — a reader who reads "outside
 * the mapped area" about a pan would think instruments had left the city.
 *
 * It is shown only while zoomed, because at full view the frame **is** the
 * mapped area and the sentence would be a claim about nothing.
 *
 * ⚠️ **The `zoomed` GATE moved out of this component and into `FrameLine`, and
 * that is the whole fix.** It used to return `null` at full view, which made the
 * footer one paragraph shorter at full view than zoomed — see `FrameLine` for
 * why a footer paragraph is not a footer's business alone.
 */
function FrameNote({ outside }: { outside: number }) {
  return (
    <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
      This frame is part of the city.{" "}
      {outside > 0 && (
        <>
          <span className="num">{outside}</span> instrument
          {outside === 1 ? " sits" : "s sit"} outside it.{" "}
        </>
      )}
      Empty space here is unobserved.
    </p>
  );
}

/**
 * What the pair layer cannot show at full view. Moved out of `PanelFooter`'s
 * flow on 2026-08-17 so it can share `FrameNote`'s slot; the argument for the
 * sentence itself is at the call site in `PanelFooter`.
 */
function PairsDrawnNote({ n }: { n: number }) {
  return (
    <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
      <span className="num">{n}</span> pairing{n === 1 ? " is" : "s are"} drawn.
      A camera and its sensor share a corner. Each link is about a pixel at full
      view. Zoom in to see one.
    </p>
  );
}

/**
 * ⚠️ **The frame-dependent footer line, in a slot whose height the frame cannot
 * move.** Added 2026-08-17 to fix a real bug: **pressing `+` moved the `+`.**
 *
 * ## What was wrong
 *
 * Two footer paragraphs toggled on `zoomed` in opposite directions — `FrameNote`
 * appeared, `PairsDrawnNote` disappeared. A footer paragraph is **in flow**, and
 * this panel is `PanelHeader` (a fixed `h-11`) above a `flex-1` drawing above
 * this footer. So the footer growing by one line takes that line out of the
 * drawing's height, the drawing re-renders at a new size, and `ZoomControls` —
 * which is `absolute right-2 bottom-2` **of the drawing** — moves with the edge
 * it is anchored to. The reader presses a button and the button walks away from
 * the cursor.
 *
 * ⚠️ **The control cluster was already innocent and stays innocent.** It puts
 * `whole city` FIRST in a bottom-anchored column, so the box grows upward and
 * `+` / `−` hold their own position within it. **The jump was never in
 * `ZoomControls` and a fix applied there would have been a fix in the wrong
 * file.**
 *
 * ## The reserve is a GHOST, not a number
 *
 * ⚠️ **There is no measured literal here and that is deliberate.** The obvious
 * fix is a `min-h` in `lh` units, which is the idiom the retired legend reserve
 * used — and it would be **arithmetic rather than a reading**, on a page behind
 * the session gate that is expensive to measure, at a width that varies with the
 * window. The legend's reserve was broken once by a change with nothing to do
 * with layout, and a literal here would break the same way.
 *
 * So the slot renders every candidate **twice**: once `invisible` in its own
 * grid cell, and once for real. The cells share `[grid-area:1/1]`, so the slot
 * is as tall as the tallest candidate **at whatever width it is being rendered
 * at**, computed by the browser, with no number to go stale. That is
 * `flip-card.tsx`'s construction — *"as tall as the taller face, so neither can
 * be clipped"* — doing a different job.
 *
 * ⚠️ **The ghosts render the SAME components as the real line**, never a copy of
 * their prose. A hand-written ghost string is a second author of this copy, and
 * it would drift silently: the reserve would go on matching a sentence the page
 * had stopped saying.
 *
 * ⚠️ **`reserve` is `drawn.length` and it is the EXACT upper bound**, not a
 * guess. `outsideFrame` filters `drawn`, so it can never exceed that length —
 * the ghost is therefore the longest this sentence can ever be, and it stays
 * correct as the registry grows.
 *
 * ## What this does and does not promise
 *
 * ✅ **The frame cannot move the footer.** Zoom, pan, reset, and a changing
 * `outside` count all resolve inside a slot that was already tall enough.
 * ⚠️ **A LAYER SWITCH still can**, and that is out of scope rather than fixed:
 * `HiddenNote` above and the pair lines below both change with the layer
 * configuration, and turning the pair layer on adds a ghost here. The invariant
 * bought is **height is a function of the layer configuration, never of the
 * frame** — which is the one a reader driving the zoom control experiences.
 *
 * ⚠️ **The cost is a blank strip at full view with the pair layer off**, which
 * is the resting state of this page. It is the height of one `FrameNote` and it
 * is **whitespace, never a bordered box** — the border, the rule and the spacing
 * are on the paragraphs inside the slot, not on the slot. An empty *bordered*
 * strip under the map is the thing `PanelFooter`'s own gating exists to prevent,
 * because it reads as something that failed to load. **Do not move the border up
 * onto the wrapper to tidy the markup.**
 *
 * ⚠️ **If that blank strip is ever unacceptable, the fix is COPY and not
 * layout.** `PanelFooter` has wanted an unconditional *"empty space here is
 * unobserved"* since the map's caption was deleted — `src/components/CLAUDE.md`
 * calls it the weakest point in the UI. A true full-view sentence fills this
 * slot and pays that debt in one move. It is a copy decision and it is not mine
 * to take.
 */
function FrameLine({
  zoomed,
  outside,
  reserve,
  pairsDrawn,
}: {
  zoomed: boolean;
  /** Instruments outside the frame right now. Zero at full view. */
  outside: number;
  /** The largest `outside` can be — `drawn.length`. Sizes the ghost. */
  reserve: number;
  /** Pairings drawn, or null when the pair layer has nothing to say. */
  pairsDrawn: number | null;
}) {
  return (
    /* ⚠️ The `first:` variants keep `PanelFooter`'s own first-child rule
       reaching the paragraphs. That rule is `[&>*:first-child]` — a DIRECT
       child — and the slot is now the direct child, so without these the rule
       would strip spacing off a wrapper that has none and leave a stray top
       rule at the head of the footer. */
    <div className="grid first:[&_p]:mt-0 first:[&_p]:border-t-0 first:[&_p]:pt-0">
      <div aria-hidden="true" className="invisible [grid-area:1/1]">
        <FrameNote outside={reserve} />
      </div>

      {pairsDrawn !== null && (
        <div aria-hidden="true" className="invisible [grid-area:1/1]">
          <PairsDrawnNote n={pairsDrawn} />
        </div>
      )}

      <div className="[grid-area:1/1]">
        {zoomed ? (
          <FrameNote outside={outside} />
        ) : pairsDrawn !== null ? (
          <PairsDrawnNote n={pairsDrawn} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * `+`, `−`, and the way back to the whole city.
 *
 * ## ⚠️ On the drawing, and NEVER `inset-0`
 *
 * A full-size positioned box is hit-testable whether or not it paints, and this
 * cluster sits above the origin crosshair's `z-40` layer — so an `inset-0`
 * wrapper here would swallow every click on the map. That is the same trap
 * `MARKER_LAYER` documents, and it has already broken the gauge diamonds once
 * and all 425 sensor markers once. **This is a small box in a corner and it
 * must stay one.**
 *
 * ## ⚠️ Why it is here and not in `PanelHeader`
 *
 * That header is a fixed `h-11` already carrying two pill toggles and
 * `N plotted`. Three more buttons risk wrapping it at 390px, and a masthead or
 * a chrome bar going to two lines is the failure that cascades into
 * `map/page.tsx`'s hard-coded `sticky top-[53px]`.
 *
 * ## ⚠️ `+` / `−` are the only route that works on every device
 *
 * They may not be dropped later as redundant with the wheel and pinch. Under
 * the cooperative-wheel policy a **mouse-only desktop reader has no wheel
 * zoom** at all, and a touch reader gets reliable pinch only once the frame is
 * already off full view. See `use-map-viewport.ts`.
 *
 * ## The reset renders only while zoomed, and it is labelled
 *
 * `whole city` rather than a glyph: it is the escape hatch from a
 * `touch-action: none` surface on a phone, and an unlabelled icon is the wrong
 * thing to make somebody guess at. It is absent at full view because a control
 * that does nothing is a control that has to be tried.
 */
function ZoomControls({
  zoomed,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    /* ⚠️ A SMALL box. Not `inset-0` — see above. */
    <div className="absolute right-2 bottom-2 z-50 flex flex-col items-end gap-1">
      {zoomed && (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            "cursor-pointer rounded-sm border border-border bg-[var(--wl-panel)] px-2 py-1",
            "font-mono text-[10px] leading-none tracking-[0.08em] text-muted-foreground uppercase",
            "transition-colors hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
          )}
        >
          whole city
        </button>
      )}
      <div className="flex flex-col gap-1">
        <ZoomButton label="Zoom in" glyph="+" onClick={onZoomIn} />
        <ZoomButton label="Zoom out" glyph="−" onClick={onZoomOut} />
      </div>
    </div>
  );
}

/**
 * ⚠️ **The glyph is `aria-hidden` and the name is a real `aria-label`.** A
 * screen reader announcing "plus" over a map says nothing about what it does,
 * and `−` is U+2212 rather than a hyphen so it optically matches the `+`.
 */
function ZoomButton({
  label,
  glyph,
  onClick,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 cursor-pointer items-center justify-center rounded-sm border border-border",
        "bg-[var(--wl-panel)] font-mono text-[13px] leading-none text-muted-foreground",
        "transition-colors hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
      )}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/**
 * The dashed segment that stands for a pairing, as one class string.
 *
 * ⚠️ **Shared by the `pairs` switch and the `camera-sensor pairs` legend key**,
 * so a control and its key cannot end up drawing different marks for one layer.
 * `h-0` with a top border is the whole shape: a `<span>` with a height would be
 * a box, and this has to read as a line.
 */
const PAIR_GLYPH = "h-0 w-3 shrink-0 border-t border-dashed";

/** The legend's half of {@link PAIR_GLYPH}. */
function PairGlyph() {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block", PAIR_GLYPH)}
      style={{ borderColor: "var(--wl-pair)" }}
    />
  );
}

/**
 * The five layer switches, on the drawing.
 *
 * ## ⚠️ A SMALL box in a corner, and NEVER `inset-0`
 *
 * `ZoomControls`' rule, and it binds harder here. The legend at `top-2 left-2`
 * can afford to be a wide box because it is `pointer-events-none`; this one is
 * **interactive and cannot take that escape**, so it sits above the crosshair's
 * `z-40` layer with live hit-testing. An `inset-0` wrapper would swallow every
 * press on the map — the trap `MARKER_LAYER` documents, which has already broken
 * the gauge diamonds once and all 425 sensor markers once.
 *
 * ⚠️ **It is opaque and it blocks.** Marks under it are hidden and unpressable.
 * The `‹ ›` pager still reaches every sensor and the list reaches every camera,
 * which is the same *Equivalent* argument the 15px hit target already runs on.
 *
 * ## ⚠️ Why it is here and not in `PanelHeader`
 *
 * That header is a fixed `h-11`, and three more buttons risk wrapping it at
 * 390px — which cascades into `map/page.tsx`'s hard-coded `sticky top-[49px]`.
 * **The two toggles that WERE in it moved out here on 2026-08-16** for the same
 * reason: five layer switches in one control beat two in the chrome bar and
 * three on the drawing.
 *
 * ## ⚠️ A COLUMN, and it is a measurement rather than a preference
 *
 * Five pills at this idiom are ~395px of pill. That is wider than the ~374px a
 * 390px phone gives the drawing, and at 1440 a row would run into the legend. A
 * column is as wide as its longest label and mirrors the legend opposite it:
 * **the left column says what the marks mean, this one says which are drawn.**
 *
 * ## ⚠️ It is NEVER collapsed, and that is a safety refusal
 *
 * A `layers 3 / 5` trigger would put *which layers are off* one press away, and
 * which layers are off is exactly what this drawing may not go quiet about. It
 * is also the outfall toggle's own recorded failure — a control that read as a
 * caption, so 427 outfalls were a feature nobody found — arriving at a claim
 * about coverage instead of at a backdrop.
 *
 * ## ⚠️ A layer switch is NOT the search box
 *
 * `SensorMarker` refuses to remove a marker because of a **text box**: a query
 * narrows a *list*, and a drawing that dropped marks to follow one would be a
 * drawing whose empty space quietly acquired a meaning nobody chose.
 * `instrument-query.ts` makes the same call about tidality. A layer switch is
 * different in kind — the reader asking for fewer things, in one press,
 * reversible in one press, changing *which marks are drawn* and never *what a
 * mark says*. Selection, `ordered`, the list, the pager and the de-emphasis are
 * all untouched by it. `showCso` and `showSensors` have been exactly this
 * control since they shipped.
 *
 * ⚠️ **What makes it legal is not the toggle. It is the statement.** `HiddenNote`
 * counts and names what is switched off, under the drawing, on every load.
 * **Delete that line and this control becomes the thing those rules forbid.**
 *
 * ## `role="group"`, not `role="toolbar"`
 *
 * Toolbar implies arrow-key navigation, which is not implemented. Five natural
 * tab stops is right at this count — the roving tabindex exists for 425 markers,
 * and 27 camera pins already keep individual stops. Same call `rail-tabs.tsx`
 * makes about `role="tab"`.
 */
function LayerSwitches({
  cameras,
  onToggleCameras,
  cameraFilter,
  onCameraFilter,
  cameraBoroughs,
  sensors,
  onToggleSensors,
  pairs,
  onTogglePairs,
  gauges,
  onToggleGauges,
  cso,
  onToggleCso,
}: {
  cameras: boolean;
  onToggleCameras: () => void;
  cameraFilter: CameraFilter;
  onCameraFilter: (f: CameraFilter) => void;
  /** Borough names off the registry payload. Empty until it arrives. */
  cameraBoroughs: string[];
  sensors: boolean;
  onToggleSensors: () => void;
  pairs: boolean;
  onTogglePairs: () => void;
  gauges: boolean;
  onToggleGauges: () => void;
  cso: boolean;
  onToggleCso: () => void;
}) {
  return (
    /* ⚠️ A SMALL box. Not `inset-0` — see above. The ground is the legend's
       exact ground: this map's vocabulary is *a small bordered shape is an
       instrument*, so five bordered pills carrying filled and hollow glyphs
       floating directly over the city would be five new marks in it. The panel
       ground is what says **this is chrome and it is not on the drawing.** */
    <div
      role="group"
      aria-label="Map layers"
      className="absolute top-2 right-2 z-50 flex flex-col items-stretch gap-1 rounded-md border border-border bg-[var(--wl-panel)]/88 px-2 py-2 backdrop-blur-[2px]"
    >
      {/* Order is DOM order is tab order: the two instrument classes, then the
          link between them, then the baseline, then the infrastructure. `pairs`
          sits directly under the two things it links, so its label is
          self-explaining by position. */}
      <LayerToggle
        on={cameras}
        onClick={onToggleCameras}
        /* ⚠️ **The ONE pill that may not take its layer's colour.** A camera
           pin's colour IS the depth band — `--muted-foreground` /
           `--wl-warning` / `--wl-emergency` — so tinting this control in any of
           the three puts the band on a switch. `--foreground` is on no scale in
           this file. */
        tint="var(--foreground)"
        shape="size-[7px] shrink-0 rounded-full border-2"
        title="The cameras this instrument watches. Switching them off changes nothing about what is measured."
      >
        cameras
      </LayerToggle>

      {/* ⚠️ **Directly under the pill it belongs to, and ONLY while that layer
          is on.** A filter on a layer that is not drawn is a control with no
          effect, and a control with no effect on a map is how a reader concludes
          the map is broken. */}
      {cameras && (
        <CameraFacets
          filter={cameraFilter}
          onChange={onCameraFilter}
          boroughs={cameraBoroughs}
        />
      )}

      <LayerToggle
        on={sensors}
        onClick={onToggleSensors}
        tint="var(--wl-sensor)"
        /* A ring, and the colour is what separates it from the camera circle
           above — which is exactly how the drawing separates the two. */
        shape="size-[7px] shrink-0 rounded-full border-2"
        title="Every FloodNet deployment in the city, not only the ones this page watches. Filled only when a sensor is reporting a believable depth at or above the flood-event threshold."
      >
        sensors
      </LayerToggle>

      <LayerToggle
        on={pairs}
        onClick={onTogglePairs}
        tint="var(--wl-pair)"
        /* `PairGlyph`'s geometry, so the switch, the legend key and the drawing
           cannot fork. See that component. */
        shape={PAIR_GLYPH}
        title="A line from each camera to the sensor whose depth labels its view. A pairing gates nothing."
      >
        pairs
      </LayerToggle>

      <LayerToggle
        on={gauges}
        onClick={onToggleGauges}
        tint="var(--wl-gauge)"
        shape="size-[7px] shrink-0 rotate-45 border-2"
        title="The five tide and stream gauges. Each is on its own datum and none is comparable to another."
      >
        gauges
      </LayerToggle>

      <LayerToggle
        on={cso}
        onClick={onToggleCso}
        tint="var(--wl-cso)"
        shape="size-[7px] shrink-0 rounded-full"
        filled
        /* ⚠️ **Moved BYTE-IDENTICAL from `PanelHeader`.** This string is the only
           place the page explains what an outfall is — the legend cell reads
           just "427 sewer outfalls" — so the registry vintage, the "not
           discharge activity" disclaimer and the what-an-outfall-is clause are
           all here and nowhere else. All three are a hover away and invisible on
           a phone. See `MapLegend`. */
        title={`${CSO_COUNT} combined sewer outfalls — where storm water and sewage discharge together when the pipes fill. Locations from the ${CSO_AS_OF} registry, not discharge activity; this page cannot see when one is running.`}
      >
        sewer outfalls
      </LayerToggle>
    </div>
  );
}

/**
 * One layer switch. The two shipped pills' class string with the hard-coded
 * token lifted into a variable.
 *
 * ## ⚠️ The swatch keeps the SHAPE and the colour carries the state
 *
 * The outfall toggle's own docblock argued its on-state as "a **border**, so it
 * reads as a control at rest" plus "a **swatch that fills**, which is the state
 * itself rather than a restatement of it". The border half is unchanged. The
 * fill half **does not scale to five**, and the reason is this map's own
 * vocabulary: **fill is a channel that is already spoken for** — filled dot is
 * an outfall, hollow ring is a sensor, hollow diamond is a gauge — so a sensor
 * swatch that filled when switched on would draw the outfall's glyph.
 *
 * So the shape is constant and the **colour** is the state. That is a
 * generalisation of the original decision rather than a reversal of it: the
 * swatch is still the state and not a restatement, it still previews its own
 * layer, and every shape survives. The pill keeps its border, its background
 * wash and its ink change on top, so the state is carried three ways over.
 *
 * ⚠️ `aria-pressed` is the half none of this replaces, and it is on the button.
 *
 * ⚠️ **`h-6` is 24px and WCAG 2.5.8's *Equivalent* exception does NOT apply
 * here.** Unlike the sensor markers — reachable from the list and the pager —
 * there is no second route to a layer switch anywhere in this app. So 24px is a
 * **floor**, not a balance point, and if a thumb fails it at 390 the answer is
 * `h-7 sm:h-6` rather than padding.
 */
function LayerToggle({
  on,
  onClick,
  tint,
  shape,
  filled = false,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  /** The layer's own colour, spent on the swatch, the border and the wash. */
  tint: string;
  /** The swatch's geometry. Constant across both states — see above. */
  shape: string;
  /** Whether the swatch's shape is a solid, i.e. the outfall dot. */
  filled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  const off = "color-mix(in srgb, var(--muted-foreground) 40%, transparent)";
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={cn(
        "h-6 w-full justify-start gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors",
        on
          ? "text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
      style={
        on
          ? {
              borderColor: tint,
              background: `color-mix(in srgb, ${tint} 15%, transparent)`,
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className={cn(shape, "transition-colors")}
        style={{
          borderColor: on ? tint : off,
          background: filled ? (on ? tint : off) : undefined,
        }}
      />
      {children}
    </Button>
  );
}

/**
 * The camera layer's two facets — pairing tier and borough — under the pill they
 * narrow.
 *
 * ## ⚠️ It is a FILTER on a layer, and it is sharper than the five switches
 *
 * `LayerSwitches`' whole argument applies and then goes further. A switch is
 * binary and its off-state is **total**, which is what lets `HiddenNote` say
 * *"27 cameras are switched off"* and be complete. This produces **partial**
 * absence — 130 drawn, 838 not — and a reader looking at 130 pins has no cue
 * whatever that 838 are missing. **What makes it legal is the footer sentence,
 * and it is `lib/camera-filter.ts`'s, and it is swept by a test.**
 *
 * ## ⚠️ It is NOT the search box and must not become one
 *
 * It changes *which marks are drawn* and never *what a mark says*. Selection,
 * `ordered`, the list, the pager and the de-emphasis are untouched, exactly as
 * for the five switches. **It may never move into `InstrumentQuery`** —
 * `queryIsActive`'s docblock records that folding `origin` in would drop 404 of
 * 425 markers to 25% opacity, and this is that failure at four times the scale.
 *
 * ## ⚠️ NEVER COLLAPSED
 *
 * `LayerSwitches`' refusal at full force: a `2 of 3 pairings` trigger would put
 * *which cameras are off* one press away, and that is exactly what this drawing
 * may not go quiet about.
 *
 * ## ⚠️ `--foreground`, and nothing on a scale
 *
 * Not `DEPTH_BAND_PIN`'s three — the camera pill already refuses them, because a
 * camera pin's colour **is** the depth band and tinting a control in it would
 * put the band on a switch. And not `--wl-select`, which means *the reader
 * picked this instrument*: a filter is not an instrument. This is the same call
 * `SessionMenu` makes in the masthead.
 *
 * ## ⚠️ `h-6` is 24px and it is a FLOOR here
 *
 * WCAG 2.5.8's *Equivalent* exception does **not** apply — unlike a sensor
 * marker, which the list and the pager both reach, there is no second route to
 * this control anywhere in the app. If a thumb fails it at 390 the answer is
 * `h-7 sm:h-6` rather than padding.
 */
function CameraFacets({
  filter,
  onChange,
  boroughs,
}: {
  filter: CameraFilter;
  onChange: (f: CameraFilter) => void;
  /** Off the payload, never off `NYC_BOUNDS`' names — see `boroughsOfCameras`. */
  boroughs: string[];
}) {
  const toggleTier = (t: PairTier) =>
    onChange({
      ...filter,
      tiers: filter.tiers.includes(t)
        ? filter.tiers.filter((x) => x !== t)
        : [...filter.tiers, t],
    });

  const toggleBorough = (b: string) =>
    onChange({
      ...filter,
      boroughs: filter.boroughs.includes(b)
        ? filter.boroughs.filter((x) => x !== b)
        : [...filter.boroughs, b],
    });

  return (
    /* Indented under the `cameras` pill so the grouping is structural rather
       than a matter of reading order — this is a narrowing of the layer above
       it, not a sixth layer. */
    <div
      role="group"
      aria-label="Camera pairing and borough"
      className="ml-2 flex flex-col items-stretch gap-1 border-l border-border pl-2"
    >
      {PAIR_TIERS.map((t) => (
        <FacetChip
          key={t}
          on={filter.tiers.includes(t)}
          onClick={() => toggleTier(t)}
          title={PAIR_TIER_TITLE[t]}
        >
          {PAIR_TIER_LABEL[t]}
        </FacetChip>
      ))}

      {/* ⚠️ **Nothing renders here until the registry has arrived**, because
          before that this control has no borough names to offer and inventing
          them from `NYC_BOUNDS` would offer a facet whose DOT spelling may
          differ. An empty group is the honest state and the footer says why. */}
      {boroughs.map((b) => (
        <FacetChip
          key={b}
          on={filter.boroughs.includes(b)}
          onClick={() => toggleBorough(b)}
          title={`Cameras DOT files under ${b}. A borough is where a camera is, never a statement about the water in it.`}
        >
          {b}
        </FacetChip>
      ))}
    </div>
  );
}

/**
 * One facet chip. `LayerToggle`'s pill with no swatch and no tint.
 *
 * ⚠️ **No swatch, deliberately.** Every glyph in this cluster previews its own
 * layer's mark, and a tier has no mark — *never colour a distance* closes hue,
 * and its argument (a monotone ramp over distance is a severity ramp built out
 * of coverage) closes dash, weight, size and opacity with it. A chip that drew
 * one would be inventing the treatment this whole feature refuses.
 */
function FacetChip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={cn(
        "h-6 w-full justify-start rounded-full border px-2.5 text-[11px] transition-colors",
        on
          ? "border-foreground text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
      style={
        on
          ? {
              background:
                "color-mix(in srgb, var(--foreground) 12%, transparent)",
            }
          : undefined
      }
    >
      {children}
    </Button>
  );
}

/**
 * What the drawing says when a layer is switched off.
 *
 * ## ⚠️ This is what makes the switches legal
 *
 * The map already has an idiom for absence: instruments outside the viewport are
 * **counted and named** here, never silently dropped, because *a pin quietly
 * missing from a map is indistinguishable from a place with nothing wrong*. A
 * switched-off layer is the same shape of absence with a different cause, so it
 * gets the same answer, unconditionally, on every load.
 *
 * ⚠️ **The legend structurally cannot do this job**, and "grey out the key" is
 * the obvious cheap fix. The legend's own rule is *zero hides the key — a key for
 * a mark that is not on the drawing is worse than no key* — so **the legend goes
 * quieter exactly as the drawing goes emptier**, which is the wrong direction. It
 * is also `pointer-events-none` chrome a reader has learned to read as a key
 * rather than as a statement.
 *
 * ## ⚠️ The all-off case REPLACES the list rather than joining it
 *
 * With every instrument class off, the drawing is a coastline with nothing on
 * it — a picture of New York City with no marks, which reads as *nothing is
 * happening anywhere*. A list of counts is true and is not a refusal, so at that
 * point refusing the reading matters more than counting what is hidden. Three
 * short declaratives: the fact, the refusal, the way out. **The third is not
 * politeness** — a reader who has produced an empty map and does not know why is
 * a reader who thinks the tool broke.
 *
 * ⚠️ **`text-foreground`, and specifically NOT `--wl-stale` or `--wl-dead`.** The
 * three off-map counters take amber because they mean an upstream feed has
 * moved — a **fault**. This is the reader's own switch, and painting a control's
 * consequence in the fault vocabulary is how the fault vocabulary stops meaning
 * anything. There is no "important and not a fault" colour on this page, so it
 * takes the one channel nothing has spoken for: full-strength ink and no hue at
 * all. **The map's emptiest state gets the page's plainest, strongest type.**
 *
 * ## ⚠️ It is EXTENDED for the camera filter, not reused
 *
 * A layer switch is binary and its off-state is total, which is what lets the
 * list above be complete: *"27 cameras are switched off"* accounts for every
 * camera. **The camera filter produces PARTIAL absence** — 130 drawn, 838 not —
 * and a reader looking at 130 pins has no cue whatever that 838 are missing. So
 * the filter gets its own sentence, **first**, because how much of the city is
 * on the drawing is a more consequential fact than which classes are off.
 *
 * ⚠️ **That sentence is `lib/camera-filter.ts`'s and nothing here composes
 * copy.** `tests/camera-filter.test.ts` sweeps the whole generated state set for
 * the words this site may not say and asserts that every non-empty state either
 * prints its denominator or says the registry has not arrived. **That is the
 * property the whole control rests on.**
 */
function HiddenNote({
  layers,
  nothingDrawn,
  filterNote,
  filterRefuses,
}: {
  /** Phrases for the instrument classes that are off, already pluralised. */
  layers: string[];
  /** Every instrument class off — see above. */
  nothingDrawn: boolean;
  /**
   * What the camera filter is not drawing, from `cameraFilterNote`. Null only
   * when the camera layer is off entirely, in which case the list below already
   * accounts for every camera and a second sentence about a subset of nothing
   * would be noise.
   */
  filterNote: string | null;
  /** Whether that sentence is a refusal — `cameraFilterRefuses`. */
  filterRefuses: boolean;
}) {
  if (nothingDrawn) {
    return (
      <p className="mt-2 border-t border-border pt-2 text-xs text-foreground">
        No instrument is drawn. This drawing reports nothing. Switch a layer on
        to see what is being measured.
      </p>
    );
  }
  /* ⚠️ **The filter's sentence is FIRST and it renders on its own**, so the
     resting page carries it with no layer switched off at all. */
  const filter = filterNote && (
    <p
      className={cn(
        "mt-2 border-t border-border pt-2 text-xs",
        filterRefuses ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {filterNote}
    </p>
  );

  if (layers.length === 0) return filter;

  /* "A", "A and B", "A, B and C". */
  const joined =
    layers.length === 1
      ? layers[0]
      : `${layers.slice(0, -1).join(", ")} and ${layers[layers.length - 1]}`;
  /* ⚠️ Sentence case, and it has to be applied HERE rather than baked into the
     phrases. The same phrase is used mid-list — *"27 cameras and the sensor
     layer"* — where a capital would be wrong, and the resting state puts the
     one phrase that starts with a word rather than a digit at the front. */
  const list = joined.charAt(0).toUpperCase() + joined.slice(1);
  /* A single phrase can be either — "the sensor layer is", "27 cameras are",
     "1 camera is". More than one is always plural. */
  const singular =
    layers.length === 1 && !/^\d+ \w+s$/.test(layers[0]) ? "is" : "are";

  return (
    <>
      {filter}
      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        {list} {singular} switched off. A layer that is off says nothing about
        the water.
      </p>
    </>
  );
}

/**
 * Where the reader said they are — the fifth mark on this drawing.
 *
 * The existing vocabulary is **filled dot = outfall, hollow ring = sensor,
 * diamond = gauge, pin = camera**, and every one of them is an *instrument*.
 * This is not one, so it may not look like one.
 *
 * ## ⚠️ A crosshair, and the shape is structural rather than stylistic
 *
 * `✛` — two 1.5px strokes, ~13px, no fill. A crosshair conventionally means
 * *here*: a position, not an observation. The property that matters is that it
 * has **no interior**, so it can never be "filled" — and fill is the variable
 * this map uses for *at or above the threshold* on both the sensor rings and the
 * gauge diamonds. A later change literally cannot push this mark onto that ramp,
 * because there is nothing to fill.
 *
 * ## ⚠️ `--wl-select`, and this is the one place magenta is right for a mark
 *
 * The rule is that a colour beside a reading may not vary with that reading
 * unless it is on a ramp that says so. `--wl-select` means *the reader picked
 * this* — a fact about the reader, not about the water — and an origin is
 * exactly that category and varies with nothing. It also ties this mark to the
 * origin chip in the list's controls strip, the same card ↔ diamond link
 * `selectedGaugeId` establishes.
 *
 * (⚠️ Note this is the *opposite* call from the one `DistanceLine` makes about
 * the printed distance, and the two are consistent: a computed rank is not
 * something the reader picked, and an address they typed is.)
 *
 * ## ⚠️ Not interactive, and its own layer with NO `MARKER_HIT` in it
 *
 * No `<button>`, no `aria-pressed`, no tab stop. There is nothing to select —
 * an address is not an instrument and pressing it could only mean "select the
 * nearest", which is the pager's job and would make the mark a control that
 * silently changes what is on screen.
 *
 * It carries `MARKER_LAYER` (`pointer-events-none`) and **nothing inside it
 * turns hit-testing back on**. That is not tidiness: `city-map.tsx` records that
 * a full-size `absolute inset-0` layer with default `pointer-events` swallowed
 * every click beneath it, which had already silently broken the gauge diamonds
 * and made all 425 sensor markers unclickable on arrival. This layer is on top
 * of all three, so getting it wrong would break the whole map. **The next person
 * will want to make it a button. This is why.**
 *
 * `aria-hidden` with no `sr-only` label, because the origin is already named in
 * text twice — the chip in the controls strip and the line under the legend. No
 * animation either. ⚠️ **`.wl-urgent` has no caller on this map any more** —
 * it was the pulsing halo on a camera with an open `alerts` row, and the
 * on-page alert system was unwired. Nothing on this drawing moves.
 */
function OriginMark({ origin, view }: { origin: Origin; view: Viewport }) {
  /* ⚠️ Defensive, and the same bound `geosearch` and `distanceFromOrigin` use:
     a coordinate this map cannot draw must not be drawn at 200% of the box.
     **`inViewport` is about the CITY and stays that way** — an address outside
     `NYC_BOUNDS` has nowhere on this drawing to go. Whether the mark is inside
     the current FRAME is `isVisible`'s question and is not asked here: the map
     clips rather than culls, so a crosshair the reader has panned away from is
     simply outside the box. */
  if (!inViewport(origin.lon, origin.lat)) return null;
  const { cx, cy } = toContainer(view, project(origin.lon, origin.lat));

  return (
    <div
      aria-hidden="true"
      className={cn(MARKER_LAYER, "absolute inset-0 z-40")}
    >
      <span
        className="absolute block h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
      >
        <span
          className="absolute top-0 bottom-0 left-1/2 w-[1.5px] -translate-x-1/2"
          style={{ background: "var(--wl-select)" }}
        />
        <span
          className="absolute right-0 left-0 top-1/2 h-[1.5px] -translate-y-1/2"
          style={{ background: "var(--wl-select)" }}
        />
      </span>
    </div>
  );
}

function MapPin({
  camera,
  view,
  selected,
  floodEventMm,
  curbHeightMm,
  onSelect,
  onShow,
}: {
  /**
   * ⚠️ **`DrawnCamera`, not `CameraStatus`, and it arrives with its freshness
   * already resolved.** The two payloads a camera can come from carry two
   * different clocks; the choice is made in `fromStatus` / `fromEntry` and this
   * component is deliberately unable to make it again. **Do not put a raw
   * timestamp back on this prop** — the mistake it prevents has shipped once.
   */
  camera: DrawnCamera;
  view: Viewport;
  selected: boolean;
  floodEventMm: number;
  curbHeightMm: number;
  onSelect: (cameraId: string) => void;
  /** Bring this pin into the frame. See `onFocus`. */
  onShow: (p: Point) => void;
}) {
  const point = project(camera.lon, camera.lat);
  const { cx, cy } = toContainer(view, point);
  const freshness = camera.freshness;

  const fresh = freshness === "fresh";
  // Solid means measured and current. Everything else is hollow, and the two
  // reasons for hollow are different claims: no sensor (we never had ground
  // truth) and stale (we had it and it stopped). Both must be distinguishable
  // from a confident reading; neither may be distinguishable from the other by
  // colour alone, which is why the tooltip and the list spell them out.
  const solid = fresh && camera.calibrated;
  const band =
    DEPTH_BAND_PIN[depthBand(camera.depth_mm, floodEventMm, curbHeightMm)];
  const colour = fresh
    ? band
    : freshness === "dead"
      ? "var(--wl-dead)"
      : "var(--wl-stale)";

  return (
    <li
      className={cn("absolute", selected ? "z-20" : "z-0")}
      style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(camera.camera_id)}
        /* The 27 pins keep individual tab stops, so a Tab pass can reach one
           the frame is not showing. Same hole, same close. */
        onFocus={() => onShow(point)}
        title={pinTitle(camera, freshness)}
        className={cn(
          MARKER_HIT,
          "block -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full p-0",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          "focus-visible:ring-offset-background focus-visible:outline-none",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative block rounded-full border-2 transition-[width,height]",
            selected ? "h-[15px] w-[15px]" : "h-[11px] w-[11px]",
          )}
          style={{
            borderColor: colour,
            background: solid ? colour : "var(--background)",
            // ⚠️ The halo is `--wl-select`, NOT `colour`. It used to be the
            // pin's own band colour at 35%, which meant a selected under-threshold pin
            // haloed itself in green — the ramp getting louder at the exact
            // moment a reader presses it, which is the never-safe rule arriving as a
            // selection state. Magenta is on no scale here, so the halo can
            // only mean "this is the one you picked" and the pin's own colour
            // stays the only thing on the ramp. See the token's comment.
            boxShadow: selected ? SELECT_HALO : undefined,
          }}
        />
        <span className="sr-only">{pinTitle(camera, freshness)}</span>
      </button>
    </li>
  );
}

/**
 * All 425 FloodNet deployments, as one keyboard group.
 *
 * ## ⚠️ Why these are HTML buttons when the 427 outfalls are not
 *
 * The CSO layer's docblock rejects HTML nodes for outfalls, and that reasoning
 * **does not extend here.** It turns on the word *interactive*: outfalls are
 * non-interactive backdrop with nothing to select, so 427 buttons would be
 * "real layout work to deliver nothing clickable". A sensor has a detail face
 * and a place in the selection model, so the trade reverses and this follows the
 * pin/diamond pattern instead — real focus rings, real hit targets,
 * `aria-pressed` and a title, without fighting SVG focus semantics. The CSO
 * circles stay in the SVG, unchanged.
 *
 * ## ⚠️ Roving tabindex, not 425 tab stops
 *
 * One tab stop enters the group; arrow keys and Home/End move within it. 425
 * stops between the map and the list is the same class of problem the `inert`
 * rule on `flip-card.tsx` guards against — a Tab pass that runs through
 * hundreds of controls nobody wanted, on the page a screen-reader user is most
 * likely to be navigating in a hurry.
 *
 * The marker carrying `tabIndex={0}` is the selected one, or the first when
 * nothing is selected; every other is `-1`. Camera pins keep their individual
 * stops — 27 is fine, and changing them is out of scope.
 *
 * ## ⚠️ Overlap is real, and making them clickable did not solve it
 *
 * A ~7px ring over ~600px of city means that wherever FloodNet clusters, markers
 * sit on top of each other and the topmost wins. Three mitigations, and only the
 * third actually closes it: hover/focus raises `z-index` so the marker under the
 * pointer comes forward; the selected marker is raised and haloed so it is never
 * buried; and **the `‹ ›` pager in `selected-detail.tsx` reaches every sensor
 * regardless of stacking.** Do not claim the drawing alone is addressable.
 */
function SensorLayer({
  sensors,
  view,
  now,
  floodEventMm,
  selectedId,
  onSelect,
  matching,
  onShow,
}: {
  sensors: SensorStatus[];
  view: Viewport;
  now: number;
  floodEventMm: number;
  selectedId: string | null;
  onSelect: (sensorId: string) => void;
  matching: Set<string> | null;
  onShow: (p: Point) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = sensors.findIndex((s) => s.sensor_id === selectedId);
  // The one marker in the tab order. Falls back to the first so the group is
  // always enterable, including before anything has been selected.
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const move = (to: number) => {
    const buttons = listRef.current?.querySelectorAll("button");
    if (!buttons || buttons.length === 0) return;
    const clamped = Math.max(0, Math.min(buttons.length - 1, to));
    buttons[clamped].focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(listRef.current?.querySelectorAll("button") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(current + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(current - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(buttons.length - 1);
        break;
      // ⚠️ No Escape handler. Nothing here traps focus, so there is nothing for
      // Escape to release — and swallowing it would break the drill popup's
      // dismissal for anyone who happened to be over the map.
    }
  };

  return (
    <ul
      ref={listRef}
      onKeyDown={onKeyDown}
      aria-label="FloodNet sensors"
      className={cn(MARKER_LAYER, "absolute inset-0 m-0 list-none p-0")}
    >
      {sensors.map((sensor, i) => (
        <SensorMarker
          key={sensor.sensor_id}
          sensor={sensor}
          view={view}
          now={now}
          floodEventMm={floodEventMm}
          selected={sensor.sensor_id === selectedId}
          tabbable={i === focusIndex}
          dimmed={matching !== null && !matching.has(sensor.sensor_id)}
          onSelect={onSelect}
          onShow={onShow}
        />
      ))}
    </ul>
  );
}

/**
 * One FloodNet deployment on the map.
 *
 * ## A hollow ring, and never on the depth band
 *
 * ⚠️ **A ring rather than a dot, because the outfall dots are filled and both
 * layers can be on at once.** Two marker classes distinguished only by hue is
 * one colour-blind reader away from meaningless; shape carries it, exactly as
 * the gauge diamond does.
 *
 * The colour is `--wl-sensor`, an explicit alias of `--wl-gauge` — both are
 * instruments deliberately off the depth band, which is what that neutral
 * slate says. Nothing new here is green.
 *
 * ## Filled on one threshold, and it is borrowed
 *
 * Filled **only** when fresh, plausible, and at or above FloodNet's own
 * flood-event definition — the same rule the gauge diamond follows against its
 * own published stage. Stale, dead, implausible or silent: **never filled**
 * (the stale-leaves-the-scale rule). Hollow is the resting state for the same reason
 * `LEVEL_PANEL_BG.clear` is `bg-card`: "nothing to report" must not be rendered
 * as a positive statement.
 *
 * ## ⚠️ De-emphasis, never omission
 *
 * When a query is active, non-matching sensors drop in opacity. **Nothing is
 * ever removed from the drawing.** The distinction is the whole point and it
 * must not be collapsed later: a map that hides instruments because of a text
 * box is a map whose empty space has quietly acquired a new meaning, which is
 * the unobserved-not-clear rule broken by a search field. Lowering opacity removes nothing, so
 * empty space still means "unobserved" — and without it, stepping the pager
 * through a filtered set looks like the selection jumping at random among 425
 * identical rings.
 */
function SensorMarker({
  sensor,
  view,
  now,
  floodEventMm,
  selected,
  tabbable,
  dimmed,
  onSelect,
  onShow,
}: {
  sensor: SensorStatus;
  view: Viewport;
  now: number;
  floodEventMm: number;
  selected: boolean;
  tabbable: boolean;
  dimmed: boolean;
  onSelect: (sensorId: string) => void;
  /** Bring this marker into the frame. See `onFocus` below. */
  onShow: (p: Point) => void;
}) {
  const point = project(sensor.lon, sensor.lat);
  const { cx, cy } = toContainer(view, point);
  const age = sensorAgeSeconds(sensor, now);
  const freshness: Freshness = age == null ? "fresh" : sensorFreshnessOf(age);

  const faulted = sensor.plausible === false;
  const colour =
    freshness === "dead"
      ? "var(--wl-dead)"
      : freshness === "stale"
        ? "var(--wl-stale)"
        : faulted
          ? "var(--wl-stale)"
          : sensor.depth_mm != null && sensor.depth_mm >= floodEventMm
            ? "var(--wl-watch)"
            : "var(--wl-sensor)";

  const solid =
    freshness === "fresh" &&
    !faulted &&
    sensor.depth_mm != null &&
    sensor.depth_mm >= floodEventMm;

  const label = sensorTitle(sensor, freshness, floodEventMm);

  return (
    <li
      /* `hover:z-30` / `focus-within:z-30` raise whichever marker is under the
         pointer or the caret, so a buried ring can at least be surfaced by
         moving over it. The selected one is raised permanently — a selection
         you cannot see is worse than one you cannot click. */
      className={cn(
        "absolute hover:z-30 focus-within:z-30",
        selected ? "z-20" : "z-0",
      )}
      style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
    >
      <button
        type="button"
        aria-pressed={selected}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => onSelect(sensor.sensor_id)}
        /* ⚠️ **Clipping leaves one hole and this closes it: a keyboard-focused
           marker outside the frame is invisible.** Arrowing through 425 rings
           at ×12 would otherwise move a focus ring the reader cannot see, which
           is worse than no roving tabindex at all. A no-op when the marker is
           already in frame, so arrowing within the visible cluster does not
           drag the map along under the caret. */
        onFocus={() => onShow(point)}
        title={label}
        className={cn(
          // ⚠️ **A BIGGER touch target makes this layer LESS usable, and that
          // is measured rather than reasoned.** The padding is invisible, so at
          // this density every pixel of it is hit area taken from a neighbour
          // rather than affordance for this marker — 425 rings over ~600px of
          // city are closer together than a comfortable target is wide.
          //
          // Markers with no reachable point at all, 1440x900, all 425 in view:
          //
          //     padding   box    unreachable
          //     0px        7px    46  (11%)
          //     4px       15px   145  (34%)   ← here
          //     6px       19px   187  (44%)
          //     9px       25px   254  (60%)
          //     12px      31px   297  (70%)
          //     16px      39px   329  (77%)
          //
          // The plan for this feature specified ">= 24px for touch" (WCAG
          // 2.5.8). Taken literally that is the 25px row, and it strands three
          // in five markers. **This is one of the cases 2.5.8's *Equivalent*
          // exception exists for**: the same selection is available from the
          // instrument list, whose rows are full-width and 42px tall, and from
          // the `‹ ›` pager, whose buttons are 24px — so the accessible route
          // to every sensor is a real control that conforms, and the map is the
          // imprecise shortcut rather than the only way in.
          //
          // 15px is the balance taken: double the bare ring, a third of the
          // markers stranded instead of three fifths. **Do not raise it without
          // re-running that table** — and do not lower it to 0 either, which
          // optimises a number at the cost of a target nobody can hit.
          MARKER_HIT,
          "block -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
          "focus-visible:ring-offset-background focus-visible:outline-none",
          "transition-opacity",
          dimmed && !selected ? "opacity-25" : "opacity-100",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative block rounded-full border-2 transition-[width,height]",
            selected ? "h-[11px] w-[11px]" : "h-[7px] w-[7px]",
          )}
          style={{
            borderColor: colour,
            background: solid ? colour : "var(--background)",
            // Same halo as the pins and the diamonds, same constant, same
            // reason — and load-bearing here above all, because this is the
            // densest layer and the halo is what stops a selected marker from
            // being indistinguishable from the four rings on top of it.
            boxShadow: selected ? SELECT_HALO : undefined,
          }}
        />
        <span className="sr-only">{label}</span>
      </button>
    </li>
  );
}

/**
 * The sensor's tooltip. Says what this app does with the instrument, because
 * that is the thing a reader cannot infer from a ring on a map.
 */
function sensorTitle(
  sensor: SensorStatus,
  freshness: Freshness,
  floodEventMm: number,
): string {
  const parts = [sensor.name ?? sensor.sensor_id];
  if (sensor.depth_mm == null) {
    parts.push("no reading");
  } else if (sensor.plausible === false) {
    parts.push(`${depthText(sensor.depth_mm)} — sensor fault, not a depth`);
  } else {
    parts.push(depthText(sensor.depth_mm));
    if (sensor.depth_mm >= floodEventMm) {
      parts.push(`at or above the ${floodEventMm}mm flood-event threshold`);
    }
  }
  // ⚠️ **This clause has been wrong twice** — first "display only", which was
  // false for the ~343 deployments the email watch admits with no pairing at
  // all, then "drives a warning at a watched camera", which went false when
  // the on-page alert system was unwired. It says what a pairing IS now,
  // because a pairing gates nothing: this sensor's depth labels that camera's
  // view. `SensorFace` carries the full argument.
  parts.push(
    sensor.watched_camera_id
      ? "paired to a watched camera"
      : "no paired camera",
  );
  if (freshness === "stale") parts.push("reading is stale");
  if (freshness === "dead") parts.push("no recent reading");
  return parts.join(" — ");
}

/**
 * One tide or stream gauge on the map.
 *
 * ## A diamond, and never on the depth band
 *
 * The camera pins encode a depth band in colour. A gauge cannot: NOAA is referenced
 * to MLLW and each USGS site to its own local datum, so there is no scale these
 * five share, and painting them green at "normal" would be this page saying the
 * harbor is clear — the one claim it may never make (the never-safe rule). So the
 * marker is neutral slate by default and takes colour only from its **own**
 * published threshold, or from having stopped reporting. The shape carries the
 * distinction that colour cannot.
 *
 * ## It ages on the gauge clock, not the camera clock
 *
 * `gaugeFreshnessOf`, never `freshnessOf`. A healthy USGS site runs 21–81
 * minutes behind wall clock by design; the camera thresholds would render every
 * diamond permanently amber, and an indicator that always warns is one nobody
 * reads. Same rule as `harbor-baseline.tsx`, and it is shared code precisely so
 * the map and the panel cannot disagree about whether a gauge is stale.
 *
 * ## Pressing it is the same act as pressing its card
 *
 * `selectedGaugeId` lives in `page.tsx` and drives both this marker's lit state
 * and whether the gauge's card downstairs is showing its datum. Pressing a lit
 * marker clears the selection, so the gesture is reversible from either end.
 */
function GaugeMarker({
  gauge,
  view,
  now,
  selected,
  onSelect,
  onShow,
}: {
  gauge: GaugeStatus;
  view: Viewport;
  now: number;
  selected: boolean;
  onSelect: (gaugeId: string | null) => void;
  /** Bring this diamond into the frame. See `onFocus`. */
  onShow: (p: Point) => void;
}) {
  const point = project(gauge.lon, gauge.lat);
  const { cx, cy } = toContainer(view, point);
  const at = parseServerTime(gauge.observed_at);
  const age = at ? ageSeconds(at, now) : 0;
  const freshness: Freshness = !at || age < 0 ? "fresh" : gaugeFreshnessOf(age);

  const threshold = gauge.minor_flood_ft;
  const above = threshold !== null && gauge.level_ft >= threshold;
  const colour =
    freshness === "dead"
      ? "var(--wl-dead)"
      : freshness === "stale"
        ? "var(--wl-stale)"
        : above
          ? "var(--wl-warning)"
          : "var(--wl-gauge)";

  // Filled only when it is over its own flood stage. A hollow diamond is the
  // resting state for the same reason `LEVEL_PANEL_BG.clear` is `bg-card`:
  // "nothing to report" must not be rendered as a positive statement.
  const solid = freshness === "fresh" && above;
  const label = gaugeTitle(gauge, freshness);

  return (
    <li
      className={cn("absolute", selected ? "z-20" : "z-0")}
      style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : gauge.gauge_id)}
        onFocus={() => onShow(point)}
        title={label}
        className={cn(
          MARKER_HIT,
          "block -translate-x-1/2 -translate-y-1/2 cursor-pointer p-0",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          "focus-visible:ring-offset-background focus-visible:outline-none",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative block rotate-45 border-2 transition-[width,height]",
            selected ? "h-[13px] w-[13px]" : "h-[9px] w-[9px]",
          )}
          style={{
            borderColor: colour,
            background: solid ? colour : "var(--background)",
            // Same halo as a camera pin, same reason — see `CameraPin`. It is
            // load-bearing here for one more: a gauge's resting slate is the
            // colour that says "this is on no ramp", and haloing it in itself
            // was the one selection state that could make a neutral marker look
            // like it had taken a reading.
            boxShadow: selected ? SELECT_HALO : undefined,
          }}
        />
        <span className="sr-only">{label}</span>
      </button>
    </li>
  );
}

/**
 * The gauge's tooltip, and the one place on the map where a level is written
 * out. It always carries its unit and its datum, never another gauge's — see
 * `harbor-baseline.tsx`.
 */
function gaugeTitle(gauge: GaugeStatus, freshness: Freshness): string {
  const unit = gauge.network === "noaa" ? "ft MLLW" : "ft (local datum)";
  const parts = [gauge.name, `${gauge.level_ft.toFixed(2)} ${unit}`];
  const threshold = gauge.minor_flood_ft;
  parts.push(
    threshold === null
      ? "no published flood stage"
      : gauge.level_ft >= threshold
        ? `at or above minor flood (${threshold.toFixed(2)} ft)`
        : `below minor flood (${threshold.toFixed(2)} ft)`,
  );
  if (freshness === "stale") parts.push("reading is stale");
  if (freshness === "dead") parts.push("no recent reading");
  return parts.join(" — ");
}

function pinTitle(camera: DrawnCamera, freshness: Freshness): string {
  const parts = [camera.name];
  parts.push(
    camera.calibrated
      ? depthText(camera.depth_mm)
      : "no co-located sensor, depth unknown",
  );
  /* ⚠️ **The pairing tier renders HERE and nowhere else on the drawing.**
     *Never colour a distance* binds any monotone ramp over distance, not only
     hue, so dash, weight, size and opacity are all closed to it too — every one
     of those channels is already spoken for on this pin, and a tier in any of
     them would be a severity ramp built out of coverage. A `title` is a word.
     Null when this camera came off `/api/status`, which is *not asked* rather
     than *no pairing*. */
  if (camera.tier !== null) parts.push(PAIR_TIER_LABEL[camera.tier]);
  if (freshness === "stale") parts.push("reading is stale");
  if (freshness === "dead") parts.push("no recent reading");
  return parts.join(" — ");
}

/**
 * Four states, and the two hollow ones are not the same thing. Without this the
 * map has three visual variables — colour, fill, ring — and no key to any of
 * them, which is how a legend-less map ends up meaning whatever the viewer
 * already believed.
 *
 * ## ⚠️ It is a COLUMN on the drawing now, top left — 2026-08-15
 *
 * On the owner's instruction. It was a packed wrapping row in `PanelFooter`
 * under the map; it is a vertical list overlaid on the top left of the drawing
 * itself, which is where a map's key belongs and where it costs the drawing no
 * height at all. The two consequences that are rules rather than styling are at
 * the call site (`pointer-events-none`, never `inset-0`) and at the `<ul>`
 * below (the height reserve is retired, not forgotten).
 *
 * ## The row it replaced, and why that shape was chosen — 2026-08-06
 *
 * It was a fixed `grid-cols-4` with each cell stretched to a quarter of a
 * 676px footer, argued for here as "each key at a fixed station". The owner's
 * verdict was that it read as too spread out and uneven — the labels run 5 to
 * 24 characters, so equal columns put a 45px label in a 160px cell and the
 * whitespace landed in random-looking amounts between neighbours. It is now a
 * content-sized wrapping row with a constant gap: every key is exactly as wide
 * as its words, every gap is the same 16px, and the whole block hugs the
 * left edge under the drawing. The old ragged-tail objection lapsed with the
 * instruction.
 *
 * ## ⚠️ Every mark on the map is keyed HERE, in one grid
 *
 * This used to be four camera keys, and the gauge and outfall keys were two
 * further prose lines stacked under it, each with its own rule and its own
 * swatch convention. Three treatments for three things that are all just keys —
 * so the footer read as a legend followed by two footnotes, and the two marks
 * least likely to be understood (a diamond, a dot) were the two presented least
 * like legend entries. They are now cells in the same grid, **on the owner's
 * instruction**, and the old "a fifth key strands one item on a second row"
 * objection is answered by there being a sixth: four and two, not four and one.
 *
 * ⚠️ **The row count does not change when the outfall layer is toggled.** Five
 * cells and six cells are both two rows at `sm` and up, and both three rows
 * below it, so pressing the toggle cannot shift the map above it or the page
 * below it. That is the same no-jump promise the masthead makes, for the same
 * reason, and it is why the outfall key is allowed to be conditional at all.
 *
 * ⚠️ **The outfall key lost its explanatory clause and the toggle gained it.**
 * The line read "427 combined sewer outfalls — where storm water and sewage
 * discharge together when the pipes fill", and that clause was the last thing on
 * the *page* saying what an outfall is; the registry vintage and the explicit
 * "not discharge activity" were already only in the toggle's `title`. All three
 * are now in that title together, which means the whole qualifier is a hover
 * away and invisible on a phone. Recorded rather than dropped silently, like the
 * two removals above it. **If it comes back, it comes back as text under the
 * grid** — the point of it was being unmissable, and a `title` is the opposite.
 */
function MapLegend({
  banded,
  unbanded,
  gauges,
  outfalls,
  sensors,
  pairs,
  origin,
  queryActive,
  floodEventMm,
  curbHeightMm,
}: {
  /** Drawn cameras that HAVE a paired sensor, or null when the layer is off.
      ⚠️ **It gates the three DEPTH BAND keys**, which are camera-only: a camera
      pin takes `DEPTH_BAND_PIN`, and nothing else on this drawing does. A
      sensor at or above flood takes `--wl-watch` and has no curb treatment at
      all, so switching cameras off costs the sensor layer no key it was using.
      (⚠️ That `--wl-watch` ring has no key of its own and never has. It is a
      pre-existing gap, it is not this change's to fix, and it must not be
      closed by loosening these gates.)

      ⚠️ **It is a count of BANDED cameras rather than of all of them**, since
      the camera filter landed. With the filter on `not paired` every drawn
      camera is hollow neutral, so a single camera gate would key three colours
      no mark is wearing. */
  banded: number | null;
  /** Drawn cameras with NO paired sensor, or null when the layer is off. Gates
      the `camera only, no sensor` key on its own, for the mirror-image reason:
      filtered to `paired`, nothing on the drawing wears that glyph. */
  unbanded: number | null;
  /** Plotted gauge count, or null when the layer is off. Zero hides the key — a
      key for a mark that is not on the drawing is worse than no key, because it
      implies a mark to look for. Every gate below is that one rule. */
  gauges: number | null;
  /** Plotted outfall count, or null when the layer is off. Same rule. */
  outfalls: number | null;
  /** Plotted sensor count, or null when the layer is off. Same rule. */
  sensors: number | null;
  /** Links actually DRAWN, or null when the layer is off.
      ⚠️ **Never the number of pairings that exist.** The legend keys marks on
      the drawing; pairings that could not be drawn are the footer's, exactly as
      `plottedSensors` and `unmarked` / `silent` are split. */
  pairs: number | null;
  /** Whether an address has been given. The crosshair cell — see below. */
  origin: boolean;
  /** Whether the list's query is narrowing anything — `queryIsActive`, passed
      down as `matchingSensorIds !== null` so this and the de-emphasis cannot
      disagree. Gates the "not in this search" cell, which only means something
      while markers are actually dimmed. */
  queryActive: boolean;
  /** Both borrowed thresholds, so the two band keys can NAME them. A legend
      that keys a colour without its number leaves a reader to guess what
      "flood" means on a map — and these two figures are the whole of what the
      colours say. Never hard-coded here; see `lib/depth-band.ts`. */
  floodEventMm: number;
  curbHeightMm: number;
}) {
  /* ⚠️ Whether ANY instrument class is on the drawing. Staleness, deadness and
     selection are shared by all three, so their keys go only when all three do.
     Not `pairs` and not `outfalls`: a pairing is an annotation on instruments
     and an outfall is not an instrument at all. */
  const anyInstrument =
    banded !== null || unbanded !== null || gauges !== null || sensors !== null;

  return (
    /*
     * ❌ ⚠️ **THE `min-h` RESERVE IS GONE, and it is retired rather than
     * dropped.** It was `min-h-[79px] sm:min-h-[45px]` — the all-keys-on height
     * of the wrapping row, MEASURED at both widths, and it existed because a
     * toggle, an address or a filter switching a key on grew the footer and
     * moved the whole page under the reader. The depth band broke it once by
     * 17px through a change that had nothing to do with layout, which is what
     * that entry in `components/CLAUDE.md` is about.
     *
     * ⚠️ **The failure cannot happen out here.** This block is absolutely
     * positioned on the drawing (see the call site), so it is out of flow and
     * pushes nothing whatever it grows to. **Reserving height would now reserve
     * it over the map** — an empty box of dark panel painted over the city,
     * which is the opposite of the no-jump promise it was making.
     *
     * ⚠️ **The reserve comes back with the block if the block ever goes back
     * into the footer**, and it comes back MEASURED, at both widths, with every
     * key forced on. Do not restore the literals from git — the key list has
     * changed since they were taken.
     *
     * ⚠️ **A COLUMN as of 2026-08-15, on the owner's instruction.** The keys
     * read downward, one per line, which is what makes twelve of them legible
     * in a corner instead of across a footer. Two things follow from the shape:
     * the block is as wide as its longest label rather than as wide as its
     * container, and **switching a key on now moves the keys BELOW it** — which
     * is why the two band keys, the ones carrying the borrowed numbers, are
     * unconditional and first.
     */
    <ul className="flex list-none flex-col items-start gap-y-1.5 p-0 text-[11px] text-muted-foreground">
      {/* ⚠️ **The two band keys NAME their numbers**, and that is the point of
          them. A colour keyed as "flood" leaves a reader to guess which depth
          that is; the figures are FloodNet's own flood-event definition and
          NYC curb height, and they are the whole of what these colours say.
          Both are interpolated from `/api/status` — never typed here.

          ⚠️ **They stopped being unconditional on 2026-08-16 and they are still
          FIRST.** All four keys below belong to `DEPTH_BAND_PIN`, which only a
          camera pin wears, so with that layer off they key nothing on the
          drawing. Being first is what keeps the block's growth predictable: a
          key switching on moves the keys below it, never the keys above.

          ⚠️ **The gate SPLIT when the camera filter landed.** The three banded
          keys and the `camera only, no sensor` key used to rise and fall
          together, which stops being true the moment the filter can draw a set
          of cameras that are all one or all the other. **The three banded keys
          stay first**, so the ordering property above survives the split. */}
      {banded !== null && banded > 0 && (
        <>
          <LegendItem swatch={<Swatch fill="var(--wl-warning)" solid />}>
            <span className="num">{floodEventMm}</span> mm, flood
          </LegendItem>
          <LegendItem swatch={<Swatch fill="var(--wl-emergency)" solid />}>
            <span className="num">{curbHeightMm}</span> mm, curb
          </LegendItem>
          {/* ⚠️ **Neutral, and it may never be green.** This is the key for
              every reading under 10 mm, and a reassuring swatch here would make
              the map say that most of the city is fine — which it cannot know.
              Under the threshold is the absence of a claim, not a claim of
              absence. */}
          <LegendItem swatch={<Swatch fill="var(--muted-foreground)" solid />}>
            under, measured
          </LegendItem>
        </>
      )}

      {unbanded !== null && unbanded > 0 && (
        <LegendItem swatch={<Swatch fill="var(--muted-foreground)" />}>
          camera only, no sensor
        </LegendItem>
      )}

      {/* ⚠️ Every instrument class takes these two, so they survive any one
          layer going off and go only when all three do. */}
      {anyInstrument && (
        <>
          <LegendItem swatch={<Swatch fill="var(--wl-stale)" />}>stale</LegendItem>
          <LegendItem swatch={<Swatch fill="var(--wl-dead)" />}>
            no recent reading
          </LegendItem>
        </>
      )}

      {/* Selection, keyed at last (screen 2f). A filled `--wl-select` dot —
          the halo's colour, which is a fact about what the reader picked and
          is on no scale (see `SELECT_HALO`).
          ⚠️ **It was unconditional on the premise that "the page always has a
          selection, so the mark is always on the drawing", and THAT PREMISE
          BREAKS the moment every instrument layer is off.** The selection
          survives; the mark does not, and a key for a mark that is not there
          implies a mark to look for. */}
      {anyInstrument && (
        <LegendItem swatch={<Swatch fill="var(--wl-select)" solid />}>
          selected
        </LegendItem>
      )}

      {/* The diamond, at the size and weight the map draws it — the shape is
          what says "not on the depth band", so the key has to carry the
          shape and not just the colour. */}
      {gauges !== null && gauges > 0 && (
        <LegendItem
          swatch={
            <span
              aria-hidden="true"
              className="inline-block h-[9px] w-[9px] shrink-0 rotate-45 border-2"
              style={{ borderColor: "var(--wl-gauge)" }}
            />
          }
        >
          <span className="num">{gauges}</span> tide and stream gauges
        </LegendItem>
      )}

      {outfalls !== null && (
        <LegendItem
          swatch={
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: "var(--wl-cso)", opacity: 0.75 }}
            />
          }
        >
          <span className="num">{outfalls}</span> sewer outfalls
        </LegendItem>
      )}

      {/* The ring, at the size and weight the map draws it. Hollow is the whole
          point of the swatch: it is what distinguishes a sensor from a filled
          outfall dot when both layers are on, and what says this mark is on no
          depth band. */}
      {sensors !== null && (
        <LegendItem
          swatch={
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border-2"
              style={{ borderColor: "var(--wl-sensor)" }}
            />
          }
        >
          <span className="num">{sensors}</span> FloodNet sensors
        </LegendItem>
      )}

      {/* ⚠️ **The dash is the key's whole job**, and `PairGlyph` is shared with
          the switch so the two cannot fork. The only other line on this drawing
          is the coastline, so a solid connector would read as basemap — as a
          street or a watercourse. Dashed means a link.
          ⚠️ **`pairs` is links DRAWN.** Pairings that exist and could not be
          drawn are counted in the footer, never here. */}
      {pairs !== null && pairs > 0 && (
        <LegendItem swatch={<PairGlyph />}>
          <span className="num">{pairs}</span> camera-sensor pairs
        </LegendItem>
      )}

      {/* De-emphasis, keyed (screen 2f). ⚠️ Gated on the QUERY being active,
          not on the origin — an address dims nothing (`queryIsActive`
          excludes it, severely and on purpose), so keying this cell off the
          crosshair would claim the map hides things an address never hides.
          It also needs the sensor layer on, because dimming only applies to
          sensor markers. `opacity-30` approximates the 25% the markers use,
          on the swatch alone. */}
      {queryActive && sensors !== null && (
        <LegendItem
          swatch={
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border-2 opacity-30"
              style={{ borderColor: "var(--wl-sensor)" }}
            />
          }
        >
          not in this search
        </LegendItem>
      )}

      {/* The crosshair, at the size and weight the map draws it. ⚠️ The swatch
          has **no interior** — that is the mark's whole safety property, so a
          key that drew it as a filled glyph would be keying a different mark.
          See `OriginMark`. */}
      {origin && (
        <LegendItem
          swatch={
            <span
              aria-hidden="true"
              className="relative inline-block h-[11px] w-[11px] shrink-0"
            >
              <span
                className="absolute top-0 bottom-0 left-1/2 w-[1.5px] -translate-x-1/2"
                style={{ background: "var(--wl-select)" }}
              />
              <span
                className="absolute right-0 left-0 top-1/2 h-[1.5px] -translate-y-1/2"
                style={{ background: "var(--wl-select)" }}
              />
            </span>
          }
        >
          where you searched
        </LegendItem>
      )}
    </ul>
  );
}

function Swatch({ fill, solid = false }: { fill: string; solid?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[11px] w-[11px] shrink-0 rounded-full border-2"
      style={{ borderColor: fill, background: solid ? fill : "var(--background)" }}
    />
  );
}

function LegendItem({
  swatch,
  children,
}: {
  swatch: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    /* Content-sized and unbreakable inside: the row wraps BETWEEN keys, never
       inside one — a swatch stranded at the end of a line away from its own
       words is a key to nothing. */
    <li className="flex items-center gap-1.5 leading-none whitespace-nowrap">
      {swatch}
      <span>{children}</span>
    </li>
  );
}
