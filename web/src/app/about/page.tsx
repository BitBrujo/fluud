import Link from "next/link";

import {
  AboutInventory,
  AboutMasthead,
} from "@/components/about/about-sections";
import { PaintRule } from "@/components/paint-rule";
import { PhotoCta } from "@/components/photo-cta";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { SprayDefs } from "@/components/spray";

/**
 * The About page, at `/about`.
 *
 * ## ⚠️ It was SIX numbered sections and is now TWO bands
 *
 * Rebuilt to a supplied design on 2026-08-16, on the owner's instruction: a
 * masthead, the two inventory counts, the sources table, and a closing photo
 * band. ⚠️ **The counts and the sources were merged into ONE grid later the
 * same day**, also on the owner's instruction — two counts stacked left, the
 * sources right — so `AboutInstruments` and `AboutSources` are one
 * `AboutInventory` and the sources table is a `<dl>`. **`about-sections.tsx`'s
 * docblock is the accounting of what that deleted**, section by section, and it
 * is the thing to read before assuming this page still explains something. The
 * short version:
 *
 * - ❌ **The second-witness rule and the two thresholds' argument** went with
 *   *"How it decides"*. No surface explains them to a reader now.
 * - ❌ **The coverage rule in prose** went with *"What it cannot see"*.
 *   `LIMITATIONS.md` §2 still argues it; no page says it.
 * - ❌ **The never-safe rule in prose** went with the intro's rules block.
 *   ⚠️ **`/terms` §03 and `/`'s notifications section are the two places left**,
 *   and `/`'s is the only one a reader meets without choosing anything.
 * - ❌ **The MIT licence statement** went with the sources section's closing
 *   paragraphs. Nothing on this site states it.
 *
 * ## ⚠️ A third route means a third DIRECTORY in the export
 *
 * `next.config.ts` sets `trailingSlash: true`, which is the only reason this
 * resolves once FastAPI is the server rather than `next dev`. With it off the
 * export is `out/about.html`, a request for `/about` looks for a file literally
 * named `about`, and `StaticFiles(html=True)` answers with the 404 page — while
 * the dev server serves it perfectly.
 *
 * ## ⚠️ It fetches NOTHING now, and it is a server component again
 *
 * It polled `/api/status` on the usual 15s for exactly two things: the two
 * borrowed thresholds and the mode badge. **The thresholds went with
 * `AboutDecides`**, so the badge was the whole remaining reason — and `/`'s rule
 * covers that: with `REQUIRE_AUTH` on, that request is a guaranteed 401 for a
 * signed-out reader, rendered through `lib/messages.ts` as *cannot reach the
 * service*, which is an error about the instrument shown to somebody who is
 * merely not signed in. `SiteNav` takes `mode={null}` and `ModeBadge` says
 * `UNKNOWN`, which is the truthful answer before anybody has proved anything.
 *
 * ⚠️ **Dropping the hook dropped `"use client"` with it.** Nothing on this page
 * has state, an effect or a handler.
 *
 * ## ⚠️ This page renders no reading, and that has not moved
 *
 * Not a depth, not an age, not a severity colour, not a count of what is
 * happening right now. It is inventory and credit. ⚠️ **`/` no longer holds this
 * property** — two illustrated cards there render a depth on the ramp, on the
 * owner's instruction — **and this page is not to follow it.** There is nothing
 * on `/about` for a figure to illustrate.
 *
 * ⚠️ **It must also stay readable SIGNED OUT.** A reader cannot agree to terms
 * they have to sign in to read, and this page and `/terms` are the two documents
 * that argument covers.
 */
export default function About() {
  return (
    <>
      {/* The spray filter every `<Spray>` on this page references. An SVG
          filter id is document-scoped and each page is its own document, so
          each renders exactly one of these. */}
      <SprayDefs />

      <PaintRule />
      <SiteNav mode={null} current="about" />

      <main className="flex-1">
        <AboutMasthead />
        <AboutInventory />

        {/* ⚠️ A plain link, not `/`'s session-aware door. This page's nav
            already sends a reader at `/map`, and a second component here that
            could say `Log in` instead would make one page ask twice which of
            the two states the reader is in. Signed out, `RequireSession`
            answers it. */}
        {/* ⚠️ **`scale` is MANDATORY on this photograph and 1.38 is the floor.**
            The file has a white print border baked in — 13.8% of the width on
            each side, 3.7% of the height top and bottom — so at `scale-100` the
            band renders white bars down both edges. It is one of only TWO in
            `public/photoz/` that do; see `photo-cta.tsx`. 1.45 clears it with
            room, and `78%` is what keeps the umbrella — the subject, low in the
            frame — inside the crop at every width above ~824px, where this band
            starts cropping vertically at all. */}
        <PhotoCta
          photo="night_01_elevated_tracks.webp"
          headline="Got alerts?"
          height="h-[380px] sm:h-[460px]"
          scale="scale-[1.45]"
          position="center 78%"
        >
          <Link
            href="/map/"
            className="inline-block self-start rounded-sm bg-[var(--wl-select)] px-6 py-3.5 font-mono text-[13.5px] font-semibold tracking-[0.06em] text-[var(--primary-foreground)] uppercase shadow-[5px_5px_0_var(--wl-cyan)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[4px_4px_0_var(--wl-cyan)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
          >
            Open the map
          </Link>
        </PhotoCta>
      </main>

      {/* The ONE footer, and on this page it is also the only route to
          `/terms`. */}
      <SiteFooter />
    </>
  );
}
