/**
 * The watch panel's pure rules, extracted from `watch-panel.tsx` on 2026-08-16.
 *
 * ## Why they are here and not in a component
 *
 * ⚠️ **`web/tests/` may only reach `src/lib/`.** These three are the entire
 * testable seam of the watch flow, and both functions below encode a rule a
 * compiler cannot see: one about what a half-set quiet window means, one about
 * which overrides may survive a save. Left inside a 1600-line client component
 * neither could be asserted at all.
 *
 * The second reason is the one that made the move necessary rather than merely
 * tidy: `watch-manage.tsx` and `watch-panel.tsx` both run them, and a helper
 * exported from one component into the other is the module cycle
 * `station-list.tsx` / `sensor-row.tsx` already hit once. A third module both
 * import from cannot cycle.
 *
 * Nothing here touches the network, the DOM or React.
 */

import type { WatchOverride, WatchSettings } from "@/lib/api-types";

/**
 * The client's editable copy of the three global settings.
 *
 * ⚠️ **This is a DRAFT's starting point, never a statement of what the server's
 * defaults are.** The subscribe POST carries a `settings` object only when the
 * reader has touched the controls, precisely so `notify.DEFAULT_MIN_LEVEL` and
 * `notify.DEFAULT_FREQUENCY` stay the one statement of what "default" means. If
 * these drift from the server's the wizard still cannot lie about it — an
 * untouched wizard sends nothing.
 */
export const DEFAULT_SETTINGS: WatchSettings = {
  min_level: "watch",
  frequency: "every",
  quiet_start: null,
  quiet_end: null,
};

/**
 * Overrides for exactly the given ids, dropping empty entries.
 *
 * ⚠️ **The id filter is the safety property, not the tidying.** Every save is a
 * whole statement — the sensor list, the globals and the overrides together —
 * and the override map is edited independently of the list. Without the filter,
 * dropping a sensor and saving would send an override for an instrument that is
 * no longer watched, and re-adding that instrument later would silently
 * resurrect a setting the reader believed they had removed with it.
 *
 * The empty-entry drop is the other half: `{}` and `{min_level: null}` both
 * mean *the global applies*, and sending either as an override would make the
 * server store a row that says nothing.
 */
export function overridesFor(
  source: Record<string, WatchOverride>,
  ids: string[],
): Record<string, WatchOverride> {
  const out: Record<string, WatchOverride> = {};
  for (const id of ids) {
    const ov = source[id];
    if (ov && (ov.min_level || ov.frequency)) out[id] = ov;
  }
  return out;
}

/**
 * Half a quiet window is not a window.
 *
 * Said on the client so the server's 400 never has to say it, and run by every
 * face that can save. ⚠️ **Both-null is complete and means OFF** — the check is
 * an inequality between two absences, not a truthiness test, because `0` is a
 * legitimate hour and `quiet_start: 0` is midnight rather than *unset*.
 */
export function quietHoursIncomplete(s: WatchSettings): boolean {
  return (s.quiet_start === null) !== (s.quiet_end === null);
}

/**
 * The manage URL for a token.
 *
 * ⚠️ **`/watch/`, and NEVER `/map/?watch=`.** That is not a URL-style
 * preference. Every link this app mailed pointed at `/map/?watch=` until
 * 2026-08-16, `/map` is wrapped in `RequireSession`, and a subscriber with no
 * Fluud account was redirected to sign-in before the component that reads the
 * token ever mounted — so every unsubscribe link ever sent was dead in
 * production for the whole life of the sign-in gate. `scripts/check_mail.py`
 * carries a negative assertion that no rendered mail body contains `/map/?`;
 * this function is the same failure class arriving on the UI side, where no
 * check script can reach it.
 *
 * ⚠️ **One shape of this URL in the app, matching the mailed one**, so a reader
 * who has both cannot meet two different-looking links to one place.
 */
export function watchManageHref(token: string): string {
  return `/watch/?watch=${encodeURIComponent(token)}`;
}

/**
 * What the `sent` face says, as data.
 *
 * ⚠️ **In `src/lib/` because `web/tests/` may only reach here, and because this
 * is copy that can be WRONG rather than merely ugly.** The face had one
 * paragraph until 2026-08-16, and it told every reader to go and check their
 * inbox. Since a signed-in reader watching their own provider-verified address
 * is subscribed outright — no confirmation, nothing to wait for — that sentence
 * became false for a whole branch of the flow, and a reader following it would
 * sit watching a mailbox for a message that is not a step.
 *
 * ⚠️ **The `confirmed` branch may not tell anybody to wait for anything.**
 * `tests/watch-settings.test.ts` sweeps the grid for that.
 *
 * ⚠️ **`mailDelivers === false`, never `!mailDelivers`.** It is `undefined`
 * before the first `/api/healthz` settles and on an older instance mid-deploy,
 * and absence is not a verdict — see `api-types.ts`. **Both branches take the
 * gate**, because both mention mail: the standing rule is that any copy in this
 * app promising mail is gated on the server being able to send it.
 *
 * ⚠️ **`fault` is `--wl-stale`'s branch and it is about the DEPLOYMENT, never
 * about the water.** The `confirmed` branch can raise it too: the watch is live
 * either way, and what the missing transport costs there is the durable copy of
 * the link rather than the subscription itself.
 */
export function sentFaceNote(
  status: "pending" | "confirmed",
  mailDelivers?: boolean,
): { text: string; fault: boolean } {
  if (status === "confirmed") {
    return mailDelivers === false
      ? {
          text:
            "Your watch is live. This deployment has no mail transport " +
            "configured, so no copy of your settings link was mailed. The " +
            "link below is the only one you will get.",
          fault: true,
        }
      : {
          text:
            "Your watch is live. You are signed in with that address, so " +
            "there was no extra step. A copy of your settings link is on its " +
            "way to it as well.",
          fault: false,
        };
  }
  return mailDelivers === false
    ? {
        text:
          "No email was sent. This deployment has no mail transport " +
          "configured. Your request is stored. The confirmation link cannot " +
          "reach you.",
        fault: true,
      }
    : {
        text:
          "Check that address. Nothing is sent until you confirm from the " +
          "email, and if that was not you, ignoring it does nothing.",
        fault: false,
      };
}

/**
 * The `sent` face's state line.
 *
 * ⚠️ **`waiting on` is a claim that something is coming**, and on the fast path
 * nothing is. The verb is the whole of the difference and it is here rather
 * than inline so the two strings cannot be edited apart from the paragraph
 * under them.
 */
export function sentFaceHeading(
  status: "pending" | "confirmed",
  address: string,
): string {
  return status === "confirmed"
    ? `watching for ${address}`
    : `waiting on ${address}`;
}

/**
 * How long the confirmed `sent` face stays up before the wizard closes itself.
 *
 * ⚠️ **It is a reading budget, not a transition.** The face carries a heading, a
 * paragraph, the frozen chips, the honesty line and a link to the watch, and a
 * reader has to be able to finish all of it and decide whether to press the
 * link. **Shortening this is a copy decision**, and `keep this open` on the face
 * is what makes any value defensible at all — see `sentFaceAutoCloses`.
 */
export const SENT_AUTO_CLOSE_S = 10;

/**
 * Whether the `sent` face closes the wizard by itself.
 *
 * ⚠️ **Only the confirmed branch, and only where the settings link was also
 * mailed.** On the confirmed path there is nothing left for the reader to do —
 * the row is created, the watch is live, and the face is a receipt — so leaving
 * a terminal face up is the wizard claiming an unfinished step it does not have.
 * Closing takes the manage token out of component state with it, which is where
 * the one exception comes from.
 *
 * ⚠️ **`mailDelivers === false` NEVER closes itself, and that is the whole of
 * why this is a function rather than `status === "confirmed"`.** On that branch
 * `sentFaceNote` says in words that the link on the face is the only copy the
 * reader will get. A timer that wiped it would destroy a bearer credential
 * nothing can re-issue — there is no transport to mail it again with.
 * `tests/watch-settings.test.ts` pins the two together, so a later edit to
 * either one has to move both.
 *
 * ⚠️ **`=== false`, never `!`.** `undefined` is an older instance mid-deploy or
 * a first `/api/healthz` that has not settled, and absence is not a verdict —
 * `api-types.ts`'s rule. The safe reading of *the server did not say* here is
 * that a copy was mailed, because the confirmed branch's own default copy says
 * so and the two may not disagree.
 *
 * ⚠️ **The PENDING branch may never close itself.** That face is not a receipt:
 * it is the one surface telling somebody a confirmation link is on its way to
 * an address, and taking it away on a timer would leave a reader who looked up
 * from their inbox with no statement of what they were waiting for.
 */
export function sentFaceAutoCloses(
  status: "pending" | "confirmed",
  mailDelivers?: boolean,
): boolean {
  return status === "confirmed" && mailDelivers !== false;
}

/**
 * What the closing face says while it is counting down.
 *
 * ⚠️ **It states the confirmation and then states the consequence**, in that
 * order, because a countdown with no subject reads as something failing. It
 * says nothing about mail, nothing about an inbox and nothing about waiting —
 * `sentFaceNote`'s confirmed branch is swept for those words and this line sits
 * directly under it, so it is held to the same list.
 *
 * ⚠️ **It is a fact about this PANEL and never about the water.** No reading, no
 * age, no severity colour: the seconds are the wizard's own clock, which is the
 * one number this face is allowed to carry.
 */
export function sentFaceClosingNote(seconds: number): string {
  return `Confirmed. This closes in ${seconds}s.`;
}
