import { Spray } from "@/components/spray";

/**
 * The numbered-section shell the two long-form document pages share —
 * `/about` and `/terms`.
 *
 * ⚠️ **Extracted rather than copied**, on `step-button.tsx`'s precedent and for
 * the same reason: two pages carrying the same reading surface have to look and
 * behave identically or they read as two different documents. It lived inside
 * `about/about-sections.tsx` until `/terms` needed it on 2026-08-05.
 *
 * `tint` alternates the ground so the sections read as separate passes rather
 * than as one long scroll. ⚠️ **It carries no meaning and never varies with
 * anything.** Neither page renders a reading, so there is nothing here for a
 * colour to encode — and the accents both pages pass in (`--wl-select`,
 * `--wl-cyan`, `--wl-violet`) are poster paint on no scale. **No numeral in
 * either document may take a severity, provenance or staleness colour.** A
 * green numeral beside a sentence about flooding is the never-safe rule arriving as
 * decoration.
 */
export function NumberedSection({
  n,
  accent,
  title,
  tint,
  wide = false,
  id,
  children,
}: {
  n: string;
  accent: string;
  title: string;
  tint: boolean;
  /** Lets a wide surface (a table) use the full measure instead of the prose cap. */
  wide?: boolean;
  /**
   * An optional fragment target, so another page can link to this section
   * rather than to the top of the document.
   *
   * ⚠️ **A numeral is not a stable address and must never be used as one.**
   * `/about` shipped with seven sections and renumbered to 01–06 when one was
   * removed, so `#04` would now point at a different section than it did.
   * Anchors here are NAMES — `#privacy` — and they survive a renumber.
   *
   * ⚠️ **This is the one anchor exception to `site-nav.tsx`'s rule that every
   * navigation must be a route.** That rule exists because the nav renders on
   * three different bodies, so an in-page anchor is broken on at least two of
   * them. A link that names its page *and* its fragment — `/terms/#privacy` —
   * resolves from anywhere, because the destination is fixed.
   */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-6 border-b border-[var(--wl-rule)] px-5 py-12 sm:px-8 lg:px-11 lg:py-16 ${
        tint ? "bg-card" : "bg-background"
      }`}
    >
      <div className="mx-auto grid w-full max-w-[1320px] gap-7 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <Spray className="text-[32px]" style={{ color: accent }}>
            {n}
          </Spray>
          <h2 className="mt-3 text-[21px] leading-snug font-semibold tracking-[-0.01em] text-balance">
            {title}
          </h2>
        </div>

        {/* ⚠️ `min-w-0` is load-bearing on this track and the failure it
            prevents is invisible above `lg`. Below the breakpoint this grid
            collapses to one implicit `auto` column, and an `auto` column is
            floored at its content's *min-content* width — which `/about`'s
            source table sets to its own `min-w-[560px]`. Measured at 390px
            without it: the column resolved to 568px and the whole document
            scrolled sideways by 194px, so every section on the page moved to
            make room for a table three sections down. With it the table scrolls
            inside its own box, which is the rule every wide surface here
            follows. */}
        <div
          className={`min-w-0 space-y-4 text-[15px] leading-relaxed text-muted-foreground ${
            wide ? "" : "max-w-[66ch]"
          }`}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * A list of short rules, marked the way the landing page marks a feature.
 *
 * ⚠️ **The 3px violet left rule is a cross-file obligation.**
 * `landing-sections.tsx`'s `Feature` carries the same mark, and this docblock is
 * only true while it does. Verified in a browser: both render
 * `rgb(155, 92, 255)` at 3px.
 */
export function Rules({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2.5">{children}</ul>;
}

export function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="border-l-[3px] border-l-[var(--wl-violet)] pl-4">
      {children}
    </li>
  );
}
