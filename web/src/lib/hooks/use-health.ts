"use client";

import { getHealth } from "../api";
import type { HealthResponse } from "../api-types";
import { usePolled, type Polled } from "./use-polled";

/**
 * `/healthz` — is the service up, and is the poll loop running.
 *
 * 30s. This answers a question about the process, not about the water, and it
 * is polled separately from `/api/status` on purpose: the interesting failure
 * is one where exactly one of them is broken. `/healthz` fine and
 * `/api/status` failing usually means the database is down while the service
 * is up, and that is a different banner with a different fix.
 */
export function useHealth(): Polled<HealthResponse> {
  return usePolled(getHealth, 30_000);
}
