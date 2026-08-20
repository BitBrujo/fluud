/**
 * Turning a typed address into a coordinate, **in the browser and nowhere else**.
 *
 * ## ⚠️ This is the second third-party origin on this site, and the only one
 * that costs a feature when it is blocked
 *
 * The first is the Adobe Fonts kit in `app/layout.tsx`, and a blocked font kit
 * costs a reader their headline styling and nothing else. A blocked geocoder
 * costs the address search outright. Both are recorded in the root `CLAUDE.md`;
 * this one is the one to be honest about, so every failure branch here is
 * required to say *this is about the lookup* rather than about the water.
 *
 * ## ⚠️ Why this may not go through `lib/api.ts`
 *
 * That module's docblock states that every path in it is **relative and
 * same-origin**, and that claim is load-bearing — it is why there is no
 * `NEXT_PUBLIC_API_BASE` and nothing that can be misconfigured into pointing a
 * flood UI at the wrong service. Routing an absolute cross-origin URL through
 * `request()` would make it false.
 *
 * The concrete harm is downstream of that: `request()` raises `ApiError`, and
 * `ApiError` is the type `lib/messages.ts` reads to say *cannot reach the
 * service*. A blocked Planning Labs would therefore render as **Fluud being
 * down** — a banner about our own health, raised by somebody else's host. So
 * this file has its own fetch and its own error type, and neither touches the
 * other.
 *
 * ## ⚠️ The address never reaches this project's server, ever
 *
 * Not in a body, not in a query string, not in a header, not in a log line. That
 * is the whole argument LIMITATIONS §16 makes for why a browsing surface over an
 * address is defensible at all, and it holds only because there is no code path
 * from here to `api.py`. `git diff --stat waterline/` coming back empty is the
 * proof of it.
 *
 * ## ⚠️ NO CACHE. EVER.
 *
 * Not `localStorage`, not `sessionStorage`, not IndexedDB, not a module-level
 * `Map`. §16's third ground is that nothing is **accumulated**, and a geocode
 * cache is accumulation — a record of the addresses somebody typed, sitting in
 * their browser after they close the tab. This is exactly what a later "make it
 * feel faster" pass adds, so it is in the **Never** list of the root
 * `CLAUDE.md` as well as here.
 */

import { inViewport } from "./geo/project";

/**
 * NYC Planning Labs GeoSearch (Pelias). No key, CORS-enabled, NYC-only.
 *
 * ⚠️ **The only absolute URL in this application.** If a second one ever
 * appears, the "one relative same-origin client" claim in `lib/api.ts` has
 * stopped describing the app and something needs re-reading.
 *
 * `/v2/autocomplete` rather than `/v2/search` deliberately: it is the forgiving
 * endpoint for a partly-typed address, which is what somebody submits. The name
 * describes the endpoint's tolerance, not this app's interaction — nothing here
 * autocompletes (see "Submit, never debounced" below).
 */
const GEOSEARCH = "https://geosearch.planninglabs.nyc/v2/autocomplete";

/**
 * ⚠️ **A hanging third party is the realistic failure and nothing else watches
 * for it.** `fetch` has no timeout of its own, `lib/messages.ts` only knows
 * about our own origin, and a host that accepts the connection and then never
 * answers would leave the status line reading *Looking that address up.*
 * forever. Six seconds is well past the observed round trip and short enough
 * that a reader on a bad network gets an answer rather than a spinner.
 */
const TIMEOUT_MS = 6_000;

/** How many candidates to ask for. The first in-viewport one is used. */
const SIZE = 5;

/** One geocoded address: the label as the geocoder wrote it, and where it is. */
export interface GeoMatch {
  /** `properties.label` **verbatim**. Never re-worded — see `readLabel`. */
  label: string;
  lat: number;
  lon: number;
}

/**
 * ⚠️ **One kind for every network failure, and that is honesty rather than
 * laziness.**
 *
 * A browser will not tell JavaScript whether a cross-origin fetch was offline,
 * DNS-dead, CORS-refused, blocked by an extension or killed by a captive
 * portal — it is an opaque `TypeError` by design, precisely so a page cannot
 * probe the network it is on. So the copy must not claim to know which, and
 * collapsing them to one kind is what stops a later edit from inventing a
 * distinction the platform refuses to make.
 *
 * `bad-response` is separate because it is a different *subject*: the host
 * answered and the answer was not usable, which is a fact we do observe.
 */
export type GeoFailure = "unreachable" | "bad-response";

export class GeoSearchError extends Error {
  readonly kind: GeoFailure;

  constructor(kind: GeoFailure, message: string) {
    super(message);
    this.name = "GeoSearchError";
    this.kind = kind;
  }
}

/**
 * ⚠️ **Zero results is a real answer, not an error.** "No New York address
 * matched that" is the same class of outcome as `getHistory`'s 404 meaning
 * "nothing recorded here", and it lands as `[]` so the caller can say what it
 * actually means. Raising here would make a legitimate answer wear the copy
 * written for a broken third party.
 *
 * ## Submit, never debounced
 *
 * Three reasons, in the order that decides it:
 *
 * 1. **Privacy.** That the address reaches Planning Labs at all is the
 *    mechanism, and it is disclosed on the page. *How much of it* reaches them
 *    is a choice this file makes. Debounced autocomplete sends a growing prefix
 *    of a home address six or eight times per lookup; §16's standard is that
 *    not-asking beats asking-and-discarding, and the analogue here is that once
 *    beats eight times.
 * 2. `list-controls.tsx` states this repo's position on debouncing and it points
 *    the other way here: search is undebounced *because it filters an array
 *    already in memory*. This is somebody else's server.
 * 3. A native `<form onSubmit>` with a bare `<input type="search">` is already
 *    the precedent (`watch-panel.tsx`), and buys Enter-to-submit and the
 *    browser's own validation for nothing.
 *
 * The caller owns the `AbortController` — one per submit, aborting the in-flight
 * one, on `use-history.ts`'s precedent. `AbortError` propagates untouched so the
 * caller can drop it rather than banner it.
 */
export async function geosearch(
  text: string,
  signal?: AbortSignal,
): Promise<GeoMatch[]> {
  const query = text.trim();
  if (!query) return [];

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort);
  /* Plain `setTimeout`, deliberately not `AbortSignal.any([…])`: this page's
     whole argument is that it works on bad networks and old devices, and a
     two-year-old static method is exactly the kind of thing that leaves one of
     them with a blank surface and a console error. */
  const timer = setTimeout(
    () => controller.abort(new DOMException("timed out", "AbortError")),
    TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(
      `${GEOSEARCH}?text=${encodeURIComponent(query)}&size=${SIZE}`,
      {
        method: "GET",
        /* `cors` and no credentials, stated rather than defaulted. No custom
           headers either — one would buy a preflight round trip and change
           nothing about the answer. */
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new GeoSearchError(
      "unreachable",
      e instanceof Error ? e.message : "network error",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }

  if (!res.ok) {
    throw new GeoSearchError("bad-response", `${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GeoSearchError("bad-response", "response was not JSON");
  }

  return readFeatures(body);
}

/**
 * Parse by hand, defensively. There is no validator library in this project and
 * adding one for a single response shape would be a dependency to carry for a
 * file this size.
 */
function readFeatures(body: unknown): GeoMatch[] {
  if (!body || typeof body !== "object") return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: GeoMatch[] = [];
  for (const f of features) {
    const match = readFeature(f);
    if (match) out.push(match);
  }
  return out;
}

function readFeature(f: unknown): GeoMatch | null {
  if (!f || typeof f !== "object") return null;
  const geometry = (f as { geometry?: unknown }).geometry;
  const properties = (f as { properties?: unknown }).properties;
  if (!geometry || typeof geometry !== "object") return null;

  const coords = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  /*
   * ⚠️ **GeoJSON is `[lon, lat]` and everything else in this app is lat-first.**
   * Named here at the destructure rather than left to be inferred, because a
   * transposition is silent: it does not crash and it does not render an
   * obviously wrong number. 40.68, -73.99 read the other way round is a point in
   * the southern Indian Ocean, and on *this* surface an enormous distance reads
   * as a coverage story — "nothing near me is measured" — rather than as a bug.
   *
   * Two things make it visible instead of plausible, and both are deliberate:
   * `inViewport` below drops every feature, so the surface renders *no New York
   * address matches* rather than a wrong answer; and the crosshair never appears
   * on the drawing. See the `[lon, lat]` check in the verification list.
   */
  const [lon, lat] = coords;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  /*
   * ⚠️ **Outside the drawn viewport is dropped, not clamped.** GeoSearch is
   * NYC-only, so a feature outside `NYC_BOUNDS` is either a transposition (see
   * above) or an upstream change — and in both cases a coordinate this app
   * cannot draw a crosshair for must not become an origin it measures 425
   * distances from. `distanceFromOrigin` refuses the same coordinate on the same
   * bound, so the two cannot disagree.
   */
  if (!inViewport(lon, lat)) return null;

  const label = readLabel(properties);
  if (!label) return null;

  return { label, lat, lon };
}

/**
 * `properties.label` **verbatim**, never re-worded and never re-assembled from
 * the component fields beside it.
 *
 * The label is the only thing on the page that says *this is the place you
 * meant*, and a label this app composed itself — from `housenumber`, `street`,
 * `borough` — would be this app's claim about an address rather than the
 * geocoder's. That is the same rule the warning copy follows: quote the source,
 * do not paraphrase it.
 */
function readLabel(properties: unknown): string | null {
  if (!properties || typeof properties !== "object") return null;
  const label = (properties as { label?: unknown }).label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}
