/**
 * The SSE dedupe. `warning-feed.ts` says the guards live in a pure reducer
 * "specifically so this can be tested without a browser or a network" — this is
 * that test, and it is the one the file was shaped for.
 *
 * ⚠️ **The failure this defends against is invisible.** An old warning sitting
 * on screen looking current is indistinguishable from correct behaviour unless
 * you know what time it is. `EventSource` reconnects on its own and
 * `/api/events` replays `rat.recent()` on every connect, so a single dropped
 * connection re-delivers up to five minutes of warnings — which means the
 * reconnect path runs in production far more often than it does in testing.
 */
import { describe, expect, test } from "vitest";

import { applyRatEvent, EMPTY_FEED } from "../src/lib/warning-feed";
import type { MoodEvent, SpeakEvent } from "../src/lib/api-types";
import type { Level } from "../src/lib/levels";

/** A speak event at a given second past the minute. */
function speak(sec: number, text: string, level: Level = "warning"): SpeakEvent {
  return {
    type: "speak",
    text,
    level,
    lang: "en",
    place: "Ave C @ 23 St",
    mood: "urgent",
    depth_mm: 40,
    at: `2026-08-05T12:00:${String(sec).padStart(2, "0")}+00:00`,
  };
}

function mood(sec: number, level: Level): MoodEvent {
  return {
    type: "mood",
    level,
    mood: level,
    at: `2026-08-05T12:00:${String(sec).padStart(2, "0")}+00:00`,
  };
}

/** Feed the reducer a sequence, starting from idle. */
const feed = (...events: (SpeakEvent | MoodEvent)[]) =>
  events.reduce(applyRatEvent, EMPTY_FEED);

describe("the delivery key", () => {
  test("an exact re-delivery returns the SAME object", () => {
    const t1 = speak(10, "water on the street");
    const once = applyRatEvent(EMPTY_FEED, t1);
    const twice = applyRatEvent(once, t1);

    // Identity, not deep equality. The contract is that a caller can skip a
    // render, and a fresh object with equal contents does not deliver that.
    expect(twice).toBe(once);
  });

  test("same timestamp, different words, is a different warning", () => {
    const s = feed(speak(10, "first"), speak(10, "second"));
    expect(s.latest?.text).toBe("second");
    expect(s.history).toHaveLength(2);
  });

  test("a replayed event still renders", () => {
    // `rat.recent()` has already dropped anything past REPLAY_MAX_AGE_S, so a
    // replayed event is by construction under five minutes old and very likely
    // still happening. Suppressing it re-creates the exact failure the replay
    // buffer was added to fix — a page opened mid-storm showing nothing.
    const s = applyRatEvent(EMPTY_FEED, { ...speak(10, "live"), replay: true });
    expect(s.latest?.text).toBe("live");
  });
});

describe("the monotonic clock", () => {
  test("a reconnect mid-storm cannot leave the OLDEST warning on screen", () => {
    // The subtle one. The page saw T3, T4, T5. The connection drops and the
    // server replays T1 through T5. T1 and T2 are genuinely new to this page,
    // so the delivery key lets them through — and applying them in order would
    // leave T2 showing as the current warning. It is not.
    const seen = feed(speak(30, "T3"), speak(40, "T4"), speak(50, "T5"));
    expect(seen.latest?.text).toBe("T5");

    const replayed = [
      speak(10, "T1"),
      speak(20, "T2"),
      speak(30, "T3"),
      speak(40, "T4"),
      speak(50, "T5"),
    ].reduce(applyRatEvent, seen);

    expect(replayed.latest?.text).toBe("T5");
    // Nothing older was applied, so nothing older reached the history either.
    expect(replayed.history.map((e) => e.text)).toEqual(["T5", "T4", "T3"]);
  });

  test("an event at exactly lastAppliedAt is still considered", () => {
    // The guard is `<`, not `<=`. Two warnings can share a second, and dropping
    // the second one would silently lose a real escalation.
    const s = feed(speak(10, "first"), speak(10, "escalated"));
    expect(s.latest?.text).toBe("escalated");
  });

  test("an unparseable timestamp changes nothing", () => {
    const s = feed(speak(10, "real"));
    expect(applyRatEvent(s, { ...speak(10, "junk"), at: "not a date" })).toBe(s);
  });
});

describe("stand-down", () => {
  test("only `clear` idles the panel", () => {
    const s = feed(speak(10, "water on the street"), mood(20, "clear"));
    expect(s.latest).toBeNull();
  });

  test("every other level leaves the words in place", () => {
    // Any non-clear mood always arrives alongside a speak event carrying the
    // actual words, so blanking on one would drop the warning it accompanies.
    const s = feed(speak(10, "water on the street"), mood(20, "emergency"));
    expect(s.latest?.text).toBe("water on the street");
  });

  test("standing down does NOT clear the history", () => {
    // It is a log, not a queue.
    const s = feed(speak(10, "one"), speak(20, "two"), mood(30, "clear"));
    expect(s.latest).toBeNull();
    expect(s.history.map((e) => e.text)).toEqual(["two", "one"]);
  });
});

describe("history", () => {
  test("is capped at five, newest first", () => {
    const s = feed(...[10, 20, 30, 40, 50, 55].map((n) => speak(n, `T${n}`)));
    expect(s.history.map((e) => e.text)).toEqual([
      "T55",
      "T50",
      "T40",
      "T30",
      "T20",
    ]);
  });
});

describe("the idle state is not mutated", () => {
  test("EMPTY_FEED survives a pass through the reducer", () => {
    applyRatEvent(EMPTY_FEED, speak(10, "x"));
    expect(EMPTY_FEED.latest).toBeNull();
    expect(EMPTY_FEED.history).toHaveLength(0);
    expect(EMPTY_FEED.delivered.size).toBe(0);
    expect(EMPTY_FEED.lastAppliedAt).toBe(0);
  });
});
