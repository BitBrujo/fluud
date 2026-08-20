"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Open, dismiss, and the accessible wiring for a hand-rolled popup.
 *
 * ## Why this is a hook and not a second copy of `DrillLauncher`
 *
 * `web/CLAUDE.md` pins the shadcn surface at card / badge / alert / button, so
 * every popup here is hand-rolled — and `drill-controls.tsx` says outright that
 * the `pointerdown`-not-`click` rule below "is exactly the sort of thing that
 * gets fixed once and then reintroduced by a copy." The second popup arrived
 * (`depth-window-menu.tsx`), so copying that file would have been knowingly
 * doing the thing it warns about. Extracted on `step-button.tsx`'s precedent
 * and for the same reason: two surfaces carrying one behaviour have to behave
 * identically or they read as two mechanisms.
 *
 * **What is shared is the dismissal, not the popup.** Each caller still owns
 * its own panel, its own contents and its own ARIA role — see `haspopup`.
 *
 * ## The three rules this carries
 *
 * - ⚠️ **`pointerdown`, never `click`.** A document `click` listener fires
 *   *after* the trigger's own handler on the same gesture, so the popup reopens
 *   the instant the trigger closes it and the button appears not to work.
 *   Checking containment against the wrapper avoids that entirely, and closing
 *   on press rather than release is what every native menu does.
 * - **Escape closes and returns focus to the trigger.** A popup that closes
 *   leaving focus on a detached node drops a keyboard reader at the top of the
 *   document.
 * - **The listeners exist only while open.** Two popups on one page both
 *   listening to every pointer event on the document is a cost nobody sees
 *   until there are five.
 */
export interface Popover {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Close and hand focus back to the trigger. Use for "the reader chose". */
  close: () => void;
  /** Goes on the wrapper. Containment against it is what makes dismissal work. */
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** The id to put on the panel, matching the trigger's `aria-controls`. */
  panelId: string;
  /**
   * Spread onto the trigger button.
   *
   * A prop bag rather than loose values, on `DrillLauncher`'s reasoning: a call
   * site cannot quietly drop `aria-expanded` while keeping `onClick`. The
   * accessible half of the control and the working half arrive together or not
   * at all.
   */
  triggerProps: {
    ref: React.RefObject<HTMLButtonElement | null>;
    type: "button";
    "aria-haspopup": "menu" | "dialog";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    onClick: () => void;
  };
}

/**
 * @param haspopup What the panel actually is.
 *
 * ⚠️ **Not a constant, and the difference is real ARIA rather than taste.** A
 * `menu` may only contain `menuitem` children, so a panel holding a number
 * input and a unit select — which `depth-window-menu.tsx`'s custom row does —
 * is a `dialog`. Declaring it a menu would promise a screen reader an
 * interaction model the panel does not implement.
 */
export function usePopover(haspopup: "menu" | "dialog" = "menu"): Popover {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return {
    open,
    setOpen,
    close,
    rootRef,
    panelId,
    triggerProps: {
      ref: triggerRef,
      type: "button",
      "aria-haspopup": haspopup,
      "aria-expanded": open,
      "aria-controls": open ? panelId : undefined,
      onClick: () => setOpen((v) => !v),
    },
  };
}
