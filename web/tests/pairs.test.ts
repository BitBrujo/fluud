/**
 * The camera→sensor pair links.
 *
 * ⚠️ **The assertion that earns this file is the join DIRECTION.** Everything
 * else here is ordinary refusal-of-absence work; test 2 is the one that catches
 * the mistake that would actually ship — joining through
 * `SensorStatus.watched_camera_id` instead of `CameraStatus.sensor_id`. Those
 * two fields are not inverses: four sensors serve more than one watched camera
 * and one serves four, so the reversed join draws 21 lines where 27 pairings
 * exist and drops six **silently**. Nothing in a browser would flag six missing
 * lines on a map of a city.
 *
 * Verified by breaking the implementation:
 *   - joining on `watched_camera_id` fails test 2 with
 *     `expected [ { cameraId: 'cam-9', … } ] to have a length of 0 but got 1`
 *   - deduping by `sensorId` fails test 3 with
 *     `expected 4 to be 2` — the four-camera sensor losing three pairings
 *
 * Nothing here can see the stroke, the dash, the z-order or the colour. Those
 * are browser facts and there is no jsdom.
 */
import { describe, expect, it } from "vitest";
import { pairKey, pairLinks } from "../src/lib/geo/pairs";
import { project } from "../src/lib/geo/project";
import { camera, sensor } from "./_fixtures";

describe("pairLinks", () => {
  it("links a camera to the sensor its sensor_id names", () => {
    const links = pairLinks(
      [camera({ camera_id: "cam-1", sensor_id: "s1" })],
      [sensor({ sensor_id: "s1" })],
    );

    expect(links).toHaveLength(1);
    expect(links[0].cameraId).toBe("cam-1");
    expect(links[0].sensorId).toBe("s1");
  });

  /* ⚠️ THE ONE THAT MATTERS. `watched_camera_id` points the other way and names
     only one camera per sensor, so a reversed join is lossy in proportion to how
     many cameras share a deployment. */
  it("does NOT join through watched_camera_id", () => {
    const links = pairLinks(
      /* The camera does not point at anything. */
      [camera({ camera_id: "cam-9", sensor_id: null })],
      /* The sensor points at it. This must not be enough. */
      [sensor({ sensor_id: "s9", watched_camera_id: "cam-9" })],
    );

    expect(links).toHaveLength(0);
  });

  /* ⚠️ Fan-out, never a bijection. One sensor really does serve four cameras. */
  it("draws one link per camera when several share a sensor", () => {
    const shared = sensor({ sensor_id: "s1", lat: 40.7, lon: -73.9 });
    const two = pairLinks(
      [
        camera({ camera_id: "cam-1", sensor_id: "s1" }),
        camera({ camera_id: "cam-2", sensor_id: "s1", lat: 40.75, lon: -73.95 }),
      ],
      [shared],
    );

    expect(two).toHaveLength(2);
    expect(two.map((l) => l.cameraId)).toEqual(["cam-1", "cam-2"]);
    /* Both ends land on the same sensor. Deduping here would draw one line. */
    expect(two[0].to).toEqual(two[1].to);

    const four = pairLinks(
      ["cam-1", "cam-2", "cam-3", "cam-4"].map((id, i) =>
        camera({ camera_id: id, sensor_id: "s1", lat: 40.7 + i * 0.01 }),
      ),
      [shared],
    );
    expect(four).toHaveLength(4);
  });

  it("draws nothing for an unpaired camera", () => {
    expect(pairLinks([camera({ sensor_id: null })], [sensor()])).toEqual([]);
  });

  it("draws nothing for a sensor_id that resolves to no deployment", () => {
    const links = pairLinks(
      [camera({ sensor_id: "s9" })],
      [sensor({ sensor_id: "s1" })],
    );
    expect(links).toEqual([]);
  });

  /* The layer-off and payload-in-flight path. `/api/sensors` is gated, so an
     empty array is the ordinary first state rather than an error. */
  it("returns an empty array with no sensors, and does not throw", () => {
    expect(pairLinks([camera({ sensor_id: "s1" })], [])).toEqual([]);
    expect(pairLinks([], [sensor()])).toEqual([]);
  });

  /* Asserted separately: one guard covering both ends can pass while only
     checking one of them. */
  it("drops a link whose CAMERA is outside the mapped area", () => {
    const links = pairLinks(
      /* Philadelphia. */
      [camera({ sensor_id: "s1", lat: 39.95, lon: -75.16 })],
      [sensor({ sensor_id: "s1" })],
    );
    expect(links).toEqual([]);
  });

  it("drops a link whose SENSOR is outside the mapped area", () => {
    const links = pairLinks(
      [camera({ sensor_id: "s1" })],
      [sensor({ sensor_id: "s1", lat: 39.95, lon: -75.16 })],
    );
    expect(links).toEqual([]);
  });

  /* ⚠️ `geo.test.ts` records that a transposed lon/lat returns a plausible
     wrong answer rather than crashing, so the endpoints are pinned against
     `project` itself and then sanity-checked against a known quadrant. */
  it("puts the endpoints exactly where project does", () => {
    const c = camera({ sensor_id: "s1", lat: 40.762, lon: -73.771 });
    const s = sensor({ sensor_id: "s1", lat: 40.734, lon: -73.977 });
    const [link] = pairLinks([c], [s]);

    expect(link.from).toEqual(project(c.lon, c.lat));
    expect(link.to).toEqual(project(s.lon, s.lat));
  });

  it("places a Brooklyn pair in the lower-right quadrant", () => {
    /* East of the western edge and south of the middle. A transposition would
       put this outside the unit square entirely, or in the wrong corner. */
    const [link] = pairLinks(
      [camera({ sensor_id: "s1", lat: 40.65, lon: -73.95 })],
      [sensor({ sensor_id: "s1", lat: 40.66, lon: -73.94 })],
    );

    expect(link.from.x).toBeGreaterThan(0.5);
    expect(link.from.y).toBeGreaterThan(0.5);
  });

  /* A zero-length line with a round cap draws a DOT, and a filled dot on this
     map means a sewer outfall. */
  it("drops a link whose endpoints project to the same point", () => {
    const links = pairLinks(
      [camera({ sensor_id: "s1", lat: 40.7, lon: -73.9 })],
      [sensor({ sensor_id: "s1", lat: 40.7, lon: -73.9 })],
    );
    expect(links).toEqual([]);
  });

  it("keeps the cameras array's order and gives every link a unique key", () => {
    const cams = ["cam-3", "cam-1", "cam-2"].map((id, i) =>
      camera({ camera_id: id, sensor_id: `s${i}`, lat: 40.7 + i * 0.01 }),
    );
    const sens = [0, 1, 2].map((i) =>
      sensor({ sensor_id: `s${i}`, lat: 40.75 + i * 0.01 }),
    );
    const links = pairLinks(cams, sens);

    expect(links.map((l) => l.cameraId)).toEqual(["cam-3", "cam-1", "cam-2"]);

    const keys = links.map(pairKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /* It runs during render, on every pan frame. */
  it("is pure — same answer twice, and neither input is touched", () => {
    const cams = [camera({ sensor_id: "s1" })];
    const sens = [sensor({ sensor_id: "s1" })];
    const before = JSON.stringify([cams, sens]);

    expect(pairLinks(cams, sens)).toEqual(pairLinks(cams, sens));
    expect(JSON.stringify([cams, sens])).toBe(before);
  });
});

describe("pairKey", () => {
  /* Keyed on BOTH ends. `sensorId` alone is already wrong — four cameras share
     one sensor — and `cameraId` alone stops being unique the day a camera is
     allowed a second pairing. */
  it("separates two cameras sharing one sensor", () => {
    const [a, b] = pairLinks(
      [
        camera({ camera_id: "cam-1", sensor_id: "s1" }),
        camera({ camera_id: "cam-2", sensor_id: "s1", lat: 40.75 }),
      ],
      [sensor({ sensor_id: "s1" })],
    );
    expect(pairKey(a)).not.toBe(pairKey(b));
  });
});
