"use client";

/**
 * The watch wizard — pick instruments, set how to be notified, give an address.
 *
 * ## ⚠️ The wizard DOES NOT RUN for a reader who already has a watch (2026-08-17)
 *
 * Two faces sit in front of it, on the owner's instruction, and the second is
 * the point: **there is no reason to walk somebody through pick → alerts →
 * email → submit for a subscription that already exists.**
 *
 * - **`checking`** — one `/api/watch/mine` round trip, said out loud. The wizard
 *   is not painted first and then swapped; a face replaced under a reader who
 *   had started reading it is the page moving on its own.
 * - **`have`** — `ManageFace`, the same component `/watch/` mounts, with the
 *   reader's real subscription in it.
 *
 * ⚠️ **It was not a redundant flow, it was a flow that did NOTHING.**
 * `api.watch_subscribe` deliberately does not call `set_subscriptions` on the
 * existing-row branch — that function is delete-then-insert and would silently
 * replace a list this panel cannot see — so a subscriber who walked the whole
 * wizard again landed on a receipt whose own chips are labelled `asked for`
 * precisely because nothing had been stored. The fix is to ask first.
 *
 * ⚠️ **`/api/watch/mine` answers about ONE address and takes no parameter** —
 * the caller's own, provider-verified. That is what keeps the *"is this address
 * on Fluud"* oracle out of it. `watching: false` covers no session (including
 * `REQUIRE_AUTH=false`), an unverified address and a verified address with no
 * confirmed row, and all three mean the wizard runs unchanged.
 *
 * ⚠️ **`watch a second address` is the escape and it is not optional.** Without
 * it the manage face is a dead end for anybody subscribing a second mailbox and
 * the wizard is unreachable for the whole session.
 *
 * ⚠️ **`addable` is supplied here and withheld on `/watch/`.** Adding an
 * instrument needs the gated `/api/sensors`, which this page has and that one
 * cannot get — so the one thing `/watch/` says in words it cannot do is exactly
 * what this face adds.
 *
 * ⚠️ **The import runs ONE WAY.** This file imports `ManageFace`;
 * `watch-manage.tsx` may never import from this file. Both take their shared
 * parts from `watch-parts.tsx`, which exists so the two cannot cycle.
 *
 * ## ⚠️ The confirmed receipt CLOSES ITSELF (2026-08-17)
 *
 * On the fast path the row is created, the watch is live and there is no next
 * step, so the `sent` face counts down and `closeFlow` ends the wizard — which
 * re-asks `/api/watch/mine`, so the reader lands on their own watch rather than
 * back on step one. The fourth step in the chrome bar reads `✓ confirmed`
 * rather than `confirm`, because `current` on a step nobody has to take says
 * *you are here* about a place they have already been.
 *
 * ⚠️ **`sentFaceAutoCloses` is the gate and `mailDelivers === false` is why it
 * is a function.** On that branch the link on the face is the only copy of a
 * non-expiring bearer credential the reader will ever get, and a timer that
 * wiped it would destroy something nothing can re-issue. `keep this open`
 * cancels outright — WCAG 2.2.1, and a face holding a credential somebody may
 * be part-way through copying.
 *
 * ## ⚠️ It is FOUR wizard faces since 2026-08-16, and the fifth moved rather than died
 *
 * `pick → alerts → address → sent`. **`manage` is gone from this file** as a
 * `Mode` and lives in `watch-manage.tsx` — mounted by
 * `src/app/watch/page.tsx`, and, since 2026-08-17, by the `have` face above.
 *
 * The reason is a production outage rather than a tidy-up. The mail links
 * pointed at `/map/?confirm=…` and `/map/?watch=…`; `/map` is wrapped in
 * `RequireSession`, so a subscriber with no Fluud account was redirected to
 * sign-in before this panel — and therefore the effect that read the token —
 * ever mounted. **Every confirmation link and every unsubscribe link in every
 * email was unreachable**, which is exactly what `api._AUTH_EXEMPT` exempts
 * `/api/watch/confirm` and `/api/watch/unsubscribe` to prevent.
 *
 * With the links repointed, `setMode("manage")`'s single call site went with
 * the effect, so the face had no way in at all. It was deleted rather than left
 * dormant: two copies of one surface with only one reachable is the shape this
 * file's own `step-button.tsx` note argues against.
 *
 * ⚠️ **That deletion is why the `have` face MOUNTS `ManageFace` rather than
 * drawing its own.** The reason `manage` was cut here was two copies of one
 * surface, and building a second manage face in this panel a day later would
 * have been that exact mistake with the components the other way round.
 *
 * ## The wizard (2026-08-06, notification settings)
 *
 * The `alerts` face holds the three notification settings — the trigger
 * (`min_level`), the frequency (every / first), and the timeline (quiet hours)
 * — plus per-instrument overrides of the first two. All of it is preference,
 * none of it is a reading, so the no-reading rules below are untouched.
 *
 * ⚠️ **The face states the EMERGENCY exemption beside the controls.** The
 * server will send an emergency whatever these settings say
 * (`notify.allowed`, asserted by `check_notify.py`); a settings surface that
 * implied "emergency" could be muted would promise a silence this system
 * refuses to sell.
 *
 * ⚠️ **Cameras were picks in a second namespace and are GONE from this panel.**
 * They rode as `camera_ids` against a combined cap; the camera watch is dormant
 * and both write routes refuse `camera_ids` with a 400. One list, one cap.
 *
 * ## Where it sits, and why it is not at the foot of the rail
 *
 * ⚠️ **This panel goes ABOVE `WarningBlock`, never below it.** The warning gave
 * up its `lh` height reserve when it moved to the foot of the rail, and that is
 * safe only because nothing sits underneath it. Putting a panel below re-creates
 * exactly the jump the reserve existed to prevent: a warning arriving over SSE
 * grows the block and shoves the email field down while somebody is typing in
 * it. The rail order is `SelectedDetail → HarborBaseline → WatchPanel →
 * WarningBlock` and that ordering is load-bearing.
 *
 * ## The faces, from the `Map flows` design (turn 1)
 *
 * The 2026-08-06 rebuild:
 *
 * - **pick** keeps the chips, the field and both buttons, and states the alert-permitted rule
 *   *before* the server's 400: a pick FloodNet does not permit renders as a
 *   dashed amber chip with a sentence saying it will not be included, and the
 *   submit reads `watch the other {n}`. `permittedPicks` was already the filter;
 *   now it is also the copy.
 * - **sent** replaces the form rather than appending a paragraph, and freezes
 *   `sentTo` and `sentPicks` at submit so the face cannot drift if the reader
 *   keeps picking. The chips on it are locked — a span, not a control.
 *   ⚠️ **It has a third door as of 2026-08-06 — `stop waiting`** — because the
 *   other two both walk further into the flow and the face was otherwise
 *   terminal. It is a page state only: this browser never holds the confirm
 *   token, so nothing here can withdraw the request, and the three sentences
 *   under the row say so rather than letting a bare `cancel` imply it.
 *
 * ⚠️ **The send-failure branch keeps the server's message.** The design draws
 * one fixed sentence; rendering only that would swallow a 400 that names a real
 * reason (a non-permitted id, an over-long list), which is the one thing
 * the alert-permitted rule's "a 400 naming the reason, never a silent drop" is about. The
 * fixed sentence leads and the `ApiError` message follows on a muted line.
 *
 * ## What it may not do
 *
 * **No readings, no depths, no ages, no severity colours.** Everything here is
 * a fact about what the reader asked for, never about the water — so selection
 * is `--wl-select` like every other chip on this page, and there is no green
 * "you're covered" state and no confirmation tick. A watch surface that drew
 * live state would be a second place a number can appear without its
 * plausibility beside it.
 *
 * ⚠️ **`alert_permitted` and `silent` look like state and are not.** Both moved
 * to `watch-manage.tsx` with the face that renders them; the reasoning lives
 * there, and the rule they are under is this one.
 *
 * **The honesty line is not a disclosure.** `note` comes from the server —
 * `agent._TEMPLATES["watch_note"]`, the same reviewed sentence the confirmation
 * email carries — and it is always-visible text above the submit button, never
 * a `<details>` and never a `title`. It renders on every face, and shortening it
 * anywhere would make this component the second author of reviewed copy.
 * `HonestyLine` is in `watch-parts.tsx` so `ManageFace` renders the identical
 * sentence — including on the delete confirm, where the design trims it.
 *
 * ## Reused rather than reinvented
 *
 * `Chip` and `Group` are imported from `list-controls` rather than copied —
 * `step-button.tsx`'s precedent: two surfaces with the same control have to
 * behave identically or they read as two mechanisms. The mutation shape
 * (`useTransition`, `try/catch ApiError`, `pending` as `disabled`, an error
 * `<p>` in `--wl-emergency`) is `DrillLauncher`'s, which is this app's only
 * other async mutation.
 */

import { useEffect, useState, useTransition } from "react";

import { Panel, PanelHeader, PanelTitle, PanelTools } from "@/components/panel";
import { Chip, Group } from "@/components/list-controls";
import {
  BUTTON,
  HonestyLine,
  PRIMARY,
  QUIET,
  SettingsFields,
} from "@/components/watch-parts";
import { ManageFace } from "@/components/watch-manage";
import {
  ApiError,
  getMyWatch,
  resendWatchLink,
  subscribeWatch,
} from "@/lib/api";
import type {
  SensorStatus,
  WatchMineResponse,
  WatchOverride,
  WatchSettings,
} from "@/lib/api-types";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SETTINGS,
  SENT_AUTO_CLOSE_S,
  overridesFor,
  quietHoursIncomplete,
  sentFaceAutoCloses,
  sentFaceClosingNote,
  sentFaceHeading,
  sentFaceNote,
  watchManageHref,
} from "@/lib/watch-settings";

/**
 * Which surface the panel is showing.
 *
 * `sent` is reached only by submitting, and it holds a frozen copy of what was
 * submitted. `alerts` and `address` are the wizard's two later input faces;
 * both keep the pick intact behind them, so `back` never costs anybody their
 * set.
 *
 * ⚠️ **There was a fifth, `manage`, and it is DELETED as of 2026-08-16.** It
 * was reached only by arriving at `/map` with `?confirm=` or `?watch=` in the
 * URL, and that was its single entry point — no button anywhere opened it. The
 * mail links point at `/watch/` now, so nothing could ever have put the panel
 * into that state again, and ~350 lines of it would have been a second copy of
 * one surface with only the other copy reachable.
 *
 * **It lives in `watch-manage.tsx` and is mounted by `src/app/watch/page.tsx`.**
 * Why it had to move at all: `/map` is wrapped in `RequireSession`, so a
 * subscriber with no Fluud account was redirected to sign-in before this panel
 * mounted — every confirm link and every unsubscribe link in every email was
 * unreachable in production.
 */
type Mode = "pick" | "alerts" | "address" | "sent";

type StepState = "done" | "current" | "reachable" | "notyet";

/**
 * The three-step line in the chrome bar: pick → address → confirm.
 *
 * Each step is a column — a 9px mono label over a 2px rule — and the rule is as
 * wide as its own word, which `items-stretch` in a column does for free.
 *
 * ⚠️ **Deviation 8, recorded here rather than discovered.** The rules are
 * `--wl-stale` as the design draws them, and amber is also this panel's
 * staleness colour: the silence and permission notes on the manage face use it.
 * So inside this one panel amber means both *where you are* and *this
 * instrument is quiet*. It breaks no rule — nothing here sits beside a reading —
 * but it is a legibility collision and this comment is the record of it.
 */
function StepLine({ steps }: { steps: { word: string; state: StepState }[] }) {
  return (
    <span className="flex items-center gap-2">
      {steps.map(({ word, state }) => (
        <span key={word} className="flex flex-col items-stretch gap-[3px]">
          <span
            className={cn(
              "font-mono text-[9px] leading-none tracking-[0.1em] whitespace-nowrap uppercase",
              state === "current"
                ? "text-foreground"
                : state === "notyet"
                  ? "text-muted-foreground/55"
                  : "text-muted-foreground",
            )}
          >
            {state === "done" ? `✓ ${word}` : word}
          </span>
          <span
            aria-hidden
            className={cn(
              "h-[2px] rounded-[1px]",
              state === "done" && "bg-[var(--wl-stale)]",
              state === "current" &&
                "bg-[var(--wl-stale)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--wl-stale)_22%,transparent)]",
              state === "reachable" && "bg-[var(--wl-stale)]/40",
              state === "notyet" && "bg-border",
            )}
          />
        </span>
      ))}
    </span>
  );
}

export function WatchPanel({
  sensors,
  watching,
  onToggle,
  onClear,
  maxSensors,
  mailDelivers,
  sessionEmail,
  onClose,
  className,
}: {
  /** Every deployment, for resolving ids to names. May be empty before the
   *  gated `/api/sensors` fetch has run — ids still render. */
  sensors: SensorStatus[];
  /** The picked set, owned by the page so the list and the map agree with it. */
  watching: string[];
  onToggle: (sensorId: string) => void;
  onClear: () => void;
  maxSensors: number;
  /**
   * `/healthz`'s `mail_delivers` — whether this deployment has a transport that
   * could reach a mailbox at all. ⚠️ **Read as `=== false`**, never `!`: it is
   * `undefined` when the server did not say (an older instance during a rolling
   * deploy), and absence is not a verdict. See `api-types.ts`.
   *
   * It gates one sentence on the confirm face and nothing else. It is not a
   * reading, it never varies with the water, and it takes no severity colour —
   * this panel's no-reading rules are untouched by it.
   */
  mailDelivers?: boolean;
  /**
   * The signed-in reader's address, from `useSession().data?.user?.email` in
   * `map/page.tsx`. Absent when signed out, before the session settles, or on a
   * build with no auth configured.
   *
   * ⚠️ **It decides what is DRAWN and NOTHING else.** Whether the confirmation
   * step is skipped is the server's decision, taken against an `email_verified`
   * claim on a JWT it verified against Neon's JWKS, and reported back in
   * `status`. **This component makes no claim that the address is verified and
   * must not** — `SessionState` in `lib/auth-client.ts` deliberately does not
   * expose `emailVerified`, because a client that read it would be making a
   * security claim, and the moment the two disagreed the UI would either promise
   * a shortcut the server refuses or hide one it would grant.
   *
   * ⚠️ **This panel imports nothing from `@/lib/auth-client`.** The page does
   * the `useSession()` read and passes the string down, which keeps the auth SDK
   * out of this module's import graph and keeps the panel mountable in a
   * design-system preview.
   *
   * It is not a reading, it never varies with the water, and it takes no colour.
   */
  sessionEmail?: string | null;
  /**
   * Called when the wizard closes itself after a confirmed subscribe.
   *
   * ⚠️ **The panel resets its own faces and this prop is the part it cannot
   * do.** Below `md` the wizard is a fixed bottom sheet whose open flag lives in
   * `map/page.tsx`; above it the panel is permanent chrome in the rail and there
   * is nothing to close, which is why this is optional and why the reset happens
   * either way. A design-system preview and `/watch/` both mount without it.
   *
   * ⚠️ **It must not switch the rail tab.** Moving a reader off the tab they are
   * on, on a timer, with no press, is the page moving under them — the same
   * refusal `city-map.tsx` makes about a layer switch not re-running the
   * recentre. Closing a sheet the reader opened is undoing their own action;
   * changing a tab they chose is not.
   */
  onClose?: () => void;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("pick");
  const [email, setEmail] = useState("");
  /*
   * ⚠️ The reader asked to type an address instead of using their account's.
   * Sticky for the session of this panel: a reader who came through a recovery
   * door, or who is subscribing a different mailbox, must not have the field
   * taken away again on the next render.
   */
  const [useTyped, setUseTyped] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * ⚠️ Frozen at submit, so the sent face cannot drift if the reader keeps
   * picking. `sentPicks` is what was actually sent — the permitted set — not
   * what was picked.
   */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentPicks, setSentPicks] = useState<string[]>([]);
  /*
   * What the server answered, frozen with the rest of the face.
   *
   * ⚠️ **`pending` is the resting value and the safe one.** Every branch that
   * has not heard `confirmed` from the server renders the confirmation copy,
   * which is a true thing to say about an address that has not been proved.
   */
  const [sentStatus, setSentStatus] = useState<"pending" | "confirmed">(
    "pending",
  );
  /*
   * ⚠️ **A bearer credential, in component state and nowhere else.** Never
   * stored, never in a `router.push` (which would put it in the history stack),
   * never logged. It leaves this component as one `<a href>` and is dropped when
   * the face is. See `WatchSubscribeResponse.manage_token`.
   */
  const [manageToken, setManageToken] = useState<string | null>(null);
  /* Non-null means the last submit failed. `server` carries the ApiError's own
     message, which must not be swallowed — see the docblock. */
  const [sendFailed, setSendFailed] = useState<{ server: string | null } | null>(
    null,
  );
  /*
   * Which recovery door the reader came through — `verify` for *I signed up and
   * the email never arrived*, `link` for *I am subscribed and lost my settings
   * link*. It carries the pick face's two buttons through to the email face so
   * the submit there names the thing they pressed, rather than renaming their
   * errand halfway down the flow.
   *
   * ⚠️ **It is a LABEL, and it deliberately does not reach the server.**
   * `/api/watch/resend` decides from the row: an unconfirmed address gets its
   * confirmation re-queued, a confirmed one gets its manage link. So the reader
   * cannot press the wrong door and get nothing — whichever they choose, the
   * address is sent the message it is actually owed.
   *
   * That is the forgiving trade rather than the literal one, and it is taken on
   * purpose. Sending the intent as a request field would make each button do
   * only its own half, which reads as more honest and is worse: a reader who
   * guessed wrong about their own state gets silence, and silence is exactly
   * what this route exists to rescue somebody from. The labels stay true for
   * the reader each one addresses, and neither promises which bytes arrive —
   * `watch_note` is what the sent face shows, and it never claims delivery.
   */
  const [recoverAs, setRecoverAs] = useState<"verify" | "link">("link");
  /*
   * ⚠️ **The reader pressed `keep this open`, so the wizard stops closing
   * itself.** WCAG 2.2.1 wants a way to turn a time limit off, and this face has
   * a real reason of its own: the manage token is a bearer credential the reader
   * may be part-way through copying. Sticky for the life of the face — a cancel
   * that expired would be no cancel at all — and cleared on the next submit,
   * because that is a new receipt rather than the one they asked to keep.
   */
  const [keepOpen, setKeepOpen] = useState(false);
  /* Seconds left before the wizard closes itself, or `null` when no timer is
     running. See the effect below. */
  const [closingIn, setClosingIn] = useState<number | null>(null);
  /*
   * ⚠️ **What `/api/watch/mine` said about the signed-in reader's OWN proven
   * address.** `null` means not answered yet, which is a third state and not a
   * `false` — see the `checking` face.
   *
   * ⚠️ **Read `watching`, never the presence of `manage_token`.** The two are
   * written together on the server and keying off the token would be one field
   * rename from treating an unverified reader as subscribed.
   */
  const [mine, setMine] = useState<WatchMineResponse | null>(null);
  const [mineChecked, setMineChecked] = useState(false);
  /*
   * ⚠️ **The reader has a watch and asked to set up a SECOND address.** This is
   * the *"unless they want to confirm another email"* half, and without it the
   * manage face would be a dead end for anybody subscribing a second mailbox.
   * It is sticky for the life of the panel, and `closeFlow` clears it — that is
   * the wizard finishing, at which point the manage face is the right resting
   * state again.
   */
  const [another, setAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  /*
   * The wizard's settings draft. `touched` decides whether the subscribe POST
   * carries a `settings` object at all — an untouched wizard sends none, so
   * the server's defaults stay the one statement of what "default" means.
   * Overrides are keyed by instrument id across both namespaces (a DOT UUID
   * and a FloodNet deployment id cannot collide).
   */
  const [draft, setDraft] = useState<WatchSettings>(DEFAULT_SETTINGS);
  const [draftTouched, setDraftTouched] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, WatchOverride>>({});
  /* Inline form complaint on the alerts face — about the FORM, never about
     the water. Cleared on every change. */
  const [formNote, setFormNote] = useState<string | null>(null);

  const nameOf = (id: string) =>
    sensors.find((s) => s.sensor_id === id)?.name ?? id;

  /*
   * ⚠️ Invariant 9, stated before the server's 400 rather than after it. A pick
   * whose deployment FloodNet does not permit to alarm is *shown as refused*
   * and left out of the submit — the reader is told which and why, and the
   * server's own gate stays the authority for anything this page has not
   * loaded yet.
   */
  const refused = watching.filter((id) => {
    const s = sensors.find((x) => x.sensor_id === id);
    return s ? !s.alert_permitted : false;
  });
  const permittedPicks = watching.filter((id) => !refused.includes(id));
  /* ⚠️ Sensors only. The cap was COMBINED over two id namespaces until the
     camera watch went dormant; the server still counts one list against
     `watch_max_sensors` and there is only one list to count. */
  const pickedCount = watching.length;
  const atCap = pickedCount >= maxSensors;

  /*
   * ⚠️ **The address face has TWO states and this is the whole of the switch.**
   * A signed-in reader is shown their account's address rather than an empty
   * box, because they are already behind the gate `/api/watch/subscribe` sits
   * on — asking them to retype an address this app already holds was the step
   * that made the confirmation email redundant in the first place.
   *
   * ⚠️ **`useTyped` is the escape and it is not decoration.** The wizard can
   * subscribe any address, and double opt-in is the only thing standing between
   * that and subscribing a stranger. A reader who takes this door lands on the
   * unchanged flow, confirmation and all.
   */
  const usingSession = !useTyped && !!sessionEmail;
  const address = usingSession ? sessionEmail!.trim() : email.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const asked = [...permittedPicks];
        const r = await subscribeWatch(
          address,
          asked,
          draftTouched ? draft : null,
          overridesFor(overrides, asked),
        );
        setNote(r.note);
        setSendFailed(null);
        setSentTo(address);
        setSentPicks([...asked]);
        /* ⚠️ Frozen with the address and the picks, for the same reason: the
           sent face must not change what it claims because a later render saw
           a different session or a different field. */
        setSentStatus(r.status);
        setManageToken(r.manage_token ?? null);
        setEmail("");
        /* A new receipt, so a cancel taken against the previous one does not
           carry over. Frozen with the rest of the face for that reason. */
        setKeepOpen(false);
        setMode("sent");
      } catch (e) {
        setSendFailed({ server: e instanceof ApiError ? e.message : null });
      }
    });
  }

  /**
   * Ask for the manage link again.
   *
   * ⚠️ **Shares the email field with subscribe rather than growing a second
   * one.** Two inputs asking for the same thing four lines apart is how a reader
   * types their address into the wrong one; the field is the address and the two
   * buttons are the two things that can be done with it. It is deliberately NOT
   * gated on `watching.length` — somebody recovering a lost link has no reason to
   * have picked anything, and requiring a pick would make the recovery path
   * depend on the sign-up path.
   *
   * ⚠️ The copy says what was **asked for**, never what was found. The server
   * answers identically whether or not that address is here, so "we sent it"
   * would be a claim this component cannot support — and one that would leak
   * whether an address is subscribed if it were ever made conditional.
   */
  function resend(address: string) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const r = await resendWatchLink(address);
        setNote(r.note);
        /* ⚠️ **This covers BOTH branches and it is deliberately vague about
           which one fired.** The route sends a confirmed address its manage
           link and an unconfirmed one its own confirmation again, so naming
           either outcome would tell the reader which state that address is in
           — the exact thing the identical server response exists to withhold.
           It says what was asked for, as this function's docblock requires,
           and the two clauses after it are unchanged and still true of both:
           nothing about the watch moves, and no address can be added here.

           ⚠️ **The first clause is a PROMISE and it is gated on the server
           being able to keep it, as of 2026-08-16.** It was not, and
           `MAIL_TRANSPORT=log` is the shipped default — which renders every
           message into a log file and marks the outbox row `skipped`. So
           pressing `verify email` on a fresh deployment told a reader mail was
           coming when nothing had left the process, and left them with no way
           to tell that from a message that was filtered. The `sent` face had
           gated its equivalent sentence since 2026-08-06; this path was the
           fork.

           ⚠️ **`=== false`, never `!`** — `undefined` means an older instance
           did not say, and absence is not a verdict. It reports CAPABILITY,
           never delivery: a configured relay that bounces still reads `true`.

           ⚠️ **Both branches keep the two clauses**, because both are true
           either way and neither may name which server branch fired. */
        setDone(
          (mailDelivers === false
            ? "No email was sent. This deployment has no mail transport " +
              "configured, so nothing can reach that address. "
            : "If that address is on Fluud, the email it needs is on the way. ") +
            "Nothing else about it has changed, and no address can be added " +
            "to Fluud this way.",
        );
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "the request failed to send",
        );
      }
    });
  }



  /**
   * Ask what the signed-in reader's own address already has.
   *
   * ⚠️ **This is what stops the wizard re-asking.** `watch_subscribe` does not
   * apply the picks to an existing row — `set_subscriptions` is
   * delete-then-insert and would silently replace a list this panel cannot see —
   * so a subscriber walking pick → alerts → email → submit again ended on a
   * receipt that changed nothing at all. Knowing before the first step is the
   * whole feature.
   *
   * ⚠️ **Gated on `sessionEmail`, so nothing fetches for a signed-out reader, a
   * design-system preview, or `/watch/`.** With no session the route can only
   * answer `false`, and asking anyway would be a guaranteed 401 rendered
   * through `lib/messages.ts` as *cannot reach the service*.
   *
   * ⚠️ **A failure is `not watching`, never a fault.** The wizard is the
   * fallback and it works; a banner here would be an error about the instrument
   * shown to somebody whose watch simply could not be looked up. `mineChecked`
   * is set on every exit so the `checking` face cannot hang.
   *
   * ⚠️ **Once per settled session, deliberately.** It is not polled: it carries
   * no reading, no depth and no age, so there is nothing on it that can go
   * stale in a way a reader would be misled by. Every mutation from here goes
   * through `ManageFace`, which reseeds from the server's own response.
   */
  useEffect(() => {
    if (!sessionEmail || mineChecked) return;
    let live = true;
    void (async () => {
      try {
        const r = await getMyWatch();
        if (live) setMine(r);
      } catch {
        if (live) setMine({ watching: false });
      } finally {
        if (live) setMineChecked(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [sessionEmail, mineChecked]);

  /**
   * Leave the wizard, taking the receipt with it.
   *
   * ⚠️ **This is `stop waiting`'s reset for the OTHER branch, and it drops one
   * more thing.** `manageToken` is a bearer credential held in component state
   * and nowhere else; the face that renders it is going, so it goes with the
   * face. `sentStatus` returns to `pending`, which is the resting value and the
   * safe one — every branch that has not heard `confirmed` from the server
   * renders the confirmation copy.
   *
   * ⚠️ **The PICKS are NOT cleared, on `stop waiting`'s own rule.** They live in
   * `page.tsx`, they are the reader's, and here they are also true: those are the
   * instruments now being watched, and the list's monitor rings and the map draw
   * from the same array. Clearing them would make the page say nothing is
   * monitored one second after the reader subscribed.
   *
   * ⚠️ **It re-asks `/api/watch/mine` rather than returning to `pick`**, by
   * clearing `mineChecked`. Landing a reader who has just subscribed back on
   * step one of the flow they finished is the same defect this whole change is
   * about; what they get instead is their own watch, editable. `another` is
   * cleared for the same reason — the wizard is over, so the manage face is the
   * resting state again.
   */
  function closeFlow() {
    setClosingIn(null);
    setSentTo(null);
    setSentPicks([]);
    setSentStatus("pending");
    setManageToken(null);
    setSendFailed(null);
    setDone(null);
    setError(null);
    setEmail("");
    setAnother(false);
    setMineChecked(false);
    setMode("pick");
    onClose?.();
  }

  /*
   * ⚠️ **The confirmed receipt closes the wizard by itself.** On that path the
   * row is created, the watch is live and there is no next step, so a terminal
   * face left up is the flow claiming an unfinished step it does not have.
   *
   * ⚠️ **`sentFaceAutoCloses` is the gate and it is a function in `src/lib/` for
   * a reason**: `mailDelivers === false` means the link on this face is the only
   * copy the reader will ever get, and a timer that wiped it would destroy a
   * credential nothing can re-issue. `tests/watch-settings.test.ts` pins that
   * against `sentFaceNote`'s own fault branch, so the two cannot drift apart.
   *
   * ⚠️ **The dependency is the derived BOOLEAN, never `mailDelivers` itself.**
   * That prop settles from `undefined` to `true` on the first `/api/healthz`,
   * and depending on it directly would restart the countdown under a reader
   * mid-read for a change that does not alter the answer.
   *
   * One `setTimeout` per second rather than an interval, so the cleanup cannot
   * leave a tick queued against a face that has already gone.
   */
  const autoCloses =
    mode === "sent" && !keepOpen && sentFaceAutoCloses(sentStatus, mailDelivers);

  useEffect(() => {
    if (!autoCloses) {
      setClosingIn(null);
      return;
    }
    if (closingIn === null) {
      setClosingIn(SENT_AUTO_CLOSE_S);
      return;
    }
    /* ⚠️ The last tick CLOSES rather than decrementing, so the copy never reads
       `in 0s` — a countdown that reaches zero and then sits there for a frame is
       the one number on this face that could look stuck. */
    const id = window.setTimeout(
      closingIn <= 1 ? closeFlow : () => setClosingIn(closingIn - 1),
      1000,
    );
    return () => window.clearTimeout(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- `closeFlow` is
       re-created every render and reads only setters plus `onClose`; listing it
       would restart the countdown on every poll of the parent. */
  }, [autoCloses, closingIn]);

  /*
   * ⚠️ **What is on screen, and it is NOT always `mode`.** Two faces sit in
   * front of the wizard for a signed-in reader:
   *
   * - `checking`, while `/api/watch/mine` is in flight. The wizard is not drawn
   *   first and then swapped — a reader who started reading step one and had it
   *   replaced under them has been shown the page moving on its own, and the
   *   request is one round trip on a page that is already behind a session.
   * - `have`, when that address already has a confirmed watch. **This is the
   *   whole point**: there is no reason to walk somebody through pick → alerts →
   *   email → submit for a row the server will not change, and
   *   `watch_subscribe` deliberately does not apply picks to an existing
   *   subscription.
   *
   * ⚠️ **`another` is the escape and it is not decoration** — a reader may want
   * to watch a second mailbox, and the manage face has nothing to say about an
   * address that is not the one it loaded.
   *
   * ⚠️ **`checking` is false with no `sessionEmail`**, so a signed-out reader,
   * `/watch/` and a design-system preview all get the wizard immediately and
   * this face can never hang.
   */
  const checkingMine = !!sessionEmail && !mineChecked;
  const haveWatch =
    !another &&
    mine?.watching === true &&
    !!mine.manage_token &&
    !!mine.subscription;
  const face: "checking" | "have" | Mode = checkingMine
    ? "checking"
    : haveWatch
      ? "have"
      : mode;

  /* pick → email → confirm. `sent` is the only state in which `confirm` is
     current — confirmation itself happens off this page, in the inbox. Faces
     behind the current one are done; faces ahead are reachable once anything
     is picked.

     ⚠️ **The third step reads `email` and the `Mode` value is still
     `"address"`** — renamed as a LABEL on 2026-08-06, on the owner's
     instruction. The two are deliberately not the same edit: `"address"` is
     also the query-parameter-free internal state name used by `order`,
     `stateFor` and every `setMode` call, and renaming it would touch the
     wizard's control flow to change a word. What a reader is being asked for
     on that face is an email address, so `email` is the more accurate label —
     and on a site where "the address you searched" means a STREET address four
     components away, the shorter word is also the unambiguous one. */
  const steps: { word: string; state: StepState }[] = (() => {
    if (mode === "sent") {
      return [
        { word: `pick ${sentPicks.length}/${maxSensors}`, state: "done" as StepState },
        { word: "alerts", state: "done" as StepState },
        { word: "email", state: "done" as StepState },
        /*
         * ⚠️ **The fourth step reads `✓ confirmed` on the fast path, and it is
         * the flow-level statement that there is nothing left to do.** `current`
         * on a step nobody has to take is the line saying *you are here* about a
         * place the reader has already been through — the same defect as a
         * button naming a step that is not on the line. It is `done` only where
         * the SERVER said `confirmed`; `pending` is the resting value, so every
         * branch that has not heard it keeps the unfinished step.
         *
         * ⚠️ **The word changes with the state and that is deliberate.**
         * `confirm` is an instruction and `confirmed` is a fact, and the tick in
         * front of it comes from `StepLine`'s `done` branch rather than from
         * this string.
         */
        sentStatus === "confirmed"
          ? { word: "confirmed", state: "done" as StepState }
          : { word: "confirm", state: "current" as StepState },
      ];
    }
    const order: Mode[] = ["pick", "alerts", "address"];
    const at = order.indexOf(mode);
    const later: StepState = pickedCount > 0 ? "reachable" : "notyet";
    const stateFor = (i: number): StepState =>
      i < at ? "done" : i === at ? "current" : later;
    return [
      { word: `pick ${pickedCount}/${maxSensors}`, state: stateFor(0) },
      { word: "alerts", state: stateFor(1) },
      { word: "email", state: stateFor(2) },
      { word: "confirm", state: "notyet" as StepState },
    ];
  })();

  return (
    <Panel className={cn("shrink-0", className)}>
      <PanelHeader>
        <PanelTitle>watch by email</PanelTitle>
        {/* One branch per state — the right side of the chrome bar is the
            panel's own status line. See the table in the plan doc. */}
        <PanelTools>
          {/* ⚠️ A `manage` branch printed `sub.email_masked` here and went with
              that face on 2026-08-16, and it is BACK on 2026-08-17 — because
              `ManageFace` is mounted here again for a reader who already has a
              watch. `src/app/watch/page.tsx` prints the identical field in its
              own chrome bar, which is why `ManageFace` still supplies no `Panel`
              of its own: the two callers frame it and neither nests one.
              ⚠️ **MASKED, from the server.** The panel holds `sessionEmail` in
              full and printing that here instead would put a second, unmasked
              spelling of one address in one bar. */}
          {face === "have" && mine?.subscription && (
            <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--wl-cyan)] uppercase">
              {mine.subscription.email_masked}
            </span>
          )}
          {face === "address" && sendFailed !== null && (
            <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--wl-emergency)] uppercase">
              not sent
            </span>
          )}
          {face === "pick" && atCap && (
            <span className="num font-mono text-[9.5px] tracking-[0.1em] text-[var(--wl-stale)] uppercase">
              {pickedCount}/{maxSensors} · full
            </span>
          )}
          {/* ⚠️ No step line on `checking` or `have`. A four-step progress line
              over a face that is not a step reads as a flow somebody is
              part-way through, which is the exact impression this change
              exists to remove. */}
          {((face === "pick" && !atCap) ||
            face === "alerts" ||
            (face === "address" && sendFailed === null) ||
            face === "sent") && <StepLine steps={steps} />}
        </PanelTools>
      </PanelHeader>

      <div className="flex min-w-0 flex-col gap-3 px-3 py-3">
        {/*
         * ⚠️ **One request, said out loud rather than left as a gap.** An empty
         * panel for the length of a round trip is indistinguishable from one
         * that failed to load — `message-strip.tsx`'s rule, and the reason
         * `/watch/` prints *"Opening that link…"* for the same wait.
         *
         * ⚠️ **It reports on the LOOKUP and says nothing about the water**, on
         * `geosearch.ts`'s rule for a different dependency: name which thing is
         * happening, so a slow answer here cannot read as the instrument being
         * slow.
         */}
        {face === "checking" && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Checking whether this address already has a watch…
          </p>
        )}

        {/*
         * ⚠️ **The reader already did this, so the wizard does not run.** This is
         * `ManageFace` — the same component `/watch/` mounts — rather than a
         * second surface built for this panel, on `step-button.tsx`'s precedent:
         * two surfaces with one job have to behave identically or they read as
         * two mechanisms. **The import runs one way only.** `watch-manage.tsx`
         * may never import from this file; that is the cycle `watch-parts.tsx`
         * exists to prevent.
         *
         * ⚠️ **`addable` is supplied HERE and withheld on `/watch/`, and the
         * difference is the session.** Adding an instrument needs the full
         * registry from the gated `/api/sensors`, which this page already has
         * and that one cannot get. So the one thing `/watch/` says it cannot do
         * is exactly what this face adds — which is what makes landing a
         * subscriber here better than landing them on step one.
         *
         * ⚠️ **Only the PERMITTED picks are offered.** A pick FloodNet does not
         * permit would be refused by the PUT with a 400, and offering a control
         * the server would refuse reads as a promise — `sensor-row.tsx`'s rule,
         * and the same filter the wizard's own submit uses.
         */}
        {face === "have" && mine?.subscription && mine.manage_token && (
          <>
            <ManageFace
              token={mine.manage_token}
              sub={mine.subscription}
              onSub={(next) =>
                setMine((prev) =>
                  prev ? { ...prev, subscription: next } : prev,
                )
              }
              /* The record is gone, so the panel has nothing to manage and the
                 wizard is the correct resting state again. `done` carries the
                 statement, because a face simply vanishing would read as
                 something failing rather than as the deletion they asked for. */
              onDeleted={() => {
                setMine({ watching: false });
                setDone(
                  "Removed. Your address and everything queued for it are " +
                    "gone. Nothing further will be sent.",
                );
              }}
              note={mine.subscription.note}
              addable={{
                ids: permittedPicks.filter(
                  (id) =>
                    !mine.subscription!.sensors.some(
                      (s) => s.sensor_id === id,
                    ),
                ),
                nameOf,
              }}
            />
            {/*
             * ⚠️ **The *"unless they want to confirm another email"* door.**
             * Without it this face is a dead end for anybody subscribing a
             * second mailbox, and the wizard would be unreachable for the whole
             * session. It forces the typed field, because a second address is
             * by definition not the one this browser is signed in with — the
             * same reason the pick face's two recovery doors force it.
             *
             * ⚠️ **It says what it opens.** *"a different address"* alone would
             * read as switching this watch to another mailbox, which is not
             * what happens and is not something any route here does.
             */}
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => {
                  setAnother(true);
                  setUseTyped(true);
                  setMode("pick");
                }}
                className={QUIET}
              >
                watch a second address
              </button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                This one stays exactly as it is. A second address confirms from
                its own email.
              </p>
            </div>
          </>
        )}

        {face === "pick" && (
          <div className="flex flex-col gap-3">
            {/*
             * The picked set, as removable chips. `ActiveFilterLine`'s pattern:
             * what is on always says so and pressing it takes it off, so the
             * reader can never be subscribed to something they cannot see.
             * Sensors and cameras are two labelled groups — two id namespaces,
             * two lists on the wire, two groups on the face.
             */}
            {pickedCount === 0 ? (
              <Group label="instruments">
                <div className="rounded-md border border-dashed border-border px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {/* ⚠️ The bold run names the button on the instrument
                        panel VERBATIM. It was `watch` until that control was
                        renamed on 2026-08-06; an instruction naming a button
                        that is not on screen is worse than no instruction.

                        ⚠️ **And it now wears that button's REST colour**
                        (`--wl-cyan`, owner's instruction) so the instruction
                        and its target match by eye as well as by wording —
                        which is the whole job of this sentence. Safe on the
                        same terms as the button: this panel renders no reading,
                        no depth, no age and no severity, so a colour here can
                        encode nothing about the water. **If the button's rest
                        state ever changes colour, this run changes with it** —
                        an instruction pointing at a colour that is not on
                        screen fails the same way a wrong name does. */}
                    None picked. Choose a sensor or a camera in the list, then
                    press{" "}
                    <b className="font-semibold text-[var(--wl-cyan)]">
                      Start Monitor
                    </b>{" "}
                    on its panel.
                  </p>
                </div>
              </Group>
            ) : (
              <>
                {watching.length > 0 && (
                  <Group label={`sensors · ${watching.length}`}>
                    <div className="flex flex-wrap items-center gap-1">
                      {watching.map((id) =>
                        refused.includes(id) ? (
                          /* A refused pick is dashed amber and unfilled — still
                             removable, never silently dropped. The sentence
                             below the chips says why. */
                          <button
                            key={id}
                            type="button"
                            onClick={() => onToggle(id)}
                            title="FloodNet does not permit an alarm from this deployment — it will not be included"
                            className="shrink-0 cursor-pointer rounded-full border border-dashed border-[var(--wl-stale)] px-2.5 py-[5px] text-[10.5px] leading-none whitespace-nowrap text-[var(--wl-stale)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                          >
                            {nameOf(id)}
                          </button>
                        ) : (
                          <Chip
                            key={id}
                            on
                            onClick={() => onToggle(id)}
                            title="Stop watching this instrument"
                          >
                            {nameOf(id)}
                          </Chip>
                        ),
                      )}
                    </div>
                  </Group>
                )}
                <button
                  type="button"
                  onClick={onClear}
                  className="cursor-pointer self-start font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                >
                  clear all
                </button>
              </>
            )}

            {atCap && (
              <p className="text-[11px] leading-relaxed text-[var(--wl-stale)]">
                {maxSensors} is the most one address can watch. Drop one above
                to add another.
              </p>
            )}

            {refused.length > 0 && (
              <p className="text-[11px] leading-relaxed text-[var(--wl-stale)]">
                FloodNet does not permit an alarm from{" "}
                {refused.map(nameOf).join(", ")}, so it will not be included.
                You can leave it picked; it will join if FloodNet marks it
                healthy.
              </p>
            )}

            <HonestyLine note={note} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                onClick={() => setMode("alerts")}
                disabled={
                  pending ||
                  permittedPicks.length === 0
                }
                className={cn(PRIMARY, "self-center")}
              >
                next · alerts
              </button>
              {/* Recovery must not depend on picking anything — the address
                  face holds the field and the resend button, and these doors
                  are always open.

                  ⚠️ **`BUTTON`, not `QUIET`** — owner's instruction, 2026-08-06.
                  These are the one `QUIET` call site that is not a *lesser*
                  version of the action beside it: every other one abandons,
                  returns or switches address, while these open the other real
                  doors out of this face. As bare 9.5px text next to a filled
                  submit it read as a footnote, and a reader who already has a
                  subscription is the reader least likely to find it. Outline
                  against filled is the two-rank pairing; a filled one here
                  would compete with the submit on a face whose whole job is
                  picking instruments.

                  ⚠️ **TWO doors as of 2026-08-06, owner's instruction, and the
                  single one they replaced was BOTH confusing and incomplete.**
                  It read *"already subscribed? email me my link"*, which asks a
                  first-time reader a question they cannot answer and offers
                  them a link they do not have — and once `/api/watch/resend`
                  grew its unconfirmed branch that label stopped describing half
                  of what the route does. Somebody who signed up and never got
                  the confirmation is not "already subscribed" in their own
                  understanding, and they have no link. Naming the two
                  situations separately is what lets each reader recognise
                  their own.

                  ⚠️ **Both press the same action, and that is deliberate** —
                  see `recoverAs`. The server picks from the row, so a reader
                  who chooses the wrong door still gets the message they are
                  owed. Neither label may be reworded into a promise about
                  which email arrives. */}
              {/* ⚠️ **Their own row, `w-full`, rather than two more children of
                  the row above** — `stop waiting`'s rule on the confirm face,
                  and it was measured here rather than assumed. Left in one
                  wrapping row of three at 1440 the break landed *between* the
                  two doors: `verify email` sat beside the filled submit and
                  `resend link` was orphaned underneath, which reads as one
                  action paired with the submit and one stray. The split is
                  structural now, so it holds at every rail width: the submit
                  carries on with the sign-up, and these two are for a reader
                  who already started. */}
              {/* ⚠️ Both doors force the TYPED field, because a recovery
                  errand is by definition about a mailbox that may not be the
                  one this browser is signed in with — and the recovery button
                  itself is withheld while the session address is in use. Without
                  this the two doors would land on a face with neither an input
                  nor the control they name. */}
              <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecoverAs("verify");
                    setUseTyped(true);
                    setMode("address");
                  }}
                  className={cn(BUTTON, "self-center")}
                >
                  verify email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoverAs("link");
                    setUseTyped(true);
                    setMode("address");
                  }}
                  className={cn(BUTTON, "self-center")}
                >
                  resend link
                </button>
              </div>
            </div>
          </div>
        )}

        {face === "alerts" && (
          <div className="flex flex-col gap-3">
            <SettingsFields
              value={draft}
              onChange={(next) => {
                setDraft(next);
                setDraftTouched(true);
                setFormNote(null);
              }}
              instruments={[
                ...permittedPicks.map((id) => ({
                  id,
                  name: nameOf(id),
                  kind: "sensor" as const,
                })),
              ]}
              overrides={overrides}
              onOverridesChange={(next) => {
                setOverrides(next);
                setDraftTouched(true);
                setFormNote(null);
              }}
            />

            {formNote && (
              <p className="text-[11px] leading-relaxed text-[var(--wl-emergency)]">
                {formNote}
              </p>
            )}

            <HonestyLine note={note} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                onClick={() => {
                  if (quietHoursIncomplete(draft)) {
                    setFormNote("Quiet hours need both a start and an end.");
                    return;
                  }
                  setMode("address");
                }}
                disabled={pending}
                className={cn(PRIMARY, "self-center")}
              >
                {/* Names the step it advances to, verbatim — see the `steps`
                    note above. The `Mode` value stays `"address"`. */}
                next · email
              </button>
              <button
                type="button"
                onClick={() => setMode("pick")}
                className={cn(QUIET, "self-center")}
              >
                ‹ back
              </button>
            </div>
          </div>
        )}

        {face === "address" && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Group label="email">
              {usingSession ? (
                <>
                  {/*
                   * ⚠️ **A `<p>`, never a disabled `<input>`.** A greyed-out
                   * field reads as a control that has failed rather than as a
                   * fact, and this is a fact: it is the address the reader
                   * signed in with. Same border and ground as the input it
                   * replaces so the face does not lurch between the two states.
                   */}
                  <p className="w-full rounded-[5px] border border-border bg-[var(--wl-panel)] px-2 py-1.5 text-[12px] break-all text-foreground">
                    {sessionEmail}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    You are signed in with this address, so there is no
                    confirmation step.
                  </p>
                </>
              ) : (
                /*
                 * A native `<input type="email" required>` in a real `<form>`.
                 * Not a shadcn `Input` — `web/CLAUDE.md` pins that surface at
                 * card / badge / alert / button and none may be added. The form
                 * element buys Enter-to-submit and the browser's own validation
                 * for nothing.
                 */
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-[5px] border border-border bg-[var(--wl-panel)] px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                />
              )}
            </Group>

            <HonestyLine note={note} />

            {sendFailed && (
              <div className="border-l-2 border-[var(--wl-emergency)] pl-2.5">
                <p className="text-[11px] leading-relaxed text-[var(--wl-emergency)]">
                  That did not send, so no watch was created and nothing will
                  arrive at that address. Your picks are still here.
                </p>
                {/* ⚠️ The server's own words, kept. A 400 here can name a real
                    reason — a non-permitted id, an over-long list — and the
                    fixed sentence alone would swallow it (the alert-permitted rule). */}
                {sendFailed.server && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {sendFailed.server}
                  </p>
                )}
              </div>
            )}

            {/*
             * Two actions on one field. `submit` is the primary and keeps the
             * border; recovery is a quieter `type="button"` beside it so that
             * Enter in the field still means "watch these" — a native form
             * submits on its first submit button, and making recovery the
             * second one is what keeps that unambiguous.
             */}
            {/* Both buttons re-centre in this row: the constants carry
                `self-start` for the column faces, which here pinned the quiet
                text button to the top of the taller bordered one and the two
                read as misaligned. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="submit"
                disabled={
                  pending || permittedPicks.length === 0 || address === ""
                }
                className={cn(PRIMARY, "self-center")}
              >
                {pending
                  ? "sending…"
                  : sendFailed
                    ? "try again"
                    : refused.length > 0
                      ? `watch the other ${permittedPicks.length}`
                      : pickedCount > 0
                        ? `watch these ${permittedPicks.length}`
                        : "watch these"}
              </button>
              {/* Lights up cyan once the field holds a plausible address
                  (owner's instruction, 2026-08-06) — the recovery path stops
                  being invisible exactly when it becomes usable. `--wl-cyan`
                  is poster paint on no scale; the state it encodes is a fact
                  about the reader's own typing, never about the water.

                  ⚠️ **It names the door the reader came through** (`recoverAs`),
                  so an errand does not get renamed halfway down the flow — the
                  same obligation the `next · email` button carries about the
                  step line, and the one `Start Monitor` carries about the
                  copy that names it. One action either way; the server decides
                  what that address is owed.

                  ⚠️ **WITHHELD while the session address is in use**, on
                  `sensor-row.tsx`'s rule: a reader with a live session has no
                  lost link to recover, and pressing this would mail them the
                  credential the next press is about to hand them. It comes back
                  the moment they take the typed door, which is where a recovery
                  errand actually lives. */}
              {!usingSession && (
                <button
                  type="button"
                  onClick={() => resend(email.trim())}
                  disabled={pending || email.trim() === ""}
                  title={
                    recoverAs === "verify"
                      ? "Signed up but never got the email? Have it sent again."
                      : "Already subscribed? Have the link to your settings mailed to you again."
                  }
                  className={cn(
                    QUIET,
                    "self-center",
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
                      "text-[var(--wl-cyan)] hover:text-[var(--wl-cyan)]",
                  )}
                >
                  {recoverAs === "verify" ? "verify email" : "resend link"}
                </button>
              )}
              {/* The two doors between the address states. Only ever one is on
                  screen, and neither is a submit — Enter in the field still
                  means "watch these". */}
              {sessionEmail &&
                (usingSession ? (
                  <button
                    type="button"
                    onClick={() => setUseTyped(true)}
                    className={cn(QUIET, "self-center")}
                  >
                    use a different address
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUseTyped(false)}
                    className={cn(QUIET, "self-center")}
                  >
                    use my account address
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setMode("alerts")}
                className={cn(QUIET, "self-center")}
              >
                ‹ back
              </button>
            </div>
          </form>
        )}

        {face === "sent" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-[var(--wl-panel)] px-3 py-2.5">
              <p className="font-mono text-[10px] tracking-[0.1em] break-all text-foreground uppercase">
                {sentFaceHeading(sentStatus, sentTo ?? "")}
              </p>
              {/*
                * ⚠️ **The default sentence is a promise, so it is gated on the
                * server being able to keep it.** `MAIL_TRANSPORT=log` is the
                * shipped default and it renders every message into a log file
                * and marks the outbox row `skipped` — nothing leaves the
                * process. Printing *"Check that address"* against that sends
                * somebody to an inbox that will never receive anything, and
                * leaves them with no way to tell it from a mail that was
                * filtered. `mail_delivers` comes off `/healthz` and is the
                * server's own `mail.transport_delivers()`.
                *
                * ⚠️ **`=== false`, never `!`** — `undefined` means an older
                * instance did not say (rolling deploy), and absence is not a
                * verdict. `plausible === false`'s rule, one payload over.
                *
                * ⚠️ **The amber branch may not claim more than capability.**
                * The transport being configured is not delivery: `sent` means
                * handed to a relay, and nothing here knows about spam folders
                * or bounces. So the false branch states a fact about this
                * deployment and the true branch keeps the wording it always
                * had, which never promised arrival either.
                *
                * The frozen picks and the honesty line are unchanged — this
                * swaps one paragraph.
                *
                * ⚠️ **FOUR strings since 2026-08-16, not two, and the copy
                * moved to `lib/watch-settings.ts`.** A signed-in reader
                * watching their own provider-verified address is subscribed
                * outright, so *"Check that address. Nothing is sent until you
                * confirm"* became false for a whole branch — it would send
                * somebody to watch a mailbox for a message that is not a step.
                * The strings are in `src/lib/` because that is the only
                * directory `web/tests/` can reach, and
                * `tests/watch-settings.test.ts` sweeps the grid for the
                * sentences the `confirmed` branch may not contain.
                *
                * ⚠️ **Both `confirmed` strings still take the `mailDelivers`
                * gate**, because both mention mail. What a missing transport
                * costs on that branch is the durable copy of the settings link,
                * never the subscription — so `fault` is about the deployment
                * and the watch is live either way.
                */}
              {(() => {
                const n = sentFaceNote(sentStatus, mailDelivers);
                return (
                  <p
                    className={cn(
                      "mt-1.5 text-[11px] leading-relaxed",
                      n.fault
                        ? "text-[var(--wl-stale)]"
                        : "text-muted-foreground",
                    )}
                  >
                    {n.text}
                  </p>
                );
              })()}
            </div>

            {/* Locked — what was asked for, frozen at submit. Plain spans, so
                the face cannot drift while the reader keeps picking. */}
            <Group label="asked for">
              <div className="flex flex-wrap items-center gap-1">
                {sentPicks.map((id) => (
                  <span
                    key={id}
                    className="shrink-0 rounded-full border border-border px-2.5 py-[5px] text-[10.5px] leading-none whitespace-nowrap text-muted-foreground"
                  >
                    {nameOf(id)}
                  </span>
                ))}
              </div>
            </Group>

            <HonestyLine note={note} />

            {/*
             * ⚠️ **`send it again` may NOT render on the confirmed branch.**
             * `/api/watch/resend` would mail a confirmed address its manage
             * link — the credential the reader is already holding two lines
             * down — so the button would do nothing they need and its own copy
             * would be about a message that is not owed. What replaces it is
             * the link itself.
             */}
            <div className="flex flex-wrap items-center gap-2">
              {sentStatus === "confirmed" ? (
                manageToken && (
                  /* ⚠️ An `<a href>` built by `watchManageHref`, never a
                     `router.push`: a push puts a bearer credential in the
                     history stack. One shape of this URL in the app, and it is
                     the shape the email carries. */
                  <a href={watchManageHref(manageToken)} className={BUTTON}>
                    open your watch
                  </a>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => sentTo && resend(sentTo)}
                  disabled={pending}
                  className={BUTTON}
                >
                  {pending ? "sending…" : "send it again"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode("pick");
                  setUseTyped(true);
                  setEmail(sentTo ?? "");
                }}
                className={QUIET}
              >
                use a different address
              </button>
            </div>

            {/*
             * ⚠️ **The way OUT of the wizard, added 2026-08-06.** This face was
             * terminal: both doors above it walk further into the flow — one
             * re-sends, one re-addresses — so a reader who had changed their
             * mind had nothing to press. `waiting on {sentTo}` is the state and
             * `stop waiting` names it verbatim, on the same rule that makes the
             * empty-pick copy name `Start Monitor`.
             *
             * ⚠️ **It is a PAGE state and the copy may not imply more.** This
             * cannot withdraw the request: the confirm token reaches the inbox
             * and never this browser, so there is nothing here to present and
             * no route that would take it. That is exactly what rules out a
             * bare `cancel` — it would read as a withdrawal this panel cannot
             * perform. The three sentences under the button are therefore
             * required, and all three are true of the code: an unconfirmed row
             * is never sent anything but its own confirmation (`schema.sql`),
             * the link stays live until it is used, and `db.prune_unconfirmed`
             * deletes the address. ⚠️ **The window is deliberately unnamed** —
             * a number here would be a seventh figure duplicated across the two
             * languages with nothing in `parity.test.ts` holding it.
             *
             * ⚠️ **The picks are NOT cleared** — they live in `page.tsx` and
             * they are the reader's. Leaving the confirm face is one action;
             * throwing away a set they built is a second one nobody asked for,
             * and `clear all` on the pick face is where that lives. What this
             * DOES drop is the typed address, which is the one thing on this
             * face that belongs to a person.
             *
             * ⚠️ **Its own block rather than a third button in the row above**,
             * and the split holds at every width: those two carry on with the
             * sign-up and this one leaves it. In one wrapping row of three the
             * break lands wherever the rail width puts it, so the exit reads as
             * an orphaned continuation of the pair. Here it sits directly on
             * the sentences that qualify it.
             *
             * ⚠️ **PENDING ONLY, since 2026-08-16.** All four of its sentences
             * are about an unconfirmed row: there is nothing to stop waiting
             * for once the watch is live, no confirmation link to still work,
             * and `db.prune_unconfirmed` cannot reach a confirmed address. The
             * confirmed branch's way out of the wizard is `open your watch`
             * above — a real surface with a real stop-and-delete on it, which
             * is more than this button ever was.
             */}
            {/*
             * ⚠️ **The closing line, and it is `stop waiting`'s opposite
             * number.** That block is pending-only and this is confirmed-only,
             * so exactly one of the two ever renders and the face keeps one
             * bordered footer either way.
             *
             * ⚠️ **The countdown is NOT in a live region.** `role="status"` here
             * would announce a new number every second, which is a screen reader
             * reading a clock over the receipt above it. The sentence is
             * readable and the button is in the tab order, which is what a
             * reader who needs the face to stay actually reaches for.
             *
             * ⚠️ **`keep this open` is what makes the timer defensible**, not a
             * courtesy. WCAG 2.2.1 wants a time limit to be turnable off, and
             * this face additionally holds a bearer credential somebody may be
             * part-way through copying. It cancels outright rather than
             * extending — a second countdown after a cancel is the same
             * interruption arriving twice.
             *
             * ⚠️ **Muted, and specifically not a fault colour.** This is the
             * reader's own flow ending on schedule. `--wl-stale` here would put
             * the deployment-fault vocabulary on an ordinary success, which is
             * how that vocabulary stops meaning anything — `HiddenNote`'s call,
             * one component over.
             */}
            {closingIn !== null && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3">
                <p className="num text-[11px] leading-relaxed text-muted-foreground">
                  {sentFaceClosingNote(closingIn)}
                </p>
                <button
                  type="button"
                  onClick={() => setKeepOpen(true)}
                  className={QUIET}
                >
                  keep this open
                </button>
              </div>
            )}

            {sentStatus === "pending" && (
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSentTo(null);
                    setSentPicks([]);
                    setEmail("");
                    setDone(null);
                    setError(null);
                    setMode("pick");
                  }}
                  className={QUIET}
                >
                  stop waiting
                </button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Stop waiting clears this panel. The confirmation link still
                  works. An address that never confirms is deleted.
                </p>
              </div>
            )}
          </div>
        )}


        {/*
         * ⚠️ Both of these say what happened to the REQUEST. Neither says
         * anything about conditions, and a failure here must never read as
         * calm — "the request failed" is a statement about this page.
         */}
        {done && (
          <p
            className="text-[11px] leading-relaxed text-muted-foreground"
            role="status"
          >
            {done}
          </p>
        )}
        {error && (
          <p className="text-[11px] leading-relaxed text-[var(--wl-emergency)]">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
