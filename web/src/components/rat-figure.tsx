"use client";

import { useState } from "react";

import { LEVELS, LEVEL_RAT, LEVEL_RAT_LOOP, type Level } from "@/lib/levels";
import { cn } from "@/lib/utils";

/**
 * The alert rat: four baked stills on the level ramp, with the active level's
 * baked loop held over them.
 *
 * ⚠️ **There is exactly one of these on the page now** — in the masthead
 * (`site-header.tsx`), where it is also the drill trigger. It briefly had a
 * second home in the rat monitor; that panel was removed on the owner's
 * instruction and this file outlived it deliberately. Everything below is a
 * safety property rather than a styling choice, and the moment someone wants a
 * rat somewhere else the rules have to arrive with it rather than be
 * re-derived. Size is the *only* thing a caller chooses; pass it on
 * `className`.
 *
 * All four stills render, and only the active one is opaque. That costs ~37KB
 * once and buys two things: an escalation never shows an empty box while an
 * image fetches — the exact moment a gap is least acceptable — and the only
 * thing that ever changes is opacity, so `prefers-reduced-motion` can stop the
 * movement without stopping the signal. Same rule as `.wl-urgent`.
 *
 * ⚠️ **The loop layer is one image, not four, and the still stack stays.** Four
 * stacked animated WebPs would all decode continuously even at `opacity: 0` —
 * paying four rats' worth of battery to show one, on a phone, during a flood.
 * One loop over an already-painted still costs a single decode and keeps the
 * no-empty-box guarantee, because the still under it is already there.
 *
 * ⚠️ **The still under the running loop is hidden the moment the loop is
 * ready, and that is a correctness fix rather than a tidy-up.** The two images
 * are the same animal in the same frame, so a still left lit under a cycle that
 * has walked away from it composites as a second, motionless rat — a ghost. It
 * is worst exactly where the ramp is loudest, because `emergency` gallops the
 * furthest from the pose its still was cut at. So the stack is not *deleted*
 * (that would cost the two properties above); it is switched off on the loop's
 * own `load`, and switched back on by the level change that swaps the loop.
 *
 * The handover rides the same 500ms opacity transition as everything else here,
 * and that is deliberate: `load` fires when the resource is decoded, not when it
 * has been painted, so a hard `hidden` could blink a frame of nothing between
 * the two. A fade cannot — the loop paints inside the first 30ms of a
 * half-second dissolve. Under reduced motion the fade snaps instead, and the
 * layer on top is the still itself (see below), so there is nothing to blink to.
 *
 * ⚠️ **Reduced motion is served by `<picture>`, not by `hidden`.** The
 * reduced-motion `<source>` points at the *still* — a URL the stack above has
 * already fetched — so that reader gets a cache hit, sees exactly what shipped
 * before loops existed, and never downloads an animation. `motion-reduce:hidden`
 * would have been simpler and wrong: `display: none` does not reliably stop the
 * fetch, so the reader most likely to be on a metered or struggling connection
 * would pay for an image they were promised they would not see.
 *
 * `dimmed` is for REPLAYED and DRILL. A fully-lit rat under a replayed warning
 * is the stale-replay rule failing while wearing a rat costume, so it rides the same
 * signal the masthead's provenance chips do. 70%, not the 45% this started at:
 * the rat is a dark, rim-lit subject on a dark ground, and at 45% the EMERGENCY
 * frame all but disappeared — on the drill path, which is the one a demo
 * actually walks. ⚠️ It matters more than it did: the panel that used to go
 * *dashed* for REPLAYED and DRILL is gone, so the chips and this are now the
 * whole of that signal.
 *
 * `aria-hidden` with an empty `alt`, always. The templated text is the only
 * channel that carries a warning; describing this in alt text would be inventing
 * copy the server did not template, which is the templated-copy rule through a side door.
 *
 * Plain `<img>` and not `next/image`, following `camera-card.tsx`: under
 * `output: "export"` there is no Next server to optimize anything, and
 * `images.unoptimized` is already set. Explicit width/height, and a fixed
 * rendered size from the caller, so nothing reflows when the images land.
 */
export function RatFigure({
  level,
  dimmed = false,
  className,
}: {
  level: Level;
  /** REPLAYED or DRILL. Agrees with the masthead's chips rather than restating them. */
  dimmed?: boolean;
  /** Size only. The rules above are not the caller's to change. */
  className?: string;
}) {
  /*
   * Which level's loop has finished loading — the level itself, not a boolean.
   *
   * Derived during render, on the same terms as `use-history.ts`: comparing it
   * to the level being drawn means a `load` that belongs to the *previous* loop
   * can never hide the still of the current one. An effect-based reset would
   * render once with the wrong answer first, and that one frame is precisely
   * the escalation frame this component exists to keep filled.
   */
  const [loaded, setLoaded] = useState<Level | null>(null);
  const looping = loaded === level;

  return (
    <div
      aria-hidden
      className={cn(
        "relative shrink-0",
        "transition-opacity duration-500 motion-reduce:transition-none",
        dimmed && "opacity-70",
        className,
      )}
    >
      {LEVELS.map((l) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={l}
          src={LEVEL_RAT[l]}
          alt=""
          width={320}
          height={320}
          loading="eager"
          className={cn(
            "absolute inset-0 size-full",
            // A crossfade is opacity-only, so it is already the safe kind of
            // change — but under reduced motion it simply snaps, which is
            // better still and costs nothing.
            "transition-opacity duration-500 motion-reduce:transition-none",
            // Lit only while it is both the active level *and* the thing
            // actually being looked at. Once the loop is up this still is
            // underneath a moving animal, where it reads as a ghost.
            l === level && !looping ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      {/*
        Keyed on the level so React swaps the element rather than mutating the
        `src` of a playing animation — an in-place src change restarts the
        decode against the previous frame still composited, which flashes at
        exactly the wrong moment. The key is also what puts the still stack back
        on for the next level: a fresh element has not loaded yet.
      */}
      <picture key={level}>
        <source
          media="(prefers-reduced-motion: reduce)"
          srcSet={LEVEL_RAT[level]}
        />
        <img
          src={LEVEL_RAT_LOOP[level]}
          alt=""
          width={320}
          height={320}
          loading="eager"
          decoding="async"
          // ⚠️ **`onLoad` alone does not catch a cached loop, and that is the
          // common case, not the edge case.** An image served from memory or
          // disk cache — a reload, a stand-down back to a level already seen,
          // any second visit — can finish before React attaches the handler, so
          // the event never arrives, `loaded` stays null, and the still sits lit
          // under a running animation: exactly the ghost this component exists
          // to remove, and only on the paths a demo actually walks. `complete`
          // in a ref callback is the only way to observe it, and the callback is
          // safe to fire on every commit because `setLoaded(level)` with the
          // level already stored is a no-op React bails out of.
          ref={(node) => {
            if (node?.complete) setLoaded(level);
          }}
          // No `onError` counterpart on purpose: a loop that fails to load
          // leaves `loaded` alone, so the still stays lit and the rat degrades
          // to exactly what shipped before loops existed.
          onLoad={() => setLoaded(level)}
          className="absolute inset-0 size-full"
        />
      </picture>
    </div>
  );
}
