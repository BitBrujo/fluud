"use client";

import { TriangleAlert } from "lucide-react";

import { Panel, PanelHeader, PanelTitle, PanelTools } from "@/components/panel";
import { ProvenanceChip } from "@/components/warning-block";
import { clockTime, parseServerTime } from "@/lib/format";
import { LEVEL_TEXT } from "@/lib/levels";
import type { Message } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * NOTICES — the service faults and the warning log, in one bounded box.
 *
 * ## ⚠️ It replaced `service-banners.tsx`, which is DELETED, not orphaned
 *
 * That component rendered up to two `<Alert>`s as a `flex-col` in normal flow
 * at the top of `/map`. Two things were wrong with it and only the second is
 * obvious:
 *
 * 1. **It sized to its contents**, so a fault arriving pushed the entire
 *    workspace down by however tall the sentence happened to be. `AlertList`
 *    underneath does the same, unbounded, one block per open alert.
 * 2. **Nothing could be dismissed.** There was no dismiss affordance anywhere
 *    in `web/src/`.
 *
 * The judgement — which messages exist, in what order — is NOT here. It is in
 * `lib/messages.ts`, pure and tested, because that is the part that fails
 * silently. This file renders what it is given.
 *
 * ## ⚠️ It sits at the FOOT of the right-hand rail, under `watch by email`
 *
 * Moved there on 2026-08-14, on the owner's instruction. It was the first child
 * of `<main>`, above the workspace, which is why its height used to be a token:
 * `--wl-notices` carried the strip plus its gap so the desktop grid and the
 * mobile map could subtract it back out. **In the rail there is nothing to
 * subtract from** — the rail scrolls — so the token is deleted and the height
 * is a literal, matching the two constants its siblings already use
 * (`min-h-[340px] shrink-0`, `h-[256px] shrink-0`).
 *
 * ⚠️ **What that move costs, stated rather than discovered.** This strip is the
 * **backstop** for the frozen-poller rule, and at the foot of a scrolling rail
 * it is off screen on desktop until the reader scrolls. Below `md` the rail is
 * `order-4`, so it lands at the very bottom of the page. **What still carries
 * the claim always-visible is `NoticeBadge` in the sticky masthead**, which
 * carries the worst fault's own title rather than a bare count — precisely
 * what it was built for. `onShowAll` still un-dismisses and no longer reveals
 * anything without a scroll.
 *
 * ## The height is a CONSTANT and that is the whole point
 *
 * ⚠️ **This panel does not grow with the number of messages.** It is
 * `h-[112px] md:h-[192px]` and the body scrolls. One message or fifty is the
 * same box. **A `min-h`, an `h-auto`, or a body that is not `overflow-y-auto`
 * all silently re-create the unbounded push this component exists to remove** —
 * and in the rail that push moves the whole column rather than the workspace.
 * None of them is visible in a test: jsdom lays nothing out and there is
 * deliberately none (`web/CLAUDE.md`).
 *
 * The arithmetic, which is the part nobody would re-derive. The two figures are
 * the old token's values with its folded-in `gap-4` taken back out, so the box
 * itself is unchanged in pixels:
 *
 *     PanelHeader          44px   (h-11, pinned — do not make it min-h)
 *     fault row         ~72px     title 17 + two body lines 38 + py-2 16
 *     log row           ~40px     one line
 *
 *     md and up   13rem − 1rem = 192px  → 148px of body
 *                                  ≈ two fault rows or three-and-a-bit log rows
 *     below md     8rem − 1rem = 112px  →  68px of body
 *
 * Below `md` it is deliberately shorter: 192px out of an 844px phone screen is
 * a lot for one panel, and at that width one fault body runs six or seven lines
 * anyway, so the row scrolls either way.
 *
 * ⚠️ **It returns `null` at zero messages** — the rule `ServiceBanners`,
 * `AlertList` and `HarborBaseline` all follow. An empty bordered strip on a
 * cold start reads as a broken box.
 *
 * ## What may not change about the rows
 *
 * - ⚠️ **The React key is `slot`, never `id`.** See `Message.slot`. Fault rows
 *   carry `role="alert"`, which announces on insertion, so keying on an id
 *   that changes by design would interrupt a screen reader every time a
 *   a host that suspends the container flapped frozen↔stopped.
 * - ⚠️ **No `aria-live` attribute anywhere in here.** `warning-block.tsx` holds
 *   the page's only one and there is a standing browser check that
 *   `querySelectorAll('[aria-live]').length === 1`. Fault rows keep
 *   `role="alert"` — implicitly assertive, and byte-identical to the behaviour
 *   `service-banners.tsx` had through shadcn's `<Alert>`.
 * - ⚠️ **No `z-` at all.** The watch and filters sheets are `max-md:z-40`, and
 *   a fault row painting over an open sheet is a notice blocking the control
 *   somebody opened to act on it.
 * - ⚠️ **A log row carries no warning text and may never be given any.** See
 *   `MessageTone` in `lib/messages.ts`.
 */
export function MessageStrip({
  messages,
  dismissed,
  onDismiss,
  onShowAll,
}: {
  messages: Message[];
  dismissed: ReadonlySet<string>;
  onDismiss: (id: string) => void;
  onShowAll: () => void;
}) {
  const visible = messages.filter((m) => !dismissed.has(m.id));
  const hidden = messages.length - visible.length;

  if (visible.length === 0) return null;

  return (
    <Panel
      aria-label="Notices"
      className={cn(
        // ⚠️ A LITERAL, and `shrink-0` beside it, on its siblings' idiom in the
        // rail. Constant at each breakpoint, never content-sized. See the
        // arithmetic above before changing either number.
        "h-[112px] shrink-0 md:h-[192px]",
      )}
    >
      <PanelHeader>
        <PanelTitle>Notices</PanelTitle>
        <PanelTools>
          <span className="num font-mono text-[10px] text-muted-foreground">
            {visible.length}
            {hidden > 0 ? ` · ${hidden} hidden` : ""}
          </span>
          {hidden > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className={cn(
                "cursor-pointer rounded-sm border border-border px-1.5 py-1",
                "font-mono text-[10px] leading-none tracking-[0.08em] text-muted-foreground uppercase",
                "transition-colors hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
              )}
            >
              Show all
            </button>
          )}
        </PanelTools>
      </PanelHeader>

      {/* ⚠️ `min-h-0` is not optional. `Panel` is `overflow-hidden` and this is
          a flex child, so without it the body takes its content height and the
          scroll never engages — the panel just clips. Same trap
          `selected-detail.tsx` and `station-list.tsx` already solve. */}
      <div className="wl-scroll min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {visible.map((message) =>
          message.tone === "fault" ? (
            <FaultRow
              key={message.slot}
              message={message}
              onDismiss={() => onDismiss(message.id)}
            />
          ) : (
            <LogRow
              key={message.slot}
              message={message}
              onDismiss={() => onDismiss(message.id)}
            />
          ),
        )}
      </div>
    </Panel>
  );
}

/**
 * A service fault. `role="alert"` is carried explicitly here rather than
 * inherited from shadcn's `<Alert>`, which is what `service-banners.tsx` used —
 * same semantics, one less component in a surface that is pinned at
 * card / badge / alert / button.
 */
function FaultRow({
  message,
  onDismiss,
}: {
  message: Message;
  onDismiss: () => void;
}) {
  return (
    <div role="alert" className="flex items-start gap-2.5 px-3 py-2">
      <TriangleAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-[var(--wl-dead)]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug font-semibold text-foreground">
          {message.title}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-pretty text-muted-foreground">
          {message.body}
          {message.code && (
            <>
              {" "}
              <code className="num">{message.code}</code>.
            </>
          )}
        </p>
      </div>
      <DismissButton label={`Dismiss: ${message.title}`} onClick={onDismiss} />
    </div>
  );
}

/**
 * A warning the rat has already spoken.
 *
 * ⚠️ **The level, the place, the clock and the provenance chips ARE the row.**
 * There is no sentence here and there may never be one: the root `CLAUDE.md`
 * forbids rendering the templated warning twice, and `warning-block.tsx` is the
 * single rendering. A row holding the words *without* these chips would read as
 * a real past flood warning when it was a drill — which is precisely why the
 * frame is what survived the cut and the words are what did not.
 */
function LogRow({
  message,
  onDismiss,
}: {
  message: Message;
  onDismiss: () => void;
}) {
  const at = message.at ? parseServerTime(message.at) : null;

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] leading-none tracking-[0.12em] uppercase",
          // On the ramp, and labelled with the word — which is what licenses
          // the colour. `LEVEL_TEXT.clear` is neutral and unreachable here: a
          // stand-down sets a mood and speaks nothing.
          LEVEL_TEXT[message.level ?? "clear"],
        )}
      >
        {message.level}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
        {message.place}
      </span>
      {message.replay && <ProvenanceChip label="Replayed" />}
      {message.drill && <ProvenanceChip label="Drill" dashed />}
      {at && (
        <span className="num shrink-0 text-[11px] text-muted-foreground">
          {clockTime(at)}
        </span>
      )}
      <DismissButton
        label={`Dismiss the ${message.level} warning at ${message.place}`}
        onClick={onDismiss}
      />
    </div>
  );
}

/**
 * The ✕, on `list-controls.tsx`'s clear-affordance idiom so the two read as one
 * mechanism. It carries a real name because the glyph alone says nothing to a
 * screen reader, and dismissal is the one thing on this surface that destroys
 * something a reader can see.
 */
function DismissButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm",
        "text-[11px] leading-none text-muted-foreground transition-colors hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
      )}
    >
      ✕
    </button>
  );
}
