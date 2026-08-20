/**
 * The sprayed title treatment: a display face, roughened by a local SVG
 * filter.
 *
 * ## Two halves, and only one of them is fetched
 *
 * - **The face** is `--font-display` — `ccsignlanguage`, comic hand-lettering
 *   from the Adobe Fonts kit linked in `layout.tsx`. That link is this site's
 *   one third-party origin, added on the owner's instruction, and the trade is
 *   written out in full at the `<link>` itself and at the token.
 * - **The paint** is entirely local: `feTurbulence` → `feDisplacementMap`
 *   roughening the glyph edges, and two shadows standing in for the overspray
 *   halo a can leaves around a stroke. No kit provides this and none is asked
 *   to.
 *
 * ⚠️ **That split is what makes the webfont survivable.** The filter applies to
 * whatever face actually renders, so a blocked, slow or offline kit degrades to
 * the system stack at its heaviest weight *still wearing the paint* — which is
 * exactly the treatment that shipped before the kit existed. It is a change of
 * type, not a loss of the effect, and nothing that carries a warning or a
 * reading is set in this at all. **Do not "simplify" the fallback out of
 * `--font-display`.**
 *
 * ## Extracted from `neighborhood-back.tsx`, not copied
 *
 * It lived there and had one caller — the neighbourhood tag on the back of a camera
 * card. The landing page's headline, sub-headline and section titles are the
 * second, third and fourth, and a second copy of the filter geometry is how the
 * wordmark and the tag drift into two different-looking paints. Same instinct
 * as `step-button.tsx` and `flip-card.tsx`: the moment a treatment has two call
 * sites, the rules have to arrive with it rather than be re-derived.
 *
 * Both halves degrade cleanly. A browser that ignores `filter: url(#…)` renders
 * heavy text, which is legible and on-brand enough that there is nothing to
 * fall back to.
 */

/**
 * One sprayed word.
 *
 * `className` sets the size and colour; everything else is the paint. Callers
 * pass `text-[…]` for scale and may override the colour, which is why the
 * default `--wl-spray` is applied first and can be beaten by a later class.
 */
export function Spray({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      /* ⚠️ `font-black` (900) with a kit that ships 400/700 is deliberate, not
         a mismatch. CSS font matching resolves 900 to the kit's 700 — a real
         face, so no synthetic bold — while the *fallback* stack takes 900 and
         renders as heavy as the system can manage. One declaration serves both
         paths at their heaviest. Dropping it to 700 would quietly thin the
         no-kit rendering, which is the one this has to survive. */
      className={`block font-[family-name:var(--font-display)] leading-[0.95] font-black tracking-[-0.01em] text-[var(--wl-spray)] ${className}`}
      style={{
        filter: "url(#wl-spray)",
        textShadow:
          "0 0 1px currentColor, 0 0 4px color-mix(in srgb, currentColor 45%, transparent), 0 0 14px color-mix(in srgb, currentColor 20%, transparent)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * The spray filter, defined **once** for the whole document.
 *
 * An SVG filter needs a document-scoped id, so defining it inside each caller
 * would put N identical `#wl-spray` nodes in the tree — the browser resolves
 * the first and the rest are dead weight. Every page that renders a `<Spray>`
 * renders exactly one of these, near the root.
 *
 * `feDisplacementMap` at scale 2.4 is the whole trick: enough to break the
 * vector edge into something that looks like paint hitting a rough surface,
 * little enough that a 58px numeral is still unambiguously that numeral. The
 * noise has to be *fine* for that — a low `baseFrequency` warps the whole glyph
 * into a wobble instead of roughening its edge, which reads as a rendering
 * fault rather than as paint. Push the scale past ~3 and digits start reading
 * as each other, which on a page about measurements is not a stylistic problem
 * but a correctness one.
 */
export function SprayDefs() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter id="wl-spray" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.42 0.55"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={2.4}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
