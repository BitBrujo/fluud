#!/usr/bin/env python3
"""Regenerate `src/lib/geo/cso.ts` — NYC combined sewer overflow outfalls.

Run this BY HAND, on a machine with network, when the layer needs to change. It
is not part of `npm run build` and must never become part of it, for the same
reason as `basemap.py`: the Docker UI stage builds from `package-lock.json` and
has no egress, so the geometry is committed rather than fetched.

    cd web && python3 scripts/cso.py > src/lib/geo/cso.ts

Source: NY State DEC, "Combined Sewer Overflows (CSOs): Beginning 2013"
(data.ny.gov, `ephi-ffu6`), filtered to the five NYC counties.

⚠️ THIS IS GEOGRAPHY, NOT AN EVENT FEED, and the distinction is the entire
reason the layer looks the way it does.

An outfall is where the combined sewer system relieves itself into a waterway
when rain fills it past capacity — which is the mechanism the whole project is
named for, and the rat's actual authority: the sewers fill before the street
does. Knowing where those points are is real information about how this city
floods.

Knowing *when one is discharging* is information we cannot get. NYC DEP notifies
discharges through NY-Alert, a subscription email/SMS system; DEC posts a
rolling seven-day HTML page. There is no API, no RSS and no JSON, so a live CSO
signal would have to be scraped — which LIMITATIONS.md §10 forbids outright, and
which would in any case be built on a record a 2023 NYS Supreme Court ruling
found to be incomplete. So the map may say "here is where the system discharges"
and must never imply "here is where it is discharging now".

⚠️ The registry is dated `2015`. Outfalls are civil infrastructure and do not
move often, but eleven years is eleven years, and the UI states the vintage
rather than letting a committed file imply currency.

Upstream's longitude column is misspelled `longtitude`. That is not a typo here.
"""

import json
import sys
import urllib.parse
import urllib.request

SRC = "https://data.ny.gov/resource/ephi-ffu6.json"

UA = {"User-Agent": "waterline/0.1 (NYC flood prototype; contact via repo)"}

NYC_COUNTIES = ("New York", "Kings", "Queens", "Bronx", "Richmond")

# Matches NYC_BOUNDS in src/lib/geo/project.ts. Anything outside is dropped here
# rather than projected off-canvas at render time — measured, all 427 outfalls
# fall inside with margin, so this firing means the upstream feed has moved.
BOUNDS = {"west": -74.27, "east": -73.69, "south": 40.49, "north": 40.92}

# Four decimals is ~11m at this latitude — finer than a 1000-unit viewBox can
# resolve, and half the bytes of full float formatting.
PRECISION = 4


def fetch() -> list[dict]:
    counties = ",".join(f"'{c}'" for c in NYC_COUNTIES)
    params = {
        "$select": "cso_identification_number,facility_name,"
        "receiving_waterbody_name,latitude,longtitude,data_as_of",
        "$where": f"county in({counties})",
        "$limit": 5000,
    }
    req = urllib.request.Request(
        f"{SRC}?{urllib.parse.urlencode(params)}", headers=UA
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main() -> None:
    rows = fetch()

    pts: list[tuple[float, float]] = []
    dropped = 0
    waterbodies: set[str] = set()
    vintages: set[str] = set()
    for r in rows:
        try:
            lon = float(r["longtitude"])
            lat = float(r["latitude"])
        except (KeyError, TypeError, ValueError):
            dropped += 1
            continue
        if not (BOUNDS["west"] <= lon <= BOUNDS["east"]):
            dropped += 1
            continue
        if not (BOUNDS["south"] <= lat <= BOUNDS["north"]):
            dropped += 1
            continue
        pts.append((round(lon, PRECISION), round(lat, PRECISION)))
        if r.get("receiving_waterbody_name"):
            waterbodies.add(r["receiving_waterbody_name"])
        if r.get("data_as_of"):
            vintages.add(str(r["data_as_of"]))

    if dropped:
        print(f"# dropped {dropped} outfalls (no coords or outside bounds)",
              file=sys.stderr)
    print(f"generated {len(pts)} outfalls, {len(waterbodies)} receiving waters, "
          f"vintage {'/'.join(sorted(vintages))}", file=sys.stderr)

    as_of = "/".join(sorted(vintages)) or "unknown"

    # Six points per line. A 427-point array on one line is a 9KB diff hunk
    # every time one outfall moves; wrapped, a regeneration shows what changed.
    lines = []
    for i in range(0, len(pts), 6):
        chunk = pts[i : i + 6]
        lines.append(
            "  " + ", ".join(f"{v:g}" for p in chunk for v in p) + ","
        )
    flat = "\n".join(lines)

    print(
        f'''/**
 * NYC combined sewer overflow outfalls. GENERATED — do not edit.
 *
 *     cd web && python3 scripts/cso.py > src/lib/geo/cso.ts
 *
 * {len(pts)} outfalls across {len(waterbodies)} receiving waterbodies, from NY State DEC
 * `ephi-ffu6`, filtered to the five boroughs.
 *
 * ⚠️ **This is geography, not an event feed.** These are the points at which
 * the combined sewer system discharges when rain fills it past capacity — the
 * mechanism this whole project is named after. They are NOT a live discharge
 * signal, and nothing may render them as one: real-time CSO notification exists
 * only through NY-Alert email/SMS, so a live feed would have to be scraped,
 * which LIMITATIONS §10 forbids. The layer says "this is where the system
 * relieves itself", never "this is where it is relieving itself now".
 *
 * ⚠️ Registry vintage is {as_of}. Outfalls are civil infrastructure and rarely
 * move, but the UI states the date rather than letting a committed file imply
 * currency.
 *
 * Flat [lon, lat, lon, lat, …] on the same terms as `nyc.ts` — project with
 * `geo/project.ts` at render time rather than storing screen coordinates.
 */

export const CSO_AS_OF = "{as_of}";
export const CSO_COUNT = {len(pts)};

export const CSO_OUTFALLS: readonly number[] = [
{flat}
];'''
    )


if __name__ == "__main__":
    main()
