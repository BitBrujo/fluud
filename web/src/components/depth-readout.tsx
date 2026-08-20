import type { DepthPeak } from "@/lib/api-types";
import { peakLabel, windowLabel } from "@/lib/depth-window";
import { formatDepth } from "@/lib/format";
import type { Freshness } from "@/lib/staleness";
import { cn } from "@/lib/utils";

/**
 * The one big number on a card.
 *
 * TWO RULES, both about not lying with a blank.
 *
 * 1. **Absence of depth is not zero.** A camera with no co-located sensor has
 *    no depth information at all. It renders an em-dash — never a `0`, never
 *    an empty space that reads as calm. 137 of 969 cameras are paired; most of
 *    the map has no ground truth and the UI has to say so.
 *
 * 2. **A stale depth is dimmed and labelled, never blanked.** Removing the
 *    number when the poller stops would read as "nothing to report", which is
 *    the failure this whole treatment exists to prevent. The digits stay; what
 *    changes is the claim being made about them.
 *
 * ## The windowed mode (2026-08-06)
 *
 * Passing `peak` switches this from *the current reading* to *the highest
 * plausible reading over a window* — the reader's choice, made in
 * `depth-window-menu.tsx`. Both rules above survive unchanged and two more
 * arrive with it.
 *
 * 3. ⚠️ **The word `peak` is never dropped.** It is the only thing separating a
 *    historical figure from a current depth, and this number renders at 26px
 *    directly above a control that says `Start Monitor`. `42 mm · last hour`
 *    with no aggregate named reads as a depth that is somehow still true. The
 *    label comes from `peakLabel`, which cannot produce a string without it.
 *
 * 4. ⚠️ **The stale treatment does NOT apply in windowed mode**, and that is a
 *    decision rather than an omission. `last known` means *this is the newest
 *    thing we have and it is old*, which is the frozen-poller rule's claim about a
 *    current reading. A peak is explicitly historical — it says so, and it says
 *    when — so dimming it as though it were a failed poll would be describing
 *    the wrong problem. Invariant 12 is carried on this face by `ReadingAge`
 *    above the depth row, which never leaves it, and by the freshness summary
 *    in the masthead. **This mode does not weaken that; it declines to
 *    duplicate it.**
 */
export function DepthReadout({
  depthMm,
  freshness,
  peak,
}: {
  depthMm: number | null;
  freshness: Freshness;
  /**
   * Present only in windowed mode. `view.peak` is null while loading, on
   * error, or when the window held nothing — `PeakNote` tells those apart.
   */
  peak?: PeakView;
}) {
  if (peak) return <WindowedDepth view={peak} />;

  const depth = formatDepth(depthMm);
  const stale = freshness !== "fresh";

  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          "num text-[26px] leading-none tracking-[-0.02em]",
          stale && "text-muted-foreground",
        )}
      >
        {depth ? depth.value : "—"}
        {depth && (
          <span className="pl-1 text-[11px] tracking-[0.07em] text-muted-foreground uppercase">
            {depth.unit}
          </span>
        )}
      </span>
      {stale && depth && (
        <span className="text-[10px] tracking-[0.07em] text-[var(--wl-stale)] uppercase">
          last known
        </span>
      )}
    </span>
  );
}

/** What the readout needs to draw a window. Assembled by `SelectedDetail`. */
export interface PeakView {
  /** What the reader asked for, before the server clamped it to retention. */
  requestedMinutes: number;
  peak: DepthPeak | null;
  loading: boolean;
  failed: boolean;
}

function WindowedDepth({ view }: { view: PeakView }) {
  const { peak, requestedMinutes } = view;
  // The window the SERVER used, which is what the label must name. Falling back
  // to the request only while there is no answer to name yet.
  const minutes = peak?.minutes ?? requestedMinutes;
  const depth = peak?.peak_mm != null ? formatDepth(peak.peak_mm) : null;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="num text-[26px] leading-none tracking-[-0.02em]">
        {depth ? depth.value : "—"}
        {depth && (
          <span className="pl-1 text-[11px] tracking-[0.07em] text-muted-foreground uppercase">
            {depth.unit}
          </span>
        )}
      </span>
      <span className="text-[10px] tracking-[0.07em] text-muted-foreground uppercase">
        {peakLabel(minutes)}
      </span>
      <PeakNote view={view} />
    </span>
  );
}

/**
 * The sentence under a windowed reading.
 *
 * ⚠️ **Five branches, and the two that both mean "no peak" are the point.** A
 * window with no readings and a window whose every reading was a fault both
 * render an em-dash above this line, and they are entirely different facts:
 * the first says nobody looked, the second says the instrument is broken and
 * reporting constantly. Measured against the live registry, both exist —
 * `closely_muddy_scurvy` sits at 1288 faulted readings and no believable one.
 * Collapsing them would describe a broken rangefinder as an unobserved street.
 */
function PeakNote({ view }: { view: PeakView }) {
  const { peak, loading, failed, requestedMinutes } = view;
  const cls = "text-[10px] leading-tight";

  if (loading) {
    return <span className={cn(cls, "text-muted-foreground")}>reading…</span>;
  }
  if (failed || !peak) {
    // A statement about this request, never about the water — the same refusal
    // `AddressNote` and `station-list.tsx`'s empty states make in words.
    return (
      <span className={cn(cls, "text-[var(--wl-stale)]")}>
        could not read this window. This is not a statement about conditions.
      </span>
    );
  }

  // ⚠️ Named rather than silently answered with a narrower window. A seven-day
  // peak labelled `last year` is the one way this feature can understate a
  // flood, so when the server clamps, the page says so.
  const clamped =
    peak.minutes < requestedMinutes ? (
      <>
        {" "}
        <span className="text-[var(--wl-stale)]">
          {windowLabel(requestedMinutes)} is past what is kept.
        </span>
      </>
    ) : null;

  if (peak.readings === 0 && peak.faulted > 0) {
    return (
      <span className={cn(cls, "text-[var(--wl-stale)]")}>
        {peak.faulted} reading{peak.faulted === 1 ? "" : "s"} in this window,
        every one a sensor fault. No believable depth.{clamped}
      </span>
    );
  }
  if (peak.readings === 0) {
    return (
      <span className={cn(cls, "text-muted-foreground")}>
        nothing recorded in this window. This is not a statement about
        conditions.{clamped}
      </span>
    );
  }

  return (
    <span className={cn(cls, "text-muted-foreground")}>
      from <span className="num">{peak.readings}</span> reading
      {peak.readings === 1 ? "" : "s"}
      {peak.faulted > 0 && (
        <>
          {" "}
          (<span className="num">{peak.faulted}</span> faulted, excluded)
        </>
      )}
      {clamped}
    </span>
  );
}
