"use client";

import { useEffect, useMemo, useState } from "react";

import { AddressLookup } from "@/components/address-lookup";
import { RequireSession } from "@/components/auth/require-session";
import { Chip } from "@/components/list-controls";
import { CityMap } from "@/components/city-map";
import { HarborBaseline } from "@/components/harbor-baseline";
import { WatchPanel } from "@/components/watch-panel";
import { SelectedDetail } from "@/components/selected-detail";
import { MessageStrip } from "@/components/message-strip";
import { RailTabs, type RailTab } from "@/components/rail-tabs";
import { SiteHeader } from "@/components/site-header";
import { SprayDefs } from "@/components/spray";
import { StationList } from "@/components/station-list";
import type { CameraStatus } from "@/lib/api-types";
import { useSession } from "@/lib/auth-client";
import { DEFAULT_CAMERA_FILTER } from "@/lib/camera-filter";
import { useCameraRegistry } from "@/lib/hooks/use-camera-registry";
import { useDepthPeaks } from "@/lib/hooks/use-depth-peaks";
import { useHealth } from "@/lib/hooks/use-health";
import { useSensors } from "@/lib/hooks/use-sensors";
import { useStatus } from "@/lib/hooks/use-status";
import { useNow } from "@/lib/hooks/use-now";
import { buildMessages } from "@/lib/messages";
import { cn } from "@/lib/utils";
import {
  applyQuery,
  DEFAULT_QUERY,
  LIST_PAGE_SIZE,
  queryIsActive,
  type InstrumentQuery,
} from "@/lib/instrument-query";

/**
 * Both borrowed thresholds, until `/api/status` says otherwise.
 *
 * ⚠️ **Fallbacks for the first paint, never the authority.** The server owns
 * these numbers (`waterline/config.py`), the payload carries them, and every
 * surface interpolates the payload's value — so a threshold change reaches the
 * page without a rebuild. These two exist only so the depth band has something
 * to compare against before the first fetch settles.
 */
const FALLBACK_FLOOD_EVENT_MM = 10;
const FALLBACK_CURB_HEIGHT_MM = 150;

/**
 * What the reader has selected.
 *
 * ⚠️ **A tagged union rather than a bare id**, because there are now two
 * instrument classes and their ids come from different namespaces — a DOT
 * camera UUID and a FloodNet `deployment_id`. A single `string` would work
 * right up until the day the two collide, and would meanwhile force every
 * consumer to guess which list to search. The tag makes "which kind of thing is
 * this" a fact rather than an inference.
 *
 * The gauges keep their own separate `selectedGaugeId` and are deliberately not
 * folded in here: they have no auto-select fallback and cannot be ranked, so
 * they do not belong in the same state as the things the pager walks.
 */
type Pick = { kind: "camera" | "sensor"; id: string };

/**
 * The camera to open on: whichever is currently deepest.
 *
 * ⚠️ **An open alert used to outrank everything here and there are no alerts
 * any more**, so this is the depth tiering `compareCameras` uses, over the
 * paired FloodNet sensor's reading: a plausible depth first and deeper first
 * within that, a faulted rangefinder after every real reading regardless of
 * how loud its number is, and no reading at all last.
 *
 * ⚠️ **`observed_at` alone would be VACUOUS.** `poll.tick` stamps every camera
 * in a tick with one `now`, so every row carries the same timestamp and an
 * age-only sort would rank nothing while still appearing to work — the page
 * would open on an arbitrary camera. The depth tier is what makes this mean
 * something.
 */
function worstCamera(cameras: CameraStatus[]): string | null {
  if (cameras.length === 0) return null;
  const rank = (c: CameraStatus): number => {
    if (c.depth_mm == null) return 2;
    if (c.depth_plausible === false) return 1;
    return 0;
  };
  const ranked = [...cameras].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (a.depth_mm != null && b.depth_mm != null && a.depth_mm !== b.depth_mm) {
      return b.depth_mm - a.depth_mm;
    }
    return b.observed_at.localeCompare(a.observed_at);
  });
  return ranked[0].camera_id;
}

/**
 * The instrument. Client-side by construction: this is a static export served
 * by FastAPI, so there is no server to render on and every number on screen
 * arrives over the same origin at runtime.
 *
 * ⚠️ **This moved from `/` to `/map` on 2026-08-05** when the landing page
 * took the root. Nothing inside it changed in that move — same components,
 * same selection model, same measured column split. Two things about the move
 * are worth knowing:
 *
 * - **`trailingSlash: true` in `next.config.ts` is what makes this reachable
 *   in production.** Without it the export is `out/map.html` and FastAPI's
 *   `StaticFiles` mount answers `/map` with the 404 page — while `next dev`
 *   serves it perfectly. See the comment on that flag.
 * - **The masthead wordmark is now a link back to `/`.** It is the only way
 *   out of this page, and `site-header.tsx` says why it is not a nav bar.
 */
/**
 * The per-address cap, mirroring `settings.watch_max_sensors`.
 *
 * ⚠️ **Deliberately not on the wire, and this is the honest version of that
 * trade.** `/api/status` exists to carry readings, and a config knob in it
 * would be a field every open tab fetches every 15 seconds to render one
 * counter. The cost is a number living in two places — so the panel's copy is
 * worded as a courtesy, the server refuses an over-long list with a 400 that
 * names the real limit, and `WatchSubscriptionResponse.max_sensors` carries
 * the authoritative figure on the one surface where being wrong would matter.
 */
const WATCH_MAX_SENSORS = 10;


/**
 * The instrument, behind the session gate.
 *
 * ⚠️ **`RequireSession` WRAPS this rather than being called inside
 * `MapWorkspace`, and that is not a style choice.** `MapWorkspace` starts four
 * polling hooks on its first line. A hook runs on mount, so a check inside the
 * body would still have fired every one of them for a signed-out reader —
 * four endpoints answering 401 on 15-, 30- and 60-second intervals, surfacing
 * through `lib/messages.ts` as *cannot reach the service*. Not being signed in
 * would render as the instrument being broken. Wrapped, the workspace never
 * mounts and no request is made.
 *
 * ## ⚠️ The redirect above the gate, and why it cannot be anywhere else
 *
 * Every Fluud email pointed here — `/map/?confirm=…` and `/map/?watch=…` — until
 * 2026-08-16, and **every one of those links was unreachable in production.**
 * The component that read the token lived inside `MapWorkspace`, so for a
 * signed-out reader `RequireSession` redirected to sign-in before it ever
 * mounted. The links point at `/watch/` now, which has no gate.
 *
 * ⚠️ **Manage tokens do not expire and sit in every message ever delivered**,
 * including the `List-Unsubscribe` header of archived mail, so the old shape
 * has to keep working. This forwards it.
 *
 * Three rules, all of them already written down elsewhere in this repo:
 *
 * - ⚠️ **It must sit ABOVE `RequireSession`.** Below it, a signed-out reader is
 *   redirected to sign-in before this runs, which is the entire defect.
 * - ⚠️ **`replace`, never `push`.** With `push`, Back returns to
 *   `/map/?watch=…` and this redirects forward again — `SessionMenu`'s rule in
 *   `site-header.tsx`.
 * - ⚠️ **Paint a line rather than nothing.** A blank frame during navigation is
 *   indistinguishable from a dead auth service, which is `AuthLoading`'s whole
 *   argument one component over.
 *
 * The token's exposure is unchanged: `/watch/` strips it with `replaceState` on
 * the same tick it reads it.
 */
export default function MapRoute() {
  const [forwarding, setForwarding] = useState(false);

  /* `useLayoutEffect` would be no earlier — this is a static export, so the
     first paint is the shell either way. What matters is that it runs before
     any decision the reader can act on, and that `RequireSession` is not
     rendered while it does. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("confirm") && !params.has("watch")) return;
    setForwarding(true);
    window.location.replace(`/watch/?${params.toString()}`);
  }, []);

  if (forwarding) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <p className="max-w-[420px] text-center font-mono text-[12px] tracking-[0.06em] text-muted-foreground uppercase">
          Opening your watch settings…
        </p>
      </main>
    );
  }

  return (
    <RequireSession>
      <MapWorkspace />
    </RequireSession>
  );
}

function MapWorkspace() {
  const status = useStatus();
  const health = useHealth();
  /*
   * ⚠️ **`useSession` from `lib/auth-client.ts`, never off `authClient`.** The
   * SDK types its adapter as a union over every shape it ships, so
   * `authClient.useSession` is a nanostore `Atom` to the compiler and not
   * callable — this shipped wrong once and `next build` caught it, which
   * `./scripts/check` cannot.
   *
   * Read here and passed down as a plain string, so `watch-panel.tsx` keeps the
   * auth SDK out of its import graph. `SessionState` carries `email` and
   * nothing else; the panel needs nothing else.
   */
  const session = useSession();

  /*
   * ⚠️ **Selection is now a KIND and an id**, because there are two classes of
   * instrument to select from and their ids come from different namespaces.
   *
   * Null means "nothing chosen yet", and it resolves to the worst camera below.
   * It is deliberately NOT recomputed on every poll — see `selectedId`.
   */
  const [picked, setPicked] = useState<Pick | null>(null);

  /*
   * The list query — mode, search, sort and filters — lifted out of
   * `StationList` because three surfaces read the order it produces: the list
   * draws it, the pager steps through it, and the map de-emphasises what is not
   * in it. See `lib/instrument-query.ts`.
   */
  const [query, setQuery] = useState<InstrumentQuery>(DEFAULT_QUERY);

  /*
   * ⚠️ **The controls strip's open state lives here as of 2026-08-06**, lifted
   * out of `StationList` because two controls now open it: the filter glyph in
   * the list's chrome bar, and the mobile search bar's filters button below
   * `md`. The watch sheet's open state is its sibling — below `md` the watch
   * panel presents as a fixed bottom sheet opened from the same bar, and above
   * `md` the flag is simply ignored (the panel is always in the rail).
   */
  const [controlsOpen, setControlsOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);

  /*
   * ⚠️ **THREE booleans gate a six-figure payload**, and that is the whole
   * reason they are lifted here rather than owned by the components that use
   * them. `/api/sensors` is ~150KB uncompressed and most readers never open any
   * of the three surfaces, so `useSensors` fetches only while one is on — see
   * the docblock in `use-sensors.ts`. The query's own `mode` carries the first,
   * so the list's tab and the map's switch are one condition between them.
   *
   * ⚠️ **The PAIR layer is the third and its reason is not obvious.**
   * `CameraStatus.sensor_id` is an **id, not a coordinate** — the paired
   * sensor's lat/lon is only on this payload — so a link line cannot be drawn
   * without it. That is why this boolean sits beside the sensor layer's rather
   * than inside the map with `showCso`, `showCameras` and `showGauges`: it is
   * the fetch gate that decides where a layer's state lives, and cameras and
   * gauges ride on `/api/status`, which the page already polls.
   *
   * ⚠️ **Neither is persisted, and persisting either would be a POLICY change.**
   * `/terms` §05 promises no cookies, no local storage and no session storage.
   * A reload resets both, on `dismissed`'s terms.
   */
  const [showSensorLayer, setShowSensorLayer] = useState(false);
  const [showPairLayer, setShowPairLayer] = useState(false);
  const sensorsWanted =
    query.mode === "sensors" || showSensorLayer || showPairLayer;
  const sensorFeed = useSensors(sensorsWanted);

  /*
   * ⚠️ **The camera layer's two facets, and the second boolean is a FETCH GATE**
   * — this block's own rule for what gets lifted out of `CityMap`. The filter
   * itself is lifted for the same reason `showSensorLayer` is: it decides
   * whether `/api/cameras` is requested at all.
   *
   * ⚠️ **`registryWanted` is STICKY, and that is the owner's call.** The
   * registry is not requested on load: at rest the filter is the default and
   * the 27 cameras already on `/api/status` are exactly what `paired` selects
   * against today's pairing table. The first change to the filter opens the
   * fetch and it **stays open for the session** — flipping the camera layer's
   * source between 27 rows and 968 on every chip press would re-render the
   * whole marker layer each time.
   *
   * ⚠️ **The honest cost of that, written down rather than discovered:** at rest
   * the `paired` chip describes `WATCH_CAMERAS` and not the `pairs` table. Those
   * two sets are byte-identical today — verified as set equality, 27 ids — but
   * that is a coincidence of the current data and not a property. **If they ever
   * diverge, the resting map draws one set under the other's label** until the
   * reader touches a chip. The bootstrap-time check in the plan is what catches
   * the divergence; nothing in `./scripts/check` can.
   *
   * ⚠️ **Not persisted**, on `showSensorLayer`'s terms: `/terms` §05 promises no
   * cookies, no local storage and no session storage, so a reload puts every
   * reader back on the default.
   */
  const [cameraFilter, setCameraFilter] = useState(DEFAULT_CAMERA_FILTER);
  const [registryWanted, setRegistryWanted] = useState(false);
  const registryFeed = useCameraRegistry(registryWanted);

  /*
   * The gauge selection, shared by the map's diamonds and the harbor baseline's
   * cards. One piece of state, two surfaces, and it means both "which marker is
   * lit" and "which card is showing its datum" — pressing either answers both
   * questions at once, which is what integrating the panel with the map amounts
   * to in practice.
   *
   * Unlike `picked` there is **no auto-select fallback**, and that is the
   * point: nothing here is "worst". Five gauges on five datums cannot be
   * ranked, so opening the page on one of them would be the page quietly
   * asserting a comparison every card back explicitly refuses. Null until a
   * reader asks.
   */
  const [selectedGaugeId, setSelectedGaugeId] = useState<string | null>(null);

  /*
   * The instruments the reader has picked to be emailed about.
   *
   * ⚠️ **Held here rather than inside `WatchPanel`, for `ordered`'s reason**:
   * two surfaces need the same array. The panel renders it as removable chips
   * and the selected-instrument face renders one of them as a pressed toggle,
   * and a set that lived in the panel would leave that toggle guessing.
   *
   * Not persisted. It is a draft until an address is submitted and confirmed;
   * anything stored before that would be this page keeping a record of what
   * somebody is interested in without them having asked for one. After
   * confirmation the set lives on the server, reachable by the manage link.
   */
  const [watching, setWatching] = useState<string[]>([]);
  /*
   * ⚠️ **A second `watchingCams` array sat here and is gone with the camera
   * watch.** The cap was COMBINED across two id namespaces; there is one list
   * now and the server counts it against `watch_max_sensors` alone.
   */
  const toggleWatching = (sensorId: string) =>
    setWatching((w) =>
      w.includes(sensorId)
        ? w.filter((x) => x !== sensorId)
        : w.length >= WATCH_MAX_SENSORS
          ? w
          : [...w, sensorId],
    );

  /*
   * ⚠️ **The same set, as a `Set`, for the LIST.** Every sensor row grew a
   * monitor ring on 2026-08-15, and there are 425 of them re-rendering on a 15s
   * tick — `watching.includes(id)` per row is O(n·m) recomputed four times a
   * minute for a list that changes when somebody presses a ring.
   *
   * ⚠️ **The array stays the source.** `WatchPanel` submits it in order and
   * `SelectedDetail` reads one membership; neither wants a set. This is a
   * derived view for one consumer, memoised on the array's identity.
   */
  const watchingSet = useMemo(() => new Set(watching), [watching]);

  const data = status.data;
  const cameras = data?.cameras ?? [];

  /*
   * The NOTICES strip.
   *
   * ⚠️ **`dismissed` is React state and nothing else.** `/terms` §05 promises
   * *no cookies, no local storage, no session storage*, and there is a standing
   * measured check that all three are empty before and after a session. A
   * reload therefore restores every dismissed notice, exactly as it clears the
   * typed origin — same rule, same reason.
   *
   * ⚠️ **It is keyed on `Message.id`, not on `slot`.** Ids change when the
   * claim changes, so dismissing *"the poll loop is not ticking"* does not also
   * dismiss *"the poll loop has stopped"* — they are two different things to be
   * told. `slot` is the React key and is deliberately stable across that
   * change; see `lib/messages.ts`.
   *
   * The 5s tick matches what `ServiceBanners` used before this: the ages in a
   * fault body and the `HISTORY_MAX_AGE_S` bound on the log both move slowly,
   * and nothing here needs a per-second clock.
   */
  /*
   * ⚠️ **`alertsCollapsed` was here and is gone with `AlertList`.** The band
   * held one block per open `alerts` row — measured at 25 open on 2026-08-07,
   * which was 2258px above the workspace, hence the collapse. There are no
   * alerts to collapse: the on-page alert system was unwired.
   */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const noticesNow = useNow(5000);
  const messages = buildMessages({
    health,
    status,
    history: [],
    openAlerts: 0,
    now: noticesNow,
  });
  /* What `MessageStrip` would draw, computed here because the rail's tab needs
     the same number and the two must not disagree. The strip filters this
     itself and returns null at zero — see `message-strip.tsx`. */
  const visibleNotices = messages.filter((m) => !dismissed.has(m.id));
  /* ⚠️ **`noticesVisible` was here and is deleted with `--wl-notices`.** It
     mirrored `MessageStrip`'s own `return null` so the workspace did not lose
     height to a panel that was not rendering. In the rail the strip is a
     `shrink-0` sibling in a scrolling column, so it costs nothing when absent
     and there is no second predicate to keep in step. */

  /*
   * Auto-select is a *fallback*, not a subscription.
   *
   * Deriving this during render rather than syncing it in an effect is what
   * makes the rule hold: an explicit pick wins as long as that camera is still
   * in the payload, and the auto-pick is only consulted when it isn't. So the
   * page opens on the worst camera, and then stays where the reader put it —
   * a selection that jumped to a new "worst" every 15 seconds would move the
   * page out from under someone mid-sentence, which is the opposite of useful
   * during the event this tool exists for.
   *
   * It also handles a selected camera vanishing from `/api/status` (dropped
   * from WATCH_CAMERAS, say) without an effect and without a blank panel.
   */
  const sensors = sensorFeed.data?.sensors ?? [];
  const floodEventMm = data?.thresholds.flood_event_mm ?? FALLBACK_FLOOD_EVENT_MM;
  const curbHeightMm = data?.thresholds.curb_height_mm ?? FALLBACK_CURB_HEIGHT_MM;

  /*
   * The poller's own bounds, or null until `/api/status` settles.
   *
   * ⚠️ **Deliberately NOT given fallbacks like the two above, and the
   * difference is the rule rather than an oversight.** Those two exist because
   * `depthBand` has to return a band on the first paint and a wrong band for
   * one frame is better than a crash. These drive *sentences*, and a sentence
   * has a third option the band does not have: it can simply not be there yet.
   *
   * Writing `?? 600` here would put a safety bound in the bundle — a number
   * duplicated across the two languages, silently authoritative whenever the
   * fetch is slow, and held by nothing in `tests/parity.test.ts`. See
   * `IngestBounds` in `api-types.ts`, which says the same thing at the type.
   */
  const ingest = data?.ingest ?? null;

  /*
   * The one ordered array, derived during render — never synced in an effect
   * and never passed back up out of the list. `applyQuery` is pure; memoising
   * it keeps a 425-row filter+sort off every unrelated re-render (the 15s tick,
   * an SSE warning, a flip), which matters because the map's marker layer
   * re-renders with it.
   */
  const ordered = useMemo(
    () => applyQuery(query, cameras, sensors, floodEventMm),
    [query, cameras, sensors, floodEventMm],
  );

  /*
   * Which page of the list is showing. Zero-based.
   *
   * ⚠️ **Every path that changes the selection also reveals its page, in the
   * SAME event** — see `reveal` below. That is deliberately not an effect and
   * not a derived override: the reader can page freely without the selection
   * dragging them back, and a selection made anywhere (a map marker, the
   * detail pager, a `WatchPanel` chip) still lands on a row they can see.
   */
  const [listPage, setListPage] = useState(0);

  /*
   * Put the row for `id` on screen.
   *
   * Selection and paging are two different things and only one of them is
   * allowed to move the other. A selected row the list is not showing reads as
   * the list ignoring the click; a page that snapped back every time the poll
   * re-ordered `ordered` would fight the reader. So the page moves **on the
   * selection event** and never afterwards.
   *
   * ⚠️ It searches `ordered` rather than the current page, because the whole
   * point is that the target is usually somewhere else. `-1` (filtered out)
   * leaves the page alone — there is no row to reveal, and the pager already
   * says `not in filter`.
   */
  const reveal = (kind: "camera" | "sensor", id: string) => {
    const at = ordered.findIndex((i) => i.kind === kind && i.id === id);
    if (at >= 0) setListPage(Math.floor(at / LIST_PAGE_SIZE));
  };

  /*
   * ⚠️ **Which rail panel is showing, at `xl` and up only.** The rail held four
   * stacked panels in a scrolling column; it still does below `xl`, and above it
   * one of them fills the track. See `rail-tabs.tsx` for why — the short version
   * is that NOTICES went below the fold on 2026-08-14 and a tab is not below
   * the fold.
   *
   * ⚠️ **Every selection forces this back to `instrument`, and that is the rule
   * the feature stands or falls on.** Pressing a row, a marker or the pager has
   * to visibly do something *from where it was pressed*. A reader sitting on the
   * gauges tab who clicks a map marker and sees nothing move has been told the
   * map is broken. Same reason `reveal` exists for the list's paging: selection
   * and presentation are two things, and the selection event is allowed to move
   * the presentation exactly once.
   */
  const [railTab, setRailTab] = useState<RailTab>("instrument");

  /*
   * The sizing for one rail slot, at `xl` and up only.
   *
   * ⚠️ **Every class here is `xl:`-prefixed and that is the whole trick.**
   * Below the breakpoint this function contributes nothing, so the stacked rail
   * — including the sheet behaviour below `md` — is byte-for-byte the layout it
   * was before the tabs landed.
   *
   * ⚠️ **`xl:h-auto` is load-bearing on the active slot.** Two of these panels
   * carry `h-full` on their own roots, which resolves against the whole column
   * and would run them straight through the tab bar above. Neutralising it is
   * what lets `xl:flex-1` mean *the space that is left*.
   *
   * The active slot also gives up its top corners and its top border, so the
   * bar and the panel read as one framed object with a chrome bar rather than
   * as a strip sitting on top of a card. Same idiom as `PanelHeader`.
   */
  const pane = (tab: RailTab) =>
    railTab === tab
      ? "xl:h-auto xl:min-h-0 xl:flex-1 xl:shrink xl:rounded-t-none xl:border-t-0"
      : "xl:hidden";

  const pickCamera = (id: string) => {
    setPicked({ kind: "camera", id });
    reveal("camera", id);
    setRailTab("instrument");
  };
  const pickSensor = (id: string) => {
    setPicked({ kind: "sensor", id });
    reveal("sensor", id);
    setRailTab("instrument");
  };

  /* A gauge diamond answers on the gauges panel, so pressing one has to open
     it — the same rule as `pickCamera` above, one panel over. Passing `null`
     (a deselect) leaves the tab alone: nothing new is being shown. */
  const pickGauge = (id: string | null) => {
    setSelectedGaugeId(id);
    if (id !== null) setRailTab("gauges");
  };


  /*
   * Auto-select's fallback rule, extended to a second kind rather than
   * replaced. A pick survives as long as its instrument is still in ITS OWN
   * payload; otherwise the page falls back to the worst camera, exactly as it
   * always has. Still derived, still no effect, still no blank frame.
   *
   * ⚠️ A sensor pick falls back to a *camera*, and that is deliberate: the
   * cameras are what this page watches, so the resting state of the page is a
   * camera even when the reader arrived via the sensor list. There is no
   * "worst sensor" fallback for the same reason there is none for gauges —
   * opening on one would assert a ranking nobody asked for.
   */
  /*
   * ⚠️ **A camera pick is alive if EITHER payload holds it**, since the camera
   * layer gained a second source. Without the second term, pressing any of the
   * 941 cameras the poller does not watch would fall through to the
   * worst-camera fallback — a press that visibly selects something else, which
   * reads as the map being broken.
   */
  const registryCameras = registryFeed.data?.cameras ?? [];
  const pickAlive =
    picked !== null &&
    (picked.kind === "camera"
      ? cameras.some((c) => c.camera_id === picked.id) ||
        registryCameras.some((c) => c.camera_id === picked.id)
      : sensors.some((s) => s.sensor_id === picked.id));

  const selection: Pick | null = pickAlive
    ? picked
    : (() => {
        const worst = worstCamera(cameras);
        return worst ? { kind: "camera" as const, id: worst } : null;
      })();

  const selectedKind = selection?.kind ?? "camera";
  const selectedId = selection?.id ?? null;

  const selectedCamera =
    selection?.kind === "camera"
      ? (cameras.find((c) => c.camera_id === selection.id) ?? null)
      : null;
  /*
   * ⚠️ **The registry row for a camera this poller does NOT watch**, and it is
   * deliberately only reached when `selectedCamera` is null. A watched camera is
   * in both payloads and the full face is strictly better: it has our poller's
   * clock, a live still keyed on the reading, the depth, the NTA and the NWS
   * clause, none of which `/api/cameras` carries.
   *
   * ⚠️ **They are NOT interchangeable and this must not become a `??` merge.**
   * The two rows carry different clocks — see `DrawnCamera` in `city-map.tsx` —
   * and a face built from whichever field happened to be present would age a
   * FloodNet timestamp on our poller's thresholds.
   */
  const selectedRegistryCamera =
    selection?.kind === "camera" && selectedCamera === null
      ? (registryCameras.find((c) => c.camera_id === selection.id) ?? null)
      : null;
  const selectedSensor =
    selection?.kind === "sensor"
      ? (sensors.find((s) => s.sensor_id === selection.id) ?? null)
      : null;

  /* The watched camera a selected sensor drives, for the still on its face.
     Null for the ~404 sensors with no watched camera — a permanent property of
     the deployment, not a failure to load. */
  const cameraForSensor = selectedSensor?.watched_camera_id
    ? (cameras.find((c) => c.camera_id === selectedSensor.watched_camera_id) ??
      null)
    : null;

  /*
   * The pager's position, **derived every render rather than stored** — a
   * stored index into a live array points past the end the moment a poll
   * changes the payload. `-1` means the current pick has been filtered out of
   * the list, which the pager says out loud rather than lying about.
   */
  const orderedIndex = ordered.findIndex(
    (i) => i.kind === selectedKind && i.id === selectedId,
  );

  const stepSelection = (delta: -1 | 1) => {
    if (ordered.length === 0) return;
    // Filtered out: `‹` takes the last and `›` the first, which is honest and
    // gets the reader back into the set in one press.
    const next =
      orderedIndex < 0
        ? delta === 1
          ? ordered[0]
          : ordered[ordered.length - 1]
        : ordered[orderedIndex + delta];
    if (!next) return; // No wrapping. The buttons are disabled at both ends.
    setPicked({ kind: next.kind, id: next.id });
    // The pager walks all of `ordered`, so stepping across a page boundary
    // would otherwise change the panel while the list sat still.
    reveal(next.kind, next.id);
  };

  /*
   * The depth timeframe, `null` for the current reading.
   *
   * ⚠️ **It lives here rather than inside `SelectedDetail`, for `ordered`'s
   * reason: two surfaces need the same value.** The detail panel renders one
   * instrument's peak and the list renders every row's, and they are the same
   * question asked at two scales. Two independent states would let the list say
   * `last day` while the panel beside it said `current`, over two numbers about
   * the same instrument.
   *
   * ⚠️ It **survives a selection change** and is **not persisted** across a
   * reload — both rules are unchanged by the move and both are argued at the
   * `windowMin` prop in `selected-detail.tsx`.
   */
  const [windowMin, setWindowMin] = useState<number | null>(null);

  /*
   * Every row's peak over that window, in ONE request.
   *
   * ⚠️ **Keyed on the list's own tab.** The two kinds read two different tables
   * and a camera id is not a sensor id, so asking for the wrong kind returns a
   * map that misses every row rather than a wrong one — which would render as
   * 425 em-dashes and look like an outage.
   *
   * It fires nothing at all while `windowMin` is null, which is the resting
   * state: the current reading is already on `/api/status` and `/api/sensors`.
   */
  const peaks = useDepthPeaks(
    query.mode === "cameras" ? "camera" : "sensor",
    windowMin,
  );

  /*
   * The list pages at `LIST_PAGE_SIZE` rather than scrolling the whole set.
   *
   * ⚠️ **The page is CLAMPED during render rather than reset in an effect**, on
   * the rule every derived value on this page follows. `ordered` shrinks
   * whenever the reader types, and a stored index into a shrunken array renders
   * an empty list under a pager reading `page 8 of 2`. An effect-based reset
   * shows exactly that frame and then corrects it.
   */
  const pageCount = Math.max(1, Math.ceil(ordered.length / LIST_PAGE_SIZE));
  const shownPage = Math.min(listPage, pageCount - 1);

  const pageItems = useMemo(
    () =>
      ordered.slice(
        shownPage * LIST_PAGE_SIZE,
        (shownPage + 1) * LIST_PAGE_SIZE,
      ),
    [ordered, shownPage],
  );

  /* Non-matching markers de-emphasise; nothing is ever removed. Null when no
     filter is on, so an untouched query leaves the drawing exactly as it was. */
  const matchingSensorIds = queryIsActive(query)
    ? new Set(
        applyQuery({ ...query, mode: "sensors" }, cameras, sensors, floodEventMm)
          .map((i) => i.id),
      )
    : null;

  /* For the mobile bar's filters button — how many controls are narrowing the
     list. The same components `queryIsActive` reads, counted rather than
     collapsed to a boolean, because a badge saying "3" tells the reader how
     much undoing the sheet holds. The origin is deliberately not in it — it
     orders, it filters nothing, and it has its own chip in the bar. */
  const activeFilterCount =
    (query.search.trim() !== "" ? 1 : 0) +
    Number(query.watchedOnly) +
    Number(query.reportingOnly) +
    Number(query.overThresholdOnly) +
    Number(query.faultsOnly) +
    query.boroughs.length;

  return (
    <>
      {/* The spray filter every graffiti face and every title references,
          defined once for the document. An SVG filter id is document-scoped,
          so a copy per card would be 27 copies and 26 dead nodes — and it
          lives here rather than in the grid because the selected-instrument
          panel turns over too, and that panel renders even when the grid has
          nothing in it. */}
      <SprayDefs />

      {/* ⚠️ **One line now, and it no longer carries the warning.** `mode` is
          null until /api/status answers and the badge renders UNKNOWN for
          null, so there is no path that produces a LIVE badge without a live
          answer. The templated warning text — verbatim, with its provenance
          chips, its place, its clock and the rat that is the drill trigger —
          moved to `WarningBlock` at the foot of the right-hand rail below.
          It is rendered exactly once, there. */}
      <SiteHeader
        mode={data?.mode ?? null}
        cameras={cameras}
        messages={messages}
        dismissed={dismissed}
        onShowAll={() => setDismissed(new Set())}
      />

      {/*
       * ⚠️ **The NOTICES strip was the first child here and is now at the FOOT
       * of the right-hand rail, under `watch by email`** — moved 2026-08-14 on
       * the owner's instruction. Two things went with it:
       *
       * - **`--wl-notices` is deleted.** It existed only because a strip above
       *   the workspace pushed it down, so both the desktop grid and the mobile
       *   map subtracted the strip's height back out. In the rail there is
       *   nothing to subtract from, and both `calc()`s below are one term
       *   shorter as a result.
       * - ⚠️ **The reading order this comment used to describe is gone with
       *   it.** It was worst-first — notices, then open alerts, then the
       *   workspace — and the alert band left when the on-page alert system was
       *   unwired. What carries a service fault at the top of the page now is
       *   `NoticeBadge` in the sticky masthead, which holds the worst fault's
       *   own title. **The strip itself is below the fold until somebody
       *   scrolls the rail**, and `message-strip.tsx` states that cost.
       *
       * The warning log the strip also holds is suppressed by `buildMessages`
       * while any alert is open, and there are no alerts.
       */}
      {/*
       * ⚠️ **No `max-w` — the workspace is the full width of the page**, on the
       * owner's instruction, 2026-08-15. It was `max-w-[1600px] mx-auto`, so on
       * anything wider the two fixed tracks floated in gutters and the list and
       * the rail did not meet the edges of the page.
       *
       * What this spends is the map's track, and that is the intent: the two
       * fixed tracks are unchanged at 312 / 372, so **every pixel of extra width
       * goes to `minmax(0,1fr)`** — the drawing. Nothing in a fixed track
       * re-measures, because neither fixed track moved.
       *
       * The horizontal padding stays. A panel border flush against the viewport
       * edge reads as a page that has been cut off rather than as a frame.
       */}
      <main className="flex w-full flex-1 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6">
        {/*
         * The workspace: the map on the left, and on the right the column that
         * carries the list, the instrument it selects, and the gauges that
         * reading is read against.
         *
         * ⚠️ **The frames are still equal, but the viewport now sets the row
         * rather than the map.** The grid's own height (see below) defines it
         * and the map is stretched to match — the reverse of
         * how it worked until 2026-08-05, when the map's aspect ratio defined
         * the row and the column had to fit inside it. Three stacked panels
         * splitting the map's ~620px left the gauges a slot too short to draw a
         * card, and the instruction was to fill the screen instead.
         *
         * ⚠️ **That trade is REVERSED as of 2026-08-15 and the paragraph is
         * kept as the record of it.** The map frame used to gain ~144px it
         * could not draw into: the drawing was capped by the column's *width*,
         * so extra height became whitespace above and below it rather than a
         * bigger map — two equal frames with a centred map, taken deliberately
         * over a shorter map leaving the page background showing. The drawing
         * fills the frame now; `MAP_MAX_W` is deleted and the whitespace with
         * it.
         *
         * What that costs, so nobody restores it by accident: "the column can
         * never grow" used to be true by construction. It is now true only
         * because every panel in the column scrolls or pages internally — the
         * list always has, the detail body is `min-h-0 flex-1`, and the
         * baseline's card grid was rebuilt to match. **Anything added to this
         * column has to do the same**, or it pushes the workspace past a screen
         * and the bottom panel goes below the fold, which is precisely the
         * failure being fixed here. `dvh` rather than `vh` because the
         * difference is a phone's collapsing address bar, and this is a page
         * people open outdoors.
         *
         * Detail lives here rather than below the fold because clicking a row
         * has to visibly do something from where you clicked. The `lg:`
         * prefixes are because none of this applies when the columns stack —
         * there the panels are simply one after another at their natural
         * heights, and the min-heights are what keep each usable.
         */}
        {/*
         * ⚠️ **Three columns as of 2026-08-05, following the landing design's
         * map screen: the list, the drawing, the selected instrument.** It was
         * two equal frames — map left, a column of three stacked panels right.
         *
         * The map is the middle and widest track because it is the subject;
         * the list is a fixed 296px because a station row does not get better
         * with width; the rail is a fixed 340px because it holds a big number,
         * a trace and a warning, and prose past ~46 characters a line stops
         * being scannable.
         *
         * ⚠️ **`xl`, not `lg`.** 296 + 340 of fixed track plus two gaps leaves
         * the map under 400px at `lg`'s 1024 — narrower than the list beside
         * it, on a drawing of a city. Below `xl` the three stack in reading
         * order (list, map, rail) at their natural heights.
         *
         * The screen-height rule that made the old right-hand column work is
         * unchanged and now applies to all three tracks: each column is
         * `xl:h-[calc(100dvh-5rem)]` and **every panel inside it scrolls or
         * pages internally**. That is what keeps "the workspace is one screen"
         * true — the list has always scrolled, the detail body is
         * `min-h-0 flex-1 overflow-y-auto`, the baseline pages rather than
         * scrolls, and the rail below is `overflow-y-auto` as a whole.
         * **Anything added to a column has to do the same.** `dvh` rather than
         * `vh` because the difference is a phone's collapsing address bar, and
         * this is a page people open outdoors.
         *
         * ⚠️ **5rem, not 7 — extended down on the owner's instruction.** The
         * subtrahend is the sticky one-line masthead (54.5px) plus this main's
         * top padding, and at 7rem the columns ended 41px above the fold with
         * the map's legend pressed against its own bottom border.
         *
         * ⚠️ **The extra height reaches the DRAWING as of 2026-08-15.** It went
         * to each panel's `flex-1` **body**, so the list and the rail gained
         * rows while the map gained whitespace around a drawing capped by
         * `MAP_MAX_W` — and the advice here was that the cap, not this number,
         * was the lever on the map. **That cap is deleted.** The drawing is
         * sized against its own frame's height, so this number is now a lever
         * on all three tracks.
         */}
        {/* ⚠️ 312 / 1fr / 372, measured rather than taken from the mock. The
            design's 296 and 340 are what it drew, and at those widths this
            app's real chrome does not fit: `PanelHeader` puts a title beside a
            pager and two chips, so the rail truncated to "SELECTED INS…" and
            "HARBOR …", and a 296px list row wrapped "27s ago" onto two lines.
            Both tracks gained the smallest amount that cleared it. */}
        {/*
         * ⚠️ **Below `md` this grid becomes the sheet layout (screens 1l/2j),
         * and it is ONE TREE positioned by CSS — nothing is rendered twice.**
         * That constraint is not stylistic: `WarningBlock` holds the page's
         * only `aria-live` region, and a second mount would be two things
         * competing to interrupt a screen reader during a flood. So the same
         * children take `max-md:order-*` and sheet positioning instead of a
         * second mobile tree: the bar leads, the map fills the first screen,
         * the list is a sticky bottom sheet, and the rail follows in flow.
         * `md`–`xl` keeps the stacked layout; `xl` and up is unchanged.
         */}
        <div className="grid gap-4 xl:h-[calc(100dvh-5rem)] xl:grid-cols-[312px_minmax(0,1fr)_372px]">
          {/*
            The mobile search/origin bar — below `md` only, sticky under the
            masthead (53px at 390 as of 2026-08-06 — the freshness summary is
            `max-md:hidden`, so the masthead is one line on phones; re-measure
            the offset if the masthead changes), over the map. Three things:
            the address (the
            resolved origin as a pressable chip, or the shared `AddressLookup`
            field), the watch sheet's button carrying the pick count, and the
            filters button carrying the active-filter count.
          */}
          {/* ⚠️ **`top-[49px]`, down from 53 on 2026-08-15 when `PaintRule`
              came off the masthead.** The band is `h-1` below `sm`, so this is
              the old measurement minus exactly 4px — **arithmetic on a known
              constant, not a new measurement**, and it is owed a browser check
              at 390. It has to match the masthead's height: too small and the
              bar tucks under the wordmark, too large and a strip of workspace
              scrolls through the gap between them. */}
          <div className="sticky top-[49px] z-20 max-md:order-1 md:hidden">
            <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-2">
              <div className="min-w-0 flex-1">
                {query.origin ? (
                  /* Clearing resets the sort in the same patch — guard 3 of
                     the three `applyQuery` documents, same as the strip's
                     chip. */
                  <Chip
                    on
                    onClick={() =>
                      setQuery({
                        ...query,
                        origin: null,
                        sort: query.sort === "distance" ? "worst" : query.sort,
                      })
                    }
                    title="Clear this address"
                  >
                    <span className="inline-block max-w-[30ch] truncate align-middle">
                      nearest to {query.origin.label}
                    </span>
                    <span aria-hidden="true" className="ml-1.5">
                      ✕
                    </span>
                  </Chip>
                ) : (
                  /* The SAME component the controls strip mounts — one lookup,
                     one candidate list, one disclosure, so the two surfaces
                     cannot fork. See `address-lookup.tsx`. */
                  <AddressLookup query={query} onChange={setQuery} />
                )}
              </div>
              <button
                type="button"
                onClick={() => setWatchOpen(true)}
                className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              >
                {/* ⚠️ **This word and the rail tab's move together.** Below
                    `xl` there are no tabs and this button is the only door to
                    the watch panel; above it there are both, and two doors to
                    one panel wearing two different names reads as two
                    features. `RAIL_TAB_LABELS` in `rail-tabs.tsx` carries the
                    argument and the note that the value stays `"watch"`. */}
                monitor
                <span className="num text-foreground">{watching.length}</span>
              </button>
              <button
                type="button"
                aria-expanded={controlsOpen}
                aria-controls="instrument-controls"
                aria-label="Show search and filters"
                onClick={() => setControlsOpen((v) => !v)}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-border font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              >
                {/* The magnifier, matching `FilterGlyph` in `station-list.tsx`
                    — two triggers for one strip carry one glyph. */}
                <svg
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5 14 14" />
                </svg>
                {activeFilterCount > 0 && (
                  <span className="num text-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* The list moved to the FIRST column, which is where the design puts
              it and where it belongs: it is the index, the map is the subject,
              and the rail is the answer. Reading order and visual order agree
              for the first time. Below `md` it is the bottom sheet — sticky,
              pulled over the map's lower half, with the drag handle it renders
              itself. */}
          <StationList
            cameras={cameras}
            sensors={sensors}
            ordered={ordered}
            /* The 20 rows actually drawn. `ordered` still comes down whole
               because the counts, the empty states and the pager arithmetic
               are all about the filtered SET rather than the page of it. */
            pageItems={pageItems}
            page={shownPage}
            pageCount={pageCount}
            onPageChange={setListPage}
            windowMin={windowMin}
            onPickWindow={(m) => {
              setWindowMin(m);
              // Paging is about position and the window is about time; a reader
              // who narrows the timeframe has not asked to be moved. The page
              // stays exactly where it is.
            }}
            peaks={peaks}
            query={query}
            onQueryChange={setQuery}
            selectedKind={selectedKind}
            selectedId={selectedId}
            onSelectCamera={pickCamera}
            onSelectSensor={pickSensor}
            floodEventMm={floodEventMm}
            curbHeightMm={curbHeightMm}
            loading={!status.settled}
            sensorsLoading={sensorsWanted && !sensorFeed.settled}
            controlsOpen={controlsOpen}
            onControlsOpenChange={setControlsOpen}
            /* ⚠️ The list is the THIRD surface on this set, after the rail's
               panel and the selected-instrument face. All three read the same
               array and call the same toggle, which is why it is held here.
               `watchFull` is passed because `toggleWatching` above SILENTLY
               no-ops at the cap — invisible while the only doors were a button
               and a panel, and a broken-looking control on a row. */
            watching={watchingSet}
            onToggleWatch={toggleWatching}
            watchFull={watching.length >= WATCH_MAX_SENSORS}
            /*
             * ⚠️ **`75dvh` below `xl`, and it was `h-[320px]` until 2026-08-05
             * — a PRE-EXISTING overflow that the address line exposed rather
             * than caused.** Measured at 390x844 with the controls strip open:
             * the panel's own chrome is header **44** + freshness **33** +
             * strip **336.1** + the invariant-9 mode note **58.3** =
             * **471.4px** against a 320px box, so `flex-1` resolved to **0**
             * and the list showed **no rows at all** — the "stub that failed to
             * load" failure `list-controls.tsx` names, in its worst form.
             *
             * ⚠️ **The address line is not the cause and removing it does not
             * fix it.** That block measures **102.8px**; without it the chrome
             * is still **368.6px** against 320. The three-line strip already
             * overflowed here and nobody had measured this width with the strip
             * open.
             *
             * 75dvh is 633px at 844, which leaves ~162px of scroll region —
             * **3+ rows at 41.8px**, clearing the floor. `dvh` rather than `vh`
             * for the same reason as the columns: a phone's collapsing address
             * bar, on a page people open outdoors. Above `xl` nothing changes;
             * the grid track still sets the height.
             *
             * ⚠️ **The 336.1 and 102.8 above are PRE-2026-08-05 figures and the
             * strip is 34.9px shorter now.** The geocoder disclosure under the
             * address field was removed that day (see `list-controls.tsx`,
             * which carries the accounting), and every number here moved in the
             * safe direction: re-measured at 390x844 on the Sensors tab with an
             * origin set, the strip is **301.2px** and the scroll region
             * **196.5px** — **4 rows**, up from 3. **The margin this note is
             * about got wider, not narrower**, so the `75dvh` above is doing
             * strictly less work than when it was written. The numbers stay
             * because they are what the overflow was diagnosed against.
             */
            className={
              /* ⚠️ Below `md`: the bottom sheet. 55dvh rather than 75 because
                 the controls strip is a separate fixed sheet at that width, so
                 the panel's own chrome is ~180px lighter — measured against
                 the three-row floor in the browser pass. `rounded-b-none` +
                 `border-b-0` because the sheet meets the viewport edge. */
              "h-[75dvh] min-w-0 max-md:sticky max-md:bottom-0 max-md:z-20 max-md:order-3 max-md:h-[55dvh] max-md:rounded-t-xl max-md:rounded-b-none max-md:border-b-0 xl:h-auto xl:min-h-0"
            }
          />

          <CityMap
            cameras={cameras}
            /* ⚠️ Null until the reader has touched the filter at least once, and
               that null is what keeps the resting page from making a request. */
            cameraRegistry={registryFeed.data?.cameras ?? null}
            cameraFilter={cameraFilter}
            /* ⚠️ **The press that opens the fetch, and it is one-way.** See the
               sticky-state argument above. */
            onCameraFilter={(f) => {
              setRegistryWanted(true);
              setCameraFilter(f);
            }}
            gauges={data?.gauges ?? []}
            sensors={sensors}
            showSensors={showSensorLayer}
            onToggleSensors={() => setShowSensorLayer((v) => !v)}
            showPairs={showPairLayer}
            onTogglePairs={() => setShowPairLayer((v) => !v)}
            /* The same expression `StationList` gets. It gates the pair layer's
               footer line, so a fetch in flight cannot render as a pairing that
               could not be drawn. */
            sensorsLoading={sensorsWanted && !sensorFeed.settled}
            selectedId={selectedKind === "camera" ? selectedId : null}
            onSelect={pickCamera}
            selectedSensorId={selectedKind === "sensor" ? selectedId : null}
            onSelectSensor={pickSensor}
            matchingSensorIds={matchingSensorIds}
            /* The crosshair. Read off the query rather than held separately,
               so the mark on the drawing and the order of `ordered` cannot
               come from two different addresses. */
            origin={query.origin}
            floodEventMm={floodEventMm}
            curbHeightMm={curbHeightMm}
            selectedGaugeId={selectedGaugeId}
            /* ⚠️ `pickGauge`, not the raw setter — pressing a diamond has to
               open the panel that answers for it. Same rule as `pickCamera`. */
            onSelectGauge={pickGauge}
            /* First in flow below `md`, filling the first screen (2j).
             *
             * ⚠️ **`md:max-xl:h-[70dvh]` is not cosmetic and it is not
             * optional.** The map's frame is a CSS **size container** since
             * 2026-08-15, which is what lets the drawing fill it — and a size
             * container is `contain: size`, so a panel whose height came from
             * its contents would collapse the drawing to nothing. Every
             * breakpoint has to hand this panel a definite height: the grid
             * track does it at `xl`, these two classes do it everywhere else.
             * It is the same literal shape `StationList` already takes below
             * `xl`, for the same stacked layout. */
            className="max-md:order-2 max-md:h-[calc(100dvh-5rem)] md:max-xl:h-[70dvh]"
          />

          {/*
           * The rail: the instrument you picked, the harbor it is read
           * against, the email watch, and — at the foot — NOTICES.
           *
           * ⚠️ **NOTICES arrived at the bottom on 2026-08-14** and it is the
           * one panel here whose whole job is being seen.
           * `message-strip.tsx` states what putting it below the fold costs,
           * and `NoticeBadge` in the masthead is what still carries the claim
           * without a scroll.
           *
           * ⚠️ **This whole column scrolls (`overflow-y-auto`) and that is what
           * lets `WarningBlock` live here at all.** The warning has no height
           * reserve any more: it is the last thing in a scrolling container, so
           * a longer template grows it downward and pushes nothing. In the
           * masthead it reserved lines with the `lh` unit precisely because it
           * had the map, the list and the cards underneath it. **If the warning
           * is ever moved back above other content, that reserve has to come
           * back with it** — see the docblock in `warning-block.tsx`.
           *
           * `min-h-0` is the half that actually makes the scroll work: a grid
           * item's automatic minimum is its content, so without it the column
           * refuses to be shorter than the sum of its panels and pushes the
           * page instead of scrolling.
           */}
          {/*
           * ⚠️ **TABBED at `xl`, STACKED below it, and it is ONE TREE.** The
           * four panels are rendered exactly once and CSS decides which are
           * painted — the same constraint the sheet layout below `md` already
           * runs on, for the same reason: a second mount is a second place for
           * every rule in these components to drift.
           *
           * Above `xl` the column stops scrolling (`xl:overflow-hidden`) because
           * there is nothing to scroll past: one panel fills the track and every
           * one of them scrolls or pages internally, which was already required
           * of anything put in this column. Below `xl` nothing here applies and
           * the four simply follow one another at their natural heights, exactly
           * as before.
           */}
          <div className="flex min-w-0 flex-col gap-4 max-md:order-4 xl:min-h-0 xl:gap-0 xl:overflow-hidden">
            <RailTabs
              active={railTab}
              onChange={setRailTab}
              /* What the strip would actually DRAW, not how many messages
                 exist — it returns null once everything is dismissed, and a
                 tab reading `3` over an empty panel is the dismissal quietly
                 not working. */
              notices={visibleNotices.length}
              faulted={visibleNotices.some((m) => m.tone === "fault")}
              watching={watching.length}
              className="max-xl:hidden"
            />

            <SelectedDetail
              camera={selectedCamera}
              registryCamera={selectedRegistryCamera}
              sensor={selectedSensor}
              alerts={[]}
              floodEventMm={floodEventMm}
              curbHeightMm={curbHeightMm}
              pager={{
                index: orderedIndex,
                total: ordered.length,
                onStep: stepSelection,
              }}
              cameraFor={cameraForSensor}
              onSelectCamera={pickCamera}
              watching={
                selectedSensor
                  ? watching.includes(selectedSensor.sensor_id)
                  : false
              }
              onToggleWatch={toggleWatching}
              origin={query.origin}
              ingest={ingest}
              /* The tidal sentence claims the harbor gauge is evidence about
                 this sensor, and the gauges are one press away on this very
                 rail. Handing it the setter is what lets it stop being a
                 claim the reader has to go and find. */
              onShowGauges={() => setRailTab("gauges")}
              /* One window, two controls. The list sets the same state from
                 its own copy of this menu — see the note at `windowMin`. */
              windowMin={windowMin}
              onPickWindow={setWindowMin}
              className={cn("min-h-[340px] shrink-0", pane("instrument"))}
            />

            {/* ⚠️ **THE 256px FLOOR IS GONE, and it is not replaced by a
                bigger one.** That was the two-up card height at which neither
                gauge face had to scroll, and it was the number this file said
                may not be traded. What retired it is the panel it described:
                two-up and its pager went on 2026-08-15 when the five cards
                moved onto a grid with an NWS block above them.

                The equivalent floor for THAT layout is about 742px, and unlike
                256 it would actually bind. This rail is `xl:overflow-hidden`,
                so on any viewport under roughly 866px tall a 742px `min-h`
                pushes the panel's bottom out of the track and **clips it** —
                losing the last gauge card entirely, with no scrollbar to find
                it. A card back that scrolls internally is strictly better than
                a card that is not there, and `GaugeDetail` is already
                `overflow-y-auto`.

                So above `xl` the slot is `pane`'s `xl:flex-1` and nothing else,
                and the grid's `minmax(0,1fr)` rows absorb whatever the track
                gives. **The no-scroll guarantee is now conditional and says so:
                it holds at ≥900px of viewport height and degrades to an
                internally-scrolling card back below that**, rather than being
                an absolute somebody could break by resizing a window.

                The two literals below `xl` are the same arithmetic run
                backwards — see `MEASUREMENTS.md`. It still renders nothing
                before the first gauge tick, so a cold start has no empty box. */}
            <HarborBaseline
              gauges={data?.gauges ?? []}
              nws={data?.nws}
              selectedGaugeId={selectedGaugeId}
              onSelectGauge={pickGauge}
              className={cn("h-[776px] shrink-0 md:h-[704px]", pane("gauges"))}
            />

            {/*
              ⚠️ **The watch panel goes here — above the warning, never below
              it.** `WarningBlock` gave up its `lh` height reserve when it moved
              to the foot of this rail, and that is safe only because nothing
              sits underneath it. A panel below re-creates exactly the jump the
              reserve existed to prevent: a warning arriving over SSE grows the
              block and shoves the email field down while somebody is typing in
              it. See `warning-block.tsx` and `watch-panel.tsx`.
            */}
            {/*
              ⚠️ Below `md` the watch panel is a bottom sheet (screen 1l),
              opened by the bar's pick-count button and closed by default —
              `max-md:hidden` when shut, which is out of the accessibility
              tree and the tab order entirely (`display: none` is `inert`'s
              stronger cousin; `flip-card.tsx`'s idiom exists for faces that
              stay painted, and a closed sheet does not). It has no live
              region, so moving it is safe. Above `md` these classes are
              inert and the rail slot — above the warning, never below —
              is unchanged.
            */}
            {watchOpen && (
              <div
                aria-hidden="true"
                className="fixed inset-0 z-30 bg-black/55 md:hidden"
                onClick={() => setWatchOpen(false)}
              />
            )}
            {/* ⚠️ The `xl:` slot classes and the `max-md:` sheet classes never
                meet, so the tab and the bottom sheet are two independent
                presentations of one mount. `watchOpen` still owns the sheet;
                `railTab` still owns the desktop slot. */}
            <div
              className={cn(
                watchOpen
                  ? "shrink-0 max-md:fixed max-md:inset-x-3 max-md:bottom-0 max-md:z-40 max-md:max-h-[85dvh] max-md:overflow-y-auto wl-scroll"
                  : "shrink-0 max-md:hidden",
                "xl:flex xl:flex-col",
                pane("watch"),
              )}
            >
              <WatchPanel
                sensors={sensors}
                watching={watching}
                onToggle={toggleWatching}
                onClear={() => setWatching([])}
                maxSensors={WATCH_MAX_SENSORS}
                /* Whether this deployment can send at all. The confirm face
                   gates one sentence on it, so it does not tell somebody to
                   check an inbox nothing was sent to. ⚠️ The optional chain
                   is load-bearing: before the first `/healthz` settles, and on
                   an older instance mid-deploy, this is `undefined` — which
                   the panel reads as *the server did not say* rather than as
                   `false`. Absence is not a verdict. */
                mailDelivers={health.data?.mail_delivers}
                /* ⚠️ **The address this reader is signed in with, and it
                   decides what is DRAWN and nothing else.** Whether the
                   confirmation step is skipped is `api.watch_subscribe`'s
                   decision, taken against an `email_verified` claim on a token
                   it verified against Neon's JWKS, and reported back in
                   `status`. This page cannot see that claim — `SessionState` in
                   `lib/auth-client.ts` is narrowed to `email` deliberately, so
                   the client is never in a position to make a security claim
                   the server would have to agree with.

                   ⚠️ The read is here rather than in the panel so that
                   `watch-panel.tsx` imports nothing from the auth SDK. Optional
                   chaining is load-bearing on `isPending`'s account: before the
                   session settles this is `undefined` and the panel draws the
                   typed field, which is the pre-2026-08-16 flow and is correct
                   for a signed-out reader. */
                sessionEmail={session.data?.user?.email}
                /* ⚠️ The wizard closes itself after a CONFIRMED subscribe —
                   there is no next step on that path, so a terminal face left
                   up claims one the flow does not have. The panel resets its
                   own faces; this is the half it cannot reach, because the
                   sheet's open flag lives here. Above `md` the panel is
                   permanent chrome and this call is a no-op, which is why the
                   reset happens either way. ⚠️ It deliberately does NOT touch
                   `railTab` — moving a reader off a tab they chose, on a timer,
                   with no press, is the page moving under them. */
                onClose={() => setWatchOpen(false)}
              />
            </div>

            {/*
              ⚠️ **NOTICES, at the foot of the rail as of 2026-08-14, on the
              owner's instruction.** It was the first child of `<main>`, above
              the workspace.

              ⚠️ **This is the frozen-poller rule's BACKSTOP and it is now
              below the fold.** On desktop the rail scrolls and this is the last
              thing in it; below `md` the rail is `order-4`, so it is the bottom
              of the page. **What still carries the claim always-visible is
              `NoticeBadge` in the sticky masthead**, which carries the worst
              fault's own title rather than a count — exactly what it was built
              for. `site-header.tsx` argues that at length, and its `title`
              names this position.

              ⚠️ **Its height is a constant and must stay one.** In the rail a
              `min-h` or an `h-auto` pushes the whole column rather than the
              workspace, which is the same failure one container over. See
              `message-strip.tsx` for the arithmetic.
            */}
            {/*
              ⚠️ **The wrapper is what makes NOTICES a tab, and the strip's own
              height is untouched inside it.** `h-[112px] md:h-[192px]` is a
              CONSTANT and stays one — the slot around it may be taller and the
              box may not grow into it. A `min-h` or an `h-auto` on the strip
              itself re-creates the unbounded push it exists to remove.
            */}
            <div className={cn("shrink-0", pane("notices"))}>
              <MessageStrip
                messages={messages}
                dismissed={dismissed}
                onDismiss={(id) => setDismissed((prev) => new Set(prev).add(id))}
                onShowAll={() => setDismissed(new Set())}
              />
              {/*
                ⚠️ **The tab has to say something when the strip says nothing.**
                `MessageStrip` returns null once every row is dismissed, which in
                the stacked rail simply closed a gap and in a tabbed one would be
                an empty panel under a tab somebody just pressed — indistinguishable
                from a panel that failed to load.

                ⚠️ **It reports on the STRIP, never on the water**, and the two
                sentences are separated for that reason. `buildMessages` watches
                four service faults; a quiet strip means none of those four is
                firing and means nothing whatever about conditions, coverage, or
                any instrument. The `show all` button is the same one in the
                strip's own header — dismissing moves a claim rather than
                deleting it, so it has to be undoable from wherever the claim
                went.
              */}
              {visibleNotices.length === 0 && (
                <div className="max-xl:hidden">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    No service fault is being reported. This is a statement about
                    Fluud, not about conditions.
                  </p>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDismissed(new Set())}
                      className="mt-2.5 cursor-pointer rounded-full border border-border px-2.5 py-[5px] font-mono text-[9.5px] leading-none tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
                    >
                      show all {messages.length}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/*
              ❌ ⚠️ **`WarningBlock` sat here and is UNMOUNTED.** It carried the
              whole warning — the templated sentence verbatim, the provenance
              chips, the place, the clock, the ramp from watch up, and the rat
              that was the drill trigger. The on-page alert system was unwired:
              there is no `/api/events` to subscribe to and no `alerts` row to
              raise. `warning-block.tsx`, `alert-list.tsx`, `rat-figure.tsx`,
              `drill-controls.tsx`, `lib/warning-feed.ts` and
              `lib/hooks/use-warnings.ts` are all kept as files with no mount,
              so putting it back is a re-wire rather than a rebuild.

              ⚠️ **This page has NO `aria-live` region now**, and that is the
              deliberate consequence rather than an accessibility regression to
              be found later: nothing on it announces, because nothing on it is
              announced. Every number here is polled and rendered, and a reader
              learns it by looking. **Restoring the warning restores the live
              region, and it must be the only one on the page.**

              ⚠️ **`MessageStrip` is the bottom of the rail now**, with
              `WatchPanel` above it. The rule that nothing may sit below the
              warning is retired with the warning itself; if it comes back it
              goes back at the foot, and both of those go above it.
            */}
          </div>
        </div>

        {/*
         * ⚠️ **The rat monitor used to sit here and was removed on the owner's
         * instruction.** It carried the level ramp as colour, the place, the
         * clock, the rat and the `DRILL ▾` control. Where each of those went:
         *
         * - the **rat** and the **drill control** are in the masthead, on the
         *   same level and the same `dimmed` signal — one animal now, and it is
         *   the button;
         * - the **place** and the **clock** moved up with them, on the line
         *   under the warning text they belong to;
         * - the **ramp as colour** is the one thing with no new home. The
         *   masthead may not wear it (the never-safe rule — see `site-header.tsx`), so
         *   an alert level now reaches the page's chrome only through
         *   `AlertList`, which renders solely while an alert is *open*. A drill
         *   or a warning with no open alert has the words, the EMERGENCY marker
         *   and the rat's pose and tempo, and no colour at all.
         *
         * Recorded rather than dropped quietly, on the same terms as the other
         * removals in the root `CLAUDE.md`. `warning-panel.tsx` is deleted, not
         * orphaned; it is in the archived pre-public history if it goes back.
         */}

        {/*
         * ⚠️ **The watched-camera grid used to sit here and was removed on the
         * owner's instruction on 2026-08-05.** 27 cards, each with a still, a
         * depth, a severity pill and a back that turned over to the
         * neighbourhood rodent tag. `camera-grid.tsx` and `camera-card.tsx` are
         * deleted rather than orphaned, on the same terms as `warning-panel.tsx`
         * before them; both are in the archived pre-public history.
         *
         * Recorded rather than dropped quietly, because two things went with it
         * and neither survives anywhere now:
         *
         * - ❌ **The rodent context outlived the grid by nine days and is also
         *   gone.** It moved to the back of the selected-instrument panel and
         *   was deleted outright on 2026-08-14 with the rename to Fluud —
         *   `neighborhood-back.tsx`, the DOHMH aggregate, the generator and the
         *   three wire fields. There is no neighbourhood face on this page.
         * - ❌ **`camera-grid`'s empty state is gone, and it was an the never-safe rule
         *   enforcement point.** It read *"No cameras are reporting. This is
         *   not a statement about conditions."* `station-list.tsx` still says
         *   exactly that and is on this page, and the landing's citywide card
         *   says it too — so the claim is not lost, but this page now makes it
         *   in one place rather than two.
         *
         * Every camera is still reachable: the list is the full set, the pager
         * walks it, and the map plots it. What is gone is the contact sheet.
         */}
      </main>

      {/*
        ❌ ⚠️ **`SiteFooter` was here and came off on 2026-08-16**, on the
        owner's instruction. It renders on `/`, `/about` and `/terms`; this is
        the one page that had it and lost it, and the auth views dropped it in
        the same change for their split layout.

        ⚠️ **What it was carrying here, and where each thing went.** The four
        route links — `/`, `/about`, `/terms`, `/map` — and the hard-coded
        description ending *"This is a prototype. It is not an emergency
        service."* **Both are on `/`**, which is a landing page again, and the
        masthead's wordmark is a real `<Link>` to it. So a reader on the
        instrument is one press from all four.

        ⚠️ **The cost is real and worth stating: this page no longer carries the
        prototype disclaimer anywhere.** It is on `/`, on `/terms` §01 and in
        every warning email, and it is a page away from a reader who opened the
        map and stayed there. `web/src/components/CLAUDE.md` already records
        that the footer's never-safe paragraph was removed once; this is the
        same shape of loss and it belongs in the same row.

        ⚠️ **The workspace's own arithmetic did not move.** The three columns
        subtract `5rem` for the masthead, not for the footer, which sat below
        the fold at every measured viewport. Nothing here re-measures.
      */}
    </>
  );
}
