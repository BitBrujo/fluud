/**
 * What the NOTICES strip has to say, as data.
 *
 * This is the whole of `components/message-strip.tsx`'s judgement, extracted so
 * it can be tested without a browser — the reason anything is in `src/lib/` at
 * all. The component renders what comes out of here and decides nothing.
 *
 * ## Where this came from
 *
 * Until 2026-08-07 the three service conditions below lived in
 * `components/service-banners.tsx`, which rendered them as a `flex-col` of
 * shadcn `<Alert>`s at the top of `/map`, in normal flow, sizing to their
 * contents. **That file is deleted, not orphaned.** The conditions moved here
 * verbatim — including their docblocks, which are the part that would not have
 * been re-derived — and the reason for the move is the layout: two unbounded
 * stacks in flow pushed the whole workspace down by an unpredictable amount,
 * and nothing could be dismissed.
 *
 * The strip that replaced it has a **constant height** and scrolls internally,
 * so the push is a known quantity, and every row carries a `✕`.
 *
 * ## Two rules that are not obvious from the shape
 *
 * ⚠️ **`body` is a plain `string` and never a `ReactNode`.** The poll banner
 * renders a `<code>` fragment, and the obvious way to carry that is JSX — which
 * would put React in `src/lib/` and make this file untestable under vitest's
 * `environment: "node"` (`web/tests/CLAUDE.md`). Hence `code` as its own slot,
 * with the sentence around it byte-identical to what shipped before.
 *
 * ⚠️ **This never reads `latest`.** An earlier draft excluded the current
 * warning from the log by delivery key, so that the templated sentence could
 * appear in the log without being on screen twice. The log carries no sentence
 * at all now (see `MessageTone` below), so there is nothing to exclude — and
 * the win is that log membership does not churn against a value that changes
 * on stand-down. `buildMessages` is a function of the payloads and the clock.
 */

import type { Level } from "./levels";
import type { SpeakEvent } from "./api-types";
import type { HealthResponse, StatusResponse } from "./api-types";
import type { Polled } from "./hooks/use-polled";
import { ageSeconds, formatAge, parseServerTime } from "./format";
import { cadenceOf, storeColdAfterS, tickColdAfterS } from "./staleness";
import { HISTORY_MAX_AGE_S, keyFor } from "./warning-feed";

/**
 * `fault` is something broken about this page or the service behind it, and it
 * invalidates the readings below it. `log` is a warning the rat has already
 * spoken — history, not news.
 *
 * ⚠️ **A `log` row carries no warning text and may never be given any.** The
 * root `CLAUDE.md` forbids rendering the templated sentence twice:
 * `components/warning-block.tsx` is the single rendering and it carries the
 * provenance chips, the place and the clock that make a REPLAYED or DRILL
 * warning legible as one. A log row holding the sentence *without* that frame
 * would read as a real past flood warning — which is why these rows carry the
 * frame (level, place, clock, chips) and not the words.
 */
export type MessageTone = "fault" | "log";

export interface Message {
  /**
   * Stable for as long as the condition holds, and what dismissal is keyed on.
   *
   * ⚠️ **It changes when the condition changes** — `service:poll-frozen` and
   * `service:poll-stopped` are two ids — so a reader who dismissed one is shown
   * the other. That is the point: they are different claims about the poller.
   */
  id: string;
  /**
   * The React key, and deliberately NOT the id.
   *
   * ⚠️ `service-banners.tsx` used a stable `key="poll"` and swapped only the
   * `title` prop when the condition flapped frozen↔stopped, so a flapping
   * instance did **not** re-announce. Fault rows carry `role="alert"`
   * (implicitly assertive), so keying them on an id that changes by design
   * would unmount and remount the row on every flap and interrupt a screen
   * reader each time. One slot, many ids.
   */
  slot: string;
  tone: MessageTone;
  title: string;
  /** Empty on a log row. */
  body: string;
  /**
   * Rendered as `<code>` after `body`.
   *
   * ⚠️ **No row sets this today.** The poll fault carried two host-specific
   * deploy flags here; that host is gone and the advice with it. The field
   * stays because the separation is the point — `body` is a plain string so
   * this file is testable under `environment: "node"`, and a row wanting a
   * literal has somewhere to put it that is not JSX in `src/lib/`.
   */
  code?: string;
  /** Log rows only, all four. */
  level?: Level;
  place?: string;
  at?: string;
  replay?: boolean;
  drill?: boolean;
}

export interface MessageInput {
  health: Polled<HealthResponse>;
  status: Polled<StatusResponse>;
  /** `useWarnings().history` — most recent first. */
  history: readonly SpeakEvent[];
  /** How many alerts are open. See the log suppression below. */
  openAlerts: number;
  /** ms epoch, from `useNow`. */
  now: number;
}

/**
 * Worst-first, which is the same order the page itself reads in: a fault
 * invalidates everything under it, and the log is the least urgent thing here.
 */
export function buildMessages({
  health,
  status,
  history,
  openAlerts,
  now,
}: MessageInput): Message[] {
  // (b) The service itself is unreachable. Nothing else is diagnosable from
  // here, and stacking a second banner under this one is just noise.
  //
  // ⚠️ **This returns over the WHOLE array, not just over the service group.**
  // `service-banners.tsx` made the same early return, but it only had service
  // banners to suppress. With `/api/healthz` unreachable the SSE stream is down
  // too, so a warning log underneath would be a list of warnings from a page
  // that is no longer connected to anything — the exact "just noise" this
  // return has always been about, made worse by looking like live history.
  if (health.settled && health.error) {
    return [
      {
        id: "service:unreachable",
        slot: "service:health",
        tone: "fault",
        title: "Cannot reach the Fluud service.",
        body:
          "Everything below is whatever was last loaded into this page, and it is" +
          " not being updated. Nothing here is a current reading." +
          (health.error.message ? ` (${health.error.message})` : ""),
      },
    ];
  }

  const messages: Message[] = [];
  const h = health.data;

  // ⚠️ **The gate here moved from the DEPLOYMENT SHAPE to the SOURCE of the
  // fact, on 2026-08-15.** It was `h?.poll_in_service`, because `last_tick_at`
  // is a global in the API's own process and is null forever when the poller
  // runs elsewhere — removing that gate would have painted a permanent false
  // "the poller has stopped" on a healthy two-container deploy. The cost was
  // that a bare `uvicorn` run with no poller anywhere said **nothing at all**,
  // and the reader got a silently empty map.
  //
  // `writes` comes out of `poll_ticks` in Postgres, written by whichever process
  // runs the loop, so it is true in both shapes and needs no gate. The old path
  // survives underneath for a server that predates the field.
  const w = h?.writes ?? null;
  // ⚠️ `undefined`/`null` block means *this server did not say*. A present block
  // with a null `tick_at` means *no poller has ever ticked in this mode*, which
  // is a claim rather than a silence — see `PollWrites`.
  const neverTicked = w !== null && w.tick_at == null;
  const lastTick = w
    ? parseServerTime(w.tick_at)
    : h?.poll_in_service
      ? parseServerTime(h.last_tick_at)
      : null;
  const tickAge = lastTick ? ageSeconds(lastTick, now) : null;
  // ⚠️ **Sized against the cadence THIS DEPLOYMENT reports, not the one this
  // bundle was built with.** The poller's schedule is a Railway cron expression
  // as much as it is a Python constant, and it can be changed without a
  // rebuild; when the two disagree, accusing a healthy poller of being frozen
  // is the failure. `cadenceOf` falls back to the compiled defaults for an API
  // that predates the fields.
  const cadence = cadenceOf(
    h ? { pollSeconds: h.poll_seconds, pollWindowS: h.poll_window_s } : null,
  );
  const frozen = tickAge !== null && tickAge > tickColdAfterS(cadence);
  // `polling` is `_poller.is_alive()` in THIS process, so it is evidence a
  // thread exited only where the thread is supposed to be here.
  const exited = Boolean(h?.poll_in_service) && h?.polling === false;

  // (a) The poll loop is not collecting. Three ids on one slot: the two the
  // page has always had, plus the never-ticked case the old gate hid.
  if (neverTicked) {
    messages.push({
      id: "service:poll-absent",
      slot: "service:poll",
      tone: "fault",
      title: "No readings are being collected.",
      body:
        "Nothing has ever polled this service's mode. Everything below is empty" +
        " for that reason and not because the instruments are quiet." +
        " Start the poller, or set POLL_IN_SERVICE=true to run it inside this" +
        " service.",
    });
  } else if (exited || frozen) {
    messages.push({
      id: exited ? "service:poll-stopped" : "service:poll-frozen",
      slot: "service:poll",
      tone: "fault",
      title: exited
        ? "The poll loop has stopped."
        : "The poll loop is not ticking.",
      body:
        "Everything below is the last data collected and is not being updated." +
        (tickAge !== null && frozen ? ` Last tick ${formatAge(tickAge)}.` : "") +
        " Check the service log, and check that the host is running the" +
        " container continuously rather than suspending it between requests.",
    });
  } else if (w) {
    // (a2) The loop is ticking and nothing is reaching the database. ⚠️ This is
    // pushed only when (a) did not fire: a stopped loop already invalidates
    // everything below, and two rows would be one claim said twice.
    //
    // `last_store_at` is the only field that can see this. `tick_at` keeps
    // moving through a failed write, an empty registry and an unset
    // WATCH_CAMERAS alike.
    const lastStore = parseServerTime(w.last_store_at);
    const storeAge = lastStore ? ageSeconds(lastStore, now) : null;
    if (storeAge === null || storeAge > storeColdAfterS(cadence)) {
      messages.push({
        id: "service:poll-dry",
        slot: "service:poll-writes",
        tone: "fault",
        title: "No readings are being stored.",
        body:
          "The poll loop is ticking and nothing new has reached the database." +
          (storeAge !== null
            ? ` The last reading was stored ${formatAge(storeAge)}.`
            : " No reading has been stored at all.") +
          " Everything below is the last data collected." +
          " Check the service log for a failed write and for what FloodNet" +
          " returned.",
      });
    }
  }

  // (c) The service is up but the readings are not. Usually the database is
  // down while the process is fine — a different failure with a different fix,
  // which is why it is not folded into (a) or (b). This is also the direct
  // replacement for the old page's silent `catch { return; }`.
  if (status.settled && status.error) {
    const lastOk = status.lastSuccessAt;
    messages.push({
      id: "service:status",
      slot: "service:status",
      tone: "fault",
      title: "Readings failed to refresh.",
      body:
        `The service is up but \`/api/status\` is failing: ${status.error.message}. ` +
        (lastOk
          ? `The cards below are from ${formatAge((now - lastOk) / 1000)}.`
          : "No readings have loaded at all."),
    });
  }

  // ⚠️ **The log is suppressed entirely while an alert is open**, and this is
  // reading order rather than tidiness. The page is worst-first — faults, then
  // open alerts, then the workspace — and this strip sits ABOVE `AlertList`, so
  // a list of warnings that have already finished, stacked over an alert that
  // is still running, inverts it.
  //
  // ⚠️ **This used to end "so nothing is lost: the words are on screen, with
  // their level and their place, one block down", and as of 2026-08-07 that
  // is only true after a press.** `AlertList` defaults to COLLAPSED on the
  // owner's instruction, so on a cold load the block one band down is a bar
  // reading `open alerts · N · EMERGENCY` and the templated sentences are
  // behind `show N`. The suppression still stands on reading order alone,
  // which is what it was always argued from — but the compensation is now the
  // bar plus `warning-block.tsx`, which renders the live warning verbatim in
  // the rail whatever this strip and that list are doing.
  if (openAlerts > 0) return messages;

  for (const event of history) {
    const at = parseServerTime(event.at);
    // An unparseable timestamp cannot be aged or dated, and a log row whose
    // clock is missing is a row that cannot say it is history. Drop it.
    if (at === null) continue;
    if (ageSeconds(at, now) > HISTORY_MAX_AGE_S) continue;

    messages.push({
      id: `warning:${keyFor(event)}`,
      slot: `warning:${keyFor(event)}`,
      tone: "log",
      title: event.level,
      body: "",
      level: event.level,
      place: event.place,
      at: event.at,
      replay: Boolean(event.replay),
      drill: Boolean(event.drill),
    });
  }

  return messages;
}
