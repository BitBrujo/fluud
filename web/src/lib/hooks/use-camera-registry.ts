"use client";

import { useEffect, useState } from "react";

import { ApiError, getCameraRegistry } from "../api";
import type { CameraRegistryResponse } from "../api-types";
import type { Polled } from "./use-polled";
import { startVisibleInterval } from "./visible-interval";

/**
 * `/api/cameras` — the whole DOT registry (~970 rows), fetched only once a reader
 * has asked for a camera the poller does not watch.
 *
 * ### It is `use-sensors.ts`'s shape, deliberately and line for line
 *
 * Same three properties, for the same reasons:
 *
 * 1. **No request at all before `active` first becomes true.** Not a fetch that
 *    is thrown away. At rest `/map` draws the 27 cameras already on
 *    `/api/status` and this hook has made no network call — which is what makes
 *    the resting page pixel-identical to the one before the filter existed.
 * 2. **It polls at 60s while active, and it MUST.** ⚠️ This payload carries a
 *    **depth**, and a depth fetched once and left on screen is the frozen-poller
 *    failure with no age to betray it. FloodNet publishes about once a minute
 *    and `poll.py` writes on a 60s tick, so a faster cadence returns the same
 *    rows and buys nothing.
 * 3. **It keeps the last payload when `active` goes false**, so a reader
 *    returning to the default filter re-renders instantly rather than blanking.
 *    A kept payload is still aged honestly — every depth carries
 *    `depth_observed_at` and is read through `sensorFreshnessOf`.
 *
 * ⚠️ **`active` is sticky at the call site, not here.** `map/page.tsx` never
 * sets it back to false: flipping the camera layer's source between
 * `/api/status`'s 27 and this route's ~970 on every chip press would re-render
 * the whole marker layer each time. The argument is at that `useState`.
 *
 * ⚠️ **Age it with `sensorFreshnessOf`, never `freshnessOf`.**
 * `CameraEntry.depth_observed_at` is FloodNet's publication clock, not our
 * poller's tick — which is what `CameraStatus.observed_at` is. The distinct
 * field name is the safeguard and this is the hook that hands it over.
 *
 * The payload is ~100KB against `use-sensors.ts`' measured 150KB, so the same
 * cost argument applies with a smaller number. Returns `Polled<T>` so it reads
 * like every other hook here, and the effect has a real cleanup, so StrictMode's
 * double mount leaves no second interval.
 */
export function useCameraRegistry(
  active: boolean,
): Polled<CameraRegistryResponse> {
  const [state, setState] = useState<Polled<CameraRegistryResponse>>({
    data: null,
    error: null,
    lastSuccessAt: null,
    settled: false,
  });

  useEffect(() => {
    // The gate. Note this leaves `state` alone rather than resetting it — that
    // is what "keeps the last payload" means, and it is also why `settled`
    // stays true once it has been true: the question it answers is "has this
    // ever resolved", not "is it resolved right now".
    if (!active) return;

    let mounted = true;

    const run = async () => {
      try {
        const data = await getCameraRegistry();
        if (!mounted) return;
        setState({ data, error: null, lastSuccessAt: Date.now(), settled: true });
      } catch (e) {
        if (!mounted) return;
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(e instanceof Error ? e.message : String(e), 0);
        // Keep `data`, like `usePolled` and `useSensors`: blanking the registry
        // because one poll failed empties the drawing, and an empty drawing of
        // New York City reads as nothing happening anywhere.
        setState((prev) => ({ ...prev, error, settled: true }));
      }
    };

    void run();
    // A phone that has been in a pocket comes back to a registry that is ten
    // minutes old, and there is no reason to make someone look at it first —
    // and while it is in that pocket, this fetches nothing at all.
    const stop = startVisibleInterval(() => void run(), 60_000);

    return () => {
      mounted = false;
      stop();
    };
  }, [active]);

  return state;
}
