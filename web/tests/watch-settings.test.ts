/**
 * The watch flow's two pure rules.
 *
 * ⚠️ **Nothing else in the watch feature is reachable from here, and that is
 * the honest scope.** The panel, the manage face and the `/watch/` route are
 * components; the tests run under `environment: "node"` and **jsdom is not
 * being added** — see `web/CLAUDE.md` for why a green assertion over an
 * unmeasured page is worse than no assertion. What is left is these two
 * functions, and both encode a rule a compiler cannot see.
 *
 * `overridesFor`'s id filter is the one with teeth. Every save is a whole
 * statement — the list, the globals and the overrides together — and the
 * override map is edited independently of the list. Unfiltered, dropping a
 * sensor and saving would keep its override on the wire, and re-adding that
 * instrument later would resurrect a setting the reader believed they removed
 * with it.
 */
import { describe, expect, test } from "vitest";

import type { WatchOverride, WatchSettings } from "../src/lib/api-types";
import {
  DEFAULT_SETTINGS,
  SENT_AUTO_CLOSE_S,
  overridesFor,
  quietHoursIncomplete,
  sentFaceAutoCloses,
  sentFaceClosingNote,
  sentFaceHeading,
  sentFaceNote,
  watchManageHref,
} from "../src/lib/watch-settings";

const settings = (
  quiet_start: number | null,
  quiet_end: number | null,
): WatchSettings => ({ ...DEFAULT_SETTINGS, quiet_start, quiet_end });

describe("quietHoursIncomplete", () => {
  test("both unset is complete — that is quiet hours OFF", () => {
    expect(quietHoursIncomplete(settings(null, null))).toBe(false);
  });

  test("both set is complete", () => {
    expect(quietHoursIncomplete(settings(22, 7))).toBe(false);
  });

  test("half a window is incomplete, in both directions", () => {
    expect(quietHoursIncomplete(settings(22, null))).toBe(true);
    expect(quietHoursIncomplete(settings(null, 7))).toBe(true);
  });

  /*
   * ⚠️ Midnight is `0`, and `0` is falsy. A truthiness test here would call a
   * perfectly complete window incomplete and refuse the save, or — with the
   * comparison the other way round — let half a window through to the server.
   * Both hours are exercised because the bug can live on either side.
   */
  test("midnight is an hour, not an absence", () => {
    expect(quietHoursIncomplete(settings(0, 7))).toBe(false);
    expect(quietHoursIncomplete(settings(22, 0))).toBe(false);
    expect(quietHoursIncomplete(settings(0, 0))).toBe(false);
    expect(quietHoursIncomplete(settings(0, null))).toBe(true);
    expect(quietHoursIncomplete(settings(null, 0))).toBe(true);
  });
});

describe("overridesFor", () => {
  const full: Record<string, WatchOverride> = {
    a: { min_level: "warning", frequency: null },
    b: { min_level: null, frequency: "first" },
    c: { min_level: "emergency", frequency: "first" },
  };

  test("keeps only the ids asked for", () => {
    expect(Object.keys(overridesFor(full, ["a", "c"])).sort()).toEqual([
      "a",
      "c",
    ]);
  });

  /*
   * ⚠️ The resurrection case, stated as its own test because it is the reason
   * the filter exists. Dropping `b` from the list must take `b`'s override off
   * the wire even though the map still holds it — the map is not cleared when a
   * row is dropped, and clearing it would lose the setting if the save failed.
   */
  test("an id dropped from the list has its override dropped too", () => {
    expect(overridesFor(full, ["a", "c"])).not.toHaveProperty("b");
  });

  test("an id with no override contributes nothing", () => {
    expect(overridesFor(full, ["a", "zzz"])).toEqual({
      a: { min_level: "warning", frequency: null },
    });
  });

  /*
   * Both keys null means *the global applies*, which is what sending no
   * override says. Sending it as an override would make the server store a row
   * that states nothing.
   */
  test("an entry with neither key set is dropped", () => {
    const empty: Record<string, WatchOverride> = {
      a: { min_level: null, frequency: null },
      b: {} as WatchOverride,
    };
    expect(overridesFor(empty, ["a", "b"])).toEqual({});
  });

  test("an empty id list yields an empty object, never the source", () => {
    expect(overridesFor(full, [])).toEqual({});
  });

  test("it does not mutate the source", () => {
    const before = JSON.stringify(full);
    overridesFor(full, ["a"]);
    expect(JSON.stringify(full)).toBe(before);
  });
});

/**
 * ⚠️ **The highest-value assertion in this file, and it is a negative one.**
 * Every link Fluud mailed pointed at `/map/?watch=` until 2026-08-16, `/map` is
 * wrapped in `RequireSession`, and a subscriber with no account was redirected
 * to sign-in before the component reading the token ever mounted — so every
 * unsubscribe link ever sent was dead in production for the whole life of the
 * gate. `scripts/check_mail.py` grew a negative assertion that no rendered mail
 * body contains `/map/?`. This is the same failure class arriving on the UI
 * side, where no check script can reach it.
 */
describe("watchManageHref", () => {
  test("points at the ungated /watch/ route", () => {
    expect(watchManageHref("tok")).toBe("/watch/?watch=tok");
  });

  test("never produces the gated /map/ shape", () => {
    for (const t of ["tok", "a/b", "a b", "ünïcode", "="]) {
      expect(watchManageHref(t)).not.toContain("/map/?");
      expect(watchManageHref(t).startsWith("/watch/?watch=")).toBe(true);
    }
  });

  test("encodes a token that would otherwise break the query string", () => {
    expect(watchManageHref("a&b=c")).toBe("/watch/?watch=a%26b%3Dc");
    expect(watchManageHref("a/b")).toBe("/watch/?watch=a%2Fb");
  });
});

/**
 * ⚠️ **The `sent` face's copy, and the branch that can be WRONG.**
 *
 * A signed-in reader watching their own provider-verified address is subscribed
 * outright — there is no confirmation step and nothing will arrive that they
 * have to act on. Telling that reader to check their inbox sends them to watch
 * a mailbox for a message that is not a step, which is the failure this sweep
 * exists to catch. The copy is in `src/lib/` rather than in JSX precisely so
 * this can be asserted at all — `nws.ts`'s argument, one feature over.
 */
describe("sentFaceNote", () => {
  const MAIL: (boolean | undefined)[] = [true, false, undefined];

  test("the confirmed branch never sends anybody to an inbox", () => {
    for (const m of MAIL) {
      const t = sentFaceNote("confirmed", m).text.toLowerCase();
      for (const banned of [
        "check that address",
        "inbox",
        "confirm",
        "nothing is sent until",
        "waiting",
      ]) {
        expect(t).not.toContain(banned);
      }
      // It has to say the watch is running, or the face says nothing at all.
      expect(t).toContain("your watch is live");
    }
  });

  test("the pending branch is unchanged, byte for byte", () => {
    expect(sentFaceNote("pending", true).text).toBe(
      "Check that address. Nothing is sent until you confirm from the email, " +
        "and if that was not you, ignoring it does nothing.",
    );
    expect(sentFaceNote("pending", undefined).text).toBe(
      sentFaceNote("pending", true).text,
    );
    expect(sentFaceNote("pending", false).text).toBe(
      "No email was sent. This deployment has no mail transport configured. " +
        "Your request is stored. The confirmation link cannot reach you.",
    );
  });

  /* ⚠️ `=== false`, never `!` — `undefined` is an older instance mid-deploy and
     absence is not a verdict. Printing the fault copy against it would tell a
     reader on a healthy deployment to stop watching their inbox. */
  test("only an explicit false raises the fault branch", () => {
    for (const status of ["pending", "confirmed"] as const) {
      expect(sentFaceNote(status, false).fault).toBe(true);
      expect(sentFaceNote(status, true).fault).toBe(false);
      expect(sentFaceNote(status, undefined).fault).toBe(false);
    }
  });

  /* Both branches mention mail, so both take the gate — the standing rule that
     any copy in this app promising mail is gated on the server being able to
     send it. What a missing transport costs on the confirmed branch is the
     durable copy of the link, never the subscription. */
  test("the confirmed fault branch still says the watch is live", () => {
    expect(sentFaceNote("confirmed", false).text).toContain("watch is live");
    expect(sentFaceNote("confirmed", false).text).toContain("mail transport");
  });
});

/**
 * ⚠️ **The timer that ends the wizard, and the one branch it may never run on.**
 *
 * The confirmed face is a receipt: the row exists, the watch is live, and there
 * is no next step — so leaving it up is the flow claiming an unfinished step it
 * does not have. What makes this a function rather than `status === "confirmed"`
 * is `mailDelivers === false`, where `sentFaceNote` says in words that the link
 * on the face is the only copy the reader will ever get. A timer that wiped that
 * would destroy a bearer credential nothing can re-issue, because there is no
 * transport to mail it again with.
 *
 * The pairing below is the assertion that earns the file: it reads the two
 * functions against each other rather than restating either one, so an edit to
 * the copy that raises the fault branch on a new input closes the timer on it
 * for free — and an edit that opens the timer there fails here.
 */
describe("sentFaceAutoCloses", () => {
  const MAIL: (boolean | undefined)[] = [true, false, undefined];

  test("the pending face never closes itself, on any deployment", () => {
    for (const m of MAIL) {
      expect(sentFaceAutoCloses("pending", m)).toBe(false);
    }
  });

  test("the confirmed face closes itself where a copy was also mailed", () => {
    expect(sentFaceAutoCloses("confirmed", true)).toBe(true);
    expect(sentFaceAutoCloses("confirmed", undefined)).toBe(true);
  });

  /* ⚠️ The whole reason this is not `status === "confirmed"`. With no transport
     the on-screen link is the only copy of a non-expiring bearer credential. */
  test("no mail transport means the face stays up", () => {
    expect(sentFaceAutoCloses("confirmed", false)).toBe(false);
  });

  /* ⚠️ Read against `sentFaceNote` rather than against a literal, so the two
     cannot drift: any input whose copy claims the link is the only copy must
     never be one the timer runs on. */
  test("it never runs on a branch whose copy says the link is the only one", () => {
    for (const status of ["pending", "confirmed"] as const) {
      for (const m of MAIL) {
        if (sentFaceNote(status, m).fault) {
          expect(sentFaceAutoCloses(status, m)).toBe(false);
        }
      }
    }
  });

  /* `=== false`, never `!` — `undefined` is an older instance mid-deploy and
     absence is not a verdict. Here the safe reading is that a copy was mailed,
     because the confirmed branch's own default copy says so and the two may not
     disagree about the same deployment. */
  test("only an explicit false stops it", () => {
    expect(sentFaceAutoCloses("confirmed", undefined)).toBe(
      sentFaceAutoCloses("confirmed", true),
    );
  });
});

describe("sentFaceClosingNote", () => {
  test("it states the confirmation before the consequence", () => {
    const t = sentFaceClosingNote(SENT_AUTO_CLOSE_S);
    expect(t.startsWith("Confirmed.")).toBe(true);
    expect(t).toContain(`${SENT_AUTO_CLOSE_S}s`);
  });

  /* ⚠️ It sits directly under `sentFaceNote`'s confirmed branch, so it is held
     to that branch's own list. Nothing here may send a reader to an inbox or
     tell them something is on its way — on this path there is no confirmation
     step and nothing is coming that they have to act on. */
  test("it never sends anybody to an inbox", () => {
    for (const s of [0, 1, 5, SENT_AUTO_CLOSE_S, 99]) {
      const t = sentFaceClosingNote(s).toLowerCase();
      for (const banned of ["inbox", "check that", "waiting", "email"]) {
        expect(t).not.toContain(banned);
      }
    }
  });

  test("it carries no claim about conditions", () => {
    for (const s of [1, SENT_AUTO_CLOSE_S]) {
      const t = sentFaceClosingNote(s).toLowerCase();
      for (const banned of ["clear", "safe", "no flooding", "dry"]) {
        expect(t).not.toContain(banned);
      }
    }
  });
});

describe("sentFaceHeading", () => {
  /* ⚠️ `waiting on` is a claim that something is coming. On the fast path
     nothing is, and the verb is the whole of the difference. */
  test("confirmed does not claim anything is on its way", () => {
    expect(sentFaceHeading("confirmed", "a@b.co")).toBe("watching for a@b.co");
    expect(sentFaceHeading("confirmed", "a@b.co")).not.toContain("waiting");
  });

  test("pending is unchanged", () => {
    expect(sentFaceHeading("pending", "a@b.co")).toBe("waiting on a@b.co");
  });
});
