"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * ⚠️ A subscribe that never fires, on purpose.
 *
 * Both reads below are answered once, at hydration, and then frozen. The
 * obvious `useEffect` + `setState` version is a cascading render React now
 * lints against, and a real media-query subscription would swap the video's
 * `src` when a phone rotates — which restarts a 27s loop under somebody's
 * eyes. `useSyncExternalStore` gives the server snapshot to the export and the
 * client snapshot to the browser with no effect in between, which is exactly
 * the two-state resting behaviour this component wants.
 */
const never = () => () => {};

/**
 * The notifications section, in full, as a looping video. **It IS the whole
 * section** — since 2026-08-16, on the owner's instruction, `LandingNotify`
 * renders this and nothing else.
 *
 * Two cuts of one composition, 27s each, rendered by hand from
 * `web/scripts/motion/notify-walkthrough{,-tall}/` (HyperFrames HTML
 * compositions). **Committed build input**, on the same terms as the basemap,
 * the rat stills and the photographs: generated offline, checked in, and never
 * rebuilt by the Docker UI stage, which has neither a headless Chrome nor
 * egress.
 *
 * | cut | frame | file | for |
 * |---|---|---|---|
 * | wide | 1920×1080 | `notify-walkthrough.mp4`, 1.3MB | `sm` and up |
 * | tall | 1080×1350 | `notify-walkthrough-tall.mp4`, 1.4MB | below `sm` |
 *
 * ⚠️ **The tall cut is not the wide one letterboxed, and the second file is not
 * a nicety.** Measured at 390: the wide cut renders 340px across, which puts
 * 1920px of drawn interface into a 340px box — the address field's text lands
 * near 4px and the whole thing is a smear. The tall cut drops the borough
 * column, shows three instrument rows instead of five, and roughly doubles
 * every type size against its frame. **Changing one cut means re-rendering
 * both**, and nothing checks that they still say the same thing.
 *
 * It draws the three steps happening: an address typed into the lookup and a
 * candidate picked, the nearest instruments with their monitor rings filling,
 * the level chips and the quiet-hours selects, and then the WARNING email
 * arriving.
 *
 * ## ⚠️ The copy is now ONLY in the video, and that is the standing cost
 *
 * This section was a header, a body paragraph, a three-step `<ol>` and an
 * illustrated `EmailCard`, all of it real DOM text. **All of it was deleted on
 * the owner's instruction**, and what a reader meets is this panel. So the
 * section's words are pixels: not selectable, not searchable, not translatable,
 * and not in the source a reviewer reads.
 *
 * ⚠️ **The `sr-only` block below is what stops that from also being an
 * accessibility hole, and it is not optional.** A video cannot be read, so this
 * one cannot be `aria-hidden` decoration the way the photographs are — it is
 * the section's *content*, and content owes a text equivalent. **That block is
 * now the one copy of these words in the repo, and it and the two compositions
 * move together.** It is `sr-only` only because the visible version was
 * removed; if that instruction is reversed, the visible text comes back and
 * this block goes with it.
 *
 * ❌ ⚠️ **Its `<h2>` came OFF on 2026-08-16 and this is the one thing that is
 * NOT sr-only any more.** The section grew a visible title rail beside this
 * panel — *Set your alerts*, in `landing-sections.tsx` — on the owner's
 * instruction, and two `<h2>`s in one `<section>` saying two different things
 * is one heading too many: a screen reader would hear the section named twice,
 * differently. **The visible title heads the section for everybody now**, and
 * *"Told when the water comes up"* is gone with the tag. The paragraphs and the
 * `<ol>` under it are untouched, because those are what the video draws and the
 * title is not.
 *
 * ⚠️ **`57` is a literal in both compositions and appears once more in that
 * block, and nothing can check the three agree** — two of them are pixels. Same
 * class of unenforceable duplication as variant *i* in `en` matching variant
 * *i* in `es`.
 *
 * ## ⚠️ It illustrates, and every rule the real controls carry travels with it
 *
 * The drawn interface is not a screenshot and no compiler can reach it, so the
 * constraints are written where they are drawn, in the compositions. The four
 * easiest to get wrong on a re-render:
 *
 * 1. **No depth appears in the instrument list.** Rows carry a name and a
 *    distance and nothing else. A depth column would have put five more
 *    unlabelled illustrated readings on `/`.
 * 2. ⚠️ **A distance takes `--muted-foreground`, at every distance, forever.**
 *    Reddening with distance is a severity ramp built out of coverage;
 *    greening as it shrinks is reassurance beside a depth.
 * 3. ⚠️ **The monitor rings and the level chips are `--wl-select`.** Both are
 *    facts about the *reader*, never about the water — `warning up` wearing a
 *    selection colour rather than an amber one is the point. A trigger chip is
 *    a preference and not a severity.
 * 4. ⚠️ **The quiet-hours sentence is verbatim from `watch-parts.tsx`** and may
 *    not be paraphrased. Quiet hours **suppress** and never delay, and an
 *    emergency always sends. A drawn face that softened either would sell a
 *    silence this system refuses to sell.
 *
 * ## ⚠️ The FRAME is on the media, never on a wrapper, and that is why
 *
 * It is a left-hand column with a border round it as of 2026-08-16, not a
 * full-bleed band. **The border and the radius are classes on the `<video>` and
 * the `<img>` themselves.** Put on a wrapping `<div>` in `landing-sections.tsx`
 * they would still be drawn in the `none` branch below, where there is no media
 * at all — a bordered box a couple of pixels tall, in a column, on a page,
 * reading as exactly the thing this component refuses to render: something that
 * failed to load. **Both elements carry the same three classes and they move
 * together**; two frames that differ would show as the panel changing shape when
 * a reader turns motion off.
 *
 * ## The three branches, and why the resting one is nothing
 *
 * The server snapshot is `none`, so the static export — the HTML `api.py`
 * actually serves — ships no panel and no `<video>`. A reader with no
 * JavaScript gets the `sr-only` text and no broken box.
 *
 * **`prefers-reduced-motion: reduce` gets a poster and never a video.** Not
 * `motion-reduce:hidden` on a `<video>`: `display: none` does not reliably
 * prevent the fetch, and that reader is the one most likely to be paying for
 * it. This is `rat-figure.tsx`'s rule at another component — the frame a
 * reduced-motion reader sees is the only frame they see, so it has to be a
 * complete one.
 *
 * ⚠️ **Both posters are the LAST frame, never the first.** The first frame is
 * an empty panel. Every failure path — blocked autoplay, a dropped file, a
 * reader who never scrolls this far, reduced motion — lands on the finished
 * email rather than on a blank box that reads as something that failed to load.
 *
 * ⚠️ **It LOOPS, on the owner's instruction.** The argument against was that a
 * loop wipes the finished email off the screen every 27 seconds and starts
 * typing an address again in front of somebody reading it. **That cost is real,
 * and now that the section is only this panel it is larger than it was**: there
 * is no longer an `<ol>` beside it holding the three steps still, so a reader
 * arriving mid-cycle sees step 02 and cannot reach step 01 except by waiting.
 * The `sr-only` block is the only thing on the page stating all three at once.
 *
 * ## ⚠️ What this does not change about `/`
 *
 * Nothing here fetches, and mounting it adds no request to a page that **may
 * not poll** — with the API gated, a request from `/` is a guaranteed 401 for
 * the signed-out reader this page exists for. Every figure in both cuts is a
 * fixed literal.
 *
 * ⚠️ **The count from 0 to 57 at the end is the one thing worth arguing about,
 * and it was kept on the owner's instruction.** It is a fixed tween over a
 * constant — no clock, no input — but a reader cannot see that, and a rising
 * number beside `WARNING` on a page with no timestamp, no plausibility flag and
 * no `EXAMPLE` label is the closest this site comes to animating a depth.
 * **Allowed here and nowhere else.** The standing rule is unchanged: never
 * drive a water animation from anything, and a number that has to be current
 * belongs on `/map`.
 */
export function NotifyWalkthrough() {
  /* `none` on the server, so the export ships no panel at all and the no-JS
     and reduced-motion paths are one branch rather than two special cases. */
  const mode = useSyncExternalStore<"none" | "still" | "motion">(
    never,
    () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "still"
        : "motion",
    () => "none",
  );
  const tall = useSyncExternalStore(
    never,
    () => !window.matchMedia("(min-width: 640px)").matches,
    () => false,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (mode !== "motion" || !host) return;

    /* Playback STARTS on approach rather than on mount. `rootMargin` gets the
       fetch going before the panel is on screen, and the observer disconnects
       on the first hit — `loop` keeps it running from there, so there is
       nothing left for it to do. Starting on mount would spend 1.3MB on every
       reader who never scrolls this far. */
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        /* A rejected play() is not worth reporting: the poster is the last
           frame, so a blocked autoplay leaves the finished email on screen and
           the reader loses the demonstration and nothing else. */
        void videoRef.current?.play().catch(() => {});
      },
      { rootMargin: "400px 0px", threshold: 0.2 },
    );
    io.observe(host);
    return () => io.disconnect();
  }, [mode]);

  const src = tall
    ? "/motion/notify-walkthrough-tall.mp4"
    : "/motion/notify-walkthrough.mp4";
  const poster = tall
    ? "/motion/notify-walkthrough-tall-poster.webp"
    : "/motion/notify-walkthrough-poster.webp";
  const w = tall ? 1080 : 1920;
  const h = tall ? 1350 : 1080;

  return (
    <div ref={hostRef}>
      {/*
        ⚠️ THE ONLY COPY OF THIS SECTION'S WORDS. The visible header, the
        three-step list and the illustrated email were deleted on the owner's
        instruction, and this is what a screen reader, a search engine and a
        reader with no JavaScript get instead. It is not boilerplate and it is
        not a duplicate — there is nothing left for it to duplicate. It moves
        with the two compositions, or the page starts lying about what the
        video shows.
      */}
      {/* No `<h2>` here: the section's visible title rail carries the heading
          since 2026-08-16, and a second one would name this section twice. */}
      <div className="sr-only">
        <p>
          You choose the corners you care about, say when you want to hear about
          them, and Fluud emails you when the water comes up.
        </p>
        <ol>
          <li>Search an address and pick the block.</li>
          <li>Start monitoring the nearest instruments — up to ten.</li>
          <li>
            Set the level you want warning at, and the hours you want quiet.
          </li>
        </ol>
        <p>
          An example of what arrives: a message from Fluud at 2:14 AM, marked
          WARNING, for 3rd Ave &amp; Carroll St, reading 57 mm. It is an
          illustration, not a reading from tonight.
        </p>
      </div>

      {mode === "motion" ? (
        <video
          ref={videoRef}
          /* ⚠️ The frame is here and not on a wrapper — see the docblock. The
             `<img>` below carries the same three classes. */
          className="block w-full rounded-sm border border-[var(--border)]"
          width={w}
          height={h}
          src={src}
          poster={poster}
          preload="none"
          muted
          playsInline
          /* ⚠️ Loops, on the owner's instruction — see the docblock for what
             that costs now that this panel is the entire section. */
          loop
          /* The `sr-only` block above is the text equivalent, so this element
             carries no description of its own — a picture never invents copy
             the page did not write. */
          aria-hidden
        />
      ) : mode === "still" ? (
        <img
          className="block w-full rounded-sm border border-[var(--border)]"
          width={w}
          height={h}
          src={poster}
          alt=""
          aria-hidden
        />
      ) : null}
    </div>
  );
}
