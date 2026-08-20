"use client";

import { cn } from "@/lib/utils";

/**
 * A card with a back.
 *
 * ⚠️ **ONE surface uses this now: a gauge card, flipping to what its number is
 * measured against.** It had two — the selected-instrument panel turned over to
 * a DOHMH rat-inspection tag for the camera's neighbourhood, and that feature
 * was deleted on 2026-08-14.
 *
 * **It stays a shared component rather than being folded into
 * `harbor-baseline.tsx`**, because what it holds is not layout: it is the two
 * things a second flipping surface is most likely to get wrong — what is in the
 * accessibility tree, and what happens under `prefers-reduced-motion`. A single
 * caller is a weaker argument for extraction than two, and it is still the right
 * one while `FlipTrigger` is exported beside it.
 *
 * ## Both faces are stacked in one grid cell, not absolutely positioned
 *
 * `[grid-area:1/1]` on each face puts them in the same cell of a one-cell grid,
 * so the container's height is the **taller** of the two and neither face can
 * be clipped by the other. The obvious implementation — front in flow, back
 * `absolute inset-0` — sizes the card to the front alone, and a back that is
 * one line longer then either overflows or has to scroll, on a surface whose
 * whole job is to be readable at a glance.
 *
 * ## The hidden face is `inert`, not merely rotated away
 *
 * `backface-visibility: hidden` is a paint rule. It does not take the back out
 * of the tab order and it does not take it out of the accessibility tree, so
 * without `inert` a screen reader reads both faces of every card and a Tab pass
 * stops on controls nobody can see. `inert` is a real attribute in React 19;
 * `aria-hidden` rides along because the two are still separately honoured in
 * the wild.
 *
 * ## Reduced motion snaps
 *
 * `motion-reduce:transition-none` — the same rule the rat's crossfade and
 * `.wl-urgent` follow. The flip is how the change gets noticed; the content is
 * the information, and turning the movement off costs nobody the content.
 *
 * Arbitrary-property syntax (`[transform-style:preserve-3d]`) rather than
 * Tailwind's 3D utilities, deliberately: these five declarations have to agree
 * exactly for a flip not to show its own back through the front, and spelling
 * them out keeps that legible to the next person.
 */
export function FlipCard({
  flipped,
  front,
  back,
  className,
}: {
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("[perspective:1400px]", className)}>
      {/*
       * ⚠️ `[grid-template-rows:minmax(0,1fr)]` is what makes a face inside a
       * height-constrained parent actually *clamp*.
       *
       * Left implicit, the single row is auto-sized: on a card that is the
       * intent — the row grows to the taller face and nothing is clipped — but
       * inside a flex item with a definite height (the selected-instrument
       * panel, now one of three panels sharing a screen) an auto row keeps
       * growing to its content, the panel's `h-full` resolves against an
       * indefinite track, and the body's `overflow-y-auto` never engages. The
       * panel then silently overlaps the one below it instead of scrolling.
       * Measured at 1440x900: a 335px slot rendering a 464px panel.
       *
       * `minmax(0, 1fr)` is right in both cases. With an indefinite grid height
       * `1fr` still resolves to the content size, so cards are unchanged; with
       * a definite one the `0` floor lets the row be clamped to it.
       *
       * The **column** is the same trick against the same default, one axis
       * over: an auto column is sized to the faces' max-content, so a card in a
       * narrow cell — a gauge card two-up on a phone — is drawn at the width of
       * its longest unbroken line and spills out of the panel. Measured at
       * 390px: a 156px cell rendering a 217px card. `min-w-0` on the faces is
       * not enough on its own, because it is the *track* that is too wide.
       */}
      <div
        className={cn(
          "relative grid h-full",
          "[grid-template-rows:minmax(0,1fr)] [grid-template-columns:minmax(0,1fr)]",
          "transition-transform duration-500 ease-out",
          "[transform-style:preserve-3d] motion-reduce:transition-none",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        <div
          className="min-h-0 min-w-0 [grid-area:1/1] [backface-visibility:hidden]"
          inert={flipped ? true : undefined}
          aria-hidden={flipped || undefined}
        >
          {front}
        </div>
        <div
          className="min-h-0 min-w-0 [grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]"
          inert={flipped ? undefined : true}
          aria-hidden={!flipped || undefined}
        >
          {back}
        </div>
      </div>
    </div>
  );
}

/**
 * The invisible button that turns a card over.
 *
 * Laid over the whole face rather than sitting in a corner, because the ask was
 * that the card flips when clicked. It is a real `<button>` with a real label
 * and `aria-expanded`, so the flip is announced as a disclosure rather than
 * happening silently — and anything on the face that must stay clickable simply
 * needs to sit above it (`relative z-10`), which is what the camera card's name
 * does to keep selection working.
 */
export function FlipTrigger({
  flipped,
  label,
  onClick,
  className,
}: {
  flipped: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={flipped}
      onClick={onClick}
      title={label}
      className={cn(
        "absolute inset-0 z-[1] cursor-pointer rounded-md",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "focus-visible:ring-inset focus-visible:outline-none",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </button>
  );
}
