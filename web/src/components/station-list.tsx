"use client";

import { DepthBar } from "@/components/depth-bar";
import { DepthCell } from "@/components/depth-cell";
import { DepthWindowMenu } from "@/components/depth-window-menu";
import { FreshnessLine } from "@/components/freshness-line";
import { Highlight } from "@/components/highlight";
import { ActiveFilterLine, ListControls } from "@/components/list-controls";
import { Panel, PanelHeader, PanelTools } from "@/components/panel";
import { ReadingAge } from "@/components/reading-age";
import { SensorRow } from "@/components/sensor-row";
import { DepthBandPill } from "@/components/depth-band-pill";
import { depthBand } from "@/lib/depth-band";
import { Step } from "@/components/step-button";
import { Button } from "@/components/ui/button";
import type {
  CameraStatus,
  DepthPeakEntry,
  SensorStatus,
} from "@/lib/api-types";
import { windowLabel } from "@/lib/depth-window";
import { ageSeconds, formatDepth, parseServerTime } from "@/lib/format";
import type { DepthPeaksState } from "@/lib/hooks/use-depth-peaks";
import { useNow } from "@/lib/hooks/use-now";
import {
  LIST_PAGE_SIZE,
  sensorTotals,
  type Instrument,
  type InstrumentMode,
  type InstrumentQuery,
} from "@/lib/instrument-query";
import { freshnessOf, type Freshness } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * The instrument list beside the map. Third way to select, after the pins and
 * the cards.
 *
 * ## ⚠️ The Sensors tab is a real list now, and the old reasoning is dead
 *
 * This header used to say:
 *
 * > *"A FloodNet sensor is **not independently addressable in this API.**
 * > Nothing on the wire is a sensor… So this toggle filters to the cameras that
 * > have a co-located sensor, and says so in those words. Building a parallel
 * > sensor list here would mean inventing coordinates and identity the payload
 * > does not carry."*
 *
 * **Both claims are now false, and they were only ever facts about the wire
 * rather than about sensors.** `/api/sensors` returns all 425 deployments with
 * their own `lat`/`lon`, borough, NTA, status and newest reading, so nothing has
 * to be invented — the coordinates are FloodNet's own. The old objection was
 * correct when it was written and is recorded here rather than deleted, on the
 * same terms as the removals in both `CLAUDE.md`s.
 *
 * What survives from it is the *rule* underneath: a list may not invent
 * structure the payload does not carry. That is why the sensor rows say
 * "drives a watched camera" or nothing at all, rather than implying every
 * deployment relates to this page — see `SensorRow` and the mode note below.
 *
 * ## The two lists are not interchangeable
 *
 * A camera row carries its PAIRED sensor's depth and a band against the two
 * borrowed thresholds; a sensor row carries its own millimetres and its own
 * qualifying chips. They are different instruments answering different
 * questions, which is why
 * `SensorRow` is its own component with its own rules rather than a variant
 * flag on `StationRow`.
 */
export function StationList({
  cameras,
  sensors,
  ordered,
  pageItems,
  page,
  pageCount,
  onPageChange,
  windowMin,
  onPickWindow,
  peaks,
  query,
  onQueryChange,
  selectedKind,
  selectedId,
  onSelectCamera,
  onSelectSensor,
  floodEventMm,
  curbHeightMm,
  loading,
  sensorsLoading,
  controlsOpen,
  onControlsOpenChange,
  watching,
  onToggleWatch,
  watchFull = false,
  className,
}: {
  cameras: CameraStatus[];
  sensors: SensorStatus[];
  /**
   * Derived in `page.tsx` — the same array the pager walks and the map reads.
   *
   * ⚠️ **The whole filtered set, not the page.** Every count in this panel
   * (the tab badges, the `n/total` chip, the empty states) is about the set,
   * and `pageItems` is the slice that is actually drawn. Rendering counts off
   * the slice would tell a reader they have 20 sensors in Brooklyn.
   */
  ordered: Instrument[];
  /** The rows actually drawn — `LIST_PAGE_SIZE` of `ordered`, from `page`. */
  pageItems: Instrument[];
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /**
   * The depth timeframe, `null` for the current reading. Owned by `page.tsx`
   * and shared with `SelectedDetail` — one window, two controls.
   */
  windowMin: number | null;
  onPickWindow: (minutes: number | null) => void;
  /** Every instrument's peak over `windowMin`, in one request. */
  peaks: DepthPeaksState;
  query: InstrumentQuery;
  onQueryChange: (q: InstrumentQuery) => void;
  selectedKind: "camera" | "sensor";
  selectedId: string | null;
  onSelectCamera: (cameraId: string) => void;
  onSelectSensor: (sensorId: string) => void;
  floodEventMm: number;
  curbHeightMm: number;
  loading: boolean;
  sensorsLoading: boolean;
  /**
   * ⚠️ Lifted to `page.tsx` on 2026-08-06 — it was local state here. Two
   * controls open the same strip now: the filter glyph in this chrome bar and
   * the mobile search bar's filters button, and a boolean owned here would
   * leave the second one pressing a door with no handle.
   */
  controlsOpen: boolean;
  onControlsOpenChange: (open: boolean) => void;
  /**
   * The reader's monitor set, as a `Set` rather than the page's array.
   *
   * ⚠️ **A `Set` because there are 425 rows.** The state in `page.tsx` is a
   * `string[]`, and `.includes()` per row is O(n·m) recomputed on every 15s
   * tick. The page memoises the set; this passes a boolean down.
   *
   * ⚠️ **This panel renders NO watch state of its own** — no count, no chip, no
   * empty state. `WatchPanel` in the rail is where the set is managed and where
   * the honesty copy lives. What is here is one ring per row.
   */
  watching?: ReadonlySet<string>;
  /** Omit it and no row grows a monitor ring. See `SensorRow`. */
  onToggleWatch?: (sensorId: string) => void;
  /** Whether the monitor set is at `WATCH_MAX_SENSORS`. See `SensorRow`. */
  watchFull?: boolean;
  className?: string;
}) {
  const now = useNow(15_000);

  const mode = query.mode;
  const totals = sensorTotals(sensors);
  const setMode = (m: InstrumentMode) => onQueryChange({ ...query, mode: m });

  return (
    /*
     * The height comes from the caller, and the reason is worth stating: this
     * shares the right-hand column with the detail panel and the gauges, and the
     * column as a whole is one screen tall. So each panel takes a share and the
     * scroll region absorbs the difference — see `page.tsx`.
     *
     * What has to be true here for that to work is that the scroll region
     * contributes **no intrinsic height**: its `<ul>` is absolutely positioned
     * inside a `min-h-0 flex-1` box, so the panel asks for only its header and
     * strips and then fills whatever it is given. Take the absolute positioning
     * away and the list's own rows size the column instead, and it grows past
     * the map.
     */
    <Panel aria-label="Instruments" className={className}>
      {/* The sheet's drag handle (screen 2j) — decoration saying "this edge
          pulls up", below `md` only. The sheet is scrolled, not dragged; the
          handle is the idiom readers know it by. */}
      <div
        aria-hidden="true"
        className="mx-auto mt-2 h-[3px] w-[34px] shrink-0 rounded-full bg-border md:hidden"
      />
      <PanelHeader className="gap-1">
        <div className="flex items-center gap-0.5 rounded-md bg-[var(--muted)] p-0.5">
          <ModeButton active={mode === "cameras"} onClick={() => setMode("cameras")}>
            Cameras <Count n={cameras.length} active={mode === "cameras"} />
          </ModeButton>
          <ModeButton active={mode === "sensors"} onClick={() => setMode("sensors")}>
            Sensors <Count n={totals.all} active={mode === "sensors"} />
          </ModeButton>
        </div>

        <PanelTools>
          {/* The result count. It is the honest answer to "what am I looking
              at" once a filter is on, and it is the only thing that makes a
              narrowed list distinguishable from a short one. */}
          <span className="num text-[10px] text-muted-foreground">
            {ordered.length}
            {ordered.length !== (mode === "cameras" ? cameras.length : totals.all) && (
              <span className="text-muted-foreground/70">
                /{mode === "cameras" ? cameras.length : totals.all}
              </span>
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={controlsOpen}
            aria-controls="instrument-controls"
            aria-label={controlsOpen ? "Hide list controls" : "Show list controls"}
            title={controlsOpen ? "Hide search and filters" : "Search and filter"}
            onClick={() => onControlsOpenChange(!controlsOpen)}
            className={cn(
              "size-6 p-0",
              controlsOpen ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <FilterGlyph />
          </Button>
        </PanelTools>
      </PanelHeader>

      {/*
        How old the freshest reading on the page is — moved down here from the
        masthead on the owner's instruction.

        ⚠️ **A strip under the chrome bar, and not inside it.** `PanelHeader` is
        pinned to `h-11` so this panel and the map beside it start their contents
        on the same line (see `panel.tsx`), and squeezing a sentence in next to
        the segmented control either overflows that box or forces it to grow and
        breaks the alignment for the whole page. Everything else added to this
        panel since — the controls strip, the active-filter line — follows the
        same precedent for the same reason.

        Gated on there being cameras at all: `FreshnessLine` renders null for an
        empty payload, and an empty bordered strip on a cold start is a box that
        looks broken. **This is the primary invariant-12 signal** — a poller
        the host has stopped scheduling is still `is_alive()`, so `/api/healthz` cannot see
        it and this line can. It does not get to be conditional on anything else.

        ⚠️ It stays on **cameras** even while the sensor tab is showing. It
        measures whether *our poller* is running, and a camera's `observed_at`
        is stamped by that poller; a sensor's is FloodNet's own publication
        clock, which keeps ticking whether or not we are healthy. Pointing this
        line at sensors would make a frozen Fluud look fine.
      */}
      {/*
        ⚠️ **The timeframe menu sits across from the freshness line** (owner's
        instruction). The two are deliberately opposite ends of one row and they
        are opposite kinds of statement: the line on the left says *how old the
        freshest reading is*, which is the frozen-poller rule and is about our poller; the
        control on the right asks *over what span should these depths be read*.
        Neither is a reading and neither takes a severity colour.

        ⚠️ **This is the SAME state the detail panel's copy sets** — one window,
        two controls, owned by `page.tsx`. Two independent windows would let this
        list say `last day` while the panel beside it said `current`, over two
        numbers about the same instrument.

        The freshness line stays gated on there being cameras (it renders null
        for an empty payload and an empty bordered strip reads as a broken box),
        but the ROW is not: the menu has to be reachable on the sensors tab
        during a cold camera payload, and a control that disappears while data
        loads is a control nobody finds twice.
      */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        {cameras.length > 0 ? <FreshnessLine cameras={cameras} /> : <span />}
        {/* ⚠️ `align="right"` because this sits at the RIGHT end of the row and
            `Panel` is `overflow-hidden`: a left-anchored 240px panel runs past
            the 312px track and the presets are clipped away entirely. */}
        <DepthWindowMenu
          minutes={windowMin}
          onPick={onPickWindow}
          align="right"
          className="shrink-0"
        />
      </div>

      {/*
        ⚠️ **REQUIRED TEXT while a window is picked, and it is the safety half
        of this feature.** Every depth below is a historical maximum. In the
        detail panel that figure carries `peak · last hour · from 149 readings`
        under it in its own line; a 42px row has no space for that, so the claim
        is made once, here, above every row it governs — and each row still
        wears the word `peak` beside its number.

        `web/src/lib/depth-window.ts` makes `peakLabel` incapable of producing a
        string without the word `peak`, on the argument that it is the only
        thing separating a historical figure from a current depth. That argument
        is not weaker at 13px in a list; it is stronger, because there are
        twenty of them and no other context.

        ⚠️ **It names the window the SERVER used** (`peaks.minutes`), never what
        was asked for. Retention clamps anything past seven days, and a
        seven-day peak labelled `last year` is the one way this feature can
        understate a flood.
      */}
      {windowMin != null && (
        <p className="shrink-0 border-b border-border px-3 py-1.5 text-[10.5px] leading-snug text-muted-foreground">
          {peaks.loading ? (
            <>Reading the peak over the {windowLabel(windowMin)}.</>
          ) : peaks.error ? (
            /* A statement about this request, never about the water — the same
               refusal `EmptyState` and `AddressNote` make, in the same words. */
            <>
              The peak over the {windowLabel(windowMin)} could not be loaded.
              This is a statement about this page, not about conditions.
            </>
          ) : (
            <>
              Depths below are the{" "}
              <b className="font-semibold text-foreground">
                peak over the {windowLabel(peaks.minutes ?? windowMin)}
              </b>{" "}
              — the highest believable reading in that window, not what these
              instruments report now. Faulted readings are excluded from it.
            </>
          )}
        </p>
      )}

      {/*
        ⚠️ **`ActiveFilterLine` renders whether the strip is open or closed**
        (screens 2e/2g). It used to render only while the strip was closed, on
        the reasoning that the open strip showed the same state — but the strip
        shows the *controls* and this line shows the *commitments*, and with
        the origin chip living here it is the one statement of reader-set
        state that never moves. It self-nulls when nothing is active.
      */}
      <ActiveFilterLine query={query} onChange={onQueryChange} />
      {controlsOpen && (
        <>
          {/* The mobile backdrop. Below `md` the strip presents as a fixed
              bottom sheet (screen 2j's filters face); pressing outside it
              closes it. `aria-hidden` and unfocusable — dismissal is also on
              the filter glyph and the bar's own button. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-black/55 md:hidden"
            onClick={() => onControlsOpenChange(false)}
          />
          {/*
            One strip, two presentations, one mount — inline above `md`, a
            fixed bottom sheet below it. `fixed` escapes the panel regardless
            of ancestry (no transform on the path), so the same tree serves
            both and nothing renders twice. When closed it unmounts, which is
            `display: none`'s stronger cousin — no `inert` needed because
            there is nothing left in the tab order at all.
          */}
          <div className="shrink-0 max-md:fixed max-md:inset-x-3 max-md:bottom-0 max-md:z-40 max-md:max-h-[80dvh] max-md:overflow-y-auto max-md:rounded-t-xl max-md:border max-md:border-b-0 max-md:border-border max-md:bg-card wl-scroll">
            <ListControls
              id="instrument-controls"
              query={query}
              onChange={onQueryChange}
              sensors={sensors}
              /* Both from what this panel already has, so the strip's state line
                 and the rows beneath it are derived from one source. */
              shown={ordered.length}
              total={mode === "cameras" ? cameras.length : totals.all}
            />
          </div>
        </>
      )}

      {mode === "sensors" && (
        /*
         * ⚠️ **This is the invariant-9 statement, and it is required text
         * rather than a caption.** A list of 425 instruments on a flood page
         * reads as 425 things watching out for you, and nothing else here tells
         * a reader which ones are.
         *
         * ⚠️ **It read "the rest are display only" until 2026-08-06, and that
         * was FALSE.** Every deployment in this list is polled and stored, and
         * `waterline/watch.py` — a sensor-only state machine with no camera in
         * it at all — will mail a subscriber about any sensor
         * `floodnet.alert_permitted` admits, which is ~343 of them.
         *
         * ⚠️ **This strip said "Fluud warns on this page from N" until the
         * on-page alert system was unwired, and that sentence is now false on
         * every instrument.** Nothing on any page raises a warning from
         * anything. The mail path is the only one left, so the strip names
         * that, and `watched_camera_id` is described as what it is — a camera
         * whose view this sensor's depth labels.
         *
         * Every number is derived from the payload — see `sensorTotals`. The
         * paired count is a count of SENSORS and is **not** the size of
         * `WATCH_CAMERAS`: 27 cameras are watched but four sensors serve more
         * than one of them, so it reads 21. Hard-coding "27" here would be
         * wrong in a way nobody would ever notice.
         *
         * ⚠️ **The reporting clause is gated on there being no window**, and
         * `depth-cell.tsx` is the reason: in windowed mode a row's dash comes
         * from the peak entry — nothing in the window, or every reading faulted
         * — and never from `observed_at`. Unconditional, it would explain a
         * dash the rows have stopped drawing for that reason, against a count
         * that no longer matches how many of them there are. The peak strip
         * above carries the windowed case.
         */
        <p className="shrink-0 border-b border-border px-3 py-1.5 text-[10.5px] leading-snug text-muted-foreground">
          All <b className="num font-semibold text-foreground">{totals.all}</b>{" "}
          FloodNet deployments. Every one is read and stored. Nothing on this
          page raises a warning; an email watch can be set on any healthy one.{" "}
          <b className="num font-semibold text-foreground">{totals.watched}</b>{" "}
          are paired to a camera whose view this page shows.{" "}
          {windowMin == null && (
            <>
              <b className="num font-semibold text-foreground">
                {totals.reporting}
              </b>{" "}
              are reporting a depth. The others show a dash.
            </>
          )}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        <ul className="wl-scroll absolute inset-0 m-0 list-none overflow-y-auto p-0">
          {ordered.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground italic">
              <EmptyState
                mode={mode}
                loading={mode === "sensors" ? sensorsLoading : loading}
                filtered={
                  mode === "sensors" ? sensors.length > 0 : cameras.length > 0
                }
                total={mode === "sensors" ? totals.all : cameras.length}
                query={query}
                onQueryChange={onQueryChange}
              />
            </li>
          ) : (
            pageItems.map((item) =>
              item.kind === "camera" ? (
                <StationRow
                  key={item.id}
                  camera={item.camera}
                  now={now}
                  search={query.search}
                  selected={selectedKind === "camera" && item.id === selectedId}
                  onSelect={onSelectCamera}
                  /* ⚠️ Both halves or neither. `peak` without `windowed` would
                     render a historical maximum wearing no label at all, which
                     is the one thing the mode note above exists to prevent. */
                  windowed={windowMin != null}
                  peak={peaks.byId.get(item.id) ?? null}
                  floodEventMm={floodEventMm}
                  curbHeightMm={curbHeightMm}
                />
              ) : (
                <SensorRow
                  key={item.id}
                  sensor={item.sensor}
                  now={now}
                  floodEventMm={floodEventMm}
                  /* Only the depth BAR needs this — the row still wears no
                     band pill, because its number is its own rather than a
                     paired sensor's. See `SensorRow`'s header. */
                  curbHeightMm={curbHeightMm}
                  /* Read off the query rather than passed as its own prop:
                     `ordered` was derived from this exact origin, so a second
                     source could put a distance on a row the sort did not use. */
                  origin={query.origin}
                  search={query.search}
                  selected={selectedKind === "sensor" && item.id === selectedId}
                  onSelect={onSelectSensor}
                  windowed={windowMin != null}
                  peak={peaks.byId.get(item.id) ?? null}
                  watching={watching?.has(item.id) ?? false}
                  onToggleWatch={onToggleWatch}
                  watchFull={watchFull}
                />
              ),
            )
          )}
        </ul>
      </div>

      {/*
        The list pager. **Owner's instruction**: stop the list after 20 rows and
        page.

        ⚠️ **`Step` is the SHARED button** (`step-button.tsx`), which the harbor
        pager and the instrument pager already use. That file was extracted
        rather than copied for exactly this moment — three pagers on one screen
        have to look and behave identically or they read as three mechanisms.
        This one keeps its own windowing logic, as the other two do.

        ⚠️ **It renders only when there is more than one page**, so a filtered
        list of four instruments does not grow a dead control saying `1 of 1`.
        It is `shrink-0` and OUTSIDE the scroll region, so it cannot scroll away
        from the rows it pages — a pager you have to reach the bottom of a list
        to find is a pager nobody uses.

        ⚠️ **The count is of `ordered`, not of the page** — `n of N instruments`
        is about the filtered set, which is what the reader narrowed. Counting
        the slice would say `20` forever.

        ⚠️ **No wrapping**, on `InstrumentPager`'s rule: disabled at both ends.
        On a worst-first sort, wrapping teleports from the worst instrument to
        the best.
      */}
      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          <span className="font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase">
            <span className="num">{page * LIST_PAGE_SIZE + 1}</span>–
            <span className="num">
              {Math.min((page + 1) * LIST_PAGE_SIZE, ordered.length)}
            </span>{" "}
            of <span className="num">{ordered.length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase">
              page <span className="num">{page + 1}</span>/
              <span className="num">{pageCount}</span>
            </span>
            <Step
              label="Previous page"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 0}
            >
              ‹
            </Step>
            <Step
              label="Next page"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount - 1}
            >
              ›
            </Step>
          </span>
        </div>
      )}
    </Panel>
  );
}

/**
 * ⚠️ **No empty state here says "all clear".** Every one of them is an absence
 * of observation, and this page does not report that anywhere is safe
 * (the never-safe rule). The filtered case says so out loud, because a reader who has
 * narrowed a list to nothing is the reader most likely to read the emptiness as
 * an answer about the city.
 *
 * The filtered branch also *accounts and undoes* (screen `2h`): a mono
 * `0 of N` line above the refusal, and one `clear …` button per active
 * control. The design draws one button because it draws one scenario — naming
 * every control that is on is the point of the screen, because the reader who
 * emptied the list with three chips does not remember which three.
 */
function EmptyState({
  mode,
  loading,
  filtered,
  total,
  query,
  onQueryChange,
}: {
  mode: InstrumentMode;
  loading: boolean;
  filtered: boolean;
  /** Rows in this mode with no query at all — the denominator. */
  total: number;
  query: InstrumentQuery;
  onQueryChange: (q: InstrumentQuery) => void;
}) {
  if (loading) return <>Reading the instruments.</>;
  if (filtered) {
    const set = (patch: Partial<InstrumentQuery>) =>
      onQueryChange({ ...query, ...patch });
    const clears: { name: string; patch: Partial<InstrumentQuery> }[] = [];
    if (query.search.trim() !== "") {
      clears.push({ name: "search", patch: { search: "" } });
    }
    if (query.watchedOnly) {
      clears.push({ name: "watched", patch: { watchedOnly: false } });
    }
    if (query.reportingOnly) {
      clears.push({ name: "reporting", patch: { reportingOnly: false } });
    }
    if (query.tidalOnly) {
      clears.push({ name: "tidal", patch: { tidalOnly: false } });
    }
    if (query.overThresholdOnly) {
      clears.push({
        name: "over threshold",
        patch: { overThresholdOnly: false },
      });
    }
    if (query.faultsOnly) {
      clears.push({ name: "faults", patch: { faultsOnly: false } });
    }
    for (const b of query.boroughs) {
      clears.push({
        name: b,
        patch: { boroughs: query.boroughs.filter((x) => x !== b) },
      });
    }
    return (
      <>
        <span className="num block font-mono text-[10px] tracking-[0.06em] not-italic">
          0 of {total} {mode === "sensors" ? "sensors" : "cameras"}
        </span>
        <span className="mt-1 block">
          No {mode === "sensors" ? "sensor" : "camera"} matches this filter.
          This is not a statement about conditions.
        </span>
        {clears.length > 0 && (
          <span className="mt-2.5 flex flex-wrap items-center gap-1.5 not-italic">
            {clears.map(({ name, patch }) => (
              <button
                key={name}
                type="button"
                onClick={() => set(patch)}
                className="cursor-pointer rounded-full border border-border px-2.5 py-[5px] font-mono text-[9.5px] leading-none tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              >
                clear {name}
              </button>
            ))}
          </span>
        )}
      </>
    );
  }
  return mode === "sensors" ? (
    <>No sensors are reporting. This is not a statement about conditions.</>
  ) : (
    <>No cameras are reporting. This is not a statement about conditions.</>
  );
}

/** A magnifier. It was three slider bars until 2026-08-06, on the owner's
 *  instruction — the strip it opens leads with the address and the search, so
 *  the glyph names what a reader is most likely reaching for. A glyph rather
 *  than a word, because the chrome bar has no room for one beside the
 *  segmented control and the count. Hand-drawn like every other mark here,
 *  `aria-hidden` — the button's `aria-label` carries the name. */
function FilterGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

/**
 * One half of a segmented control. Still two real buttons with `aria-pressed` —
 * the recessed track behind them is a background, not a widget, so the shadcn
 * surface stays card / badge / alert / button.
 */
function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-7 gap-1.5 rounded-[6px] px-2.5 text-xs transition-colors",
        active
          ? "bg-card text-foreground shadow-sm hover:bg-card"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "num text-[10px]",
        active ? "text-muted-foreground" : "text-muted-foreground/70",
      )}
    >
      {n}
    </span>
  );
}

function StationRow({
  camera,
  now,
  search,
  selected,
  onSelect,
  windowed,
  peak,
  floodEventMm,
  curbHeightMm,
}: {
  camera: CameraStatus;
  now: number;
  /** Both borrowed thresholds, for the depth band. Never hard-coded. */
  floodEventMm: number;
  curbHeightMm: number;
  /** The list's search text, for marking why this row matched. */
  search: string;
  selected: boolean;
  onSelect: (cameraId: string) => void;
  /**
   * ⚠️ **Whether the DEPTH CELL is a peak** — the reader has picked a
   * timeframe. It is a separate prop from `peak` rather than inferred from it
   * being non-null, because a null `peak` in windowed mode is a real answer
   * (the window was empty) and must still render under the word. Inferring
   * would silently drop the label on exactly the rows that need it most.
   */
  windowed: boolean;
  peak: DepthPeakEntry | null;
}) {
  const at = parseServerTime(camera.observed_at);
  const age = at ? ageSeconds(at, now) : 0;
  const freshness: Freshness = !at || age < 0 ? "fresh" : freshnessOf(age);
  const depth = formatDepth(camera.depth_mm);
  const faulted = !camera.depth_plausible;

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(camera.camera_id)}
        className={cn(
          // ⚠️ A COLUMN since the depth bar landed (2026-08-15). The name/depth
          // row is unchanged and the bar is a second line under it, full width —
          // it is a scale, and a scale in a 52px gutter is a smear.
          "flex w-full cursor-pointer flex-col border-l-[3px] px-3 py-2.5 text-left",
          // ⚠️ Selection tints the row in `--wl-select`, and it is still NOT
          // `bg-accent`. The master theme's accent is an electric green, and a
          // green wash behind a camera's depth reading is this page saying that
          // camera is fine, at every severity including EMERGENCY (the never-safe rule,
          // the same call as `LEVEL_PANEL_BG.clear` being `bg-card`).
          // `--wl-select` is the master's magenta, which is on no scale in this
          // app at all — it says "you picked this row", which is a fact about
          // the reader rather than about the street. See the token's comment.
          //
          // Hover stays a neutral `--foreground` tint on purpose: hover is
          // "you might pick this" and only the committed state earns a colour.
          "hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "focus-visible:ring-inset focus-visible:outline-none",
          selected
            ? "border-l-[var(--wl-select)] bg-[var(--wl-select)]/12"
            : "border-l-transparent bg-transparent",
        )}
      >
        <span className="flex w-full items-center gap-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            <Highlight text={camera.name} search={search} />
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <ReadingAge observedAt={camera.observed_at} />
            {camera.sensor_id && (
              <span className="num truncate text-[10px] text-muted-foreground">
                <Highlight text={camera.sensor_id} search={search} />
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {/* An unpaired camera has no depth. Em-dash, never a zero, and never
              a blank that reads as calm. A faulted one keeps its digits and
              loses its band — same idiom as staleness.

              ⚠️ In windowed mode this cell is a PEAK and says so — see
              `DepthCell`, which both row kinds share so the word cannot appear
              on one list and not the other. */}
          <DepthCell
            depth={depth}
            windowed={windowed}
            peak={peak}
            muted={freshness !== "fresh" || faulted}
            title={
              faulted && !windowed
                ? "the sensor reported a depth it cannot physically support — a fault, not water"
                : undefined
            }
          />
          <DepthBandPill
            band={depthBand(camera.depth_mm, floodEventMm, curbHeightMm)}
            freshness={freshness}
            floodEventMm={floodEventMm}
            curbHeightMm={curbHeightMm}
          />
        </span>
        </span>

        {/*
          The same depth against curb height, as a scale. ⚠️ **The SHARED
          component**, on `DepthCell`'s precedent — a bar that appeared on the
          camera list and not the sensor list would read as the two measuring
          different things.

          ⚠️ **`valueMm` is the number the CELL is showing**, so the bar and the
          digits cannot disagree. In windowed mode that is the peak, and the bar
          goes neutral because a peak never takes the band.
        */}
        <DepthBar
          valueMm={windowed ? (peak?.peak_mm ?? null) : camera.depth_mm}
          freshness={freshness}
          faulted={faulted}
          windowed={windowed}
          /* Not "no reading" — 832 of 969 cameras have no paired sensor at all,
             which is a permanent property of the deployment rather than a
             failure to report. `selected-detail.tsx` says the same thing at
             length on the face this row opens. */
          emptyNote={
            windowed
              ? "nothing in this window"
              : camera.sensor_id
                ? "no reading"
                : "no co-located sensor"
          }
          floodEventMm={floodEventMm}
          curbHeightMm={curbHeightMm}
        />
      </button>
    </li>
  );
}
