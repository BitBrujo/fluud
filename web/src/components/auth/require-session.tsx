"use client";

import {
  AuthLoading,
  RedirectToSignIn,
  SignedIn,
  SignedOut,
} from "@neondatabase/auth/react/ui";
import type { ReactNode } from "react";

import { authConfigured } from "@/lib/auth-client";

/**
 * The gate. Nothing inside renders until there is a session.
 *
 * ## ⚠️ It must WRAP the gated page, never sit inside it
 *
 * This is the whole reason the component exists instead of a `useSession()`
 * check at the top of `/map`. That page calls `useStatus`, `useHealth`,
 * `useSensors` and `useDepthPeaks` at the top of its body, and a hook runs
 * when the component mounts — an early `return null` further down does not
 * stop it. Gating inside the page would leave a signed-out reader polling four
 * endpoints on 15-, 30- and 60-second intervals, each answering 401, each
 * rendered by `lib/messages.ts` as *cannot reach the service*. **A reader who
 * is merely not signed in would be told the instrument is broken.**
 *
 * Wrapping keeps the workspace unmounted, so those hooks never run at all.
 *
 * ## ⚠️ This is a curtain, not a lock, and the difference matters
 *
 * The export is static files served by `StaticFiles` to anyone who asks. Every
 * component below is in the bundle and any reader can read it. **The real gate
 * is `waterline/auth.py` refusing `/api/*` without a valid bearer token** —
 * this only decides what is drawn. Nothing secret may live in the bundle on
 * the strength of this component, because it keeps no secret.
 *
 * ## Three states, and the middle one is the one people get wrong
 *
 * `AuthLoading` is not decoration. Resolving a session is a network round trip
 * to Neon, so without an explicit pending state the first paint is `SignedOut`
 * and a reader who IS signed in gets bounced to sign-in on every cold load.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  /* ⚠️ **Unconfigured builds may not redirect.** `RedirectToSignIn` would send
     the reader to a sign-in page that also cannot work, and `/auth/sign-in`
     would not send them back — a loop between two pages that both say nothing.
     `page.tsx` explains the actual problem, so this defers to it. */
  if (!authConfigured) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="w-full max-w-[420px] rounded-sm border border-[var(--wl-warning)] bg-[var(--wl-panel)] p-6">
          <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--wl-warning)] uppercase">
            Sign-in is not configured
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            This build was compiled without{" "}
            <code className="font-mono text-foreground">
              NEXT_PUBLIC_NEON_AUTH_URL
            </code>
            , so there is no way to sign in and no way to reach the map. The UI
            has to be rebuilt with that value.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* ⚠️ Deliberately NOT a spinner over a skeleton of the workspace. A
          drawn-but-empty map is a map claiming nothing is there, which is the
          never-safe rule's exact failure. Blank until it is real. */}
      <AuthLoading>
        <main className="flex flex-1 items-center justify-center px-5 py-16">
          <div className="max-w-[420px] text-center">
            <p className="font-mono text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
              Checking your session…
            </p>
            {/* ⚠️ **The second line is the whole point of this block.** With
                the auth service unreachable the session query never settles,
                so `SignedOut` never mounts, `RedirectToSignIn` never fires,
                and this state is not a flicker — it is where the reader
                STAYS. Measured against an unresolvable auth host: `/map/`
                sits here indefinitely. Without a sentence saying what is
                happening, a dead sign-in service is indistinguishable from a
                dead instrument, on the page where that distinction matters
                most. Same argument `geosearch.ts` makes: name which thing
                failed. */}
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              If this does not clear, the sign-in service is not answering.
              That is about signing in, not about the water.
            </p>
          </div>
        </main>
      </AuthLoading>

      <SignedIn>{children}</SignedIn>

      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
