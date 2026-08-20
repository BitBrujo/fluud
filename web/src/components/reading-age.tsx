"use client";

import { ageSeconds, AHEAD_OF_BROWSER, formatAge, parseServerTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { freshnessOf, type Freshness } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * How old this reading is, ticking.
 *
 * This is a **leaf** on purpose. The 1s clock lives here and nowhere above,
 * so a card — and the still inside it — never re-renders on a tick. (`useNow`
 * shares one interval across every subscriber, so N of these cost one timer.)
 *
 * ⚠️ **One instance per surface, and never one per row of a long list.** The 1s
 * subscription is cheap precisely because there are a couple of dozen of them.
 * The 425-row sensor list takes its own 15s tick and formats the age directly
 * (`sensor-row.tsx`) — mounting this there would be 425 leaf re-renders every
 * second for data that changes once a minute.
 */
export function ReadingAge({
  observedAt,
  freshness = freshnessOf,
  className,
}: {
  observedAt: string;
  /**
   * How to judge the age. Defaults to the **camera** thresholds.
   *
   * ⚠️ This prop exists because `observed_at` does not mean the same thing on
   * every instrument. A camera's is stamped by *our poller*, so its age
   * measures whether our loop is running (the frozen-poller rule). A sensor's is
   * FloodNet's own publication clock and a gauge's is the operator's — both
   * keep ticking whether or not we are healthy, and both run far behind by
   * design. Judging one against another's thresholds is what rendered three
   * perfectly healthy gauges permanently amber; see `lib/staleness.ts`.
   */
  freshness?: (ageSeconds: number) => Freshness;
  className?: string;
}) {
  const now = useNow(1000);
  const at = parseServerTime(observedAt);

  if (!at) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        reading time unreadable
      </span>
    );
  }

  const age = ageSeconds(at, now);
  const text = formatAge(age);
  const ahead = text === AHEAD_OF_BROWSER;
  const state = ahead ? "fresh" : freshness(age);

  return (
    <span
      className={cn(
        "num text-[11px]",
        state === "fresh" && !ahead && "text-muted-foreground",
        state === "stale" && "text-[var(--wl-stale)]",
        state === "dead" && "text-[var(--wl-dead)]",
        ahead && "text-[var(--wl-stale)]",
        className,
      )}
      title={at.toISOString()}
    >
      {text}
    </span>
  );
}
