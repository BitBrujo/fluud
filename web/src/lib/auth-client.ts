// ⚠️ **THIS IMPORT MUST STAY ABOVE THE SDK IMPORTS AND IT IS NOT STYLE.**
// `@neondatabase/auth` calls `crypto.randomUUID` at module evaluation, and that
// function does not exist in an insecure context — so on `http://<LAN-IP>:3000`
// the throw comes out of `RootLayout` and EVERY page on the site renders "This
// page couldn't load", `/about` and `/terms` included. ES modules evaluate in
// import order, so this line is the fix and its position is the whole of it. An
// import sorter that moves it below restores the crash. See `crypto-shim.ts`.
import "./crypto-shim";

import { createInternalNeonAuth } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

/**
 * Neon Auth, client side. This is the THIRD third-party origin on this site
 * and it is the one that fails hardest — see the docblock in
 * `src/app/page.tsx` for what a reader loses when it is unreachable.
 *
 * ⚠️ **`output: "export"` means this value is baked in at BUILD time, not read
 * at runtime.** `next.config.ts` used to be able to say "there is no
 * NEXT_PUBLIC_* anywhere to get wrong"; that is no longer true, and the cost is
 * specific: the Docker UI stage has to receive this as a build arg, because
 * a container built without it produces a bundle that can never sign anybody
 * in no matter what the runtime environment says. There is no second chance at
 * runtime and no error that names the cause.
 */
export const NEON_AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? "";

/**
 * Whether a URL was supplied at build time at all.
 *
 * ⚠️ **This exists so an unconfigured build FAILS LOUDLY IN WORDS rather than
 * rendering a sign-in form that cannot work.** It is the same argument
 * `config.public_base_url` makes on the Python side: a feature that silently
 * cannot complete is worse than one that says it is not configured. Every
 * surface that mounts an auth component checks this first.
 */
export const authConfigured = NEON_AUTH_URL.length > 0;

/**
 * ⚠️ **The placeholder is not a fallback and must never look like one.**
 * `createAuthClient` builds request URLs eagerly, so an empty string throws at
 * module scope — which under `output: "export"` is a *build* failure in a
 * prerender, with a stack that names this file and not the missing variable.
 * `authConfigured` is what the UI branches on; this only keeps the module
 * importable so the honest "not configured" copy can render at all.
 */
const clientUrl = authConfigured
  ? NEON_AUTH_URL
  : "https://auth.invalid/not-configured";

/**
 * ⚠️ **`createInternalNeonAuth`, not `createAuthClient`, and the name is a
 * warning worth heeding.**
 *
 * The documented `createAuthClient` is literally
 * `createInternalNeonAuth(url, config).adapter` — it throws the other half
 * away. That other half is `getJWTToken`, which is the only supported way to
 * get a signed token out of this SDK, and our FastAPI cannot authenticate a
 * request without one: the session cookie is scoped to Neon's origin, so it
 * never reaches our API at all.
 *
 * Both names are exported from the package root and both are typed, so this is
 * a public API rather than reaching into `dist/`. **But `internal` is in the
 * name and the package is `0.5.0-beta`**, so treat it as the thing most likely
 * to move under a version bump. If it disappears, the fallback is Better
 * Auth's own JWT plugin endpoint — the client's `/token` path — and it should
 * be re-pinned here rather than at any call site.
 */
const neonAuth = createInternalNeonAuth(clientUrl, {
  adapter: BetterAuthReactAdapter(),
});

/** The Better Auth React client — `useSession`, `signIn.social`, `signOut`. */
export const authClient = neonAuth.adapter;

/**
 * The signed-in reader's session, as a React hook.
 *
 * ## ⚠️ This exists because the SDK's TYPE is wrong, and the cast is pinned here
 *
 * `createInternalNeonAuth`'s return is typed as a **union over every adapter**
 * the package ships, so `adapter.useSession` resolves to the *vanilla* client's
 * shape — a nanostore `Atom`, which is not callable. Under
 * `BetterAuthReactAdapter()` the runtime value is a React hook, which is what
 * the package's own `llms.txt` documents:
 *
 * ```tsx
 * const session = auth.useSession();
 * if (session.isPending) …
 * ```
 *
 * Calling it directly fails with *"This expression is not callable. No
 * constituent of type 'Atom<…>' is callable."*
 *
 * ⚠️ **So the cast is here rather than at the call site**, on the same rule
 * `createInternalNeonAuth` above is pinned under: the package is `0.5.0-beta`,
 * this is the thing most likely to move under a version bump, and a cast
 * repeated in components is a cast nobody can find. **If a later release types
 * this correctly, delete the cast and keep the export.**
 *
 * ⚠️ **The shape is declared as narrowly as the callers need**, so widening it
 * is a deliberate edit rather than a cast quietly admitting more. Today one
 * caller reads `email` — `site-header.tsx`'s `SessionMenu`. **Never store more
 * of this object than a surface renders**; `neon_auth.user` also holds a name,
 * an `image`, a role and ban fields, and none of them belongs on this site.
 */
export type SessionState = {
  data: { user?: { email?: string | null } | null } | null;
  isPending: boolean;
};

export const useSession = authClient.useSession as unknown as () => SessionState;

/**
 * End the session.
 *
 * ⚠️ **Cast for `useSession`'s reason** — the same adapter union, the same beta
 * package. `signOut()` is documented in `llms.txt` under the default API.
 *
 * ⚠️ **This clears the session Neon holds and is not a security boundary.**
 * `RequireSession` is a curtain and this is the button on it;
 * `waterline/auth.py` is the lock, and it fails closed.
 */
export const signOut = authClient.signOut as unknown as () => Promise<unknown>;

/**
 * The signed JWT for the current session, or null when signed out.
 *
 * This is what `lib/api.ts` sends to FastAPI as a bearer token, and what
 * `waterline/auth.py` verifies against Neon Auth's JWKS. ⚠️ **The browser's
 * session cookie is scoped to Neon's origin, not ours** — so our own API
 * cannot read it, and a bearer token is the only thing that crosses.
 */
export const getJWTToken = () => neonAuth.getJWTToken();
