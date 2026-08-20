import { FluudMark } from "@/components/fluud-mark";
import { Spray } from "@/components/spray";

/**
 * The About page's sections.
 *
 * ## ⚠️ This page was SIX numbered sections and is now TWO bands
 *
 * Rebuilt to a supplied design on 2026-08-16, on the owner's instruction: a
 * masthead, the two inventory counts, the sources table, and a closing photo
 * band. **What that deleted is listed here rather than only in git, because
 * three of the six were carrying rules and only some of the rules have another
 * home.**
 *
 * ⚠️ **The counts and the sources were merged into ONE grid later the same
 * day, on the owner's instruction** — the two counts stacked on the left, the
 * sources on the right. See `AboutInventory` for what that cost the sources and
 * what it did not.
 *
 * - ❌ ⚠️ **`AboutDecides` — "How it decides".** It stated the two borrowed
 *   thresholds in prose (10 mm is FloodNet's own flood-event definition, 150 mm
 *   is NYC curb height) **and the second-witness rule**: that a depth outside the
 *   plausibility band needs corroboration that is not the same rangefinder. It
 *   was the only page-facing explanation of why this app does not trust a bare
 *   threshold. The rule is still enforced in `watch.is_credible` and
 *   `escalation._depth_is_credible`, pinned equal by `check_watch.py`. **No
 *   surface explains it to a reader now.** The two thresholds survive as figures
 *   on `/` — under an illustration, without their argument.
 * - ❌ ⚠️ **`AboutBlindSpots` — "What it cannot see".** It carried the
 *   **coverage rule** in prose: empty space on the map is unobserved, and
 *   absence of coverage is not absence of flooding. `LIMITATIONS.md` §2 still
 *   argues it and the map's panel footer still counts what its marks withhold,
 *   **but the only page that said it in words to somebody who had not opened the
 *   instrument is gone.**
 * - ❌ ⚠️ **`AboutIntro`'s rules block and `AboutWatch`.** Between them they
 *   carried the **never-safe rule** stated plainly, the ambiguity of silence
 *   (a subscriber who hears nothing cannot tell "no water" from "the poller
 *   froze"), and what the subscriber record holds. ⚠️ **`/terms` §03 and §04 are
 *   what is left of all three.** `/`'s notifications section carried one line —
 *   *"Fluud reports what the sensors see."* — for part of the same day and **it
 *   was deleted too, on the owner's instruction.** Nothing states never-safe to
 *   a reader who has chosen nothing.
 * - ❌ **`AboutContext` — "The rest of the map".** The gauges, the five datums
 *   that are never one scale, and the CSO outfalls being a dated registry rather
 *   than tonight's discharge. ⚠️ **That last one was a recorded debt being
 *   partly paid here, and it is unpaid again** — the root `CLAUDE.md` still owes
 *   it as text under the map's legend.
 * - ❌ **`AboutSources`' three closing paragraphs.** *Every source is public*,
 *   the basemap being ~1,400 committed coordinates with no tile server, the one
 *   fetched origin being the display face, and **the MIT licence statement**.
 *   ⚠️ **Nothing on this site now states the licence.**
 *
 * ⚠️ **The `Access` column went with them** — "Public GraphQL API, no key",
 * "Socrata, fetched by hand". The design's table is two columns and this is it.
 *
 * ## ⚠️ What is unchanged
 *
 * **This page renders no reading, no depth, no age and no severity colour, and
 * it may not start.** ⚠️ **It also no longer polls `/api/status` at all** — it
 * did, for the two thresholds and the mode badge, and the thresholds went with
 * `AboutDecides`. `SiteNav` takes `mode={null}` and `ModeBadge` says `UNKNOWN`,
 * which is `/`'s rule arriving here for `/`'s reason: with `REQUIRE_AUTH` on
 * that request is a guaranteed 401 for a signed-out reader, rendered as *cannot
 * reach the service*.
 *
 * ⚠️ **Every number here is from the root `MEASUREMENTS.md`'s "Verified live"
 * section** and `python -m waterline.poll probe` is the authority. `/` quotes the
 * same two since 2026-08-16, so **both re-measure together** — this is no longer
 * the only page that rots.
 *
 * ## ⚠️ Both bands carry a blue WASH as of 2026-08-16
 *
 * `--wl-wash` on both, on the owner's instruction. It is a translucent
 * gradient, so the ground it lifts is whatever the band already sat on —
 * page background under the masthead, `--card` under the inventory grid — and
 * that grid keeps its one step of separation from the two bands around it.
 *
 * ⚠️ **It was THREE bands and three gradient boxes until the counts and the
 * sources were merged.** The sources rode on page background and now ride on
 * `--card` with the counts, because a grid is one band and a seam down the
 * middle of it would be two.
 *
 * ⚠️ **`/`'s two flat sections take the same token**, in `landing-sections.tsx`.
 * **The two pages are one decision** — a later edit that retunes the wash for
 * `/about` alone is retuning a site-wide surface from one of its two pages.
 *
 * ⚠️ **It is decoration and it takes no input.** A constant, never driven by a
 * depth, a level, `mode` or the time of day — and this page has no figure for
 * one to sit under in any case. The token, the angle and the stops are argued at
 * the declaration in `globals.css`.
 */

/** FloodNet deployments registered today. Moves as they deploy and retire. */
const FLOODNET_DEPLOYMENTS = 425;

/**
 * NYC DOT's whole camera network. Not the number this app watches — that is 27.
 *
 * ⚠️ **It MOVES, and it moved.** 968 on 2026-08-04, **973** on 2026-08-16 —
 * read off the live feed during that day's deploy. `python -m waterline.poll
 * probe` is the authority and `MEASUREMENTS.md` holds the dated figure.
 * `about-sections.tsx` and `landing-sections.tsx` carry this pair and
 * **re-measure together.**
 */
const DOT_CAMERAS = 973;

/* ❌ Six other constants lived here and went with the sections that quoted
   them: `ALERT_VISIBLE` / `ALERT_PERMITTED` (FloodNet's permission and ours),
   `GOLD_PAIRS` / `SILVER_PAIRS` (the 100 m and 250 m pairing tiers), the four
   phantom-reading figures that were the second-witness rule's worked example on
   a real probe, `GAUGE_COUNT`, and `CSO_OUTFALLS` / `CSO_REGISTRY_YEAR`. Each is
   still recoverable from `MEASUREMENTS.md`; none is quoted anywhere now. */

/**
 * The masthead: the wordmark, centred, with the page's one-line claim under it.
 *
 * ⚠️ **CENTRED as of 2026-08-16, on the owner's instruction** — it was a
 * two-column band with the label and `<h1>` on the left and the mark and
 * wordmark on the right. The wordmark is the subject now and the line under it
 * is a **tagline**, which is why the `<h1>` dropped from 48px to 30px: in a
 * centred stack the two compete, and the one that should win is the one that is
 * a picture rather than a sentence.
 *
 * ⚠️ **`.wl-brick` is gone from this page.** It and `/terms` were the last two
 * callers; `/terms` is now the only one. The design draws a flat masthead, and
 * the argument for the texture — that `/` and `/map` should read as one site —
 * was written when `/` was a sign-in screen with no chrome. `/` is a photographic
 * landing page now and matching it means flat.
 *
 * ⚠️ **The `<h1>` is `--font-sans`, and only the wordmark beside it is
 * sprayed.** Nothing carrying a claim is set in the fetched Adobe face.
 *
 * ⚠️ **A DESCRIPTION sits under the tagline as of 2026-08-16, on the owner's
 * instruction, and `landing-hero.tsx` carries the same two sentences.** It is
 * one string on two pages, so an edit to either is an edit to both. It says
 * what the instrument reads and what it pairs; **it states no condition and no
 * figure**, which is what keeps it on a page whose whole remaining property is
 * that it renders neither.
 */
export function AboutMasthead() {
  return (
    <header className="flex flex-col items-center border-b border-[var(--wl-rule)] bg-[image:var(--wl-wash)] px-6 py-20 text-center sm:px-12 sm:py-24 lg:px-20 lg:py-28">
      <p className="num mb-10 text-[11px] tracking-[var(--tracking-label)] text-muted-foreground uppercase">
        About
      </p>

      {/* ⚠️ Decoration: the product named a second time, in paint. `aria-hidden`
          because the `<h1>` under it carries the page's words and `SiteNav`
          already names the site. It renders at EVERY width now — it was
          `max-lg:hidden` when it sat in a two-column masthead, where below `lg`
          it would have stacked under the heading as a second, larger wordmark.
          Centred above the line it is the masthead's subject, so hiding it on a
          phone would leave that page with no masthead at all. */}
      <div
        aria-hidden
        className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6"
      >
        <FluudMark className="flex h-[68px] w-[68px] shrink-0 items-center justify-center border border-[var(--border)] bg-card px-3.5 sm:h-[82px] sm:w-[82px] sm:px-4" />
        <Spray className="text-[clamp(64px,11vw,112px)]">Fluud</Spray>
      </div>

      {/* ⚠️ The tagline, and it is the page's `<h1>`. It reads as a strapline
          under a wordmark rather than as a section heading, which is why it is
          set lighter and smaller than the old two-column masthead's 48px — the
          wordmark above it is now the largest thing in the band. It stays
          `--font-sans`: nothing carrying a claim is set in the fetched Adobe
          face, and only the wordmark beside it is sprayed. */}
      <h1 className="mt-9 max-w-[24ch] text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-[30px]">
        A flood watch for your block
      </h1>

      {/* ⚠️ The site description, and it is the SAME sentence the landing hero
          carries — set on the owner's instruction, 2026-08-16. Two pages
          holding one string means an edit to either is an edit to both. It
          names an instrument and states no condition, which is what keeps it
          legal on a page that renders no figure at all.

          ⚠️ **It was TWO sentences and it is one, 2026-08-17, owner's
          instruction.** The second named the camera pairing and is gone from
          both pages, so **neither description mentions the cameras**. On THIS
          page what still does is the DOT camera count in the inventory grid
          below. ⚠️ **The new sentence makes a PRODUCT claim where the old one
          made an instrument claim** — *monitor* and *custom alerts* are things
          a reader does, and both are behind the session gate. It states no
          condition, which is the property this page is held to. */}
      <p className="mt-6 mx-auto max-w-[58ch] text-[16.5px] leading-[var(--leading-body)] text-[#b9c6d4] sm:text-[18px]">
        Fluud is a hyperlocal flood watch for New York City that lets you
        monitor and craft custom alerts based on the city&rsquo;s embedded water
        sensors.
      </p>
    </header>
  );
}

const SOURCES: { name: string; href: string; use: string }[] = [
  {
    name: "FloodNet",
    href: "https://www.floodnet.nyc/methodology",
    use: "Water depth in millimetres",
  },
  {
    name: "NYC DOT cameras",
    href: "https://webcams.nyctmc.org/",
    use: "Still frames from the watched corners",
  },
  {
    name: "National Weather Service",
    href: "https://api.weather.gov/",
    use: "Flash flood watches and warnings, by county",
  },
  {
    name: "NOAA CO-OPS",
    href: "https://api.tidesandcurrents.noaa.gov/",
    use: "Harbor level and flood stage at the Battery",
  },
  {
    name: "USGS NWIS",
    href: "https://waterservices.usgs.gov/",
    use: "Gage height at four in-city creeks",
  },
  {
    name: "NYC Open Data",
    href: "https://opendata.cityofnewyork.us/",
    use: "Sensor coordinates, neighbourhood crosswalk",
  },
  {
    name: "NY State DEC",
    href: "https://data.ny.gov/",
    use: "Combined sewer outfall locations",
  },
];

/**
 * The inventory and the credit, in ONE grid: the two counts stacked on the
 * left, every upstream owner on the right.
 *
 * ⚠️ **This was two full-bleed bands — `AboutInstruments` and `AboutSources` —
 * until 2026-08-16, when they were merged on the owner's instruction.** Both
 * exports are gone and `about/page.tsx` mounts this one. Two things about the
 * merge are decisions rather than layout:
 *
 * - ⚠️ **ONE band, one ground, one gradient.** The counts sat on `--card` and
 *   the sources on the page background, each with its own `--wl-wash` box.
 *   Side by side that is a seam down the middle of a single band, and the wash
 *   is a 160° gradient, so the two halves would not meet. The grid is `--card`
 *   throughout and the wash composites over it once. **The one step of
 *   separation the counts had is now the whole band's**, against the masthead
 *   above and the photograph below.
 * - ⚠️ **The column split is `lg:` and below it the three blocks stack** in the
 *   order they read: sensors, cameras, sources. Nothing is withheld at any
 *   width.
 *
 * ## The counts
 *
 * Nothing here infers a *condition* from an inventory figure, which is what
 * keeps a stale count a small dishonesty rather than a large one.
 *
 * ⚠️ **The accents are poster paint — `--wl-cyan` and `--wl-select` — and never
 * a ramp colour.** A count tinted by severity would be this page reporting a
 * condition, which is the thing it does not do.
 *
 * ## The sources
 *
 * ⚠️ **This list is the only credit on the site**, since `LandingSources` and
 * the footer's sources line were both removed on 2026-08-06. A source added to
 * `waterline/` is added here in the same commit or it is uncredited.
 *
 * ⚠️ **`/` COUNTS this list as of 2026-08-17 and cannot see it.**
 * `landing-sections.tsx`'s `UNCARDED_SOURCES` is `SOURCES.length` minus the two
 * that band draws cards for, and it is a literal in that file — the eyebrow over
 * *Data feeds from the city* reads `+5 Sources`. **An eighth source is three
 * edits, not two**: this list, that constant, and whatever in `waterline/`
 * fetched it. Nothing in `./scripts/check`, `tsc` or `vitest` can hold the pair
 * together.
 * ⚠️ **All seven survived the merge and a source may never be dropped to make
 * this column fit.** What gives way is the phrasing, and after that the layout.
 *
 * ⚠️ **It is a `<dl>` now and it was a two-column `<table>`.** Half a page is
 * not enough for `Source` beside `What it gives`, so the pair stacks and the
 * headings go — *"Where the data comes from"* was already saying what the two
 * columns said.
 *
 * ❌ ⚠️ **`overflow-x-auto` and `min-w-[460px]` went with the table, and the
 * rule they enforced is satisfied by construction rather than dropped.** A
 * stacked pair has no minimum width, so there is no wide surface left to push
 * the page sideways — the failure measured at 390px on the previous shape of
 * this page. **Anything wide added back to this column brings the scroll box
 * back with it.**
 *
 * ⚠️ **Two phrases were trimmed and only two.** FloodNet lost *", about once a
 * minute"*, which the card two inches to its left now states in full, and NOAA
 * lost one *"water"*. **Every other entry is verbatim**, because a source line
 * shortened past what the source actually gives is a miscredit rather than a
 * tidy column.
 */
export function AboutInventory() {
  return (
    <section className="grid border-b border-[var(--wl-rule)] bg-card bg-[image:var(--wl-wash)] lg:grid-cols-2">
      {/* The two counts, stacked, sharing one divider. The column's own
          `lg:border-r` is the seam against the sources; below `lg` it becomes
          the `border-b` between the two stacked halves of the band.

          ⚠️ The two cells are `lg:flex-1` because the sources column is the
          taller of the two and a grid stretches this one to match it. Left to
          size themselves the counts sit at the top and the whole difference
          becomes one slab of dead card under the second one; halved, the
          divider lands near the middle and the slack reads as spacing. */}
      <div className="flex flex-col border-b border-[var(--wl-rule)] lg:border-r lg:border-b-0">
        <div className="border-b border-[var(--wl-rule)] px-6 py-10 sm:px-12 lg:flex-1 lg:px-20 lg:py-11">
          <Stat n={FLOODNET_DEPLOYMENTS} label="FloodNet sensors" accent="var(--wl-cyan)">
            A public network run by CUNY, NYU and city agencies. Bolted to poles
            at street level, pinging the ground with ultrasound about once a
            minute and publishing the depth in millimetres.
          </Stat>
        </div>
        <div className="px-6 py-10 sm:px-12 lg:flex-1 lg:px-20 lg:py-11">
          <Stat n={DOT_CAMERAS} label="DOT traffic cameras" accent="var(--wl-select)">
            Stills from intersections across the city, refreshed every few
            seconds and never recorded. Where a camera and a sensor watch the
            same corner, Fluud shows both.
          </Stat>
        </div>
      </div>

      <div className="px-6 py-10 sm:px-12 lg:px-20 lg:py-11">
        <h2 className="text-[22px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
          Where the data comes from
        </h2>

        {/* A `<div>` per pair is valid inside a `<dl>` and is what lets the
            term and its description share one bordered row. */}
        <dl className="mt-7 border-t border-[var(--border)]">
          {SOURCES.map((s) => (
            <div
              key={s.name}
              className="flex flex-col gap-1 border-b border-[var(--wl-rule)] py-3"
            >
              <dt>
                <a
                  href={s.href}
                  className="rounded-sm text-[15px] text-foreground underline decoration-[var(--wl-cyan)] decoration-2 underline-offset-4 transition-colors hover:text-[var(--wl-cyan)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
                >
                  {s.name}
                </a>
              </dt>
              <dd className="text-[14px] leading-[1.5] text-[#b9c6d4]">
                {s.use}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ── the shared furniture ─────────────────────────────────────────────────── */

function Stat({
  n,
  label,
  accent,
  children,
}: {
  n: number;
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="num text-[32px] leading-none tracking-[-0.03em] text-foreground">
        {n}
      </p>
      <p
        className="num mt-2 text-[10.5px] tracking-[var(--tracking-label)] uppercase"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p className="mt-3.5 max-w-[52ch] text-[15px] leading-[1.6] text-[#b9c6d4]">
        {children}
      </p>
    </>
  );
}

/* ❌ `Th` lived here and went with the sources table on 2026-08-16. It set the
   `Source` / `What it gives` column headings; the list is a `<dl>` in half a
   page's width now and the `<h2>` above it says what both columns said. */
