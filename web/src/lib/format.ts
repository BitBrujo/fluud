/**
 * Number and time formatting. Two of these carry safety weight — read the
 * comments before "simplifying" either.
 */

/**
 * Parse a timestamp from the API.
 *
 * FastAPI returns `datetime.isoformat()`, and a naive datetime has **no
 * offset**. `Date.parse` on a bare `2026-08-04T14:32:00` is interpreted in the
 * viewer's LOCAL zone — which in NYC silently shifts every age by four or five
 * hours and renders a five-hour-old reading as current. Everything the poller
 * writes is UTC, so append the Z when the string doesn't say otherwise.
 *
 * Returns null rather than an Invalid Date, so callers have to handle it.
 */
export function parseServerTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim());
  const ms = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Seconds between `then` and `now` (ms epoch). Negative ⇒ `then` is ahead. */
export function ageSeconds(then: Date, nowMs: number): number {
  return (nowMs - then.getTime()) / 1000;
}

/**
 * The literal shown when a reading claims to be from the future.
 *
 * Not paranoia: FloodNet devices report dates decades ahead — `poll.py` bounds
 * on MAX_FUTURE for exactly this — and a clock-skewed *viewer* produces the
 * same symptom. Either way the honest answer is "these two clocks disagree",
 * not a negative age rendered as if it meant something.
 */
export const AHEAD_OF_BROWSER = "timestamp is ahead of this browser";

/** Anything up to a minute ahead is ordinary clock jitter, not skew. */
const FUTURE_TOLERANCE_S = 60;

export function formatAge(seconds: number): string {
  if (seconds < -FUTURE_TOLERANCE_S) return AHEAD_OF_BROWSER;

  const s = Math.max(0, seconds);
  if (s < 45) return `${Math.round(s)}s ago`;
  if (s < 3600) {
    const m = Math.min(59, Math.max(1, Math.round(s / 60)));
    return `${m}m ago`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m ago`;
  }
  return `${Math.floor(s / 86400)}d ago`;
}

/** Compact form for a chip: "12m old", no "ago". */
export function formatAgeShort(seconds: number): string {
  const full = formatAge(seconds);
  return full === AHEAD_OF_BROWSER ? full : full.replace(/ ago$/, " old");
}

/**
 * Depth, split so the unit can be styled separately from the digits.
 *
 * The boundary is `inches < 1`, matching `agent._depth_phrase` and the page
 * this replaces: below an inch the millimetre reading is the informative one,
 * above it inches are what people picture. 25.3mm / 25.4 = 0.996 → still mm.
 * That boundary is the one a rewrite gets wrong.
 *
 * null in, null out. A camera with no co-located sensor has no depth, and an
 * absent depth is never rendered as 0.
 */
export function formatDepth(
  mm: number | null | undefined,
): { value: string; unit: string } | null {
  if (mm === null || mm === undefined) return null;
  const inches = mm / 25.4;
  return inches < 1
    ? { value: String(Math.round(mm)), unit: "mm" }
    : { value: inches.toFixed(1), unit: "in" };
}

/** One-line form, for prose. */
export function depthText(mm: number | null | undefined): string {
  const d = formatDepth(mm);
  return d ? `${d.value} ${d.unit}` : "unknown";
}

/**
 * Cache-buster keyed on the reading, never on the clock.
 *
 * `Date.now()` here re-downloads every still on every render — which, with a
 * one-second age ticker on the page, means every camera refetches once a
 * second. The frame only changes when the poller collects a new one, so
 * `observed_at` is the correct key.
 */
export function frameUrl(imageUrl: string, observedAt: string): string {
  const sep = imageUrl.includes("?") ? "&" : "?";
  return `${imageUrl}${sep}t=${encodeURIComponent(observedAt)}`;
}

/** HH:MM in the viewer's zone — for "when was this warning spoken". */
export function clockTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
