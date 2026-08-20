"use client";

import { FlipCard, FlipTrigger } from "@/components/flip-card";
import { GaugeSparkline } from "@/components/gauge-sparkline";
import { NwsAlerts } from "@/components/nws-alerts";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelTools,
} from "@/components/panel";
import { Card, CardContent } from "@/components/ui/card";
import type {
  GaugeHistoryPoint,
  GaugeStatus,
  NwsStatus,
} from "@/lib/api-types";
import { ageSeconds, formatAge, parseServerTime } from "@/lib/format";
import { useGaugeHistory } from "@/lib/hooks/use-gauge-history";
import { useNow } from "@/lib/hooks/use-now";
import { gaugeFreshnessOf, type Freshness } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * How many gauge cards the grid has cells for.
 *
 * ⚠️ **Mirrors `waterline/gauges.py`'s `GAUGES`, and it is a capacity rather
 * than a policy.** A sixth gauge added upstream does not disappear — the panel
 * says how many it could not place. That is the map's idiom for what its marks
 * withhold, applied one panel over, and it exists because the alternative is a
 * silently dropped instrument that looks exactly like a quiet one.
 *
 * ⚠️ **This replaced `PER_VIEW = 2` and the pager on 2026-08-15.** Two-up came
 * from the stacked rail, where this panel had a 256px slot and paging was the
 * only way five cards fit. Tabbing the rail gave the panel the whole 776px
 * track, so the window, its clamp, the selection override and both arrows all
 * went: with every card on screen there is nothing to page to, and a map
 * selection now flips a card that is already visible.
 */
const GRID_MAX = 5;

/**
 * The harbor and stream gauges — the baseline a street reading is read against.
 *
 * ## Why this is on the page at all
 *
 * FloodNet says there is 40mm of water on a block. That number means two
 * different things depending on whether the harbor is high or a storm is
 * draining, and until this panel existed the page could not tell you which.
 * `sensors.tidal` has recorded which sensors the distinction applies to since
 * the first commit; there was simply no harbor number to read it against.
 *
 * ## It is the bottom panel of the right-hand column
 *
 * It was full width below both frames. It now sits under `SelectedDetail` as
 * the last of three panels sharing one screen of height — so the gauges are
 * beside the map that plots them rather than a scroll away from it, and
 * pressing a diamond turns a card the reader can actually see.
 *
 * ⚠️ **It therefore must not contribute intrinsic height.** Its slot is roughly
 * a third of the viewport and it may never ask for more, or it pushes the
 * workspace past a screen and takes itself below the fold. The header is
 * `shrink-0`; the body is `min-h-0 flex-1` and the cards are sized *by* it
 * rather than the other way round.
 *
 * ## Two cards at a time, paged — no scrolling
 *
 * Five cards in a third of a screen was a scroll window showing one and a half,
 * which reads as a panel that failed to load rather than one you can move
 * through. It shows **two, side by side, at full slot height**, with `‹` / `›`
 * stepping the window one gauge at a time. Two is what fits at a legible card
 * width in a half-page column; stepping by one rather than by two means every
 * position is full, so there is no half-empty last page.
 *
 * ⚠️ **The window follows the map's selection, and it is derived rather than
 * synced.** Pressing a diamond for a gauge outside the current pair moves the
 * window to it — otherwise the map would flip a card nobody can see. Deriving
 * that during render is the same call `page.tsx` makes for `selectedId` and
 * `use-history.ts` makes for its points: an effect renders one frame with the
 * wrong pair on screen first, and the flip animation makes that frame visible.
 *
 * ## One card per gauge, and each has a back
 *
 * It was five rows in a grid. Rows made five gauges look like five points on
 * one list, which is the exact reading the datum caveat below spends a
 * paragraph undoing — and the caveat itself was one block of prose at the
 * bottom, attached to no gauge in particular. Cards separate them, and the back
 * of each card carries **that gauge's own** datum, its own threshold (or the
 * absence of one), and its own age. The general caveat stays in the footer; the
 * specific one now travels with the number it qualifies.
 *
 * ## Selection is shared with the map
 *
 * A flipped card and a lit marker are the same state, held in `page.tsx`. Press
 * a card and its diamond lights on the map; press the diamond and the card
 * turns over. That is the whole of "integrated with the map" — the answer to
 * *where is this gauge* is on the drawing, and the answer to *what is this
 * number measured against* is on the back of the card, and one press gets you
 * both. Cameras already work this way through `selectedId`; this is the same
 * pattern for the second instrument class.
 *
 * ## What it may and may not claim
 *
 * These are **regional instruments**. The Battery is one point at the bottom of
 * Manhattan and the four USGS gauges are creeks; none of them measures anyone's
 * block, and this panel must never be read as saying that they do.
 *
 * ⚠️ **The footer that said so has been removed on the owner's instruction**,
 * and is recorded here rather than dropped silently — the same treatment as the
 * map's gauge key and its invariant-17 caption. It read: *"Regional gauges, not
 * street readings — the Battery is one point at the tip of Manhattan and the
 * rest are creeks. They say what the water around the city is doing, never what
 * is happening on a given block. Levels are measured against each gauge's own
 * datum and are not comparable to each other. Press a gauge to see what its
 * number is measured against, and to find it on the map."*
 *
 * That was the only place on the page stating the regional claim and the
 * no-comparison rule **without a press**. What still carries them: the card
 * backs, each of which opens with "Not comparable to the other gauges" and ends
 * "not a reading for any block"; the per-marker tooltip on the map; the "no
 * published flood stage" line on the four creeks; and the fact that no code
 * path anywhere ranks, sums or shares an axis between two gauges. So the claim
 * is one press away in two places instead of under the cards — a real
 * weakening, of the same kind as the removals recorded in the root CLAUDE.md,
 * not a restyle. **If it goes back, it goes back in a footer under the cards.**
 *
 * ⚠️ **Levels are not comparable between gauges**, so they are never ranked,
 * summed, or put on a shared scale here. NOAA is referenced to MLLW and each
 * USGS site to its own local datum — 0.65 ft at Bronx River and 4.46 ft at the
 * Battery are not two points on one axis. Each gauge gets its own card, its own
 * threshold if it has one, and no comparison to its neighbours. Cards make that
 * harder to violate than rows did, which is half the reason for the change.
 *
 * ⚠️ **Nothing here is ever green** (the never-safe rule). A calm harbor rendered in
 * confident green beside a flood map is this page saying conditions are fine,
 * which is the one thing it may never say. Normal is muted; the colour appears
 * only when a gauge crosses its published threshold or stops reporting.
 *
 * ⚠️ Ages use `gaugeFreshnessOf`, **not** `freshnessOf`. A healthy CO-OPS
 * station publishes every six minutes and a USGS site every fifteen, so the
 * camera thresholds would paint this panel permanently amber. See
 * `lib/staleness.ts`.
 */
export function HarborBaseline({
  gauges,
  nws,
  selectedGaugeId,
  onSelectGauge,
  className,
}: {
  gauges: GaugeStatus[];
  /* ⚠️ Threaded down from `/api/status` rather than fetched here, unlike the
     traces below. The traces have their own route and their own 60s clock; this
     rides the 15s status poll the page already makes, so a second request would
     be asking for a body we already hold. */
  nws: NwsStatus | null | undefined;
  selectedGaugeId: string | null;
  onSelectGauge: (gaugeId: string | null) => void;
  className?: string;
}) {
  // 30s. These publish every 6-15 minutes, so a faster clock buys re-renders
  // and nothing else. The age text still ticks; it just does not need to.
  const now = useNow(30_000);

  /*
   * The traces, one request for all five. Deliberately fetched here rather than
   * threaded down from `page.tsx`: this is the only consumer, it is already a
   * client component, and the alternative is a prop that exists solely to be
   * passed through a page that never reads it.
   *
   * A missing or failed series is **not** an error state on this panel. The
   * level, the threshold and the age all come from `/api/status` and are
   * unaffected; the sparkline simply does not draw. A banner for a decoration
   * that failed would be louder than the thing it is about.
   */
  const history = useGaugeHistory();
  const seriesFor = (gaugeId: string): GaugeHistoryPoint[] =>
    history.data?.series.find((s) => s.gauge_id === gaugeId)?.points ?? [];

  // Same rule as MessageStrip and AlertList: say nothing rather than show an
  // empty box. Before the first gauge tick there is genuinely nothing to say.
  //
  // ⚠️ **The NWS block goes with it**, and that is deliberate rather than an
  // oversight: this whole panel is `null` until the poller has answered once,
  // so a reader never meets an alerts box floating over an empty frame. When
  // there is a gauge to draw there is also an `nws` block on the same payload.
  if (gauges.length === 0) return null;

  const rated = gauges.filter((g) => g.minor_flood_ft !== null);
  const high = rated.filter((g) => g.level_ft >= (g.minor_flood_ft ?? Infinity));

  // Everything the payload holds, up to the grid's capacity. See `GRID_MAX`.
  const visible = gauges.slice(0, GRID_MAX);
  const unplaced = gauges.length - visible.length;

  return (
    <Panel className={className}>
      <PanelHeader>
        {/* ⚠️ **The title IS the caption now** — "tide and stream gauges"
            rather than "Harbor baseline", **on the owner's instruction**. The
            two were competing for one 372px bar that also holds a window
            position and two pager buttons, and "HARBOR BASEL…" was truncating.
            Naming the instruments is the more useful of the two: "harbor" was
            already a slight overclaim for a set that is one tide gauge and four
            creeks, and this says what they are. The panel's own caveats — one
            datum each, not comparable, not a street reading — live on the card
            backs where they always have. */}
        <PanelTitle>Tide, stream and weather</PanelTitle>
        <PanelTools>
          {/* The count of gauges over their own published stage is the one
              thing in this bar that is a warning, so it keeps its place and its
              colour at every width. It no longer has a non-warning sibling to
              share the row with — that label became the title. */}
          {high.length > 0 && (
            <span className="text-[11px] text-[var(--wl-warning)]">
              {high.length} above minor flood
            </span>
          )}
        </PanelTools>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5">
        <NwsAlerts nws={nws} nowMs={now} />

        {/* ⚠️ **All five cards at once, and the pager is gone.** See the
            docblock. The cards are sized by this box rather than sizing it:
            `min-h-0` plus `minmax(0,1fr)` rows is what lets a card be shorter
            than its content wants and hand the difference to the sparkline,
            which is the one element here happy at any height.

            ⚠️ **The FIRST row is 0.8fr and the short row has to be that one.**
            This is measured and it is the opposite of what the arithmetic
            predicted. A card back's height is set by how many lines its closing
            paragraph wraps to, so the wide tide card is the CHEAPEST row rather
            than the most expensive: at 350px it needs **154px**, and each
            170px creek card needs **197px**. Shipping the short row last — the
            obvious reading of "the last row can give up slack" — made both
            bottom card backs scroll by 35px while the wide card sat on 49px it
            had no use for.

            ⚠️ **So the fraction is not a taste dial.** 0.8fr first gives
            162.6 / 203.2 / 203.2 against needs of 154 / 197 / 197 — margins of
            8.6 and 6.2px. **Anything added to a card back spends that**, and
            the check is turning every card over at 1440×900, not reading this
            comment. See `MEASUREMENTS.md`. */}
        <div className="grid min-h-0 flex-1 grid-cols-2 [grid-template-rows:minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
          {visible.map((g, i) => (
            <GaugeCard
              key={g.gauge_id}
              gauge={g}
              now={now}
              points={seriesFor(g.gauge_id)}
              selected={g.gauge_id === selectedGaugeId}
              onSelect={onSelectGauge}
              /* ⚠️ **Keyed on POSITION, never on a reading.** The server sorts
                 NOAA first, so the wide cell is the tide gauge — one tide gauge
                 above four creeks, which is what this set actually is. It says
                 WHICH INSTRUMENT this is, exactly as the diamond shape does on
                 the map. It may never be keyed on `level_ft`, on
                 `minor_flood_ft`, or on being above threshold: card size would
                 become a severity ramp, and the never-compare rule would be
                 broken by geometry instead of by colour. */
              className={i === 0 ? "col-span-2" : undefined}
            />
          ))}
        </div>

        {/* ⚠️ Counts what it could not place rather than clipping in silence —
            the map's idiom for what its marks withhold. Unreachable today
            (`GRID_MAX` mirrors `gauges.GAUGES`) and here for the commit that
            adds a sixth gauge and forgets this file. */}
        {unplaced > 0 && (
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {unplaced} more {unplaced === 1 ? "gauge is" : "gauges are"} reporting
            and not drawn here.
          </p>
        )}
      </div>
    </Panel>
  );
}

/*
 * ⚠️ `Step` was defined here, moved to `@/components/step-button`, and this file
 * no longer uses it at all — the pager went with two-up on 2026-08-15.
 *
 * **It is not orphaned**: `selected-detail.tsx` and `station-list.tsx` both
 * still mount it, which is why it was extracted rather than copied in the first
 * place — two pagers in one column, four glyphs apart, have to look and behave
 * identically or they read as two different mechanisms. That argument now binds
 * those two and no longer binds this file.
 */

/** Everything both faces need to agree on, derived once. */
function readGauge(gauge: GaugeStatus, now: number) {
  const at = parseServerTime(gauge.observed_at);
  const age = at ? ageSeconds(at, now) : 0;
  // A future timestamp is a clock disagreement rather than an old reading, and
  // `formatAge` already says so in words. Treating it as fresh here avoids
  // making a second, wronger claim about the same fact — same call as the map.
  const freshness: Freshness = !at || age < 0 ? "fresh" : gaugeFreshnessOf(age);
  const threshold = gauge.minor_flood_ft;
  const above = threshold !== null && gauge.level_ft >= threshold;
  return { age, freshness, threshold, above };
}

/**
 * Stale and dead leave the scale entirely rather than dimming, for invariant
 * 16's reason applied to gauges: an hour-old "well below flood stage" in
 * confident type is worse than no number, because it reads as reassurance.
 *
 * ⚠️ **The level never takes the trace's colour.** It is the one element on this
 * face that is a *reading*, and a reading may only ever be neutral,
 * over-threshold, stale or dead. Colouring it would make hue look like it
 * encoded magnitude, which is the whole thing gauges may not do — see
 * `seriesColour` in `gauge-sparkline.tsx`, which is allowed a colour precisely
 * because it does *not* vary with the level.
 */
function levelColour(freshness: Freshness, above: boolean): string {
  if (freshness === "dead") return "text-[var(--wl-dead)]";
  if (freshness === "stale") return "text-[var(--wl-stale)]";
  if (above) return "text-[var(--wl-warning)]";
  return "text-foreground";
}

/*
 * ⚠️ **The colour on these cards is on the TRACE and nowhere else**, and the
 * rule lives with the drawing — `seriesColour` in `gauge-sparkline.tsx`.
 *
 * A per-gauge palette was built here first — the master's five unused
 * `--chart-*` slots, one per gauge, encoding *which instrument* rather than how
 * high — and it was cut back to a single `--wl-graph` magenta on the graphs
 * alone, **on the owner's instruction**. Recorded rather than dropped quietly,
 * because the reasoning is worth keeping if it ever comes back: five distinct
 * hues state "these are five unrelated instruments on five datums" in the
 * ordinary chart idiom, which is the claim every one of these card backs spends
 * a sentence making. One shared colour does not state it — but neither did the
 * uniform slate that preceded it, so nothing regressed.
 *
 * What both versions share is the rule that makes either safe: **colour here is
 * never a reading.** It does not vary with the level, so it cannot be a
 * severity. The level, the threshold line and the printed endpoints carry how
 * high the water is; the trace carries only its shape. The card's own chrome —
 * name, unit, age — stays neutral, which is what "graphs only" means in
 * practice.
 */

function GaugeCard({
  gauge,
  now,
  points,
  selected,
  onSelect,
  className,
}: {
  gauge: GaugeStatus;
  now: number;
  points: GaugeHistoryPoint[];
  selected: boolean;
  onSelect: (gaugeId: string | null) => void;
  /* Grid placement only — today just `col-span-2` on the tide gauge. ⚠️ It is
     passed the CELL, never anything about the reading: see the call site. */
  className?: string;
}) {
  const { age, freshness, threshold, above } = readGauge(gauge, now);
  const toggle = () => onSelect(selected ? null : gauge.gauge_id);

  return (
    <FlipCard
      className={className}
      flipped={selected}
      front={
        <GaugeShell freshness={freshness} selected={selected}>
          <FlipTrigger
            flipped={selected}
            label={`Show what ${gauge.name} is measured against, and find it on the map`}
            onClick={toggle}
          />
          <GaugeFace
            gauge={gauge}
            age={age}
            freshness={freshness}
            threshold={threshold}
            above={above}
            points={points}
          />
        </GaugeShell>
      }
      back={
        <GaugeShell freshness={freshness} selected={selected}>
          <FlipTrigger
            flipped={selected}
            label={`Back to the reading for ${gauge.name}`}
            onClick={toggle}
          />
          <GaugeDetail
            gauge={gauge}
            age={age}
            freshness={freshness}
            threshold={threshold}
            above={above}
          />
        </GaugeShell>
      }
    />
  );
}

/**
 * The frame, shared by both faces.
 *
 * The border tracks freshness exactly as a camera card's does, and for the same
 * reason — a gauge that has stopped reporting has to be visible as such from
 * across the panel, not only in the age text.
 */
function GaugeShell({
  freshness,
  selected,
  children,
}: {
  freshness: Freshness;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      size="sm"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative h-full gap-0 overflow-hidden rounded-md border py-0",
        freshness === "fresh" && "border-border",
        freshness === "stale" && "border-[var(--wl-stale)]",
        freshness === "dead" && "border-[var(--wl-dead)]",
        // `--wl-select`, the same ring a selected camera card wears, because it
        // is the same act — and it matters more here, since pressing a diamond
        // on the map lights this card from across the column. Magenta is on no
        // scale in this app, which is what lets a gauge wear it: the one thing
        // a gauge may never do is take a colour that reads as a level
        // (the never-safe rule). See the token's comment.
        selected ? "ring-2 ring-[var(--wl-select)]" : "ring-0",
      )}
    >
      {children}
    </Card>
  );
}

/**
 * The front: the name, the number, the shape, and how old it is.
 *
 * ⚠️ **Three lines were cut from this face on the owner's instruction**, and
 * what went is recorded here rather than dropped quietly:
 *
 * - the **network chip** (`noaa` / `usgs`). It said which operator, never what
 *   the number meant. The back names the network *and* the station id, and
 *   `ft MLLW` versus bare `ft` already separates the two classes on the front.
 * - **"N ft below minor flood (6.90)"**, when the gauge is below its threshold.
 *   This is the real loss: the front no longer prints the distance to flood
 *   stage. The *crossing* still shows here — `above` keeps its warning line,
 *   because a gauge over its own published stage may never be something you
 *   have to turn a card over to find out about — and the threshold itself is on
 *   the back, one press away, with the sparkline's own flood-stage line drawing
 *   whenever the level comes near enough for the window to contain it.
 * - **"no published flood stage"**, on the four creeks. Also on the back, in
 *   those words, under `flood stage`. What that costs: a reader who never turns
 *   a creek card over sees a number with no stated frame of reference at all,
 *   which is the reading LIMITATIONS §8 exists to prevent. Nothing was
 *   *borrowed* to fill the gap — that would be worse and remains forbidden —
 *   but the absence is now silent on this face.
 *
 * What may never leave this face, whatever it is restyled into: the **age**
 * (the frozen-poller and stale-leaves-the-scale rules — a stale gauge has to be visible as stale from across
 * the panel), the **above-threshold line**, and the sparkline's **printed
 * endpoints**, which are the compensating control for it autoscaling. See
 * `gauge-sparkline.tsx`.
 */
function GaugeFace({
  gauge,
  age,
  freshness,
  threshold,
  above,
  points,
}: {
  gauge: GaugeStatus;
  age: number;
  freshness: Freshness;
  threshold: number | null;
  above: boolean;
  points: GaugeHistoryPoint[];
}) {
  return (
    <CardContent className="flex h-full flex-col px-2.5 py-2">
      {/* No legend swatch here, and that is the "graphs only" rule doing its
          job: a coloured dot beside a gauge's name is a mark on the card, and
          this card's chrome stays neutral so the only colour on the face is the
          shape of the water. */}
      <div className="flex items-baseline justify-between gap-1.5">
        <span
          className="truncate text-[11px] leading-tight font-medium"
          title={gauge.name}
        >
          {gauge.name}
        </span>
        {/* Age rides on the name line rather than in a footer of its own. It
            is the one thing on this face that can invalidate everything else
            on it, so it stays, and it keeps its colour off the ramp. */}
        <span
          className={cn(
            "num shrink-0 text-[10px] text-muted-foreground",
            freshness === "stale" && "text-[var(--wl-stale)]",
            freshness === "dead" && "text-[var(--wl-dead)]",
          )}
        >
          {formatAge(age)}
        </span>
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            "num text-[17px] leading-none",
            levelColour(freshness, above),
          )}
        >
          {gauge.level_ft.toFixed(2)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          ft{gauge.network === "noaa" ? " MLLW" : ""}
        </span>
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 self-end font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70 uppercase"
        >
          datum ›
        </span>
      </div>

      {/* The shape of the last day, against this gauge's own range. Renders
          nothing until two points exist, so a cold start shows the number
          without an empty box under it. Its printed endpoints are not
          decoration — they are what stops an autoscaled trace from implying a
          magnitude it does not have. */}
      <div className="mt-1.5 min-h-0 flex-1">
        <GaugeSparkline
          points={points}
          network={gauge.network}
          minorFloodFt={threshold}
          freshness={freshness}
          above={above}
        />
      </div>

      {/* Only ever rendered on the two states a reader must not have to press
          for: over this gauge's own published stage, and not current. Below
          threshold the face says nothing here at all — see the header. */}
      {(above || freshness === "dead") && (
        <p className="mt-1 text-[10px] leading-tight">
          {above ? (
            <span className="text-[var(--wl-warning)]">
              at or above minor flood ({threshold?.toFixed(2)} ft)
            </span>
          ) : (
            <span className="text-[var(--wl-dead)]">not current</span>
          )}
        </p>
      )}
    </CardContent>
  );
}

/**
 * The back: what this one number is measured against.
 *
 * Everything here is per-gauge and nothing here compares it to another gauge.
 * The datum sentence is the reason the card exists — "1.51 ft" and "0.31 ft"
 * side by side invite a comparison that is not available, and the only durable
 * fix is for each number to carry its own frame of reference rather than for a
 * paragraph at the bottom of the panel to ask the reader to remember one.
 */
function GaugeDetail({
  gauge,
  age,
  freshness,
  threshold,
  above,
}: {
  gauge: GaugeStatus;
  age: number;
  freshness: Freshness;
  threshold: number | null;
  above: boolean;
}) {
  const noaa = gauge.network === "noaa";

  return (
    /* Scrolls, and at a two-up card height it sometimes has to: the datum
       sentence at the bottom is the claim this face exists to make and is not
       shortened to fit. Everything above it is tightened instead. */
    <CardContent className="wl-scroll flex h-full flex-col overflow-y-auto px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
          {noaa ? "NOAA CO-OPS" : "USGS"} <span className="num">{gauge.gauge_id}</span>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70 uppercase"
        >
          ‹ level
        </span>
      </div>

      <h3 className="mt-1 text-[11px] leading-snug font-semibold">
        {gauge.name}
      </h3>

      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-snug">
        <dt className="text-muted-foreground">datum</dt>
        <dd className="min-w-0">
          {noaa ? (
            <>Mean Lower Low Water (MLLW)</>
          ) : (
            <>this site&rsquo;s own local</>
          )}
        </dd>

        <dt className="text-muted-foreground">flood stage</dt>
        <dd className="min-w-0">
          {threshold === null ? (
            <span className="italic text-muted-foreground">none published</span>
          ) : (
            <>
              minor at <span className="num">{threshold.toFixed(2)}</span> ft
              {above && (
                <span className="text-[var(--wl-warning)]"> — at or above</span>
              )}
            </>
          )}
        </dd>

        <dt className="text-muted-foreground">read</dt>
        <dd
          className={cn(
            "min-w-0",
            freshness === "stale" && "text-[var(--wl-stale)]",
            freshness === "dead" && "text-[var(--wl-dead)]",
          )}
        >
          {formatAge(age)}
          {freshness === "dead" && " — not current"}
        </dd>

        <dt className="text-muted-foreground">on the map</dt>
        <dd className="num min-w-0">
          {gauge.lat.toFixed(4)}, {gauge.lon.toFixed(4)}
        </dd>
      </dl>

      {/* ⚠️ Shortened, and the two claims that may NOT be shortened away are
          both still here in full: "not comparable to the other gauges" opens it
          and "not a reading for any block" closes it. Those are the sentences
          the deleted panel footer used to carry, and this face is now the only
          place either one lives — see this component's header.

          What went was the branch. The `null` case used to add "the operator
          publishes no flood stage here, and borrowing another gauge's would be
          inventing one"; the first half of that is the `flood stage` row three
          lines up, said plainly, and the second half is a rule about the code
          rather than a fact about the water — nothing here borrows a threshold
          and nothing may (LIMITATIONS §8). So the two variants collapsed into
          one sentence with a single conditional word, which is also why this
          face stopped needing to scroll at a two-up card height. */}
      <p className="mt-auto border-t border-border pt-1.5 text-[10px] leading-snug text-muted-foreground">
        <strong className="font-semibold text-foreground/80">
          Not comparable to the other gauges.
        </strong>{" "}
        Only to its own {threshold === null ? "history" : "threshold and history"}
        . A regional level, not a reading for any block.
      </p>
    </CardContent>
  );
}
