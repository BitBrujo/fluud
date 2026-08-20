/**
 * The API client.
 *
 * Every path here is **relative and same-origin**. In production FastAPI
 * serves this bundle and these routes from one process; in dev `next.config.ts`
 * proxies them to :8080. There is deliberately no NEXT_PUBLIC_API_BASE — no
 * env var means nothing that can differ between dev and prod, and nothing that
 * can be misconfigured into pointing a flood UI at the wrong service.
 *
 * ⚠️ **That rule now holds for the API PATHS only, and it used to hold for the
 * whole app.** `lib/auth-client.ts` reads `NEXT_PUBLIC_NEON_AUTH_URL`, so this
 * bundle does contain one build-time origin that can be wrong — it just is not
 * this one. The distinction is worth keeping sharp: a misconfigured auth URL
 * stops people signing in, and a misconfigured API base would point a flood UI
 * at the wrong service's readings. The second is the one this file refuses,
 * and it still refuses it.
 */

import type {
  CameraRegistryResponse,
  DepthPeak,
  DepthPeaks,
  DrillResponse,
  GaugeHistoryResponse,
  HealthResponse,
  HistoryResponse,
  SensorsResponse,
  StatusResponse,
  WatchConfirmResponse,
  WatchMineResponse,
  WatchOverride,
  WatchResendResponse,
  WatchSettings,
  WatchSubscribeResponse,
  WatchSubscriptionResponse,
  WatchUnsubscribeResponse,
} from "./api-types";
import { authConfigured, getJWTToken } from "./auth-client";
import type { Level } from "./levels";

/**
 * A failed request, with the server's own words where it has any.
 *
 * `api.py` produces two different error envelopes: `{"detail": …}` from
 * HTTPException and `{"error": …}` from the catch-all handler. Both mean the
 * same thing to a person reading a banner, so both normalise to `message`.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function envelopeMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      const detail = b.detail ?? b.error;
      if (typeof detail === "string" && detail) return detail;
      if (detail) return JSON.stringify(detail);
    }
  } catch {
    // Not JSON. Under the `/` mount an unknown path returns 404.html, so this
    // is a normal outcome and not worth surfacing as a parse failure.
  }
  return `${res.status} ${res.statusText || "request failed"}`.trim();
}

/**
 * The `Authorization` header for a request, or nothing.
 *
 * ⚠️ **A bearer token is the ONLY way a session crosses into our API.** The
 * Neon Auth cookie is scoped to Neon's origin, so it is never attached to a
 * same-origin request to `/api/*` no matter what `credentials` says — the
 * browser is right and the cookie genuinely is not ours.
 *
 * ⚠️ **Failure here is silent on purpose.** `getJWTToken` throws when the auth
 * service is unreachable, and turning that into a rejected request would
 * replace a truthful *401, sign in* with a network error banner about the
 * instrument. Sending no header lets the server give the honest answer, and on
 * a deployment with `require_auth` off it lets the request simply succeed.
 */
async function authHeader(): Promise<Record<string, string>> {
  if (!authConfigured) return {};
  try {
    const token = await getJWTToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const auth = await authHeader();
  try {
    res = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: { ...auth, ...(init?.headers ?? {}) },
    });
  } catch (e) {
    // An aborted request is the caller changing its mind, not a failure. Let
    // it out untouched so `use-history` can drop it rather than banner it.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // Network-level: the service is unreachable, not merely unhappy. Status 0
    // is how callers tell those apart when choosing which banner to show.
    throw new ApiError(e instanceof Error ? e.message : "network error", 0);
  }
  if (!res.ok) throw new ApiError(await envelopeMessage(res), res.status);
  return (await res.json()) as T;
}

export function getStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/api/status");
}

/**
 * ⚠️ **`/api/healthz`, never `/healthz`.** The server answers both, and the
 * bare one can be unreachable in production: some hosts reserve that exact
 * path at their edge and return their own 404 before the request reaches the
 * service. `lib/messages.ts` renders *"cannot reach the service"* on any
 * error here, so pointing this at `/healthz` puts a permanent false outage
 * banner over a healthy deployment. Measured on the deployed service
 * 2026-08-07; `/health`, `/healthz2` and every `/api/*` path arrive normally.
 *
 * The `/api/` prefix also means `next.config.ts`'s existing dev proxy covers
 * it with no new rewrite.
 */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/healthz");
}

/**
 * Recent depth for one camera, for the sparkline under the selection.
 *
 * 404s when the camera has no observations at all — which is a real answer
 * ("nothing recorded here"), not an outage, so callers render nothing rather
 * than an error. Takes a signal because selection changes faster than the
 * network does.
 */
export function getHistory(
  cameraId: string,
  signal?: AbortSignal,
): Promise<HistoryResponse> {
  return request<HistoryResponse>(
    `/api/history/${encodeURIComponent(cameraId)}`,
    { signal },
  );
}

/**
 * The highest plausible depth one instrument reported over a window.
 *
 * ⚠️ **404 means the instrument is unknown, and it never means the window was
 * empty.** That is the opposite of `getHistory`, where a 404 IS the answer, and
 * the two are worth reading together before either is changed. An empty window
 * here comes back 200 with `peak_mm: null` and `readings: 0`, which the caller
 * has to render as a sentence rather than as nothing — see `DepthPeak`.
 *
 * An out-of-range `minutes` is clamped server-side rather than refused, and the
 * response echoes the window actually used.
 *
 * Takes a signal for `getHistory`'s reason: selection and the picked window
 * both change faster than the network answers.
 */
export function getDepthPeak(
  kind: "camera" | "sensor",
  instrumentId: string,
  minutes: number,
  signal?: AbortSignal,
): Promise<DepthPeak> {
  return request<DepthPeak>(
    `/api/depth-peak/${kind}/${encodeURIComponent(instrumentId)}` +
      `?minutes=${encodeURIComponent(String(minutes))}`,
    { signal },
  );
}

/**
 * Every instrument of one kind, peaked over one window — the instrument list's
 * depths when a timeframe is picked.
 *
 * ⚠️ **One request, not one per row.** The obvious shape — `getDepthPeak` per
 * visible row — is 425 requests per change of window on a page whose own
 * `use-sensors.ts` is gated behind a flag because a single 150 KB fetch was
 * judged too expensive to make unasked. The route measures 25.6 ms.
 */
export function getDepthPeaks(
  kind: "camera" | "sensor",
  minutes: number,
  signal?: AbortSignal,
): Promise<DepthPeaks> {
  return request<DepthPeaks>(
    `/api/depth-peaks/${kind}?minutes=${encodeURIComponent(String(minutes))}`,
    { signal },
  );
}

/**
 * Every gauge's recent trace, for the sparklines on the baseline cards.
 *
 * One request for all five, not one per card — five round trips to draw one
 * panel is five chances for one card to be a poll behind its neighbours, on a
 * panel whose entire subject is that the gauges are separate instruments and
 * not one reading.
 *
 * Unlike `getHistory` this never 404s: an empty `series` on a cold start is a
 * real answer, and each card still has its current level from `/api/status`.
 */
export function getGaugeHistory(): Promise<GaugeHistoryResponse> {
  return request<GaugeHistoryResponse>("/api/gauge-history");
}

/**
 * Every FloodNet deployment in the city, with its newest reading. 425 of them.
 *
 * ⚠️ **Deliberately not part of `/api/status`.** That call is polled every 15s
 * by every open tab and drives every reading on the page; this one is ~150KB
 * uncompressed (measured) for a surface most readers never open. Same call
 * `getGaugeHistory` makes. `use-sensors.ts` fetches it only while the sensor
 * list or the sensor map layer is on, and polls at 60s — FloodNet publishes
 * about once a minute and the poller writes at 60s, so faster buys nothing.
 *
 * Module-level, like every other fetcher here, so the reference is stable
 * across renders.
 */
export function getSensors(): Promise<SensorsResponse> {
  return request<SensorsResponse>("/api/sensors");
}

/**
 * Every DOT camera in the registry, with its pairing tier and depth. 968 rows.
 *
 * ⚠️ **A different SET from `/api/status`'s camera list, not a superset by
 * accident.** That one comes from `observations`, which the poller writes only
 * for the 27 ids in `WATCH_CAMERAS` — so the map structurally could not draw
 * more than 27 cameras until this route existed.
 *
 * ⚠️ **No query parameters, and that is the feature's legality rather than an
 * omission.** The footer has to be able to say *"838 of 968 are not drawn"*,
 * which needs the denominator; a server returning only matching rows would owe
 * a count beside them, which is the second-authority shape `SensorsResponse`
 * refuses. `camera-filter.ts` does the filtering over rows the browser holds.
 *
 * `use-camera-registry.ts` fetches it only after a reader touches the filter,
 * and polls at 60s — it carries a depth, and a depth fetched once and left on
 * screen is the frozen-poller failure with no age to betray it.
 *
 * Module-level, like every other fetcher here, so the reference is stable
 * across renders.
 */
export function getCameraRegistry(): Promise<CameraRegistryResponse> {
  return request<CameraRegistryResponse>("/api/cameras");
}

/**
 * Fire a rehearsal warning through the real path.
 *
 * ⚠️ **DORMANT — no caller, and `/api/rat/drill` is deleted.** It went with
 * the on-page alert system, along with `/api/events` and `/api/speak`. Kept
 * beside the unmounted `drill-controls.tsx` so re-wiring is one commit; a call
 * to it today would 404 into the SPA's own error page, which is what
 * `waterline/CLAUDE.md` says every unregistered `/api/` path does.
 */
export function fireDrill(level: Level): Promise<DrillResponse> {
  return request<DrillResponse>(
    `/api/rat/drill?level=${encodeURIComponent(level)}`,
    { method: "POST" },
  );
}

// --- the sensor watch ------------------------------------------------------
// The first mutations here that store what a reader typed. Same `request()`,
// same relative same-origin discipline — its `init` spread already carries a
// JSON body, so none of this needs a second fetch wrapper.
//
// ⚠️ `subscribe` answers identically whether or not that address was already
// subscribed, which means **the UI cannot tell the reader "you are already
// signed up"** and must not try to infer it. That is deliberate on the server:
// a differing answer lets anybody test whether an address is on this list. See
// `models.WatchSubscribeResponse`.

function json<T>(path: string, method: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * ⚠️ **No `camera_ids`, and the route now REFUSES one with a 400.** The camera
 * watch repeated an `alerts` episode the page had already published; that path
 * was unwired, so there is no episode to repeat and a stored camera
 * subscription would be a promise with nothing behind it. The parameter is
 * gone from this side rather than sent empty, so a caller cannot reintroduce
 * it by passing a list.
 *
 * ⚠️ **It still takes an `email` even for a signed-in reader, and that is not
 * redundant.** The server compares what arrives here against the
 * `email_verified` claim on the session it verified; sending nothing and
 * letting the server fill it in would move the decision about *which address
 * gets subscribed* out of the one place that can check it. When the two match
 * the response comes back `confirmed` with a `manage_token` and no
 * confirmation step — see `WatchSubscribeResponse`, whose docblock carries what
 * that token costs.
 *
 * ⚠️ **Do not store the returned token.** Component state and a link, nothing
 * else.
 */
export function subscribeWatch(
  email: string,
  sensorIds: string[],
  settings: WatchSettings | null = null,
  overrides: Record<string, WatchOverride> = {},
  lang = "en",
): Promise<WatchSubscribeResponse> {
  return json<WatchSubscribeResponse>("/api/watch/subscribe", "POST", {
    email,
    sensor_ids: sensorIds,
    lang,
    // Omitted entirely when the wizard was never touched, so the server's
    // defaults stay the one statement of what "default" means.
    ...(settings ? { settings } : {}),
    ...(Object.keys(overrides).length ? { overrides } : {}),
  });
}

/**
 * Confirm an address from the link in its own email.
 *
 * POST rather than GET, and the link points at `/watch/?confirm=…` so that page
 * issues the mutation. Mail clients prefetch links; a prefetched GET would
 * confirm an address whose owner pressed nothing, which is the one fact double
 * opt-in exists to establish.
 */
export function confirmWatch(token: string): Promise<WatchConfirmResponse> {
  return json<WatchConfirmResponse>("/api/watch/confirm", "POST", { token });
}

/**
 * The signed-in reader's own watch, if their proven address already has one.
 *
 * ⚠️ **Gated, and it takes no address.** It reports on the session's own
 * `email_verified` claim and nothing else, so there is no address a caller can
 * aim it at — which is what keeps the *"is this address on Fluud"* oracle out of
 * a route that would otherwise be the obvious place to build one.
 *
 * ⚠️ **A 401 here is ordinary and is not a fault.** It is what a signed-out
 * reader gets, and `map/page.tsx` is behind `RequireSession` so it should not
 * arise there — but the caller catches rather than surfacing it, because *not
 * signed in* rendered through `lib/messages.ts` reads as *cannot reach the
 * service*, which is a claim about the instrument.
 */
export function getMyWatch(): Promise<WatchMineResponse> {
  return request<WatchMineResponse>("/api/watch/mine");
}

export function getWatchSubscription(
  token: string,
): Promise<WatchSubscriptionResponse> {
  return request<WatchSubscriptionResponse>(
    `/api/watch/subscription?token=${encodeURIComponent(token)}`,
  );
}

/** Replace the whole watched set. An empty list means "watch nothing", which
 *  is not the same as unsubscribing — the address stays confirmed.
 *
 *  ⚠️ **No `camera_ids`** — see `subscribeWatch`. Omitting the field is what
 *  leaves any stored camera rows alone; sending an empty list would ask the
 *  server to clear a set nothing here can show. `settings: null` leaves the
 *  stored globals alone. */
export function updateWatch(
  token: string,
  sensorIds: string[],
  settings: WatchSettings | null = null,
  overrides: Record<string, WatchOverride> = {},
): Promise<WatchSubscriptionResponse> {
  return json<WatchSubscriptionResponse>("/api/watch/subscription", "PUT", {
    token,
    sensor_ids: sensorIds,
    ...(settings ? { settings } : {}),
    ...(Object.keys(overrides).length ? { overrides } : {}),
  });
}

export function unsubscribeWatch(
  token: string,
): Promise<WatchUnsubscribeResponse> {
  return json<WatchUnsubscribeResponse>("/api/watch/unsubscribe", "POST", {
    token,
  });
}

/**
 * Ask for the manage link to be mailed to an address that already confirmed.
 *
 * ⚠️ **Answers identically whether or not that address is here**, on
 * `subscribeWatch`'s rule and for the same reason. The caller cannot learn
 * whether anything was sent, so the copy at the call site has to be worded as a
 * statement about the request rather than about the outcome.
 *
 * `lang` sets the language of the RESPONSE only. The mail itself goes out in
 * whatever language that address chose when it subscribed, which this endpoint
 * deliberately never reveals — answering in the stored language would leak both
 * that the address exists and what it picked.
 */
export function resendWatchLink(
  email: string,
  lang = "en",
): Promise<WatchResendResponse> {
  return json<WatchResendResponse>("/api/watch/resend", "POST", {
    email,
    lang,
  });
}
