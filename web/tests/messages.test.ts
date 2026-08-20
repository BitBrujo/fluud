/**
 * What the NOTICES strip says, and — more importantly — what it refuses to say.
 *
 * `lib/messages.ts` carries three judgements that no compiler can check and
 * that all fail silently on the page:
 *
 *   1. an unreachable service suppresses **everything**, not just the other
 *      service rows — a warning log under a dead connection is a list of
 *      warnings from a page that is no longer connected;
 *   2. the log is suppressed while an alert is open, or the page stops reading
 *      worst-first;
 *   3. `id` changes when the claim changes and `slot` does not, which is what
 *      keeps a flapping poller from interrupting a screen reader on every flap.
 *
 * The third is the one worth being careful about: getting it backwards
 * typechecks perfectly and is only observable with a screen reader attached to
 * an instance whose container the host has suspended.
 */
import { describe, expect, test } from "vitest";

import { buildMessages, type MessageInput } from "../src/lib/messages";
import { HISTORY_MAX_AGE_S } from "../src/lib/warning-feed";
import { ApiError } from "../src/lib/api";
import type { HealthResponse, SpeakEvent, StatusResponse } from "../src/lib/api-types";
import type { Polled } from "../src/lib/hooks/use-polled";
import type { Level } from "../src/lib/levels";
import { tickColdAfterS } from "../src/lib/staleness";

const NOW = Date.parse("2026-08-05T12:00:00Z");

/** Settled, healthy, no error — the shape a test overrides one field of. */
function polled<T>(data: T | null, over: Partial<Polled<T>> = {}): Polled<T> {
  return {
    data,
    error: null,
    lastSuccessAt: NOW - 15_000,
    settled: true,
    ...over,
  };
}

/**
 * `over` is the PAYLOAD; `wrapper` is the poll state around it.
 *
 * They are two arguments because they answer two different questions —
 * "what did the service say" versus "could we reach it at all" — and the
 * unreachable case needs the second while still having a stale first.
 */
function health(
  over: Partial<HealthResponse> = {},
  wrapper: Partial<Polled<HealthResponse>> = {},
): Polled<HealthResponse> {
  return polled(
    {
      poll_in_service: true,
      polling: true,
      last_tick_at: "2026-08-05T11:59:30Z",
      ...over,
    } as HealthResponse,
    wrapper,
  );
}

/** `/api/status` only ever reaches `buildMessages` through its error branch. */
function status(over: Partial<Polled<StatusResponse>> = {}): Polled<StatusResponse> {
  return polled({} as StatusResponse, over);
}

/** A warning `sec` seconds before NOW. */
function spoken(sec: number, level: Level = "warning", over: Partial<SpeakEvent> = {}): SpeakEvent {
  return {
    type: "speak",
    text: "There is water on the street at Ave C @ 23 St.",
    level,
    lang: "en",
    place: "Ave C @ 23 St",
    mood: "urgent",
    depth_mm: 40,
    at: new Date(NOW - sec * 1000).toISOString(),
    ...over,
  };
}

function build(over: Partial<MessageInput> = {}) {
  return buildMessages({
    health: health(),
    status: status(),
    history: [],
    openAlerts: 0,
    now: NOW,
    ...over,
  });
}

describe("service faults", () => {
  test("a healthy service says nothing at all", () => {
    expect(build()).toEqual([]);
  });

  test("unreachable suppresses every other row, including the log", () => {
    const messages = build({
      // Every other condition is ALSO true — a stale payload saying the poller
      // stopped, a failing /api/status, and two warnings in the log.
      health: health({ polling: false }, { error: new ApiError("offline", 0) }),
      status: status({ error: new ApiError("boom", 500) }),
      history: [spoken(60), spoken(120)],
    });

    // Without the whole-array early return this would be four rows: the
    // unreachable one, the stopped poller, the failed readings, and two
    // warnings from a page that is no longer connected to anything.
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("service:unreachable");
  });

  test("a stopped poller and failed readings are two separate rows", () => {
    const messages = build({
      health: health({ polling: false }),
      status: status({ error: new ApiError("db down", 500) }),
    });

    expect(messages.map((m) => m.id)).toEqual([
      "service:poll-stopped",
      "service:status",
    ]);
  });

  test("poll_in_service false with NO writes block says nothing", () => {
    // ⚠️ **This test's premise NARROWED on 2026-08-15 and the old wording would
    // now read the new rows as a regression.** It used to assert silence for the
    // whole `poll_in_service: false` case, on the grounds that `polling: false`
    // is simply correct in the separate-process shape and crying wolf there
    // trains people to ignore the row. That reasoning still holds for `polling`
    // and `last_tick_at`, which are globals in the API's own process.
    //
    // What it covers now is the case where the server said nothing about the
    // heartbeat at all: an instance built before `writes` existed (a rolling
    // deploy), or a database where `poll_ticks` has not been created. Absence is
    // not a verdict, so the page falls back to the old path and stays quiet.
    expect(
      build({
        health: health({
          poll_in_service: false,
          polling: false,
          last_tick_at: "2026-08-05T09:00:00Z",
        }),
      }),
    ).toEqual([]);
  });

  test("a healthy separate-process poller says nothing", () => {
    // ⚠️ **The false positive this whole design exists to avoid.** The API runs
    // with the flag off and the poller runs in its own container, both fine.
    // `polling` is false and `last_tick_at` is null in this process, and the old
    // gate is what kept those from being read as a fault. `writes` is warm on
    // both counts, so nothing fires.
    expect(
      build({
        health: health({
          poll_in_service: false,
          polling: false,
          last_tick_at: null,
          writes: {
            tick_at: "2026-08-05T11:59:30Z",
            tick_ok: true,
            readings: 390,
            stored: 388,
            last_store_at: "2026-08-05T11:59:30Z",
          },
        }),
      }),
    ).toEqual([]);
  });

  test("a cold heartbeat is a fault even with the flag off", () => {
    // The regression test for the gate change. `writes` is read out of Postgres
    // and is written by whichever process runs the loop, so a cold `tick_at`
    // here is a real claim about a poller that lives somewhere else.
    const messages = build({
      health: health({
        poll_in_service: false,
        polling: false,
        last_tick_at: null,
        writes: {
          tick_at: "2026-08-05T09:00:00Z",
          tick_ok: true,
          readings: 390,
          stored: 388,
          last_store_at: "2026-08-05T09:00:00Z",
        },
      }),
    });

    // Frozen rather than stopped: `polling: false` is not evidence of an exited
    // thread when the thread was never supposed to be in this process.
    expect(messages.map((m) => m.id)).toEqual(["service:poll-frozen"]);
  });

  test("no poller has ever ticked in this mode", () => {
    // ⚠️ The bare-`uvicorn` shape, and the case that was completely silent
    // before. A present block with a null `tick_at` is a positive statement:
    // `poll_ticks` exists and holds no row for this mode.
    const messages = build({
      health: health({
        poll_in_service: false,
        polling: false,
        last_tick_at: null,
        writes: {
          tick_at: null,
          tick_ok: null,
          readings: null,
          stored: null,
          last_store_at: null,
        },
      }),
    });

    expect(messages.map((m) => m.id)).toEqual(["service:poll-absent"]);
    expect(messages[0].slot).toBe("service:poll");
  });

  test("a loop that ticks and stores nothing is its own row", () => {
    // The failure `last_tick_at` structurally cannot report. The tick is warm,
    // so the frozen row is wrong; only `last_store_at` can see this.
    const messages = build({
      health: health({
        writes: {
          tick_at: "2026-08-05T11:59:30Z",
          tick_ok: false,
          readings: 390,
          stored: 0,
          last_store_at: "2026-08-05T11:00:00Z",
        },
      }),
    });

    expect(messages.map((m) => m.id)).toEqual(["service:poll-dry"]);
    expect(messages[0].slot).toBe("service:poll-writes");
    expect(messages[0].body).toContain("1h");
  });

  test("a stopped loop does not also get the dry row", () => {
    // One claim, said once. A loop that is not running already invalidates
    // everything below it, so stacking "and it stored nothing" adds no
    // information and costs a row in a fixed-height box.
    const messages = build({
      health: health({
        polling: false,
        writes: {
          tick_at: "2026-08-05T11:59:30Z",
          tick_ok: false,
          readings: 0,
          stored: 0,
          last_store_at: null,
        },
      }),
    });

    expect(messages.map((m) => m.id)).toEqual(["service:poll-stopped"]);
  });

  test("stored: 0 is read as a claim and never as absence", () => {
    // ⚠️ `stored: 0` is falsy and means *this tick stored nothing new*, which is
    // a legitimate state when FloodNet has published nothing. It may not on its
    // own produce a fault — `last_store_at` is what decides, and here it is warm.
    expect(
      build({
        health: health({
          writes: {
            tick_at: "2026-08-05T11:59:30Z",
            tick_ok: true,
            readings: 390,
            stored: 0,
            last_store_at: "2026-08-05T11:58:00Z",
          },
        }),
      }),
    ).toEqual([]);
  });

  test("unreachable still suppresses every poller row", () => {
    // Extends the early-return test above to the rows added on 2026-08-15.
    const messages = build({
      health: health(
        {
          writes: {
            tick_at: null,
            tick_ok: null,
            readings: null,
            stored: null,
            last_store_at: null,
          },
        },
        { error: new ApiError("offline", 0) },
      ),
      status: status({ error: new ApiError("boom", 500) }),
    });

    expect(messages.map((m) => m.id)).toEqual(["service:unreachable"]);
  });

  test("no poller row claims anything is clear", () => {
    // The never-safe sweep, over every state that produces a row here. A fault
    // about the instrument may not reassure anybody about the water.
    const states: Partial<HealthResponse>[] = [
      { polling: false },
      {
        writes: {
          tick_at: null, tick_ok: null, readings: null,
          stored: null, last_store_at: null,
        },
      },
      {
        writes: {
          tick_at: "2026-08-05T11:59:30Z", tick_ok: false, readings: 390,
          stored: 0, last_store_at: "2026-08-05T09:00:00Z",
        },
      },
      {
        writes: {
          tick_at: "2026-08-05T09:00:00Z", tick_ok: true, readings: 390,
          stored: 388, last_store_at: "2026-08-05T09:00:00Z",
        },
      },
    ];

    for (const over of states) {
      const messages = build({ health: health(over) });
      expect(messages.length).toBeGreaterThan(0);
      for (const m of messages) {
        const text = `${m.title} ${m.body}`.toLowerCase();
        for (const banned of [
          "all clear", "no flooding", "is clear", "you are safe",
          "nothing to worry", "safe to", "conditions are normal",
        ]) {
          expect(text).not.toContain(banned);
        }
        expect(m.code).toBeUndefined();
      }
    }
  });

  test("the poll row names no host-specific fix", () => {
    // ⚠️ It carried a hosting platform's deploy flags in `code` until that host
    // went. A fault body that names a platform this deployment is not on sends a
    // reader to check a setting that does not exist, and the actual failure —
    // the loop is not ticking — is the same everywhere. The swept list is
    // deliberately broader than any host this has run on: the rule is about the
    // SHAPE of the advice, so it has to outlive the next migration too.
    const [poll] = build({ health: health({ polling: false }) });

    expect(poll.code).toBeUndefined();
    for (const host of [
      "railway", "cloud run", "fly.io", "heroku", "render",
      "vercel", "kubernetes", "docker", "systemd",
    ]) {
      expect(poll.body.toLowerCase()).not.toContain(host);
    }
  });
});

describe("ids and slots", () => {
  test("frozen and stopped are two ids on one slot", () => {
    const stopped = build({ health: health({ polling: false }) })[0];
    // ⚠️ **Derived from the threshold, not a literal.** This said 11:50 — ten
    // minutes — until 2026-08-20, when `tickColdAfterS` went from three 60s
    // ticks to three 15-minute windows and ten minutes stopped being frozen at
    // all. The test then failed on `undefined.id`, several assertions away from
    // the thing that had actually changed.
    const frozen = build({
      health: health({
        polling: true,
        last_tick_at: new Date(
          NOW - (tickColdAfterS() + 60) * 1000,
        ).toISOString(),
      }),
    })[0];

    // Different claims about the poller, so a reader who dismissed one is
    // shown the other.
    expect(stopped.id).not.toBe(frozen.id);
    // ...but ONE React key, so a flapping instance re-renders the row instead
    // of unmounting and remounting it. `role="alert"` announces on insertion,
    // so keying on the id would interrupt a screen reader on every flap.
    expect(stopped.slot).toBe(frozen.slot);
    expect(stopped.slot).toBe("service:poll");
  });

  test("ids are stable across rebuilds when nothing has changed", () => {
    // The strip is rebuilt on every `useNow` tick. An id that churned would
    // resurrect a dismissed row roughly once a second.
    const first = build({ history: [spoken(60)], health: health({ polling: false }) });
    const second = build({ history: [spoken(60)], health: health({ polling: false }) });

    expect(first.map((m) => m.id)).toEqual(second.map((m) => m.id));
  });

  test("a warning id survives re-delivery of the same event", () => {
    // `keyFor` is the reducer's own dedupe key. Two notions of "the same
    // warning" is how a dismissed row returns on the next SSE reconnect.
    const event = spoken(60);
    const a = build({ history: [event] })[0];
    const b = build({ history: [{ ...event }] })[0];

    expect(a.id).toBe(b.id);
  });
});

describe("the warning log", () => {
  test("carries the frame and never the words", () => {
    // The root CLAUDE.md forbids rendering the templated sentence twice.
    // `warning-block.tsx` is the single rendering; these rows carry level,
    // place, clock and provenance so that a DRILL cannot read as a real flood.
    const [row] = build({ history: [spoken(60, "watch", { drill: true })] });

    expect(row.tone).toBe("log");
    expect(row.body).toBe("");
    expect(row.level).toBe("watch");
    expect(row.place).toBe("Ave C @ 23 St");
    expect(row.at).toBeTruthy();
    expect(row.drill).toBe(true);
  });

  test("is empty while any alert is open", () => {
    // Worst-first: this strip sits above `AlertList`, and finished warnings
    // stacked over a running alert invert the page's reading order.
    expect(build({ history: [spoken(60)], openAlerts: 1 })).toEqual([]);
  });

  test("faults still render while an alert is open", () => {
    // The suppression is of the LOG, not of the strip.
    const messages = build({
      history: [spoken(60)],
      openAlerts: 1,
      health: health({ polling: false }),
    });

    expect(messages.map((m) => m.id)).toEqual(["service:poll-stopped"]);
  });

  test("drops entries past HISTORY_MAX_AGE_S", () => {
    // `HISTORY_LIMIT` caps the COUNT and nothing evicted by age, so a warning
    // could sit in the log indefinitely on a quiet night — the stale-replay rule's
    // failure in a new surface.
    const messages = build({
      history: [spoken(HISTORY_MAX_AGE_S - 1), spoken(HISTORY_MAX_AGE_S + 1)],
    });

    expect(messages).toHaveLength(1);
  });

  test("drops an entry whose timestamp cannot be parsed", () => {
    // A row with no clock cannot say it is history, which is the one thing a
    // log row is for.
    expect(build({ history: [spoken(60, "warning", { at: "not a date" })] })).toEqual([]);
  });

  test("faults sort above the log", () => {
    const messages = build({
      history: [spoken(60)],
      health: health({ polling: false }),
    });

    expect(messages.map((m) => m.tone)).toEqual(["fault", "log"]);
  });
});
