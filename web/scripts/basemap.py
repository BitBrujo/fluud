#!/usr/bin/env python3
"""Regenerate `src/lib/geo/nyc.ts` — the bundled NYC basemap.

Run this BY HAND, on a machine with network, when the basemap needs to change.
It is not part of `npm run build` and must never become part of it: the Docker
UI stage builds from `package-lock.json` and has no egress, so the geometry has
to be committed rather than fetched.

    cd web && python3 scripts/basemap.py > src/lib/geo/nyc.ts

Source: NYC Open Data borough boundaries, shoreline-clipped (the *land* areas —
Manhattan comes out at 636,631,375 ft² ≈ 22.8 mi², which is the island, not the
island plus half the Hudson). Socrata's `tqmj-j8zm` GeoJSON export is dead; the
ArcGIS feature service below is the same underlying DCP layer and is live.

The defaults produce ~1,400 points across 21 rings, ~27KB of TypeScript. That
is a deliberate trade: enough fidelity that the city is recognisable at a
glance, little enough that it is a rounding error next to the JS bundle. At
~100m tolerance individual piers disappear and the Rockaways do not.
"""

import json
import math
import sys
import urllib.request

SRC = (
    "https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services"
    "/NYC_Borough_Boundary/FeatureServer/0/query"
    "?where=1%3D1&outFields=BoroName,BoroCode&f=geojson"
)

# Douglas-Peucker tolerance in degrees. ~0.0009° ≈ 75-100m at this latitude.
TOL = 0.0009
# Rings smaller than this (degrees², shoelace) are dropped. Keeps Roosevelt and
# Rikers, drops the pierhead slivers that survive as visual noise.
MIN_RING_AREA = 3e-5
PRECISION = 4


def ring_area(pts: list[tuple[float, float]]) -> float:
    """Shoelace, in degrees squared. Sign discarded — we only rank by size."""
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def perp_dist(p, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(pts, tol):
    """Douglas-Peucker, iterative — these rings are long enough to blow a stack."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        worst, wi = -1.0, lo
        for i in range(lo + 1, hi):
            d = perp_dist(pts[i], pts[lo], pts[hi])
            if d > worst:
                worst, wi = d, i
        if worst > tol:
            keep[wi] = True
            stack.append((lo, wi))
            stack.append((wi, hi))
    return [p for p, k in zip(pts, keep) if k]


def rings_of(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return list(c)
    if t == "MultiPolygon":
        return [r for poly in c for r in poly]
    raise ValueError(f"unexpected geometry {t}")


def main() -> None:
    with urllib.request.urlopen(SRC, timeout=120) as r:
        data = json.load(r)

    boroughs = []
    for feat in sorted(data["features"], key=lambda f: f["properties"]["BoroCode"]):
        name = feat["properties"]["BoroName"]
        kept = []
        for ring in rings_of(feat["geometry"]):
            pts = [(round(x, 6), round(y, 6)) for x, y in ring]
            if ring_area(pts) < MIN_RING_AREA:
                continue
            s = simplify(pts, TOL)
            deduped = [s[0]]
            for p in s[1:]:
                if p != deduped[-1]:
                    deduped.append(p)
            if len(deduped) >= 4:
                kept.append(deduped)
        kept.sort(key=ring_area, reverse=True)
        boroughs.append((name, kept))
        print(
            f"  {name:15s} rings={len(kept):2d} pts={sum(len(r) for r in kept)}",
            file=sys.stderr,
        )

    lons = [x for _, rs in boroughs for r in rs for x, _ in r]
    lats = [y for _, rs in boroughs for r in rs for _, y in r]
    print(
        f"  extent lon {min(lons):.4f}..{max(lons):.4f} "
        f"lat {min(lats):.4f}..{max(lats):.4f}",
        file=sys.stderr,
    )

    out = [
        "/**",
        " * NYC borough outlines. GENERATED — do not hand-edit.",
        " *",
        " *   cd web && python3 scripts/basemap.py > src/lib/geo/nyc.ts",
        " *",
        " * Committed rather than fetched, because the Docker UI stage builds from",
        " * the lockfile and has no network. This is also why there is no map",
        " * library and no tile CDN: the whole basemap is these numbers.",
        " *",
        " * Each ring is a FLAT array — [lon, lat, lon, lat, …] — which is half the",
        " * punctuation of nested pairs and exactly the shape the path builder wants.",
        " * Rings are shoreline-clipped land, ordered largest first.",
        " */",
        "",
        "export interface Borough {",
        "  readonly name: string;",
        "  readonly rings: readonly (readonly number[])[];",
        "}",
        "",
        "export const NYC_BOROUGHS: readonly Borough[] = [",
    ]
    for name, rings in boroughs:
        out.append("  {")
        out.append(f'    name: "{name}",')
        out.append("    rings: [")
        for r in rings:
            nums = ", ".join(f"{round(v, PRECISION):g}" for p in r for v in p)
            out.append(f"      [{nums}],")
        out.append("    ],")
        out.append("  },")
    out.append("];")
    out.append("")
    print("\n".join(out))


if __name__ == "__main__":
    main()
