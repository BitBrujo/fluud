/**
 * The camera layer's two facets — pairing tier and borough — and every word the
 * map says about what it is **not** drawing.
 *
 * ## Why this is a file rather than JSX
 *
 * `nws.ts`'s reason, one feature over. The map has always been able to switch a
 * whole marker class off, and `HiddenNote` answers for that by counting and
 * naming what is off. This filter is **sharper than any of those five
 * switches**, and the difference is the whole reason this file exists:
 *
 * > The five layer switches are binary and their off-state is **total**, which
 * > is why `HiddenNote` can say *"27 cameras are switched off"* and be complete.
 * > This produces **partial** absence — 130 drawn, 838 not — and a reader
 * > looking at 130 pins has no cue whatever that 838 are missing.
 *
 * A drawing of New York City with most of its instruments removed, and nothing
 * saying so, is *unobserved is not clear* failing in the one direction that
 * matters. **What makes the control legal is the sentence, not the chips**, and
 * a sentence in JSX is a sentence no runner can sweep. So every string a reader
 * meets about this filter is produced here, and `tests/camera-filter.test.ts`
 * sweeps the generated state set for the words this site may not say.
 *
 * ⚠️ **Every function here returns a plain `string`.** Not a ReactNode, not JSX
 * — `messages.ts`' and `nws.ts`' rule, and it is what keeps this testable under
 * vitest's `environment: "node"`. The component does the emphasis.
 *
 * ⚠️ **The words `gold`, `golden` and `silver` may never appear in anything
 * here.** They are the internal names of `cameras.GOLD_PAIR_M` / `MAX_PAIR_M` on
 * the Python side. The reader's three words are `paired`, `near` and
 * `not paired`, and the test asserts the absence case-insensitively rather than
 * trusting this paragraph.
 *
 * ⚠️ **No tier may reach a marker.** *Never colour a distance* is a Never
 * bullet, and its argument — reddening with distance is a severity ramp built
 * out of coverage — binds any monotone ramp over distance, not only hue.
 * Dash-vs-solid, thick-vs-thin and large-vs-small are the same ramp in another
 * channel. The tier lives in the control, in this copy, in the header chip's
 * denominator and in a pin's `title`, and nowhere on the drawing.
 */

import type { CameraEntry, PairTier } from "./api-types";
import { FAR_M } from "./geo/distance";

export type { PairTier };

/**
 * The three tiers in the order a reader meets them: tightest pairing first,
 * no pairing last. The control renders in this order and so does the copy.
 */
export const PAIR_TIERS: readonly PairTier[] = ["paired", "near", "unpaired"];

/**
 * What a reader is shown for each wire value.
 *
 * ⚠️ **An exhaustive `Record`, so a fourth tier added to the wire is a build
 * error** — `depth-band.ts` / `levels.ts`' rule. No index signature, no
 * `|| fallback`, no `as`.
 *
 * ⚠️ **`unpaired` → `not paired`.** The fourth label/value split on this page
 * after `watch`→`monitor`, `gauges`→`tide + wx` and `worst`→`depth`.
 */
export const PAIR_TIER_LABEL: Record<PairTier, string> = {
  paired: "paired",
  near: "near",
  unpaired: "not paired",
};

/**
 * Hover copy for each chip. Says what the tier means about the **instrument**,
 * never anything about the water.
 *
 * ⚠️ `FAR_M` is `cameras.MAX_PAIR_M` and is on the parity path — it is
 * interpolated rather than typed, because a bound written out by hand is a
 * bound nothing can see move. There is deliberately **no TypeScript copy of
 * `GOLD_PAIR_M`**: the tier crosses the wire as a classified string, on
 * `IngestBounds`' rule that the band crosses as data and never as a constant,
 * so this side has no need to know where the inner bound falls.
 */
export const PAIR_TIER_TITLE: Record<PairTier, string> = {
  paired:
    "A FloodNet sensor sits at this intersection. Its depth is what this " +
    "camera's view is labelled with.",
  near:
    `A FloodNet sensor is on this block, within ${FAR_M} m. The same block ` +
    "rather than the same corner.",
  unpaired:
    `No FloodNet sensor is within ${FAR_M} m. Fluud has no depth for this ` +
    "corner at all.",
};

/**
 * The reader's two axes.
 *
 * **An empty array means no narrowing on that axis**, which is `applyQuery`'s
 * idiom — not "match nothing". Both empty is the identity filter.
 */
export interface CameraFilter {
  tiers: PairTier[];
  boroughs: string[];
}

/**
 * What `/map` opens with.
 *
 * ⚠️ **`paired` alone, and it is chosen so the resting page needs no fetch.**
 * The 27 cameras already on `/api/status` are exactly what `paired` selects
 * against today's data — verified as set equality, not assumed. That is a
 * coincidence of the current pairing table rather than a property, and the
 * honest cost is recorded at the `useState` in `map/page.tsx`: at rest the
 * `paired` chip describes `WATCH_CAMERAS` and not the `pairs` table, so if the
 * two ever diverge the resting map draws one set under the other's label until
 * a reader touches a chip.
 */
export const DEFAULT_CAMERA_FILTER: CameraFilter = {
  tiers: ["paired"],
  boroughs: [],
};

/**
 * Whether this filter is the one the page opens with.
 *
 * Compared as **sets**, so chip order can never make an untouched filter look
 * touched — which would open a fetch the resting page is supposed not to make.
 */
export function isDefaultCameraFilter(f: CameraFilter): boolean {
  if (f.boroughs.length > 0) return false;
  if (f.tiers.length !== DEFAULT_CAMERA_FILTER.tiers.length) return false;
  return DEFAULT_CAMERA_FILTER.tiers.every((t) => f.tiers.includes(t));
}

/**
 * The rows a filter draws.
 *
 * ⚠️ **A camera with a null `borough` is never matched by a borough filter**,
 * and it counts as withheld rather than as a leftover. Null there means the
 * database has not been re-bootstrapped since `cameras.borough` landed — it
 * never means *outside the city* — so admitting it to every borough would put a
 * camera under a neighbourhood name nobody established.
 */
export function applyCameraFilter(
  rows: CameraEntry[],
  f: CameraFilter,
): CameraEntry[] {
  return rows.filter((c) => {
    if (f.tiers.length > 0 && !f.tiers.includes(c.tier)) return false;
    if (f.boroughs.length > 0) {
      if (!c.borough) return false;
      if (!f.boroughs.includes(c.borough)) return false;
    }
    return true;
  });
}

/**
 * The borough names the picker offers, read off the payload.
 *
 * ⚠️ **Off the payload, never off `NYC_BOROUGHS`.** Those are the *basemap's*
 * borough names, and DOT's `area` strings are a different agency's vocabulary
 * that this repo deliberately does not normalise. Building the picker from the
 * basemap would silently drop any borough whose DOT string spells differently,
 * and a facet that cannot be selected is coverage removed with nothing saying
 * so. `boroughsOf` in `instrument-query.ts` is the idiom this mirrors.
 */
export function boroughsOfCameras(rows: CameraEntry[]): string[] {
  return [
    ...new Set(rows.map((c) => c.borough).filter((b): b is string => !!b)),
  ].sort();
}

/**
 * Everything the footer needs to say what is not drawn.
 *
 * `registry` is whether the 968-row payload has arrived at all. Before it has,
 * this component **does not know** the denominator, and saying a number it does
 * not have is the failure `plottedSensors.length > 0` already guards against
 * one layer up.
 */
export interface CameraFilterState {
  filter: CameraFilter;
  /** Has `/api/cameras` ever resolved? */
  registry: boolean;
  /** Cameras drawn right now. */
  drawn: number;
  /** Cameras the registry holds. Only meaningful once `registry` is true. */
  total: number;
  /** Whether ANY camera in the registry carries a borough at all. */
  anyBorough: boolean;
}

/**
 * The footer sentence for the camera filter. **Always a plain string.**
 *
 * ⚠️ **The precedence is load-bearing and is asserted.** In order:
 *
 * 1. **Rest** — the default filter with no registry. No denominator, because
 *    968 is a number this component does not have yet, and inventing one to
 *    complete a sentence is worse than the shorter sentence.
 * 2. **In flight** — a filter has been touched and the list has not arrived.
 *    No number at all: a count here would describe the old 27-camera set under
 *    the new filter's name.
 * 3. **No borough anywhere** — a borough was picked and not one camera carries
 *    one. This outranks the zero-match refusal because it is the *more
 *    specific* fact: the drawing is empty for a **deployment** reason, and
 *    "widen the filter" is advice that cannot work.
 * 4. **Zero matches** — a real empty result. An empty drawing is not an empty
 *    city, said out loud.
 * 5. **Drawn** — the ordinary case, and it **always prints the denominator**.
 *
 * ⚠️ **Every non-empty state either prints its denominator or says the registry
 * has not arrived**, and the sweep asserts exactly that. That is the property
 * the whole control rests on: a reader must never be able to look at a narrowed
 * drawing of this city without the page saying how much of it is missing.
 *
 * ⚠️ **No "few" threshold is invented.** Bronx + paired is one camera and
 * Staten Island + paired is three, and both fall in case 5 like every other
 * result — because a threshold below which a count is "few" would be a number
 * needing a derivation nobody has.
 */
export function cameraFilterNote(state: CameraFilterState): string {
  const { filter, registry, drawn, total, anyBorough } = state;

  if (!registry && isDefaultCameraFilter(filter)) {
    return (
      `${drawn} cameras are drawn — the ones this instrument polls. ` +
      "Pick a borough or a pairing to draw the rest."
    );
  }

  if (!registry) {
    return (
      "The camera list has not arrived. The filter is not applied yet."
    );
  }

  if (filter.boroughs.length > 0 && !anyBorough) {
    return (
      "No camera carries a borough. This database has not been " +
      "re-bootstrapped since the camera registry gained one. " +
      "That is a fact about this deployment and not about the city."
    );
  }

  if (drawn === 0) {
    return (
      "No camera matches this filter. An empty drawing is not an empty city. " +
      "Widen the filter to see what is being watched."
    );
  }

  const withheld = Math.max(0, total - drawn);
  return (
    `Cameras are filtered to ${tierPhrase(filter.tiers)}` +
    `${boroughPhrase(filter.boroughs)}. ` +
    `${drawn} of ${total} cameras are drawn; ${withheld} are not. ` +
    "A camera that is not drawn says nothing about the water."
  );
}

/**
 * Whether that sentence is a **refusal** rather than an accounting, so the
 * footer can give it the stronger type.
 *
 * ⚠️ **A separate predicate rather than a richer return, because
 * `cameraFilterNote` must stay a plain string** — that is what keeps the copy
 * sweepable under `environment: "node"`. Two functions over one state is the
 * cost; a `ReactNode` or a tagged union would be the alternative and both put
 * rendering decisions back where a runner cannot reach them.
 *
 * ⚠️ **`text-foreground` is what a refusal takes, and NEVER `--wl-stale` /
 * `--wl-dead`.** Those mean an upstream feed has moved — a *fault*. This is the
 * consequence of the reader's own control, and painting it in the fault
 * vocabulary is how that vocabulary stops meaning anything.
 */
export function cameraFilterRefuses(state: CameraFilterState): boolean {
  const { filter, registry, drawn, anyBorough } = state;
  if (!registry) return false;
  if (filter.boroughs.length > 0 && !anyBorough) return true;
  return drawn === 0;
}

/** The tier names, through `PAIR_TIER_LABEL` and never raw. */
function tierPhrase(tiers: PairTier[]): string {
  if (tiers.length === 0) return "every pairing";
  return joinWords(tiers.map((t) => PAIR_TIER_LABEL[t]));
}

function boroughPhrase(boroughs: string[]): string {
  if (boroughs.length === 0) return "";
  return ` in ${joinWords(boroughs)}`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
