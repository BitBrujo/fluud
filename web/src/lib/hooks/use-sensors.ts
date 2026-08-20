"use client";

import { useEffect, useState } from "react";

import { ApiError, getSensors } from "../api";
import type { SensorsResponse } from "../api-types";
import type { Polled } from "./use-polled";
import { startVisibleInterval } from "./visible-interval";

/**
 * `/api/sensors` — every FloodNet deployment, fetched only when something is
 * actually looking at it.
 *
 * ### ⚠️ Why this is not `usePolled`
 *
 * `usePolled` starts on mount and never stops. That is right for `/api/status`,
 * which drives every reading on the page and is wanted from the first frame.
 * It is wrong here: this payload is **~150KB uncompressed** (measured, and
 * FastAPI does no compression) for a surface most readers never open. Mounting
 * it unconditionally would pull that every 60s, forever, on a phone, to render
 * a tab nobody pressed.
 *
 * So it takes `active` and does three things `usePolled` cannot:
 *
 * 1. **It does not fetch until `active` first becomes true.** Not a fetch that
 *    is thrown away — no request at all.
 * 2. **It polls at 60s while active.** FloodNet publishes about once a minute
 *    and `poll.py` writes on a 60s tick, so a faster cadence returns the same
 *    rows and buys nothing.
 * 3. **It keeps the last payload when `active` goes false.** Toggling the layer
 *    off and back on re-renders instantly instead of blanking to a spinner, and
 *    a stale-but-shown list is still aged honestly by `sensorFreshnessOf` — the
 *    rows say how old they are, so keeping them costs no truthfulness.
 *
 * Returns `Polled<T>` so it reads like every other hook in this directory, and
 * so a caller can be switched between them without touching the call site.
 *
 * The effect has a real cleanup, so StrictMode's double mount leaves no second
 * interval — the same rule `use-warnings.ts` follows for its `EventSource`.
 */
export function useSensors(active: boolean): Polled<SensorsResponse> {
  const [state, setState] = useState<Polled<SensorsResponse>>({
    data: null,
    error: null,
    lastSuccessAt: null,
    settled: false,
  });

  useEffect(() => {
    // The whole point of the gate. Note this leaves `state` alone rather than
    // resetting it — that is what "keeps the last payload" means, and it is
    // also why `settled` stays true once it has been true: the question it
    // answers is "has this ever resolved", not "is it resolved right now".
    if (!active) return;

    let mounted = true;

    const run = async () => {
      try {
        const data = await getSensors();
        if (!mounted) return;
        setState({ data, error: null, lastSuccessAt: Date.now(), settled: true });
      } catch (e) {
        if (!mounted) return;
        const error =
          e instanceof ApiError
            ? e
            : new ApiError(e instanceof Error ? e.message : String(e), 0);
        // Keep `data`, like `usePolled`: blanking a list because one poll
        // failed reads as "no sensors", which is a claim about the city.
        setState((prev) => ({ ...prev, error, settled: true }));
      }
    };

    void run();
    // Same reasoning as `usePolled`, and now the same code: hidden tabs fetch
    // nothing, and coming back fetches at once. `active` already gates the
    // request on the layer being open; this gates it on somebody being there.
    const stop = startVisibleInterval(() => void run(), 60_000);

    return () => {
      mounted = false;
      stop();
    };
  }, [active]);

  return state;
}
