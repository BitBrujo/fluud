import Link from "next/link";

import { FluudMark } from "./fluud-mark";
import { Spray } from "./spray";

/**
 * The site footer. It is the ONLY footer.
 *
 * ⚠️ **THREE pages render it — `/about`, `/terms`, `/map` — plus every `/auth`
 * view, and none of those may render it optionally.** `/` dropped it on
 * 2026-08-14 when the sign-in screen was stripped to the wordmark and the card,
 * and it is the one page allowed to.
 *
 * ⚠️ **What made that safe is that `src/app/page.tsx` took this component's
 * job.** `/terms` is reached from here and from nowhere else, and it is the page
 * disclosing what signing in stores about a reader — so `Terms` and `Privacy`
 * render under the sign-in card instead. **Deleting those two links deletes the
 * only route to `/terms` from the page every reader lands on.** `/about` got no
 * such replacement and is unreachable from `/`; that is a recorded debt.
 *
 * `LandingSources` was deleted on
 * 2026-08-06, on the owner's instruction, because `/` and `/about` were
 * rendering two footer-shaped bands in a row. Its sources line moved here
 * first and was then removed too, the same day; see the note above
 * `SiteFooter`.
 *
 * ## ⚠️ Rebuilt 2026-08-06, on the owner's instruction — the disclaimer is GONE
 *
 * This footer carried the localised disclaimer (`agent.disclaimer()`, with a
 * hard-coded English fallback) from the first commit until 2026-08-06. The
 * instruction was to remove it for good and describe the app instead. So:
 *
 * - **No `disclaimer` prop.** The four call sites stopped passing it, and
 *   `tests/parity.test.ts` no longer pins a fallback constant out of this file.
 * - **The server string is untouched.** `agent._TEMPLATES["disclaimer"]` still
 *   exists in both languages, still rides `/api/status`, and still closes every
 *   warning email. What changed is that no page renders it.
 * - **What replaced it is a description**, `DESCRIPTION` below. It states what
 *   the app is and never states what conditions are — the never-safe rule governs a
 *   description exactly as it governed the disclaimer.
 *
 * The root `CLAUDE.md`'s removal list carries the history of this footer's
 * earlier claims (the never-safe paragraph, the NWS deferral). This rebuild
 * removes the last claim it carried. What the footer says now: what this is,
 * whose data it draws, and where the other three pages are.
 *
 * ## What did not change
 *
 * **No JavaScript.** This is the part of the page that must still work when
 * everything else has failed: plain text and four links, no `<details>`, no
 * fetch. It renders identically against a dead API because nothing in it comes
 * off the wire any more.
 *
 * `/terms` is reached from here and from nowhere else — see the root
 * `CLAUDE.md`. The wordmark rules are unchanged and commented at the markup.
 */

/**
 * What Fluud is, in short declaratives — the owner's copy, supplied
 * 2026-08-06 and shared with the About intro. No reading and no verdict about
 * conditions; the last two sentences are the prototype statement, back on
 * every page as description rather than as the served disclaimer string.
 */
const DESCRIPTION =
  "Fluud watches New York for street flooding at block scale. It reads " +
  "a public network of depth sensors, pairs them to the city’s traffic " +
  "cameras, and writes down what the instruments report. This is a " +
  "prototype. It is not an emergency service.";

/*
 * ⚠️ The sources line — "FloodNet · NYC DOT · NWS · NOAA · USGS · MIT license"
 * — moved here from `LandingSources` and was then removed outright, both on
 * 2026-08-06 and both on the owner's instruction. `/about`'s sources table is
 * now the one surface crediting the upstream owners and stating the licence.
 */
export function SiteFooter() {
  return (
    /* ⚠️ **NO top margin, as of 2026-08-16.** It carried `mt-12`, which on the
       two pages that close with `PhotoCta` — `/` and `/about` — rendered as a
       48px band of page background between the photograph and this footer's
       `--wl-panel` ground. Against a full-bleed photo that gap reads as a black
       bar rather than as breathing room. **The pages that close with PROSE own
       their own trailing space instead** (`/terms` and `/watch/` carry `pb-12`
       on `<main>`), because a page ending in a paragraph wants the gap and a
       page ending in an image does not. */
    <footer className="border-t border-border bg-[var(--wl-panel)]">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6 text-[12.5px] leading-relaxed text-muted-foreground lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <div className="max-w-[80ch] space-y-2.5">
          {/* ⚠️ The wordmark is DECORATION, and three things about it are rules
              rather than styling.

              It is `aria-hidden`: the `<nav>` beside it already links Home, and
              a screen reader reaching the end of every page does not need the
              product named a second time. It is **not a link**, for the same
              reason — `FooterLink href="/"` is four glyphs away.

              It takes `Spray`'s own `--wl-spray` and does not override the
              colour, because that token is the bone-white the sprayed titles use
              and it is on no scale at all. A footer wordmark in a severity
              colour would be the never-safe rule arriving as branding.

              And it is set in `--font-display`, which is the ONE thing on this
              page allowed to be: a blocked Adobe kit renders it in the system
              stack still wearing the local paint filter. The description under
              it stays `--font-sans` — nothing carrying a claim is set in the
              fetched face. */}
          <span aria-hidden className="flex select-none items-center gap-3">
            <FluudMark />
            <Spray className="text-[26px]">Fluud</Spray>
          </span>
          <p className="text-[#b9c6d4]">{DESCRIPTION}</p>
        </div>

        <nav
          aria-label="Site"
          className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11.5px] tracking-[0.08em] uppercase"
        >
          <FooterLink href="/">Home</FooterLink>
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
          <FooterLink href="/map">Map</FooterLink>
        </nav>
      </div>
    </footer>
  );
}

/**
 * `next/link` rather than a bare `<a>`, on `landing-nav.tsx`'s rule: this
 * footer sits on four pages and every entry has to be a route that resolves
 * from all of them. No in-page anchors here, ever.
 */
function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-sm transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}
