"use client";

import { DrillLauncher } from "@/components/drill-controls";
import { RatFigure } from "@/components/rat-figure";
import type { SpeakEvent } from "@/lib/api-types";
import { clockTime, parseServerTime } from "@/lib/format";
import { LEVEL_EDGE, LEVEL_PANEL_BG, type Level } from "@/lib/levels";
import { cn } from "@/lib/utils";

/**
 * What the rat last said — **the one rendering of the warning on this page.**
 *
 * ## ⚠️ It moved out of the masthead into the map page's right-hand rail
 *
 * On 2026-08-05, following the landing design's map screen. Every rule the
 * warning carried in the masthead came with it, because none of them was ever
 * about *where* it sat:
 *
 * - **Rendered exactly once.** It was extracted, not copied — `site-header.tsx`
 *   no longer renders any warning text at all. Two renderings of one templated
 *   string is two places to diverge, and only one can be the live region.
 * - **Verbatim.** Templated by `agent._TEMPLATES` server-side (the templated-copy rule),
 *   never rewritten, truncated or summarised. ⚠️ `truncate`, `line-clamp` and a
 *   fixed height with `overflow` are all still forbidden.
 * - **One live region.** EMERGENCY is `assertive`; everything else is polite.
 * - **Provenance travels with the words.** `REPLAYED` and `DRILL` are claims
 *   about *this text*, so they are in this block's chrome bar, and with the rat
 *   monitor long gone they and the dimmed rat are the whole of that signal.
 * - **The place and the clock.** `place` is the only thing on the page naming
 *   the intersection a warning refers to; the clock is the only thing saying
 *   the warning is a *moment* rather than a standing condition.
 * - **The ramp, starting at watch.** `LEVEL_EDGE` on the left edge and
 *   `LEVEL_PANEL_BG` on the ground, both neutral at `clear`. Amber, orange and
 *   red are warning colours; green beside a live-looking reading is the never-safe rule.
 *
 * ## ⚠️ What the move DROPPED, and it is a real loss
 *
 * **The no-jump height reserve is gone.** In the masthead this block reserved
 * lines with the `lh` unit (`min-h-[7lh] sm:min-h-[5lh] xl:min-h-[4lh]`) and
 * kept a fixed-height dateline row, because a block that sized to its contents
 * shoved the map, the list and the cards down the instant a warning arrived over
 * SSE — the page moving under a reader at the exact moment they are reading it.
 *
 * That reserve is **not needed here and would be wrong here**: this block is the
 * last thing in a rail that scrolls internally, so it has nothing below it to
 * push. Growing downward inside its own scroll container moves nothing. ⚠️ **If
 * this block is ever moved back above other content, the reserve has to come
 * back with it** — the arithmetic behind it (templates run 188–272 characters;
 * 272 is 4 lines at `xl` and 7 on a phone) is in
 * `web/src/components/CLAUDE.md`.
 *
 * The rat is here too, and it is still the only way into the drill menu.
 */
export function WarningBlock({
  latest,
  className,
}: {
  /** The live warning. Null before the first one arrives. */
  latest: SpeakEvent | null;
  className?: string;
}) {
  const level: Level = latest?.level ?? "clear";
  const emergency = latest?.level === "emergency";
  const replay = Boolean(latest?.replay);
  const drill = Boolean(latest?.drill);
  const spokenAt = latest ? parseServerTime(latest.at) : null;

  return (
    <section
      aria-label="Latest warning"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-l-[3px] border-border bg-card",
        "transition-colors duration-500 motion-reduce:transition-none",
        LEVEL_EDGE[level],
        className,
      )}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border bg-[var(--wl-panel)] px-3 py-2">
        {emergency && <UrgentMarker />}
        <span className="font-mono text-[10px] leading-none tracking-[0.14em] text-muted-foreground uppercase">
          {latest ? "Latest warning" : "Fluud"}
        </span>
        {replay && <ProvenanceChip label="Replayed" />}
        {drill && <ProvenanceChip label="Drill" dashed />}
      </div>

      <div
        className={cn(
          "flex flex-1 gap-3 px-3.5 py-3",
          "transition-colors duration-500 motion-reduce:transition-none",
          LEVEL_PANEL_BG[level],
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <p
            aria-live={emergency ? "assertive" : "polite"}
            className={cn(
              "text-[14px] leading-snug text-pretty",
              latest ? "text-foreground" : "text-muted-foreground italic",
            )}
          >
            {latest ? latest.text : "Watching the pipes."}
          </p>

          {/* The dateline. No fixed height here — see the docblock: nothing
              sits below this block, so a row appearing with the first warning
              cannot shift anything. */}
          {latest && (
            <p className="mt-2.5 flex items-center text-[11px] leading-none text-muted-foreground">
              <span className="truncate">{latest.place}</span>
              {spokenAt && (
                <>
                  <span aria-hidden className="mx-1.5 opacity-50">
                    ·
                  </span>
                  <span className="num shrink-0">{clockTime(spokenAt)}</span>
                </>
              )}
            </p>
          )}
        </div>

        {/*
          The rat, and the *only* way into the drill menu.

          ⚠️ **The labelled `DRILL ▾` button is gone and the animal is the whole
          control.** What is left to find it by is the pointer cursor, the hover
          lift, a real focus ring and the `title`/`aria-label` — so all four are
          load-bearing. A keyboard or screen-reader user is unaffected: this is
          a real button with a real name. It is sighted mouse users who have to
          guess.

          The accessible name is on the button; the image keeps its empty `alt`
          and stays `aria-hidden`. Naming a control is not describing a picture,
          so this is not the templated-copy rule through a side door.
        */}
        <DrillLauncher className="flex shrink-0 items-end">
          {(trigger, { open }) => (
            <button
              {...trigger}
              aria-label="Fire a drill"
              title="Fire a drill"
              className={cn(
                "flex cursor-pointer rounded-md",
                // `brightness`, not a background: the rat is a cut-out on a
                // dark card, so a hover *plate* would draw a box around a
                // silhouette while lifting the animal reads as it responding.
                "transition-[filter] duration-200 hover:brightness-125 motion-reduce:transition-none",
                open && "brightness-125",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              )}
            >
              <RatFigure
                level={level}
                dimmed={replay || drill}
                className="size-[76px]"
              />
            </button>
          )}
        </DrillLauncher>
      </div>
    </section>
  );
}

/**
 * Violet, deliberately the same family as the REPLAY mode badge, because the
 * semantics are identical: this is not a live warning happening right now.
 *
 * ⚠️ **Exported since the NOTICES strip landed — extracted, never copied**, on
 * `step-button.tsx`'s precedent. A log row in `message-strip.tsx` carries no
 * warning text at all, so these two chips are the ONLY thing separating a
 * rehearsal from a real past warning on that surface. Two implementations of
 * that mark is how one of them quietly stops being dashed.
 */
export function ProvenanceChip({ label, dashed }: { label: string; dashed?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] uppercase",
        "border-[var(--wl-replay)] text-[var(--wl-replay)]",
        dashed && "border-dashed",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Pulses *opacity* and nothing else — the colour is the information and the
 * movement is only how it gets noticed, so `prefers-reduced-motion` can switch
 * the movement off without switching off the signal.
 */
function UrgentMarker() {
  return (
    <span
      aria-hidden
      className="wl-urgent size-2 rounded-[1px] bg-[var(--wl-emergency)]"
    />
  );
}
