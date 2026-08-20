"use client";

import { useEffect, useState } from "react";

import { ApiError } from "../api";
import { startVisibleInterval } from "./visible-interval";

export interface Polled<T> {
  /** The last value that arrived. **Kept across failures** — see below. */
  data: T | null;
  /** The current failure, or null. Non-null with non-null `data` is normal. */
  error: ApiError | null;
  /** ms epoch of the last success, or null if there has never been one. */
  lastSuccessAt: number | null;
  /** False only before the first attempt settles — "loading" vs "broken". */
  settled: boolean;
}

/**
 * Poll an endpoint, and **never throw the last good answer away**.
 *
 * The page this replaces did `catch { return; }`, so a dead API left the last
 * render on screen with no indication anything was wrong — under a hard-coded
 * LIVE badge. Keeping `data` is right: blanking the cards reads as "no
 * flooding", which is a lie the moment nobody can see. Losing the error is
 * not. Callers get both, and are expected to say so.
 *
 * `fetcher` must be a stable reference — pass a module-level function, not an
 * inline closure, or this resubscribes on every render.
 */
export function usePolled<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
): Polled<T> {
  const [state, setState] = useState<Polled<T>>({
    data: null,
    error: null,
    lastSuccessAt: null,
    settled: false,
  });

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const data = await fetcher();
        if (!mounted) return;
        setState({ data, error: null, lastSuccessAt: Date.now(), settled: true });
      } catch (e) {
        if (!mounted) return;
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(e instanceof Error ? e.message : String(e), 0);
        setState((prev) => ({ ...prev, error, settled: true }));
      }
    };

    void run();
    // Skips the fetch while the tab is hidden and fetches on return — a phone
    // in a pocket polls nothing, and a reader coming back gets a fresh answer
    // rather than looking at old water for another interval. See the file.
    const stop = startVisibleInterval(() => void run(), intervalMs);

    return () => {
      mounted = false;
      stop();
    };
  }, [fetcher, intervalMs]);

  return state;
}
