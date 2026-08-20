"use client";

import type { AlertStatus } from "@/lib/api-types";
import { depthText } from "@/lib/format";
import { LEVEL_ALERT_BLOCK, LEVEL_RANK, LEVEL_TEXT, type Level } from "@/lib/levels";
import { cn } from "@/lib/utils";

/**
 * Open alerts, newest first, coloured by level.
 *
 * `message` is the templated warning that was spoken when the alert opened —
 * `agent._TEMPLATES`, round-tripped through the database. Rendered verbatim;
 * JSX escapes it by construction, which is the point (camera names come
 * straight from the DOT API and alert copy comes back out of Postgres).
 *
 * ## ⚠️ It collapses as of 2026-08-07, and what it may NOT collapse to
 *
 * **Owner's instruction**, and the reason is measured: this list is one block
 * per open alert with no cap, and against the live registry that day it was
 * **25 blocks and 2258px — two and a half viewports** stacked above the
 * workspace on an ordinary evening. It is the thing that actually pushes the
 * page down; the NOTICES strip above it was already bounded.
 *
 * ⚠️ **Collapsing hides the BLOCKS. It may never hide the fact that alerts are
 * open.** The bar stays, and it keeps the count *and* the worst level still
 * running — so the collapsed state says *"3 open · EMERGENCY"*, never *"3"* and
 * never nothing at all. That is the same bargain `message-strip.tsx` and
 * `NoticeBadge` strike one band up: a reader may put a surface away, and the
 * claim it was making survives in the chrome. An open alert is why somebody
 * loaded this page; a control that could make that invisible would be selling a
 * silence this system refuses to sell.
 *
 * ⚠️ **It is NOT persisted**, on the picked set's rule and `/terms` §05's: no
 * `localStorage`, no `sessionStorage`, no cookie. A reload brings the blocks
 * back, which is the safe direction — the page re-asserts what is open rather
 * than remembering that somebody once dismissed it.
 *
 * ❌ ⚠️ **Default is COLLAPSED as of 2026-08-07, on the owner's instruction.**
 * This paragraph read *"Default is EXPANDED and must stay so. A page that
 * opens with its alerts already put away is a page that decided for the reader
 * that they did not need to see them."* — written hours earlier, in the same
 * day's work. It is recorded rather than overwritten, because the objection is
 * still the true cost: the page now opens having made that decision.
 *
 * **What pays for it is the bar, and only the bar.** It is unconditional, it
 * carries the count and the worst level still running, and it says
 * *"25 open · EMERGENCY"* on a cold load. That is the whole of what a reader
 * who does nothing is told. So the two rules above — the bar stays, and it
 * never degrades to a bare number — stop being belt-and-braces and become the
 * only thing holding this up. ⚠️ **Shorten that bar and the default has
 * nothing left underneath it.**
 *
 * Nothing about the warning moved. `warning-block.tsx` still renders the
 * templated sentence verbatim, once, in the rail, whatever this is set to, and
 * `lib/messages.ts` still suppresses the warning log while any alert is open.
 */
export function AlertList({
  alerts,
  collapsed,
  onToggle,
}: {
  alerts: AlertStatus[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (alerts.length === 0) return null;

  // The worst level still open. This is what makes the collapsed bar a
  // statement rather than a number.
  const worst = alerts.reduce<Level>(
    (acc, a) => (LEVEL_RANK[a.level] > LEVEL_RANK[acc] ? a.level : acc),
    "clear",
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10px] leading-none tracking-[0.14em] text-muted-foreground uppercase">
          Open alerts
        </span>
        <span className="num font-mono text-[10px] leading-none text-muted-foreground">
          {alerts.length}
        </span>
        {/* The worst level rides in the bar at every state, so collapsing
            cannot turn an EMERGENCY into a bare count. On the ramp and
            labelled with the word, which is what licenses the colour. */}
        <span
          className={cn(
            "font-mono text-[10px] leading-none tracking-[0.12em] uppercase",
            LEVEL_TEXT[worst],
          )}
        >
          {worst}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            "ml-auto cursor-pointer rounded-sm border border-border px-1.5 py-1",
            "font-mono text-[10px] leading-none tracking-[0.08em] text-muted-foreground uppercase",
            "transition-colors hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
          )}
        >
          {collapsed ? `show ${alerts.length}` : "hide"}
        </button>
      </div>

      {!collapsed &&
        alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              "rounded-r-lg border-l-[3px] px-5 py-4",
              LEVEL_ALERT_BLOCK[alert.level],
            )}
          >
            <h2 className="mb-1.5 font-mono text-[11px] tracking-[0.12em] uppercase">
              {alert.level} — {alert.name}
            </h2>
            <p className="text-[15px] text-foreground/90">
              {alert.message ||
                `Alert open. Depth ${depthText(alert.peak_depth_mm)}.`}
            </p>
          </div>
        ))}
    </div>
  );
}
