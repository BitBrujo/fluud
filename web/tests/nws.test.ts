/**
 * The NWS block says things about a FEED, never about the water.
 *
 * ⚠️ **This is the never-safe rule's newest surface**, and it is the one a
 * reader meets on the tide-and-weather tab without choosing anything. An empty
 * alert list is the ordinary case — most readers, most days — and the obvious
 * copy for it is a sentence this site may not write. The forbidden-words sweep
 * below is the assertion this file exists for.
 *
 * The rest pins the four states apart. `alerts: []` arrives identically from
 * all four and **two of them mean *we do not know***, so collapsing any into
 * the quiet one renders *we could not ask* as *nothing is happening*, during
 * precisely the weather that breaks the feed.
 *
 * Every assertion here was checked by breaking the implementation and reading
 * the failure, per this directory's rule.
 */
import { describe, expect, test } from "vitest";

import type { NwsStatus } from "../src/lib/api-types";
import {
  NWS_COLD_AFTER_S,
  nwsCheckedAgeS,
  nwsCountLabel,
  nwsFaulted,
  nwsFeed,
  nwsNote,
} from "../src/lib/nws";

const NOW = Date.parse("2026-08-15T12:00:00Z");

/** Healthy by default, on `_fixtures.ts`' rule: the interesting case is said out loud. */
function nws(over: Partial<NwsStatus> = {}): NwsStatus {
  return {
    checked_at: "2026-08-15T11:59:20Z", // 40s ago
    attempted_at: "2026-08-15T11:59:20Z",
    reachable: true,
    alerts: [],
    elsewhere: 0,
    ...over,
  };
}

describe("the four states are four, and an empty list is not an answer", () => {
  test("a read that just succeeded is current", () => {
    expect(nwsFeed(nws(), NOW)).toBe("current");
  });

  test("never read in this process is cold, not current", () => {
    expect(nwsFeed(nws({ checked_at: null }), NOW)).toBe("cold");
  });

  /* ⚠️ The absent-field direction. An older server that does not send `nws` at
     all must not have its silence rendered as an answer about the weather. */
  test("a missing block is cold", () => {
    expect(nwsFeed(null, NOW)).toBe("cold");
    expect(nwsFeed(undefined, NOW)).toBe("cold");
  });

  test("a failed last attempt is unreachable", () => {
    expect(nwsFeed(nws({ reachable: false }), NOW)).toBe("unreachable");
  });

  /* `=== false` and not `!reachable`, on `mail_delivers`' precedent. A body
     that arrived without the field is not a body reporting an outage. */
  test("an absent `reachable` does not become an outage", () => {
    const partial = { ...nws() } as Partial<NwsStatus>;
    delete partial.reachable;
    expect(nwsFeed(partial as NwsStatus, NOW)).toBe("current");
  });

  test("a successful read gone cold is stale", () => {
    const old = new Date(NOW - (NWS_COLD_AFTER_S + 1) * 1000).toISOString();
    expect(nwsFeed(nws({ checked_at: old }), NOW)).toBe("stale");
  });

  /* `>=` rather than `>`: at exactly the threshold the list has stopped being
     current. The boundary is asserted because the two are one keystroke apart. */
  test("the cold boundary is inclusive", () => {
    const at = new Date(NOW - NWS_COLD_AFTER_S * 1000).toISOString();
    expect(nwsFeed(nws({ checked_at: at }), NOW)).toBe("stale");
    const under = new Date(NOW - (NWS_COLD_AFTER_S - 1) * 1000).toISOString();
    expect(nwsFeed(nws({ checked_at: under }), NOW)).toBe("current");
  });
});

describe("precedence — the more specific fact wins", () => {
  /* ⚠️ Cold outranks unreachable. With nothing ever read, "the feed is down"
     overstates what we know: we may simply not have tried yet. */
  test("cold outranks unreachable", () => {
    expect(nwsFeed(nws({ checked_at: null, reachable: false }), NOW)).toBe("cold");
  });

  /* ⚠️ Unreachable outranks stale. A failed attempt is a more specific fact
     than an old success, and it is the one that tells a reader to go elsewhere. */
  test("unreachable outranks stale", () => {
    const old = new Date(NOW - 86_400_000).toISOString();
    expect(nwsFeed(nws({ checked_at: old, reachable: false }), NOW)).toBe("unreachable");
  });
});

describe("⚠️ no copy on any path says anywhere is clear", () => {
  /* The sentence this panel may not write, in the forms it would take. Checked
     over EVERY state and every count combination rather than over the quiet
     one, because the quiet one is the branch a reviewer would think to read. */
  const FORBIDDEN = [
    "all clear",
    "all-clear",
    "no flooding",
    "nothing to report",
    "no alerts in effect",
    "you are safe",
    "it is safe",
    "is clear",
    "are clear",
    "you are fine",
    "no danger",
    "no risk",
  ];

  const every: string[] = [];
  for (const feed of ["cold", "unreachable", "stale", "current"] as const) {
    for (const local of [0, 1, 3]) {
      for (const elsewhere of [0, 1, 4]) {
        for (const age of [null, 40, 4000]) {
          every.push(nwsNote(feed, local, elsewhere, age));
        }
      }
    }
    every.push(nwsCountLabel(feed, 0), nwsCountLabel(feed, 1), nwsCountLabel(feed, 7));
  }

  test("the whole copy set is swept, not one branch of it", () => {
    expect(every.length).toBeGreaterThan(100);
  });

  test.each(FORBIDDEN)("no string contains %j", (phrase) => {
    const hit = every.find((s) => s.toLowerCase().includes(phrase));
    expect(hit).toBeUndefined();
  });

  /* The positive half. Saying nothing forbidden is not the same as attributing
     the claim, and the attribution is what makes the quiet case honest. */
  test("every state names the National Weather Service", () => {
    for (const s of every) {
      if (s.length < 30) continue; // the short count labels
      expect(s).toMatch(/National Weather Service|NWS/);
    }
  });

  test("the quiet case says out loud that it is about the feed", () => {
    const s = nwsNote("current", 0, 0, 40);
    expect(s).toMatch(/statement about the NWS feed/);
    expect(s).toMatch(/not a statement about the water on any block/);
    expect(s).toMatch(/does not issue/);
  });
});

describe("only `current` may say nothing is active", () => {
  /* ⚠️ The load-bearing one. Two of the four states mean *we do not know*, and
     rendering either as *nothing is active* is the failure the whole file is
     about. */
  test.each(["cold", "unreachable", "stale"] as const)(
    "%s never claims nothing is active",
    (feed) => {
      const s = nwsNote(feed, 0, 0, 40).toLowerCase();
      expect(s).not.toMatch(/no national weather service alert is active/);
    },
  );

  test("current does", () => {
    expect(nwsNote("current", 0, 0, 40)).toMatch(
      /No National Weather Service alert is active for New York City/,
    );
  });

  test("cold says it has not looked, in those words", () => {
    expect(nwsNote("cold", 0, 0, null)).toMatch(/not a statement that nothing is active/i);
  });

  test("unreachable says we do not know", () => {
    expect(nwsNote("unreachable", 0, 0, 40)).toMatch(/does not know what is active/i);
  });
});

describe("the narrowed scope is admitted rather than swallowed", () => {
  /* The panel narrows a statewide feed to five boroughs. A scope narrowed
     silently is a scope a reader cannot audit — and it is the difference
     between a quiet day and a storm that happens to miss this city. */
  test("alerts outside the boroughs are spoken", () => {
    expect(nwsNote("current", 0, 3, 40)).toMatch(/3 alerts active elsewhere/);
  });

  test("and are not mentioned when there are none", () => {
    expect(nwsNote("current", 0, 0, 40)).not.toMatch(/elsewhere/);
  });

  test("one alert is singular", () => {
    expect(nwsNote("current", 0, 1, 40)).toMatch(/1 alert active elsewhere/);
    expect(nwsNote("current", 0, 1, 40)).not.toMatch(/1 alerts/);
  });

  test("an unreachable feed still reports what its last read held", () => {
    expect(nwsNote("unreachable", 0, 2, 300)).toMatch(/2 alerts elsewhere/);
    expect(nwsNote("unreachable", 0, 0, 300)).toMatch(/nothing active anywhere in the feed/);
  });
});

describe("the count readout is never a bare zero", () => {
  /* ⚠️ A `0` beside `NWS` is a number where the reader expects a measurement,
     and this block sits directly above five real ones. `none listed` is about a
     list; `0` reads as a quantity of hazard. */
  test.each(["cold", "unreachable", "stale", "current"] as const)(
    "%s with no alerts renders a word, not a digit",
    (feed) => {
      expect(nwsCountLabel(feed, 0)).not.toMatch(/\d/);
    },
  );

  test("and a real count renders as one", () => {
    expect(nwsCountLabel("current", 2)).toBe("2 alerts");
    expect(nwsCountLabel("current", 1)).toBe("1 alert");
  });

  test("a fault state does not report a count it cannot vouch for", () => {
    expect(nwsCountLabel("unreachable", 5)).toBe("feed down");
    expect(nwsCountLabel("cold", 5)).toBe("not read");
  });
});

describe("colour is spent on the service, never on the weather", () => {
  /* ⚠️ There is no severity ramp in this block. NWS's severity words and this
     app's depth band overlap, and a red row beside an amber depth pill invites
     reading one against the other. The only fault colour is about the feed. */
  test("the two fault states are faulted and the other two are not", () => {
    expect(nwsFaulted("unreachable")).toBe(true);
    expect(nwsFaulted("stale")).toBe(true);
    expect(nwsFaulted("current")).toBe(false);
    /* ⚠️ Cold is deliberately NOT a fault. A cold start is the ordinary first
       fifteen seconds of the page, and painting it amber would make the
       indicator fire on every load — `gaugeFreshnessOf`'s lesson, one panel
       over. */
    expect(nwsFaulted("cold")).toBe(false);
  });
});

describe("the age helper", () => {
  test("measures from the last SUCCESSFUL read", () => {
    expect(nwsCheckedAgeS(nws(), NOW)).toBe(40);
  });

  test("is null when there has never been one", () => {
    expect(nwsCheckedAgeS(nws({ checked_at: null }), NOW)).toBeNull();
    expect(nwsCheckedAgeS(null, NOW)).toBeNull();
  });

  /* An unparseable timestamp is not zero seconds old. `toBeNull` and not
     `toBe(0)`: a zero would render as "read just now" over a value we could
     not read at all. */
  test("an unparseable stamp is null, never zero", () => {
    expect(nwsCheckedAgeS(nws({ checked_at: "not a date" }), NOW)).toBeNull();
    expect(nwsFeed(nws({ checked_at: "not a date" }), NOW)).toBe("cold");
  });

  /* A clock behind the server's must not produce a negative age that formats
     as something in the future. */
  test("a stamp ahead of the browser clamps to zero", () => {
    const ahead = new Date(NOW + 60_000).toISOString();
    expect(nwsCheckedAgeS(nws({ checked_at: ahead }), NOW)).toBe(0);
  });
});
