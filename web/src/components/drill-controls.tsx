"use client";

import { useState, useTransition } from "react";

import { ApiError, fireDrill } from "@/lib/api";
import { usePopover } from "@/lib/hooks/use-popover";
import { DRILL_LEVELS, type Level } from "@/lib/levels";
import { cn } from "@/lib/utils";

/**
 * Rehearsal, through the real path.
 *
 * The buttons on the page this replaces called a local test function with
 * hard-coded strings that never touched the server — so a canned local line
 * was indistinguishable from a real warning, and what you rehearsed was not
 * what a real alert would do. These POST `/api/rat/drill`, which runs
 * server → event bus → SSE → the warning panel, and the events come back
 * tagged `drill: true` so the panel can say what they are.
 *
 * ## Why this is hand-rolled and not a shadcn dropdown
 *
 * `web/CLAUDE.md` pins the shadcn surface at card / badge / alert / button, and
 * a menu is the sort of thing that arrives with a dependency. What is actually
 * needed here is a button, a list of buttons, and dismissal — so it is a button,
 * a list of buttons, and about fifteen lines of dismissal. The trigger carries
 * `aria-haspopup` / `aria-expanded` / `aria-controls`, the panel is a `menu`
 * with `menuitem` children, Escape closes it and returns focus to the trigger,
 * and a pointer-down anywhere else closes it.
 *
 * ✅ **Those fifteen lines are `lib/hooks/use-popover.ts` now**, extracted when
 * `depth-window-menu.tsx` became the second hand-rolled popup on this page.
 * That was this paragraph's own prediction arriving: the `pointerdown`-not-
 * `click` rule below is the fix that "gets reintroduced by a copy", so the
 * second popup takes the behaviour rather than the file. **The rule itself is
 * unchanged and now lives at the hook**, restated here because it is the reason
 * this component cannot use a document `click` listener:
 *
 * `pointerdown` rather than `click`: a `click` listener on the document fires
 * after the button's own handler on the same gesture, which reopens the menu
 * the instant it is closed by the trigger. Checking containment against the
 * wrapper avoids that entirely, and closing on press rather than release is
 * what every native menu does.
 *
 * ## The trigger is a render prop, and there is exactly one of it
 *
 * ⚠️ **The labelled `DRILL ▾` button is gone** — it lived in the rat monitor's
 * chrome bar, and both it and that panel were removed on the owner's
 * instruction. The masthead rat is now the only way into this menu; see
 * `RatDrill` in `site-header.tsx`, which also records what that costs.
 *
 * The render prop stays anyway. `DrillLauncher` owns the state, the dismissal,
 * the request and the popup, and a trigger owns only how it looks — so a second
 * one can be added without copying this file. That matters more than it sounds:
 * the `pointerdown`-not-`click` rule above is exactly the sort of thing that
 * gets fixed once and then reintroduced by a copy.
 */
const LABELS: Record<Level, string> = {
  watch: "Watch",
  warning: "Warning",
  emergency: "Emergency",
  clear: "Stand down",
};

/**
 * The three escalations, which is what the top of the menu offers.
 *
 * ⚠️ **`clear` is deliberately not in this list.** It is still one of
 * `DRILL_LEVELS` and it still goes to the same endpoint — this is a filter, not
 * a second source of truth, so a level added there arrives here automatically.
 * What it is not is a fourth *severity*. Listed alongside watch / warning /
 * emergency with a coloured dot beside it, "Stand down" reads as the bottom of
 * the ramp, i.e. a claim about the street; below a rule and labelled *Cancel
 * drill*, it reads as what it actually is, which is a claim about the rehearsal.
 * Same words on the wire, opposite readings on the page.
 */
const ESCALATIONS = DRILL_LEVELS.filter((level) => level !== "clear");

/**
 * The swatch beside each item. Same ramp as the panel border, so the menu reads
 * as the thing it drives — and `clear` is explicitly the stand-down colour, not
 * an "all good" green in disguise: it is what puts the panel back to *Watching
 * the pipes*, which is a statement about the rat, not about the street.
 */
const DOT: Record<Level, string> = {
  watch: "bg-[var(--wl-watch)]",
  warning: "bg-[var(--wl-warning)]",
  emergency: "bg-[var(--wl-emergency)]",
  clear: "bg-[var(--wl-clear)]",
};

/**
 * Everything a trigger has to spread onto its button for the menu to be a menu.
 *
 * It is a prop bag rather than a set of arguments so that a call site cannot
 * quietly drop `aria-expanded` while keeping `onClick` — the accessible half of
 * this control and the working half arrive together or not at all.
 *
 * ⚠️ **`disabled` is composed on top of the hook's bag rather than being part
 * of it**, because it is this control's own concern: a drill is a POST and the
 * trigger has to be dead while one is in flight. A popup that merely opens has
 * nothing to be pending about, so the shared hook does not carry it.
 */
type TriggerProps = ReturnType<typeof usePopover>["triggerProps"] & {
  disabled: boolean;
};

export function DrillLauncher({
  children,
  className,
}: {
  children: (
    trigger: TriggerProps,
    state: { open: boolean; pending: boolean },
  ) => React.ReactNode;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { open, setOpen, rootRef, panelId: menuId, triggerProps } =
    usePopover("menu");

  function run(level: Level) {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      try {
        await fireDrill(level);
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "the drill request failed",
        );
      }
    });
  }

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      {children({ ...triggerProps, disabled: pending }, { open, pending })}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Fire a drill"
          className={cn(
            "absolute right-0 z-30 mt-1.5 w-56 origin-top-right overflow-hidden",
            "rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/50",
          )}
        >
          <p className="px-2 py-1.5 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            Rehearse — routed through the server
          </p>
          {ESCALATIONS.map((level) => (
            <button
              key={level}
              type="button"
              role="menuitem"
              onClick={() => run(level)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px]",
                // Neutral, not `bg-accent` — same call as the station row.
                // The master theme's accent is an electric green and this menu
                // is a list of severities; a green highlight sliding over
                // EMERGENCY is the one colour it may not wear.
                "hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", DOT[level])}
              />
              {LABELS[level]}
            </button>
          ))}

          {/*
            Cancelling a drill IS a `clear` drill — it posts to the same
            endpoint, the server emits a `mood` event at level `clear`, and
            `applyRatEvent` sets `latest` back to null, which is what returns the
            masthead to *Watching the pipes.* There is no separate "undo" on the
            wire and there does not need to be one.

            ⚠️ **It is always offered, never gated on a drill being on screen.**
            The tempting version disables this unless `latest.drill` is true, and
            it is wrong twice: a rehearsal left running when the SSE connection
            drops would strand the page with no way back, and standing down is
            itself one of the transitions worth rehearsing.

            No coloured dot. The three above take theirs from the severity ramp
            because that is what they are; this one is not on the ramp and must
            not borrow a swatch from it.
          */}
          <div aria-hidden className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => run("clear")}
            className={cn(
              "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left",
              "hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none",
            )}
          >
            <span className="text-[13px]">Cancel drill</span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              Stands the rat down — back to watching.
            </span>
          </button>
        </div>
      )}

      {error && (
        <p className="absolute top-full right-0 z-30 mt-1.5 w-max max-w-[280px] text-[11px] text-[var(--wl-emergency)]">
          drill failed: {error}
        </p>
      )}
    </div>
  );
}
