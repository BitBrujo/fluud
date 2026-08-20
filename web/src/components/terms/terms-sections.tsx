import { NumberedSection, Rule, Rules } from "@/components/numbered-section";
import { Spray } from "@/components/spray";

/**
 * The Terms of Service page's sections, at `/terms`.
 *
 * ## ⚠️ These terms describe what the code actually does, and that is the whole
 * standard they are held to
 *
 * Every factual claim below is checkable against this repo, and several of them
 * are load-bearing promises rather than boilerplate: what the subscriber table
 * holds (`schema.sql`, LIMITATIONS §16), what happens to a typed address
 * (`lib/geosearch.ts`, and the fact that this feature changed no code under
 * `waterline/` at all), and that unsubscribing is a hard delete with a cascade.
 * **If one of those changes in code, it changes here in the same commit.** A
 * terms page that overstates a privacy property is worse than no terms page,
 * because it is the one surface a reader is entitled to treat as a commitment.
 *
 * ## ⚠️ It states the never-safe rule and it does not soften it
 *
 * Section 03 says outright that this system never reports that anywhere is
 * safe. That is the same sentence the footer carries and the same sentence
 * `station-list.tsx`, `citywide-card.tsx` and `block-search.tsx` carry in their
 * empty states. It is quoted here because a terms page is where a reader looks
 * for what they may and may not rely on, and "you may not rely on this for
 * safety" is the single most important thing this project has to say.
 *
 * ## This page renders no reading
 *
 * Not a depth, not an age, not a severity, not a count of what is happening
 * now — the same property `/about` holds and for the same reason. It polls
 * `/api/status` for exactly two things: the mode badge in the nav and the
 * localised disclaimer in the footer.
 *
 * ## ⚠️ It quotes no warning copy
 *
 * The landing page carries the one verbatim template this site shows, with its
 * `{place}` slot left visible. A second copy on a third page would be a second
 * thing to keep in step with `agent._TEMPLATES` (the templated-copy rule). This page
 * describes the feature and quotes nothing.
 */

/**
 * The date these terms last changed. ⚠️ **Bump it in the same commit as any
 * edit below.** A terms page whose effective date lags its own text is telling
 * a reader they have read the version they agreed to when they have not.
 */
const EFFECTIVE = "16 August 2026";

/**
 * ⚠️ **A published contact address is the owner's call, so this defaults to
 * `null` and the paragraph does not render.**
 *
 * It is left here as one line to change rather than left out, because this site
 * holds email addresses and the ordinary expectation is a way to reach whoever
 * holds them. What stands in for it today is real and is stated in section 04:
 * every message carries an unsubscribe link, and that link is a hard delete
 * with a cascade — so the one action a subscriber is most likely to want needs
 * no correspondence at all. Set this to an address to render the paragraph.
 */
const CONTACT: string | null = null;

export function TermsIntro() {
  return (
    <section
      className="wl-brick border-b border-[var(--wl-rule)] px-5 py-14 sm:px-8 lg:px-11 lg:py-20"
      style={{ "--wl-brick-mortar": "#120d11" } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <h1>
          <Spray className="text-[clamp(34px,7vw,64px)]">
            Terms of service
          </Spray>
        </h1>

        <div className="mt-7 grid gap-8 lg:grid-cols-2">
          <p className="max-w-[62ch] text-[17px] leading-relaxed text-pretty">
            These are the terms for using Fluud. They are short on purpose.
            The important one is third: this is a prototype and you may not rely
            on it for a decision about your safety.
          </p>

          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
            Using this site means you accept them. If you do not accept them,
            stop using the site. Everything below describes what the software
            actually does. Nothing below is a description of what it might do
            one day.
          </p>
        </div>

        <p className="mt-8 font-mono text-[12px] tracking-[0.1em] text-muted-foreground/80 uppercase">
          Effective {EFFECTIVE}
        </p>
      </div>
    </section>
  );
}

export function TermsWhatThisIs() {
  return (
    <NumberedSection
      n="01"
      accent="var(--wl-select)"
      title="What this is, and who runs it"
      tint={false}
    >
      <p>
        Fluud is a prototype that watches New York for street flooding. It
        reads a public network of depth sensors, pairs them to the city&rsquo;s
        traffic cameras, and writes down what those instruments report. It is
        research and a demonstration. It is not a product and it is not a public
        service.
      </p>

      {/* ⚠️ This paragraph is the not-an-official rule in the register a terms page reads
          in. The Q&A persona may never claim to speak for the city (`agent.py`'s
          conversation context enforces it in the copy), and the project itself
          may not either. Every operator named here is upstream and none of them
          has reviewed, approved or heard of this. */}
      <p>
        It is built and run by an independent developer. It is not affiliated
        with the City of New York, FloodNet, the National Weather Service, NOAA,
        the USGS, or any other agency. None of them has reviewed it. None of
        them endorses it. It holds no city office and it speaks for nobody.
      </p>

      <p>
        The site is free. There is no account, no payment and nothing to sign
        up for except the email watch described in section 04.
      </p>
    </NumberedSection>
  );
}

export function TermsNoWarranty() {
  return (
    <NumberedSection
      n="02"
      accent="var(--wl-cyan)"
      title="No warranty"
      tint
    >
      <p>
        The site and everything on it are provided as is. There is no warranty
        of any kind, express or implied. That includes any warranty of accuracy,
        completeness, availability, timeliness, or fitness for a particular
        purpose.
      </p>

      {/* ⚠️ Not a disclaimer boilerplate paragraph. Every failure named here is
          one this repo has measured and documented: the frozen-poller rule (a throttled
          poller serving stale readings), the second-witness rule and `depth_plausible`
          (rangefinders reporting depths their own instrument cannot support),
          and `floodnet`'s publication lag. Naming them is the honest version of
          "no warranty", and it is what the cards on the map page already say
          one reading at a time. */}
      <p>
        Readings can be wrong. They can be late, and they can be missing.
        Sensors fail and report depths that are not real. Cameras go dark. The
        poller can stop without anything looking broken, which is why every
        number on the map page carries its own age. Treat an old number as an
        old number.
      </p>

      <p>
        To the fullest extent the law allows, the developer is not liable for
        any loss or damage arising from your use of this site, from anything it
        reported, or from anything it failed to report. Some jurisdictions do
        not allow parts of this exclusion. Where that is so, it applies as far
        as it can and no further.
      </p>

      <p>
        The site can change or disappear at any time. There is no uptime
        commitment and there is no support desk.
      </p>
    </NumberedSection>
  );
}

export function TermsNotEmergency() {
  return (
    <NumberedSection
      n="03"
      accent="var(--wl-violet)"
      title="This is not an emergency service"
      tint={false}
    >
      <p>
        Do not use Fluud to decide whether a place is safe. Do not use it to
        decide whether to travel, whether to shelter, or whether to move a
        person or a vehicle.
      </p>

      {/* ⚠️ Invariant 1, verbatim in the sentence the footer and three empty
          states also carry. It may not be softened here and it may not be
          moved behind a disclosure — this is the section a reader opens to find
          out what they are allowed to rely on. */}
      <Rules>
        <Rule>
          This system never reports that anywhere is safe. Every statement it
          makes is about an instrument.
        </Rule>
        <Rule>
          Coverage is thin. Empty space on the map is unobserved. It is not
          clear.
        </Rule>
        <Rule>
          Coverage is also biased. Cameras watch intersections and highways. The
          side streets and basement apartments most at risk have none.
        </Rule>
        <Rule>
          Official flood warnings come from the National Weather Service and
          Notify NYC. Follow those.
        </Rule>
        <Rule>In an emergency, call 911.</Rule>
      </Rules>

      <p>
        Nothing on this site is an official warning and nothing on it may be
        presented as one. See section 06.
      </p>
    </NumberedSection>
  );
}

export function TermsWatch() {
  return (
    <NumberedSection
      n="04"
      accent="var(--wl-select)"
      title="The email watch, and what is stored"
      tint
    >
      {/* ⚠️ **TWO ROUTES IN SINCE 2026-08-16, and this paragraph names both
          because naming one would be false for every reader who took the
          other.** It said *"Nothing is sent until you confirm the address from
          a link"* full stop, and that stopped being true when
          `api.watch_subscribe` gained its verified-self branch: a reader signed
          in with an address their identity provider has verified is subscribed
          outright, with no confirmation step at all. **This is a term of
          service, so it moves in the same commit as that branch.** */}
      <p>
        You can pick sensors on the map page and give an email address. A
        message goes out when one of them crosses the flood threshold, and
        again if the water passes the curb. If you are signed in and the
        address is the one you signed in with, and your sign-in provider has
        verified it, the watch starts straight away — you have already proved
        you hold that mailbox. For any other address, nothing is sent until you
        confirm it from a link.
      </p>

      {/* ⚠️ LIMITATIONS §16. This list is the schema, not a summary of it — it
          is `subscribers`, `subscriptions` and `camera_subscriptions` in full.
          The three properties that make those tables defensible at all are
          self-selection, instrument granularity and hard deletion, and all
          three have to hold. **Do not describe the record as smaller than it
          is, and do not let it grow without this list growing in the same
          commit.** */}
      <p>
        The whole record is your email address, a language, two tokens, the
        instruments you picked, your notification settings, and two
        timestamps. The settings are a minimum alert level, a frequency,
        optional quiet hours, and per-instrument copies of the first two.
        There is no name. There is no IP address, no user agent, no referrer
        and no session. There is no open tracking and no click tracking. No
        surface anywhere lists who is watching a corner.
      </p>

      {/* ⚠️ **THE SIGN-IN RECORD IS A SECOND RECORD AND IT IS BIGGER THAN THE
          ONE ABOVE.** This paragraph exists because the list above is exact
          about `subscribers` and would, without it, read as a claim about
          everything this product holds. It is not: signing in creates a row in
          Neon Auth's own managed schema, which this repo does not define, does
          not control and cannot trim.

          Every field named here was read off the live database
          (`neon_auth.user`, `.account`, `.session`) rather than off Neon's
          documentation. ⚠️ **`ipAddress` and `userAgent` on the session row are
          the two that directly contradict the sentence above them**, which is
          exactly why they are named rather than covered by "and some other
          fields". The paragraph above stays true of OUR table; this one says
          what the sign-in adds.

          ⚠️ **There are TWO sign-in shapes since 2026-08-14 and this section
          has to carry both.** `auth-provider.tsx` turned `credentials` on, so a
          reader can sign up with an email and a password — and Better Auth
          writes the hash to `neon_auth.account.password`, a column verified
          present on the live database. **A version of this paragraph naming
          only the Google fields is not merely incomplete; it is wrong for
          every reader who never used Google.** The prop and this paragraph
          move together.

          **If Neon's schema changes, this paragraph is wrong until somebody
          re-reads it.** Nothing in `./scripts/check` can see a managed
          schema. */}
      <p>
        Signing in creates a separate record. Neon Auth holds it rather than
        the table above. It has your name and your email address.
      </p>

      <p>
        Google sign-in adds your Google profile picture, your Google account
        identifier, and the access tokens Google issued. Signing up with an
        email address adds a hash of your password. The password itself goes to
        Neon&rsquo;s auth service. This site never receives it.
      </p>

      <p>
        Each sign-in also writes a session row. Those rows carry your IP
        address and your browser&rsquo;s user agent.
      </p>

      <p>
        That is more than the watch record keeps, and it is worth being plain
        about the difference. The watch record is the one this project
        designed and holds to a minimum. The sign-in record is Neon&rsquo;s,
        it is the ordinary shape of a hosted login, and it is the price of
        having one at all.
      </p>

      {/* ⚠️ `notify.allowed`'s exemption, stated as a term because it cuts
          the other way from every promise around it: this is a message you
          asked to mute and will get anyway. A settings surface that implied
          otherwise would sell a silence the system refuses to sell. */}
      <p>
        Your settings can reduce what is sent. They cannot silence an
        emergency. A message about water above the curb goes out whatever the
        trigger, frequency or quiet hours say. Quiet hours drop messages
        rather than delaying them — a warning held until morning would
        describe last night.
      </p>

      <p>
        Your address is used for one thing, which is sending you the messages
        you asked for. It is never sold. It is never shared. It is never used
        for marketing.
      </p>

      <p>
        Every message carries an unsubscribe link. Following it deletes the
        record outright, along with the instruments you picked and anything
        still queued for you. It is a delete and not a flag.
      </p>

      {/* ⚠️ LIMITATIONS §16's central admission, and it belongs in the terms
          because it is the one thing a subscriber could reasonably believe and
          be wrong about. The stand-down email and the silence email were both
          removed on 2026-08-05; a subscriber's last word about a corner is now
          the worst one. Do not weaken this paragraph into "delivery is not
          guaranteed". */}
      <p>
        Silence is not an all-clear. A quiet inbox can mean there is no water.
        It can also mean the mail failed, or a relay filed it as spam, or the
        poller stopped, or your sensor stopped reporting, or there is no sensor
        where the water is. You cannot tell those apart from an inbox. You have
        to open the page.
      </p>

      <p>
        You are also not told when water goes back down. The page says so. The
        mail does not.
      </p>
    </NumberedSection>
  );
}

export function TermsPrivacy() {
  return (
    <NumberedSection
      n="05"
      accent="var(--wl-cyan)"
      title="The address you type, and what this site does not collect"
      tint={false}
      /* ⚠️ The sign-in page's `Privacy` link points here by NAME. `/about`
         renumbered its sections once already, so an anchor on the numeral
         would have silently moved. Renaming this one means fixing the link in
         `src/app/page.tsx` in the same commit. */
      id="privacy"
    >
      {/* ⚠️ Every sentence here is a property enforced in code, and the root
          `CLAUDE.md` carries a **Never** rule for each one: the geocode is
          browser-side (`lib/geosearch.ts` is a separate client from
          `lib/api.ts` precisely so this stays true), there is no cache of any
          kind, and the address is never coupled to the watch flow. The one-line
          proof is that the whole feature changed no code under `waterline/`.
          **If a server-side geocoder is ever added, this section is a lie the
          same day.** */}
      <p>
        The address search on the map page is looked up in your browser by NYC
        Planning Labs&rsquo; geocoder. Fluud never receives what you typed.
        It is not sent to this site in a request, a header or a log line. It is
        not stored anywhere, including in a cache.
      </p>

      <p>
        That lookup reaches a third party, which is NYC Planning Labs. Their
        terms apply to it. A blocked or failing geocoder costs you the address
        search and nothing else.
      </p>

      <p>
        The address is never attached to a watch. It cannot pre-select your
        instruments and it does not travel with a subscription. It only reorders
        a list you are already looking at.
      </p>

      {/* ⚠️ **This paragraph said "This site sets no cookies. It uses no local
          storage and no session storage" until 2026-08-14, and Neon Auth made
          that false the day it landed.** A session has to be remembered
          somewhere and that is what an auth SDK does. The sentence was not
          softened — it was replaced, because a terms page that hedges a
          statement it can no longer make is worse than one that states the new
          fact plainly. See §04 for what the sign-in itself stores. */}
      <p>
        Signing in stores a session in your browser and sends a cookie to
        Neon&rsquo;s auth service. That is what keeps you signed in between
        pages. Nothing else on this site sets one.
      </p>

      <p>
        There is no analytics, no advertising and no third-party tracker of any
        kind. Three things are loaded from another origin: the hand-lettered
        typeface the headings are set in, the geocoder above, and the sign-in
        service.
      </p>

      <p>
        The server keeps ordinary web logs of requests, which is what a web
        server does. No camera frame is ever fetched by it, let alone stored.
        No face, no plate, no track, and no count for any building.
      </p>
    </NumberedSection>
  );
}

export function TermsData() {
  return (
    <NumberedSection
      n="06"
      accent="var(--wl-violet)"
      title="Data, sources and acceptable use"
      tint
    >
      <p>
        The readings come from public sources. FloodNet, NYC DOT, the National
        Weather Service, NOAA CO-OPS, the USGS, NYC Open Data and the NY State
        DEC each own their own data and each set their own terms for it. Fluud
        claims no ownership of any of it and grants you no rights to it.
        Camera stills are served by NYC DOT.
      </p>

      <p>
        The code for this project is MIT licensed. The artwork on this site is
        not covered by that licence.
      </p>

      <p>What you may not do:</p>

      <Rules>
        <Rule>
          Present anything from this site as an official warning, or as the
          statement of any agency.
        </Rule>
        <Rule>
          Use it to make a claim about a specific address, building or basement.
          It reports instruments, and exposure stops at neighbourhood scale.
        </Rule>
        <Rule>
          Request data at a rate that degrades the service for anyone else.
        </Rule>
        <Rule>
          Try to identify a subscriber, or to work out who is watching a
          corner.
        </Rule>
        <Rule>
          Subscribe an address that is not yours, or use the watch to send mail
          to anyone else.
        </Rule>
        <Rule>
          Resell access, or present the site as your own service.
        </Rule>
      </Rules>

      <p>
        Access can be withdrawn from anyone doing any of the above, without
        notice.
      </p>
    </NumberedSection>
  );
}

export function TermsChanges() {
  return (
    <NumberedSection
      n="07"
      accent="var(--wl-select)"
      title="Changes, and how to reach a person"
      tint={false}
    >
      <p>
        These terms can change. A changed version is posted on this page with a
        new effective date at the top. Continuing to use the site after that
        means you accept the new version. There is no notice by email, because
        the only addresses held here are for flood messages.
      </p>

      <p>
        To remove your record, follow the unsubscribe link in any message from
        Fluud. That deletes it immediately and takes everything queued with
        it. Nothing has to be asked for and nobody has to answer.
      </p>

      {CONTACT ? (
        <p>
          For anything else, write to{" "}
          <a
            href={`mailto:${CONTACT}`}
            className="rounded-sm text-foreground underline decoration-[var(--wl-cyan)] decoration-2 underline-offset-4 transition-colors hover:text-[var(--wl-cyan)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
          >
            {CONTACT}
          </a>
          . This is one person and a side project. Expect a slow reply.
        </p>
      ) : (
        <p>
          There is no support desk and no published address. This is one person
          and a side project. If the site is doing something it should not be
          doing, the honest advice is to stop using it.
        </p>
      )}

      <p>
        These terms are governed by the law of the State of New York.
      </p>
    </NumberedSection>
  );
}
