"use client";

import { AddressLookup } from "@/components/address-lookup";
import {
  boroughsOf,
  queryIsActive,
  type InstrumentQuery,
  type SortKey,
} from "@/lib/instrument-query";
import type { SensorStatus } from "@/lib/api-types";
import { cn } from "@/lib/utils";

/**
 * What each sort key says it is doing, in the state line.
 *
 * ⚠️ **An exhaustive `Record<SortKey, string>`, on `lib/severity.ts`'s
 * precedent, and it replaced a ternary chain that had already gone wrong.** The
 * chain ended `: "oldest reading first"`, so the moment `SortKey` gained a
 * fourth member the state line rendered *oldest reading first* underneath a
 * list correctly sorted by distance — not a build error, a **wrong label under
 * a right answer**, which is the worst shape a labelling bug can take on this
 * page. A `Record` makes a fifth key stop the build instead.
 */
const SORT_LABEL: Record<SortKey, string> = {
  /* ⚠️ **`deepest first`, matching the button's `depth` label** — the key is
     still `worst` because the value drives control flow. The two move together:
     a state line reading *worst first* under a button labelled `depth` is the
     wrong-label-under-a-right-answer failure this Record was built to stop,
     arriving through a rename instead of through a missing case.

     ⚠️ It says `deepest` rather than `depth` because this line describes what
     the ORDER is, not what the control is called, and it is the same order —
     a plausible reading first and deeper first within it, faults grouped after
     while keeping their digits, no reading at all last. See `compareSensors`. */
  worst: "deepest first",
  name: "by name",
  age: "oldest reading first",
  distance: "nearest first",
};

/**
 * Search, sort and filter for the instrument list.
 *
 * ### ⚠️ Four lines, and the address block LEADS as of 2026-08-06
 *
 * The `Map flows` design (screen `2a`) puts the address at the top of the
 * strip, in its own bordered block — so the one control that leaves the
 * browser is visibly a different *kind* of thing from the three local controls
 * under it. The previous ordering put it last on the argument that the control
 * that reaches somebody else's server is the one you arrive at rather than
 * fall into; the bordered block answers the same concern by containment
 * instead of position.
 *
 * The floor is unchanged and re-measured rather than assumed: **at least three
 * fully visible rows** with the strip open, or the list reads as a stub that
 * failed to load. See `web/src/components/CLAUDE.md` for the table.
 *
 * ### ❌ The geocoder disclosure came back for one day, then shrank to four words
 *
 * The full sentence returned under the address field on 2026-08-06 and was
 * shortened to *"Look up in geocoder."* the same day, on the owner's
 * instruction. The four-word line names the third party and states no privacy
 * property, so the root `CLAUDE.md`'s twelfth removal is RE-OPENED: no
 * rendered surface says the address is looked up in the browser, never
 * received here, never stored. `/terms` §05 and LIMITATIONS §16 still say it;
 * `landing/block-search.tsx`'s field says nothing at all. The line renders
 * always, in `address-lookup.tsx`, with no off switch.
 *
 * ### The candidate list (screen `2c`, adapted)
 *
 * `runLookup` used to take `found[0]` silently. It now keeps the whole array
 * and renders it as a list of buttons; pressing one applies
 * `{origin, sort: "distance"}` in one patch and clears the list. **Candidates
 * come from the submitted lookup, never as-you-type** — `geosearch.ts` is
 * submit-only on privacy grounds and this list costs zero extra requests:
 * the endpoint already returns `SIZE = 5` and already drops out-of-viewport
 * features. This is not autocomplete; see the "no autocomplete list" section
 * in `web/src/components/CLAUDE.md`, which names the distinction.
 *
 * ### ⚠️ The address field is here and nowhere else on this page
 *
 * Four slots were considered and three are ruled out by rules that already
 * exist:
 *
 * - **The rail** is out. Its only free slots are above the warning, so a fifth
 *   panel means shrinking `SelectedDetail` again or trading `HarborBaseline`'s
 *   256px, which may not be traded — and a text field beside where an SSE
 *   warning lands is exactly `watch-panel.tsx`'s objection.
 * - **The map's chrome bar** is out: a field there either wraps `PanelHeader`'s
 *   `h-11` (which is what makes all three columns start on one line) or shrinks
 *   to unusable.
 * - **The map's footer** is out — it is the legend, on a measured reserve.
 *
 * The origin's only job on `/map` is to drive `ordered`, and the list column
 * **is** `ordered`. Every other control that reorders that array is in this
 * strip.
 *
 * ⚠️ **Discoverability cost, stated rather than hidden.** `controlsOpen` starts
 * `false`, so on `/map` this field is behind the filter glyph. That is accepted:
 * the landing page is the discovery surface and `/map` is the instrument. What
 * is **not** accepted is the origin becoming invisible with it — see
 * `ActiveFilterLine`, which renders the origin chip outside the `queryIsActive`
 * gate for exactly that reason.
 *
 * ⚠️ **Closing the strip unmounts this and discards the typed address.** The
 * in-flight lookup is aborted with it, and the candidate list goes too. That is
 * a deliberate property rather than an accident of the mount: the origin (a
 * coordinate) survives on the query because three surfaces need it, and the
 * *address text* does not survive because nothing needs it.
 *
 * ### Hand-rolled, like every other control here
 *
 * There is no shadcn `input` in this project and none may be added — the
 * surface is pinned at card / badge / alert / button (`web/CLAUDE.md`). A bare
 * `<input type="search">` styled with `cn()` joins the hand-rolled segmented
 * control and the drill popup rather than opening a fifth component.
 *
 * Search is **not debounced**. It filters an array already in memory, `applyQuery`
 * is memoised by the caller, and a debounce on a local filter buys nothing but a
 * lag between typing and seeing.
 */
export function ListControls({
  query,
  onChange,
  sensors,
  shown,
  total,
  id,
}: {
  query: InstrumentQuery;
  onChange: (q: InstrumentQuery) => void;
  /** Only used to derive the borough chips — never hard-coded. */
  sensors: SensorStatus[];
  /** Rows the current query leaves, for the state line. Derived by the caller
   *  from the same `ordered` array the list draws, so the two cannot disagree. */
  shown: number;
  /** Rows in this mode with no query at all. */
  total: number;
  id: string;
}) {
  const set = (patch: Partial<InstrumentQuery>) => onChange({ ...query, ...patch });
  const boroughs = query.mode === "sensors" ? boroughsOf(sensors) : [];

  return (
    <div id={id} className="shrink-0 space-y-3 border-b border-border px-3 py-3">
      {/*
        Line 1 — the address, first and in its own bordered block, so the one
        control that reaches somebody else's server reads as a different kind
        of thing from the three local controls below it.

        ⚠️ **The line under the field reads "Look up in geocoder." now** — see
        the docblock above for the one-day round trip of the full disclosure.

        The field, the candidate list, the failure branches and that line are
        all `AddressLookup`, shared verbatim with the mobile search bar in
        `map/page.tsx` so the two mounts cannot fork.
      */}
      <AddressLookup
        query={query}
        onChange={onChange}
        label="Nearest to an address"
        className="rounded-md border border-border p-2.5"
      />

      {/* Line 2 — search, the full width of the column. Its own label rather
          than relying on the placeholder: a placeholder disappears the moment
          somebody types, taking the only description of the field with it. */}
      <Group label="Search">
        {/* The clear affordance (screen `2b`): a ✕ inside the field whenever
            there is something to clear. Still a bare input — not a shadcn
            `Input`; the pin holds. */}
        <div className="relative">
          <input
            type="search"
            value={query.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={
              query.mode === "sensors"
                ? "Search name, borough, neighbourhood, id"
                : "Search name of camera or sensor"
            }
            aria-label="Search instruments"
            className={cn(
              "h-8 w-full min-w-0 rounded-md border border-border bg-[var(--muted)] px-2.5 pr-7",
              "text-[12.5px] text-foreground placeholder:text-muted-foreground/70",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
            )}
          />
          {query.search !== "" && (
            <button
              type="button"
              aria-label="Clear the search"
              onClick={() => set({ search: "" })}
              className={cn(
                "absolute inset-y-0 right-1.5 my-auto flex size-5 cursor-pointer items-center justify-center",
                "rounded-sm text-[11px] leading-none text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
              )}
            >
              ✕
            </button>
          )}
        </div>
      </Group>

      {/* Line 3 — sort. Four equal quarters rather than four intrinsic widths,
          so the control reads as one segmented object and the buttons stop
          moving under the cursor when the labels change length.

          ⚠️ **`nearest` is `disabled` until an origin exists**, which is guard 2
          of the three `applyQuery` documents. It is disabled rather than hidden
          because a control that appears when you geocode is a control nobody
          knows is there — and its `title` says what would make it work, since a
          disabled button with no explanation is a dead end. */}
      <Group label="Sort by">
        <div className="grid grid-cols-4 gap-1 rounded-md bg-[var(--muted)] p-1">
          {/* ⚠️ **Labelled `depth`, and the VALUE stays `"worst"`** — owner's
              instruction, 2026-08-15. The fourth label/value split on this page
              after `watch`→`monitor` and `gauges`→`tide + wx`, and it follows
              the same rule: the value drives control flow. `SortKey`,
              `DEFAULT_QUERY`, both comparators, the origin-clearing patch in
              three places and `tests/instrument-query.test.ts` all read
              `"worst"`, so renaming it would touch the list's wiring to change
              a word. `SORT_LABEL` is the other half and moves with this one. */}
          <SortButton active={query.sort === "worst"} onClick={() => set({ sort: "worst" })}>
            depth
          </SortButton>
          <SortButton active={query.sort === "name"} onClick={() => set({ sort: "name" })}>
            name
          </SortButton>
          <SortButton active={query.sort === "age"} onClick={() => set({ sort: "age" })}>
            age
          </SortButton>
          <SortButton
            active={query.sort === "distance"}
            disabled={query.origin === null}
            onClick={() => set({ sort: "distance" })}
            title="Give an address first — this orders the list by distance from it"
          >
            nearest
          </SortButton>
        </div>
      </Group>

      {/* Line 4 — filter chips, scrolling sideways rather than wrapping to a
          fifth row. `wl-scroll` keeps the scrollbar thin and border-coloured;
          the platform default is a light slab across a dark panel. */}
      <Group label="Show only">
      <div className="wl-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {query.mode === "sensors" && (
          <>
            <Chip
              on={query.watchedOnly}
              onClick={() => set({ watchedOnly: !query.watchedOnly })}
              title="Sensors paired to a camera this page polls — the only ones Fluud raises a warning from"
            >
              watched
            </Chip>
            <Chip
              on={query.reportingOnly}
              onClick={() => set({ reportingOnly: !query.reportingOnly })}
              title="Has a stored reading at all"
            >
              reporting
            </Chip>
            {/*
              ⚠️ **The only chip here that narrows on what an instrument IS
              rather than on what it is reporting**, which is why it sits with
              the two sensor-only chips rather than beside `faults`.

              A tidal deployment sees coastal surge and the rest see
              stormwater. It is also the gate on the harbor witness in
              `waterline/watch.py`: the Battery corroborates a tidal sensor and
              corroborates nothing else. The flag was on the wire and rendered
              in one sentence on the detail face, reachable only by selecting
              an instrument one at a time — this is what makes the coastal
              fleet askable-for.

              ⚠️ **`title` says what the flag means and NOT what it implies
              about conditions.** "Sees coastal surge" is a fact about the
              instrument; anything about tides being higher or lower would be
              this control making a claim about water.
            */}
            <Chip
              on={query.tidalOnly}
              onClick={() => set({ tidalOnly: !query.tidalOnly })}
              title="Tidally influenced deployments — they see coastal surge rather than stormwater, and the harbor gauge is evidence about them"
            >
              tidal
            </Chip>
          </>
        )}
        <Chip
          on={query.overThresholdOnly}
          onClick={() => set({ overThresholdOnly: !query.overThresholdOnly })}
          title="A believable depth at or above FloodNet's flood-event threshold"
        >
          over threshold
        </Chip>
        <Chip
          on={query.faultsOnly}
          onClick={() => set({ faultsOnly: !query.faultsOnly })}
          title="The instrument reported a depth it cannot physically support"
        >
          faults
        </Chip>
        {boroughs.map((b) => (
          <Chip
            key={b}
            on={query.boroughs.includes(b)}
            onClick={() =>
              set({
                boroughs: query.boroughs.includes(b)
                  ? query.boroughs.filter((x) => x !== b)
                  : [...query.boroughs, b],
              })
            }
          >
            {b}
          </Chip>
        ))}
      </div>
      </Group>

      {/*
        The state line: what the controls above currently add up to.
        ⚠️ **`shown` comes from the same `ordered` array the list draws**, passed
        down rather than recomputed, so this line and the rows under it cannot
        disagree about how many there are.

        ⚠️ **It says "of N" even when nothing is filtered**, and that is
        the unobserved-not-clear rule's shape applied to a control strip: "27 instruments" alone
        invites the reading that 27 is the city. Naming the denominator every
        time keeps the number a fact about this list rather than about New York.
        It also never says a filtered-to-nothing list is fine — that is
        `EmptyState`'s job and it refuses the claim in words.
      */}
      <p className="border-t border-border pt-2.5 font-mono text-[10px] leading-relaxed tracking-[0.06em] text-muted-foreground">
        <span className="num text-foreground">{shown}</span> of{" "}
        <span className="num">{total}</span>{" "}
        {query.mode === "sensors" ? "sensors" : "cameras"}
        <span aria-hidden className="mx-1.5 opacity-40">
          ·
        </span>
        {queryIsActive(query) ? "filtered" : "no filter"}
        <span aria-hidden className="mx-1.5 opacity-40">
          ·
        </span>
        {SORT_LABEL[query.sort]}
      </p>
    </div>
  );
}

/**
 * A labelled control group.
 *
 * ⚠️ **The label is a real `<label>` wrapping its control, not a floating
 * caption.** That is what makes clicking "Search" focus the input and what
 * gives the segmented control and the chip row an accessible group name — a
 * styled `<div>` above them would look identical and announce nothing.
 *
 * The type is the same mono micro-caps every panel title on this page uses, so
 * these read as instrument labels rather than as form furniture.
 */
export function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9.5px] leading-none tracking-[0.14em] text-muted-foreground/80 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * What the strip leaves behind when it is collapsed — and, as of 2026-08-06,
 * what renders above it when it is open.
 *
 * ⚠️ **Active filters are never hidden.** A list narrowed to 12 of 425 rows by
 * a control the reader cannot see is a list that appears to be the whole city
 * and is not — which on this page is the same class of error as a map that
 * omits instruments. It used to follow that this line only rendered while the
 * strip was *closed*; the `Map flows` screens (`2e`/`2g`) draw it above the
 * open strip too, so it is **unconditional whenever anything is active**. The
 * chip row is the one statement of reader-set state that never moves, whatever
 * the strip is doing.
 *
 * ## ⚠️ The origin renders OUTSIDE the `queryIsActive` gate, deliberately
 *
 * `queryIsActive` excludes `origin` because including it would drop 404 of 425
 * map markers to 25% opacity the moment somebody types an address — the full
 * argument is on that function. But an origin is still reader-set state, and the
 * rule above applies to it word for word: it is set by a control that starts
 * collapsed, so if it were only visible inside the strip it would be state the
 * reader can hide from themselves.
 *
 * Both properties therefore hold at once, and neither is optional: the gate
 * stays free of `origin`, **and** this component draws when there is one.
 * The origin chip is also the whole statement now — `LookupNote`'s
 * idle-with-origin branch (*"Nearest to {label}."*) was a duplicate of it and
 * was dropped when this line went unconditional; the chip is the one you can
 * press to clear.
 */
export function ActiveFilterLine({
  query,
  onChange,
}: {
  query: InstrumentQuery;
  onChange: (q: InstrumentQuery) => void;
}) {
  if (!queryIsActive(query) && !query.origin) return null;
  const set = (patch: Partial<InstrumentQuery>) => onChange({ ...query, ...patch });

  return (
    /* The `relative` wrapper exists for the fade: the chip row scrolls
       sideways, and the gradient at the right edge is what says so — a row
       that clips dead reads as a row that ends there. `pointer-events-none`
       so it never steals a press from the last chip. */
    <div className="relative shrink-0 border-b border-border">
      <div className="wl-scroll flex items-center gap-1 overflow-x-auto px-3 py-1.5">
        <span className="shrink-0 font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
          {queryIsActive(query) ? "filtered" : "sorted"}
        </span>
        {/*
          ⚠️ **First, and it clears the sort in the same patch.** That is guard 3
          of the three `applyQuery` documents: clearing the origin while `sort` is
          still `"distance"` leaves a state the comparator has to fall back out
          of, and the list would sit in worst-first order under a *nearest first*
          label until somebody pressed something. One patch, one render.
        */}
        {query.origin && (
          <Chip
            on
            onClick={() =>
              set({
                origin: null,
                sort: query.sort === "distance" ? "worst" : query.sort,
              })
            }
            title="Clear this address"
          >
            <span className="inline-block max-w-[22ch] truncate align-middle">
              nearest to {query.origin.label}
            </span>
          </Chip>
        )}
        {query.search.trim() !== "" && (
          <Chip on onClick={() => set({ search: "" })} title="Clear the search">
            “{query.search.trim()}”
          </Chip>
        )}
        {query.watchedOnly && (
          <Chip on onClick={() => set({ watchedOnly: false })}>watched</Chip>
        )}
        {query.reportingOnly && (
          <Chip on onClick={() => set({ reportingOnly: false })}>reporting</Chip>
        )}
        {query.tidalOnly && (
          <Chip on onClick={() => set({ tidalOnly: false })}>tidal</Chip>
        )}
        {query.overThresholdOnly && (
          <Chip on onClick={() => set({ overThresholdOnly: false })}>over threshold</Chip>
        )}
        {query.faultsOnly && (
          <Chip on onClick={() => set({ faultsOnly: false })}>faults</Chip>
        )}
        {query.boroughs.map((b) => (
          <Chip
            key={b}
            on
            onClick={() => set({ boroughs: query.boroughs.filter((x) => x !== b) })}
          >
            {b}
          </Chip>
        ))}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-card"
      />
    </div>
  );
}

function SortButton({
  active,
  disabled = false,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-[5px] px-1.5 py-1.5 font-mono text-[10px] leading-none tracking-[0.06em] uppercase transition-colors",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "cursor-pointer bg-card text-foreground shadow-sm"
            : "cursor-pointer text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A filter toggle. `--wl-select` when on, for the same reason the selected row
 * uses it: it is a fact about what the reader asked for, not about the water.
 * Nothing here may take a severity colour or the theme's green `--accent`.
 */
export function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={cn(
        "shrink-0 cursor-pointer rounded-full border px-2.5 py-[5px] text-[10.5px] leading-none whitespace-nowrap transition-colors",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
        on
          ? "border-[var(--wl-select)] bg-[var(--wl-select)]/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
