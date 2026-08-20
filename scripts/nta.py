#!/usr/bin/env python3
"""Regenerate `waterline/nta.py` — the 2020 NTA code -> display name crosswalk.

Run this BY HAND, on a machine with network, if the NTA revision ever moves. It
is not part of any build and must never become part of one: the Docker stages
have no egress, which is why the output is committed. Neighborhood boundaries
are the slowest-moving data this app touches — the 2020 vintage has been stable
since 2020 and the next revision will arrive with a census.

    python3 scripts/nta.py > waterline/nta.py

## What this is for

FloodNet's Socrata mirror publishes a 2020 NTA **code** per deployment
(`BK0503`). A code is an internal join key and means nothing to a reader, so
nothing on the wire carries it — `api._nta_name` resolves it to a name and the
name is what ships. Two surfaces consume that name and neither is optional:

- `selected-detail.tsx`'s sensor face renders a `neighbourhood` row;
- `instrument-query.ts` matches the search box against it, so a reader can type
  *Sunset Park* and find the instruments in it.

⚠️ **`$select` excludes `the_geom`.** The boundaries are megabytes and this
needs two columns. Asking for the geometry and discarding it would be slower,
ruder to the host, and pointless.

## ⚠️ This replaced `scripts/rodent.py`, and the difference is the point

Until 2026-08-14 this crosswalk was a by-product of `scripts/rodent.py`, which
aggregated DOHMH rat-inspection findings to NTA and emitted
`waterline/rodent_nta.py` as `code -> (name, rate, inspections)`. That feature
is deleted — the card back it fed, the three wire fields, and the generator.

**The name lookup is not part of what was deleted** and had to be rescued from
it, because it never had anything to do with rodents: DOHMH supplied the
inspection counts and the DCP layer below supplied the names, and only the
second one is a fact about geography.

⚠️ **Coverage went UP, from 213 NTAs to 262.** The old file could only name a
neighborhood the city had inspected in the trailing year; an NTA with no
inspections had no row, so a sensor in it rendered an em-dash where a name
belongs. Reading the crosswalk directly has no such hole. **If this number
drops, an NTA revision has moved underneath the FloodNet codes** — see below.

⚠️ **Both sides must stay 2020 vintage.** FloodNet publishes `nta2020` codes and
this reads the `nta2020` column. If either moves to a new revision the codes
stop matching, and the failure is silent and total: `_nta_name` returns None for
every sensor and the neighbourhood row goes to an em-dash city-wide. There is no
check that can see this — `./scripts/check` has no network — so the signal is a
reader noticing that no instrument has a neighborhood any more.
"""

import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

NTA_2020 = "https://data.cityofnewyork.us/resource/9nt8-h7nd.json"

UA = {"User-Agent": "waterline/0.1 (NYC flood prototype; contact via repo)"}


def crosswalk() -> dict[str, str]:
    """2020 NTA code -> display name, from the DCP layer."""
    params = {"$select": "nta2020,ntaname", "$limit": 1000}
    req = urllib.request.Request(
        f"{NTA_2020}?{urllib.parse.urlencode(params)}", headers=UA
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        rows = json.load(r)
    return {
        row["nta2020"]: row["ntaname"]
        for row in rows
        if row.get("nta2020") and row.get("ntaname")
    }


def main() -> None:
    names = crosswalk()
    print(f"generated {len(names)} NTAs", file=sys.stderr)

    out = [
        '"""2020 NTA code -> display name. GENERATED — do not edit.',
        "",
        "    python3 scripts/nta.py > waterline/nta.py",
        "",
        "The code is an internal join key that arrives on FloodNet's Socrata",
        "mirror and means nothing to a reader, so nothing on the wire carries",
        "it. `api._nta_name` resolves it here and the NAME is what ships.",
        "",
        "⚠️ Source is the DCP 2020 NTA layer and nothing else. This file was",
        "carved out of `rodent_nta.py` on 2026-08-14 when the DOHMH",
        "rat-inspection feature was deleted; the names were never part of that",
        "data. See `scripts/nta.py` for why the vintage matters.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        f'AS_OF = "{datetime.now(timezone.utc):%Y-%m-%d}"',
        "",
        "NAMES: dict[str, str] = {",
    ]
    for code, name in sorted(names.items()):
        out.append(f"    {json.dumps(code)}: {json.dumps(name)},")
    out.append("}")
    out.append("")
    print("\n".join(out))


if __name__ == "__main__":
    main()
