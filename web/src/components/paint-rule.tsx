import { cn } from "@/lib/utils";

/**
 * The four-colour band across the top of every page. Decoration, and the only
 * thing on either page that is purely that.
 *
 * ⚠️ **The design's fourth band was `#22c55e` and it is lime here instead. That
 * substitution is the point of this file existing at all.**
 *
 * The landing design specified `magenta · violet · cyan · green`, with the green
 * being `#22c55e` — which in this app is not a colour, it is `--wl-live`, the
 * provenance signal. Two separate rules say it cannot be spent here:
 *
 * - **Invariant 1.** A green band the full width of the page, above the
 *   wordmark, reads as "everything is fine" from across a room. That is the
 *   same judgement that keeps the freshness dot muted-never-green and keeps
 *   `ModeBadge` outlined rather than a filled green slab — and this is the same
 *   corner of the same page.
 * - **It would spend a signal on furniture.** `--wl-live` means "you are
 *   looking at real data". A decorative stripe wearing it makes the badge that
 *   actually carries that claim one more green thing in a row of green things.
 *
 * `--wl-lime` costs nothing to swap in: it is louder than the green was, it is
 * poster paint on no scale in this file, and nobody reads chartreuse as
 * reassurance. All four bands are now on no scale, which is the property that
 * makes a decorative stripe safe on a page where colour otherwise means
 * something. **Do not put `--wl-live` or any ramp colour back into it.**
 */
export function PaintRule({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-1 w-full shrink-0 sm:h-[5px]", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg," +
          "var(--wl-select) 0 25%," +
          "var(--wl-violet) 25% 50%," +
          "var(--wl-cyan) 50% 75%," +
          "var(--wl-lime) 75% 100%)",
      }}
    />
  );
}
