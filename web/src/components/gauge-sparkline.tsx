"use client";

import type { GaugeHistoryPoint } from "@/lib/api-types";
import { parseServerTime } from "@/lib/format";
import { type Freshness } from "@/lib/staleness";

const W = 200;
const H = 34;
const PAD = 3;

/**
 * How much larger than the typical gap between points a gap has to be before
 * the line breaks rather than spanning it.
 *
 * The gauges publish on a fixed cadence — ~6 min for CO-OPS, 15 for USGS — so
 * "the poller was down for an hour" is visible as an interval several times the
 * normal one. Joining across it would draw a straight line through a period
 * nobody measured, which on a tide curve is exactly where the interesting part
 * would have been. Same rule the depth sparkline applies to null readings.
 */
const GAP_FACTOR = 4;

/**
 * What colour the trace is drawn in.
 *
 * The ladder is the one `levelColour` uses for the number above it: dead and
 * stale leave the scale entirely rather than dimming (the stale-leaves-the-scale rule applied to
 * gauges — an hour-old "well below flood stage" in confident type reads as
 * reassurance), and a gauge over its own published stage outranks everything
 * under it.
 *
 * ⚠️ **The resting colour is `--wl-graph` magenta**, replacing the neutral
 * `--wl-gauge` slate this drew in before, **on the owner's instruction**. It is
 * safe for the same reason the slate was, and the reason is worth stating
 * exactly, because it is not the obvious one. It is *not* that magenta is
 * quiet. It is that **the colour does not vary with the reading**: a mark whose
 * hue is constant across every level a gauge can report cannot encode a level.
 * Every colour that means something on this page — the amber/orange/red ramp,
 * the clear green, the staleness amber, the provenance violet — is off this
 * scale, and magenta is on no scale in this app at all.
 *
 * So the trace carries the *shape* of the water and never its magnitude. The
 * magnitude stays with the number, the dashed threshold line and the printed
 * endpoints, none of which took a colour here.
 *
 * ⚠️ **Do not extend it to the map's diamonds.** A coloured marker on a flood
 * map reads as a reading on a ramp whatever the panel beside it means by it, so
 * the map's rule stays stricter and its diamonds stay neutral slate. The link
 * between a card and its diamond is *selection* — `--wl-select` on both — not
 * hue.
 */
function seriesColour(freshness: Freshness, above: boolean): string {
  if (freshness === "dead") return "var(--wl-dead)";
  if (freshness === "stale") return "var(--wl-stale)";
  if (above) return "var(--wl-warning)";
  return "var(--wl-graph)";
}

/**
 * One gauge's recent level, on the front of its card.
 *
 * ## ⚠️ This autoscales, and `depth-sparkline.tsx` refuses to. Both are right.
 *
 * A depth is measured from the road surface, so it has a true zero and a fixed
 * floor is what stops 2mm of puddle from filling the box. **A gauge level has
 * no true zero.** It is feet above a datum — MLLW for the Battery, a local
 * benchmark for each USGS site — and those numbers are chosen for surveying
 * convenience, not because the water is interesting there. Anchoring this at
 * zero would render a six-foot tidal swing as a flat line near the top of the
 * box and tell a reader nothing at all.
 *
 * So it scales to its own data, and it pays for that with the endpoints printed
 * underneath. **That caption is not decoration; it is the compensating control
 * for the missing floor.** Without it the shape implies a magnitude it does not
 * have, and a creek moving four hundredths of a foot draws the same dramatic
 * curve as the harbor moving three feet. If you restyle this, the numbers
 * survive.
 *
 * ## The flood stage is drawn only when it is in range
 *
 * A Battery threshold of 6.90 ft against a window that spans 1.42–4.46 would
 * flatten the trace into the bottom eighth of the box in order to include a
 * line the water is nowhere near. The card front already says *how far below*
 * in words, which is the magnitude; this draws the *shape*. When the level
 * genuinely approaches its threshold the line falls inside the window and
 * appears, which is when it is worth the vertical space.
 *
 * ## And it is never compared to the card beside it
 *
 * Own range, own endpoints, own threshold, own colour rule. Nothing here reads
 * another gauge — see `models.GaugeHistoryResponse`.
 */
export function GaugeSparkline({
  points,
  network,
  minorFloodFt,
  freshness,
  above,
}: {
  points: GaugeHistoryPoint[];
  network: string;
  minorFloodFt: number | null;
  freshness: Freshness;
  above: boolean;
}) {
  const read = points
    .map((p) => ({ t: parseServerTime(p.t)?.getTime(), ft: p.level_ft }))
    .filter((p): p is { t: number; ft: number } => p.t !== undefined);

  // One point is not a trend, and a lone dot in an empty box invites reading a
  // slope that isn't there. Same refusal as the depth sparkline.
  if (read.length < 2) return null;

  const t0 = read[0].t;
  const t1 = read[read.length - 1].t;
  const span = t1 - t0 || 1;

  const levels = read.map((p) => p.ft);
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  // A gauge that has not moved all window is a real answer — a flat trace down
  // the middle, not a divide-by-zero. Creeks do this on a dry day.
  const range = hi - lo;

  const xOf = (t: number) => ((t - t0) / span) * W;
  const yOf = (ft: number) =>
    range === 0
      ? H / 2
      : H - PAD - ((ft - lo) / range) * (H - PAD * 2);

  // The typical gap, from the data rather than from the network's documented
  // cadence — the two disagree whenever the poller misses a beat, and this
  // question is about what was actually recorded.
  const gaps: number[] = [];
  for (let i = 1; i < read.length; i++) gaps.push(read[i].t - read[i - 1].t);
  const typical = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 1;

  const segments: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < read.length; i++) {
    if (i > 0 && read[i].t - read[i - 1].t > typical * GAP_FACTOR) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    }
    current.push(`${xOf(read[i].t).toFixed(1)},${yOf(read[i].ft).toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(" "));
  if (segments.length === 0) return null;

  // Same ladder as the level above it: stale and dead leave the scale entirely
  // rather than dimming, and over-threshold outranks everything below it.
  //
  // ⚠️ The resting colour is `--wl-graph` magenta, which replaced the neutral
  // `--wl-gauge` slate this drew in before. It is safe for the reason the slate
  // was: it does not vary with the reading, so it cannot be a severity. What it
  // is not is *neutral* — so if this ever needs to go back, the argument to
  // check is whether a coloured line reads as a claim about the water rather
  // than as a line. It does not today, because every colour on the ramp is
  // amber/orange/red/green and magenta is on no scale in this app at all. The
  // full accounting is at `seriesColour` in `harbor-baseline.tsx`.
  const stroke = seriesColour(freshness, above);

  const thresholdY = minorFloodFt !== null ? yOf(minorFloodFt) : null;
  const thresholdInRange =
    thresholdY !== null &&
    minorFloodFt !== null &&
    minorFloodFt >= lo &&
    minorFloodFt <= hi;

  const unit = network === "noaa" ? "ft MLLW" : "ft";
  const hours = Math.max(1, Math.round(span / 3_600_000));

  return (
    /*
     * Fills whatever height it is given, with a floor.
     *
     * `FlipCard` sizes a card to the taller of its two faces, and the datum
     * back is taller than the reading front — so without this the front carried
     * a band of dead space between the threshold line and the age. The trace is
     * the right thing to spend that space on: `preserveAspectRatio="none"`
     * means the y-axis simply stretches, and the endpoints under it are printed
     * either way, so a taller box exaggerates nothing.
     */
    <figure className="m-0 flex h-full min-h-[34px] flex-col">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block min-h-[34px] w-full flex-1"
        role="img"
        aria-label={`Recent level, ${lo.toFixed(2)} to ${hi.toFixed(
          2,
        )} ${unit} over about ${hours} hour${hours === 1 ? "" : "s"}`}
      >
        {thresholdInRange && (
          <line
            x1={0}
            x2={W}
            y1={thresholdY}
            y2={thresholdY}
            stroke="var(--wl-warning)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {segments.map((pts, i) => (
          <polyline
            key={i}
            points={pts}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* The endpoints. See the header — this is what makes an autoscaled trace
          honest, so it goes wherever the drawing goes. */}
      <figcaption className="mt-0.5 flex justify-between gap-2 text-[9px] text-muted-foreground">
        <span className="num">
          {lo.toFixed(2)}–{hi.toFixed(2)} {unit}
        </span>
        <span className="num">{hours}h</span>
      </figcaption>
    </figure>
  );
}
