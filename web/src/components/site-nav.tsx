"use client";

import Link from "next/link";

import { FluudMark } from "@/components/fluud-mark";
import { ModeBadge } from "@/components/mode-badge";
import { Spray } from "@/components/spray";

/**
 * The top bar on every page except the instrument.
 *
 * ⚠️ **It was `landing/landing-nav.tsx` and it outlived the landing page.**
 * That page was deleted on 2026-08-14 and the rest of `src/components/landing/`
 * went with it; this file moved up a directory because `/`, `/about` and
 * `/terms` all mount it and none of them is a landing page any more. `/map` has
 * its own masthead — `site-header.tsx` — which carries freshness and a notice
 * badge this bar deliberately does not.
 *
 * ⚠️ **The `LIVE` pill is `ModeBadge`, not a green slab, and that is a
 * substitution from the design rather than an oversight.** The mock renders it
 * as `background:#22c55e` with dark ink. This app has exactly one authority on
 * how provenance is drawn and it says: outlined, never filled, because a filled
 * green block at the top of a flood page reads as "everything is fine" from
 * across a room (the never-safe rule — see `mode-badge.tsx`, which spends a paragraph
 * on it). Reusing the component rather than restyling it also means the landing
 * page inherits the property that matters most: it starts at `UNKNOWN` and only
 * ever says `LIVE` because `/api/status` answered.
 *
 * The three-bar mark is `aria-hidden` decoration — `fluud-mark.tsx`, shared
 * with the map masthead and the footer since 2026-08-06.
 *
 * ## ⚠️ Every navigation here is a ROUTE, and that is now structural
 *
 * It held `Method` (`#method`) and `What it does` (`#features`), both jumping
 * within the landing page. They were replaced by `About` (`/about`) on the
 * owner's instruction, because this bar had started rendering on a second page
 * where `#method` was a link to nothing.
 *
 * ⚠️ **The sections those anchors pointed at no longer exist at all** — the
 * landing page was deleted on 2026-08-14 — so a link anybody still holds now
 * resolves to `/` and lands on the stub. There is nothing to restore them to.
 *
 * ⚠️ **It came off `/` on 2026-08-14** with the second strip of the sign-in
 * screen, which took `PaintRule` and `SiteFooter` with it — and **it is back on
 * `/` since 2026-08-16**, when that route became a landing page again. It
 * renders on `/`, `/about` and `/terms`. The map has its own masthead, and the
 * auth views dropped it in the same change for their split layout.
 *
 * **Anything added to this bar has to be a route.** It renders on several pages
 * with three different bodies, so an in-page anchor is broken on at least two
 * of them by construction.
 *
 * ## ⚠️ The right-hand button is TWO doors and `cta` picks which
 *
 * On `/about` and `/terms` a reader may already have a session, so the button
 * is the map. On `/` it is the log-in, because that page is the first thing a
 * signed-out reader meets and sending them at `/map` would bounce them through
 * `RequireSession` to the same place with a redirect in between.
 *
 * ⚠️ **One button, never two.** A bar carrying both `log in` and `open the map`
 * asks the reader which of the two states they are in, which is a question the
 * session already answers.
 */
export function SiteNav({
  mode,
  current,
  cta = "map",
}: {
  mode: string | null;
  /** Which nav route is the page being rendered. Drives `aria-current`. */
  current?: "about";
  /**
   * Which door the right-hand button opens. `"login"` on `/`, where the reader
   * has no session yet; `"map"` everywhere else. Never both.
   */
  cta?: "map" | "login";
}) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--wl-rule)] bg-card px-6 py-3.5 sm:px-12 lg:px-20">
      <div className="flex min-w-0 items-center gap-3">
        <FluudMark />
        <Link
          href="/"
          className="min-w-0 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Spray className="text-[22px]">Fluud</Spray>
        </Link>
        <ModeBadge mode={mode} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <NavLink href="/about" current={current === "about"}>
          About
        </NavLink>
        {/* ⚠️ Both hrefs carry a trailing slash. `trailingSlash: true` exports
            every route as a directory and `StaticFiles(html=True)` falls back
            to `<path>/index.html` only for one — a slashless href works in
            `next dev` and 404s in production. */}
        <Link
          href={cta === "login" ? "/auth/sign-in/" : "/map/"}
          className="rounded-sm bg-[var(--wl-select)] px-4 py-2.5 font-mono text-[12.5px] font-semibold tracking-[0.06em] text-[var(--primary-foreground)] uppercase shadow-[3px_3px_0_var(--wl-cyan)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--wl-cyan)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
        >
          {cta === "login" ? "Log in" : "Open the map"}
        </Link>
      </div>
    </nav>
  );
}

/**
 * A route, and `next/link` rather than a bare `<a>` — this bar sits on two
 * pages now and an anchor here would be a link to nothing on one of them.
 *
 * The map keeps its own button beside this rather than joining the row: it is
 * the destination the whole site points at, and a text link to it would be the
 * same place twice in one bar.
 *
 * `aria-current="page"` is the only state, and the colour follows it. A reader
 * on `/about` pressing `About` gets the page they are on, which is harmless and
 * conventional; announcing it is what stops it being a dead end for anyone who
 * cannot see which page is loaded.
 */
function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-sm font-mono text-[12px] tracking-[0.06em] uppercase transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none ${
        current ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/* `FluudMark` lived here until 2026-08-06 — it is `fluud-mark.tsx` now,
   shared with `site-header.tsx` and `site-footer.tsx`. */
