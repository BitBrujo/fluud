"use client";

/**
 * The parts `watch-panel.tsx` and `watch-manage.tsx` both render.
 *
 * ## Why this file exists
 *
 * The manage face moved to its own route on 2026-08-16 — see
 * `src/app/watch/page.tsx` — and it needs the same buttons, the same settings
 * editor and the same honesty line as the wizard it left behind.
 *
 * ⚠️ **It could not import them from `watch-panel.tsx`.** That file would then
 * import `ManageFace` back, which is the module cycle `station-list.tsx` and
 * `sensor-row.tsx` already hit once when `DepthCell` was briefly exported from
 * the list. A third module both sides import from cannot cycle.
 *
 * ⚠️ **`SettingsFields` was ALREADY shared before this move**, between the
 * wizard's `alerts` face and the manage editor, on `step-button.tsx`'s
 * precedent: two surfaces with the same control have to behave identically or
 * they read as two mechanisms. Splitting the manage face out of the panel would
 * have forked it. This file is that precedent surviving the split.
 *
 * Nothing here renders a reading, a depth, an age or a severity colour.
 */

import { useState } from "react";

import { Chip, Group } from "@/components/list-controls";
import type { WatchOverride, WatchSettings } from "@/lib/api-types";

/** The bordered action button every face shares. */
export const BUTTON =
  "cursor-pointer self-start rounded-[5px] border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-foreground uppercase transition-colors hover:bg-[var(--wl-panel)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The pick face's submit, filled — added 2026-08-06 on the owner's
 * instruction so "watch these" and "email me my link" read as two ranks of
 * action rather than two grey lines. ⚠️ **The second of those is `BUTTON` now**,
 * also on the owner's instruction and later the same day: filled against
 * outline is the two-rank pairing, and the recovery door was reading as a
 * footnote at 9.5px. The reasoning is at that call site. ⚠️ `--wl-select` and
 * nothing else here: it is
 * the landing CTA's fill, poster paint on no scale, and it means "what the
 * reader asked for" — which a submit is. A severity colour or the theme's
 * green `--accent` here would sit an arm's length from live sensor picks.
 */
export const PRIMARY =
  "cursor-pointer self-start rounded-[5px] bg-[var(--wl-select)] px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-[var(--primary-foreground)] uppercase transition-colors hover:bg-[color-mix(in_srgb,var(--wl-select)_85%,black)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

/** The quiet text button beside it. */
export const QUIET =
  "cursor-pointer self-start font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The destructive one — `delete it` inside the stop-and-delete confirm box.
 *
 * ⚠️ **It was an inline class string until 2026-08-16**, the only one of the
 * four idioms in this feature without a name, which is how a fourth button
 * would have ended up a fifth string. It is `--wl-emergency`, and that is the
 * one place in this feature a severity token appears: it describes what
 * pressing the button does to the reader's own record, and it sits nowhere
 * near a reading.
 */
export const DANGER =
  "cursor-pointer self-start rounded-[5px] border border-[var(--wl-emergency)] px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-[var(--wl-emergency)] uppercase transition-colors hover:bg-[var(--wl-emergency)]/10 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

/** The stored vocabulary, mirroring `notify.MIN_LEVELS` / `FREQUENCIES`. */
const TRIGGERS = ["watch", "warning", "emergency"] as const;
const FREQUENCIES = [
  { value: "every", label: "every change" },
  { value: "first", label: "first only" },
] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const SELECT =
  "cursor-pointer rounded-[5px] border border-border bg-[var(--wl-panel)] px-1.5 py-1 text-[11px] text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

/**
 * The notification settings — trigger, frequency, timeline — plus the
 * per-instrument overrides. One component behind the wizard's `alerts` face
 * and the manage face's editor, so the two cannot fork (`step-button.tsx`'s
 * precedent).
 *
 * Everything here is a PREFERENCE about mail. Nothing is a reading, so no
 * severity colour appears — the trigger chips are `--wl-select` like every
 * other "what the reader asked for" mark, whatever level word they carry.
 *
 * ⚠️ **The EMERGENCY sentence under the controls is load-bearing.** The
 * server sends an emergency whatever these settings say (`notify.allowed`);
 * a face that let somebody believe they had muted one would be selling a
 * silence this system refuses to sell.
 *
 * Native `<select>`s, not shadcn — the surface stays pinned at
 * card / badge / alert / button.
 */
export function SettingsFields({
  value,
  onChange,
  instruments,
  overrides,
  onOverridesChange,
}: {
  value: WatchSettings;
  onChange: (next: WatchSettings) => void;
  instruments: { id: string; name: string; kind: "sensor" | "camera" }[];
  overrides: Record<string, WatchOverride>;
  onOverridesChange: (next: Record<string, WatchOverride>) => void;
}) {
  const [showOverrides, setShowOverrides] = useState(false);

  const setOverride = (
    id: string,
    key: "min_level" | "frequency",
    raw: string,
  ) => {
    const next = { ...overrides };
    const entry = { ...(next[id] ?? {}) };
    if (raw === "") {
      delete entry[key];
    } else {
      // The two keys hold different unions; the vocabulary is enforced
      // server-side either way (`api._validated_overrides`).
      (entry as Record<string, string>)[key] = raw;
    }
    if (entry.min_level || entry.frequency) next[id] = entry;
    else delete next[id];
    onOverridesChange(next);
  };

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <Group label="alert me from">
        <div className="flex flex-wrap items-center gap-1">
          {TRIGGERS.map((lvl) => (
            <Chip
              key={lvl}
              on={value.min_level === lvl}
              onClick={() => onChange({ ...value, min_level: lvl })}
              title={
                lvl === "watch"
                  ? "Every level — the default"
                  : `Nothing below ${lvl}`
              }
            >
              {lvl === "watch" ? "watch (all)" : `${lvl} up`}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label="how often">
        <div className="flex flex-wrap items-center gap-1">
          {FREQUENCIES.map((f) => (
            <Chip
              key={f.value}
              on={value.frequency === f.value}
              onClick={() => onChange({ ...value, frequency: f.value })}
              title={
                f.value === "every"
                  ? "A message when an episode opens and at each escalation"
                  : "One message per flood episode"
              }
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label="quiet hours">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Quiet hours start"
            value={value.quiet_start ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                quiet_start:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className={SELECT}
          >
            <option value="">off</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">to</span>
          <select
            aria-label="Quiet hours end"
            value={value.quiet_end ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                quiet_end:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className={SELECT}
          >
            <option value="">off</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">
            New York time
          </span>
        </div>
        {/* The exemption, stated where the mute lives. Suppressed means never
            sent — a delayed warning would present a past flood as a current
            one, so there is no "deliver after" option to offer. */}
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Quiet hours drop watch and warning messages. They do not delay them.
          An emergency always sends, whatever is set here.
        </p>
      </Group>

      {instruments.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showOverrides || hasOverrides}
            onClick={() => setShowOverrides((v) => !v)}
            className="cursor-pointer self-start font-mono text-[9.5px] tracking-[0.1em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
          >
            {showOverrides || hasOverrides
              ? "per-instrument settings"
              : "per-instrument settings ›"}
          </button>
          {(showOverrides || hasOverrides) && (
            <div className="flex flex-col overflow-hidden rounded-md border border-border">
              {instruments.map((inst) => (
                <div
                  key={inst.id}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--wl-rule)] px-2.5 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {inst.name}
                    {inst.kind === "camera" && (
                      <span className="ml-1.5 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                        cam
                      </span>
                    )}
                  </span>
                  <select
                    aria-label={`Trigger for ${inst.name}`}
                    value={overrides[inst.id]?.min_level ?? ""}
                    onChange={(e) =>
                      setOverride(inst.id, "min_level", e.target.value)
                    }
                    className={SELECT}
                  >
                    <option value="">global</option>
                    {TRIGGERS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Frequency for ${inst.name}`}
                    value={overrides[inst.id]?.frequency ?? ""}
                    onChange={(e) =>
                      setOverride(inst.id, "frequency", e.target.value)
                    }
                    className={SELECT}
                  >
                    <option value="">global</option>
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The caveat, always visible, in the server's own words.
 *
 * `note` is `agent._TEMPLATES["watch_note"]` — templated, reviewed, and the
 * identical sentence the confirmation email carries. The fallback below is the
 * only copy in this file that is not the server's, and it exists because a
 * panel that renders nothing here before the first response would be a
 * subscribe button with no caveat under it.
 *
 * ⚠️ **Never shortened, on any face.** The design's delete-confirm screen trims
 * it; rendering a shorter version would make this component the second author
 * of reviewed copy, so the whole sentence renders there too.
 */
export function HonestyLine({ note }: { note: string | null }) {
  return (
    <p className="border-l-2 border-border pl-2.5 text-[11px] leading-relaxed text-muted-foreground">
      {note ??
        "A watch is best effort. If Fluud stops polling, you hear " +
          "nothing. Silence is not a statement about conditions."}
    </p>
  );
}
