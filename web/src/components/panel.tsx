import { cn } from "@/lib/utils";

/**
 * The frame every region of the page is drawn in.
 *
 * This exists so "the map and the list are equal frames" is a structural fact
 * rather than two sets of matching class strings that drift apart. Both get the
 * same border, the same chrome bar, the same corner radius — and, because the
 * header is a fixed height, their contents start on the same line.
 *
 * ## Why the header height is pinned
 *
 * `PanelHeader` is `h-11` and not `py-2`. The map frame's header holds a label
 * and a count; the list frame's holds a segmented control. Left to their
 * intrinsic heights those differ by about eight pixels, which is small enough
 * to look like a rendering artifact and large enough to see — the map and the
 * list would start at different heights and every row in the list would be off
 * by that much for the rest of the page. Pinning it costs nothing and makes the
 * alignment true by construction.
 *
 * Not a shadcn component, deliberately. `web/CLAUDE.md` pins the shadcn surface
 * at card / badge / alert / button, and this is a div with a border.
 */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The chrome bar. `shrink-0` because the panel is a flex column whose body is
 * `flex-1` — without it a tall body compresses the header instead of scrolling.
 */
export function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center gap-3 border-b border-border",
        "bg-[var(--wl-panel)] px-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Mono, small, wide-tracked — the label on an instrument, not a headline. Every
 * panel on the page is titled the same way so the eye can skip them.
 */
export function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "truncate font-mono text-[10px] leading-none tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

/** Right-hand side of a chrome bar: counts, controls, provenance. */
export function PanelTools({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("ml-auto flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

/**
 * A closing bar, same treatment as the header. The map's legend lives in one,
 * which is what puts the four keys on a rule aligned under the drawing instead
 * of loose beneath it.
 */
export function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // ⚠️ `pb-3.5` rather than a symmetric `py-2.5`. The map's footer is the
        // busiest one — a six or seven cell legend grid plus, with the sensor
        // layer on, a two-line sentence about what the drawing withholds — and
        // its last line sat 10px off the panel border, which reads as clipped
        // even though nothing overflows (measured: footer bottom 858, panel
        // bottom 859, no scroll). The extra 4px is cheap and it is the last
        // line of the legend that benefits.
        "shrink-0 border-t border-border bg-[var(--wl-panel)] px-3 pt-2.5 pb-3.5",
        className,
      )}
      {...props}
    />
  );
}
