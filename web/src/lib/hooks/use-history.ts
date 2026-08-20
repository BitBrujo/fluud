"use client";

import { useEffect, useState } from "react";

import { ApiError, getHistory } from "../api";
import type { HistoryPoint } from "../api-types";
import { startVisibleInterval } from "./visible-interval";

/**
 * Depth history for the currently selected camera.
 *
 * ⚠️ **This is deliberately not `usePolled`.** That hook takes the fetcher as a
 * dependency and documents that it must be a stable module-level reference; a
 * per-camera fetcher is a fresh closure on every render, so it would tear down
 * and rebuild its interval on every pass and refetch forever. The fix is not to
 * memoise around it — it is to key the effect on the camera id, which is the
 * actual dependency, and that is small enough to write directly.
 */
export interface History {
  points: HistoryPoint[];
  /** True until the first answer for *this* camera arrives. */
  loading: boolean;
  /**
   * A real failure. A 404 is **not** one — `/api/history` 404s when a camera
   * has no observations at all, which is a legitimate answer meaning "nothing
   * recorded here", so it lands as an empty `points` instead.
   */
  error: ApiError | null;
}

/**
 * What we have, and **which camera it is about**.
 *
 * Carrying the id in the state is what lets the answer be derived during
 * render instead of reset by an effect. Two things fall out of that, and the
 * second is the reason for it:
 *
 * - No cascading render, so no `setState`-in-an-effect.
 * - **No frame in which the previous camera's trace is drawn under the new
 *   camera's name.** An effect-based reset always renders once with the old
 *   data before it runs; here, state for a camera that is no longer selected
 *   simply never reaches the caller. In a tool about depth at a location,
 *   showing one location's numbers labelled with another's is the exact class
 *   of error the rest of this UI is built to avoid.
 */
interface Fetched {
  for: string | null;
  points: HistoryPoint[];
  error: ApiError | null;
}

const NOTHING: History = { points: [], loading: false, error: null };
const LOADING: History = { points: [], loading: true, error: null };

/** Slower than the 15s status poll: the tail only moves once a minute anyway. */
const REFRESH_MS = 60_000;

export function useHistory(cameraId: string | null): History {
  const [fetched, setFetched] = useState<Fetched>({
    for: null,
    points: [],
    error: null,
  });

  useEffect(() => {
    if (!cameraId) return;

    const controller = new AbortController();
    let live = true;

    const run = async () => {
      try {
        const data = await getHistory(cameraId, controller.signal);
        if (!live) return;
        setFetched({ for: cameraId, points: data.points, error: null });
      } catch (e) {
        if (!live || controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) {
          setFetched({ for: cameraId, points: [], error: null });
          return;
        }
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(e instanceof Error ? e.message : String(e), 0);
        setFetched({ for: cameraId, points: [], error });
      }
    };

    void run();
    const stop = startVisibleInterval(() => void run(), REFRESH_MS);

    return () => {
      live = false;
      stop();
      // Selection changes faster than the network answers. Without this, a
      // quick pass down the list leaves five requests in flight and whichever
      // returns last wins — which is not necessarily the one you clicked.
      controller.abort();
    };
  }, [cameraId]);

  if (!cameraId) return NOTHING;
  if (fetched.for !== cameraId) return LOADING;
  return { points: fetched.points, loading: false, error: fetched.error };
}
