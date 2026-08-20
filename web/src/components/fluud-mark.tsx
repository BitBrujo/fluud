/**
 * Three lines in a box: a water level, more or less. Decoration.
 *
 * Extracted from `landing-nav.tsx` on 2026-08-06 when the mark went into the
 * map masthead and the footer — three surfaces carrying one identity have to
 * render one component or they drift into three marks (`step-button.tsx`'s
 * precedent).
 *
 * ⚠️ `aria-hidden`, no label, ever. The wordmark beside it names the product;
 * a label here would be inventing an identity in alt text — the same rule the
 * unmounted alert-rat images carry. The line colours are poster paint (`--wl-cyan`, `--wl-select`) and the
 * border token, none of which is on a scale, and none may become a severity,
 * provenance or staleness colour.
 *
 * ⚠️ **The middle line is a WAVE as of 2026-08-15**, on the owner's
 * instruction, and it is the only one. Two rules hold it:
 *
 * - ⚠️ **It is fixed geometry and takes no input.** Not a depth, not a level,
 *   not the tide, not the time of day. It is `.wl-swell`'s rule arriving on a
 *   logo: the moment a waterline takes an input it is a reading with no age, no
 *   plausibility and no scale beside it. It also does not move — this is a path
 *   in a static SVG, and animating it would be the same rule again with a clock
 *   for an input.
 * - ⚠️ **The three lines stay evenly spaced and the wave stays between its
 *   neighbours.** Two full cycles at ±2 units, on a 1.6 stroke, against a
 *   5-unit gap: it reaches 3.2 and 8.8 and clears both bars by 1.2. Deepening
 *   it would have the mark read as a level rising toward a fixed line above it,
 *   and a line a surface crosses is a threshold.
 *
 * ⚠️ **`web/public/fluud-mark.svg` is a standalone export of this mark and
 * nothing on the site loads it.** It bakes the Estuary hexes, so it does not
 * follow the palette and it cannot. **This component is the mark**; that file
 * is a copy that will drift the moment either changes.
 */
/**
 * ⚠️ **`className` overrides the BOX, never the mark.** The three call sites in
 * the chrome take the 28px default; `/about`'s masthead draws it at 82 with a
 * `bg-card` ground, which is the only reason this prop exists. **The geometry,
 * the stroke and the three colours are not overridable and must not become
 * so** — see the rules above.
 */
export function FluudMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={
        className ??
        "flex size-7 shrink-0 items-center justify-center border border-border bg-background px-[5px]"
      }
    >
      <svg viewBox="0 0 16 12" className="w-full" fill="none">
        <rect y="0" width="16" height="2" fill="var(--wl-cyan)" />
        <path
          d="M0.8 6q1.8-2.667 3.6 0t3.6 0 3.6 0 3.6 0"
          stroke="var(--wl-select)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect y="10" width="16" height="2" fill="var(--border)" />
      </svg>
    </span>
  );
}
