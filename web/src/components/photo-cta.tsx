/**
 * A full-bleed photograph with one line of type and one button over it.
 *
 * ⚠️ **Two pages mount this — `/` and `/about` — and it is shared rather than
 * copied for the reason `flip-card.tsx` and `step-button.tsx` are shared.** What
 * travels with it is not layout: it is the scrim, without which the type on the
 * bright half of a photograph is unreadable, and the decoration rules below.
 *
 * ⚠️ **The photograph is DECORATION.** Empty `alt`, `aria-hidden`, no `title`.
 * Describing it invents copy nobody reviewed — the rule the alert rat's images
 * are under, and it generalises past the rat.
 *
 * ⚠️ **It may never carry a reading, a mark, a scale or an overlay.** A
 * photograph of water with anything drawn on it reads as a measurement of that
 * water. The line of type over it is prose and stays prose.
 *
 * ⚠️ **The scrim is two `color-mix` gradients over `--background`, not two
 * hard-coded hexes.** The design drew `rgba(6,9,14,…)`, which is estuary's
 * background frozen into a literal — under `[data-palette="sodium"]` a frozen
 * scrim is a blue-black band over a warm-black page. `globals.css` carries three
 * palettes and this component has to survive all of them.
 */
export function PhotoCta({
  photo,
  headline,
  height = "h-[420px] sm:h-[520px]",
  scale = "scale-100",
  position,
  children,
}: {
  /** A file in `/photoz/`. Decoration: empty `alt`, `aria-hidden`. */
  photo: string;
  /** One line of prose. No reading, no count, no claim about conditions. */
  headline: string;
  /** The band's height, per caller. `/` runs taller than `/about`. */
  height?: string;
  /**
   * How far into the frame to push the photograph. Crop, never content.
   *
   * ⚠️ **The default is `scale-100`, and for TWO of the seven photographs that
   * default is WRONG — they have a white print border baked into the file.**
   * Measured over `public/photoz/*.webp`:
   *
   * | file | side | top/bottom | minimum scale |
   * |---|---:|---:|---:|
   * | `night_01_elevated_tracks` | 13.8% | 3.7% | **1.38** |
   * | `night_14_rooftop_tanks` | 12.2% | 3.4% | **1.32** |
   *
   * The other five measure zero on all four edges and want no scale at all.
   * **So a `scale` here is not a taste knob — on those two it is the thing
   * holding a white frame off the page**, and dropping it renders bars down
   * both edges of the band. That is exactly what happened on 2026-08-16 when the
   * default was lowered from `scale-[1.35]`.
   *
   * ⚠️ **Raising it costs crop, and the subject is what it costs.** These are
   * ~1.79:1 photographs in a band nearer 3:1, so `object-cover` already
   * discards most of their height before this multiplies it. **Pair any scale
   * with a `position`** — that is free — and check the subject is still in
   * frame at 390, at ~824 (where the band flips from cropping horizontally to
   * cropping vertically) and at 1440.
   */
  scale?: string;
  /** `object-position`, when the subject is not centred. */
  position?: string;
  /** The button. `/` passes the session-aware CTA; `/about` a plain link. */
  children: React.ReactNode;
}) {
  return (
    <section
      className={`relative overflow-hidden border-t border-[var(--wl-rule)] ${height}`}
    >
      <img
        src={`/photoz/${photo}`}
        alt=""
        aria-hidden
        width={2200}
        height={1228}
        loading="lazy"
        decoding="async"
        className={`h-full w-full origin-center object-cover ${scale}`}
        style={position ? { objectPosition: position } : undefined}
      />

      {/* Left-weighted, because the type sits left. The right edge keeps enough
          of the photograph to still read as a photograph. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg," +
            "color-mix(in srgb, var(--background) 95%, transparent) 0%," +
            "color-mix(in srgb, var(--background) 70%, transparent) 48%," +
            "color-mix(in srgb, var(--background) 20%, transparent) 100%)",
        }}
      />

      <div className="absolute inset-0 flex items-center px-6 sm:px-12 lg:px-20">
        <div className="flex flex-col gap-6">
          <p className="max-w-[22ch] text-[28px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-[38px]">
            {headline}
          </p>
          {children}
        </div>
      </div>
    </section>
  );
}
