import {
  DEPTH_BAND_LABEL,
  DEPTH_BAND_PILL,
  depthBandTitle,
  type DepthBand,
} from "@/lib/depth-band";
import type { Freshness } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * A depth against the two borrowed thresholds. It replaced `SeverityPill`,
 * which carried a camera's ordinal guess about a frame — that layer is
 * deleted, and this is arithmetic over a calibrated millimetre instead.
 *
 * Note what happens when the reading is stale: the pill drops to a neutral
 * outline. The five-alarm problem on a frozen poller is an hour-old reading
 * rendered in a confident colour, which reads as "this block is fine" at
 * exactly the moment nobody can know that. It is not downgraded to a lesser
 * band — it is removed from the scale entirely, because an old reading has no
 * place on a statement about how things are right now.
 *
 * ⚠️ The stale branch and the `none` branch render the same neutral outline,
 * and they differ in their words: `last known` versus `under`. That is
 * deliberate — both mean *this chip is making no claim*, and the page has
 * exactly one way of saying that.
 */
export function DepthBandPill({
  band,
  freshness,
  floodEventMm,
  curbHeightMm,
}: {
  band: DepthBand;
  freshness: Freshness;
  floodEventMm: number;
  curbHeightMm: number;
}) {
  const stale = freshness !== "fresh";

  return (
    <span
      className={cn(
        "rounded-sm px-[7px] py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.08em] uppercase",
        stale
          ? "border border-border bg-transparent text-muted-foreground"
          : DEPTH_BAND_PILL[band],
      )}
      title={
        stale
          ? "last known reading — not a current one"
          : depthBandTitle(band, floodEventMm, curbHeightMm)
      }
    >
      {stale ? "last known" : DEPTH_BAND_LABEL[band]}
    </span>
  );
}
