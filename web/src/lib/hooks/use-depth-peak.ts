"use client";

import { useEffect, useState } from "react";

import { ApiError, getDepthPeak } from "../api";
import type { DepthPeak } from "../api-types";
import { startVisibleInterval } from "./visible-interval";

/**
 * The peak depth for one instrument over one window.
 *
 * ⚠️ **Deliberately not `usePolled`, for `use-history.ts`'s reason** — that hook
 * takes its fetcher as a dependency and requires a stable module-level
 * reference, and a per-instrument-per-window fetcher is a fresh closure every
 * render. The dependency is the key, so the effect is keyed on the key.
 *
 * ⚠️ **The window is part of the key, and that is the whole correctness
 * argument.** `use-history.ts` carries the camera id in its state so there is
 * never a frame in which the previous camera's trace is drawn under the new
 * camera's name. The same failure here is worse, because the two numbers are
 * indistinguishable: a peak fetched for `last day` still rendering while the
 * label already says `last 10 min` is a 200 mm figure captioned as the last ten
 * minutes, in 26px type, on a flood page. So the key is
 * `kind:id:minutes` and a mismatched answer never reaches the caller.
 */
export interface DepthPeakState {
  peak: DepthPeak | null;
  /** True until the first answer for *this* key arrives. */
  loading: boolean;
  /**
   * A real failure. Unlike `useHistory` a 404 IS one here: this route 404s only
   * on an unknown instrument, never on an empty window — an empty window is a
   * 200 with `peak_mm: null`, which is an answer and not an error. A 404
   * therefore means the page asked about something that does not exist, which
   * is worth surfacing rather than rendering as "no water".
   */
  error: ApiError | null;
}

interface Fetched {
  key: string | null;
  peak: DepthPeak | null;
  error: ApiError | null;
}

const NOTHING: DepthPeakState = { peak: null, loading: false, error: null };
const LOADING: DepthPeakState = { peak: null, loading: true, error: null };

/**
 * Slower than the 15s status poll, same as the trace beside it.
 *
 * A peak over a window only moves when a new reading beats it, and the widest
 * windows barely move at all — polling this at 15s would spend three requests
 * to learn nothing for every one that learns something.
 */
const REFRESH_MS = 60_000;

export function useDepthPeak(
  kind: "camera" | "sensor" | null,
  instrumentId: string | null,
  /** `null` is the current reading — no window, and no request at all. */
  minutes: number | null,
): DepthPeakState {
  const [fetched, setFetched] = useState<Fetched>({
    key: null,
    peak: null,
    error: null,
  });

  const key =
    kind && instrumentId && minutes != null
      ? `${kind}:${instrumentId}:${minutes}`
      : null;

  useEffect(() => {
    if (!kind || !instrumentId || minutes == null) return;

    const controller = new AbortController();
    let live = true;
    const forKey = `${kind}:${instrumentId}:${minutes}`;

    const run = async () => {
      try {
        const data = await getDepthPeak(
          kind,
          instrumentId,
          minutes,
          controller.signal,
        );
        if (!live) return;
        setFetched({ key: forKey, peak: data, error: null });
      } catch (e) {
        if (!live || controller.signal.aborted) return;
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(e instanceof Error ? e.message : String(e), 0);
        setFetched({ key: forKey, peak: null, error });
      }
    };

    void run();
    const stop = startVisibleInterval(() => void run(), REFRESH_MS);

    return () => {
      live = false;
      stop();
      // Selection and the picked window both change faster than the network
      // answers. Without this, stepping the pager or tapping through the
      // presets leaves several requests in flight and the last to land wins,
      // which is not the one the reader asked for.
      controller.abort();
    };
  }, [kind, instrumentId, minutes]);

  if (!key) return NOTHING;
  if (fetched.key !== key) return LOADING;
  return { peak: fetched.peak, loading: false, error: fetched.error };
}
