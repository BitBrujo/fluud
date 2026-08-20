"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Where a reader lands once they are signed in. The instrument, not `/` —
 * `/` is the sign-in page now, so sending them back there would bounce them
 * straight through it again.
 */
export const AFTER_SIGN_IN = "/map";

/**
 * Where the auth views live. ⚠️ **This string and the directory
 * `src/app/auth/[pathname]/` are one fact written twice**, and the failure
 * when they disagree is invisible in `next dev`: the provider navigates to a
 * path the export has no directory for, `StaticFiles(html=True)` finds no
 * file, and the reader gets the 404 page mid-sign-in. See the route's own
 * docblock for why `generateStaticParams` has to enumerate every view.
 */
export const AUTH_BASE_PATH = "/auth";

/**
 * `next/link` behind the `href` prop better-auth-ui hands its links. The
 * adapter exists because that library was written against react-router's
 * `to`; everything else about it is Next's Link, including the prefetch.
 */
function Link({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  return <NextLink href={href} {...props} />;
}

/**
 * The auth context every signed-in surface reads from.
 *
 * ⚠️ **Mounted in the root layout, so it wraps all four routes** — including
 * the two that stay readable signed out. That is deliberate: `/about` and
 * `/terms` do not require a session, but the masthead on them still has to be
 * able to say whether there IS one, and `SignedIn` / `SignedOut` need this
 * provider above them to answer.
 *
 * **Three props are decisions rather than configuration:**
 *
 * - ⚠️ `credentials` — email-and-password sign-in and sign-up, **on since
 *   2026-08-14, on the owner's instruction.** It was `false` and the reason it
 *   was false is the reason turning it on cost a second edit: a password field
 *   means Neon Auth writes a password hash to `neon_auth.account.password`, and
 *   that is a person-record fact a reader is owed. **§04 of `/terms` was
 *   rewritten in the same commit** — it named only the Google shape of the
 *   sign-in record and would have been silently incomplete for every reader who
 *   signed up with an email.
 *
 *   ⚠️ **The rule survives the flip and now runs the other way**: this prop and
 *   §04 move together. Adding a passkey, a magic link or a second provider adds
 *   a row to that record, and a terms page that lists the old shape is worse
 *   than one that lists none.
 *
 *   ⚠️ **`schema.sql` is untouched and must stay untouched.** The hash lives in
 *   Neon's managed schema, which this repo does not define and cannot trim.
 *   `subscribers` is still our table and still holds an address, a language,
 *   two tokens, the sensors picked and the notification settings. **Do not
 *   "harmonise" the two.**
 * - `organization={false}` — Neon Auth ships teams, invitations and roles.
 *   None of it is wanted and all of it renders by default.
 * - `defaultTheme="dark"` — this site has no light palette to toggle to, and
 *   the auth UI ships `next-themes` set to `system`. Without this a reader on
 *   a light-mode phone gets a white sign-in card bolted to a dark site.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      basePath={AUTH_BASE_PATH}
      redirectTo={AFTER_SIGN_IN}
      navigate={(href) => router.push(href)}
      replace={(href) => router.replace(href)}
      Link={Link}
      credentials
      organization={false}
      social={{ providers: ["google"] }}
      defaultTheme="dark"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
