/**
 * The timeframe the detail panel's depth is read over.
 *
 * PURE, outside React, on `instrument-query.ts`'s terms — the rules here are
 * easier to be sure of as functions than as component state, and
 * `tests/depth-window.test.ts` covers them.
 *
 * ## `null` is the current reading, and it is the default
 *
 * The window is `number | null`, where `null` means *the instrument's newest
 * reading* — the number this panel has always shown. That is deliberately the
 * resting state: a peak is history, and a page about what is happening now
 * must not open on what happened yesterday.
 *
 * ## What a window shows is a PEAK
 *
 * The highest plausible depth in the window, never a mean. `waterline/peaks.py`
 * carries the full argument; the short version is that a mean over a day across
 * a two-hour flood renders the flood as a small number, in the largest type on
 * the page. This module names the aggregate in every label it produces
 * (`peak · last hour`) so the figure can never be read as a current depth.
 */

/**
 * ⚠️ **Duplicated in `waterline/peaks.py` and asserted equal by
 * `tests/parity.test.ts`.** Same treatment as `SENSOR_STALE_AFTER_S` and
 * `FAR_M`, for the reason that file exists: a comment saying "keep these in
 * step" is what this repo replaced with a check.
 *
 * These are not thresholds and nothing is borrowed. They gate no alert, no
 * escalation and no notification — moving one cannot change a warning. They are
 * round numbers a person asks a question in, the same licence
 * `selected-detail.tsx`'s `CONFIDENT_AT` runs on as a display band.
 */
export const PRESET_MINUTES = [10, 30, 60, 1440] as const;

/**
 * `sensor_readings` is pruned at seven days, so this is the widest window the
 * data can answer for. ⚠️ **Duplicated from `peaks.RETENTION_DAYS`** and
 * checked by the parity test.
 *
 * The ceiling is the same for cameras and sensors, and since 2026-08-20 both
 * tables are actually pruned to it — `observations` used to be unbounded and was
 * held to this anyway, because a control that offered `last month` on one face
 * and refused it on the other would make the two faces of one panel disagree
 * about what this app can be asked. The argument is unchanged; the storage
 * simply stopped exceeding the promise.
 */
export const RETENTION_DAYS = 7;
export const MIN_WINDOW_MIN = 1;
export const MAX_WINDOW_MIN = RETENTION_DAYS * 24 * 60;

export type CustomUnit = "minutes" | "hours" | "days";

const PER: Record<CustomUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/**
 * Bring a requested window inside what retention can answer for.
 *
 * Mirrors `peaks.clamp_minutes`, and the server clamps again — this one is so
 * the control cannot *offer* a window the server would silently narrow, and the
 * server's is the authority. Non-finite input lands on the smallest window
 * rather than throwing: this is fed by a number input, where the transient
 * states are empty string and `-`.
 */
export function clampWindow(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_WINDOW_MIN;
  return Math.max(MIN_WINDOW_MIN, Math.min(MAX_WINDOW_MIN, Math.floor(minutes)));
}

/** Minutes for a custom `{value, unit}` pair, or null if it is not a number. */
export function customToMinutes(value: number, unit: CustomUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampWindow(value * PER[unit]);
}

/**
 * How a window is named, everywhere it is named.
 *
 * ⚠️ **One function, because the label appears in three places** — the trigger,
 * the menu item and the line under the reading — and three hand-written strings
 * are three chances for the menu to say `last hour` while the readout says
 * `last 60 min`. Same instinct `step-button.tsx` records for two pagers.
 *
 * The units step up only where they divide exactly. `last 90 min` is honest and
 * `last 1.5 hours` is a rounding invitation, so a value that does not land on a
 * whole hour stays in minutes.
 */
export function windowLabel(minutes: number): string {
  const m = clampWindow(minutes);
  if (m % 1440 === 0) {
    const d = m / 1440;
    return d === 1 ? "last day" : `last ${d} days`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? "last hour" : `last ${h} hours`;
  }
  return `last ${m} min`;
}

/**
 * The label for the readout itself.
 *
 * ⚠️ **The word `peak` is not decoration and may not be dropped for space.** It
 * is the only thing separating a windowed figure from a current depth, and this
 * number renders at 26px directly above a control that says `Start
 * Monitor`. A bare `42 mm · last hour` reads as a depth that is somehow
 * still true.
 */
export function peakLabel(minutes: number): string {
  return `peak · ${windowLabel(minutes)}`;
}

/**
 * Split a window into the pieces a custom control needs to show it.
 *
 * Used to seed the custom fields from whatever is already picked, so opening
 * the menu on `last day` and switching to custom starts at `1 day` rather than
 * at a blank box the reader has to re-derive.
 */
export function splitWindow(minutes: number): { value: number; unit: CustomUnit } {
  const m = clampWindow(minutes);
  if (m % 1440 === 0) return { value: m / 1440, unit: "days" };
  if (m % 60 === 0) return { value: m / 60, unit: "hours" };
  return { value: m, unit: "minutes" };
}
