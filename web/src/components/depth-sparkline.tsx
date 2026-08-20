"use client";

import type { HistoryPoint } from "@/lib/api-types";
import { depthText, parseServerTime } from "@/lib/format";

const W = 320;
const H = 44;

/**
 * Vertical breathing room, in viewBox units.
 *
 * A sensor reading a true `0` — which is the normal case, and a different thing
 * from an absent reading — traces exactly along y = H, so half its stroke falls
 * outside the box and gets clipped. A dry week would render as a faint dotted
 * hairline that looks like a rendering fault rather than a measurement. The pad
 * keeps the baseline fully drawn.
 */
const PAD = 2;

/**
 * Recent depth for the selected camera.
 *
 * ## What this refuses to draw
 *
 * **A flat line at zero.** An unpaired camera has no depth at any point in its
 * history, and `depth_mm: null` is not `0` — one is "we never measured", the
 * other is "the sensor read zero". A baseline traced along the bottom of the
 * box is the most confident possible way to say "dry all week" about a camera
 * that has never measured anything. Null points break the line instead.
 *
 * **A y-axis that starts anywhere but zero.** Autoscaling the floor to the data
 * turns 2mm of puddle into a mountain range. The floor is 0 and the ceiling is
 * at least `flood_event_mm`, so the shape of the trace is proportional to the
 * thing it is about.
 */
export function DepthSparkline({
  points,
  floodEventMm,
}: {
  points: HistoryPoint[];
  floodEventMm: number;
}) {
  const measured = points.filter((p) => p.depth_mm !== null);
  // One point is not a trend, and a single dot in an empty box invites reading
  // a slope that isn't there.
  if (measured.length < 2) return null;

  const times = points
    .map((p) => parseServerTime(p.t)?.getTime())
    .filter((t): t is number => t !== undefined);
  if (times.length < 2) return null;

  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const span = t1 - t0 || 1;

  const peak = Math.max(...measured.map((p) => p.depth_mm as number));
  // Never autoscale below the threshold the whole tool is calibrated against —
  // otherwise a trace of 1mm noise fills the box and looks like a flood.
  const ceiling = Math.max(peak, floodEventMm) * 1.15;

  const xOf = (t: number) => ((t - t0) / span) * W;
  const yOf = (mm: number) => H - PAD - (mm / ceiling) * (H - PAD * 2);

  // Segments, not one polyline: a gap in the data is a gap in the line. Joining
  // across a missing hour draws an interpolation nobody measured.
  const segments: string[] = [];
  let current: string[] = [];
  for (const p of points) {
    const at = parseServerTime(p.t);
    if (!at || p.depth_mm === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${xOf(at.getTime()).toFixed(1)},${yOf(p.depth_mm).toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(" "));
  if (segments.length === 0) return null;

  const thresholdY = yOf(floodEventMm);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-11 w-full"
        role="img"
        aria-label={`Recent depth, peaking at ${depthText(peak)}`}
      >
        {/* FloodNet's own flood-event definition, drawn so the trace is read
            against it rather than against itself. */}
        {thresholdY > 0 && thresholdY < H && (
          <line
            x1={0}
            x2={W}
            y1={thresholdY}
            y2={thresholdY}
            stroke="var(--wl-watch)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.55}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* ⚠️ `--wl-graph`, not `--wl-live`. This trace used to be drawn in the
            provenance green, and that was two problems in one line. It borrowed
            a token that means "this data is live" to use as a chart colour, so
            the two could never diverge; and it put `#22c55e` directly under a
            depth reading, which is the one colour the never-safe rule keeps out of that
            position — a green line under a number on a flood page reads as
            reassurance about the number whatever the number says.

            `--wl-graph` is on no scale in this app, and like the gauge trace it
            does not vary with the reading, so it cannot encode one. The
            threshold line above stays `--wl-watch`, because that line *is* a
            claim about magnitude — it is FloodNet's flood-event definition, and
            it is the thing the trace is meant to be read against. */}
        {segments.map((pts, i) => (
          <polyline
            key={i}
            points={pts}
            fill="none"
            stroke="var(--wl-graph)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>
          peak <span className="num">{depthText(peak)}</span>
        </span>
        <span>
          dashed line: flood event at{" "}
          <span className="num">{floodEventMm} mm</span>
        </span>
      </figcaption>
    </figure>
  );
}
