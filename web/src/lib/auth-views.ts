/**
 * The auth views this app exports, as plain data.
 *
 * ## ⚠️ Why this is its own module with no `"use client"` on it
 *
 * `generateStaticParams` runs on the **server** during the export, and this
 * list is what it enumerates. The first draft kept the array next to the
 * component that uses it, in a `"use client"` file, and the build failed with
 * `AUTH_VIEW_PATHS.map is not a function` — because Next replaces a client
 * module's exports with client *references* when a server component imports
 * them. The array arrives as an opaque proxy, not an array. **A directive is
 * not a hint about where code runs; it changes what an import evaluates to.**
 *
 * So the data lives here, importable from both sides, and neither side pulls
 * the other's dependencies in.
 *
 * ## ⚠️ These are the routes that exist in production
 *
 * `output: "export"` resolves no dynamic segment on demand. Each entry becomes
 * `out/auth/<view>/index.html`; anything missing from this list has no
 * directory, and `StaticFiles(html=True)` answers with the 404 page. **`next
 * dev` resolves them on request whatever this file says**, so a missing entry
 * works perfectly in development and 404s in production only.
 *
 * The one that matters most is `callback` — Google redirects there after
 * consent, and without it a reader finishes a Google sign-in and lands on a
 * 404 holding a valid session.
 *
 * This is the library's whole vocabulary rather than the views this
 * configuration currently reaches, and **that decision paid off on
 * 2026-08-14**. It was written while `credentials={false}` made every password
 * view unreachable, on the reasoning that exporting them costs one small HTML
 * file each and removes a class of bug that appears in production only. When
 * `credentials` was turned on, `sign-up`, `forgot-password`, `reset-password`
 * and `email-verification` became reachable **with no change to this file** —
 * the alternative would have been a sign-up link landing on a 404 for every
 * reader who did not use Google.
 *
 * ⚠️ **Keep exporting the whole vocabulary.** Trimming this to "the views we
 * currently use" re-arms the trap, and the next person to flip a provider prop
 * has no reason to look here.
 *
 * ⚠️ **Nothing checks this against the library and nothing can.** The obvious
 * guard fails: `AuthViewPath` is `keyof AuthViewPaths`, so it is the
 * SCREAMING_CASE keys — `"SIGN_IN"`, `"CALLBACK"` — while these are the
 * kebab-case values, each typed as plain `string`. There is no union to check
 * against. An upstream rename lands as a 404 at the end of a Google redirect,
 * and this comment plus a re-read of `authViewPaths` on a version bump is the
 * entire enforcement.
 */
export const AUTH_VIEW_PATHS = [
  "callback",
  "email-otp",
  "email-verification",
  "forgot-password",
  "magic-link",
  "recover-account",
  "reset-password",
  "sign-in",
  "sign-out",
  "sign-up",
  "two-factor",
  "accept-invitation",
] as const;
