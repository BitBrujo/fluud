/**
 * The camera→sensor pairing, as geometry.
 *
 * A pairing has been data since the poller learned to co-locate a DOT camera
 * with a FloodNet deployment, and it has never been drawn. The only visual
 * expression of one was a *filled* camera pin — `calibrated` — which says a
 * pairing exists and nothing about which instrument is on the other end.
 *
 * ## ⚠️ What a pairing IS, and what it is not
 *
 * **This sensor's depth is the one labelling that camera's view. That is all.**
 * A pairing gates nothing: `waterline/watch.py` is a sensor-only state machine
 * with no camera in it, so ~343 deployments can mail a subscriber with no
 * pairing whatsoever, and the on-page alert system was unwired, so nothing
 * anywhere raises a warning from either end.
 *
 * ⚠️ **The clause saying what a pairing is has been wrong twice** — first
 * *"display only"*, then *"drives a warning at a watched camera"*. See
 * `sensorTitle` in `city-map.tsx`. **A claim built on a pairing has to name its
 * path**, and this module's claim is the narrowest one available: these two
 * instruments are at the same corner.
 *
 * ## ⚠️ The join runs CAMERA → SENSOR and the reverse is a real trap
 *
 * `CameraStatus.sensor_id` and `SensorStatus.watched_camera_id` are **not
 * inverses.** 131 pairs exist, 27 cameras are watched, and only **21 distinct
 * sensors** serve those 27 — four sensors serve more than one camera and one
 * serves four. `watched_camera_id` names *one* camera per sensor, so joining
 * that way draws 21 lines and silently drops six. A mark quietly missing from a
 * map is the failure the off-map counters exist to prevent.
 *
 * `tests/pairs.test.ts` pins that direction with a sensor pointing at a camera
 * that does not point back.
 *
 * ## Why it is here rather than in the component
 *
 * `web/tests/` may only reach `src/lib/`, and everything else about this layer —
 * the stroke, the dash, the z-order, the colour — is a browser fact with no
 * jsdom to fake it. This is the one part a runner can hold, so it is a pure
 * function of two arrays and it returns unit-square points, exactly as
 * `CSO_POINTS` does. **The `* VIEWBOX_W` scaling belongs at the render site**;
 * a local derivation of the frame here would be the letterbox drift with a new
 * door. See `viewport.ts`.
 */
import type { SensorStatus } from "../api-types";
import { inViewport, project, type Point } from "./project";

/**
 * The four fields this function reads off a camera, and nothing more.
 *
 * ⚠️ **Structural on purpose, since the camera layer gained a second source.**
 * `/api/status` supplies `CameraStatus` and `/api/cameras` supplies
 * `CameraEntry`; both satisfy this and neither is the other. Naming the fields
 * rather than the model is also what keeps the join direction visible — the only
 * id here is `sensor_id`, so `watched_camera_id` is not reachable from this
 * function even by mistake. See the module docblock.
 */
export interface PairSource {
  camera_id: string;
  sensor_id: string | null;
  lat: number;
  lon: number;
}

/** One drawn link. Both endpoints are in the unit square `project()` returns. */
export interface PairLink {
  cameraId: string;
  sensorId: string;
  /** The camera end. */
  from: Point;
  /** The sensor end. Several links may share one — see the fan-out rule. */
  to: Point;
}

/**
 * Every camera→sensor link that can honestly be drawn.
 *
 * Five things are refused, and each of them is a test:
 *
 * - **`sensor_id: null`** — the absence of a pairing. Not a zero.
 * - **An id not in `sensors`** — the payload is in flight, or the deployment is
 *   not in `/api/sensors`. There is no endpoint to invent a coordinate from, and
 *   both cases look identical from here.
 * - **Either endpoint outside `NYC_BOUNDS`** — a line to a coordinate off the
 *   drawing streaks across the whole frame. The three off-map counters already
 *   carry that instrument, and they should read zero forever.
 * - **Coincident projected endpoints** — a zero-length `<line>` renders as a
 *   dot, and a filled dot on this map means a sewer outfall. Cheap guard
 *   against a mark that would lie about its class.
 *
 * ⚠️ **Fan-out, never a bijection.** One link per *camera*, so four cameras
 * sharing a sensor produce four links sharing a `to`. **Do not dedupe by
 * `sensorId`** — that draws one line for four pairings and drops three.
 *
 * Order follows `cameras`, so React keys are stable across a poll. Neither
 * input is mutated: this runs during render, on every pan frame.
 */
export function pairLinks(
  cameras: readonly PairSource[],
  sensors: readonly SensorStatus[],
): PairLink[] {
  if (cameras.length === 0 || sensors.length === 0) return [];

  const byId = new Map<string, SensorStatus>();
  for (const s of sensors) byId.set(s.sensor_id, s);

  const links: PairLink[] = [];
  for (const camera of cameras) {
    /* ⚠️ `sensor_id`, never `watched_camera_id` — see the module docblock. */
    const id = camera.sensor_id;
    if (id == null) continue;

    const sensor = byId.get(id);
    if (sensor === undefined) continue;

    if (!inViewport(camera.lon, camera.lat)) continue;
    if (!inViewport(sensor.lon, sensor.lat)) continue;

    const from = project(camera.lon, camera.lat);
    const to = project(sensor.lon, sensor.lat);
    if (from.x === to.x && from.y === to.y) continue;

    links.push({ cameraId: camera.camera_id, sensorId: sensor.sensor_id, from, to });
  }
  return links;
}

/**
 * A stable React key for one link.
 *
 * Keyed on **both** ends: `cameraId` alone would be unique today and would stop
 * being so the moment a camera is ever allowed a second pairing, and `sensorId`
 * alone is already wrong — four cameras share one sensor.
 */
export function pairKey(link: PairLink): string {
  return `${link.cameraId}→${link.sensorId}`;
}
