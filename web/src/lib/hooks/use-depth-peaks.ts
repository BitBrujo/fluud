"use client";

import { useEffect, useState } from "react";

import { ApiError, getDepthPeaks } from "../api";
import type { DepthPeakEntry } from "../api-types";
import { startVisibleInterval } from "./visible-interval";

/**
 * Every instrument of one kind, peaked over one window — the instrument list's
 * depths when the reader picks a timeframe.
 *
 * `use-depth-peak.ts`'s sibling, and it follows every rule that hook records.
 * What is different is only the fan-out, and that difference is the reason this
 * exists rather than 425 copies of the other one.
 *
 * ⚠️ **Deliberately not `usePolled`**, for `use-history.ts`'s reason: that hook
 * takes its fetcher as a dependency and needs a stable module-level reference,
 * and a per-kind-per-window fetcher is a fresh closure every render. The
 * dependency is the key, so the effect is keyed on the key.
 *
 * ⚠️ **The window and the kind are BOTH in the key, and that is the whole
 * correctness argument.** A map fetched for `last day` still rendering while
 * the list's label already says `last 10 min` puts a 200 mm figure under a
 * ten-minute caption — across every row at once, which is worse than the single
 * readout's version of the same failure and just as invisible. A mismatched
 * answer never reaches the caller: the state carries the key it belongs to and
 * the answer is derived during render, never synced in an effect.
 *
 * ⚠️ **No request at all while `minutes` is null.** Null is the current
 * reading, which `/api/status` and `/api/sensors` already carry — the same
 * gating instinct as `use-sensors.ts`, which does not fetch before the surface
 * that needs it is first opened.
 */
export interface DepthPeaksState {
  /**
   * Instrument id → its peak. **A missing id is the empty window**, not an
   * error and not a zero: the route returns only instruments that reported
   * inside the window. Callers render an em-dash for a miss, exactly as they
   * already do for a null depth.
   */
  byId: Map<string, DepthPeakEntry>;
  /**
   * The window the map in `byId` was actually taken over, after the server
   * clamped it to retention — or null while nothing is picked. ⚠️ **Label the
   * rows with THIS, never with what was requested.** A seven-day peak captioned
   * `last year` is the one way this feature can understate a flood.
   */
  minutes: number | null;
  /** True until the first answer for *this* key arrives. */
  loading: boolean;
  error: ApiError | null;
}

interface Fetched {
  key: string | null;
  byId: Map<string, DepthPeakEntry>;
  minutes: number | null;
  error: ApiError | null;
}

const EMPTY = new Map<string, DepthPeakEntry>();
const NOTHING: DepthPeaksState = {
  byId: EMPTY,
  minutes: null,
  loading: false,
  error: null,
};

/**
 * Slower than the 15s status poll, and the same 60s the single peak and the
 * gauge traces use.
 *
 * A peak over a window only moves when a new reading beats it, and the widest
 * windows barely move at all. At 15s this would spend three requests to learn
 * nothing for every one that learned something — and unlike the single readout,
 * each of these requests groups the whole reading table.
 */
const REFRESH_MS = 60_000;

export function useDepthPeaks(
  kind: "camera" | "sensor",
  /** `null` is the current reading — no window, and no request at all. */
  minutes: number | null,
): DepthPeaksState {
  const [fetched, setFetched] = useState<Fetched>({
    key: null,
    byId: EMPTY,
    minutes: null,
    error: null,
  });

  const key = minutes == null ? null : `${kind}:${minutes}`;

  useEffect(() => {
    if (minutes == null) return;

    const controller = new AbortController();
    let live = true;
    const forKey = `${kind}:${minutes}`;

    const run = async () => {
      try {
        const data = await getDepthPeaks(kind, minutes, controller.signal);
        if (!live) return;
        setFetched({
          key: forKey,
          byId: new Map(data.peaks.map((p) => [p.instrument_id, p])),
          // The window the SERVER used, which is what the rows are labelled
          // with. It differs from `minutes` whenever retention clamped it.
          minutes: data.minutes,
          error: null,
        });
      } catch (e) {
        if (!live || controller.signal.aborted) return;
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(e instanceof Error ? e.message : String(e), 0);
        setFetched({ key: forKey, byId: EMPTY, minutes: null, error });
      }
    };

    void run();
    const stop = startVisibleInterval(() => void run(), REFRESH_MS);

    return () => {
      live = false;
      stop();
      // The tab and the picked window both change faster than the network
      // answers. Without this, tapping through the presets leaves several
      // requests in flight and the last to land wins, which is not the one the
      // reader asked for.
      controller.abort();
    };
  }, [kind, minutes]);

  if (!key) return NOTHING;
  if (fetched.key !== key) {
    // ⚠️ **An empty map while loading, never the previous window's map.** The
    // rows would otherwise keep rendering `last day` peaks under a `last 10
    // min` label for as long as the request takes — the exact failure the key
    // exists to prevent, wearing the appearance of a fast UI.
    return { byId: EMPTY, minutes: null, loading: true, error: null };
  }
  return {
    byId: fetched.byId,
    minutes: fetched.minutes,
    loading: false,
    error: fetched.error,
  };
}
