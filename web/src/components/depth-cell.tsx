"use client";

import type { DepthPeakEntry } from "@/lib/api-types";
import { formatDepth } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One row's depth — the current reading, or the PEAK over the picked window.
 *
 * ⚠️ **Exported and shared by both row kinds** (`StationRow` here and
 * `SensorRow` next door) on `step-button.tsx`'s precedent. The word `peak` has
 * to appear on every windowed number in this list or on none of them, and two
 * copies of this cell is exactly how one list ends up labelled and the other
 * not. It is the same instinct `flip-card.tsx` records for the two flipping
 * surfaces.
 *
 * ## ⚠️ The label is the safety property, not decoration
 *
 * `lib/depth-window.ts` makes `peakLabel` incapable of returning a string
 * without the word `peak`, on the argument that it is the only thing separating
 * a historical maximum from a current depth. That argument is **stronger** in a
 * 42px row than in the 26px readout it was written for: the readout carries
 * `peak · last hour · from 149 readings` underneath, and a row has space for
 * one word. So the word goes above the number, in the same cell, and the strip
 * above the list says it once more in a sentence.
 *
 * ## The three silences, in a cell 52px wide
 *
 * | state | renders |
 * |---|---|
 * | no entry for this instrument | `—` — nobody looked in this window |
 * | entry, `peak_mm` null, `faulted > 0` | `—` with a `FAULT` title |
 * | entry with a peak | the number, under the word |
 *
 * ⚠️ **Never `0` for any of them.** A zero beside a street name is the most
 * confident claim of a dry block this app can make, and two of these three
 * states are not about the water at all.
 */
export function DepthCell({
  depth,
  windowed,
  peak,
  muted,
  title,
}: {
  /** The CURRENT reading, already formatted. Used when no window is picked. */
  depth: { value: string; unit: string } | null;
  windowed: boolean;
  peak: DepthPeakEntry | null;
  muted: boolean;
  title?: string;
}) {
  if (!windowed) {
    return (
      <span
        className={cn(
          "num w-[52px] text-right text-[13px]",
          muted && "text-muted-foreground",
        )}
        title={title}
      >
        {depth ? (
          <>
            {depth.value}
            <span className="pl-0.5 text-[9px] text-muted-foreground uppercase">
              {depth.unit}
            </span>
          </>
        ) : (
          "—"
        )}
      </span>
    );
  }

  const shown = peak && peak.peak_mm != null ? formatDepth(peak.peak_mm) : null;
  // ⚠️ The two silences are one glyph and two different sentences. A window with
  // nothing in it means nobody looked; a window whose every reading was a fault
  // means the instrument is broken and reporting constantly. Collapsing them
  // would describe a broken rangefinder as an unobserved street.
  const why = !peak
    ? "no readings from this instrument in this window"
    : peak.peak_mm == null && peak.faulted > 0
      ? `every reading in this window was a sensor fault (${peak.faulted}) — no believable depth`
      : peak.peak_mm == null
        ? "no readings from this instrument in this window"
        : `highest believable reading of ${peak.readings} in this window` +
          (peak.faulted > 0 ? ` (${peak.faulted} faulted, excluded)` : "");

  return (
    <span className="flex w-[52px] flex-col items-end leading-none" title={why}>
      {/*
        ⚠️ **`peak` renders whether or not there is a number**, because the dash
        under it is also an answer about the window rather than about now. A
        label that appeared only on the rows with figures would let the empty
        ones read as "currently nothing", which is the opposite of what they
        say.
      */}
      <span className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground uppercase">
        peak
      </span>
      <span
        className={cn(
          "num mt-0.5 text-[13px]",
          // Muted for the same reason the current reading is: this is not a
          // live number. It never takes a severity colour — the row's pill and
          // chips are where the ramp lives, and a peak is history.
          muted && "text-muted-foreground",
        )}
      >
        {shown ? (
          <>
            {shown.value}
            <span className="pl-0.5 text-[9px] text-muted-foreground uppercase">
              {shown.unit}
            </span>
          </>
        ) : (
          "—"
        )}
      </span>
    </span>
  );
}
