"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A shared clock.
 *
 * Reading age has to tick or it isn't a warning, it's a decoration. But a
 * `setInterval` in the page re-renders the whole camera grid once a second,
 * and one per component gives N intervals drifting against each other. So:
 * one interval per distinct period, shared by every subscriber, consumed only
 * in leaf components. Cards themselves never re-render on a 1s tick.
 *
 * `useSyncExternalStore` rather than `useState` + effect, because that is
 * exactly what this is — an external source of truth React subscribes to.
 * The consequence is that the snapshot has to be **stable between ticks**:
 * returning a live `Date.now()` from `getSnapshot` compares unequal on every
 * read and spins forever. The ticker therefore caches the timestamp and only
 * moves it when it fires.
 */
type Ticker = {
  now: number;
  handle: ReturnType<typeof setInterval> | null;
  subscribers: Set<() => void>;
};

const tickers = new Map<number, Ticker>();

function tickerFor(intervalMs: number): Ticker {
  let ticker = tickers.get(intervalMs);
  if (!ticker) {
    ticker = { now: Date.now(), handle: null, subscribers: new Set() };
    tickers.set(intervalMs, ticker);
  }
  return ticker;
}

function subscribe(intervalMs: number, notify: () => void): () => void {
  const ticker = tickerFor(intervalMs);
  ticker.subscribers.add(notify);

  if (ticker.handle === null) {
    // Resync on (re)start: the cached value may be from before the last
    // unsubscribe, or from when the bundle was prerendered.
    ticker.now = Date.now();
    ticker.handle = setInterval(() => {
      ticker.now = Date.now();
      for (const fn of ticker.subscribers) fn();
    }, intervalMs);
  }

  return () => {
    ticker.subscribers.delete(notify);
    if (ticker.subscribers.size === 0 && ticker.handle !== null) {
      clearInterval(ticker.handle);
      ticker.handle = null;
    }
  };
}

/**
 * Zero during prerender and hydration. Nothing that consumes this hook renders
 * before its data has arrived over the network — which cannot happen until
 * after mount — so the placeholder is never seen. It is deliberately absurd
 * rather than plausible: a wrong-but-believable clock is how a stale reading
 * gets rendered as current.
 */
const PRERENDER_SNAPSHOT = 0;

export function useNow(intervalMs = 1000): number {
  // BOTH CALLBACKS MUST BE MEMOISED, and this is not a micro-optimisation.
  //
  // `useSyncExternalStore` re-subscribes whenever the subscribe function's
  // identity changes. With inline arrows that is *every render*, so a lone
  // subscriber tears its own interval down and rebuilds it on each pass —
  // and the rebuild resyncs `ticker.now`, which changes the snapshot, which
  // renders again. That is an infinite loop, and it hides: while the churn
  // stays inside a single millisecond the resynced value is identical and the
  // cycle terminates by luck. It only blows up once a render takes longer
  // than 1ms, which is to say, on someone else's slower machine.
  const subscribeToTicker = useCallback(
    (notify: () => void) => subscribe(intervalMs, notify),
    [intervalMs],
  );
  const getSnapshot = useCallback(() => tickerFor(intervalMs).now, [intervalMs]);

  return useSyncExternalStore(
    subscribeToTicker,
    getSnapshot,
    () => PRERENDER_SNAPSHOT,
  );
}
