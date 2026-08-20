"use client";

import { DepthReadout, type PeakView } from "@/components/depth-readout";
import { DepthSparkline } from "@/components/depth-sparkline";
import { DepthWindowMenu } from "@/components/depth-window-menu";
import { Panel, PanelHeader, PanelTitle, PanelTools } from "@/components/panel";
import { ReadingAge } from "@/components/reading-age";
import { DepthBandPill } from "@/components/depth-band-pill";
import { depthBand } from "@/lib/depth-band";
import { Step } from "@/components/step-button";
import type {
  AlertStatus,
  CameraEntry,
  CameraStatus,
  IngestBounds,
  SensorStatus,
} from "@/lib/api-types";
import { PAIR_TIER_LABEL } from "@/lib/camera-filter";
import { FAR_M } from "@/lib/geo/distance";
import { ageSeconds, frameUrl, parseServerTime } from "@/lib/format";
import { useDepthPeak } from "@/lib/hooks/use-depth-peak";
import { useHistory } from "@/lib/hooks/use-history";
import { useNow } from "@/lib/hooks/use-now";
import { distanceText } from "@/lib/geo/distance";
import {
  distanceFromOrigin,
  sensorAgeSeconds,
  type Origin,
} from "@/lib/instrument-query";
import { LEVEL_ALERT_BLOCK } from "@/lib/levels";
import {
  freshnessOf,
  sensorFreshnessOf,
  type Freshness,
} from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * Everything known about one instrument. Sits directly under the list it is
 * selected from, in the right-hand column.
 *
 * ## Why it is here and not below the fold
 *
 * It used to be a full-width band under both columns, which meant clicking a
 * row in the list scrolled the answer off screen — the click appeared to do
 * nothing. Selection is the page's one piece of state and three surfaces set
 * it, so the thing it changes has to be visible from the surface that changed
 * it. Stacked under the list, a click on a row moves the panel immediately
 * below the cursor.
 *
 * ## It scrolls rather than growing
 *
 * The body is `overflow-y-auto` inside a `min-h-0 flex-1`, because the panel's
 * height is not its own: the right column is stretched to the map's height and
 * this takes whatever the list above it leaves. A camera with an open alert
 * has three more blocks than one without, and without the scroll that
 * difference would push the column past the map and break the equal frames.
 *
 * The history request is keyed on `camera.camera_id` inside `useHistory`, which
 * aborts the previous one — selection changes faster than the network answers,
 * and without that the last response to land wins rather than the one you
 * clicked.
 *
 * ## ❌ ⚠️ It used to turn over, and it does not any more
 *
 * Pressing the panel flipped it to `NeighborhoodBack` at `size="panel"` — DOHMH
 * rat-inspection rates for this camera's NTA, beside a graffiti rat. **That
 * feature was deleted on 2026-08-14**, with the component, the three wire
 * fields behind it and the generator that produced them.
 *
 * So this panel is a plain `Panel` again: no `FlipCard`, no `turned` state, no
 * `rats ›` handle at the foot of the body, and no panel-wide `onClick`. Two
 * consequences worth knowing rather than rediscovering:
 *
 * - ⚠️ **The panel-wide click is gone, so nothing here swallows a press any
 *   more.** `depth-window-menu.tsx` stops its own root's `onClick` from
 *   bubbling, because opening that popup used to flip this panel mid-press.
 *   **That stop is still correct and must stay** — it is in the component
 *   rather than at the call site precisely so a future mount on a flipping
 *   surface is safe by construction, and `harbor-baseline.tsx` still flips.
 * - ⚠️ **The measured 569.9px / 820px asymmetry between this face and the
 *   sensor face is gone with it.** It existed because only the camera face was
 *   inside `FlipCard`. Both faces are plain panels now, so a future measurement
 *   finding them equal is the fix landing, not a regression.
 */

// ⚠️ **`CONFIDENT_AT` and `confidenceTone` were here and are GONE.** They
// coloured a chip that carried a water-segmentation model's certainty about a
// camera frame. That layer is deleted: a camera measures nothing, so there is
// no confidence to grade and no chip to grade it. The corner across from the
// depth now carries the `FAULT` chip on both faces — see the camera face
// below, which was built to match the sensor face's arrangement.

export function SelectedDetail({
  camera,
  registryCamera,
  sensor,
  alerts,
  floodEventMm,
  curbHeightMm,
  pager,
  cameraFor,
  onSelectCamera,
  watching,
  onToggleWatch,
  watchingCamera,
  onToggleWatchCamera,
  origin,
  ingest,
  onShowGauges,
  windowMin,
  onPickWindow,
  className,
}: {
  camera: CameraStatus | null;
  /**
   * The registry row for a camera this poller does **not** watch, or null.
   *
   * ⚠️ **Only ever set when `camera` is null, and the two are not
   * interchangeable.** A watched camera is in both payloads and gets the full
   * face; this one exists for the other 941, which `/api/status` has never
   * heard of. **Do not merge them with a `??`** — `CameraStatus.observed_at` is
   * our poller's tick and `CameraEntry.depth_observed_at` is FloodNet's
   * publication clock, and a face built from whichever field was present would
   * age one on the other's thresholds. See `DrawnCamera` in `city-map.tsx`.
   */
  registryCamera?: CameraEntry | null;
  /** Set instead of `camera` when the reader has picked a sensor. */
  sensor: SensorStatus | null;
  alerts: AlertStatus[];
  /** Both borrowed thresholds — `DepthBand` is arithmetic against them and
   *  they are never hard-coded on this side. See `lib/depth-band.ts`. */
  floodEventMm: number;
  curbHeightMm: number;
  pager: PagerProps;
  /** The watched camera a sensor drives, for its still. Null for the other 404. */
  cameraFor: CameraStatus | null;
  onSelectCamera: (cameraId: string) => void;
  /** Whether the selected sensor is in the watch set. Sensor face only. */
  watching?: boolean;
  /** Omitted on the landing page, where there is no watch panel to feed. */
  onToggleWatch?: (sensorId: string) => void;
  /** Whether the selected camera is in the camera watch set. Camera face only. */
  watchingCamera?: boolean;
  /** Omitted on the landing page, same rule as `onToggleWatch`. Every camera
   *  this page shows is in `WATCH_CAMERAS`, so there is no refused branch —
   *  the permission question a sensor face has to ask does not exist here. */
  onToggleWatchCamera?: (cameraId: string) => void;
  /** The address the reader gave, or null. Sensor face only — a camera is not
   *  something anybody asks the distance to. Never stored, never sent. */
  origin?: Origin | null;
  /**
   * The poller's own bounds, or null until `/api/status` settles.
   *
   * ⚠️ **Nullable on purpose, and this face renders NOTHING rather than a
   * fallback number.** Every sentence built on it names a bound in words, and
   * a wrong bound stated in words is worse than a bound not yet stated — see
   * the note at `ingest` in `map/page.tsx` for why there is no `?? 600` on
   * this side of the wire.
   */
  ingest?: IngestBounds | null;
  /**
   * Show the harbor gauges. Sensor face only, and only on a tidal one.
   *
   * ⚠️ **This exists because the tidal sentence makes a claim it could not
   * cash.** It says the harbor gauge is evidence about this sensor, and the
   * gauges are on the same rail behind a tab — so a reader was being told
   * where to look and given no way to look there. Optional, because the panel
   * mounts where there is no rail to switch.
   */
  onShowGauges?: () => void;
  /**
   * The depth timeframe, `null` for the current reading. ⚠️ **Owned by
   * `page.tsx`, not by this panel**, because the instrument list sets the same
   * value from its own control — see the note at `setWindowMin` below.
   */
  windowMin: number | null;
  onPickWindow: (minutes: number | null) => void;
  className?: string;
}) {
  const now = useNow(15_000);
  const history = useHistory(camera?.camera_id ?? null);

  /*
    The depth timeframe, `null` for the current reading.

    ⚠️ **It lives HERE rather than on a face, and it deliberately survives a
    selection change.** The window is a fact about what the reader wants to
    know, not about an instrument — so stepping the pager with `last day`
    picked walks 425 instruments asking each the same question, which is the
    workflow the pager exists for (`narrow to Brooklyn, over 10 mm, then press
    ›`). Resetting it per instrument would make the control useless for the
    one thing it is good at, and would also make the panel appear to forget
    what the reader asked seconds earlier.

    ⚠️ It is **not persisted** across a reload, on the picked-set's rule in
    `watch-panel.tsx`: this page keeps no record of what somebody was
    interested in unless they asked it to.

    ⚠️ **It was `useState` HERE and is now a prop, owned by `page.tsx`** — the
    same move `ordered` made and for the same reason: **two surfaces need the
    same value.** The instrument list grew its own copy of this control across
    from the freshness line, and its rows render peaks over the window it sets.
    Two independent states would let the list say `last day` while this panel
    said `current`, over two numbers about the same instrument, side by side.
    One window, two places to set it.
  */
  const setWindowMin = onPickWindow;

  const kind = sensor ? "sensor" : camera ? "camera" : null;
  const instrumentId = sensor ? sensor.sensor_id : (camera?.camera_id ?? null);
  const peakState = useDepthPeak(kind, instrumentId, windowMin);

  // Undefined rather than a null-filled object when no window is picked:
  // `DepthReadout` switches modes on the prop's presence, so the current-reading
  // path stays byte-identical to what it was before this feature.
  const peakView: PeakView | undefined =
    windowMin == null
      ? undefined
      : {
          requestedMinutes: windowMin,
          peak: peakState.peak,
          loading: peakState.loading,
          failed: peakState.error != null,
        };

  if (sensor) {
    return (
      <SensorFace
        sensor={sensor}
        now={now}
        floodEventMm={floodEventMm}
        pager={pager}
        cameraFor={cameraFor}
        onSelectCamera={onSelectCamera}
        watching={watching}
        onToggleWatch={onToggleWatch}
        origin={origin ?? null}
        ingest={ingest ?? null}
        onShowGauges={onShowGauges}
        windowMin={windowMin}
        onPickWindow={setWindowMin}
        peakView={peakView}
        className={className}
      />
    );
  }

  if (!camera && registryCamera) {
    return (
      <RegistryCameraFace
        camera={registryCamera}
        pager={pager}
        className={className}
      />
    );
  }

  if (!camera) {
    return (
      <Panel className={className}>
        <PanelHeader>
          <PanelTitle>Instrument</PanelTitle>
          <PanelTools>
            <InstrumentPager {...pager} />
          </PanelTools>
        </PanelHeader>
        <p className="px-4 py-5 text-sm text-muted-foreground italic">
          Select an instrument on the map or in the list.
        </p>
      </Panel>
    );
  }

  const at = parseServerTime(camera.observed_at);
  const age = at ? ageSeconds(at, now) : 0;
  const freshness: Freshness = !at || age < 0 ? "fresh" : freshnessOf(age);
  const openAlert = alerts.find((a) => a.camera_id === camera.camera_id) ?? null;

  const border = cn(
    freshness === "fresh" && "border-border",
    freshness === "stale" && "border-[var(--wl-stale)]",
    freshness === "dead" && "border-[var(--wl-dead)]",
  );

  return (
    /*
     * ⚠️ **The same root as `SensorFace`, and that is the "must not lurch
     * between kinds" rule made structural rather than promised.**
     *
     * This face was the `front` of a `FlipCard` until 2026-08-14, with a back
     * carrying `NeighborhoodBack`. Both are deleted. What that removed, beyond
     * the feature: an `onClick` on the whole panel, a `turned` state, and the
     * measured 569.9px / 820px height gap between the two faces, which existed
     * only because one of them was wrapped and the other was not.
     */
    <Panel
      aria-label={`Detail for ${camera.name}`}
      className={cn("relative h-full", border, className)}
    >
      {/* The bar carries only what it is for: what this is, where you are in
          the list, and where the depth falls against the two borrowed
          thresholds. It briefly held a `rats ›` flip handle; that went with the
          neighbourhood back, and so did the copy of it at the foot of the
          body. */}
      <PanelHeader>
        <PanelTitle>Instrument</PanelTitle>
        <PanelTools>
          <InstrumentPager {...pager} />
          <DepthBandPill
            band={depthBand(camera.depth_mm, floodEventMm, curbHeightMm)}
            freshness={freshness}
            floodEventMm={floodEventMm}
            curbHeightMm={curbHeightMm}
          />
        </PanelTools>
      </PanelHeader>

      {/*
       * ⚠️ **Stacked: the frame across the full width, everything the panel
       * knows underneath it.** It was two columns — the still at 42% on the
       * left, type on the right — and that stopped working when the workspace
       * became three tracks on 2026-08-05. In a 372px rail, 42% is a **145px**
       * still: back to the 190px thumbnail the two-column layout was invented
       * to escape, and narrower than it. The still is the reason to look at a
       * camera at all, so it takes the width and the stats take the space
       * under it.
       *
       * `aspect-[352/240]` is the DOT frame's **own** ratio, so the still is
       * shown whole rather than cropped — the crop that the `h-full
       * object-cover` version accepted was the price of matching a column's
       * height, and there is no column to match now. `max-h-[300px]` is for the
       * stacked case below `xl`, where the rail is the full page width and an
       * unclamped 3:2 box would be a 700px-tall photograph of a street.
       */}
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex h-full min-h-0 flex-col gap-3">
          {freshness === "dead" ? (
            <div className="flex aspect-[352/240] max-h-[300px] w-full shrink-0 items-center justify-center rounded-md bg-black text-[11px] tracking-[0.07em] text-muted-foreground uppercase">
              no recent frame
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={frameUrl(camera.image_url, camera.observed_at)}
              alt={camera.name}
              className={cn(
                "block aspect-[352/240] max-h-[300px] w-full shrink-0 rounded-md bg-black object-cover",
                freshness === "stale" && "opacity-60 grayscale",
              )}
            />
          )}

          {/* `flex-1` so the trace's `mt-auto` below still has somewhere to
              push against now that this is a row rather than a column. */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/*
              ⚠️ **The age sits in the right corner, across from the title**
              (owner's instruction, 2026-08-06). It was a block under the title,
              which put a clock between the instrument's name and its identity.

              `items-baseline` so the 11px age sits on the 15px title's
              baseline rather than floating against its cap height, and
              `shrink-0` on the age against `min-w-0` on the title, because
              camera names run to 59 characters (`NB Cross Brx Expy-Webster Av
              Exit ramp @ E 174 St & Cater Av`) and the age is the one of the
              two that may never be the thing that wraps — the frozen-poller rule's
              signal is not allowed to be squeezed out by a long name.
            */}
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="min-w-0 text-[15px] leading-snug font-semibold">
                {camera.name}
              </h3>
              <ReadingAge
                observedAt={camera.observed_at}
                className="shrink-0 whitespace-nowrap"
              />
            </div>

            {/* ⚠️ **The paired sensor's name, directly under the title**
                (owner's instruction, 2026-08-06). It was mid-sentence in the
                description paragraph three lines down, sharing a run with the
                confidence figure; under the title it identifies the instrument
                the way the sensor face's own subtitle does.

                Gated on `calibrated`, exactly as the sentence it came out of
                was. An uncalibrated camera has no sensor to name, and the line
                that says so is still in the paragraph below — absence of depth
                is not zero, and it is not a missing label either. */}
            {camera.calibrated && (
              <span className="num mt-1 block text-[11px] break-all text-muted-foreground">
                {camera.sensor_id}
              </span>
            )}

            {/*
              The depth row: the reading and the control it drives on the left,
              the chip that qualifies the reading in the right corner.

              ⚠️ **The button and the chip were SWAPPED on 2026-08-06** (owner's
              instruction) — the button was in the corner and the chip under the
              depth. What the swap buys is that **the two things about the
              reading now share the left column**: the depth and the button that
              watches it read as one unit, and the qualifier sits across from
              them the way the age sits across from the title one row up.

              `items-start` rather than `items-center` on both axes:
              `DepthReadout` grows a `last known` line when the reading is
              stale, so anything centred against it would slide down half a line
              the moment a poller froze. The chip is pinned to the top of the
              row for the same reason.

              ⚠️ `stopPropagation` on the button is now belt-and-braces rather
              than required, and it stays. It was required while this panel
              carried a panel-wide `onClick`: without it, pressing this button
              turned the reading into a rodent wall mid-press. That click is
              gone with the flip, so nothing above the button consumes a press
              today — but the stop costs nothing and is the guard that would
              have to be re-derived if this panel ever grows a root handler
              again.

              ⚠️ **The button's REST state is `--wl-cyan` and its pressed state
              stays `--wl-select`** (owner's instruction, 2026-08-06). Two things
              make that safe beside a 26px depth. The colour does not vary with
              the READING — every instrument at every depth wears the same cyan
              at rest — so it cannot encode one; what it varies with is whether
              the reader has picked this instrument, which is the same licence
              `--wl-select` already runs on. And the two ends are the right way
              round: `--wl-select` means *the reader chose this* everywhere else
              on the page, so it belongs on the ON state, not the OFF one. Cyan
              is the second recorded exception to the poster-paint rule, after
              `sensor-row.tsx`'s over-threshold chip. ⚠️ **Green was never
              available here** — `--wl-live` / `--wl-clear` beside a depth is
              the never-safe rule — and violet is `--wl-replay`'s on this page.
            */}
            <div className="mt-2.5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <DepthReadout
                  depthMm={camera.depth_mm}
                  freshness={freshness}
                  peak={peakView}
                />
                {/*
                  ⚠️ **Under the reading, inside the left column — never in the
                  depth row itself.** That row's widths are measured (see
                  `web/src/components/CLAUDE.md`: at 390px the pressed
                  `monitoring — press to stop` label leaves 76.5px of slack
                  against the widest depth this app can render), and a third
                  item in it would spend all of that and wrap the button
                  silently. In the left column it stacks with the reading it
                  describes and costs the row nothing.

                  ⚠️ **It needs no `stopPropagation` here and that is not an
                  oversight** — the component carries it on its own root, so
                  this mount and the sensor face's behave identically and a
                  future mount on a flipping surface is safe by construction.
                  It shipped without one and pressing `current ▾` flipped the
                  panel to the rodent back instead of opening the menu; the
                  argument is at that root, and it survives the flip's removal
                  because `harbor-baseline.tsx` still flips. **Do not add a
                  defensive wrapper here** — two stops for one click is how one
                  of them comes to be deleted as redundant.
                */}
                <DepthWindowMenu minutes={windowMin} onPick={setWindowMin} />
                {onToggleWatchCamera && (
                  <button
                    type="button"
                    aria-pressed={!!watchingCamera}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWatchCamera(camera.camera_id);
                    }}
                    className={cn(
                      "cursor-pointer rounded-[5px] border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
                      watchingCamera
                        ? "border-[var(--wl-select)] bg-[var(--wl-select)]/15 text-foreground"
                        : "border-[var(--wl-cyan)] text-[var(--wl-cyan)] hover:bg-[var(--wl-cyan)]/10",
                    )}
                  >
                    {watchingCamera
                      ? "monitoring — press to stop"
                      : "Start Monitor"}
                  </button>
                )}
              </div>

              {/*
                ⚠️ **The corner across from the depth is the QUALIFIER's, and
                it must not silently empty.** It held a camera-confidence chip
                until that layer was deleted, and the sensor face was built to
                match it — measured flush right on 27/27 cameras. An empty
                corner reads as something failing to load, so it takes the
                SENSOR face's `FAULT` chip instead, on the same predicate.

                ⚠️ **`sensor-row.tsx`'s chip verbatim**, neutral-outlined
                `--wl-stale` — the "removed from the scale" idiom — because a
                reader who saw `FAULT` in the list has to meet the same mark
                here. **The three surfaces must not fork on it.**

                ⚠️ **The MARK is here and the WORDS are not.** A chip cannot
                carry an explanation; the sentence naming which bound was
                crossed stays in the flow below, exactly as it does on the
                sensor face.

                ⚠️ **`depth_plausible === false`, never `!`.** It is `true` on a
                camera with no paired sensor — absence has no plausibility to
                doubt — so a truthiness check would put a fault mark on every
                unpaired camera.
              */}
              {camera.depth_plausible === false && (
                <span
                  className="shrink-0 rounded-sm border border-[var(--wl-stale)] px-[6px] py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-[var(--wl-stale)] uppercase"
                  title="the paired instrument reported a depth it cannot physically support — a sensor fault, not water"
                >
                  fault
                </span>
              )}
            </div>

            {/*
              What is left of the description after the sensor name went under
              the title and the confidence became a chip.

              ⚠️ **It renders NOTHING rather than an empty `<p>` when both of
              its clauses are absent** — a calibrated camera with no NWS alert
              is the common case, and an empty paragraph would still cost its
              own line box and its `mt-2.5`, opening a gap under the depth that
              reads as something failing to load.

              ⚠️ **Both surviving clauses are unchanged in wording.** The
              uncalibrated line is the invariant one — absence of depth is not
              zero and it is not dry — and the separator only appears when
              there is something on both sides of it.
            */}
            {(!camera.calibrated || camera.nws_active) && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {!camera.calibrated && (
                  // Invariant: absence of depth is not zero, and it is not dry.
                  <>no co-located sensor — camera assessment only, depth unknown</>
                )}
                {!camera.calibrated && camera.nws_active && <> · </>}
                {/* ⚠️ **"for this area" was an OVERCLAIM and it is fixed.**
                    `nws_active` is one boolean off a STATEWIDE request
                    (`area=NY`), derived through `feeds.is_witness_alert`, which
                    matches flood and rain products only. It is not scoped to
                    this camera, this borough or this city, and it is not every
                    alert — so it may not be worded as though a warning were in
                    effect at this corner.

                    ⚠️ **The tide-and-weather tab is where the real list
                    lives**, scoped to the five boroughs and unfiltered. These
                    two surfaces read different things and must not be worded
                    as though they read the same thing. */}
                {camera.nws_active && (
                  <>an NWS flood or rain alert is active in New York State</>
                )}
              </p>
            )}

            {/* ⚠️ **A camera's own depth ESTIMATE rendered here and it is
                GONE with the layer that produced it.** It was a segmentation
                mask measured against a *drawn* curb line with a 15 cm curb
                assumed — on a real frame at South St @ Broad St it read
                22.5 cm for a 4.78% water patch, i.e. 225 mm, past the 150 mm
                curb threshold. A guess about a guess, in centimetres, one line
                under a calibrated millimetre. **If a camera is ever asked to
                produce a number again, it comes back as prose with the word
                `estimate` in it and the method named — never in depth type and
                never in a colour.** */}

            {/* ❌ **A neighbourhood rodent line sat here, then moved to the
                back of this panel, and is now DELETED outright** along with
                `neighborhood-back.tsx`, the DOHMH aggregate and the three wire
                fields. Nothing replaced it, and nothing should: the argument
                for moving it off the description in the first place — a number
                about rats does not belong inside the block describing a water
                reading — applies with more force to putting it back. */}

            {/* ⚠️ The open alert and the trace are in this column now, not
                full width under the still. That was written when the still was
                a 190px thumbnail and the alert would have had to wrap in the
                gutter beside it; the still is now 42% of a panel that is one of
                three sharing a screen, and a full-width block under it would
                push the trace out of the panel entirely. The alert keeps its
                level border and its verbatim message — only the width changed. */}
            {openAlert && (
              <div
                className={cn(
                  "mt-3 rounded-r-md border-l-[3px] px-3 py-2.5",
                  LEVEL_ALERT_BLOCK[openAlert.level],
                )}
              >
                <h4 className="mb-1 font-mono text-[10px] tracking-[0.1em] uppercase">
                  {openAlert.level} — open alert
                </h4>
                {/* Templated server-side by `agent._TEMPLATES` (the templated-copy rule)
                    and rendered verbatim. Editing it here would make this file
                    a second author of warning copy. */}
                <p className="text-[13px] text-foreground/90">
                  {openAlert.message}
                </p>
              </div>
            )}

            {/* `mt-auto` sits it on the bottom of the column rather than
                directly under the description, so the trace lines up with the
                foot of the still beside it and the panel does not read as
                top-weighted with a gap under it. */}
            <div className="mt-auto pt-3">
              {history.loading ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Loading recent depth.
                </p>
              ) : history.error ? (
                <p className="text-[11px] text-[var(--wl-stale)]">
                  Recent depth unavailable — {history.error.message}
                </p>
              ) : (
                <DepthSparkline
                  points={history.points}
                  floodEventMm={floodEventMm}
                />
              )}
            </div>

            {/* The camera watch toggle used to sit here, under the trace. It
                is on the depth row above now — `SensorFace`'s idiom on the
                other id namespace, and there is no refused branch, because
                every camera this page shows is in `WATCH_CAMERAS` and can be
                subscribed. */}

            {/* ❌ The accessible half of the turn-over gesture — a real
                `FlipHandle` reading `rats ›`, tabbable, carrying
                `aria-expanded` — sat here. It went with the face it disclosed.
                There is nothing to disclose on this panel now, so there is no
                button and no `aria-expanded` anywhere in it. */}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Everything known about one FloodNet deployment.
 *
 * ⚠️ **Same `Panel` shell, same two-column grid, same body box as the camera
 * face**, and that is deliberate rather than lazy: the panel must not lurch
 * between kinds when the reader steps the pager from a camera to a sensor. The
 * body is `min-h-0 flex-1 overflow-y-auto` for the same reason it is on the
 * camera face — this panel's height is not its own, and a taller face has to
 * scroll rather than push the gauges below the fold.
 *
 * ### ⚠️ What may never appear here
 *
 * - **A pill carrying a judgement this face did not measure.** A camera used to
 *   produce an ordinal class over its frame; that layer is deleted, and
 *   nothing may replace it here. The chrome bar keeps its `sensor` label.
 * - **A number that is not about water.** A DOHMH rat-inspection rate was the
 *   worked example and it is deleted; the rule outlived it. Anything that is
 *   not a depth, an age or a threshold does not belong beside a depth.
 * - **`bg-accent`, or anything green.** Same rule as everywhere else.
 */
/**
 * A camera this poller does **not** watch, selected off the registry.
 *
 * ## ⚠️ What it deliberately does NOT render
 *
 * **No depth row, no band pill, no sparkline, and — for an unpaired camera — no
 * em-dash.** An em-dash means *this instrument reported nothing*, which is a
 * claim about an instrument that is measuring here. Nothing measures here, and
 * the honest rendering of that is a sentence.
 *
 * `/api/history/{camera_id}` would return an **empty series** for one of these —
 * a real 200 with no points, because `poll.tick` writes `observations` rows only
 * for `WATCH_CAMERAS` — and the sparkline would render that as a flat nothing.
 * That is the *nobody looked* vs *the instrument is broken* ambiguity this repo
 * refuses, so the request is not made at all.
 *
 * ## ⚠️ Why a paired one gets no depth here either
 *
 * `CameraEntry` carries a depth, and putting it in this face would mean
 * rebuilding the whole depth apparatus — the readout, the staleness treatment,
 * the plausibility sentence, the timeframe menu — against **FloodNet's**
 * publication clock rather than our poller's. The instrument that reading
 * belongs to already has all of that, correctly, one selection away. So this
 * face names the sensor and says where the depth is, rather than growing a
 * second, differently-clocked depth surface.
 *
 * ## ⚠️ The still carries NO cache-buster, and that is not an oversight
 *
 * `frameUrl` keys the buster on `observed_at` — on the reading, never on the
 * clock, because a clock key re-downloads every still on every render. There is
 * no reading here to key on, so the plain URL is what goes out. The browser's
 * own caching is then the only thing deciding, which is the right answer for a
 * frame nothing in this app is collecting.
 */
function RegistryCameraFace({
  camera,
  pager,
  className,
}: {
  camera: CameraEntry;
  pager: PagerProps;
  className?: string;
}) {
  return (
    <Panel
      aria-label={`Detail for ${camera.name}`}
      /* ⚠️ **`border-border`, never a staleness colour.** The panel border says
         a feed has moved; nothing is feeding this corner, and there is no
         freshness to be wrong about. */
      className={cn("relative h-full border-border", className)}
    >
      <PanelHeader>
        <PanelTitle>Instrument</PanelTitle>
        <PanelTools>
          {/* ⚠️ Its `index` is `-1` here, because `ordered` holds the 27 the
              list pages through and this camera is not one of them. The pager
              says `not in filter` rather than inventing a position — the idiom
              it already had for a filtered-out pick. */}
          <InstrumentPager {...pager} />
        </PanelTools>
      </PanelHeader>

      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex h-full min-h-0 flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={camera.image_url}
            alt={camera.name}
            className="block aspect-[352/240] max-h-[300px] w-full shrink-0 rounded-md bg-black object-cover"
          />

          <div className="flex min-w-0 flex-1 flex-col">
            {/* ⚠️ **No `ReadingAge` across from the title**, unlike the watched
                camera's face. That component subscribes to `useNow(1000)` and
                ages a timestamp; there is no timestamp here, and an age of
                nothing is not a shorter answer, it is a different one. */}
            <h3 className="min-w-0 text-[15px] leading-snug font-semibold">
              {camera.name}
            </h3>

            <span className="mt-1 block text-[11px] text-muted-foreground">
              {PAIR_TIER_LABEL[camera.tier]}
              {camera.borough ? ` · ${camera.borough}` : ""}
            </span>

            {camera.tier === "unpaired" ? (
              /* ⚠️ **`FAR_M` is interpolated, never typed.** It is
                 `cameras.MAX_PAIR_M` and it is on the parity path
                 (`parity_constants.py` → `parity.test.ts`), which is where that
                 number's single authority lives. A hand-written `250` here is a
                 bound nothing can see move. */
              <p className="mt-3 text-xs leading-relaxed text-foreground">
                No FloodNet sensor is within {FAR_M} m of this camera. Fluud has
                no depth for this corner.
              </p>
            ) : (
              <>
                <span className="num mt-2 block text-[11px] break-all text-muted-foreground">
                  {camera.sensor_id}
                </span>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  A FloodNet sensor is at this corner and its depth is what this
                  view would be labelled with. Fluud does not collect this
                  camera, so the reading is on that sensor rather than here.
                </p>
              </>
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              This camera is in the DOT registry and is not one this instrument
              polls. What it shows is a still your browser loads from DOT. It
              measures nothing.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SensorFace({
  sensor,
  now,
  floodEventMm,
  pager,
  cameraFor,
  onSelectCamera,
  watching,
  onToggleWatch,
  origin,
  ingest,
  onShowGauges,
  windowMin,
  onPickWindow,
  peakView,
  className,
}: {
  sensor: SensorStatus;
  now: number;
  floodEventMm: number;
  pager: PagerProps;
  cameraFor: CameraStatus | null;
  onSelectCamera: (cameraId: string) => void;
  /** Whether this sensor is in the watch set. */
  watching?: boolean;
  /** Omitted where there is no watch panel to feed — the landing page. */
  onToggleWatch?: (sensorId: string) => void;
  origin: Origin | null;
  /** The poller's own bounds, or null before `/api/status` settles. Every
   *  sentence built on it is gated on it — there is no fallback number. */
  ingest: IngestBounds | null;
  /** Show the harbor gauges. Rendered only on a tidal sensor, and only when
   *  there is a rail to switch. */
  onShowGauges?: () => void;
  /** The depth timeframe, `null` for the current reading. Owned by the parent
   *  so it survives a selection change — see the note at `useState` there. */
  windowMin: number | null;
  onPickWindow: (minutes: number | null) => void;
  /** Present only while a window is picked. */
  peakView?: PeakView;
  className?: string;
}) {
  const age = sensorAgeSeconds(sensor, now);
  const distanceM = distanceFromOrigin(origin, sensor.lat, sensor.lon);
  const freshness: Freshness = age == null ? "fresh" : sensorFreshnessOf(age);
  const faulted = sensor.plausible === false;
  /* Which side of the plausibility band was crossed. ⚠️ Read off the SIGN of
     the reading rather than off `ingest`, so the fault sentence still picks the
     right branch before `/api/status` settles — the bound is what may be
     missing, never the direction. */
  const tooShallow = sensor.depth_mm != null && sensor.depth_mm < 0;

  const border = cn(
    freshness === "fresh" && "border-border",
    freshness === "stale" && "border-[var(--wl-stale)]",
    freshness === "dead" && "border-[var(--wl-dead)]",
  );

  return (
    <Panel
      aria-label={`Detail for sensor ${sensor.name ?? sensor.sensor_id}`}
      className={cn("relative h-full", border, className)}
    >
      <PanelHeader>
        <PanelTitle>Instrument</PanelTitle>
        <PanelTools>
          <InstrumentPager {...pager} />
          <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
            sensor
          </span>
        </PanelTools>
      </PanelHeader>

      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {/* Stacked to match the camera face exactly — see the note there. The
            panel must not lurch between kinds when the pager steps from a
            camera to a sensor, so the two faces share a layout as well as a
            shell. */}
        <div className="flex h-full min-h-0 flex-col gap-3">
          {/*
            The paired camera's still, or a plate saying there is no camera
            here. ⚠️ **That plate is a permanent property of the deployment, not
            a failure to load** — most FloodNet sensors are nowhere near a DOT
            camera and never will be — so it reads in muted type rather than in
            a warning colour, and it says what it is.
          */}
          {cameraFor ? (
            <div className="flex shrink-0 flex-col gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frameUrl(cameraFor.image_url, cameraFor.observed_at)}
                alt={cameraFor.name}
                className="block aspect-[352/240] max-h-[300px] w-full rounded-md bg-black object-cover"
              />
              <button
                type="button"
                onClick={() => onSelectCamera(cameraFor.camera_id)}
                className={cn(
                  "shrink-0 cursor-pointer truncate rounded-sm text-left font-mono text-[9px] tracking-[0.1em] uppercase",
                  "text-muted-foreground/70 hover:text-foreground",
                  "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
                )}
              >
                › see camera
              </button>
            </div>
          ) : (
            <div className="flex aspect-[352/240] max-h-[300px] w-full shrink-0 items-center justify-center rounded-md bg-black px-2 text-center text-[11px] leading-snug tracking-[0.04em] text-muted-foreground">
              no camera at this sensor
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/*
              ⚠️ **The age sits in the right corner, across from the title**,
              which is the camera face's arrangement applied here so the two
              cannot lurch when the pager steps from one kind to the other. It
              was a block under the title, which put a clock between the
              instrument's name and its identity.

              `items-baseline` so the 11px age sits on the 15px title's
              baseline, and `shrink-0` against the title's `min-w-0` for the
              camera face's reason: **the age may never be the thing that
              wraps.** It is the frozen-poller rule's signal on this face and a long name
              must not squeeze it out.

              ⚠️ `freshness` is still passed explicitly and that is the one
              thing here the camera face must NOT be copied on. `ReadingAge`
              defaults to the CAMERA thresholds, and a sensor's `observed_at`
              is FloodNet's own publication clock — a different quantity, on a
              1h/3h ramp rather than 300s/1800s. See `staleness.ts`, which
              holds all three clocks and the measurement behind these two.
            */}
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="min-w-0 text-[15px] leading-snug font-semibold">
                {sensor.name ?? sensor.sensor_id}
              </h3>
              {sensor.observed_at ? (
                <ReadingAge
                  observedAt={sensor.observed_at}
                  freshness={sensorFreshnessOf}
                  className="shrink-0 whitespace-nowrap"
                />
              ) : (
                <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                  never reported
                </span>
              )}
            </div>

            {/*
              ⚠️ **The deployment id, directly under the title** — the slot the
              camera face fills with the id of the sensor that gives it its
              depth. `selected-detail.tsx`'s own note there says that line
              "identifies the instrument the way the sensor face's own subtitle
              does", and until now this face had no such subtitle: the id was
              only in the `dl` at the foot, below a scroll.

              Gated on `sensor.name`, because when the name is absent the `h3`
              above is ALREADY the id and a second copy would be the same string
              twice. **The `dl` no longer carries an `id` row** for the same
              reason — one identity, in the place the camera face puts it. Same
              type, same `break-all`: these ids run to 25 characters
              (`bleakly-accurate-porpoise`) in a 372px rail.
            */}
            {sensor.name && (
              <span className="num mt-1 block text-[11px] break-all text-muted-foreground">
                {sensor.sensor_id}
              </span>
            )}

            {/*
              The watch toggle, across from the depth rather than at the foot
              of the face — see the note on the camera face, which made the
              same move for the same reason. `items-start` because
              `DepthReadout` grows a `last known` line when the reading is
              stale.

              ⚠️ **Here and not on `sensor-row.tsx`.** That row is already a
              full-width button for selection, and
              `web/src/components/CLAUDE.md` is explicit that two gestures on
              one surface have to be distinguishable by *where* you press. This
              face has room and no gesture conflict.

              ⚠️ **Only the BUTTON moved.** When FloodNet does not permit an
              alarm from this deployment the refusal is a sentence in the same
              invariant-9 idiom as the "No paired camera" line, and it stays in
              the flow below with the other sentences about this instrument — a
              paragraph beside a 26px number would be read as a caption on the
              reading. Offering a control the server would refuse is worse than
              offering none: it reads as a promise.

              ⚠️ **It is gated on `alert_permitted`, NOT on
              `watched_camera_id`, and those are two different questions.** The
              watch runs off `waterline/watch.py`, which has no camera in it at
              all; the pairing decides only which camera view this sensor's
              depth labels.
              Until 2026-08-06 the line below read "Display only — Fluud
              does not raise a warning from this sensor" on the
              `watched_camera_id` branch, so 325 of 425 deployments rendered
              that sentence directly under a working button offering exactly
              what it denied. Each branch names the path it is about now.

              ⚠️ **Rest is `--wl-cyan`, pressed is `--wl-select`** — the camera
              face carries the argument, and the two faces must not fork on it.
              ⚠️ The refused branch below takes NO colour at all: it is prose
              about what this app cannot do, and painting it would make an
              absence look like a state.
            */}
            <div className="mt-2.5 flex items-start justify-between gap-3">
              {/*
                ⚠️ **The reading, its timeframe control and its button share
                the left column**, which is the camera face's arrangement after
                the 2026-08-06 swap. Both faces have to stack them the same way
                — the panel must not lurch when the pager steps from a camera to
                a sensor, which is the rule the `aspect-[352/240]` still and the
                title row both follow.

                ⚠️ **The button was in the right corner on this face until the
                two were aligned.** What the move buys is what it bought on the
                camera face: the depth and the control that watches it read as
                one unit, and the corner is left to the mark that qualifies the
                reading.
              */}
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <DepthReadout
                  depthMm={sensor.depth_mm}
                  freshness={freshness}
                  peak={peakView}
                />
                <DepthWindowMenu minutes={windowMin} onPick={onPickWindow} />
                {onToggleWatch && sensor.alert_permitted && (
                  <button
                    type="button"
                    aria-pressed={!!watching}
                    onClick={() => onToggleWatch(sensor.sensor_id)}
                    className={cn(
                      "cursor-pointer rounded-[5px] border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
                      watching
                        ? "border-[var(--wl-select)] bg-[var(--wl-select)]/15 text-foreground"
                        : "border-[var(--wl-cyan)] text-[var(--wl-cyan)] hover:bg-[var(--wl-cyan)]/10",
                    )}
                  >
                    {watching
                      ? "monitoring — press to stop"
                      : "Start Monitor"}
                  </button>
                )}
              </div>

              {/*
                ⚠️ **The corner across from the depth is the QUALIFIER's**, and
                that is the camera face's arrangement rather than a new idea:
                there the depth and its button share the left column and the
                confidence chip sits opposite them. The sensor's qualifier is
                its **plausibility**, so the `FAULT` mark comes up here from the
                paragraph below.

                ⚠️ **The MARK moved and the WORDS did not.** The sentence under
                this row still says which bound was crossed, in the same
                wording, because that is the explanation and a chip cannot carry
                it. This is the same split the camera face makes — a chip that
                qualifies the reading beside it, prose that explains underneath
                — and it is why the sentence was not deleted.

                ⚠️ **`--wl-stale`, and it is `sensor-row.tsx`'s chip verbatim.**
                That is the "removed from the scale" idiom `DepthBandPill` uses
                for an old reading, because a faulted number and a stale one are
                the same judgement: neither belongs on a scale of how deep the
                water is. **The two surfaces must not fork on it** — a reader
                who saw `FAULT` in the list has to meet the same mark here.

                ⚠️ **It does NOT vary with the reading.** It is present or
                absent on the stored plausibility verdict and it is one colour
                either way, so it cannot encode a depth — the rule that decides
                every token spend on this page. It is deliberately NOT the
                camera face's two-step ramp: `confidenceTone` grades a
                continuous figure, and plausibility is a boolean the poller
                already decided. A second step here would invent a middle
                state the data does not have.

                ⚠️ **`--wl-cyan`'s over-threshold chip is NOT brought up with
                it.** That mark's argument in the list is that a 42px row has no
                room for the sentence; this face has the sentence, directly
                below, in `--wl-watch` and naming whose threshold it is. A chip
                repeating it would be the same claim twice, and at most one mark
                may sit here anyway — `sensor-row.tsx` says so at its own chip,
                and a faulted reading cannot also be a meaningful
                over-threshold one.
              */}
              {faulted && (
                <span
                  className="shrink-0 rounded-sm border border-[var(--wl-stale)] px-[6px] py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-[var(--wl-stale)] uppercase"
                  title="the instrument reported a depth it cannot physically support — a sensor fault, not water"
                >
                  fault
                </span>
              )}
            </div>

            {/* ⚠️ The digits stay and the claim changes — the same idiom as a
                stale reading. Removing the number would hide the evidence that
                the instrument is broken; presenting it plainly would assert a
                depth. So it stays, and this line says what it is. */}
            {/*
              ⚠️ **The bound and the mounting height are what make this
              sentence an ARGUMENT instead of an assertion.** It named the
              direction and nothing else until 2026-08-15: a reader met `FAULT`
              over `1452 mm` and was told the number was too deep, with no
              figure it was too deep *against* and no reason a rangefinder
              would produce it. Both facts were in the database the whole time.

              ⚠️ **The bound is attributed to Fluud, never to FloodNet.** 10 mm
              and 150 mm are borrowed and this is not — `IngestBounds` in
              `api-types.ts` carries the split, and a sentence saying
              "FloodNet's 600 mm ceiling" would be crediting somebody else with
              a number this repo derived. The height is FloodNet's own
              `height_ground_mm` and is not attributed to anyone, because it is
              a measurement of a pole rather than a judgement.

              ⚠️ **The height clause is on the DEEP branch only.** A lost echo
              returns the distance to the mount, so the pole explains a large
              positive reading and explains nothing at all about a negative
              one — putting it on both branches would be a real fact deployed
              as a non-sequitur.
            */}
            {faulted && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wl-stale)]">
                sensor fault — this is not a depth.{" "}
                {tooShallow ? (
                  <>
                    The reading is below the roadway, which a street
                    rangefinder cannot measure.
                    {ingest && (
                      <>
                        {" "}
                        Fluud rejects anything below{" "}
                        <span className="num">
                          {signedMm(ingest.implausible_min_mm)}
                        </span>
                        , a bound derived here rather than borrowed.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    The reading is deeper than a street rangefinder can
                    support.
                    {ingest && (
                      <>
                        {" "}
                        Fluud rejects anything at or above{" "}
                        <span className="num">
                          {signedMm(ingest.implausible_mm)}
                        </span>
                        , a bound derived here rather than borrowed.
                      </>
                    )}
                    {sensor.ground_height_mm != null && (
                      <>
                        {" "}
                        This instrument is mounted{" "}
                        <span className="num">
                          {mountedM(sensor.ground_height_mm)}
                        </span>{" "}
                        above the roadway, so an echo that comes back off the
                        mount instead of the street reports the pole.
                      </>
                    )}
                  </>
                )}
              </p>
            )}

            {/* The borrowed thresholds, in words, and silent below them —
                exactly as `GaugeFace` is silent below its own. Both numbers are
                borrowed rather than invented: 10mm is FloodNet's flood-event
                definition and 150mm is NYC curb height. */}
            {!faulted &&
              sensor.depth_mm != null &&
              sensor.depth_mm >= floodEventMm && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wl-watch)]">
                  At or above FloodNet&rsquo;s {floodEventMm}mm flood-event
                  threshold.
                </p>
              )}

            {/* FloodNet's own call, attributed to them, and silent when false —
                a "no flood detected" line would be this page reporting that
                somewhere is safe. */}
            {sensor.flood_detected && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wl-watch)]">
                FloodNet flags this reading as a flood event.
              </p>
            )}

            {/*
              **What this app does with it — always present, both ways.**

              ⚠️ **This sentence has been wrong twice and both errors are worth
              keeping written down, because the shape of them is the same.** It
              read *"Display only — Fluud does not raise a warning from this
              sensor"* until 2026-08-06, which was false for every deployment
              `alert_permitted` admits: the email watch takes no camera at all,
              so ~343 sensors can warn a subscriber with no pairing whatsoever.
              It was repaired to *"Drives the warning at X"* / *"raises no
              warning on this page"* — and that went false in turn when the
              on-page alert system was unwired, because **nothing on any page
              raises a warning from anything now.**

              ⚠️ **So it says what a pairing IS rather than what it gates**, and
              a pairing gates nothing. It means this sensor's depth is the one
              labelling that camera's view; `alert_permitted` is the separate
              question the `Start Monitor` button above is gated on. **A claim
              built on either field has to name its path** — that is what both
              errors had in common.

              ⚠️ **`alert_visible` no longer splits this into three branches.**
              The third existed because `poll.tick` gated the camera alert path
              on it, so a paired-but-disabled deployment drove nothing while
              this sentence said it did. There is no camera alert path.
            */}
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {sensor.watched_camera_id ? (
                <>
                  Paired to{" "}
                  <b className="font-semibold text-foreground">
                    {cameraFor?.name ?? "a watched camera"}
                  </b>
                  , so this reading labels that camera&rsquo;s view.
                </>
              ) : (
                <>
                  <b className="font-semibold text-foreground">
                    No paired camera
                  </b>
                  , so there is no view of this corner here.
                </>
              )}{" "}
              {sensor.tidal ? (
                <>
                  Tidal: it sees coastal surge rather than stormwater, so the
                  harbor gauge is evidence about it.
                  {/*
                    ⚠️ **The claim above was stranded until 2026-08-15.** It
                    tells a reader the harbor gauge bears on this instrument,
                    and since the rail was tabbed the gauges are behind a tab
                    on this same column — so the sentence named a place and
                    gave no way to get there. This is the sentence cashing its
                    own claim.

                    ⚠️ **It takes NO scale colour and specifically not
                    `--wl-select`.** That token means *the reader picked this
                    instrument*; a tab this control opens is a different fact,
                    and borrowing it here would put a selection colour beside a
                    reading. Muted with an underline is a link's affordance and
                    nothing else.

                    Rendered only when there is a rail to switch — the panel
                    mounts where there is not.
                  */}
                  {onShowGauges && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={onShowGauges}
                        className="cursor-pointer underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                      >
                        harbor gauges ›
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>Stormwater, not tidal.</>
              )}
            </p>

            {/*
              ⚠️ **What a silence is measured over — the cheap half of the
              clock-skew problem, and it buys most of it.**

              A sensor that has never reported rendered a bare em-dash and no
              sentence, which leaves *nobody looked here* and *this instrument
              is broken* looking identical. Naming the window costs one request
              to nobody: `reading_max_age_s` is already on `/api/status` and
              the depth query is already bounded by it.

              ⚠️ **It names the window and refuses to guess the cause**, which
              is the honest stopping point. Roughly 29 deployments have a
              broken real-time clock and stamp every row decades ahead, so they
              have nothing inside the window and arrive exactly like a sensor
              that stopped. `floodnet.skewed_deployments` can tell the two
              apart and is diagnostic-only; separating them on this page is a
              stored column and an hourly upstream request, and it is not
              built. **Do not word this as though it were.**

              ⚠️ **The last sentence is the never-safe rule.** A silent
              instrument is the surface where "no news" most wants to be read
              as "no water", and this panel is where a reader has gone looking
              for a reason.
            */}
            {sensor.observed_at == null && ingest && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                No reading at all. Fluud asks FloodNet for the last{" "}
                {windowLabel(ingest.reading_max_age_s)} and nothing from this
                deployment falls inside that window. An instrument that has
                stopped and one whose clock is wrong both arrive this way, and
                this page cannot tell them apart. Neither is a statement about
                the street.
              </p>
            )}

            {/*
              How far this is from the address the reader gave.

              ⚠️ **Same register as the sentence above it, and it takes no
              colour at any distance** — `DistanceLine` in
              `landing/block-search.tsx` carries the argument, and it is the same
              argument here: reddening with distance is a severity ramp made out
              of coverage, greening as it shrinks is reassurance beside a depth,
              and `--wl-select` means *the reader picked this* rather than *the
              arithmetic returned this*.

              This panel is the designated donor for a line like this: its body
              is `overflow-y-auto` by design, so one more line costs a scroll
              rather than a measurement. The list row is the surface where the
              same fact is expensive.
            */}
            {origin && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {distanceM == null ? (
                  <>
                    No published coordinate — the distance from the address you
                    searched is unknown.
                  </>
                ) : (
                  <>{distanceText(distanceM)} from the address you searched.</>
                )}
              </p>
            )}

            {/*
              Invariant 9's refusal. The permitted case is a button on the
              depth row above; this branch stays here, in the run of sentences
              about what this app does with this instrument, because it is one
              of them.
            */}
            {/*
              ⚠️ **It stated the refusal and withheld the reason until
              2026-08-15**, on a control the reader can see is missing. Both
              halves of `alert_permitted` were already on the wire, so the
              answer to *why* cost nothing but the words.

              ⚠️ **It NAMES ITS PATH, which is the rule this face has broken
              twice.** `alert_permitted` gates the **email**; it is not about
              anything on any page, and the pairing sentence above it is about
              something else again. Every claim here says which.

              ⚠️ **The last clause is not filler.** Without it, "cannot warn"
              reads as "is not being read", and a reader would take a silence
              from this instrument as coverage they do not have. Every
              deployment is polled and stored whatever FloodNet says about
              alarming from it — see `poll.tick`, which takes the whole city.

              The two branches are the two halves of `floodnet.alert_permitted`
              and they are genuinely different facts: FloodNet switching
              alerting off for a deployment, and FloodNet reporting a
              deployment as something other than healthy. `status` is upstream
              text passed through verbatim, so it goes in `.num` and is never
              re-worded here.
            */}
            {onToggleWatch && !sensor.alert_permitted && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Fluud cannot email from this sensor, so it cannot be watched.{" "}
                {sensor.alert_visible ? (
                  <>
                    FloodNet reports its status as{" "}
                    <span className="num">{sensor.status}</span>, and Fluud
                    only mails from a deployment FloodNet currently calls
                    healthy.
                  </>
                ) : (
                  <>FloodNet has turned alerting off for this deployment.</>
                )}{" "}
                It is still polled, still stored and still shown here.
              </p>
            )}

            <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-3 text-[11px]">
              <Row label="borough">{sensor.borough ?? "—"}</Row>
              <Row label="neighbourhood">{sensor.nta ?? "—"}</Row>
              <Row label="status">
                <span className="num">{sensor.status}</span>
              </Row>
              {/*
                ⚠️ **The pole, in this list, and NOT beside the depth.** It is
                a length in millimetres like the reading above it, and putting
                the two anywhere near each other invites the one comparison
                this field may never support — they are not two points on a
                scale, they are the height of a mount and water on the ground.
                Here it sits with borough, neighbourhood and coordinates, which
                is what it is: a fact about where the instrument is.

                It renders in **metres** for the same reason. `mountedM`
                carries the argument.

                ⚠️ **Present unconditionally, with an em-dash when FloodNet
                publishes no height.** A row that appeared only sometimes would
                make an absent height invisible, and this list is where a
                reader goes to find out what is known about an instrument. It
                takes no colour, no band and no pill.
              */}
              <Row label="mounted">
                {sensor.ground_height_mm == null ? (
                  "—"
                ) : (
                  <span className="num">
                    {mountedM(sensor.ground_height_mm)} above the roadway
                  </span>
                )}
              </Row>
              {/* ⚠️ The `id` row was here and is now the subtitle under the
                  title, where the camera face puts an instrument's id. It is
                  not lost and it is not duplicated — see the note there. */}
              <Row label="coords">
                <span className="num">
                  {sensor.lat.toFixed(4)}, {sensor.lon.toFixed(4)}
                </span>
              </Row>
            </dl>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * A millimetre bound with a real minus sign.
 *
 * ⚠️ **U+2212, not a hyphen.** `implausible_min_mm` is negative and it is read
 * inside a sentence at 11px, where a hyphen-minus reads as punctuation joining
 * two words rather than as a sign on a number — so *"below -200 mm"* looks like
 * a typo and *"below −200 mm"* looks like a bound. Nothing else in this file
 * prints a negative in prose, which is why this is the only place it lives.
 */
function signedMm(mm: number): string {
  return mm < 0 ? `−${Math.abs(mm)} mm` : `${mm} mm`;
}

/**
 * A mounting height in metres, one decimal.
 *
 * ⚠️ **Metres for the pole and millimetres for the water, deliberately.** They
 * are the same unit on the wire and rendering them the same way invites the one
 * comparison this field may never support — `2400` beside `1452` reads as two
 * points on one scale. A height in metres and a depth in millimetres cannot be
 * mistaken for each other at a glance, which is the whole job.
 */
function mountedM(mm: number): string {
  return `${(mm / 1000).toFixed(1)} m`;
}

/**
 * The depth query's back edge, in words.
 *
 * Whole hours when it divides, because `floodnet.MAX_AGE` is six hours and
 * *"the last 21600 seconds"* is a number nobody can hold. Minutes otherwise, so
 * a future change to that constant does not silently render as `0 hours`.
 */
function windowLabel(seconds: number): string {
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "hour" : `${h} hours`;
  }
  const m = Math.round(seconds / 60);
  return m === 1 ? "minute" : `${m} minutes`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-muted-foreground">{children}</dd>
    </>
  );
}

export interface PagerProps {
  /** Position in the current ordered list, or -1 when the pick is filtered out. */
  index: number;
  total: number;
  onStep: (delta: -1 | 1) => void;
}

/**
 * `‹ ›` over the **current filtered, sorted list**.
 *
 * ### Why it lives in this panel's chrome bar
 *
 * This panel is what visibly changes when you step, and it sits directly under
 * the list whose order it walks. Putting it in the list's own header would put
 * the control and its effect in two different boxes.
 *
 * ### Why it exists at all
 *
 * ⚠️ **It is the other half of the clickable sensor markers, not a convenience
 * on top of them.** 425 markers on a ~600px drawing of New York overlap badly
 * wherever FloodNet clusters, and a marker drawn entirely underneath another
 * cannot be clicked at all — no amount of z-index fixes that. The pager walks
 * the list instead, so every sensor stays reachable however the drawing stacks.
 * It is also what makes the filters worth having: narrow to *Brooklyn, over
 * 10 mm*, then press `›` to walk exactly those, lighting each on the map.
 *
 * ### ⚠️ Since zoom landed, this pager and the map's recentre are ONE FEATURE
 *
 * The guarantee used to be *reaches every sensor regardless of stacking*, and
 * that was unconditional because the drawing had one fixed extent. The map pans
 * and zooms as of 2026-08-14, so `›` can now select an instrument **the frame
 * is not showing** — and `city-map.tsx` closes that by recentring on a
 * selection that arrives from outside the drawing. The guarantee is therefore
 * *reaches every sensor, and the frame follows*.
 *
 * ⚠️ **If that recentre is ever gated or removed, this control silently becomes
 * "reaches every sensor and shows you a frame it isn't in"** — a pager that
 * appears to work while the map beside it stops answering. The same warning is
 * at the recentre's own site. Neither half is optional on its own.
 *
 * ### Rules
 *
 * - **The index is derived, never stored.** `ordered.findIndex(...)` on every
 *   render, for the reason `harbor-baseline.tsx` gives about its own window: a
 *   stored index into a live array points past the end the moment a poll
 *   changes the payload.
 * - **No wrapping.** Disabled at both ends. On a worst-first sort, wrapping
 *   teleports from the worst instrument to the best, which is a jump nobody
 *   asked for and which would read as a bug.
 * - **A filtered-out pick says so rather than lying about a position.** `‹` and
 *   `›` then select the last and first of the list, which is honest and gets
 *   you back into the set in one press.
 */
function InstrumentPager({ index, total, onStep }: PagerProps) {
  if (total === 0) return null;
  const adrift = index < 0;

  return (
    <div className="flex items-center gap-0.5">
      <span
        className="num px-1 text-[11px] text-muted-foreground"
        title={
          adrift
            ? "The selected instrument is not in the current filter"
            : undefined
        }
      >
        {adrift ? (
          <span className="text-[var(--wl-stale)]">not in filter</span>
        ) : (
          <>
            {index + 1} of {total}
          </>
        )}
      </span>
      <Step
        label="Previous instrument"
        disabled={!adrift && index <= 0}
        onClick={() => onStep(-1)}
      >
        ‹
      </Step>
      <Step
        label="Next instrument"
        disabled={!adrift && index >= total - 1}
        onClick={() => onStep(1)}
      >
        ›
      </Step>
    </div>
  );
}

/* ❌ **`FlipHandle` was here and is deleted.** It was this panel's turn-over
   control — a real button in the chrome bar, then at the foot of the body,
   carrying `aria-expanded` so the flip read as a disclosure rather than
   happening silently. It had no `stopPropagation` on purpose, because it and
   the panel-wide click both set the state to a *value* rather than toggling, so
   the bubble was a no-op.

   It went with `NeighborhoodBack` on 2026-08-14. Nothing on this panel
   discloses anything now. **If a face with a back ever returns here, the two
   halves come back together** — an overlay `FlipTrigger` is still wrong on this
   surface for the reason recorded at `flip-card.tsx`: the body scrolls, and an
   overlay button is a sibling of the scroll container rather than a descendant,
   so wheel events over it would find no scrollable ancestor. */

