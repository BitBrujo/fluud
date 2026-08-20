"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FluudMark } from "@/components/fluud-mark";
import { ModeBadge } from "@/components/mode-badge";
import { Spray } from "@/components/spray";
import type { CameraStatus } from "@/lib/api-types";
import {
  authConfigured,
  signOut as endSession,
  useSession,
} from "@/lib/auth-client";
import { ageSeconds, formatAge, parseServerTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import type { Message } from "@/lib/messages";
import { freshnessOf } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * The instrument's masthead — **one line**, following the landing design's map
 * screen.
 *
 * ## ⚠️ This used to be 233px and carry the whole warning. It no longer does.
 *
 * Rewritten on 2026-08-05. Until then this file was three columns — identity,
 * the warning card with its `lh` line reserve, and a card holding `ModeBadge`
 * over the alert rat — and a long section of `web/src/components/CLAUDE.md` is
 * about the arithmetic that kept it from moving when a warning arrived.
 *
 * **The warning was not deleted. It moved to `components/warning-block.tsx`**,
 * at the foot of the workspace's right-hand rail, and every rule came with it:
 * rendered exactly once, verbatim, one live region, provenance chips beside the
 * words, the place, the clock, the ramp starting at watch, and the rat as the
 * drill trigger. Read that file before changing anything about it — including
 * the one thing the move dropped on purpose, which is the height reserve.
 *
 * What is left here is what a bar at the top of an instrument is for: **what
 * this is, whether the data is real, and whether the loop is running.**
 *
 * ⚠️ **The freshness summary is not decoration — it is the frozen-poller rule in the
 * chrome.** A frozen poller serves stale readings while every card looks
 * perfectly healthy, so the age of the newest reading belongs somewhere a
 * reader passes without looking for it. `FreshnessLine` at the top of the
 * instrument list is still the primary signal and is unchanged; this is a
 * second, coarser statement of the same fact in the one place that is always
 * on screen.
 *
 * ⚠️ **The wordmark is the only way off this page**, so it is a real `<Link>`
 * with a real focus ring. There is deliberately no nav: the landing page has
 * one because it is a document you read through, and this is an instrument
 * somebody opened to look at water.
 *
 * ⚠️ **That link is doing MORE since 2026-08-16**, because `SiteFooter` came
 * off this page in the same change. It was the four route links and the
 * prototype disclaimer; both are on `/`, which is a landing page again, so the
 * wordmark is now the whole of the route out. **Do not make it decoration.**
 *
 * ## ⚠️ The right-hand cluster gained a SIGN-OUT, and the masthead is still one line
 *
 * `SessionMenu`, 2026-08-16, on the owner's instruction. There had never been a
 * sign-out anywhere in this app — `/auth/sign-out/` exists and is generated and
 * nothing linked it — so a reader could enter and never leave.
 *
 * ⚠️ **The address is `max-lg:hidden` and the button is not.** This header has
 * to stay ONE LINE at 390 and at 1440: `FreshnessSummary` below is already
 * `max-md:hidden` for that reason, and `map/page.tsx` carries a hard-coded
 * `sticky top-[49px]` that a two-line masthead puts the mobile search bar
 * behind. **Re-measure that offset at 390 if anything in this bar changes.**
 */
export function SiteHeader({
  mode,
  cameras,
  messages,
  dismissed,
  onShowAll,
}: {
  mode: string | null;
  /** The watched cameras, for the reading-age summary. */
  cameras: CameraStatus[];
  /** Everything the NOTICES strip could show, dismissed or not. */
  messages: Message[];
  dismissed: ReadonlySet<string>;
  onShowAll: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border">
      {/*
        ❌ ⚠️ **`PaintRule` was the first child here and is REMOVED from the
        instrument**, on the owner's instruction, 2026-08-15. The four-colour
        band is still mounted by `/about`, `/terms` and every `/auth` view —
        this takes it off `/map` alone, which is the second page to lose it
        after `/` was stripped to the sign-in door.

        ⚠️ **The rule it carried travels with the component and is unchanged**:
        those bands are decoration, they take no `alt` and no label, and the
        fourth is LIME rather than the design's green because a full-width green
        band above the wordmark reads as "everything is fine" across a room.
        **If it ever comes back here, it comes back lime.**

        ⚠️ **It was NOT load-bearing for the masthead's height** — it is a thin
        band above the flat panel ground, so removing it shortens the header by
        its own height and nothing else. `map/page.tsx`'s `sticky top-[53px]` on
        the mobile search bar is measured against this element and **is owed a
        re-measure**; so is the `5rem` the three columns subtract.
      */}
      {/*
        ⚠️ **Flat `--wl-panel`, and the brick that was here is not coming
        back.** The argument for the texture was that the masthead is the one
        thing a reader sees on both the instrument and the landing page, so the
        two would read as one site. That page is a sign-in screen with no
        chrome at all now — no nav, no paint rule, no footer — so the masthead
        renders on `/map`, `/about`, `/terms` and the auth views and never
        beside a brick it has to match.

        What the flat ground is for: the masthead reads as chrome, on the same
        step below `--card` every `PanelHeader` under it takes. It is the one
        token that says "this is the frame, not the content".

        ⚠️ **This is a SWAP and may never become a removal.** The header is
        `sticky`, so an absent background lets the workspace scroll under the
        wordmark and the freshness line.

        ⚠️ **`.wl-brick` stays in `globals.css`.** `about-sections.tsx` and
        `terms-sections.tsx` still mount it for their document mastheads, and
        those two pages are documents rather than instruments.
      */}
      <div className="bg-[var(--wl-panel)]">
        {/* ⚠️ **No `max-w`, matching the workspace.** It was
            `mx-auto max-w-[1600px]`, which agreed with `<main>` until that cap
            came off on 2026-08-15. Left capped, the wordmark would sit indented
            on a wide screen while the list it labels ran to the page edge — the
            masthead's padding and the workspace's are the same two values
            precisely so the wordmark lines up with the list's left border. */}
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          {/* ⚠️ The left cluster matches `SiteNav`'s — mark, wordmark at
              22px, `ModeBadge` — on the owner's instruction (2026-08-06): the
              masthead is the one thing a reader sees on every page, and two
              sizes of the same wordmark read as two sites. What stays
              map-only is the right side, the freshness summary. */}
          <div className="flex min-w-0 items-center gap-3">
            <FluudMark />
            <Link
              href="/"
              title="Fluud — what this is"
              className="min-w-0 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {/* The face is fetched and the paint is local, so a blocked font
                  kit leaves this heavy system type still wearing the filter.
                  See `components/spray.tsx`. */}
              <Spray className="text-[22px]">Fluud</Spray>
            </Link>
            <ModeBadge mode={mode} />
            <NoticeBadge
              messages={messages}
              dismissed={dismissed}
              onShowAll={onShowAll}
            />
          </div>

          {/* ⚠️ **ONE `ml-auto`, on the group.** It was on `FreshnessSummary`'s
              own `<p>`; with a second right-hand child carrying its own, flexbox
              splits the free space between the two auto margins and the
              freshness line lands in the middle of the bar. The group takes the
              margin and the two children sit together at the end. */}
          <div className="ml-auto flex min-w-0 items-center gap-4">
            <FreshnessSummary cameras={cameras} />
            <SessionMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * What is left of a dismissed notice.
 *
 * ## ⚠️ This is what pays for faults being dismissable, and it is not optional
 *
 * Invariant 12 names the service banners as its backstop — *"A frozen poller
 * must be visible"* — and until 2026-08-07 they could not be dismissed, so the
 * claim was on screen for as long as it was true. Rows in `MessageStrip` carry
 * a `✕` now, **on the owner's instruction**, which means a reader can take
 * *"The poll loop has stopped. Everything below is the last data collected and
 * is not being updated."* off the page.
 *
 * So this badge **carries the worst fault's own title**, not a bare count. A
 * count is a claim that something is wrong; the title is the claim about
 * *what*, and that is the half the frozen-poller rule is actually about. **Do not
 * shorten this to a number**, and do not let it render only when something is
 * hidden — the point is that the words survive dismissal.
 *
 * ## ⚠️ It is doing MORE work since 2026-08-14, because the strip left the top
 *
 * `MessageStrip` was the first thing under this masthead. It is at the **foot
 * of the right-hand rail** now, on the owner's instruction, so on desktop it is
 * off screen until the reader scrolls the rail and below `md` it is the bottom
 * of the page. **This badge is the only always-visible statement that a service
 * fault exists**, which is what the `title` below names.
 *
 * ⚠️ `onShowAll` still un-dismisses every row, and pressing it no longer
 * reveals anything without a scroll. That is the cost of the move, recorded
 * rather than discovered. **The badge is now load-bearing in a way it was not
 * when it was a summary of something visible three inches below it.**
 *
 * ⚠️ **The title is `max-sm:hidden` and the COUNT is not**, because the
 * masthead must stay one line: `FreshnessSummary` below is already
 * `max-md:hidden` for exactly that reason, and `map/page.tsx`'s mobile search
 * bar has a hard-coded `sticky top-[53px]` that a two-line masthead puts the
 * bar behind. Below `sm` a fully-dismissed fault is therefore a count only, and
 * the frozen-poller rule falls back to `FreshnessLine` and the per-card ages — the same
 * fallback the freshness summary already relies on. **Re-measure the masthead
 * at 390 if this string changes.**
 *
 * ⚠️ **Amber and red only, never green, and never the level ramp.**
 * `web/src/components/CLAUDE.md` records that nothing in the masthead carries a
 * level colour; this is the third exception after `UrgentMarker` and
 * `ModeBadge`, and it is admitted on the same terms as `FreshnessSummary`'s
 * dot, which already spends `--wl-stale` / `--wl-dead` here. It is a **fault**
 * signal: it must not take `LEVEL_EDGE` or `LEVEL_TEXT` even when the log
 * holds an emergency, because that would put a severity colour beside the
 * wordmark for a warning that has already finished.
 */
function NoticeBadge({
  messages,
  dismissed,
  onShowAll,
}: {
  messages: Message[];
  dismissed: ReadonlySet<string>;
  onShowAll: () => void;
}) {
  if (messages.length === 0) return null;

  const hidden = messages.filter((m) => dismissed.has(m.id)).length;
  // `buildMessages` is worst-first, so the first fault is the worst one.
  const fault = messages.find((m) => m.tone === "fault");
  const noun = messages.length === 1 ? "notice" : "notices";

  return (
    <button
      type="button"
      onClick={onShowAll}
      title={
        hidden > 0
          ? "Show every notice again"
          : "Notices — at the foot of the right-hand column"
      }
      className={cn(
        "flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border px-1.5 py-1",
        "font-mono text-[10px] leading-none tracking-[0.08em] uppercase transition-colors",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
        fault
          ? "border-[var(--wl-dead)] text-[var(--wl-dead)]"
          : "border-border text-muted-foreground",
      )}
    >
      <span aria-hidden>⚠</span>
      {fault && (
        <span className="max-w-[30ch] truncate normal-case max-sm:hidden">
          {fault.title}
        </span>
      )}
      <span className="num shrink-0">
        {messages.length} {noun}
        {hidden > 0 ? ` · ${hidden} hidden` : ""}
      </span>
    </button>
  );
}

/**
 * "newest reading 8s ago · 27 of 27 reporting".
 *
 * ⚠️ **Never green, at any freshness.** This sits beside the wordmark and the
 * provenance pill, which is the corner where a reassuring colour reads as
 * "conditions are fine" no matter what it is actually measuring — the same call
 * as `freshness-line.tsx`'s dot and as `ModeBadge` being outlined rather than a
 * filled green slab. Healthy is muted; the colours are amber and red, and they
 * only ever mean something has stopped.
 *
 * It renders nothing before the first payload rather than an empty strip, which
 * on a cold start would read as a broken box.
 */
function FreshnessSummary({ cameras }: { cameras: CameraStatus[] }) {
  const now = useNow(1000);

  if (cameras.length === 0) return null;

  const ages = cameras
    .map((c) => parseServerTime(c.observed_at))
    .filter((d): d is Date => d !== null)
    .map((d) => ageSeconds(d, now));

  if (ages.length === 0) return null;

  const newest = Math.min(...ages);
  const fresh = ages.filter((a) => freshnessOf(a) === "fresh").length;
  const state = freshnessOf(newest);

  return (
    /* ⚠️ `max-md:hidden` keeps the masthead ONE LINE on phones. Measured at
       390: this line is 295px wide against 358 available, so it wrapped the
       header to two lines — under which the mobile search bar's sticky offset
       pinned the bar behind the masthead. Invariant 12 keeps its primary
       signal below `md`: `FreshnessLine` at the top of the list sheet, plus
       every card's own age.

       ⚠️ **The `ml-auto` moved to the group wrapper on 2026-08-16** when
       `SessionMenu` joined this end of the bar. Two auto margins split the free
       space between them; one on the group keeps both children at the end. */
    <p className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground max-md:hidden">
      <span
        aria-hidden
        className={
          state === "fresh"
            ? "size-1.5 shrink-0 rounded-full bg-muted-foreground"
            : state === "stale"
              ? "size-1.5 shrink-0 rounded-full bg-[var(--wl-stale)]"
              : "size-1.5 shrink-0 rounded-full bg-[var(--wl-dead)]"
        }
      />
      <span
        className={
          state === "fresh"
            ? undefined
            : state === "stale"
              ? "text-[var(--wl-stale)]"
              : "text-[var(--wl-dead)]"
        }
      >
        newest reading {formatAge(newest)}
      </span>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span className="num">
        {fresh} of {cameras.length} reporting
      </span>
    </p>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * ## ⚠️ This is the app's FIRST sign-out, and there was none anywhere
 *
 * Added 2026-08-16 on the owner's instruction. `/auth/sign-out/` has existed
 * since Neon Auth landed — it is in `AUTH_VIEW_PATHS` and it is generated — and
 * **nothing in the entire UI linked it**. A reader could sign in and had no way
 * to stop being signed in short of clearing site data.
 *
 * ## ⚠️ Three rules from one directory over, and none of them is style
 *
 * - ⚠️ **No severity colour, and never green.** Nothing in this masthead
 *   carries a level colour. The two admitted exceptions are `ModeBadge`
 *   (provenance) and `NoticeBadge` (a fault signal). This is neither: it is a
 *   fact about the reader, so it takes `--border` and muted ink and nothing
 *   else. **`--wl-select` is not available here either** — that token means
 *   *the reader picked this instrument*, and a session is not an instrument.
 * - ⚠️ **The masthead stays ONE LINE.** The address is `max-lg:hidden`, because
 *   `FreshnessSummary` is already spending this end of the bar above `md` and
 *   `map/page.tsx` has a hard-coded `sticky top-[49px]` measured against a
 *   one-line header. The **button** stays visible at every width — a sign-out
 *   that disappears on a phone is a sign-out that does not exist for most
 *   readers.
 * - ⚠️ **No avatar and no dropdown.** `neon_auth.user` holds an `image`, and
 *   putting it here would fetch a third-party asset into the masthead of a page
 *   whose whole basemap is committed so it survives a dead network. A menu
 *   would be a popover with an outside-press listener for one item — see
 *   `drill-controls.tsx` for how that goes wrong.
 *
 * ## ⚠️ It renders NOTHING until it can say something true
 *
 * `!authConfigured` and a pending session both render null rather than an empty
 * button or a flash of one. This is `ModeBadge`'s rule at a different corner:
 * a default that is itself a claim cannot enforce anything, and a sign-out
 * button on a build with no auth service is a control that cannot work.
 *
 * ⚠️ **`replace`, never `push`.** After signing out, `/` is a landing page
 * whose CTA is `Log in` — with `push`, Back returns to `/map`, which mounts
 * `RequireSession` and bounces forward again. `replace` takes the map's entry
 * off the stack.
 *
 * ⚠️ **`RequireSession` is a curtain and this is not a lock either.** Pressing
 * this clears the session Neon holds; what stops a signed-out request reading
 * data is `waterline/auth.py`, which fails closed. Nothing here is a security
 * boundary.
 */
function SessionMenu() {
  const router = useRouter();
  /* ⚠️ **`useSession` and `signOut` come from `lib/auth-client.ts`, never off
     `authClient` directly.** The SDK types its adapter as a union over every
     shape it ships, so `authClient.useSession` resolves to the vanilla
     client's nanostore `Atom` — not callable, and `tsc` says so. The casts are
     pinned in that one file on purpose: a cast repeated at call sites is a
     cast nobody can find when `0.5.0-beta` moves. */
  const { data: session, isPending } = useSession();
  const [leaving, setLeaving] = useState(false);

  if (!authConfigured || isPending || !session) return null;

  const email = session.user?.email ?? null;

  async function leave() {
    setLeaving(true);
    try {
      await endSession();
    } finally {
      /* ⚠️ **`finally`, so a failed sign-out still leaves the page.** If Neon
         is unreachable the call rejects and the reader is stuck on an
         instrument they asked to leave, watching a button say `signing out…`
         forever. Landing on `/` with a stale cookie is the recoverable half of
         that; `RequireSession` and `auth.py` both re-check on the way back in. */
      router.replace("/");
    }
  }

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-3">
      {email && (
        /* ⚠️ `max-lg:hidden` — see the docblock. The address is the part that
           gives way when the bar runs out of room, because the button is the
           part that does something. */
        <span className="max-w-[22ch] truncate font-mono text-[11px] text-muted-foreground max-lg:hidden">
          {email}
        </span>
      )}
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className={cn(
          "shrink-0 cursor-pointer rounded-sm border border-border px-1.5 py-1",
          "font-mono text-[10px] leading-none tracking-[0.08em] text-muted-foreground uppercase",
          "transition-colors hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
          "disabled:cursor-default disabled:opacity-60 motion-reduce:transition-none",
        )}
      >
        {leaving ? "signing out…" : "sign out"}
      </button>
    </div>
  );
}
