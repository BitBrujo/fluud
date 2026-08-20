import { depthBand, DEPTH_BAND_PIN } from "@/lib/depth-band";
import type { Freshness } from "@/lib/staleness";

/**
 * The row's depth drawn against curb height, and one phrase saying what that
 * comes to.
 *
 * Imported from the Fluud design system's `1c` / `2a` ledger rows, 2026-08-15.
 *
 * ## ⚠️ Why a coloured bar beside a reading is legal here
 *
 * The standing rule is that **a colour beside a reading may not vary with that
 * reading unless it is on a scale that says so.** This one varies with the
 * reading and it is on that scale — the same two borrowed thresholds the pill
 * uses, with the flood-event tick drawn on the track so the scale states
 * itself. It is the exemption rather than a hole in the rule.
 *
 * ⚠️ **It is `aria-hidden` and it is never the only carrier.** Every number it
 * draws is already printed in `DepthCell` beside it and banded in
 * `DepthBandPill` after it. A bar that were the sole statement of a depth would
 * be a reading with no digits, no age and no plausibility.
 *
 * ## ⚠️ Four states take NO fill, and three of them are not about the water
 *
 * An empty track is the absence of a claim, which is why nothing here ever
 * draws a zero-width fill in a confident colour and calls it low water:
 *
 * | state | fill | why |
 * |---|---|---|
 * | faulted | none | a fault is not a depth. The digits stay in the cell as the evidence |
 * | no value | none | absence of depth is not zero — see `DepthCell` |
 * | dead | `--wl-dead` | off the band entirely, on the staleness idiom |
 * | stale | `--wl-stale` | off the band entirely |
 *
 * **Stale and dead leave the scale rather than dimming**, exactly as the pill
 * and the map markers do. An hour-old reading drawn in a band colour is the
 * worst thing this row can render, and a bar is more confident than a chip.
 *
 * ## ⚠️ A peak takes no band colour and that is the one place this diverges from the design
 *
 * The design draws windowed rows with band-coloured bars. This app's rule is
 * that **a peak never takes the band** — it is history, and the scale on this
 * row is about now (`depth-cell.tsx`, `lib/CLAUDE.md`). So in windowed mode the
 * fill is neutral and the phrase still names the arithmetic. The magnitude
 * survives; the claim about severity does not.
 *
 * ⚠️ **The staleness branches are also skipped in windowed mode**, on
 * `DepthReadout`'s rule: `last known` means *the newest thing we have is old*,
 * which is a claim about a current reading. A peak is explicitly historical and
 * says when.
 */
export function DepthBar({
  valueMm,
  freshness,
  faulted,
  windowed,
  emptyNote,
  floodEventMm,
  curbHeightMm,
  curbNote = true,
}: {
  /**
   * The millimetres the cell beside this is showing — the current reading, or
   * the window's peak. Null when there is no number at all.
   *
   * ⚠️ **It is passed rather than re-derived** so the bar and the digits cannot
   * disagree. Two components reading two sources is how a row ends up with a
   * bar at 40% above an em-dash.
   */
  valueMm: number | null;
  freshness: Freshness;
  /** `plausible === false`, never `!plausible` — absence is not a fault. */
  faulted: boolean;
  windowed: boolean;
  /**
   * What to say when there is no number, in this row's own terms. A camera with
   * no paired sensor and a sensor that has never reported are different facts
   * and neither is a statement about conditions, so the caller words it.
   */
  emptyNote: string;
  floodEventMm: number;
  curbHeightMm: number;
  /**
   * Whether to print the curb comparison — `past curb height`, `23% of curb` —
   * at the end of the bar. Default `true`.
   *
   * Set it `false` only where a `DepthBandPill` sits beside the bar and says the
   * same thing in the same glance. Nothing in the Fluud app does; it is here for
   * designs that pair the two.
   *
   * ⚠️ **It gates the CURB COMPARISON and nothing else. It cannot suppress a
   * safety statement, and it may never be widened to.** Four of this
   * component's phrases are not about the water and every one of them still
   * prints with `curbNote={false}`:
   *
   * | phrase | what it says |
   * |---|---|
   * | `no believable depth` | the reading is a fault. The digits stay in the cell as the evidence |
   * | the caller's `emptyNote` | there is no number at all, in this row's own terms |
   * | `no recent reading` | dead — off the scale, not low |
   * | `not a current reading` | stale, or a windowed peak. This is history |
   *
   * A pill states the band. It does not state that the instrument is broken,
   * that nobody looked, or that what is drawn is an hour old — so hiding those
   * to reduce repetition would delete the only words on the row saying the bar
   * is not a live measurement. **An empty track under a suppressed fault reads
   * as calm**, which is the failure this whole component is built around.
   */
  curbNote?: boolean;
}) {
  const stale = !windowed && freshness === "stale";
  const dead = !windowed && freshness === "dead";

  const fill = (() => {
    if (faulted || valueMm == null) return null;
    if (dead) return "var(--wl-dead)";
    if (stale) return "var(--wl-stale)";
    // A peak is history. The band lives in the pill and the chips.
    if (windowed) return "var(--muted-foreground)";
    return DEPTH_BAND_PIN[depthBand(valueMm, floodEventMm, curbHeightMm)];
  })();

  const note = (() => {
    // ⚠️ The four safety branches are ABOVE the `curbNote` gate on purpose. A
    // fault, an absence and the two staleness disclosures are not the curb
    // comparison and a pill beside the bar does not carry any of them — see the
    // prop's own comment, which is the copy that reaches the design system.
    if (faulted) return "no believable depth";
    if (valueMm == null) return emptyNote;
    if (dead) return "no recent reading";
    if (stale) return "not a current reading";
    if (!curbNote) return null;
    if (valueMm >= curbHeightMm) return "past curb height";
    // Arithmetic against a borrowed number, named. It is deliberately not a
    // verdict: `2% of curb` says what the instrument measured and says nothing
    // whatever about the street, the block, or anywhere nobody looked.
    return `${Math.round((valueMm / curbHeightMm) * 100)}% of curb`;
  })();

  // Where FloodNet's own flood event falls on a track that ends at curb height.
  // 6.67% with the shipped numbers, and interpolated rather than typed —
  // both thresholds come from `/api/status` and may never be hard-coded.
  const tickPct = Math.min(100, (floodEventMm / curbHeightMm) * 100);
  const fillPct =
    valueMm == null ? 0 : Math.min(100, Math.max(0, (valueMm / curbHeightMm) * 100));

  return (
    <span className="mt-1.5 flex items-center gap-2">
      <span
        aria-hidden="true"
        className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--muted)]"
      >
        {fill && (
          <span
            className="absolute inset-y-0 left-0 block rounded-full"
            style={{ width: `${fillPct}%`, background: fill }}
          />
        )}
        {/*
          The flood-event mark. ⚠️ **A threshold line IS a claim about
          magnitude**, which is what makes `--wl-watch` legal on it — the same
          exception `depth-sparkline.tsx` takes for its dashed line, and the
          reason that file's trace is magenta while its threshold is not. It is
          drawn over the fill so a bar past it does not swallow the scale.
        */}
        <span
          className="absolute -top-px -bottom-px block w-px bg-[var(--wl-watch)] opacity-70"
          style={{ left: `${tickPct}%` }}
        />
      </span>
      {/* Dropped entirely rather than rendered empty: an empty span still costs
          its line box and the `gap-2` beside it, which opens a gap at the end of
          the track that reads as a phrase failing to load. */}
      {note && (
        <span className="shrink-0 font-mono text-[9px] tracking-[0.06em] text-muted-foreground/70 uppercase">
          {note}
        </span>
      )}
    </span>
  );
}
