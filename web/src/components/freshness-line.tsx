"use client";

import type { CameraStatus } from "@/lib/api-types";
import { ageSeconds, formatAge, parseServerTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { STALE_AFTER_S } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * How old the freshest thing on this page is.
 *
 * ⚠️ **It moved out of the masthead and into the top of the instrument list**
 * (`station-list.tsx`), on the owner's instruction. It is still above every
 * reading on the page and it is now directly on top of the instruments whose
 * ages it summarises; what it lost is sitting beside `ModeBadge`, which put "how
 * old is this" next to "what am I looking at" in one glance. It is left-aligned
 * now rather than ragged-right, because it is a strip and not a rail.
 *
 * **This is the invariant-12 signal that actually works.** `/healthz` reports
 * `polling` from `_poller.is_alive()`, and a thread the host has stopped
 * scheduling is
 * alive — it is simply never scheduled. So the banner can miss the exact
 * failure it was written for. This line cannot: it measures the data, and data
 * that has stopped arriving looks the same no matter why.
 *
 * ⚠️ **The dot is never green.** A green dot beside a live-looking number, on a
 * flood page, is read as "conditions are fine" no matter what the words next to
 * it say — and this line is a statement about the feed, not about the street
 * (the never-safe rule). Muted when the data is current, amber when it is not.
 */
export function FreshnessLine({ cameras }: { cameras: CameraStatus[] }) {
  const now = useNow(1000);
  if (cameras.length === 0) return null;

  const ages = cameras
    .map((c) => parseServerTime(c.observed_at))
    .filter((d): d is Date => d !== null)
    .map((d) => ageSeconds(d, now));

  // A timestamp from the future is not the newest reading — it is a clock
  // disagreement, and it would otherwise win `Math.min` outright and hide the
  // real age of everything else behind it. Each card says so for itself.
  const usable = ages.filter((age) => age >= 0);

  if (usable.length === 0) {
    if (ages.length === 0) return null;
    return (
      <Rail tone="stale">
        no camera reports a usable reading time — every timestamp is ahead of
        this browser
      </Rail>
    );
  }

  const newest = Math.min(...usable);
  const stale = newest >= STALE_AFTER_S;

  return (
    <Rail tone={stale ? "stale" : "normal"}>
      newest reading <span className="num">{formatAge(newest)}</span>
      {stale && " — the poller has stopped collecting"}
    </Rail>
  );
}

function Rail({
  tone,
  children,
}: {
  tone: "normal" | "stale";
  children: React.ReactNode;
}) {
  const stale = tone === "stale";
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs",
        stale ? "text-[var(--wl-stale)]" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          stale ? "bg-[var(--wl-stale)]" : "bg-muted-foreground",
        )}
      />
      <span>{children}</span>
    </p>
  );
}
