"use client";

import { getGaugeHistory } from "../api";
import type { GaugeHistoryResponse } from "../api-types";
import { usePolled, type Polled } from "./use-polled";

/**
 * `/api/gauge-history` — every gauge's recent trace, for the baseline cards.
 *
 * 60s, not 15s. CO-OPS publishes every ~6 minutes and USGS every ~15, and the
 * poller only writes a row when the upstream timestamp is new, so polling on
 * the status cadence would fetch the same series four times to draw the same
 * five lines. This is already faster than the slowest gauge changes.
 *
 * `getGaugeHistory` is module-level, which `usePolled` requires — an inline
 * closure here would resubscribe on every render. See the note in that file.
 */
export function useGaugeHistory(): Polled<GaugeHistoryResponse> {
  return usePolled(getGaugeHistory, 60_000);
}
