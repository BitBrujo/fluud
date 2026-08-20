import type { Metadata } from "next";

import { AuthProvider } from "@/components/auth/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fluud — NYC flood watch",
  description:
    "Hyperlocal NYC flood watch. FloodNet depth sensors paired to NYC DOT " +
    "traffic cameras. A prototype, not an emergency service.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `dark` is not a toggle — there is no light theme. It is here so shadcn's
  // own `dark:` variants resolve against the palette in globals.css.
  return (
    /* ⚠️ `suppressHydrationWarning` is REQUIRED here and it is not hiding a bug
       of ours — it is hiding one we cannot reach. `@neondatabase/auth-ui`
       bundles `next-themes`, which rewrites this element's `class` and adds
       `style="color-scheme: dark"` on mount. Measured: the server renders
       `class="dark h-full antialiased"` and the client produces
       `class="h-full antialiased dark"` plus the style, so React logs a
       hydration mismatch on every page load.

       ⚠️ **Scoped to this element only, deliberately.** The attribute does not
       inherit past one level, so a genuine mismatch anywhere inside the tree —
       a reading rendered from a timestamp, say — still reports normally. That
       is the reason not to reach for the blunter fixes.

       ⚠️ **`AuthProvider` passes `defaultTheme="dark"` and that is what keeps
       this cosmetic.** `next-themes` defaults to `system`; without that prop a
       reader on a light-mode phone gets this class flipped to `light` on a site
       that has no light palette, which is not a warning to suppress but a page
       to fix.

       ⚠️ **`data-palette="estuary"` SHIPS the blue-slate palette, 2026-08-15, on
       the owner's instruction.** It is a plain attribute and there is no toggle
       anywhere in the UI — swapping it for `"sodium"` or deleting it (bitumen,
       the `:root` block) is a one-word edit and the only way to change palette.
       **There must not be a control for this on the page.** A palette moves the
       neutrals, the poster paint and the basemap; it may never move a depth
       band, staleness, provenance or an instrument slate, and none of the three
       does — see the audit at `globals.css`'s estuary block.

       ⚠️ **This element is `:root`, which is what makes the derived tokens
       resolve here.** Set on a descendant instead, thirteen `var()`-derived
       tokens would freeze to the base palette — `globals.css`'s
       `:root, [data-palette]` block is what makes a scoped palette work at all,
       and it is the design system that depends on it. */
    <html
      lang="en"
      className="dark h-full antialiased"
      data-palette="estuary"
      suppressHydrationWarning
    >
      <head>
        {/*
          ⚠️ **A THIRD-PARTY ORIGIN, on the page every reader loads.** Added
          deliberately, on the owner's instruction, for the display face.

          Know exactly what it costs, because the rest of the architecture is
          built the other way and the reasons have not changed. The basemap is
          ~1,400 committed coordinates rather than a tile CDN, every rat frame
          is a committed WebP rather than a renderer on the page, `lib/api.ts`
          is relative-and-same-origin by explicit design, and the argument
          behind all three is that the page still draws when the venue's wifi
          does not. `use.typekit.net` does not hold to that.

          ⚠️ **Adobe Fonts cannot be self-hosted**, which is why the escape
          hatch `globals.css` recommends — "put the woff2 in `public/fonts/`" —
          is not available here. The kit's licence serves the files from their
          CDN; downloading and re-hosting them is a licence violation, not an
          optimisation. So this is genuinely link-or-nothing.

          **What keeps the failure graceful**, and all of it is load-bearing:

          - `--font-display` in `globals.css` carries a real fallback stack, so
            a blocked or slow kit renders the system stack at its heaviest
            weight — which is exactly what shipped before this line existed.
          - The paint effect is a local SVG filter (`components/spray.tsx`), not
            anything the kit provides, so titles still look sprayed with the
            face missing. The type changes; the treatment does not.
          - `preconnect` opens the TLS handshake early rather than after the CSS
            parses, which is most of the latency on a cold load.
          - Nothing that carries a *warning* depends on this. The templated
            warning text, every reading, every severity mark and every age is in
            `--font-sans` / `--font-mono`. A dead font host costs this site its
            headline styling and nothing else.

          If the trade is ever reconsidered, the lever is this one line plus the
          `--font-display` token; nothing else in the app knows the kit exists.
        */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="" />
        <link rel="stylesheet" href="https://use.typekit.net/vir6vkm.css" />
      </head>
      {/* ⚠️ `AuthProvider` wraps ALL FOUR routes, including the two that stay
          readable signed out. `/about` and `/terms` need no session; they still
          need this context above them, because the chrome on every page asks
          whether there IS one and `SignedIn` / `SignedOut` cannot answer
          without it. It is a client component, so this is the boundary where
          the tree stops being server-rendered. */}
      <body className="flex min-h-full flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
