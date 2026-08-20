# Fluud

A hyperlocal flood watch for New York City.

Fluud reads the city's street-level water sensors, draws them on a map beside
the city's traffic cameras, and emails you when the water comes up on a corner
you picked.

![The Fluud landing page](docs/screenshots/landing.webp)

![The map](docs/screenshots/map.webp)

An experiment by Hypno Labs LLC.

## What it does

- **Reads ~425 FloodNet depth sensors.** Each one measures water depth in
  millimetres, about once a minute. The data is public.
- **Draws ~970 DOT traffic cameras.** Where a camera and a sensor watch the same
  corner, the camera's view is labelled with that sensor's depth.
- **Emails you when a sensor changes state.** You pick the corners. You pick the
  level. You pick the quiet hours.

Both depth thresholds are borrowed. **10 mm** is FloodNet's own flood-event
definition. **150 mm** is roughly NYC curb height.

A camera never produces a number. It is a view. The only depth on a camera card
comes from its paired sensor.

## Run your own

### What you need

| | |
|---|---|
| **Postgres** | Any recent Postgres. No extensions. [Neon](https://neon.tech) works out of the box and is what this runs on. |
| **Python 3.11** | For the API and the poller. |
| **Node 20+** | To build the UI. Nothing runs Node in production. |
| **API keys** | None. FloodNet, NWS, NOAA, USGS and the city's open data are all public. |

Two services are separate from the above. **[Neon Auth](https://neon.tech/docs/neon-auth/overview)**
is what the map's sign-in gate uses, and you need it to reach `/map` at all —
see the warning in step 3. **SMTP** is genuinely optional; without it the email
watch runs end to end and writes every message to the log instead.

### 1. Get the code and a database

```bash
git clone <your-fork> fluud && cd fluud
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Put your connection string in `.env`:

```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
```

`schema.sql` is the only place schema lives. It creates 15 tables and needs no
extensions. Nothing else in the code issues DDL.

### 2. Create the tables and load the city

```bash
python -m waterline.poll bootstrap
```

This applies `schema.sql`, then loads the FloodNet sensors, the DOT camera
registry, and the camera-to-sensor pairing. **Run it once against a new
database.** A deployment that skips it answers `/api/watch/*` with a 500 while
the rest of the app looks healthy.

Check what came back:

```bash
python -m waterline.poll probe
```

`probe` is the authority on the sensor and camera counts. It also says whether
your auth URL resolves.

### 3. Build the UI

```bash
cd web && npm ci
npm run prod:local
```

That builds a static export and stages it into `waterline/web/`. Until you run
it, `/` answers 503 with the command to run. The API works normally.

> **⚠️ If you want the map, set `NEXT_PUBLIC_NEON_AUTH_URL` at build time.**
> The map is wrapped in a sign-in gate. Without that variable the build has no
> way to sign anyone in, and `/map` renders "Sign-in is not configured". The
> value is baked into the bundle, so a rebuild is the only way to change it.
>
> ```bash
> cd web && NEXT_PUBLIC_NEON_AUTH_URL=https://…/auth npm run prod:local
> ```

### 4. Run it

```bash
POLL_IN_SERVICE=true uvicorn waterline.api:app --port 8080
```

Open `http://localhost:8080`.

> **⚠️ `POLL_IN_SERVICE` defaults to `false`.** Without it the API serves every
> route and collects nothing. You get 425 sensor rows with a null depth,
> indefinitely, on a service reporting healthy.

Check that it is collecting:

```bash
curl localhost:8080/api/healthz
```

`writes.tick_at` says the loop is running. `writes.last_store_at` says it is
storing. Those are different questions.

### Settings worth knowing

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | — | The only one with no working default. |
| `POLL_IN_SERVICE` | `false` | Runs the poll loop inside the API process. |
| `REQUIRE_AUTH` | `false` | Locks `/api/*` behind a Neon Auth token. |
| `NEON_AUTH_URL` | empty | Server side of the sign-in gate. |
| `NEXT_PUBLIC_NEON_AUTH_URL` | empty | Browser side. Baked in at **build** time. |
| `WATCH_CAMERAS` | 27 ids | Which cameras get frames collected. |
| `MODE` | `LIVE` | Stamped into every row. Compared exactly. |
| `MAIL_TRANSPORT` | `log` | `smtp` to actually send. |
| `PUBLIC_BASE_URL` | empty | The origin every confirm and unsubscribe link is built from. |

Two of these bite quietly.

**`MODE` is compared exactly.** Eleven queries filter on it. Writing `live` on
one process and `LIVE` on another gives you two disjoint datasets — a poller
filling the table while every page reads empty.

**`PUBLIC_BASE_URL` is whatever queued the message.** A local process pointed at
a shared database will mail real people links to `127.0.0.1`.

### Email (optional)

The shipped default renders every message to the log and sends nothing. That
means the whole watch path runs with no provider and no credential.

To send for real, set `MAIL_TRANSPORT=smtp` and the six `SMTP_*` variables.
`mail._send` is stdlib `smtplib`, so any provider with an SMTP interface works.
`.env.example` carries Resend as the worked example.

Three things to get right: port 587, a sending domain whose DNS you control, and
**open and click tracking turned off**. The links carry bearer tokens and a
click-tracking redirector would rewrite them through a third party.

> **⚠️ One loop per database.** `poll.tick` drains the outbox and claims rows
> with `skip locked`. Two processes against one database is a race. A loop with
> no transport marks what it wins `skipped`, which is terminal — the message is
> gone, not delayed.

### Deploy

The `Dockerfile` is a two-stage build and needs no arguments. Node builds the
UI and is thrown away. What ships is `python:3.11-slim` with the static export
inside it.

This runs on Railway as **two services**:

1. **The web service.** The API, with `POLL_IN_SERVICE=false`. It stays awake.
2. **A cron service** on `*/15`, running `python -m waterline.poll window`.

The split is about cost. A 60-second loop means a serverless Postgres can never
autosuspend. This database was awake 86.8% of wall-clock time before the split.
A run that exits when the city is quiet lets it sleep, and `poll._storm`
escalates back to a 60-second tick when any witness says the weather turned.

The cron service needs the **full** environment. `MODE` must match the web
service exactly, and `WATCH_CAMERAS` must be populated.

After deploying, check it from outside:

```bash
curl $URL/api/healthz
```

> **⚠️ A health check alone cannot tell you the new build is serving.**
> `polling: true` with a fresh tick is equally true of the container you are
> replacing. Name something only the new build has.

## Checks

```bash
./scripts/check                          # contract checks, then the UI tests
cd web && npm run typecheck && npm run build
```

The runner does not typecheck the web. A wire mismatch passes it and fails
`next build`.

## Data sources

| Source | Gives | Access |
|---|---|---|
| [FloodNet](https://www.floodnet.nyc/methodology) | Depth in mm | Public GraphQL, no key |
| [NYC DOT cameras](https://webcams.nyctmc.org/) | Camera registry and frames | Public JSON |
| [NWS](https://api.weather.gov/) | Flood watches and warnings | Public, no key |
| [NOAA CO-OPS](https://api.tidesandcurrents.noaa.gov/) | The Battery tide gauge | Public, no key |
| [USGS NWIS](https://waterservices.usgs.gov/) | Four in-city stream gauges | Public, no key |
| NYC Open Data | Sensor metadata, neighbourhood crosswalk | Socrata |
| [NY State DEC](https://data.ny.gov/) | Sewer outfall locations | Socrata |
| [GeoSearch](https://geosearch.planninglabs.nyc/) | Address to coordinate | Public, no key |

Three of those are fetched by hand and committed: the basemap, the
neighbourhood crosswalk and the sewer outfalls. The map is drawn from ~1,400
committed coordinates. There is no tile server and no map library, so it still
draws when the venue wifi does not.

A typed address is geocoded in the browser. It reaches no Fluud endpoint in any
form and is never stored.

## How it behaves

A few rules the code is built around.

- **Never safe.** No surface says anywhere is clear. Empty space on the map is
  unobserved.
- **Stale leaves the scale.** An old reading comes off the colour band rather
  than being downgraded. The digits stay.
- **Never a bare threshold.** A depth outside the plausible band needs a second
  witness before it can raise anything.
- **Peaks, never averages.** A mean over a day across a two-hour flood renders
  that flood as a small number.
- **Templated copy.** Every warning sentence is written by hand in `agent.py`.
  No language model writes any of it.
- **Escalates fast, stands down slowly.** Closing a watch takes several
  consecutive clear readings.

What it cannot promise: silence is ambiguous. A subscriber who hears nothing
cannot tell "no water" from "the poller froze".

## Read next

- **[LIMITATIONS.md](LIMITATIONS.md)** — what this instrument cannot see and
  will not do.
- **[MEASUREMENTS.md](MEASUREMENTS.md)** — every number that came from running
  it, with a date on it.
- **[CLAUDE.md](CLAUDE.md)** — the map of the repo and the hard invariants.

## History

This repo starts at one commit. It was built privately over 116 of them and
squashed before it was made public, so `git blame` will not tell you why a line
is the way it is.

**The reasons are written down instead.** `CLAUDE.md` is the map of the repo and
holds the invariants, ten scoped files sit beside the code they bind, and
`MEASUREMENTS.md` dates every figure that came from running it. Deletions are
recorded where the thing used to be. That was the habit while the history
existed; it is the whole record now.

## License

MIT. The artwork is not covered.
