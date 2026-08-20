"use client";

import { useState } from "react";

import {
  customToMinutes,
  MAX_WINDOW_MIN,
  PRESET_MINUTES,
  RETENTION_DAYS,
  splitWindow,
  type CustomUnit,
  windowLabel,
} from "@/lib/depth-window";
import { usePopover } from "@/lib/hooks/use-popover";
import { cn } from "@/lib/utils";

/**
 * Pick the timeframe the depth above is read over.
 *
 * `null` is the current reading and is the resting state — a page about what is
 * happening now must not open on what happened yesterday. Anything else is a
 * **peak** over that window; `lib/depth-window.ts` and `waterline/peaks.py`
 * carry why it may never become a mean.
 *
 * ## Hand-rolled, and a `dialog` rather than a `menu`
 *
 * The shadcn surface stays at card / badge / alert / button (`web/CLAUDE.md`),
 * so this is a button and a panel of buttons — the same shape
 * `drill-controls.tsx` has, sharing its dismissal through
 * `lib/hooks/use-popover.ts` rather than copying it.
 *
 * ⚠️ **`aria-haspopup="dialog"`, where the drill menu is a `menu`.** A `menu`
 * may only contain `menuitem` children, and this panel holds a number input and
 * a unit `<select>` for the custom row. Declaring it a menu would promise a
 * screen reader an interaction model it does not implement. The presets are
 * `aria-pressed` buttons, which is this codebase's idiom for every other
 * exclusive control on the page (the layer toggles, the sort buttons, the
 * Cameras/Sensors tabs).
 *
 * ## Colour
 *
 * ⚠️ **`--wl-select` when a window is picked, muted at rest, and never anything
 * else.** This control sits directly under a 26px depth, so the rule that
 * decides it is the sharp one: *a colour beside a reading may not vary with
 * that reading unless it is on a ramp that says so.* This one varies with what
 * the **reader asked for** and with nothing about the water — every instrument
 * at every depth wears the same colour for the same picked window — which is
 * exactly `--wl-select`'s existing licence on the filter chips, the origin chip
 * and the station row. Green is unavailable beside a depth (the never-safe rule), violet
 * is `--wl-replay`'s on this page, and cyan is spoken for one row down by
 * `Start Monitor`'s rest state — using it here would make two adjacent controls
 * look like one system.
 */
export function DepthWindowMenu({
  minutes,
  onPick,
  align = "left",
  className,
}: {
  /** `null` = the current reading. */
  minutes: number | null;
  onPick: (minutes: number | null) => void;
  /**
   * Which edge the 240px panel hangs from.
   *
   * ⚠️ **Not cosmetic — `Panel` is `overflow-hidden`, so the wrong edge CLIPS
   * the menu rather than letting it spill.** The detail panel mounts this at
   * the left of its column and `left` has room; the instrument list mounts it
   * at the right end of the freshness row, where a left-anchored 240px panel
   * runs ~140px past a 312px panel's edge and the half with the presets in it
   * is simply not drawn.
   *
   * A viewport-relative fix (`fixed`, or measuring on open) was rejected: this
   * popup lives inside two different scroll regions, so it has to move with its
   * trigger. Choosing the edge at the call site is one word and cannot drift.
   */
  align?: "left" | "right";
  className?: string;
}) {
  const { open, close, rootRef, panelId, triggerProps } = usePopover("dialog");

  // Seeded from whatever is picked, so opening on `last day` and switching to
  // custom starts at `1 day` rather than at a blank box the reader has to
  // re-derive. `splitWindow` owns the arithmetic.
  const seed = splitWindow(minutes ?? 60);
  const [value, setValue] = useState<string>(String(seed.value));
  const [unit, setUnit] = useState<CustomUnit>(seed.unit);

  const custom = customToMinutes(Number(value), unit);
  const label = minutes == null ? "current" : windowLabel(minutes);

  function pick(next: number | null) {
    onPick(next);
    close();
  }

  return (
    /*
     * ⚠️ **The click stops here, and that is correctness rather than tidiness.**
     * The camera face of `selected-detail.tsx` puts an `onClick` on the whole
     * `Panel` — the convenience half of the flip gesture — so without this,
     * opening this popup turns the reading into a rodent wall mid-press, and so
     * does every preset, the number field, the unit select and apply. Measured:
     * pressing `current ▾` flipped the panel and the menu was never seen.
     *
     * ⚠️ **It belongs on the ROOT, not on the trigger.** The panel is a DOM
     * descendant of this wrapper, so a trigger-only stop would fix the press
     * that opens the menu and leave every press *inside* it still flipping the
     * card away — the worse half, because by then the reader is mid-task.
     *
     * ⚠️ **And it belongs HERE, not at the call site.** The `Start Monitor`
     * button three lines below the camera mount stops at its own handler, which
     * that face can do because it owns the handler; a caller can reach nothing
     * inside this popup and would have to wrap the component in a defensive
     * div. Carried here, both `/map` mounts behave identically and any future
     * mount on a flipping surface is protected by construction — the same rule
     * `use-popover.ts` exists to state about the `pointerdown` fix.
     *
     * It cannot break dismissal: `usePopover` listens for `pointerdown` on the
     * document, which a synthetic `click` stop does not reach.
     */
    <div
      className={cn("relative", className)}
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        {...triggerProps}
        className={cn(
          "cursor-pointer rounded-[5px] border px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] uppercase transition-colors",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
          minutes == null
            ? "border-border text-muted-foreground hover:bg-[var(--wl-panel)]"
            : "border-[var(--wl-select)] bg-[var(--wl-select)]/15 text-foreground",
        )}
      >
        {label} <span aria-hidden>▾</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Depth timeframe"
          className={cn(
            "absolute z-30 mt-1.5 w-60",
            align === "right"
              ? "right-0 origin-top-right"
              : "left-0 origin-top-left",
            "rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/50",
          )}
        >
          <p className="px-2 py-1.5 font-mono text-[9px] leading-tight tracking-[0.12em] text-muted-foreground uppercase">
            Show the highest reading over
          </p>

          <Choice on={minutes == null} onClick={() => pick(null)}>
            <span>Current reading</span>
            <span className="text-[10px] leading-tight text-muted-foreground">
              What this instrument reports now.
            </span>
          </Choice>

          <div aria-hidden className="my-1 h-px bg-border" />

          {PRESET_MINUTES.map((m) => (
            <Choice key={m} on={minutes === m} onClick={() => pick(m)}>
              <span>{windowLabel(m)}</span>
            </Choice>
          ))}

          {/*
            The custom row. `last N + unit` rather than a start/end pair, on the
            owner's call — it reads with the same grammar as the four presets
            above it, so the panel has one way of asking rather than two.

            ⚠️ **Not a `<form>`, and the apply button is the only commit.** The
            panel already lives inside the page's one real `<form>` on some
            layouts; a nested form is invalid HTML and an Enter keypress in this
            number field would submit the watch subscription. Same reason the
            watch panel's resend button is `type="button"`.
          */}
          <div aria-hidden className="my-1 h-px bg-border" />
          <div className="flex flex-col gap-1.5 px-2 py-1.5">
            <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
              Custom
            </span>
            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor={`${panelId}-n`}>
                How many
              </label>
              <input
                id={`${panelId}-n`}
                type="number"
                min={1}
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="num w-16 rounded-[5px] border border-border bg-transparent px-2 py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              />
              <label className="sr-only" htmlFor={`${panelId}-u`}>
                Unit
              </label>
              {/*
                A native `<select>`, not a shadcn one — same call the watch
                panel's quiet-hours controls made, and it keeps the shadcn
                surface at card / badge / alert / button.
              */}
              <select
                id={`${panelId}-u`}
                value={unit}
                onChange={(e) => setUnit(e.target.value as CustomUnit)}
                className="flex-1 rounded-[5px] border border-border bg-transparent px-2 py-1 text-[12px] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
            <button
              type="button"
              disabled={custom == null}
              onClick={() => custom != null && pick(custom)}
              className={cn(
                "cursor-pointer self-start rounded-[5px] border border-border px-2.5 py-1 font-mono text-[9.5px] tracking-[0.1em] uppercase transition-colors",
                "hover:bg-[var(--wl-panel)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {custom == null ? "apply" : `apply · ${windowLabel(custom)}`}
            </button>
            {/*
              ⚠️ Said BEFORE the request rather than after it. The server clamps
              and the readout reports it, but a reader who types `1 year` and is
              silently handed seven days has been told something false about
              what this app knows. Retention is the reason and it is named.
            */}
            <span className="text-[10px] leading-tight text-muted-foreground">
              Readings are kept for {RETENTION_DAYS} days, so{" "}
              {windowLabel(MAX_WINDOW_MIN)} is the widest window. Anything longer
              shows that.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** One exclusive choice. `aria-pressed`, this page's idiom for every toggle. */
function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-[13px]",
        // Neutral, never `bg-accent` — the master theme's accent is an electric
        // green and this panel sits under a depth reading. Same call as the
        // station row and the drill menu.
        "hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none",
        on && "bg-[var(--wl-select)]/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}
