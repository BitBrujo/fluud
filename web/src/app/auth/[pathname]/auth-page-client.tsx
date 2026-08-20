"use client";

import { AuthView } from "@neondatabase/auth/react/ui";
import Link from "next/link";

import { FluudMark } from "@/components/fluud-mark";
import { Spray, SprayDefs } from "@/components/spray";
import { authConfigured } from "@/lib/auth-client";

/**
 * The twelve auth views, as a 50-50 split: the card on one side, a photograph
 * on the other.
 *
 * ## ⚠️ This is where the sign-in card LIVES as of 2026-08-16
 *
 * `/` was the sign-in screen until then and is a landing page again. Its CTA
 * points here. **One component serves all twelve generated views**, which is
 * the property to keep: a second sign-in surface that looked different from
 * this one would be two doors wearing two faces.
 *
 * ## ⚠️ It carries NO chrome, and each removal is a decision
 *
 * No `SiteNav`, no `PaintRule`, no `SiteFooter`. The wordmark at top left is a
 * real `<Link>` back to `/` and is the only way off this page.
 *
 * ⚠️ **These are the pages with no footer now, and the two links under the card
 * are what pay for it.** `/terms` is reached from `SiteFooter` and from nowhere
 * else, and it is the page disclosing what signing in stores about a reader —
 * §04 names `neon_auth.session`'s `ipAddress` and `userAgent` explicitly, and
 * `neon_auth.account.password` since `credentials` went on. **A reader cannot
 * agree to terms they have no route to**, and this is the page where the
 * agreeing happens. `/` carried this pair for exactly this reason until it
 * became a landing page; the job moved with the card. **Removing those two
 * links is removing the footer's last job here — they are not decoration.**
 *
 * ⚠️ **`Privacy` points at `/terms/#privacy` by NAME, never by numeral.**
 * `/about` renumbered its sections 01–07 → 01–06 once already, so `#05` would
 * silently move. The anchor is `id="privacy"` on `TermsPrivacy`, and renaming
 * it means fixing this file in the same commit.
 *
 * ## The photograph
 *
 * ⚠️ **Decoration: empty `alt`, `aria-hidden`, no `title`.** Describing it
 * would invent copy nobody reviewed. It renders no reading, no mark, no scale
 * and no overlay — a photograph of water with anything drawn on it reads as a
 * measurement of that water.
 *
 * ⚠️ **It is FIXED and must not be randomised or rotated.** A reader who fails
 * a sign-in and retries would meet a different picture on the same page, which
 * reads as having landed somewhere else. Same argument as `ratFor` being a hash
 * rather than a draw, one component over and now deleted.
 *
 * ⚠️ **`hidden lg:block`.** Below `lg` the card is the whole page and the image
 * is not fetched at all — `display: none` on the *wrapper* keeps the `<img>` out
 * of the DOM entirely here, unlike `motion-reduce:hidden` on an element that
 * exists, which does not reliably prevent a fetch. The reader most likely to be
 * on a metered connection is the one on the phone.
 *
 * ⚠️ **No `loading="lazy"` on it.** It is above the fold on every viewport that
 * renders it at all, and lazy-loading an above-the-fold image delays it for
 * nothing.
 *
 * ## ⚠️ Nothing here polls, renders a reading, or shows a mode
 *
 * These pages are read by somebody with no session, so a request to
 * `/api/status` would be a guaranteed 401 surfacing through `lib/messages.ts`
 * as *cannot reach the service* — an error about the instrument, shown to a
 * reader who is merely signed out. There is no `ModeBadge` on this page at all,
 * which removes the last reason it would have to poll.
 */
export function AuthPageClient({ pathname }: { pathname: string }) {
  return (
    <>
      {/* Document-scoped filter id — the wordmark below needs its defs in the
          same document. */}
      <SprayDefs />

      {/* ⚠️ `min-h-dvh`, not `vh`: this page is opened outdoors on phones with
          a collapsing address bar, and `vh` leaves a strip of body background
          under the fold. `<body>` is a flex column, so the split has to claim
          the height itself. */}
      <div className="grid min-h-dvh flex-1 lg:grid-cols-2">
        <div className="flex flex-col px-5 py-8 sm:px-8 lg:px-11">
          <Link
            href="/"
            title="Fluud — what this is"
            className="flex min-w-0 items-center gap-3 self-start rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <FluudMark />
            <Spray className="text-[22px]">Fluud</Spray>
          </Link>

          <div className="flex flex-1 items-center justify-center py-16">
            <div className="w-full max-w-[420px]">
              {authConfigured ? (
                <AuthView pathname={pathname} />
              ) : (
                /* ⚠️ **An unconfigured build says so, in words, rather than
                   rendering a card that cannot work.**
                   `NEXT_PUBLIC_NEON_AUTH_URL` is baked in at build time under
                   `output: "export"`, so this is not a runtime
                   misconfiguration a restart can fix — the bundle itself is
                   wrong, and the person who needs to know that is whoever just
                   built it. */
                <div className="rounded-sm border border-[var(--wl-warning)] bg-[var(--wl-panel)] p-6">
                  <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--wl-warning)] uppercase">
                    Sign-in is not configured
                  </p>
                  <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                    This build was compiled without{" "}
                    <code className="font-mono text-foreground">
                      NEXT_PUBLIC_NEON_AUTH_URL
                    </code>
                    . That value is baked in at build time, so the UI has to be
                    rebuilt with it.
                  </p>
                </div>
              )}

              {/* ⚠️ **The footer's job, not decoration.** See the docblock —
                  these are the only route to `/terms` from the page where a
                  reader signs in, and `/terms` is where the sign-in record is
                  disclosed. */}
              <nav
                aria-label="Legal"
                className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11.5px] tracking-[0.08em] uppercase"
              >
                <LegalLink href="/terms/">Terms</LegalLink>
                <LegalLink href="/terms/#privacy">Privacy</LegalLink>
              </nav>
            </div>
          </div>
        </div>

        <div className="hidden bg-[var(--wl-panel)] lg:block">
          <img
            src="/photoz/night_07_subway_entrance.webp"
            alt=""
            aria-hidden
            width={2200}
            height={1228}
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </>
  );
}

/**
 * `next/link`, and both hrefs carry their trailing slash deliberately.
 *
 * ⚠️ **`trailingSlash: true` is load-bearing in production**, where `api.py`
 * serves the export with `StaticFiles(html=True)` and falls back to
 * `<path>/index.html` only when `<path>` is a directory. `/terms` without the
 * slash is a request for a file called `terms`, which does not exist — and
 * `next dev` resolves it perfectly, so the failure appears only in production.
 */
function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}
