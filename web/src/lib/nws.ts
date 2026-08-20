/**
 * What the NWS block is allowed to say, and — mostly — what it is not.
 *
 * This is the newest surface the **never-safe** rule binds, and it is the one a
 * reader meets on the tide-and-weather tab without choosing anything. An empty
 * alert list is the normal case, it will be what almost every reader sees, and
 * the obvious copy for it is a sentence this site may not write.
 *
 * ## The failure this file exists to prevent
 *
 * *"No alerts"* beside five water-level gauges reads as **all clear**. It is
 * not: it is a statement about one feed, published by an agency this app does
 * not speak for, about county- and zone-scale products issued off radar
 * rainfall rate. NWS being quiet says nothing whatever about standing water on
 * a block — the two disagreeing is ordinary, and `poll.validate` has said so in
 * prose since long before this panel existed.
 *
 * So every string below is **about the feed**. None is about conditions. The
 * words `clear`, `all clear`, `safe`, `fine`, `nothing to report` and `no alerts
 * in effect` do not appear, and `web/tests/nws.test.ts` asserts that over the
 * whole set rather than trusting this paragraph.
 *
 * ## Four states, because an empty list has four different meanings
 *
 * `alerts: []` arrives identically from all four, and they are not variations
 * on one answer — two of them mean *we do not know*:
 *
 *     cold         nothing has been read yet in this process
 *     unreachable  the last attempt failed; what is shown is older
 *     stale        reads are succeeding but have stopped arriving — the loop
 *     current      we asked, recently, and NWS listed nothing here
 *
 * ⚠️ **Only the last one may say nothing is active.** Collapsing any of the
 * other three into it renders *we could not ask* as *nothing is happening*,
 * during exactly the weather that breaks the feed.
 *
 * ⚠️ **Every function here returns a plain `string`.** Not a ReactNode, not
 * JSX — `messages.ts`'s rule, and it is what keeps this testable under vitest's
 * `environment: "node"`. The component does the emphasis.
 */

import type { NwsStatus } from "./api-types";
import { formatAge } from "./format";
import { POLL_WINDOW_S } from "./staleness";

/**
 * How cold a successful NWS read may go before the list stops being current.
 *
 * `poll.tick` reads NWS every iteration, so this is the poll cadence with room
 * for a slow upstream — the same judgement as `tickColdAfterS`, arrived at the
 * same way. Two missed reads is a stopped loop; one is a slow answer from
 * api.weather.gov, which is common and is not news.
 *
 * ⚠️ **`POLL_WINDOW_S`, not `POLL_SECONDS`, since 2026-08-20**, and at 600 this
 * was simply wrong the moment the poller went to a fifteen-minute schedule: the
 * panel declared the feed cold for the last five minutes of every quiet window,
 * on a deployment reading NWS exactly as often as it was designed to.
 *
 * ⚠️ **Deliberately TIGHTER than `tickColdAfterS`'s three windows**, which is
 * the same relative position it has always held. A cold NWS read and a frozen
 * poller are the same underlying fault, and the notices strip already reports
 * the second one properly. What this number is for is stopping the panel from
 * *asserting* on data it should not assert on; it is not a second frozen-poller
 * indicator and must not grow into one.
 */
export const NWS_COLD_AFTER_S = 2 * POLL_WINDOW_S;

export type NwsFeed = "cold" | "unreachable" | "stale" | "current";

/**
 * Which of the four states the panel is in.
 *
 * ⚠️ **The precedence is load-bearing and is asserted.** `cold` outranks
 * everything: with nothing ever read, "unreachable" would overstate what we
 * know (we may simply not have tried yet). `unreachable` then outranks `stale`,
 * because a failed attempt is a more specific fact than an old success.
 *
 * ⚠️ **A missing or null block is `cold`, never `current`.** The absent-field
 * direction matters: an older server that does not send `nws` at all must not
 * have its silence rendered as an answer.
 */
export function nwsFeed(
  nws: NwsStatus | null | undefined,
  nowMs: number,
): NwsFeed {
  if (!nws || !nws.checked_at) return "cold";
  // `=== false` and not `!reachable`, on `mail_delivers`' precedent: a body that
  // arrived without the field is not a body reporting an outage.
  if (nws.reachable === false) return "unreachable";

  const t = Date.parse(nws.checked_at);
  if (Number.isNaN(t)) return "cold";
  if ((nowMs - t) / 1000 >= NWS_COLD_AFTER_S) return "stale";
  return "current";
}

/** Seconds since the last successful read, or null if there has never been one. */
export function nwsCheckedAgeS(
  nws: NwsStatus | null | undefined,
  nowMs: number,
): number | null {
  if (!nws?.checked_at) return null;
  const t = Date.parse(nws.checked_at);
  return Number.isNaN(t) ? null : Math.max(0, (nowMs - t) / 1000);
}

/**
 * The sentence under the rule line when there is nothing local to list — and,
 * for the two fault states, the banner *above* the list when there is.
 *
 * ⚠️ **`elsewhere` is spoken rather than swallowed.** The panel narrows a
 * statewide feed to five boroughs, and a scope narrowed silently is a scope a
 * reader cannot audit. It is also the difference between a quiet day and a
 * storm that happens to be missing this city, which is worth a reader knowing.
 */
export function nwsNote(
  feed: NwsFeed,
  local: number,
  elsewhere: number,
  checkedAgeS: number | null,
): string {
  const read =
    checkedAgeS === null ? null : formatAge(checkedAgeS).replace(/ ago$/, "");

  if (feed === "cold") {
    return (
      "Waiting for the first National Weather Service read. " +
      "Nothing has been read from the feed yet. " +
      "This is not a statement that nothing is active."
    );
  }

  if (feed === "unreachable") {
    const tail =
      read === null
        ? "Nothing has been read from it yet."
        : `The last successful read was ${read} ago, and listed ` +
          `${lastListed(local, elsewhere)}.`;
    return (
      "The National Weather Service feed could not be read. " +
      "Fluud does not know what is active. That is about the feed, " +
      `not about the water. ${tail}`
    );
  }

  if (feed === "stale") {
    return (
      "This list is not being refreshed. " +
      `The last National Weather Service read was ${read ?? "some time"} ago; ` +
      "the poll loop should read it every minute. " +
      "What is here is what the feed said then, and it is not current."
    );
  }

  // current — the only branch permitted to say nothing is active, and even here
  // the claim is scoped to the feed and to the city, in that order.
  const away =
    elsewhere > 0
      ? ` ${count(elsewhere)} active elsewhere in the statewide feed.`
      : "";
  return (
    "No National Weather Service alert is active for New York City." +
    away +
    ` Read ${read ?? "just now"} ago. This is a statement about the NWS feed, ` +
    "which Fluud reads and does not issue. It is not a statement about the " +
    "water on any block."
  );
}

/** "2 alerts" / "1 alert", or the plain absence. Never a bare `0`. */
function lastListed(local: number, elsewhere: number): string {
  if (local === 0 && elsewhere === 0) return "nothing active anywhere in the feed";
  if (local === 0) return `nothing for New York City and ${count(elsewhere)} elsewhere`;
  return `${count(local)} for New York City`;
}

function count(n: number): string {
  return n === 1 ? "1 alert" : `${n} alerts`;
}

/**
 * The rule line's right-hand readout.
 *
 * ⚠️ **Never a bare `0`.** A zero beside `NWS` is a number where the reader
 * expects a measurement, and this panel sits above five real ones. The word is
 * the whole point — `none listed` is about a list; `0` reads as a quantity of
 * hazard.
 */
export function nwsCountLabel(feed: NwsFeed, local: number): string {
  if (feed === "cold") return "not read";
  if (feed === "unreachable") return "feed down";
  if (local === 0) return "none listed";
  return count(local);
}

/**
 * Whether the block should show a fault colour on its condition line.
 *
 * ⚠️ **This is the ONLY colour the block may spend**, and it is about the
 * service rather than the weather. There is no severity ramp here: NWS's
 * severity words and this app's depth band overlap, and a red row beside an
 * amber depth pill invites reading one against the other. See `nws-alerts.tsx`.
 */
export function nwsFaulted(feed: NwsFeed): boolean {
  return feed === "unreachable" || feed === "stale";
}
