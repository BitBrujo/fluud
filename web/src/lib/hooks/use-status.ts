"use client";

import { getStatus } from "../api";
import type { StatusResponse } from "../api-types";
import { usePolled, type Polled } from "./use-polled";

/**
 * `/api/status` — everything the page renders, in one call.
 *
 * ⚠️ **60s, and it was 15s until 2026-08-20 — this is that hook's own comment
 * finally being acted on.** It read: *"The poller runs at 60s, so this is
 * already four times faster than the data changes; polling harder would only
 * add load without adding freshness."* That was true and the number stayed at
 * 15s anyway, because four wasted requests a minute cost nothing while the
 * database was awake regardless.
 *
 * It stopped being free when the poller moved to a schedule so Neon could
 * suspend between runs: at 15s a single open tab reached past the server's
 * read memo four times a minute and held the compute open by itself. 60s is
 * the fastest the underlying rows can ever change — the poller escalates to a
 * 60s tick during a storm and no faster — so this gives up no freshness at all.
 *
 * ⚠️ **Do not raise it to the DRY cadence.** The poller only ticks every 15
 * minutes when nothing is happening; polling this at 15 minutes would put a
 * rising depth up to a quarter of an hour late on the page during the exact
 * conditions the product exists for. The bound is the storm cadence, not the
 * quiet one.
 *
 * ⚠️ **One fetch, not two.** An earlier shape of the page mounted this hook
 * twice on boot, once per consumer, and paid for the same payload twice on
 * every tick. One caller owns it and passes what it holds down.
 */
export function useStatus(): Polled<StatusResponse> {
  return usePolled(getStatus, 60_000);
}
