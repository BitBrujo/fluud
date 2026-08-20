-- Fluud schema. Run once against DATABASE_URL.
--
-- Note what is NOT here: no frames, no images, no tracks, and no person record
-- beyond a self-supplied email address on a watch (see `subscribers` below and
-- LIMITATIONS.md §16, which states what that costs).
-- We persist readings. See LIMITATIONS.md.
--
-- ⚠️ **This file is `create … if not exists` and `db.init()` runs it on every
-- bootstrap. There is no migration and there is no `drop`** — a `drop` here
-- would destroy rows on every deploy. So a block removed from this file means
-- a fresh clone has no such table, and a deployed database keeps its existing
-- one, un-dropped and unread. Three such removals are marked below.

create table if not exists sensors (
  -- FloodNet's internal deployment_id ('curly_orange_shrimp'). Joins depth_data.
  sensor_id     text primary key,
  -- The public slug ('M-avenue-c-e-20th-st-2zpcro'). Matches the Socrata mirror.
  slug          text,
  name          text,
  lat           double precision not null,
  lon           double precision not null,
  deployed_at   timestamptz,
  status        text not null default 'unknown',
  -- FloodNet's own call on whether this deployment may raise a public alarm.
  -- We honour it rather than overriding it. See LIMITATIONS.md §12.
  alert_visible boolean not null default false,
  ground_height_mm integer,
  -- Neighborhood Tabulation Area. This is the finest granularity at which we
  -- are willing to report exposure. See LIMITATIONS.md §3.
  nta           text,
  borough       text,
  -- Tidal sensors see coastal surge; the rest see stormwater. Different
  -- phenomenon, different time constant, different warning.
  tidal         boolean not null default false
);

create table if not exists cameras (
  camera_id     text primary key,
  name          text not null,
  lat           double precision not null,
  lon           double precision not null,
  image_url     text not null
);

-- DOT's own `area` string for this camera. Five values across 968 rows.
--
-- ⚠️ This MUST be an `alter`, not a column in the `create table if not exists`
-- above — same argument as `observations.depth_plausible` further down. That
-- block is a no-op against a database that already has the table, so a column
-- added inside it would exist on a fresh clone and silently NOT exist in
-- production.
--
-- Nullable, no default, no backfill. ⚠️ **Null means the registry has not been
-- re-bootstrapped since this column landed** — `poll.tick` never touches the
-- `cameras` table, so `python -m waterline.poll bootstrap` is the only thing
-- that fills it. It never means *outside the city*, and the UI has to be able
-- to say which it is looking at rather than drawing an empty map.
alter table cameras
  add column if not exists borough text;

create table if not exists pairs (
  camera_id     text primary key references cameras(camera_id),
  sensor_id     text not null references sensors(sensor_id),
  distance_m    double precision not null
);

-- One row per watched camera per tick. The only number here is the paired
-- FloodNet sensor's depth — a camera measures nothing. `observed_at` is OUR
-- poller's clock, which is what `staleness.freshnessOf` reads and what gives
-- `/api/history/{camera_id}` and the camera peak queries a cadence.
--
-- ⚠️ `severity` and `vision_confidence` were here and are GONE. They came from
-- a water-segmentation model over the frame; that layer was deleted. Both
-- carried defaults, so an insert that omits them still succeeds against a
-- database that still has the columns.
create table if not exists observations (
  id                bigserial primary key,
  camera_id         text not null,
  observed_at       timestamptz not null,
  depth_mm          double precision,
  sensor_id         text,
  nws_active        boolean not null default false,
  mode              text not null default 'LIVE',
  unique (camera_id, observed_at, mode)
);

create index if not exists observations_cam_time
  on observations (camera_id, observed_at desc);

-- Whether the depth on this observation was physically believable, carried
-- through from the reading that produced it. See floodnet.IMPLAUSIBLE_MIN_MM /
-- IMPLAUSIBLE_MM. True where there is no depth at all: absence has no
-- plausibility to doubt.
--
-- ⚠️ This MUST be an `alter`, not a column in the `create table if not exists`
-- above. That block is a no-op against a database that already has the table,
-- so a column added inside it would exist on a fresh clone and silently NOT
-- exist in production — the worst of both. `db.init()` sends this whole file
-- through one `c.execute()`, which psycopg3 puts on the simple-query path, so
-- several statements in one string are fine.
alter table observations
  add column if not exists depth_plausible boolean not null default true;

-- ⚠️ An `alter` adding `vision_estimate_cm` was here and is GONE with the rest
-- of the water-segmentation layer. Nullable, so nothing breaks in a database
-- that still has the column.

-- ⚠️ The `alerts` table and its `alerts_open` index were here and are GONE.
-- The on-page alert system was unwired: nothing opens an episode, nothing
-- reads one, and `escalation.py` is dormant. A deployed database keeps its
-- rows, un-dropped and unread.

-- Harbor and stream gauges — NOAA CO-OPS and USGS. The baseline a street
-- reading is interpreted against: 40mm on a block during a spring high tide is
-- a different event from 40mm on a falling tide, and `sensors.tidal` says which
-- sensors that distinction applies to.
--
-- Note there is no `gauges` registry table to match `sensors` and `cameras`.
-- The site list is curated by hand rather than discovered from an upstream
-- index, so it lives in `gauges.GAUGES` where the reasoning can sit beside it;
-- a second copy in Postgres would be a second thing to disagree.
create table if not exists gauge_readings (
  id          bigserial primary key,
  gauge_id    text not null,
  observed_at timestamptz not null,
  -- Feet. NOAA CO-OPS is referenced to MLLW; each USGS gage height is
  -- referenced to that site's own datum. NOT comparable between gauges — see
  -- the derivation comment in gauges.py before using this number for anything.
  level_ft    double precision not null,
  mode        text not null default 'LIVE',
  unique (gauge_id, observed_at, mode)
);

create index if not exists gauge_readings_time
  on gauge_readings (gauge_id, observed_at desc);

-- Every FloodNet deployment's own depth, not just the ~27 paired to a watched
-- camera. `observations` answers "what is happening at this camera"; this
-- answers "what is this instrument reporting", and the city has 425 of them
-- against 27 of those.
--
-- Shaped deliberately like `gauge_readings`: append-only, Postgres as the
-- single source of truth, no second in-process cache — so the sensor list a
-- request handler serves and the depths the poll thread fused came from the
-- same rows, and both survive a restart.
--
-- ⚠️ `depth_mm` is `not null`, and that is the honesty rule in DDL form: NO ROW
-- MEANS NO READING. A sensor that has never reported, or has stopped, is an
-- absent row — never a row with a null in it, and never a row with a zero in
-- it. `floodnet._first_num` used to return 0 for a depth-less upstream row,
-- which is exactly the fabrication this column shape refuses to store.
--
-- No foreign key to `sensors`, for the same reason `observations` has none: a
-- reading is a fact that was observed, and it must not become unstorable
-- because the registry has not been re-bootstrapped yet.
create table if not exists sensor_readings (
  id             bigserial primary key,
  sensor_id      text not null,
  observed_at    timestamptz not null,
  -- Millimetres above the roadway. FloodNet's `depth_filt_mm` where it exists —
  -- the fully processed value — falling back through proc to raw.
  depth_mm       double precision not null,
  -- FloodNet's own flood determination for this reading, not ours.
  flood_detected boolean not null default false,
  -- False when the depth is outside what a street rangefinder can physically
  -- support, i.e. the instrument has faulted. The number is still stored: this
  -- is a claim about the instrument, not permission to discard the reading.
  plausible      boolean not null default true,
  mode           text not null default 'LIVE',
  unique (sensor_id, observed_at, mode)
);

create index if not exists sensor_readings_time
  on sensor_readings (sensor_id, observed_at desc);

-- The poller's own heartbeat, in Postgres rather than in a module global.
--
-- ⚠️ **This exists because `poll.LAST_TICK_AT` is correct in exactly one
-- deployment shape.** See the `LAST_COVERAGE` tombstone in `poll.py`: a
-- poll-module global is only ever populated in a process running the loop, so
-- on an API-only instance it reads as "never ticked" forever, and something
-- downstream turns that into a claim about a perfectly healthy deployment.
-- Every process reads the same row here, and it survives a restart.
--
-- One row per mode, upserted. **Not append-only**: 1440 rows a day per mode
-- would need its own prune clock, and no surface reads tick history.
--
-- ⚠️ **Why a table and not `max(observed_at)` over `sensor_readings`.** Three
-- reasons, and this is the decision somebody will try to undo:
--
--  1. `sensor_readings.observed_at` is **FloodNet's publication clock**. Judging
--     our loop against somebody else's clock is the mistake `nws.ts`'s
--     `NWS_COLD_AFTER_S` docblock refuses to repeat.
--  2. The insert is `on conflict … do nothing`, so a tick that stored zero and a
--     tick that stored 390 leave that maximum identical whenever upstream is
--     frozen. The question here is what OUR tick did.
--  3. `sensor_readings_time` above leads on `sensor_id`, so a per-mode maximum
--     would need a `(mode, observed_at desc)` index — permanent write
--     amplification on ~560k inserts a day, on the ingest path.
create table if not exists poll_ticks (
  mode           text primary key,
  -- OUR clock, stamped at the end of every iteration including one that raised.
  -- The same question `LAST_TICK_AT` answers: is the loop running.
  tick_at        timestamptz not null,
  -- Whether that iteration completed and the sensor write came back clean.
  tick_ok        boolean not null default true,
  -- How many readings the last tick handed to the insert. Zero separates a
  -- registry read that failed, a depth fetch that failed, and an upstream that
  -- answered with nothing — see `_sensor_snapshot`'s four exits.
  readings       integer not null default 0,
  -- How many rows that insert actually added. `on conflict do nothing` means
  -- this is zero whenever FloodNet has published nothing new, which is a real
  -- state and a different one from a write that failed.
  stored         integer not null default 0,
  -- The last `tick_at` at which `stored` was above zero. ⚠️ **THE field**: the
  -- last tick that wrote. A loop that ticks forever and stores nothing moves
  -- `tick_at` every minute and leaves this frozen, which is the one failure
  -- `LAST_TICK_AT` structurally cannot report.
  last_store_at  timestamptz
);

-- What NWS last said, in Postgres for `poll_ticks`' reason exactly.
--
-- ⚠️ **This exists because `poll.LAST_NWS` was correct in exactly one
-- deployment shape**, and it is the third time that lesson has been paid for —
-- see the `LAST_COVERAGE` tombstone in `poll.py`, then `poll_ticks` above, then
-- this. A poll-module global is only ever populated in a process running the
-- loop, so with the poller on a schedule and the API in its own container the
-- gauges panel claimed forever that NWS had never been read, on a perfectly
-- healthy deployment. Whichever process polls writes this row; whichever
-- process serves the request reads it.
--
-- ⚠️ **THREE columns because there are three states**, and collapsing any two
-- puts the panel back where `except: return []` left it. See `poll._record_nws`:
-- `attempted_at` moves on every try, `checked_at` and `alerts` move only on a
-- SUCCESSFUL read. That is what lets the page say *we could not ask* rather than
-- *nothing is active* — opposite claims, and a reader in a hurricane is owed the
-- difference.
create table if not exists nws_reads (
  mode          text primary key,
  -- Every attempt, successful or not. `reachable` is derived by comparing this
  -- to `checked_at` — equal means the last attempt was the last success.
  attempted_at  timestamptz not null,
  -- The last attempt that actually came back. Null until one has.
  checked_at    timestamptz,
  -- The alert payload from that successful read, verbatim.
  --
  -- ⚠️ **The only jsonb in this schema, and the exception is argued rather than
  -- convenient.** Every other table here is flat columns because every other
  -- table is queried into. Nothing joins, filters or orders on what is in here:
  -- it is read back whole, handed to `WeatherAlert`, and rendered. And
  -- `WeatherAlert` is `Lenient` on purpose — these are someone else's bytes and
  -- extra fields are KEPT — so a column-per-field table would silently discard
  -- exactly what that model was written to preserve.
  alerts        jsonb not null default '[]'::jsonb
);

-- ⚠️ The `calibration` table was here and is GONE. It collected camera frames
-- labelled by a co-located sensor's depth, as training data for the
-- water-segmentation model. That model was deleted and nothing ever read the
-- table.

-- --- the sensor watch ------------------------------------------------------
-- Everything below exists to tell a reader about an instrument when they are
-- not looking at the page. It is the only part of this database that knows
-- anything about a person, and the four tables are ordered from the one that
-- does to the ones that only know about water.

-- A reader who asked to be told about specific instruments. This is the ONLY
-- person record in this database and it is deliberately the thinnest one that
-- can deliver mail: no name, no IP, no user-agent, no referrer, no open or
-- click tracking, and no address of any kind. What a reader is interested in is
-- expressed as sensor ids, which are instrument locations FloodNet already
-- publishes — never the reader's own. See LIMITATIONS.md §16.
create table if not exists subscribers (
  id            bigserial primary key,
  email         text not null unique,
  lang          text not null default 'en',
  confirm_token text not null unique,
  manage_token  text not null unique,
  -- Null until the address answers its own confirmation. Nothing but that one
  -- confirmation is ever sent to a row where this is null — the double opt-in
  -- is the real abuse control on an unauthenticated POST, not the rate limit.
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Notification preferences — the wizard's three settings, global per
-- subscriber. `min_level` is the trigger (the lowest level worth a message),
-- `frequency` is `every` (each transition) or `first` (one message per
-- episode), and the quiet pair is a half-open [start, end) window of
-- America/New_York hours during which watch- and warning-level messages are
-- suppressed. ⚠️ EMERGENCY ignores all three — `notify.allowed`, and
-- `check_notify.py` asserts it over the whole grid. Suppressed means never
-- queued: a delayed warning is the stale-replay rule's failure by appointment, and
-- `mail.MAX_AGE_S` would expire it anyway.
--
-- ⚠️ `alter`, not columns in the `create table` above — that block is a no-op
-- against a database that already has the table (see `observations`).
alter table subscribers
  add column if not exists min_level   text not null default 'watch',
  add column if not exists frequency   text not null default 'every',
  add column if not exists quiet_start smallint,
  add column if not exists quiet_end   smallint;

-- Which instruments a subscriber asked about. `on delete cascade` is the
-- unsubscribe path: one delete of the parent row removes the address, the
-- interests and every queued message together.
--
-- No foreign key to `sensors`, for `sensor_readings`' reason inverted: the
-- registry is rebuilt by `bootstrap` and a subscription must not become
-- unstorable because a deployment was renamed upstream between the read that
-- offered it and the write that accepted it. The `alert_permitted` check that
-- decides which ids may be stored at all runs in Python — see api.py, and
-- the alert-permitted rule.
create table if not exists subscriptions (
  subscriber_id bigint not null references subscribers(id) on delete cascade,
  sensor_id     text not null,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, sensor_id)
);

-- Per-instrument overrides of the two overridable preferences. Null means
-- "use the subscriber's global" — `notify.effective` resolves the chain in
-- Python, one layer at a time. Quiet hours have no per-instrument form on
-- purpose: they are a fact about the reader's day, not about an instrument.
alter table subscriptions
  add column if not exists min_level text,
  add column if not exists frequency text;

-- Which CAMERAS a subscriber asked about, shaped exactly like `subscriptions`
-- and for the same reasons — cascade on delete, no foreign key to `cameras`,
-- overrides nullable.
--
-- ⚠️ **DORMANT.** A camera subscription was mail repeating the `alerts`
-- episode a camera had already published on the page. That path was unwired
-- and the `alerts` table went with it, so nothing writes here and nothing
-- reads here: `/api/watch/subscribe` and the `subscription` PUT both refuse
-- `camera_ids` with a 400. The table stays so existing rows are not destroyed
-- and re-wiring is one commit.
create table if not exists camera_subscriptions (
  subscriber_id bigint not null references subscribers(id) on delete cascade,
  camera_id     text not null,
  min_level     text,
  frequency     text,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, camera_id)
);

-- One row per sensor watch episode, and the ONLY live state machine in this
-- database now that `alerts` is gone. `level` is monotonic within an episode
-- and closing requires a sustained run of clear readings. Keyed on the SENSOR,
-- not on the subscriber — the state machine is about the water, so a hundred
-- readers watching one instrument share one episode and cannot be told
-- different stories about it.
create table if not exists sensor_episodes (
  id            bigserial primary key,
  sensor_id     text not null,
  level         text not null,
  opened_at     timestamptz not null,
  closed_at     timestamptz,
  peak_depth_mm double precision,
  clear_streak  int not null default 0,
  mode          text not null default 'LIVE'
);

create index if not exists sensor_episodes_open
  on sensor_episodes (sensor_id, mode) where closed_at is null;

-- Rendered messages waiting for a transport. The body is stored as sent rather
-- than re-rendered at delivery: what went out is a fact, and re-templating it
-- later against different readings would rewrite history.
create table if not exists outbox (
  id            bigserial primary key,
  subscriber_id bigint not null references subscribers(id) on delete cascade,
  -- ⚠️ Four kinds as of the camera watch. `standdown` and `silence` were
  -- removed on 2026-08-05: the stand-down became nothing at all (the episode
  -- still closes in `sensor_episodes`) and silence became a line on the watch
  -- panel, not a message. Old rows of either kind may still exist and are left
  -- alone — an outbox row is the record that somebody was written to, and
  -- rewriting it would make history agree with the current code rather than
  -- with the inbox.
  --
  -- ⚠️ `camera` is DORMANT and kept for the same reason as its table: old rows
  -- are the record that somebody was written to. Nothing queues one now.
  --
  -- It was never `watch` with a different name, and that is worth keeping
  -- written down before anybody merges them on a re-wire. For a `camera` row
  -- `episode_id` held `alerts.id`; for a `watch` row it holds
  -- `sensor_episodes.id` — two independent bigserials that both start at 1.
  -- Under one kind, a subscriber holding sensor episode N and camera alert N
  -- at the same level collides in `outbox_once` and the second message is
  -- eaten by `do nothing`, with nothing anywhere reporting a failure.
  kind          text not null,          -- confirm | resend | watch | camera
  sensor_id     text,
  episode_id    bigint,                 -- sensor_episodes.id (or, on a dormant
                                        -- `camera` row, the old alerts.id)
  -- ⚠️ Part of the idempotency key below, and it is there because leaving it
  -- out is a silently DROPPED WARNING. See that index.
  level         text not null default 'clear',
  subject       text not null,
  body          text not null,
  queued_at     timestamptz not null,
  sent_at       timestamptz,
  -- queued | sending | sent | skipped | expired | failed. `sending` is a claim
  -- held by a drain; see `db.pending_outbox`, which takes rows rather than
  -- reading them, and `db.requeue_stalled`, which frees ones a dead process
  -- left behind.
  status        text not null default 'queued',
  attempts      int not null default 0
);

-- The camera an old `camera` message was about. Dormant with that kind. A
-- column beside `sensor_id` rather than a value inside it — a DOT camera id in
-- a column named for FloodNet deployments is the identifier confusion
-- `waterline/CLAUDE.md` warns about, stored. ⚠️ `alter`, for
-- `observations.depth_plausible`'s reason.
alter table outbox
  add column if not exists camera_id text;

-- Idempotency for episode-driven mail, which must never duplicate. Partial
-- because `confirm` has no episode and IS allowed to be re-sent; a plain unique
-- over nullable columns would not constrain it anyway, since Postgres treats
-- NULLs as distinct.
--
-- ⚠️ **`level` is in this key, and leaving it out is a real bug rather than a
-- theoretical one.** Without it the key is (subscriber, kind, episode) and an
-- episode has exactly one `watch` message for its whole life — so a subscriber
-- told "water on the street" can never be told it went above the curb. The
-- escalation is written, the episode is correct, `do nothing` eats the message,
-- and nothing anywhere reports a failure. That is the episode escalating
-- monotonically with nobody on the other end of it, and it was caught by
-- driving a real episode through and noticing a gap in the id sequence.
--
-- With `level` in the key the property that is actually wanted still holds: one
-- message per subscriber per episode per level, so a tick that runs twice at
-- the same level is still a no-op, and a genuine escalation still gets through.
create unique index if not exists outbox_once
  on outbox (subscriber_id, kind, episode_id, level) where episode_id is not null;

create index if not exists outbox_pending
  on outbox (queued_at) where status = 'queued';
