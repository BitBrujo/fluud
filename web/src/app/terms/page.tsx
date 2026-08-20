"use client";

import { SiteNav } from "@/components/site-nav";
import { PaintRule } from "@/components/paint-rule";
import { SiteFooter } from "@/components/site-footer";
import { SprayDefs } from "@/components/spray";
import {
  TermsChanges,
  TermsData,
  TermsIntro,
  TermsNoWarranty,
  TermsNotEmergency,
  TermsPrivacy,
  TermsWatch,
  TermsWhatThisIs,
} from "@/components/terms/terms-sections";
import { useStatus } from "@/lib/hooks/use-status";

/**
 * The Terms of Service page, at `/terms`.
 *
 * ## ⚠️ A fourth route means a fourth DIRECTORY in the export
 *
 * `next.config.ts` sets `trailingSlash: true`, and it is the only reason this
 * resolves once FastAPI is the server rather than `next dev`. With it off the
 * export is `out/terms.html`, a request for `/terms` looks for a file literally
 * named `terms`, and `StaticFiles(html=True)` answers with the 404 page — while
 * the dev server serves it perfectly. Being a directory under `src/app` is what
 * satisfies that. Verified through the real static mount rather than assumed:
 * `/terms` → 307 → `/terms/` → 200, with `out/terms/index.html` on disk.
 *
 * ## What it fetches, and what it deliberately does not
 *
 * `/api/status`, on the usual 15s, for exactly one thing: the mode badge in
 * the nav. (The footer stopped taking the disclaimer on 2026-08-06.) That is
 * one fewer than `/about` uses, because nothing here interpolates a threshold.
 *
 * ⚠️ **No SSE, no `/healthz`, no `/api/sensors`** — the same refusal the
 * landing and About pages make, for the same reason. The warning stream is
 * `rat.speak()`'s output rendered verbatim in exactly one live region on
 * exactly one page. A second subscriber on a page of terms would be a second
 * place a warning could appear with no provenance chip, no clock and no place
 * beside it.
 *
 * ## ⚠️ This page renders no reading
 *
 * Not a depth, not an age, not a severity, not a count of what is happening
 * right now. It is prose about what the software does and what a reader may
 * rely on. That is what keeps it clear of every rule about how a number must be
 * dressed, and it is a property to preserve — the first live figure added here
 * arrives without its plausibility, its freshness or its ramp unless somebody
 * remembers to bring them.
 *
 * ## The nav carries no `current`
 *
 * `SiteNav` holds one route link (`About`) and the button to the map. Terms
 * is reached from the footer, which is where a reader looks for it and which is
 * on every page. Adding it to the bar would put a legal link beside the
 * product's one call to action.
 */
export default function Terms() {
  const status = useStatus();
  const data = status.data;

  return (
    <>
      {/* The spray filter every `<Spray>` on this page references. An SVG
          filter id is document-scoped and each page is its own document, so
          each renders exactly one of these. */}
      <SprayDefs />

      <PaintRule />
      <SiteNav mode={data?.mode ?? null} />

      <main className="flex-1 pb-12">
        <TermsIntro />
        <TermsWhatThisIs />
        <TermsNoWarranty />
        <TermsNotEmergency />
        <TermsWatch />
        <TermsPrivacy />
        <TermsData />
        <TermsChanges />
      </main>

      {/* Not optional here either. §02 and §03 above carry the refusals in
          full; the footer names the app and the routes. */}
      <SiteFooter />
    </>
  );
}
