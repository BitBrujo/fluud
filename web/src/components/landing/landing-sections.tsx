/**
 * The landing page's three prose sections.
 *
 * ## ⚠️ TWO of these render a depth, and that REVERSES a documented Never rule
 *
 * The root `CLAUDE.md` says: *never put a reading, a depth, an age or a severity
 * colour on `/`, `/about`, `/terms` or any `/auth` view.* `LandingDashboard`
 * renders `180 mm` on the depth ramp and `LandingNotify` renders a `WARNING`
 * chip over `57 mm`. **Both were built as drawn, on the owner's instruction,
 * 2026-08-16**, and the rule was amended in the same change rather than quietly
 * broken. Read the amendment in `CLAUDE.md` before adding a third.
 *
 * ⚠️ **What the original rule was protecting is still real and is what the
 * mitigations below are for.** A number on `/map` arrives wearing a timestamp,
 * a plausibility flag and a freshness clock; this page has none of that
 * machinery and cannot grow it, so a figure here can only ever be an
 * illustration. **Every one of these is a fixed literal in this file. Not one
 * comes off the wire, and none may ever start.**
 *
 * ❌ ⚠️ **The `EXAMPLE · not a live reading` label is DELETED, on the owner's
 * instruction, 2026-08-16.** It sat above both cards and it was the whole of
 * what separated an illustration from a claim about a real corner tonight.
 * **Three of the four conditions the narrowed rule rested on still hold** —
 * every figure is a literal, there is no live clock, and every offset comes off
 * `TRACK_MM` — and the fourth is gone, so a reader who scrolls past these cards
 * now meets a plausible-looking live panel with nothing saying otherwise.
 * ⚠️ **This is the load-bearing absence on the page. Adding a THIRD card without
 * it compounds a cost that is already paid once.**
 *
 * ⚠️ **The card may never be lifted onto real data.** The temptation is
 * obvious — the shapes are right there and `/api/status` is one hook away — and
 * it is exactly the change the deleted `citywide-card.tsx` was: a live figure on
 * the page a signed-out reader lands on, with no session to fetch it and no
 * chrome to dress it. **If a number here ever has to be current, it belongs on
 * `/map`.**
 *
 * ## ⚠️ This page quotes counts again, so it is a SECOND surface that rots
 *
 * 425 and 968 are from `MEASUREMENTS.md`'s **Verified live** section and
 * `python -m waterline.poll probe` is the authority. `about-sections.tsx` was
 * the only page quoting them and was recorded as the one that rots first; this
 * file joins it. **Re-measure both, not one.**
 *
 * ⚠️ **There is a THIRD figure as of 2026-08-17 and it rots against a LIST
 * rather than against a feed.** `UNCARDED_SOURCES` is `5`, and it is
 * `about-sections.tsx`'s seven-entry `SOURCES` minus the two this page draws
 * cards for. `probe` is no authority for it and no re-measurement will catch it
 * — **an eighth source is what moves it**, and the only thing holding the two is
 * the note at each of them.
 *
 * ## ⚠️ The FLAT sections carry a blue wash as of 2026-08-16
 *
 * `--wl-wash`, on the owner's instruction, and `/about`'s two bands take the
 * same token. This page alternates flat bands with full-bleed photographs, and a
 * flat band beside a photograph reads as a hole rather than as a surface. The
 * gradient is translucent, so `bg-card` stays where it was and the wash lifts
 * whichever ground it lands on.
 *
 * ⚠️ **`LandingNotify` DIVERGED later the same day and it is the only band on
 * either page that has.** It takes `--wl-wash-vertical` — same hue, same
 * translucency, roughly twice the strength, and **vertical**, light at the top
 * and dark at the foot. Owner's instruction. `Section` below is still on
 * `--wl-wash`, so `/` now carries both and the two bands are meant to differ.
 * **Retuning one no longer retunes the page**, which is the property the single
 * shared token used to have — a change to the wash now has to be read against
 * two declarations.
 *
 * ⚠️ **Vertical is the one thing `--wl-wash` explicitly refuses**, because a
 * mid stop on that axis draws a horizontal edge across a full-bleed band and
 * this site does not draw a level it does not mean. **What buys the exception is
 * that the vertical ramp has TWO stops and no inflection**; the argument, and
 * the instruction not to add a third, are at the declaration.
 *
 * ⚠️ **It is DECORATION and it may never take an input.** Not a depth, not a
 * level, not the time of day — `.wl-swell`'s rule, which binds the shape rather
 * than the file it was deleted from. **The illustrated cards above sit on top of
 * one**, which is the reason to be careful here: a ground that moved with a
 * number would make the two figures on this page look measured. Both gradients
 * are constants and both end at the palette's own ground; the angle and the
 * stops are argued at their declaration in `globals.css`.
 */

import { NotifyWalkthrough } from "@/components/landing/notify-walkthrough";

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

/**
 * The illustration's scale, in millimetres, and everything on the bar is
 * derived from it.
 *
 * ⚠️ **The design drew the fill at 72%, the curb tick at 60% and the flood tick
 * at 6.7%, and those three do not describe one scale.** 72% and 60% put the
 * track at 250 mm; 6.7% is 10 mm read against 150. Left as drawn, the tick
 * labelled *10 mm* sits where 16.75 mm falls — a mislabelled threshold on a
 * depth scale, which is the one kind of error this file is least allowed to
 * ship even as decoration. All three are computed from this constant instead.
 */
const TRACK_MM = 250;

/** The illustrated depth. A literal. Nothing on this page fetches one. */
const EXAMPLE_DEPTH_MM = 180;


/**
 * ⚠️ **Borrowed, not invented, and they are the real ones.** 10 mm is
 * FloodNet's own flood-event definition and 150 mm is NYC curb height — the same
 * two figures `/api/status`'s `thresholds` block carries. They are duplicated
 * here as literals rather than fetched, because fetching them would make this
 * page poll, which it may not do.
 */
const FLOOD_EVENT_MM = 10;
const CURB_HEIGHT_MM = 150;

const pct = (mm: number) => `${((mm / TRACK_MM) * 100).toFixed(1)}%`;

/**
 * The upstream sources this band does NOT draw a card for.
 *
 * ⚠️ **A REMAINDER, not a total.** `about-sections.tsx`'s `SOURCES` is the
 * site's only credit and it holds **seven**; two of them — FloodNet and DOT —
 * are the two cards below. The eyebrow reads `+5 Sources` because five more are
 * upstream of this instrument with no card here. **`7 − 2`, and the `+` is what
 * makes the sentence true.** Written `5 Sources` it would contradict the two
 * cards under it.
 *
 * ⚠️ **It rots against a list in another file and nothing can see that.**
 * `about-sections.tsx` carries the rule that a source added to `waterline/` is
 * credited there in the same commit; **this number moves in that commit too.**
 * The alternative — importing `SOURCES` here — was refused for the reason the
 * two counts below are already duplicated rather than shared: these are two
 * page-specific prose modules and neither is the other's data layer.
 */
const UNCARDED_SOURCES = 5;

/**
 * What the instruments are, and how many of them there are.
 *
 * Two counts and two paragraphs. Nothing here infers a *condition* from an
 * inventory figure, which is what keeps a stale count a small dishonesty rather
 * than a large one.
 *
 * ⚠️ **The title stopped counting on 2026-08-17** — *"Two data feeds from the
 * city"* → *"Data feeds from the city"* — and the eyebrow started, on the
 * owner's instruction. The band still draws exactly two cards. **A title
 * naming a number that the eyebrow above it then adds to is two counts of one
 * inventory**, and the reader has to reconcile them; the noun carries the
 * subject and the eyebrow carries the arithmetic.
 */
export function LandingInstruments() {
  return (
    <Section
      label={`+${UNCARDED_SOURCES} Sources`}
      title="Data feeds from the city"
      titleRight
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <StatCard
          n={FLOODNET_DEPLOYMENTS}
          label="FloodNet sensors"
          accent="var(--wl-cyan)"
          icon={<SensorGlyph />}
        >
          A public sensor network run by CUNY, NYU and city agencies. Each sensor
          measures the water depth on its street about once a minute. The
          readings are open to anyone.
        </StatCard>
        <StatCard
          n={DOT_CAMERAS}
          label="DOT traffic cameras"
          accent="var(--wl-select)"
          icon={<CameraGlyph />}
        >
          The city&rsquo;s traffic cameras. Each one shows a still of an
          intersection, refreshed every few seconds. Anyone can look at a corner
          right now.
        </StatCard>
      </div>
    </Section>
  );
}

/**
 * What the instrument shows, illustrated by a sample sensor face.
 *
 * ⚠️ **The card is an illustration and nothing on the page says so any more.**
 * See this file's docblock — the depth, the age and the corner name are all
 * fixed literals and none may ever be lifted onto the wire.
 *
 * ⚠️ **The corner name is a real intersection and that is deliberate.** A
 * placeholder like `{corner}` reads as a bug on a finished page, and an invented
 * street reads as a real one to anybody who does not know the block. A real
 * corner under a label that says *not a live reading* is the least confusing of
 * the three.
 */
export function LandingDashboard() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--wl-rule)]">
      <img
        src="/photoz/water_06_storm_drain.webp"
        alt=""
        aria-hidden
        width={2200}
        height={1228}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "60% 50%" }}
      />

      {/* Two scrims: one across, one down. The type sits on the left and the
          card floats over the middle, so neither direction alone is enough. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg," +
            "color-mix(in srgb, var(--background) 97%, transparent) 0%," +
            "color-mix(in srgb, var(--background) 93%, transparent) 38%," +
            "color-mix(in srgb, var(--background) 55%, transparent) 62%," +
            "color-mix(in srgb, var(--background) 25%, transparent) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg," +
            "color-mix(in srgb, var(--background) 60%, transparent) 0%," +
            "color-mix(in srgb, var(--background) 10%, transparent) 45%," +
            "color-mix(in srgb, var(--background) 75%, transparent) 100%)",
        }}
      />

      <div className="relative px-6 py-24 sm:px-12 sm:py-32 lg:px-20">
        <Label>The dashboard</Label>
        <Title className="max-w-[20ch]">
          See the depth and the street at once
        </Title>
        <p className="mt-6 max-w-[50ch] text-[16.5px] leading-[var(--leading-body)] text-[#b9c6d4] sm:text-[18px]">
          Where a sensor and a camera watch the same intersection, Fluud shows
          both: how deep the water is right now, and what that looks like on the
          street.
        </p>

        <div className="mt-12 max-w-[420px]">
          <div
            className="rounded-sm border border-[var(--border)] px-6 py-5"
            style={{
              background: "color-mix(in srgb, var(--card) 92%, transparent)",
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="num text-[11px] tracking-[var(--tracking-label)] text-muted-foreground uppercase">
                3rd Ave &amp; Carroll St
              </p>
              {/* ⚠️ A FIXED string, never a live clock. `ReadingAge` subscribes
                  to `useNow(1000)` and must not be mounted here — a ticking age
                  is the single strongest signal that a number is current. */}
              <p className="num shrink-0 text-[11px] text-muted-foreground/80">
                read 40s ago
              </p>
            </div>

            <p className="num mt-3.5 text-[44px] leading-none tracking-[-0.03em] text-foreground">
              {EXAMPLE_DEPTH_MM}{" "}
              <span className="text-[20px] text-muted-foreground">mm</span>
            </p>

            {/* The depth ramp, on the two borrowed thresholds. Every offset is
                derived from `TRACK_MM` so the ticks and the fill describe one
                scale — see the constant. */}
            <div className="relative mt-4 h-2.5 border border-[var(--border)] bg-background">
              <div
                className="absolute top-0 bottom-0 left-0 opacity-85"
                style={{
                  width: pct(EXAMPLE_DEPTH_MM),
                  background: "var(--wl-warning)",
                }}
              />
              <div
                className="absolute top-[-5px] bottom-[-5px] w-0.5 bg-muted-foreground"
                style={{ left: pct(FLOOD_EVENT_MM) }}
              />
              <div
                className="absolute top-[-5px] bottom-[-5px] w-0.5"
                style={{
                  left: pct(CURB_HEIGHT_MM),
                  background: "var(--wl-emergency)",
                }}
              />
            </div>

            <div className="mt-2 flex justify-between gap-3">
              <p className="num text-[10.5px] tracking-[0.06em] text-muted-foreground">
                {FLOOD_EVENT_MM} mm · water on the road
              </p>
              <p className="num text-[10.5px] tracking-[0.06em] text-[var(--wl-emergency)]">
                {CURB_HEIGHT_MM} mm · over the curb
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The notifications section: the video in a framed left column, and a title
 * rail on the right reading *Set your alerts*.
 *
 * ⚠️ **It was A VIDEO AND NOTHING ELSE for a few hours on 2026-08-16, and the
 * title rail is the owner's next instruction on the same day.** Everything else
 * that was deleted stays deleted — the `Notifications` label, the body
 * paragraph, the three-step `<ol>` and the illustrated `EmailCard`. **Four
 * words came back, not the section.** What draws the steps is still
 * `NotifyWalkthrough`, a 27s looping panel.
 *
 * ⚠️ **The heading is the rail's, for everybody.** `notify-walkthrough.tsx`'s
 * `sr-only` block had the section's only `<h2>` and **it was removed in the same
 * change** — two headings in one `<section>` saying two different things names
 * the section twice to a screen reader. The rest of that block is untouched: it
 * is still the only text equivalent of what the video draws, and it still moves
 * with the two compositions.
 *
 * ⚠️ **An ENVELOPE, and not a bell.** *"It writes; it does not speak"* — the one
 * place this app says anything is an email, the on-page alert system is unwired,
 * and a bell beside `Set your alerts` would draw a push notification that does
 * not exist. The glyph is decoration on `SensorGlyph`'s terms: `aria-hidden`, no
 * `<title>`, and it takes `--wl-select` because that token means *a fact about
 * the reader* — which is what an alert setting is, and what the drawn rings and
 * chips inside the video beside it already wear. **It may never take a band, a
 * depth or a state colour.**
 *
 * ⚠️ **So this section's words are pixels now.** The text equivalent lives in
 * one `sr-only` block inside that component, which is what a screen reader, a
 * search engine and a reader with no JavaScript get. **Read its docblock before
 * touching either composition** — it is the only copy of this copy left, and
 * nothing can check it against two MP4s.
 *
 * ❌ ⚠️ **The never-safe line was deleted from here earlier the same day** and
 * it did not come back with the video. This section ended *"Fluud reports what
 * the sensors see."*, which was the site's **only** unconditional statement of
 * the never-safe rule to a reader who had chosen nothing. **What is left is
 * `/terms` §03**, reached from `SiteFooter` and nowhere else, plus
 * `station-list.tsx`'s empty states behind the session gate. **If one sentence
 * ever goes back on this site, it is that one, here.**
 *
 * ❌ ⚠️ **`EmailCard` and `Step` went with the strip and are DELETED, not
 * unmounted.** `EXAMPLE_WARNING_MM` went with them, so the illustrated `57 mm`
 * that used to be a literal in this file is now a literal in two HyperFrames
 * compositions and a sentence in that `sr-only` block. **`/` still renders an
 * illustrated depth; it renders it somewhere no compiler can reach.**
 * `LandingDashboard`'s `180 mm` is untouched and is the one illustrated depth
 * still written in TypeScript here.
 *
 * ⚠️ **This band is the one that left `--wl-wash`.** It takes
 * `--wl-wash-vertical` on the owner's instruction — a blue gradient down the
 * band, light at the top and dark at the foot, about twice the strength of the
 * shared wash. `LandingInstruments` and both `/about` bands are unchanged, so
 * **this is the only band on either page that diverges** and the divergence is
 * deliberate rather than drift. **`bg-card` still has to be the ground** for the
 * reason below: the gradient is a translucent `background-image` and composites
 * over whatever it is laid on.
 *
 * ⚠️ **The gradient sits UNDER the video's own frame and may never become
 * one.** The `<video>` and the `<img>` carry the border and the radius
 * themselves, so a stop tuned to land on that edge would be a frame drawn twice
 * — and in the resting `none` branch, once, around nothing.
 *
 * ⚠️ **The padding came BACK with the column and the slide-deck argument is
 * spent.** The section lost its padding when the video was full-bleed, because a
 * lone 16:9 panel centred in a `py-32` band read as a slide. In a column beside
 * a title it is the shape every other band on this page already has, so it takes
 * the same `px-6 py-24 sm:px-12 sm:py-32 lg:px-20`. **`bg-card` still has to be
 * the ground** — the panel is drawn on `--card`, and now that the media carries
 * a radius the band shows through each corner arc.
 *
 * ⚠️ **This section still does NOT use `Section`, and now for a different
 * reason.** The old one — a title rail beside a body reads as a comparison when
 * the body is a sequence — was overtaken by the instruction that put a rail
 * here. What keeps it inline is that `Section` requires a `label`, and the
 * `Notifications` label is deleted: passing `""` renders an empty `<p>` with a
 * `mb-4` under it, which is a blank line box where a label failed to load.
 *
 * ⚠️ **`xl`, not `lg`, and it is arithmetic rather than taste.** Every other
 * band splits at `lg`. At 1024 this one would give the video
 * `1024 − 160 − 64 − 300 = 500px`, and the wide cut's own docblock records that
 * 1920px of drawn interface at 340px is a smear — 500 is not far enough from it
 * to be worth the split. At `xl` the floor is ~756px and it rises from there.
 * **Below `xl` the section stacks and the video keeps the full content width**,
 * which is the state it was measured in.
 */
export function LandingNotify() {
  return (
    /* ⚠️ `bg-card` STAYS under the wash and is not replaced by it. The wash is a
       translucent `background-image`; the ground it composites over is this
       class. Drop it and the band goes back to page background wearing a tint —
       and here that seam would land inside the video frame's corner radii. */
    /* ⚠️ `--wl-wash-vertical`, NOT `--wl-wash` — this is the one band on either
       page that diverges, and the divergence is the instruction. See the
       docblock above and the declaration in `globals.css`. */
    <section className="grid gap-8 border-b border-[var(--wl-rule)] bg-card bg-[image:var(--wl-wash-vertical)] px-6 py-24 sm:px-12 sm:py-32 lg:px-20 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-16">
      {/* ⚠️ The title is FIRST in source and painted right at `xl` —
          `Section`'s `titleRight` rule, for its reason. Stacked, and to a screen
          reader, the heading has to arrive before the thing it heads; swapping
          the JSX instead would open the section on a video and name it
          afterwards. */}
      {/* ⚠️ `xl:self-center`, and it is `self-` rather than `items-center` on
          the grid: the video column must keep stretching to its own aspect, and
          a row-level `items-center` would shrink-wrap both children. Below `xl`
          there is one column and nothing to centre against. */}
      <div className="xl:order-2 xl:self-center">
        <div
          className="wl-glow mb-5"
          style={{ color: "var(--wl-select)" }}
        >
          <EnvelopeGlyph />
        </div>
        <Title>Set your alerts</Title>
      </div>
      <div className="min-w-0 xl:order-1">
        <NotifyWalkthrough />
      </div>
    </section>
  );
}

/* ── the shared furniture ─────────────────────────────────────────────────── */

/**
 * A label / title column beside a body column, which is the page's one section
 * shape.
 *
 * ⚠️ **`lg:grid-cols-[300px_minmax(0,1fr)]`, and the `minmax(0,…)` is
 * load-bearing.** An `auto`-floored track takes its content's min-content width,
 * which on the notification grid is a 300px card plus a paragraph — measured
 * once already on `/about`, where the same omission scrolled the whole document
 * sideways by 194px at 390.
 */
function Section({
  label,
  title,
  tint,
  titleRight,
  children,
}: {
  label: string;
  title: string;
  /** One step up, `--card`, so consecutive sections separate without a rule. */
  tint?: boolean;
  /**
   * Puts the title rail on the RIGHT and the body on the left, at `lg` and up.
   *
   * ⚠️ **It reorders the PAINT and never the DOM.** The label and the title stay
   * first in source, so a screen reader and a reader below `lg` both meet the
   * heading before the thing it heads. Swapping the JSX instead would put the
   * body first for both, and a stacked section that opens on two cards and
   * names them afterwards reads as a heading that failed to load.
   *
   * ⚠️ **The rail's 340px does not move with it.** It is the measured width of
   * the title column, so the two tracks are exchanged rather than resized.
   */
  titleRight?: boolean;
  children: React.ReactNode;
}) {
  return (
    /* ⚠️ The wash is UNCONDITIONAL and `tint` still picks the ground under it.
       One translucent gradient composites over whichever of the two this section
       is on, so the tinted and untinted bands keep the one step of separation
       they had — the wash lifts both by the same amount and ends transparent. */
    <section
      className={`grid gap-8 border-b border-[var(--wl-rule)] bg-[image:var(--wl-wash)] px-6 py-24 sm:px-12 sm:py-32 lg:gap-20 lg:px-20 ${
        titleRight
          ? "lg:grid-cols-[minmax(0,1fr)_340px]"
          : "lg:grid-cols-[340px_minmax(0,1fr)]"
      } ${tint ? "bg-card" : ""}`}
    >
      <div className={titleRight ? "lg:order-2" : ""}>
        <Label>{label}</Label>
        <Title>{title}</Title>
      </div>
      <div className={`min-w-0 ${titleRight ? "lg:order-1" : ""}`}>
        {children}
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="num mb-4 text-[11px] tracking-[var(--tracking-label)] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * ⚠️ **Set in `--font-sans`, not in `Spray`.** The mockup's section titles are
 * the body face at 30/600; only the wordmark is sprayed. Nothing carrying a
 * factual claim is set in the fetched Adobe face — see `spray.tsx`.
 */
function Title({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-[32px] leading-[1.08] font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-[42px] ${className}`}
    >
      {children}
    </h2>
  );
}

/**
 * A count and what it counts.
 *
 * ⚠️ **`accent` is poster paint — `--wl-cyan` or `--wl-select` — and never a
 * ramp colour.** These are inventory figures. A count tinted by severity would
 * be this page reporting a condition, which is the thing it does not do.
 */
function StatCard({
  n,
  label,
  accent,
  icon,
  children,
}: {
  n: number;
  label: string;
  accent: string;
  /**
   * ⚠️ **DECORATION.** It draws the instrument class the card is about and it
   * takes the card's own `accent`, which is poster paint on no scale — so it
   * cannot vary with anything, because there is nothing here to vary with.
   * `aria-hidden` with no `<title>`: the count and the label beside it are the
   * whole of the claim. **It may never take a band, a depth or a state colour.**
   *
   * ⚠️ **It carries `.wl-glow`, and the halo is DECORATION on the same terms.**
   * A constant `drop-shadow` in `currentColor`, off `accent`, taking no input of
   * any kind. **It is STATIC and must stay static** — it breathed on a 4s loop
   * for one revision and the movement came off on the owner's instruction. A
   * pulsing halo beside a count reads as a heartbeat, i.e. as liveness, on a
   * page that polls nothing. The argument is at the rule in `globals.css`.
   */
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    /* ⚠️ The icon is its own COLUMN and it is `shrink-0`. Left to flex it would
       give up width to the paragraph and the two cards would draw the same glyph
       at two sizes, which reads as two kinds of instrument rather than two
       counts of one. The text column is `min-w-0` so it is the side that
       narrows. */
    <div className="flex flex-1 items-center gap-5 rounded-sm border border-[var(--border)] bg-background p-7 sm:gap-6">
      {icon ? (
        <div className="wl-glow shrink-0" style={{ color: accent }}>
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="num text-[30px] leading-none tracking-[-0.02em] text-foreground">
          {n}
        </p>
        <p
          className="num mt-2.5 text-[18px] tracking-[var(--tracking-label)] uppercase"
          style={{ color: accent }}
        >
          {label}
        </p>
        <p className="mt-3 text-[14px] leading-[1.6] text-[#b9c6d4]">
          {children}
        </p>
      </div>
    </div>
  );
}

/**
 * A sensor on its pole, sounding the ground.
 *
 * ⚠️ **The arcs are the ultrasound and they are FIXED GEOMETRY.** They take no
 * input and they do not move — `FluudMark`'s wave rule, which binds any drawn
 * water on this site: the moment such a thing takes a reading it is a depth with
 * no age, no plausibility and no scale beside it.
 *
 * ⚠️ **`strokeWidth` is in viewBox units and the box is 26 against a 96px
 * render**, so every value here is multiplied by ~3.7 on the way out. `0.85`
 * draws at ~3.1px; a normal-looking `1.4` draws a 5px rope. **Both glyphs carry
 * the same number and they move together** — two line weights side by side in
 * one row read as two different kinds of thing.
 */
function SensorGlyph() {
  return (
    <svg
      className="h-16 w-16 sm:h-24 sm:w-24"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.85"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M13 3v9" />
      <path d="M9.5 3h7" />
      <path d="M9.8 15.4a4.5 4.5 0 0 1 6.4 0" />
      <path d="M7.4 18.6a8 8 0 0 1 11.2 0" />
      <path d="M4 22.5h18" />
    </svg>
  );
}

/** A camera on its mast, looking at the corner. Decoration, on the rule above. */
function CameraGlyph() {
  return (
    <svg
      className="h-16 w-16 sm:h-24 sm:w-24"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8.5" y="5.5" width="12" height="7" rx="1.5" />
      <path d="M8.5 9h-3" />
      <path d="M5.5 4v18.5" />
      <path d="M2.5 22.5h6" />
      <circle cx="17" cy="9" r="1.6" />
    </svg>
  );
}

/**
 * An envelope. What an alert from Fluud actually is.
 *
 * ⚠️ **Not a bell, and the reason is in `LandingNotify`'s docblock**: this app
 * writes and does not speak, so a push-notification glyph would draw a channel
 * that does not exist. Decoration on `SensorGlyph`'s terms — `aria-hidden`, no
 * `<title>`, and it carries the same `strokeWidth="0.85"` those two do, because
 * three glyphs on one page at two line weights read as three different kinds of
 * thing. **All three move together.**
 */
function EnvelopeGlyph() {
  return (
    <svg
      className="h-16 w-16 sm:h-24 sm:w-24"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="21" height="14" rx="1.5" />
      <path d="M3.2 7 13 14.4 22.8 7" />
    </svg>
  );
}
