"use client";

import { cn } from "@/lib/utils";

/**
 * Which of the rail's four panels is showing.
 *
 * ⚠️ **`instrument` is the resting value and it may not change.** Pressing a
 * row, a marker or the pager has to visibly do something from where it was
 * pressed, and all three answer on that panel — so `page.tsx` switches back to
 * it on every selection rather than leaving a reader looking at the gauges
 * wondering why the map stopped responding.
 */
export type RailTab = "instrument" | "gauges" | "watch" | "notices";

export const RAIL_TABS: RailTab[] = [
  "instrument",
  "gauges",
  "watch",
  "notices",
];

/**
 * What each tab says, which is not always what its value is.
 *
 * ⚠️ **`watch` is LABELLED `monitor` and its value stays `"watch"`**, on the
 * owner's instruction, 2026-08-15. The value drives `RailTab`, `pane()`,
 * `setRailTab` and every comparison in `map/page.tsx`, so renaming it would
 * touch the rail's control flow to change a word — the same call
 * `watch-panel.tsx` already made for its third step, which is labelled `email`
 * while its `Mode` value stays `"address"`.
 *
 * ⚠️ **The label matches the button that opens the same feature.** The sensor
 * face's toggle reads `Start Monitor`, and a tab named `watch` beside a control
 * named `Monitor` makes a reader who has met one wonder whether the other is a
 * different thing. `watch-panel.tsx`'s own copy names that button verbatim and
 * moves with it; **this label is now the third member of that set.**
 *
 * ⚠️ **The wire is untouched and stays untouched.** `/api/watch/*`, the
 * `?watch=` manage parameter, `watch_note`, `min_level: "watch"` and the WATCH
 * escalation level are all unchanged — this is one word in one chrome bar.
 * `watch` as an alert LEVEL is a different noun and must not be renamed to
 * follow this.
 */
export const RAIL_TAB_LABELS: Record<RailTab, string> = {
  instrument: "instrument",
  /* ⚠️ **The VALUE stays `"gauges"` and only the label moved**, 2026-08-15, on
     the owner's instruction — the third member of a set that already had two
     (`watch`→`monitor`, the watch panel's `address`→`email`). The value drives
     `RailTab`, `pane()`, `setRailTab`, the gauge diamond's
     `setRailTab("gauges")` and `onShowGauges`, so renaming it would touch the
     rail's control flow to change a word.

     The panel gained an NWS alert block in the same commit, which is what the
     second noun is for: the tab no longer opens onto gauges alone.

     ⚠️ **It reads `tide + wx` because `tide & weather` MEASURED at 84.0px in
     an 84.5px box** — half a pixel of margin, at 1440×900, in the shipping
     font. That is not a margin; it is a label that fits by rounding, and the
     next change to the type scale, the tracking or the tab padding clips a
     control into saying a different word. Measured alternatives, 10px Fira
     Code + 0.1em tracking, uppercase, against 84.5px available:

         instrument       60.0    (the incumbent longest)
         tide & weather   84.0    ✗ 0.5px margin
         tide+weather     72.0      12.5px
         tide + wx        54.0    ✓ 30.5px — the same class as `instrument`
         weather          42.0      42.5px

     `wx` is standard weather shorthand and is the cost of this choice; what
     pays for it is `PanelTitle` one row below, which says **Tide, stream and
     weather** in full and is the first thing under the tab. **Never a
     `truncate`** — a clipped tab label is a control saying a different word,
     which is worse than an abbreviated one. */
  gauges: "tide + wx",
  watch: "monitor",
  notices: "notices",
};

/**
 * The rail's chrome bar, as four tabs.
 *
 * Imported from the Fluud design system's `1c`, 2026-08-15. The rail held four
 * stacked panels in a scrolling column, and it still does below `xl`; at `xl`
 * one of them occupies the whole track and this bar picks which.
 *
 * ## ⚠️ What this is FOR is the NOTICES strip, and it is a debt being paid
 *
 * The strip moved to the foot of the scrolling rail on 2026-08-14, which put
 * the frozen-poller rule's backstop below the fold — `message-strip.tsx` records
 * that cost and `NoticeBadge` in the masthead is what has been carrying the
 * claim always-visible since. **A tab is not below the fold.** The count below
 * is on screen whatever the reader is looking at, it is one press from the
 * strip, and it takes the same `--wl-dead` a fault takes everywhere else in
 * this app's chrome.
 *
 * ⚠️ **It does not retire `NoticeBadge` and must not be read as retiring it.**
 * This bar is `max-xl:hidden` — below `xl` the rail stacks and there are no
 * tabs at all, so the masthead is still the only always-visible fault signal on
 * a phone. The badge also carries the worst fault's own **title**; this carries
 * a **count**, which `site-header.tsx` argues at length is the weaker thing.
 * Two signals, and the stronger one is unchanged.
 *
 * ## ⚠️ The count is of what is NOT dismissed, and that is the honest number
 *
 * `MessageStrip` returns null once everything is dismissed, so a tab counting
 * every message would sit at `3` over an empty panel. It counts what the strip
 * would actually draw, and `page.tsx` renders a line offering them back when
 * that reaches zero — dismissing moves a claim rather than deleting it, which
 * is the rule the `✕` on every row is held to.
 *
 * ## The colours
 *
 * ⚠️ **The active underline is `--wl-select`.** Which tab is open is a fact
 * about the reader, which is that token's whole licence — the same one the
 * selected row's left edge and the map's halo run on. Nothing here varies with
 * a reading.
 *
 * ⚠️ **The notices count is `--wl-dead` / `--wl-stale`, and that is the
 * recorded exception rather than a new one.** `NoticeBadge` already spends both
 * in the masthead on the argument that a fault is a fault signal and not a
 * severity. This is the same claim in the same two colours one container over.
 * **A fault is about the service. It is never about the water**, which is why
 * neither of these may drift onto the instrument tab.
 *
 * ## ⚠️ These are `aria-pressed` buttons and NOT `role="tab"`
 *
 * Deliberately, and it is the breakpoint that decides it. This bar is
 * `max-xl:hidden`, so below `xl` there is no tablist in the accessibility tree
 * at all while the four panels are still in the document, stacked. Declaring
 * them `role="tabpanel"` would be describing a widget that exists at one
 * viewport width and not another — and there is no way to say that in ARIA.
 *
 * So it follows `ModeButton` in `station-list.tsx`, which is the same shape for
 * the same reason: **real buttons carrying `aria-pressed`**, with the grouping
 * done by a background rather than by a role. It also keeps the shadcn surface
 * pinned at card / badge / alert / button, which is where `web/CLAUDE.md` puts
 * it.
 */
export function RailTabs({
  active,
  onChange,
  notices,
  faulted,
  watching,
  className,
}: {
  active: RailTab;
  onChange: (tab: RailTab) => void;
  /** Undismissed messages — what `MessageStrip` would draw. */
  notices: number;
  /** Whether any undismissed message is a fault rather than a log line. */
  faulted: boolean;
  /** How many instruments are in the watch draft. */
  watching: number;
  className?: string;
}) {
  return (
    <div
      aria-label="Rail panels"
      className={cn(
        // `h-11` and not the design's 40px: every chrome bar on this page is
        // `PanelHeader`'s height, which is what makes the map, the list and
        // this start their contents on one line. See `panel.tsx`.
        "flex h-11 shrink-0 items-stretch overflow-hidden rounded-t-lg border border-border bg-[var(--wl-panel)]",
        className,
      )}
    >
      {RAIL_TABS.map((tab) => {
        const on = tab === active;
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(tab)}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-1",
              "font-mono text-[10px] tracking-[0.1em] uppercase",
              "transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              "focus-visible:ring-inset focus-visible:outline-none",
              on
                ? "border-[var(--wl-select)] bg-card text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {RAIL_TAB_LABELS[tab]}
            {/*
              ⚠️ **A count only when there is something to count.** A `0` beside
              `notices` reads as a verdict that nothing is wrong, and this
              badge cannot support one — the strip reports three service faults
              and says nothing whatever about the instruments. Absent is the
              honest rendering of "no fault is being reported".
            */}
            {tab === "notices" && notices > 0 && (
              <span
                className={cn(
                  "num text-[10px]",
                  faulted ? "text-[var(--wl-dead)]" : "text-[var(--wl-stale)]",
                )}
              >
                {notices}
              </span>
            )}
            {/* Matches the mobile bar's `monitor N` in `map/page.tsx` — two
                doors to one panel, and they carry one word. */}
            {tab === "watch" && watching > 0 && (
              <span className="num text-[10px] text-foreground">{watching}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
