/**
 * Fixtures for the two instrument classes.
 *
 * Not a test file — `vitest.config.mts` collects `tests/**\/*.test.ts` only.
 *
 * Both builders return a **healthy, reporting, plausible** instrument unless a
 * test overrides a field. That direction is deliberate: a test about faults says
 * `plausible: false` out loud, so reading the test tells you what the case is
 * without holding the default in your head.
 */
import type { CameraStatus, SensorStatus } from "../src/lib/api-types";

/** A FloodNet deployment. Coordinates are inside `NYC_BOUNDS`. */
export function sensor(over: Partial<SensorStatus> = {}): SensorStatus {
  return {
    sensor_id: "curly_orange_shrimp",
    name: "Ave C @ 23 St",
    lat: 40.734,
    lon: -73.977,
    borough: "Manhattan",
    nta: "MN0502",
    tidal: false,
    status: "good",
    alert_visible: true,
    alert_permitted: true,
    watched_camera_id: null,
    /* 2.4 m, which is inside FloodNet's usual 2–3 m mounting range. A height
       rather than a null by default, on this file's own rule: the absent case
       is the one a test says out loud. */
    ground_height_mm: 2400,
    observed_at: "2026-08-05T12:00:00Z",
    depth_mm: 0,
    flood_detected: false,
    plausible: true,
    ...over,
  };
}

/** A DOT camera fused with whatever the poller had. */
export function camera(over: Partial<CameraStatus> = {}): CameraStatus {
  return {
    camera_id: "cam-1",
    name: "Northern Blvd @ Bell Blvd",
    lat: 40.762,
    lon: -73.771,
    image_url: "https://webcams.nyctmc.org/cam-1.jpg",
    observed_at: "2026-08-05T12:00:00Z",
    depth_mm: 0,
    sensor_id: null,
    nws_active: false,
    calibrated: true,
    nta: "QN0203",
    depth_plausible: true,
    ...over,
  };
}
