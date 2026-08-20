"use client";

import { Button } from "@/components/ui/button";

/**
 * One step of a pager: `‹` or `›`.
 *
 * ⚠️ **Shared by two pagers on purpose, and it was extracted rather than
 * copied.** `harbor-baseline.tsx` pages two gauge cards at a time; the
 * instrument pager in `selected-detail.tsx` steps the selection through the
 * filtered list. They window different things and keep their own logic — only
 * the button is shared — but a control that appears twice in the same column,
 * four glyphs apart, has to look and behave identically or it reads as two
 * different mechanisms. The same instinct `flip-card.tsx` records for the two
 * flipping surfaces.
 *
 * A `Button`, so the shadcn surface stays at card / badge / alert / button —
 * the same call `city-map.tsx`'s outfall toggle and `drill-controls.tsx` make.
 *
 * The glyph is `aria-hidden` and the real name is on the button, because "‹"
 * announced on its own is not a control anybody can use.
 *
 * ⚠️ **Bordered and 24px square as of 2026-08-05, up from a 24x24 ghost with a
 * 13px glyph — on the owner's instruction, and it applies to BOTH pagers.**
 * These are the primary way through 425 instruments (most map markers are not
 * clickable at all — see `SensorMarker`), and a borderless muted chevron in a
 * chrome bar full of other muted type did not read as a control. It now has a
 * border at rest, so it reads as a button rather than as punctuation, and the
 * glyph is larger and heavier.
 *
 * Changing this file moves the harbor pager too. That is the point of it being
 * one file, and it is why the change was made here rather than in
 * `selected-detail.tsx`.
 */
export function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "size-6 rounded-md border border-border p-0 text-[15px] leading-none font-semibold " +
        "text-foreground hover:border-[var(--wl-select)] hover:bg-[var(--wl-select)]/15 hover:text-foreground " +
        "disabled:border-border/40 disabled:text-muted-foreground disabled:opacity-40"
      }
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}
