"use client";

import { Highlight } from "@/components/highlight";
// Both of these are SHARED with the camera row, for one reason: the word `peak`
// cannot appear on one list and not the other, and neither can the scale.
import { DepthBar } from "@/components/depth-bar";
import { DepthCell } from "@/components/depth-cell";
import type { DepthPeakEntry, SensorStatus } from "@/lib/api-types";
import { formatAge, formatDepth } from "@/lib/format";
import { distanceText } from "@/lib/geo/distance";
import { distanceFromOrigin, sensorAgeSeconds, type Origin } from "@/lib/instrument-query";
import { sensorFreshnessOf, type Freshness } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * One FloodNet deployment in the instrument list.
 *
 * Its own file because it carries more rules than a row usually does, and three
 * of them are safety properties rather than styling:
 *
 * ### ⚠️ No pill that is not arithmetic over this row's own number
 *
 * A camera row wears a `DepthBandPill` and this one does not, and the asymmetry
 * is deliberate: on a camera the band is about a *paired* sensor's depth, which
 * is the one thing a camera view is for. Here the number is the row's own and
 * the `FAULT` / over-threshold chips already qualify it.
 *
 * ⚠️ **What may never come back is a pill carrying a JUDGEMENT this row did not
 * measure.** A camera used to produce an ordinal class over its frame —
 * dry / wet / ponding / impassable — and putting that on a sensor row would
 * have been inventing an assessment of a frame nobody looked at. That layer is
 * deleted, so there is nothing to borrow; the rule survives because the shape
 * of the mistake does.
 *
 * This is the easiest mistake to make in this file, because the row *looks*
 * like `StationRow` and a pill is what visually balances it. There is a
 * ⚠️ It is enforced by prose, not by a type. The per-file argument is in
 * `web/src/components/CLAUDE.md`.
 *
 * ### ⚠️ This row does not mount `ReadingAge`.
 *
 * `ReadingAge` subscribes to `useNow(1000)`. There are 425 of these, so 425
 * subscribers would be **425 leaf re-renders every second** — for data that
 * changes once a minute. The list passes its existing `useNow(15_000)` tick
 * down as a prop and the age is formatted directly. 15s is already four times
 * faster than the data moves.
 *
 * ### ⚠️ At most one mark, and there is no "ok" chip.
 *
 * A fault mark or an over-threshold mark or nothing. There is deliberately no
 * third state saying a sensor is fine — this page does not report that anywhere
 * is safe (the never-safe rule), and a row of green ticks down a list of 425 sensors
 * would be the loudest possible version of that claim.
 */
export function SensorRow({
  sensor,
  now,
  floodEventMm,
  curbHeightMm,
  origin,
  search,
  selected,
  onSelect,
  windowed,
  peak,
  watching = false,
  onToggleWatch,
  watchFull = false,
}: {
  sensor: SensorStatus;
  /** The list's shared 15s tick. Deliberately not a 1s clock — see above. */
  now: number;
  /** Borrowed from `/api/status`: FloodNet's own flood-event definition. */
  floodEventMm: number;
  /**
   * Borrowed from `/api/status`: NYC curb height, which is where `DepthBar`'s
   * track ends.
   *
   * ⚠️ **This is the bar's scale and NOT a pill coming back.** This row still
   * wears no `DepthBandPill` — see the header. The bar is the row's own number
   * drawn against a named threshold; a pill would be a classification.
   */
  curbHeightMm: number;
  /** The address the reader gave, or null. Never stored, never sent — see
   *  `lib/geosearch.ts` and LIMITATIONS §16. */
  origin: Origin | null;
  /** The list's search text, for marking why this row matched. The same string
   *  the filter used — see `matchRange` in `instrument-query.ts`. */
  search: string;
  selected: boolean;
  onSelect: (sensorId: string) => void;
  /**
   * ⚠️ **Whether the depth cell is a PEAK** over the window the reader picked
   * in the list's chrome. Separate from `peak` being non-null on purpose: a
   * null `peak` in windowed mode is a real answer (nothing in the window), and
   * it still has to render under the word. See `DepthCell`.
   */
  windowed: boolean;
  peak: DepthPeakEntry | null;
  /** Whether this deployment is in the reader's monitor set. */
  watching?: boolean;
  /**
   * Put this deployment in or out of the monitor set. Omit it and the row grows
   * no rail at all, which is how every surface that has no watch state mounts
   * this component.
   *
   * ⚠️ **The rail is also withheld when `sensor.alert_permitted` is false**, and
   * it is withheld rather than disabled. FloodNet can turn alerting off for a
   * deployment; the server refuses to subscribe to one and says why on the
   * detail face. **Offering a control the server would refuse reads as a
   * promise**, so where the answer is no there is no control — the same call
   * `selected-detail.tsx` already makes for `Start Monitor`.
   *
   * ⚠️ **The row says nothing on that branch and must not start.** The refusal
   * copy lives on the detail face, in the flow below the reading. This row has
   * 42px and room for one fact.
   */
  onToggleWatch?: (sensorId: string) => void;
  /**
   * Whether the monitor set is at its cap. The page silently ignores a toggle
   * past `WATCH_MAX_SENSORS`, so an unwatched row at the cap renders its ring
   * disabled and says why — **a press that does nothing reads as a broken
   * control**, and that was invisible while the only ways in were the detail
   * button and the panel.
   */
  watchFull?: boolean;
}) {
  const age = sensorAgeSeconds(sensor, now);
  const distanceM = distanceFromOrigin(origin, sensor.lat, sensor.lon);
  const freshness: Freshness = age == null ? "fresh" : sensorFreshnessOf(age);
  const depth = formatDepth(sensor.depth_mm);

  // `plausible === false`, never `!plausible`: it is null on a sensor that has
  // never reported, and absence is not a fault. There is no number for the
  // instrument to have got wrong.
  const faulted = sensor.plausible === false;
  const over =
    !faulted &&
    freshness === "fresh" &&
    sensor.depth_mm != null &&
    sensor.depth_mm >= floodEventMm;

  // ⚠️ Withheld, never disabled, on `alert_permitted` — see the prop comment.
  const rail = onToggleWatch != null && sensor.alert_permitted;
  const railBlocked = rail && !watching && watchFull;
  const railLabel = watching
    ? "Monitored. Fluud emails you when this sensor crosses a threshold. Press to stop."
    : railBlocked
      ? "Not monitored. The monitor list is full. Remove a sensor to add this one."
      : "Not monitored. Press to get an email when this sensor crosses a threshold.";

  return (
    // ⚠️ A FLEX ROW since the monitor rail landed, and the `<li>` draws the
    // divider so it spans both children. The rail sits OUTSIDE the row button
    // because the row is itself one button and a button may not nest another.
    <li className="flex items-stretch border-b border-border last:border-b-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(sensor.sensor_id)}
        className={cn(
          // ⚠️ `py-1.5`, tighter than a camera row's `py-2.5`, and it is
          // measured rather than styled. The list must keep at least three
          // rows visible with the controls strip open (`list-controls.tsx`);
          // at 1440x900 the strip and the invariant-9 note leave ~143px, so a
          // 59px row showed **one**. At 46px it shows three. Re-measure if
          // anything is added to this row or to the strips above it.
          // ⚠️ A COLUMN since the depth bar landed (2026-08-15), same as
          // `StationRow`. The bar is a second line at full width because it is
          // a scale, and the two lists have to gain it together.
          // `min-w-0 flex-1` rather than `w-full`: the rail beside it is a
          // flex sibling now, and without the zero minimum this column refuses
          // to shrink below its content and pushes the ring off the track.
          "flex min-w-0 flex-1 cursor-pointer flex-col border-l-[3px] px-3 py-1.5 text-left",
          // Same rule as `StationRow`: selection is `--wl-select` magenta and
          // never `bg-accent`. The master theme's accent is an electric green,
          // and a green wash behind a depth reading is this page saying that
          // block is fine (the never-safe rule). Magenta is on no scale here at all.
          "hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "focus-visible:ring-inset focus-visible:outline-none",
          selected
            ? "border-l-[var(--wl-select)] bg-[var(--wl-select)]/12"
            : "border-l-transparent bg-transparent",
        )}
      >
        <span className="flex w-full items-center gap-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] leading-tight font-medium">
            <Highlight text={sensor.name ?? sensor.sensor_id} search={search} />
          </span>
          {/*
            Line 2 states OUR relationship to this instrument, not FloodNet's.
            `alert_permitted` is 343 sensors and means FloodNet considers their
            device healthy; a pairing means this page can show you the camera
            looking at the same corner. Neither is a warning — nothing on any
            page raises one.

            ⚠️ **The silence on the other branch is deliberate and it is why
            this row has survived two rounds of repair unchanged.** Every other
            surface making a claim about a pairing has been wrong at least once
            — first saying "display only" of 325 instruments this app will mail
            somebody about, then saying "warns on this page" after the on-page
            alert system was unwired. This row names the pairing when there is
            one and says nothing when there is not, so neither error had
            anywhere to land. **Do not "complete" it with a negative clause** —
            42px has room for one fact, and the one it cannot afford to get
            wrong is the one it currently omits.

            ⚠️ **With an origin set the raw `sensor_id` fallback is dropped, and
            that is the right thing to drop.** This is a measured 42px row in a
            312px column and the three-row floor depends on it, so a third field
            has to displace something. The pairing clause is not displaceable
            — it is the only place this row says what relationship this app has
            to this instrument. The id is the least load-bearing element here:
            nobody reads `curly_orange_shrimp`, the detail face still carries it,
            and it is the *fallback* branch rather than the informative one.

            ⚠️ **The distance never takes a colour** — see `DistanceLine` in
            `landing/block-search.tsx`, which carries the argument. Both ramp
            directions are wrong and `--wl-select` is spoken for.
          */}
          <span className="flex items-center gap-2 leading-tight">
            <span
              className={cn(
                "num shrink-0 text-[10.5px]",
                freshness === "fresh" && "text-muted-foreground",
                freshness === "stale" && "text-[var(--wl-stale)]",
                freshness === "dead" && "text-[var(--wl-dead)]",
              )}
            >
              {age == null ? "never reported" : formatAge(age)}
            </span>
            {origin && (
              <span className="num shrink-0 text-[10px] text-muted-foreground">
                {distanceM == null ? "no coordinate" : distanceText(distanceM)}
              </span>
            )}
            {(sensor.watched_camera_id || !origin) && (
              <span className="num truncate text-[10px] text-muted-foreground">
                {sensor.watched_camera_id ? (
                  "paired to a watched camera"
                ) : (
                  <Highlight text={sensor.sensor_id} search={search} />
                )}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {/*
            Never `0` for absence. `formatDepth(null)` is null and renders the
            em-dash; a sensor genuinely reading zero renders `0 mm`. Those are
            different facts and the difference is the whole of "absence of depth
            is not zero".
          */}
          <DepthCell
            depth={depth}
            windowed={windowed}
            peak={peak}
            muted={freshness !== "fresh" || faulted}
          />

          {/*
            At most one mark. FAULT wins: a faulted reading cannot also be a
            meaningful over-threshold one, and showing both would put a warning
            colour on a number the instrument cannot support.
          */}
          <span className="flex w-[54px] shrink-0 justify-end">
            {faulted ? (
              // Neutral-outlined in `--wl-stale`, the same "removed from the
              // scale" idiom `DepthBandPill` uses for an old reading — because
              // it is the same judgement. A faulted number has no place on a
              // scale of how deep the water is, and dimming it or dropping it a
              // notch would keep it there.
              <span
                className="rounded-sm border border-[var(--wl-stale)] px-[6px] py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] text-[var(--wl-stale)] uppercase"
                title="the instrument reported a depth it cannot physically support — a sensor fault, not water"
              >
                fault
              </span>
            ) : over ? (
              /* ⚠️ `--wl-cyan`, and that is a RECORDED EXCEPTION to the
                 poster-paint rule — cyan is normally chrome only. Taken from
                 the `Map flows` screens (2a/2e) on an answered question: the
                 fault chip stays `--wl-stale`, so the two marks now differ by
                 hue as well as by word, which is what the exception buys. It
                 does not vary with the reading — every over-threshold depth
                 wears the same cyan — so the colour-beside-a-reading rule
                 holds. The root `CLAUDE.md` records this at the poster-paint
                 bullet. */
              <span
                className="rounded-sm border border-[var(--wl-cyan)] px-[6px] py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] text-[var(--wl-cyan)] uppercase"
                title={`at or above FloodNet's ${floodEventMm}mm flood-event threshold`}
              >
                {floodEventMm}mm
              </span>
            ) : null}
          </span>
        </span>
        </span>

        {/*
          The row's own depth against curb height. ⚠️ **The SHARED component**,
          on `DepthCell`'s precedent: the camera list and this one gain a scale
          together or not at all.

          ⚠️ **A silent sensor draws no fill and says so.** ~35 deployments have
          never reported, and their four reading fields are null together — that
          is an absence of a number rather than a reading of zero, and the bar
          must not put a mark at the left end of a scale for it.
        */}
        <DepthBar
          valueMm={windowed ? (peak?.peak_mm ?? null) : sensor.depth_mm}
          freshness={freshness}
          faulted={faulted}
          windowed={windowed}
          emptyNote={
            windowed
              ? "nothing in this window"
              : age == null
                ? "has never reported"
                : "no reading"
          }
          floodEventMm={floodEventMm}
          curbHeightMm={curbHeightMm}
        />
      </button>

      {/*
        The monitor rail. ⚠️ **It REPEATS the row's selection wash rather than
        layering a second one**, so a selected row reads as one band across both
        children instead of two panes at different tints.

        ⚠️ **The ring is `--wl-select` when on and a plain `--border` hairline
        when off.** On means *the reader picked this*, which is exactly what that
        token is licensed for, and it matches `Start Monitor`'s pressed state on
        the detail face. It diverges from that button's `--wl-cyan` REST state
        deliberately: the button is one control carrying a word and can afford a
        colour, while 425 cyan rings down a list would be a colour field beside
        425 depths. **Neither end may ever be green.**

        ⚠️ **Nothing here varies with the reading.** The ring is one of two
        colours and both are facts about the reader.
      */}
      {rail && (
        <span
          className={cn(
            "flex shrink-0 items-center pr-2 pl-0.5",
            selected ? "bg-[var(--wl-select)]/12" : "bg-transparent",
          )}
        >
          <button
            type="button"
            aria-pressed={watching}
            aria-label={railLabel}
            title={railLabel}
            disabled={railBlocked}
            onClick={() => onToggleWatch(sensor.sensor_id)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md border",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
              railBlocked
                ? "cursor-not-allowed border-border opacity-40"
                : "cursor-pointer",
              watching
                ? "border-[var(--wl-select)] bg-[var(--wl-select)] text-[var(--primary-foreground)]"
                : "border-border text-muted-foreground hover:border-foreground/40",
            )}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              {watching && <circle cx="7" cy="7" r="2.5" fill="currentColor" />}
            </svg>
          </button>
        </span>
      )}
    </li>
  );
}
