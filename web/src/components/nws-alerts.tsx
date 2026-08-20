"use client";

import { TriangleAlert } from "lucide-react";

import { formatAge } from "@/lib/format";
import type { NwsStatus } from "@/lib/api-types";
import {
  nwsCheckedAgeS,
  nwsCountLabel,
  nwsFaulted,
  nwsFeed,
  nwsNote,
} from "@/lib/nws";
import { cn } from "@/lib/utils";

/**
 * NWS — what the National Weather Service is saying about the five boroughs.
 *
 * Sits above the gauge grid on the tide-and-weather tab. It is the only surface
 * on this site that renders somebody else's warnings, and almost everything
 * about it is a restraint.
 *
 * ## ⚠️ The empty state is the dangerous one, and it is the common one
 *
 * Most readers, most days, will find nothing here. *"No alerts"* printed above
 * five water-level gauges reads as **all clear**, and this site does not say
 * that. NWS products are county- and zone-scale, issued off radar rainfall
 * rate; FloodNet measures standing water at a few hundred specific corners. The
 * two disagreeing is ordinary — `poll.validate` has said so in prose since long
 * before this panel existed.
 *
 * **So the copy is not here.** Every string is `lib/nws.ts`, pure, and
 * `tests/nws.test.ts` sweeps the whole set for the sentence this page may not
 * write — over all four states and every count, rather than over the one branch
 * a reviewer would think to read. What is in this file is emphasis and layout.
 *
 * ## ⚠️ An empty list has FOUR meanings and two of them are *we do not know*
 *
 *     cold         nothing read yet in this process
 *     unreachable  the last attempt failed — what is shown is older
 *     stale        reads succeeded but stopped arriving (the poll loop)
 *     current      we asked, recently, and NWS listed nothing here
 *
 * Only `current` may say nothing is active. `nwsFeed` decides, the precedence
 * is asserted, and this component does not re-derive any of it.
 *
 * ## ⚠️ NO SEVERITY RAMP, in any colour
 *
 * NWS's severity vocabulary — *extreme · severe · moderate · minor* — and this
 * app's depth band use several of the same words for different quantities. A
 * red row here beside an amber depth pill invites reading one against the
 * other, and they share no scale whatever. **The event name is the whole of the
 * claim.** Severity renders as an attributed word, `NWS severity · severe`, in
 * muted type.
 *
 * Ordering *by* NWS's rank is fine and happens server-side — that is their
 * published scale, not one this app invented over somebody else's hazards.
 *
 * ⚠️ **The only colour this block may spend is `--wl-stale` / `--wl-dead` on the
 * feed-condition line**, which is the fault-signal exception `NoticeBadge`
 * already spends. A fault here is about the service, never about the water.
 *
 * ## ⚠️ The height is a CONSTANT, on `message-strip.tsx`'s rule
 *
 * `h-[112px] shrink-0` at every breakpoint, and the body scrolls. Zero alerts
 * or eight is the same box. **A `min-h`, an `h-auto`, or a body that is not
 * `overflow-y-auto` all re-create an unbounded push** — and here that push moves
 * the gauge grid under a reader's hand as an alert arrives on a 15s poll, which
 * is the worst possible moment for the page to move.
 *
 * ⚠️ **It does NOT return null when empty**, and that is the one place it
 * diverges from `MessageStrip`, `AlertList` and `HarborBaseline`. Those three
 * are about Fluud's own state, where absence is fairly read as nothing to say.
 * This one is about a feed a reader came to check: an empty space where the
 * weather should be is indistinguishable from a panel that failed to load, and
 * *"we looked and NWS listed nothing"* is a real answer that has to be given in
 * words. Reserving the box is what makes saying it possible.
 */
export function NwsAlerts({
  nws,
  nowMs,
  className,
}: {
  nws: NwsStatus | null | undefined;
  /* The panel's own tick, passed down rather than subscribed to here. Same rule
     as `ReadingAge` in a long list: this re-renders on its parent's clock. */
  nowMs: number;
  className?: string;
}) {
  const feed = nwsFeed(nws, nowMs);
  const alerts = nws?.alerts ?? [];
  const elsewhere = nws?.elsewhere ?? 0;
  const ageS = nwsCheckedAgeS(nws, nowMs);
  const faulted = nwsFaulted(feed);
  const note = nwsNote(feed, alerts.length, elsewhere, ageS);

  return (
    <section
      aria-label="National Weather Service alerts"
      className={cn(
        /* ⚠️ A LITERAL and `shrink-0`, never a min-h. See the docblock. */
        "flex h-[112px] shrink-0 flex-col rounded-md border border-border",
        "bg-[var(--wl-panel)]",
        className,
      )}
    >
      {/* The rule line. Names the source and the scope, because both are
          narrower than a reader would assume: one agency, five boroughs. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
          NWS · New York City
        </span>
        <span
          className={cn(
            "num font-mono text-[10px] tracking-[0.08em] uppercase",
            faulted ? "text-[var(--wl-stale)]" : "text-muted-foreground",
          )}
        >
          {nwsCountLabel(feed, alerts.length)}
        </span>
      </div>

      {/* ⚠️ `min-h-0` is not optional — flex child of a fixed-height column, so
          without it the body takes its content height and this clips instead of
          scrolling. Same trap `message-strip.tsx` solves one panel over. */}
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto">
        {/* ⚠️ When there ARE alerts and the feed is not current, the condition
            line renders ABOVE them rather than instead of them. The last thing
            NWS said is still the best thing on screen; what changes is whether
            the page vouches for it being current. */}
        {(alerts.length === 0 || faulted) && (
          <p
            className={cn(
              "px-2.5 py-2 text-[11px] leading-snug text-pretty",
              faulted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {faulted && (
              <TriangleAlert
                aria-hidden
                className="mr-1.5 mb-0.5 inline size-3.5 shrink-0 text-[var(--wl-stale)]"
              />
            )}
            {note}
          </p>
        )}

        {alerts.length > 0 && (
          <ul className="divide-y divide-border">
            {alerts.map((a, i) => (
              <li
                /* No stable id on the wire — `nws_id` is deliberately not sent,
                   since nothing joins on it. Event plus area is stable enough
                   for a list that re-renders on a 15s poll, and the index
                   breaks the tie when NWS issues two of one product. */
                key={`${a.event}·${a.area_desc ?? ""}·${i}`}
                className="px-2.5 py-2"
              >
                <p className="text-[12px] leading-snug font-semibold text-foreground">
                  {a.event}
                </p>
                {a.headline && (
                  <p className="mt-0.5 text-[11px] leading-snug text-pretty text-muted-foreground">
                    {a.headline}
                  </p>
                )}
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {/* ⚠️ Severity is ATTRIBUTED and takes no colour. The word
                      belongs to NWS and their scale is not this app's. */}
                  {a.severity && <>NWS severity · {a.severity.toLowerCase()}</>}
                  {a.severity && a.expires && " · "}
                  {a.expires && <Expiry at={a.expires} nowMs={nowMs} />}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * When NWS says this product lapses.
 *
 * ⚠️ **An expiry is not a forecast and is not an all-clear.** It is when the
 * office intends to re-issue or let the product drop, so the wording is
 * *expires in 40m* and never *ends* or *clear after*. A lapsed alert also does
 * not mean the water went down — nothing on this page ever says that.
 */
function Expiry({ at, nowMs }: { at: string; nowMs: number }) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  const s = (t - nowMs) / 1000;
  if (s <= 0) return <>past its expiry, per NWS</>;
  return <>expires in {formatAge(s).replace(/ ago$/, "")}</>;
}
