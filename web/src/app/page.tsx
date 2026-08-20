"use client";

import { LandingCta } from "@/components/landing/landing-cta";
import { LandingHero } from "@/components/landing/landing-hero";
import {
  LandingDashboard,
  LandingInstruments,
  LandingNotify,
} from "@/components/landing/landing-sections";
import { PaintRule } from "@/components/paint-rule";
import { PhotoCta } from "@/components/photo-cta";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { SprayDefs } from "@/components/spray";

/**
 * The front door, and it is a LANDING PAGE.
 *
 * ## ⚠️ What this route has been, six times over
 *
 * A full landing page until 2026-08-14 — hero, live citywide card, address
 * search, three method cards, three feature cards, a verbatim WATCH template and
 * a graffiti rat on an animated barrel. Cut to a stub the same day. Then a
 * sign-in page carrying the stub's chrome. Then stripped to the door itself: a
 * wordmark, Neon Auth's card and two links. Then a landing page again on
 * 2026-08-16 — hero, three prose sections, footer.
 *
 * ⚠️ **This is the sixth shape, built to a supplied design on 2026-08-16.** A
 * photographic hero, the instrument inventory, an illustrated sensor face, the
 * watch in three steps with an illustrated email, and a closing band. The
 * sign-in card is still at `/auth/sign-in/` and this page points at it.
 *
 * ## ⚠️ It RENDERS A DEPTH now, and that reverses a documented rule
 *
 * The root `CLAUDE.md` said: *never put a reading, a depth, an age or a severity
 * colour on `/`, `/about`, `/terms` or any `/auth` view.* Two cards here break
 * it — a `180 mm` sensor face on the depth ramp, and a `WARNING` email at
 * `57 mm`. **Built as drawn, on the owner's instruction**, with the rule amended
 * in `CLAUDE.md` in the same change rather than left standing and violated.
 *
 * ⚠️ **Every figure is a fixed literal in `landing-sections.tsx` and this page
 * still does not poll.** The rule's argument survives its amendment: a number on
 * `/map` arrives wearing a timestamp, a plausibility flag and a freshness clock,
 * and none of that machinery exists here or can be added — so a figure on this
 * page can only ever be an illustration.
 *
 * ❌ ⚠️ **The `EXAMPLE · not a live reading` label is GONE**, on the owner's
 * instruction, later on 2026-08-16. It was the fourth of the four conditions
 * that amendment rested on, and the only one a reader could see. The other
 * three hold — literals, no live clock, one constant behind every offset — but
 * nothing on the page now tells a reader that `180 mm` is drawn rather than
 * measured. **Read `landing-sections.tsx`'s docblock before adding a third
 * card.**
 *
 * ⚠️ **It still does not fetch `/api/status` and must not start.** With the API
 * gated that request is a guaranteed 401 on the one page whose entire job is
 * that the reader has no session yet, surfacing through `lib/messages.ts` as
 * *cannot reach the service*. `SiteNav` takes `mode={null}`, so `ModeBadge` says
 * `UNKNOWN` — the truthful answer before anybody has proved anything.
 *
 * ⚠️ **The copy carries counts again**, 425 and 968, so `/` is a second surface
 * quoting `MEASUREMENTS.md`'s **Verified live** figures alongside
 * `about-sections.tsx`. `python -m waterline.poll probe` is the authority and
 * **both pages re-measure together.**
 *
 * ## ⚠️ Three things here are load-bearing and none is layout
 *
 * **1. The route may not stop existing.** `api.py` mounts the export with
 * `StaticFiles(html=True)`, so a missing root `index.html` answers with the 404
 * page rather than with anything useful. Whatever `/` becomes, it stays.
 *
 * **2. ❌ ⚠️ The never-safe claim is stated NOWHERE a reader meets without
 * choosing something.** `LandingNotify` ended *"Fluud reports what the sensors
 * see."* and that line was deleted on the owner's instruction, 2026-08-16, hours
 * after `/about` lost its own prose version to that page's cut. **`/terms` §03
 * is what is left**, and it is reached from `SiteFooter` and nowhere else.
 * `station-list.tsx`'s empty states still refuse to call a place clear, and they
 * are behind the session gate. **This page is where the claim belongs if it ever
 * comes back.**
 *
 * **3. ⚠️ A signed-in reader STOPS here.** An earlier shape's `SignedIn` branch
 * `router.replace`d straight to `/map` — correct for a door, wrong for a page
 * with four sections on it. The branch is a button, in `landing-cta.tsx`. **If a
 * redirect ever goes back on this route, the sections are unreachable to
 * everybody who is signed in.**
 *
 * ## ⚠️ The photographs are decoration and are committed at 2200px
 *
 * `public/photoz/*.webp`, seven files at 2.0MB, of which this page mounts three.
 * ⚠️ **The closing band's photograph changed on 2026-08-16** — the rooftop tanks
 * for the rooftop puddle, on the owner's instruction — and it took a
 * `position` with it, because the subject is in the lower half of the frame and
 * a band this wide crops from the centre outward.
 * The camera originals are seven 5504×3072 JPEGs at 79MB in `web/photoz-src/`,
 * gitignored and dockerignored — see the recipe at that entry in `.gitignore`.
 * Empty `alt`, `aria-hidden`, no `title`: decoration takes no description
 * whatever it is a picture of, and **may never carry a mark, a scale or an
 * overlay.**
 *
 * ## ⚠️ This is the site's THIRD third-party origin and it fails hardest
 *
 * `CLAUDE.md` ranks the other two by what their failure costs: a dead Adobe kit
 * costs headline **styling**; a dead GeoSearch costs the **address lookup**. A
 * dead Neon Auth costs **the map**, because nothing behind the button below is
 * reachable without a session. The basemap is ~1,400 committed coordinates
 * specifically so the drawing survives a venue's wifi; this page is in front of
 * it. That trade was made on the owner's instruction, and `RequireSession` plus
 * `settings.require_auth` are where it would be undone.
 */
export default function Landing() {
  return (
    <>
      {/* The filter is document-scoped, so every `<Spray>` on this page — the
          hero, the nav and the footer — needs these defs mounted once, here. */}
      <SprayDefs />
      <PaintRule />
      <SiteNav mode={null} cta="login" />

      <main className="flex-1">
        <LandingHero />
        <LandingInstruments />
        <LandingDashboard />
        <LandingNotify />

        {/* ⚠️ The puddle and its reflection sit in the LOWER half of the frame,
            so the crop is biased down. `object-cover` on a ~1.79:1 photograph in
            a band nearer 3:1 discards most of the height, and centred it throws
            away the subject. */}
        <PhotoCta
          photo="water_03_rooftop_puddle.webp"
          headline="Before the water reaches your steps."
          position="center 62%"
        >
          <LandingCta />
        </PhotoCta>
      </main>

      <SiteFooter />
    </>
  );
}
