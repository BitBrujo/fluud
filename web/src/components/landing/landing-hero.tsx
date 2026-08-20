import Link from "next/link";

import { LandingCta } from "@/components/landing/landing-cta";
import { Spray } from "@/components/spray";

/**
 * The front door: a photograph, the wordmark over it, one line of what this is,
 * and the door.
 *
 * ⚠️ **The wordmark is a real word at up to 128px and a wrap takes this section
 * to two lines.** `web/CLAUDE.md` records the check: measure the **height**
 * against the line-height, never `getClientRects().length` — the spray filter
 * returns 2 rects on a single visual line.
 *
 * ⚠️ **`Spray` takes `--wl-spray`'s bone white and may not be given a severity
 * colour.** A wordmark tinted by anything is the never-safe rule arriving as
 * branding.
 *
 * ⚠️ **The lede is the SITE DESCRIPTION and `about-sections.tsx`'s masthead
 * carries the same two sentences**, set on the owner's instruction on
 * 2026-08-16. One string on two pages: an edit to either is an edit to both.
 * It names an instrument and a pairing and **states no condition**, which is
 * what keeps it clear of the never-safe rule on a page that has no other prose
 * statement of it.
 *
 * ⚠️ **The photograph is DECORATION** — empty `alt`, `aria-hidden`, no `title`,
 * and never a mark, a scale or an overlay. It is `eager` rather than `lazy`
 * because it is the first thing above the fold and a hero that pops in after the
 * type has settled reads as the page having failed and recovered.
 *
 * ⚠️ **The scrim is `color-mix` over `--background`, not a frozen hex.** The
 * design drew `rgba(6,9,14,…)`, which is estuary's background written out as a
 * literal; `globals.css` carries three palettes and a frozen scrim is the wrong
 * black over two of them. Same rule as `photo-cta.tsx`.
 */
export function LandingHero() {
  return (
    <section className="relative h-[580px] overflow-hidden border-b border-[var(--wl-rule)] sm:h-[660px]">
      <img
        src="/photoz/night_07_subway_entrance.webp"
        alt=""
        aria-hidden
        width={2200}
        height={1228}
        decoding="async"
        className="h-full w-full object-cover"
      />

      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg," +
            "color-mix(in srgb, var(--background) 50%, transparent) 0%," +
            "color-mix(in srgb, var(--background) 30%, transparent) 38%," +
            "color-mix(in srgb, var(--background) 97%, transparent) 100%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col justify-end px-6 pb-14 sm:px-12 sm:pb-18 lg:px-20">
        <h1>
          <Spray className="text-[clamp(56px,14vw,128px)]">Fluud</Spray>
        </h1>

        <p className="mt-6 max-w-[34ch] text-[28px] leading-[1.1] font-semibold tracking-[-0.025em] text-foreground sm:text-[40px]">
          A flood watch for your block.
        </p>

        {/* ⚠️ The site description, and it is the SAME sentence the `/about`
            masthead carries — set on the owner's instruction, 2026-08-16. Two
            pages holding one string means an edit to either is an edit to both;
            see `about-sections.tsx`'s `AboutMasthead`.

            ⚠️ **It was TWO sentences and it is one, 2026-08-17, owner's
            instruction.** The second named the camera pairing — *"pairs each one
            with the traffic camera pointed at the same corner"* — and it is
            gone from both pages. **Neither description mentions the cameras
            now.** What still states the pairing to a reader: this page's
            *"See the depth and the street at once"* section, `/about`'s DOT
            camera count, and the map's own pairs layer. */}
        <p className="mt-5 max-w-[52ch] text-[16.5px] leading-[var(--leading-body)] text-[#b9c6d4] sm:text-[18.5px]">
          Fluud is a hyperlocal flood watch for New York City that lets you
          monitor and craft custom alerts based on the city&rsquo;s embedded
          water sensors.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
          <LandingCta />
          {/* ⚠️ A ROUTE, not an anchor. `site-nav.tsx` carries the argument:
              every navigation on the shared chrome resolves from every body it
              renders on, and this link is the same promise made twice. */}
          <Link
            href="/about"
            className="num rounded-sm border-b border-[var(--border)] pb-1 text-[12.5px] tracking-[0.08em] text-[#b9c6d4] uppercase transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
          >
            About
          </Link>
        </div>
      </div>
    </section>
  );
}
