/**
 * The camera filter's copy, and the property the whole control rests on.
 *
 * ⚠️ **This is the file that earns the feature.** The five layer switches are
 * binary and their off-state is total, so `HiddenNote` can name what is off and
 * be complete. This filter produces **partial** absence — 130 drawn, 838 not —
 * and a reader looking at 130 pins has no cue whatever that 838 are missing.
 * What makes it legal is one sentence in the footer, and a sentence in JSX is a
 * sentence no runner can sweep.
 *
 * So the assertions this file exists for are the two sweeps:
 *
 * 1. **The forbidden-words sweep**, `nws.test.ts`' idiom — a drawing of New
 *    York City with most of its instruments removed is the surface on which
 *    *"nothing here"* would be easiest to write and worst to mean.
 * 2. ⚠️ **Every non-empty state either prints its denominator or says the
 *    registry has not arrived.** That is the whole control's licence: a reader
 *    must never be able to look at a narrowed drawing of this city without the
 *    page saying how much of it is missing.
 *
 * A third is the owner's copy rule as an assertion: ⚠️ **the words `gold`,
 * `golden` and `silver` may never reach a reader**, asserted case-insensitively
 * over the labels and the whole generated copy set — `watch-settings.ts`'
 * negative-assertion idiom (*no rendered body contains `/map/?`*).
 *
 * Every assertion here was checked by breaking the implementation and reading
 * the failure, per this directory's rule.
 */
import { describe, expect, test } from "vitest";

import type { CameraEntry, PairTier } from "../src/lib/api-types";
import {
  applyCameraFilter,
  boroughsOfCameras,
  cameraFilterNote,
  cameraFilterRefuses,
  DEFAULT_CAMERA_FILTER,
  isDefaultCameraFilter,
  PAIR_TIERS,
  PAIR_TIER_LABEL,
  PAIR_TIER_TITLE,
  type CameraFilter,
  type CameraFilterState,
} from "../src/lib/camera-filter";

/** Paired and in Manhattan by default: the interesting case is said out loud. */
function cam(over: Partial<CameraEntry> = {}): CameraEntry {
  return {
    camera_id: "c1",
    name: "South St @ Broad St",
    lat: 40.7,
    lon: -74.0,
    image_url: "https://webcams.nyctmc.org/api/cameras/c1/image",
    borough: "Manhattan",
    sensor_id: "curly_orange_shrimp",
    tier: "paired",
    depth_mm: 12,
    depth_observed_at: "2026-08-16T12:00:00Z",
    depth_plausible: true,
    ...over,
  };
}

const ROWS: CameraEntry[] = [
  cam({ camera_id: "m-paired", tier: "paired", borough: "Manhattan" }),
  cam({ camera_id: "m-near", tier: "near", borough: "Manhattan" }),
  cam({
    camera_id: "m-unpaired",
    tier: "unpaired",
    borough: "Manhattan",
    sensor_id: null,
    depth_mm: null,
    depth_observed_at: null,
  }),
  cam({ camera_id: "b-paired", tier: "paired", borough: "Brooklyn" }),
  cam({
    camera_id: "q-unpaired",
    tier: "unpaired",
    borough: "Queens",
    sensor_id: null,
    depth_mm: null,
    depth_observed_at: null,
  }),
  /* ⚠️ The row that has never been re-bootstrapped. It is not "outside the
     city" and it must not be admitted to any borough. */
  cam({ camera_id: "no-borough", tier: "near", borough: null }),
];

function ids(rows: CameraEntry[]): string[] {
  return rows.map((r) => r.camera_id);
}

function filter(over: Partial<CameraFilter> = {}): CameraFilter {
  return { tiers: [], boroughs: [], ...over };
}

describe("applyCameraFilter", () => {
  /* An empty array on an axis means NO narrowing on that axis — `applyQuery`'s
     idiom — and never "match nothing". Both empty is the identity. */
  test("the empty filter is the identity", () => {
    expect(applyCameraFilter(ROWS, filter())).toEqual(ROWS);
  });

  test("a tier narrows on tier alone", () => {
    expect(ids(applyCameraFilter(ROWS, filter({ tiers: ["paired"] })))).toEqual([
      "m-paired",
      "b-paired",
    ]);
  });

  test("two tiers are a union, not an intersection", () => {
    expect(
      ids(applyCameraFilter(ROWS, filter({ tiers: ["paired", "near"] }))),
    ).toEqual(["m-paired", "m-near", "b-paired", "no-borough"]);
  });

  test("a borough narrows on borough alone", () => {
    expect(
      ids(applyCameraFilter(ROWS, filter({ boroughs: ["Brooklyn"] }))),
    ).toEqual(["b-paired"]);
  });

  test("the two axes intersect", () => {
    expect(
      ids(
        applyCameraFilter(
          ROWS,
          filter({ tiers: ["unpaired"], boroughs: ["Manhattan", "Queens"] }),
        ),
      ),
    ).toEqual(["m-unpaired", "q-unpaired"]);
  });

  /* ⚠️ **The one that matters.** A null borough means the database has not been
     re-bootstrapped since `cameras.borough` landed — it never means *outside the
     city* — so admitting it to every borough would put a camera under a
     neighbourhood name nobody established. It counts as withheld. */
  test("a null borough is never matched by a borough filter", () => {
    const drawn = applyCameraFilter(ROWS, filter({ boroughs: ["Manhattan"] }));
    expect(ids(drawn)).not.toContain("no-borough");
    expect(drawn.length).toBeLessThan(ROWS.length);
  });

  test("...and is still drawn when no borough is picked", () => {
    expect(ids(applyCameraFilter(ROWS, filter({ tiers: ["near"] })))).toContain(
      "no-borough",
    );
  });

  test("a borough nothing carries draws nothing rather than everything", () => {
    expect(applyCameraFilter(ROWS, filter({ boroughs: ["Nowhere"] }))).toEqual(
      [],
    );
  });
});

describe("the default filter, which the resting page depends on", () => {
  test("it is `paired` and no borough", () => {
    expect(DEFAULT_CAMERA_FILTER.tiers).toEqual(["paired"]);
    expect(DEFAULT_CAMERA_FILTER.boroughs).toEqual([]);
  });

  test("it recognises itself", () => {
    expect(isDefaultCameraFilter(DEFAULT_CAMERA_FILTER)).toBe(true);
    expect(isDefaultCameraFilter(filter())).toBe(false);
    expect(isDefaultCameraFilter(filter({ tiers: ["paired", "near"] }))).toBe(
      false,
    );
    expect(
      isDefaultCameraFilter({ tiers: ["paired"], boroughs: ["Manhattan"] }),
    ).toBe(false);
  });
});

describe("boroughsOfCameras", () => {
  /* Off the PAYLOAD, never off `NYC_BOROUGHS` — those are the basemap's names
     and DOT's `area` is a different agency's vocabulary this repo does not
     normalise. A facet the picker cannot offer is coverage removed silently. */
  test("it is sorted, deduped, and drops nulls", () => {
    expect(boroughsOfCameras(ROWS)).toEqual(["Brooklyn", "Manhattan", "Queens"]);
  });

  test("a registry with no boroughs at all offers none", () => {
    expect(boroughsOfCameras([cam({ borough: null })])).toEqual([]);
  });
});

describe("the reader's three words", () => {
  test("`unpaired` renders as `not paired`", () => {
    expect(PAIR_TIER_LABEL.paired).toBe("paired");
    expect(PAIR_TIER_LABEL.near).toBe("near");
    expect(PAIR_TIER_LABEL.unpaired).toBe("not paired");
  });

  test("PAIR_TIERS is the whole wire vocabulary, tightest first", () => {
    expect([...PAIR_TIERS]).toEqual(["paired", "near", "unpaired"]);
  });
});

/*
 * ⚠️ **The generated state set.** Every filter shape × registry present/absent ×
 * the counts that matter, so a branch added later is covered the day it is
 * written rather than the day somebody remembers it. `nws.test.ts`' sweep.
 */
const TIER_SUBSETS: PairTier[][] = [
  [],
  ["paired"],
  ["near"],
  ["unpaired"],
  ["paired", "near"],
  ["paired", "near", "unpaired"],
];
const BOROUGH_SUBSETS: string[][] = [
  [],
  ["Manhattan"],
  ["Manhattan", "Brooklyn"],
  ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"],
];

const STATES: CameraFilterState[] = [];
for (const tiers of TIER_SUBSETS) {
  for (const boroughs of BOROUGH_SUBSETS) {
    for (const registry of [false, true]) {
      for (const [drawn, total] of [
        [0, 968],
        /* ⚠️ Bronx + paired is ONE camera and Staten Island + paired is three.
           A borough-plus-tier view can be nearly empty, and no "few" threshold
           is invented for it — a threshold would be a number needing a
           derivation. Both fall in the ordinary row, which always prints the
           denominator. */
        [1, 968],
        [3, 968],
        [27, 968],
        [130, 968],
        [968, 968],
      ] as const) {
        for (const anyBorough of [false, true]) {
          STATES.push({
            filter: { tiers, boroughs },
            registry,
            drawn,
            total,
            anyBorough,
          });
        }
      }
    }
  }
}

describe("the copy sweep — what this file exists for", () => {
  const NOTES = STATES.map(cameraFilterNote);

  /* Everything a reader could meet about this control, in one array: the notes,
     the three labels and the three hover strings. */
  const EVERY = [
    ...NOTES,
    ...PAIR_TIERS.map((t) => PAIR_TIER_LABEL[t]),
    ...PAIR_TIERS.map((t) => PAIR_TIER_TITLE[t]),
  ];

  test("the whole set is swept, not one branch of it", () => {
    expect(STATES.length).toBeGreaterThan(500);
    expect(EVERY.every((s) => s.length > 0)).toBe(true);
  });

  /* ⚠️ The never-safe rule. An empty drawing of this city is where *"nothing
     here"* is easiest to write and worst to mean. */
  const FORBIDDEN = [
    "all clear",
    "all-clear",
    "no flooding",
    "nothing to report",
    "nothing here",
    "no cameras in",
    "is clear",
    "are clear",
    "you are safe",
    "it is safe",
    "you are fine",
    "no danger",
    "no risk",
  ];

  test.each(FORBIDDEN)("no state ever says %j", (phrase) => {
    const hit = EVERY.find((s) => s.toLowerCase().includes(phrase));
    expect(hit, `forbidden phrase in: ${hit}`).toBeUndefined();
  });

  /* ⚠️ **The owner's copy rule, as an assertion.** `gold` and `silver` are the
     internal names of `cameras.GOLD_PAIR_M` / `MAX_PAIR_M` and no reader may
     meet either word. Case-insensitive, and `golden` is included because it is
     the spelling a rewrite reaches for. */
  test.each(["gold", "golden", "silver"])(
    "the internal name %j never reaches a reader",
    (word) => {
      const hit = EVERY.find((s) => s.toLowerCase().includes(word));
      expect(hit, `internal name in: ${hit}`).toBeUndefined();
    },
  );

  /*
   * ⚠️ **THE PROPERTY THE CONTROL RESTS ON.** A narrowed drawing of New York
   * City must never be shown without the page saying how much of it is missing.
   * Two honest answers: print the denominator, or say the registry has not
   * arrived and no filter is applied yet.
   */
  test("every state prints its denominator or says the list has not arrived", () => {
    for (const state of STATES) {
      const note = cameraFilterNote(state);
      const hasDenominator = note.includes(String(state.total));
      const admitsNoList =
        note.includes("has not arrived") ||
        note.includes("Pick a borough or a pairing") ||
        note.includes("re-bootstrapped") ||
        note.includes("An empty drawing is not an empty city");
      expect(
        hasDenominator || admitsNoList,
        `neither denominator nor admission: ${note}`,
      ).toBe(true);
    }
  });

  /* ⚠️ **No DENOMINATOR may be printed before the registry has arrived**,
     because the total is a figure this component does not have. The resting
     sentence carries the count it IS holding and nothing else.
     ⚠️ The assertion is the `N of M` form rather than the bare digits: the
     resting sentence legitimately prints `drawn`, and a generated state where
     `drawn` happens to equal `total` would fail a bare-digit check for a
     coincidence rather than for a claim. */
  test("no in-flight state prints a denominator it does not have", () => {
    for (const state of STATES.filter((s) => !s.registry)) {
      const note = cameraFilterNote(state);
      expect(note, note).not.toContain(`of ${state.total}`);
      expect(note, note).not.toMatch(/\bof \d+ cameras\b/);
    }
  });

  test("the tier words in the copy come from PAIR_TIER_LABEL", () => {
    const note = cameraFilterNote({
      filter: { tiers: ["unpaired"], boroughs: [] },
      registry: true,
      drawn: 838,
      total: 968,
      anyBorough: true,
    });
    expect(note).toContain("not paired");
    expect(note).not.toContain("unpaired");
  });
});

describe("the five states, and their precedence", () => {
  const base: CameraFilterState = {
    filter: DEFAULT_CAMERA_FILTER,
    registry: false,
    drawn: 27,
    total: 0,
    anyBorough: false,
  };

  test("at rest it names what is drawn and offers the rest — no denominator", () => {
    const note = cameraFilterNote(base);
    expect(note).toContain("27 cameras are drawn");
    expect(note).toContain("Pick a borough or a pairing");
  });

  test("a touched filter with no registry says the list has not arrived", () => {
    const note = cameraFilterNote({
      ...base,
      filter: { tiers: ["unpaired"], boroughs: [] },
    });
    expect(note).toContain("has not arrived");
    expect(note).not.toMatch(/\d/);
  });

  /* ⚠️ **The deployment fact outranks the empty result**, because it is the more
     specific one: the drawing is empty for a reason "widen the filter" cannot
     fix. Both states have `drawn: 0`, so the order is the whole difference. */
  test("no borough anywhere outranks the zero-match refusal", () => {
    const note = cameraFilterNote({
      filter: { tiers: [], boroughs: ["Manhattan"] },
      registry: true,
      drawn: 0,
      total: 968,
      anyBorough: false,
    });
    expect(note).toContain("re-bootstrapped");
    expect(note).not.toContain("Widen the filter");
  });

  test("a real empty result refuses the reading and says how to get out", () => {
    const note = cameraFilterNote({
      filter: { tiers: ["paired"], boroughs: ["Staten Island"] },
      registry: true,
      drawn: 0,
      total: 968,
      anyBorough: true,
    });
    expect(note).toContain("An empty drawing is not an empty city");
    expect(note).toContain("Widen the filter");
  });

  test("the ordinary case prints drawn, total and withheld", () => {
    const note = cameraFilterNote({
      filter: { tiers: ["paired", "near"], boroughs: ["Manhattan"] },
      registry: true,
      drawn: 130,
      total: 968,
      anyBorough: true,
    });
    expect(note).toContain("130 of 968");
    expect(note).toContain("838 are not");
    expect(note).toContain("paired and near");
    expect(note).toContain("in Manhattan");
  });

  /* ⚠️ A near-empty view is the ordinary case, not a special one — Bronx +
     paired is one camera. It prints its denominator like every other. */
  test("one camera is still an accounting, not a warning", () => {
    const note = cameraFilterNote({
      filter: { tiers: ["paired"], boroughs: ["Bronx"] },
      registry: true,
      drawn: 1,
      total: 968,
      anyBorough: true,
    });
    expect(note).toContain("1 of 968");
    expect(note).toContain("967 are not");
  });
});

describe("cameraFilterRefuses — which sentences get the stronger type", () => {
  const ok: CameraFilterState = {
    filter: DEFAULT_CAMERA_FILTER,
    registry: true,
    drawn: 130,
    total: 968,
    anyBorough: true,
  };

  test("an accounting is not a refusal", () => {
    expect(cameraFilterRefuses(ok)).toBe(false);
  });

  test("a state with no registry is never a refusal", () => {
    expect(cameraFilterRefuses({ ...ok, registry: false, drawn: 0 })).toBe(
      false,
    );
  });

  test("zero matches refuses", () => {
    expect(cameraFilterRefuses({ ...ok, drawn: 0 })).toBe(true);
  });

  test("a borough picked with none on the registry refuses", () => {
    expect(
      cameraFilterRefuses({
        ...ok,
        filter: { tiers: [], boroughs: ["Manhattan"] },
        anyBorough: false,
      }),
    ).toBe(true);
  });

  /* The predicate and the note have to be answering about the same state — a
     refusal-typed accounting is a footer shouting about a normal result. */
  test("it agrees with the note on every generated state", () => {
    for (const state of STATES) {
      const refuses = cameraFilterRefuses(state);
      const note = cameraFilterNote(state);
      if (refuses) {
        expect(
          note.includes("An empty drawing is not an empty city") ||
            note.includes("re-bootstrapped"),
          `refusal typing on a non-refusal: ${note}`,
        ).toBe(true);
      }
    }
  });
});
