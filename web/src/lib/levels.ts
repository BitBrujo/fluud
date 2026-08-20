/**
 * Public alert level, tracking `models.Level` 1:1.
 *
 * Same contract as severity.ts: exhaustive `Record<Level, …>` only, so a new
 * level cannot ship without someone deciding what colour it is.
 */

export const LEVELS = ["clear", "watch", "warning", "emergency"] as const;

export type Level = (typeof LEVELS)[number];

export function isLevel(value: unknown): value is Level {
  return (
    typeof value === "string" && (LEVELS as readonly string[]).includes(value)
  );
}

export const LEVEL_RANK: Record<Level, number> = {
  clear: 0,
  watch: 1,
  warning: 2,
  emergency: 3,
};

/**
 * The warning card's left edge — the same ramp the old `data-rat-mood` CSS
 * drove, and the strongest level signal on the page: a 3px rule is legible from
 * across a room in a way a 164px animal is not.
 *
 * ⚠️ **`clear` is a NEUTRAL border, not the green `--wl-clear`, and that is
 * the never-safe rule.** This is the one difference from the ramp the deleted rat
 * monitor rendered, and it is the whole reason the ramp could come back at all.
 * That panel sat in the middle of the page and a green edge on it was
 * defensible; this card sits in the masthead beside a live-looking freshness
 * signal and the wordmark, which is the corner where a reassuring colour reads
 * as "conditions are fine" no matter what the words say. `clear` means no
 * instrument has reported water, and the ramp starts at *watch*.
 *
 * Nothing else on the ramp has that problem: amber, orange and red are warning
 * colours and nobody mistakes one for reassurance. So the fix was never to drop
 * the ramp — it was to drop its rest state.
 *
 * ⚠️ **This replaced `LEVEL_ACCENT`, which is gone rather than kept unused.** It
 * differed only in having a green `clear`, which makes it precisely the token
 * somebody reaches for by mistake. One ramp, one rest state.
 */
export const LEVEL_EDGE: Record<Level, string> = {
  clear: "border-l-border",
  watch: "border-l-[var(--wl-watch)]",
  warning: "border-l-[var(--wl-warning)]",
  emergency: "border-l-[var(--wl-emergency)]",
};

/**
 * The warning card's ground, walking the same ramp as its edge above.
 *
 * ⚠️ **`clear` is `bg-card`, not a green tint, and that is the never-safe rule.** Every
 * other level tints toward its accent, and doing the same at `clear` would put
 * a reassuring green wash across the card carrying the warning — which is this
 * system saying "it's fine out there", the one thing it must never say. `clear`
 * means no instrument has reported water. It gets the same neutral ground as
 * every other card, and the edge carries the level on its own.
 *
 * This rest state was always neutral. `LEVEL_EDGE`'s only became so when the
 * ramp moved into the masthead — see the note there.
 *
 * The three tints are the same values as `LEVEL_ALERT_BLOCK`, deliberately: an
 * open alert and a live warning at the same level are the same event seen from
 * two places, and giving them two palettes would imply they weren't.
 */
export const LEVEL_PANEL_BG: Record<Level, string> = {
  clear: "bg-card",
  watch: "bg-[#1a1710]",
  warning: "bg-[#1a1410]",
  emergency: "bg-[#1a1013]",
};

/**
 * The ramp as **ink**, for a line of text that is itself the level — the
 * landing page's "N open alerts" headline is the only caller today.
 *
 * ⚠️ **`clear` is neutral here for the same reason it is neutral in
 * `LEVEL_EDGE`, and this record exists partly so that rule survives the next
 * call site.** The obvious implementation of "colour the headline by level" is
 * an inline map, and an inline map is where somebody writes
 * `clear: "text-[var(--wl-clear)]"` without ever having read the never-safe rule. There
 * is one ramp in this file and one rest state; a fifth caller gets it for free.
 *
 * Note this is ink on the page's own ground, not on a tinted block — so unlike
 * `LEVEL_PANEL_BG` there is no companion background, and callers must not add
 * one. A tinted headline plus tinted ground is the ramp shouting twice.
 */
export const LEVEL_TEXT: Record<Level, string> = {
  clear: "text-foreground",
  watch: "text-[var(--wl-watch)]",
  warning: "text-[var(--wl-warning)]",
  emergency: "text-[var(--wl-emergency)]",
};

/**
 * The rat still for each level — four baked images, ~8KB each.
 *
 * They walk the same ramp as LEVEL_EDGE, and the rat's character diminishes
 * as it rises: the key light dies into a stark rim, the animal turns from
 * settled-with-its-back-to-you into a running silhouette, and it closes on the
 * frame as the water does. That is the shrinking-character rule enforced a second time, in the
 * image — and because it is baked into pixels by `scripts/rat-bake.py`, it
 * cannot be softened from here the way copy could be.
 *
 * The images are decoration and are rendered `aria-hidden`: the templated text
 * is the only channel that carries a warning (the templated-copy rule).
 */
export const LEVEL_RAT: Record<Level, string> = {
  clear: "/rat/rat-clear.webp",
  watch: "/rat/rat-watch.webp",
  warning: "/rat/rat-warning.webp",
  emergency: "/rat/rat-emergency.webp",
};

/**
 * The rat *loop* for each level — the same cycle each still above was cut from,
 * baked as an animated WebP by the same script and the same RAMP.
 *
 * This is a third enforcement of the shrinking-character rule, not a decoration on the second.
 * The stills carry the ramp in light, pose and size; a loop adds the one
 * mechanic a still cannot hold, which is **tempo**. `clear` breathes through a
 * settled idle at 12fps — an animal that has not decided to leave. `emergency`
 * gallops at 30 with no face. The pacing is baked into the file's own frame
 * durations rather than driven by a CSS animation, for the same reason the
 * lighting is baked: a number in a stylesheet is editable, and this one is not.
 *
 * ⚠️ **These do not replace `LEVEL_RAT`, and must never be made to.** The panel
 * renders the still stack underneath and holds only the active loop over it, so
 * an escalation still never shows an empty box, and a reader with
 * `prefers-reduced-motion` gets the still and downloads no loop at all. Both
 * properties come from having both sets.
 *
 * Decoration, `aria-hidden`, same as the stills: the templated text remains the
 * only channel that carries a warning (the templated-copy rule).
 */
export const LEVEL_RAT_LOOP: Record<Level, string> = {
  clear: "/rat/rat-clear-loop.webp",
  watch: "/rat/rat-watch-loop.webp",
  warning: "/rat/rat-warning-loop.webp",
  emergency: "/rat/rat-emergency-loop.webp",
};

/**
 * The open-alert block. Same ramp as the panel; a tinted ground so an alert
 * reads as an interruption rather than as one more card.
 */
export const LEVEL_ALERT_BLOCK: Record<Level, string> = {
  clear: "border-l-[var(--wl-clear)] bg-[#101a16]",
  watch: "border-l-[var(--wl-watch)] bg-[#1a1710]",
  warning: "border-l-[var(--wl-warning)] bg-[#1a1410]",
  emergency: "border-l-[var(--wl-emergency)] bg-[#1a1013]",
};

/** Levels the drill endpoint offers. `clear` stands the panel back down. */
export const DRILL_LEVELS: readonly Level[] = [
  "watch",
  "warning",
  "emergency",
  "clear",
];
