"use client";

/**
 * The manage face — what a subscriber sees when they open a link from an email.
 *
 * ## ⚠️ Why this is a component and not part of `watch-panel.tsx`
 *
 * It was the `manage` mode of that panel until 2026-08-16, reachable only by
 * arriving at `/map` with `?confirm=` or `?watch=` in the URL. **That link was
 * unreachable in production and had been since the session gate landed.**
 * `/map` is wrapped in `RequireSession`, so a signed-out reader was redirected
 * to sign-in before `MapWorkspace` — and therefore the panel, and therefore the
 * effect that read the token — ever mounted. A subscriber with no Fluud account
 * could not confirm their address and could not unsubscribe, which is the exact
 * outcome `api._AUTH_EXEMPT` exempts `/api/watch/confirm` and
 * `/api/watch/unsubscribe` to prevent.
 *
 * So the face moved out to `/watch/`, which is not gated, and the mail links
 * moved with it. See `src/app/watch/page.tsx` and `waterline/mail.py`.
 *
 * ## ⚠️ What it may not do
 *
 * **No readings, no depths, no ages, no severity colours.** Everything here is
 * a fact about what the reader asked for, never about the water.
 *
 * ⚠️ **Two fields look like state and are not**, and both are `--wl-stale`
 * prose rather than a mark: `alert_permitted` (FloodNet withdrew permission to
 * alarm from this deployment) and `silent` (no reading for over an hour). Each
 * says that a watch the reader is holding has stopped being able to tell them
 * anything, which is a fact about the *subscription*. Both are booleans by the
 * time they reach here — the server holds the timestamp behind `silent` and
 * reduces it deliberately, so that no amount of work in this file can render an
 * age. See `api-types.ts`.
 *
 * ⚠️ **`silent` replaced an email on 2026-08-05.** A quiet instrument used to
 * queue a message. What that bought: it cannot fan out during a FloodNet
 * outage, cannot go stale, and cannot arrive fifty times in one tick. What it
 * cost: a page cannot reach somebody who is not looking at it, and this was the
 * one signal whose whole purpose was arriving uninvited. LIMITATIONS §16
 * carries the accounting.
 *
 * ## ⚠️ It renders no `Panel` chrome, and that is deliberate
 *
 * The caller supplies the frame. `email_masked` belongs in `PanelTools`, which
 * only the caller can reach, and a `Panel` inside a `Panel` breaks the equal
 * frames rule this app's whole chrome is built on.
 */

import { useState, useTransition } from "react";

import { Chip, Group } from "@/components/list-controls";
import {
  BUTTON,
  DANGER,
  HonestyLine,
  QUIET,
  SettingsFields,
} from "@/components/watch-parts";
import { ApiError, unsubscribeWatch, updateWatch } from "@/lib/api";
import type {
  WatchOverride,
  WatchSubscriptionResponse,
} from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { overridesFor, quietHoursIncomplete } from "@/lib/watch-settings";

/** The override map as the server last stated it. */
function seedOverrides(
  sub: WatchSubscriptionResponse,
): Record<string, WatchOverride> {
  const ov: Record<string, WatchOverride> = {};
  for (const s of sub.sensors) {
    if (s.min_level || s.frequency) {
      ov[s.sensor_id] = {
        min_level: (s.min_level as WatchOverride["min_level"]) ?? null,
        frequency: (s.frequency as WatchOverride["frequency"]) ?? null,
      };
    }
  }
  return ov;
}

export function ManageFace({
  token,
  sub,
  onSub,
  onDeleted,
  note,
  addable,
}: {
  /** The manage token. A bearer credential — see `src/app/watch/page.tsx`. */
  token: string;
  sub: WatchSubscriptionResponse;
  /** The caller keeps its own copy, because `email_masked` renders in its
   *  chrome bar and the sensor count renders in its title. */
  onSub: (next: WatchSubscriptionResponse) => void;
  onDeleted: () => void;
  note: string | null;
  /**
   * The instruments the reader has picked elsewhere that are not yet on this
   * subscription, and a resolver for their names.
   *
   * ⚠️ **Absent means the add control does not render AT ALL — withheld, never
   * disabled.** `sensor-row.tsx`'s rule: offering a control that cannot work
   * reads as a promise. On `/watch/` it is absent, because adding needs the
   * full registry from `/api/sensors`, which stays behind the session gate. The
   * caller says so in words rather than leaving a gap that reads as something
   * failing to load.
   *
   * ⚠️ **The existing rows do NOT need this.** `WatchSensorRef` carries `name`
   * and `borough`, so every watched instrument names itself off the
   * subscription response at zero request cost. Only *adding* needs the
   * registry.
   */
  addable?: { ids: string[]; nameOf: (id: string) => string };
}) {
  /*
   * Seeded once, from the server, with `useState`'s initialiser rather than an
   * effect — this component mounts only after a subscription has loaded, so
   * there is nothing to synchronise. Every save reseeds through `apply` below,
   * so a save the server rejected cannot leave the controls showing an edit it
   * never accepted.
   */
  const [draft, setDraft] = useState(sub.settings);
  const [overrides, setOverrides] = useState(() => seedOverrides(sub));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Store a loaded subscription AND reseed the drafts from it. */
  function apply(loaded: WatchSubscriptionResponse) {
    setDraft(loaded.settings);
    setOverrides(seedOverrides(loaded));
    onSub(loaded);
  }

  /**
   * Every save is a WHOLE statement — the list, the globals, the overrides — so
   * a drop, an add and a settings edit all go through one shape and the server
   * never has to guess which half a partial PUT meant.
   */
  function save(nextSensors: string[]) {
    if (quietHoursIncomplete(draft)) {
      setError("Quiet hours need both a start and an end.");
      return;
    }
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        apply(
          await updateWatch(
            token,
            nextSensors,
            draft,
            overridesFor(overrides, nextSensors),
          ),
        );
        setAdding(false);
        setPendingAdd([]);
        setDone("Saved.");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "the request failed");
      }
    });
  }

  function stop() {
    setError(null);
    startTransition(async () => {
      try {
        await unsubscribeWatch(token);
        setConfirmingDelete(false);
        onDeleted();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "the request failed");
      }
    });
  }

  const subIds = new Set(sub.sensors.map((s) => s.sensor_id));
  const addableIds = (addable?.ids ?? []).filter((id) => !subIds.has(id));
  const slots = Math.max(0, sub.max_sensors - sub.sensors.length);
  const picked = pendingAdd.filter((id) => addableIds.includes(id));

  return (
    <div className="flex flex-col gap-3">
      {/*
       * Rows, not chips — which is what lets each note name the row above it
       * instead of listing instruments in prose. A row with a note takes an
       * amber left rule.
       */}
      <Group label={`sensors · ${sub.sensors.length}`}>
        {sub.sensors.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            No sensors watched. That is a statement about this list, not about
            conditions.
          </p>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-md border border-border">
            {sub.sensors.map((s) => {
              const notes: string[] = [];
              if (!s.alert_permitted) {
                notes.push(
                  "FloodNet no longer permits an alarm from this " +
                    "deployment, so Fluud cannot warn you from " +
                    "it. It is still listed because you asked for " +
                    "it, and it will start again if FloodNet marks " +
                    "it healthy.",
                );
              }
              /* Exclusive with `citywide_silence` by construction: the server
                 forces every `silent` false when it is true. */
              if (s.silent) {
                notes.push(
                  "Fluud has had no reading for over an hour " +
                    "from this deployment, so it can tell you " +
                    "nothing about that corner until it reports " +
                    "again. This is not a statement about conditions.",
                );
              }
              return (
                <div
                  key={s.sensor_id}
                  className={cn(
                    "border-b border-[var(--wl-rule)] last:border-b-0",
                    notes.length > 0 && "border-l-2 border-l-[var(--wl-stale)]",
                  )}
                >
                  <div className="flex items-center gap-2.5 px-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {s.name ?? s.sensor_id}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        save(
                          sub.sensors
                            .map((x) => x.sensor_id)
                            .filter((x) => x !== s.sensor_id),
                        )
                      }
                      disabled={pending}
                      className="shrink-0 cursor-pointer font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      drop
                    </button>
                  </div>
                  {notes.map((n) => (
                    <p
                      key={n}
                      className="px-2.5 pb-2 text-[10.5px] leading-snug text-[var(--wl-stale)]"
                    >
                      {n}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Group>

      {/* ❌ ⚠️ **A `cameras` group sat here and is UNMOUNTED.** It listed the
          watched cameras with a `watched` note in `alert_permitted`'s idiom,
          and a `drop`. The camera watch went with the on-page alert system:
          `WatchSubscriptionResponse` no longer carries `cameras`, both write
          routes refuse `camera_ids` with a 400, and `camera_subscriptions`
          stays in the schema holding rows nothing reads. A reader with old
          camera rows sees a sensors-only list, which is the honest version —
          nothing is going to be mailed about a camera. */}

      <Group label="notifications">
        <SettingsFields
          value={draft}
          onChange={setDraft}
          instruments={sub.sensors.map((s) => ({
            id: s.sensor_id,
            name: s.name ?? s.sensor_id,
            kind: "sensor" as const,
          }))}
          overrides={overrides}
          onOverridesChange={setOverrides}
        />
        <button
          type="button"
          onClick={() => save(sub.sensors.map((s) => s.sensor_id))}
          disabled={pending}
          className={cn(BUTTON, "mt-2")}
        >
          {pending ? "working…" : "save notification settings"}
        </button>
      </Group>

      {adding && addable && (
        <Group label="add">
          {addableIds.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Nothing new is picked. Choose a sensor in the list, press{" "}
              <b className="font-semibold text-[var(--wl-cyan)]">
                Start Monitor
              </b>{" "}
              on its panel, and it will appear here.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1">
                {addableIds.map((id) => (
                  <Chip
                    key={id}
                    on={picked.includes(id)}
                    onClick={() =>
                      setPendingAdd((p) =>
                        p.includes(id)
                          ? p.filter((x) => x !== id)
                          : picked.length >= slots
                            ? p
                            : [...p, id],
                      )
                    }
                  >
                    {addable.nameOf(id)}
                  </Chip>
                ))}
              </div>
              {picked.length >= slots && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wl-stale)]">
                  {sub.max_sensors} is the most one address can watch. Drop one
                  above to add another.
                </p>
              )}
            </>
          )}
        </Group>
      )}

      {/*
       * ⚠️ Panel-level, not a row note: half the registry dark is our feed, not
       * their instrument, and naming a reader's corner then is a true-shaped
       * sentence about the wrong subject. The two branches are exclusive by
       * construction — see the row notes.
       */}
      {sub.citywide_silence && (
        <p className="text-[11px] leading-relaxed text-[var(--wl-stale)]">
          Fluud has lost most of the FloodNet registry, so it cannot say whether
          any of these instruments is reporting. That is a statement about
          Fluud, not about your instruments and not about conditions.
        </p>
      )}

      {!sub.confirmed && (
        <p className="text-[11px] leading-relaxed text-[var(--wl-stale)]">
          This address has not confirmed yet, so nothing will be sent to it.
        </p>
      )}

      <HonestyLine note={note} />

      {confirmingDelete ? (
        /* In-panel confirm, replacing the browser dialog the old `stop()` never
           had. The honesty line above stays whole — the design trims it here
           and this file does not. */
        <div className="rounded-md border border-[var(--wl-emergency)] bg-[var(--wl-emergency)]/6 p-3">
          <p className="font-mono text-[10px] tracking-[0.1em] text-[var(--wl-emergency)] uppercase">
            stop and delete
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            This deletes your address, the {sub.sensors.length}{" "}
            {sub.sensors.length === 1 ? "watch" : "watches"} on it, and
            everything queued for it. There is no way back except subscribing
            again.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={stop}
              disabled={pending}
              className={DANGER}
            >
              {pending ? "working…" : "delete it"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className={QUIET}
            >
              keep watching
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {addable &&
            (adding ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    save([
                      ...sub.sensors.map((s) => s.sensor_id),
                      ...picked,
                    ])
                  }
                  disabled={pending || picked.length === 0}
                  className={BUTTON}
                >
                  {pending ? "working…" : `save ${picked.length} more`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setPendingAdd([]);
                  }}
                  className={QUIET}
                >
                  cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={BUTTON}
              >
                add another instrument
              </button>
            ))}
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className={QUIET}
          >
            stop and delete
          </button>
        </div>
      )}

      {/*
       * ⚠️ Both of these say what happened to the REQUEST. Neither says
       * anything about conditions, and a failure here must never read as calm —
       * "the request failed" is a statement about this page.
       */}
      {done && (
        <p
          className="text-[11px] leading-relaxed text-muted-foreground"
          role="status"
        >
          {done}
        </p>
      )}
      {error && (
        <p className="text-[11px] leading-relaxed text-[var(--wl-emergency)]">
          {error}
        </p>
      )}
    </div>
  );
}
