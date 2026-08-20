"use client";

/**
 * The address field: one typed address → one geocoder call → a candidate list →
 * an origin on the query.
 *
 * Extracted from `list-controls.tsx` on 2026-08-06 when the mobile sheet layout
 * needed the same field in the search bar over the map — two surfaces carrying
 * one lookup have to behave identically or they read as two mechanisms
 * (`step-button.tsx`'s precedent). **The strip's copy and the bar's copy are one
 * component**, so the disclosure, the candidate rules and the failure branches
 * cannot fork.
 *
 * ## ⚠️ The line under the field is four words now
 *
 * It reads *"Look up in geocoder."* — shortened from the full disclosure on the
 * owner's instruction, 2026-08-06. The privacy claim it carried (looked up in
 * this browser, never received here, never stored) is on no rendered surface
 * again; `/terms` §05 and LIMITATIONS §16 still state it, and every property
 * it described is unchanged. The line itself is not a prop and renders under
 * every mount of the field.
 *
 * ## The candidate list is not autocomplete
 *
 * Candidates come **from the submitted lookup**, never as-you-type —
 * `geosearch.ts` is submit-only on privacy grounds (a debounce sends a growing
 * prefix of a home address six or eight times per lookup). The list costs zero
 * extra requests: the endpoint already returns `SIZE = 5` and already drops
 * out-of-viewport features; this renders what one submit brought back and lets
 * the reader pick which answer they meant. Escape or a new submit clears it.
 *
 * Rows carry the geocoder's `properties.label` **verbatim**, wrapping rather
 * than truncating, with no second locality line — `geosearch.ts` forbids
 * re-assembling an address from parts, and the label already carries the
 * borough.
 *
 * ## ⚠️ Applying a candidate sets the origin and the sort in ONE patch
 *
 * Two patches would render once with `sort: "distance"` and no origin — the
 * state `applyQuery` falls back out of, so the list would flash the worst-first
 * order under a *nearest first* label. One object, one render.
 */

import { useEffect, useRef, useState } from "react";

import { Group } from "@/components/list-controls";
import { geosearch, type GeoMatch } from "@/lib/geosearch";
import type { InstrumentQuery } from "@/lib/instrument-query";
import { cn } from "@/lib/utils";

/**
 * Where the lookup has got to. Only the transient status is local — the origin
 * itself lives on the query in `map/page.tsx`, because three surfaces read it.
 */
type LookupState =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "failed" }
  | { kind: "nomatch" };

export function AddressLookup({
  query,
  onChange,
  label,
  className,
}: {
  query: InstrumentQuery;
  onChange: (q: InstrumentQuery) => void;
  /** Rendered as a `Group` label when given (the controls strip). The mobile
      bar passes none and the input's `aria-label` carries the name. */
  label?: string;
  className?: string;
}) {
  const set = (patch: Partial<InstrumentQuery>) =>
    onChange({ ...query, ...patch });

  const [address, setAddress] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  /* The submitted lookup's matches, held until one is pressed, Escape is
     pressed, or a new submit replaces them. Never persisted anywhere — same
     rule as the address text itself. */
  const [candidates, setCandidates] = useState<GeoMatch[]>([]);

  /* One controller per submit, aborting the in-flight one — `use-history.ts`'s
     precedent. The unmount cleanup is not decoration: the strip's mount is
     unmounted whenever the strip is closed. */
  const lookupRef = useRef<AbortController | null>(null);
  useEffect(() => () => lookupRef.current?.abort(), []);

  const runLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = address.trim();
    if (!text) return;

    lookupRef.current?.abort();
    const controller = new AbortController();
    lookupRef.current = controller;
    setCandidates([]);
    setLookup({ kind: "looking" });

    try {
      const found = await geosearch(text, controller.signal);
      if (controller.signal.aborted) return;
      if (found.length === 0) {
        setLookup({ kind: "nomatch" });
        return;
      }
      setLookup({ kind: "idle" });
      /* ⚠️ The whole array, rendered — not `found[0]` taken silently. The
         reader picks which of the geocoder's answers they meant; nothing is
         applied until they do. */
      setCandidates(found);
    } catch {
      if (controller.signal.aborted) return;
      setLookup({ kind: "failed" });
    }
  };

  const applyCandidate = (match: GeoMatch) => {
    setCandidates([]);
    set({
      origin: { lat: match.lat, lon: match.lon, label: match.label },
      sort: "distance",
    });
  };

  const row = (
    <div className="flex gap-1.5">
      <input
        type="search"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        /* ⚠️ **A placeholder has to be an address that actually resolves.**
           The first draft said `234 Union St, Brooklyn` and GeoSearch returns
           **zero features** for it — that house number is not in the index —
           so a reader who typed the example verbatim got *"No New York
           address matches that"* as their first experience of the feature.
           Verified against the live endpoint: this one returns exactly one
           hit, `475 UNION STREET, Brooklyn, NY, USA`. **Re-check it if it is
           ever changed.** */
        placeholder="e.g. 475 Union St, Brooklyn"
        autoComplete="off"
        aria-label="Find instruments nearest an address"
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md border border-border bg-[var(--muted)] px-2.5",
          "text-[12.5px] text-foreground placeholder:text-muted-foreground/70",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
        )}
      />
      {/* `find` → `…` while looking → `retry` after a failure. The status line
          below keeps its copy unchanged; the button is what says where the
          lookup has got to. */}
      <button
        type="submit"
        aria-busy={lookup.kind === "looking"}
        className={cn(
          "h-8 shrink-0 cursor-pointer rounded-md border border-border px-2.5",
          "font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase",
          "transition-colors hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
        )}
      >
        {lookup.kind === "looking"
          ? "…"
          : lookup.kind === "failed"
            ? "retry"
            : "find"}
      </button>
    </div>
  );

  return (
    /* A native `<form>`, on `watch-panel.tsx`'s precedent: Enter-to-submit and
       the browser's own validation for nothing, and the shadcn surface stays
       at card / badge / alert / button. The `<form>` is OUTSIDE the `Group`
       because `Group` renders a `<label>`. */
    <form
      onSubmit={runLookup}
      onKeyDown={(e) => {
        if (e.key === "Escape" && candidates.length > 0) {
          e.preventDefault();
          setCandidates([]);
        }
      }}
      className={className}
    >
      {label ? <Group label={label}>{row}</Group> : row}

      {candidates.length > 0 && (
        <ul className="mt-1.5 overflow-hidden rounded-md border border-border bg-background">
          {candidates.map((match, i) => (
            <li
              key={`${match.label}-${i}`}
              className="border-b border-[var(--wl-rule)] last:border-b-0"
            >
              <button
                type="button"
                onClick={() => applyCandidate(match)}
                className={cn(
                  "block w-full cursor-pointer px-2.5 py-2 text-left text-[11.5px] leading-snug text-foreground",
                  "transition-colors hover:bg-foreground/5",
                  "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset focus-visible:outline-none",
                  i === 0 && "bg-[var(--wl-select)]/10",
                )}
              >
                {match.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lookup.kind !== "idle" && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          <LookupNote lookup={lookup} />
        </p>
      )}

      {/*
        ⚠️ **Shortened to four words on the owner's instruction, 2026-08-06.**
        The full disclosure — the browser makes the call, Fluud never
        receives or stores the address — lasted one day on this surface. The
        claim now renders nowhere; it survives in `/terms` §05 and
        LIMITATIONS §16. The line stays under every mount of the field and has
        no prop to turn it off.
      */}
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground/70">
        Look up in geocoder.
      </p>
    </form>
  );
}

/**
 * The one-line account of the lookup.
 *
 * ⚠️ **The failure branch says *not a statement about conditions* in the same
 * words every other refusal on this page uses.** It is shorter than the landing
 * page's version of the same branch — this reader is standing in front of the
 * instrument and the list beside them is visibly still working. The refusal
 * itself is not shortened, because that is the part that is about the water
 * rather than about the page.
 *
 * ⚠️ **There is no idle-with-origin branch.** *"Nearest to {label}."*
 * duplicated the origin chip in `ActiveFilterLine`, which renders whether the
 * strip is open or closed — the chip is the statement, and it is the one you
 * can press to clear.
 */
function LookupNote({ lookup }: { lookup: LookupState }) {
  if (lookup.kind === "looking") return <>Looking that address up.</>;
  if (lookup.kind === "failed") {
    return (
      <>
        The address lookup could not be reached. Not a statement about
        conditions.
      </>
    );
  }
  if (lookup.kind === "nomatch") {
    return (
      <>No New York address matches that. Not a statement about conditions.</>
    );
  }
  return null;
}
