"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * LIVE / REPLAY / UNKNOWN — provenance, not decoration.
 *
 * It is the honest answer to "it probably won't be flooding during your demo."
 * Observations and alerts are partitioned by mode in the database so a replay
 * can never contaminate live history, and this badge is how a viewer knows
 * which they are looking at.
 *
 * **It starts at UNKNOWN.** The page this replaces hard-coded `LIVE` into the
 * markup and only corrected it once `/api/status` resolved — and swallowed
 * fetch failures — so a dead API left it reading LIVE forever. "Never fake
 * LIVE" cannot be enforced by a default that is itself a claim. Until the
 * service answers, we do not know what we are showing, and the badge says so.
 *
 * ⚠️ **It is bigger than it was, and it stays OUTLINED — never filled.** The
 * size is deliberate: it sits alone in the masthead's top-right corner and it is
 * the first thing that answers "am I looking at real data". But `--wl-live` is
 * `#22c55e`, and a *filled* green slab that size, at the top of a flood page,
 * reads as "everything is fine" from across a room — which is the never-safe rule
 * arriving as a design flourish, and it is exactly why the freshness dot in this
 * same corner is muted-never-green. A green rule and green letters say
 * "provenance"; a green block says "all clear". Do not give this a background.
 */
export function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) {
    return (
      <Badge
        variant="outline"
        className="rounded-md border-muted-foreground px-2.5 py-1 font-mono text-[13px] font-semibold tracking-[0.12em] text-muted-foreground"
      >
        UNKNOWN
      </Badge>
    );
  }

  const replay = mode !== "LIVE";
  const label = replay
    ? `REPLAY ${mode.replace("REPLAY", "").trim()}`.trim()
    : "LIVE";

  return (
    <Badge
      variant="outline"
      className={cn(
        // `bg-transparent` is load-bearing, not a reset. See the docblock.
        "rounded-md bg-transparent px-2.5 py-1 font-mono text-[13px] font-semibold tracking-[0.12em]",
        replay
          ? "border-[var(--wl-replay)] text-[var(--wl-replay)]"
          : "border-[var(--wl-live)] text-[var(--wl-live)]",
      )}
    >
      {label}
    </Badge>
  );
}
