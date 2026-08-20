"use client";

import { AuthLoading, SignedIn, SignedOut } from "@neondatabase/auth/react/ui";
import Link from "next/link";

import { authConfigured } from "@/lib/auth-client";

/**
 * The landing page's door, and which one it is depends on the session.
 *
 * ⚠️ **Extracted from `src/app/page.tsx` on 2026-08-16 because the page grew a
 * SECOND call site** — the hero and the closing band. Two copies of this would
 * be two components drifting apart on the three branches below, and the branches
 * are the part that matters.
 *
 * ⚠️ **All three branches paint something.** `SignedIn` and `SignedOut` both
 * render nothing until the session query settles, and when Neon is unreachable
 * that query never settles at all — so without `AuthLoading` a dead auth service
 * is a hero with a hole under it, indefinitely. Measured against an unresolvable
 * auth host: `get-session` fails with `ERR_NAME_NOT_RESOLVED` and neither branch
 * ever mounts.
 *
 * That is the never-safe habit applied to a door rather than to water: an empty
 * space is not an answer, and the page has to say which of the two things is
 * happening.
 *
 * ⚠️ **The signed-in branch is a LINK and not a redirect.** An earlier shape of
 * `/` `router.replace`d to `/map` here, which was right for a door and is wrong
 * for a page carrying four sections — a reader with a session could never reach
 * them. **If a redirect ever goes back on this route, those sections become
 * unreachable to everybody who is signed in.**
 */
export function LandingCta({ size = "lg" }: { size?: "lg" | "md" }) {
  if (!authConfigured) {
    /* ⚠️ **An unconfigured build says so, in words, rather than rendering a
       button that cannot work.** `NEXT_PUBLIC_NEON_AUTH_URL` is baked in at
       build time under `output: "export"`, so this is not a runtime
       misconfiguration a restart can fix — the bundle itself is the thing that
       is wrong, and the person who needs to know that is whoever just built it.
       Same argument `config.public_base_url` makes on the Python side. */
    return (
      <div className="max-w-[var(--prose-measure)] rounded-sm border border-[var(--wl-warning)] bg-[var(--wl-panel)] p-6">
        <p className="num text-[12px] tracking-[0.06em] text-[var(--wl-warning)] uppercase">
          Sign-in is not configured
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          This build was compiled without{" "}
          <code className="font-mono text-foreground">
            NEXT_PUBLIC_NEON_AUTH_URL
          </code>
          , so it has no auth service to reach. That value is read at build time,
          not at runtime — setting it now and restarting will not change this
          page. The UI has to be rebuilt with it.
        </p>
      </div>
    );
  }

  return (
    <>
      <AuthLoading>
        <p className="num text-[12.5px] tracking-[0.06em] text-muted-foreground uppercase">
          Checking your session…
        </p>
        <p className="mt-3 max-w-[var(--prose-measure)] text-[14px] leading-relaxed text-muted-foreground">
          If this does not clear, the sign-in service is not answering. That is
          about signing in, not about the water.
        </p>
      </AuthLoading>

      <SignedIn>
        <CtaLink href="/map/" size={size}>
          Open the map
        </CtaLink>
      </SignedIn>

      <SignedOut>
        <CtaLink href="/auth/sign-in/" size={size}>
          Log in
        </CtaLink>
      </SignedOut>
    </>
  );
}

/**
 * The poster-paint button, matching `SiteNav`'s at a larger size.
 *
 * ⚠️ **The href carries its trailing slash.** `trailingSlash: true` exports
 * every route as a directory and `StaticFiles(html=True)` falls back to
 * `<path>/index.html` only for one — a slashless href works perfectly in
 * `next dev` and answers with the 404 page in production.
 *
 * ⚠️ **`--wl-select` and `--wl-cyan` are poster paint and take no scale.** They
 * may never be given a severity colour, whatever else lands on this page.
 */
export function CtaLink({
  href,
  size = "lg",
  children,
}: {
  href: string;
  size?: "lg" | "md";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-block self-start rounded-sm bg-[var(--wl-select)] font-mono font-semibold tracking-[0.06em] text-[var(--primary-foreground)] uppercase shadow-[5px_5px_0_var(--wl-cyan)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[4px_4px_0_var(--wl-cyan)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none ${
        size === "lg"
          ? "px-7 py-4 text-[14px]"
          : "px-6 py-3.5 text-[13.5px]"
      }`}
    >
      {children}
    </Link>
  );
}
