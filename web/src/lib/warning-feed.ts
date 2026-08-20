/**
 * The reducer behind the warning panel — pure, so it can be reasoned about and
 * tested without a browser or a network.
 *
 * It exists separately from `use-warnings.ts` because the interesting part is
 * not the EventSource plumbing, it is deciding **which warning is the current
 * one** when the same events arrive more than once. Getting that wrong puts an
 * old warning on screen as if it were happening, which is the frozen-poller rule's
 * failure mode wearing a rat costume.
 */

import type { MoodEvent, RatEvent, SpeakEvent } from "./api-types";
import { parseServerTime } from "./format";
import { DEAD_AFTER_S } from "./staleness";

const HISTORY_LIMIT = 5;

/**
 * How old an entry may be before it leaves `history`.
 *
 * ⚠️ **A count is not an age bound, and `history` was only ever capped by
 * count.** Five entries with no eviction means a warning sits in the log
 * indefinitely on a quiet night — so a reader opening the page at 3am could
 * find a 40-minute-old EMERGENCY in a list with no upper bound on its age.
 * That is the stale-replay rule's failure (a past emergency presented as a current one)
 * arriving in a new surface, and `rat.REPLAY_MAX_AGE_S` does not cover it:
 * that bounds what the **server replays on connect**, not what this array
 * keeps once it has been applied.
 *
 * **Borrowed, not invented** — it is `DEAD_AFTER_S`, the age at which this
 * page already stops calling a camera reading current and replaces the still
 * with `no recent frame`. A warning older than that describes a state of the
 * world the rest of the page has already disowned, so the log may not still be
 * showing it.
 *
 * ⚠️ **The constant lives here, beside `HISTORY_LIMIT`, and is applied by
 * `lib/messages.ts` at read time rather than by the reducer.** That is
 * deliberate: `applyRatEvent` only runs when an event arrives, so a reducer
 * that pruned on insert would never prune during the silence *after* a storm —
 * which is exactly when the log is being read. `buildMessages` already takes
 * `now` and runs on every tick, so the bound is enforced continuously there.
 * The two bounds are siblings and belong in one file.
 */
export const HISTORY_MAX_AGE_S = DEAD_AFTER_S;

export interface WarningFeed {
  /** The warning on screen now, or null for the idle state. */
  latest: SpeakEvent | null;
  /** Most recent first. A log, not a queue — stand-down does not clear it. */
  history: SpeakEvent[];
  /** Delivery keys already applied. Catches exact re-delivery. */
  delivered: ReadonlySet<string>;
  /** Timestamp of the newest event applied. Catches out-of-order replay. */
  lastAppliedAt: number;
}

export const EMPTY_FEED: WarningFeed = {
  latest: null,
  history: [],
  delivered: new Set(),
  lastAppliedAt: 0,
};

/**
 * The delivery key — `at` plus the words, which is what makes a re-delivered
 * warning a no-op below.
 *
 * ⚠️ **Exported since the NOTICES strip landed**, so `lib/messages.ts` can id a
 * log row by the same key this reducer dedupes on. Two different notions of
 * "the same warning" is how a dismissed row comes back on the next reconnect,
 * wearing a fresh id.
 */
export function keyFor(event: SpeakEvent | MoodEvent): string {
  return event.type === "speak"
    ? `speak|${event.at}|${event.text}`
    : `mood|${event.at}`;
}

/**
 * Apply one event. Returns the SAME object when the event changes nothing, so
 * callers can skip a render.
 *
 * TWO GUARDS, and both are needed.
 *
 * `delivered` catches re-delivery of something already on screen: `EventSource`
 * reconnects on its own and `/api/events` replays `rat.recent()` on every
 * connect, so one dropped connection re-sends up to five minutes of warnings.
 *
 * `lastAppliedAt` catches the subtler case. Reconnecting mid-storm replays
 * T1…T5 when only T3…T5 were ever seen — T1 and T2 are genuinely new to this
 * page, so the delivery key lets them through, and applying them in order would
 * leave the panel showing T2 as the current warning. It is not. Anything older
 * than what is already applied is history, and the panel does not display
 * history.
 */
export function applyRatEvent(state: WarningFeed, event: RatEvent): WarningFeed {
  if (event.type !== "speak" && event.type !== "mood") return state;

  const at = parseServerTime(event.at)?.getTime();
  if (at === undefined) return state;
  if (at < state.lastAppliedAt) return state;

  const key = keyFor(event);
  if (state.delivered.has(key)) return state;

  const delivered = new Set(state.delivered);
  delivered.add(key);

  if (event.type === "speak") {
    return {
      latest: event,
      history: [event, ...state.history].slice(0, HISTORY_LIMIT),
      delivered,
      lastAppliedAt: at,
    };
  }

  // Stand-down. Only `clear` idles the panel; every other level always arrives
  // alongside a speak event carrying the actual words.
  return {
    latest: event.level === "clear" ? null : state.latest,
    history: state.history,
    delivered,
    lastAppliedAt: at,
  };
}
