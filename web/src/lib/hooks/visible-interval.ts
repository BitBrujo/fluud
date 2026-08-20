"use client";

/**
 * Poll on an interval, but only while somebody is actually looking.
 *
 * ### Why this exists
 *
 * Six hooks in this directory had the same six lines: a `setInterval`, a
 * `visibilitychange` listener that refetched on return, and a cleanup removing
 * both. All six kept ticking while the tab was hidden. A phone in a pocket with
 * this page open ran `/api/status` every 15 seconds all night — about 8,600
 * requests nobody would ever see, each one a fresh Postgres connection at the
 * other end.
 *
 * That was survivable while the database was awake anyway. Since 2026-08-20 it
 * is not: the poller moved to a schedule specifically so Neon could suspend
 * between runs, and one forgotten tab would have held it open indefinitely and
 * undone the whole change.
 *
 * ### What it does, and the part that is not obvious
 *
 * ⚠️ **The interval is left RUNNING while hidden; what is skipped is the
 * fetch.** Clearing and rebuilding the timer around visibility would resync its
 * phase on every return, so a reader flipping between tabs could drive requests
 * far faster than `intervalMs` — the resync failure `use-now.ts` already records
 * for a different timer. A cheap `document.hidden` test at the top of each tick
 * costs nothing and cannot drift.
 *
 * ⚠️ **Becoming visible fetches IMMEDIATELY**, rather than waiting for the next
 * tick. This is not new behaviour and it is not an optimisation: coming back to
 * a page after ten minutes in a pocket must not mean looking at ten-minute-old
 * water for another minute first. It is also what makes skipping the hidden
 * ticks safe — the first thing a returning reader gets is a fresh answer.
 *
 * ⚠️ **`document.hidden`, not `visibilityState === "hidden"`** on the tick, and
 * the reverse on the listener — they are the same fact, and each is spelled the
 * way that reads as the question being asked at that point.
 *
 * The caller still owns the first fetch. This deliberately does not run `run()`
 * on entry: every caller does it before starting the interval, and some of them
 * (`use-depth-peak`) have a case where the first fetch must not happen at all.
 *
 * @returns the cleanup. Callers must call it from their effect's teardown, or
 *   StrictMode's double mount leaves a second interval behind.
 */
export function startVisibleInterval(
  run: () => void,
  intervalMs: number,
): () => void {
  const tick = () => {
    if (document.hidden) return;
    run();
  };
  const handle = setInterval(tick, intervalMs);

  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearInterval(handle);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
