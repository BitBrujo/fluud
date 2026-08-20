/**
 * A depth against the two borrowed thresholds. The replacement for
 * `severity.ts`, which is deleted.
 *
 * ⚠️ **This is not a severity ramp with new names.** A severity was a camera's
 * ordinal guess about a frame, and it is gone with the layer that produced it.
 * This is arithmetic over a calibrated millimetre: below FloodNet's flood
 * event, at or above it, at or above curb height. Nothing infers anything.
 *
 * ⚠️ **The thresholds come from `/api/status`, and may never be hard-coded
 * here.** 10 mm is FloodNet's own definition of a flood event and 150 mm is
 * NYC curb height; both live in `waterline/config.py` and ride on
 * `StatusResponse.thresholds`. A literal in this file would be a seventh
 * number duplicated across the two languages with nothing in
 * `tests/parity.test.ts` holding it.
 *
 * THE POINT OF THE `Record`s: every lookup below is exhaustive, so adding a
 * band without giving it a presentation is a **build error**. Do not add an
 * index signature, a fallback, or an `as any`.
 */

export const DEPTH_BANDS = ["none", "flood", "curb"] as const;

export type DepthBand = (typeof DEPTH_BANDS)[number];

/**
 * Which band a depth falls in.
 *
 * ⚠️ **`null` is `none`, and `none` is not a claim.** A camera with no paired
 * sensor and a sensor that has never reported both land here, beside a reading
 * of exactly 0 mm. That is why the `none` presentation is neutral rather than
 * green — see below.
 */
export function depthBand(
  depthMm: number | null | undefined,
  floodEventMm: number,
  curbHeightMm: number,
): DepthBand {
  if (depthMm == null) return "none";
  if (depthMm >= curbHeightMm) return "curb";
  if (depthMm >= floodEventMm) return "flood";
  return "none";
}

/**
 * Pill colours. Literal class strings, not composed at runtime — Tailwind
 * scans source text, so a template-built class name is one that does not exist
 * in the CSS.
 *
 * ⚠️ **`none` is NEUTRAL and may never be `--wl-clear`.** A green chip under
 * 10 mm is this app reporting that a block is fine, which is the one claim it
 * does not make: the reading is about one instrument, everywhere else is
 * unobserved, and a sensor reading 0 mm has said nothing about the side street
 * behind it. The two ends of this scale are a warning colour and no colour;
 * there is no reassuring end and there must not be one.
 */
export const DEPTH_BAND_PILL: Record<DepthBand, string> = {
  none: "border border-border bg-transparent text-muted-foreground",
  flood: "bg-[var(--depth-flood-bg)] text-[var(--wl-warning)]",
  curb: "bg-[var(--depth-curb-bg)] text-[var(--wl-emergency)]",
};

/**
 * Map-marker fills. The same band as the pills, as one solid colour rather
 * than a ground/ink pair — a 9px dot has no room for two.
 *
 * ⚠️ **`none` is `--muted-foreground`, deliberately not `--wl-sensor`.** Camera
 * pins and sensor markers are both circles on this map and colour is the only
 * thing separating them; borrowing the instrument slate would make an
 * under-threshold camera indistinguishable from a sensor ring.
 *
 * **A marker only ever takes one of these while its reading is fresh.** Past
 * the staleness threshold the map drops it out of the band entirely — see
 * `city-map.tsx`. An hour-old reading in a confident colour is the worst thing
 * this page can render, and it is worse on a map than on a card, because a
 * card at least has a timestamp beside it.
 */
export const DEPTH_BAND_PIN: Record<DepthBand, string> = {
  none: "var(--muted-foreground)",
  flood: "var(--wl-warning)",
  curb: "var(--wl-emergency)",
};

/** For sorting. Deeper first. */
export const DEPTH_BAND_RANK: Record<DepthBand, number> = {
  none: 0,
  flood: 1,
  curb: 2,
};

/**
 * What the pill says. Short enough for a 42px list row, and it names the
 * threshold rather than grading the street: `flood` is FloodNet's word for
 * 10 mm and `curb` is the height water leaves the roadway at.
 */
export const DEPTH_BAND_LABEL: Record<DepthBand, string> = {
  none: "under",
  flood: "flood",
  curb: "curb",
};

/**
 * The pill's `title`, naming the number the band was measured against. The
 * chip has room for one word; this is where the threshold itself goes.
 */
export function depthBandTitle(
  band: DepthBand,
  floodEventMm: number,
  curbHeightMm: number,
): string {
  if (band === "curb") {
    return `at or above ${curbHeightMm} mm — curb height, where water leaves the roadway`;
  }
  if (band === "flood") {
    return `at or above ${floodEventMm} mm — FloodNet's own flood-event threshold`;
  }
  return `below ${floodEventMm} mm at this instrument. This is not a statement about conditions anywhere else`;
}
