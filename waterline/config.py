"""Settings. Everything comes from env; nothing secret is ever passed on argv."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""

    floodnet_api_base: str = ""
    floodnet_api_key: str = ""

    socrata_app_token: str = ""
    floodnet_sensors_dataset: str = "kb2e-tjy3"
    floodnet_events_dataset: str = ""

    watch_cameras: str = ""

    # ⚠️ **This string is WRITTEN INTO ROWS, and it is deliberately not
    # normalised.** Six writers stamp it (`db.record_observations`,
    # `record_gauge_readings`, `record_sensor_readings`, `create_sensor_episode`,
    # `record_poll_tick`, `record_nws_read`) and eleven readers filter
    # `where mode = %s` on it. Postgres compares strings exactly, so `live` and
    # `LIVE` are two disjoint datasets on one table.
    #
    # ⚠️ **Upper-casing it here would CAUSE that failure rather than fix it.** A
    # deployment that has been running `MODE=live` has every row stamped `live`;
    # normalise at load and the next restart filters all eleven reads on `LIVE`
    # and returns zero rows against a full table — the same silent empty map,
    # now triggered by a deploy, with no migration to point at. Doing it
    # properly means `update … set mode = upper(mode)` across four tables in the
    # same change, and `schema.sql` has no migrations by design.
    #
    # A `Literal` would be worse in a different direction: `mode` reaches the UI
    # as a provenance badge, and refusing to start is an empty map with no line
    # saying why.
    #
    # **What catches a wrong MODE instead** is `poll._log_mode_census` at poller
    # startup and the `db` line in `poll probe`, which FAILS when the table holds
    # rows and the configured mode holds none. That is the only place in the repo
    # that can see it — see `db.sensor_reading_modes`.
    #
    # ⚠️ `is_replay` below is the ONE case-insensitive comparison of this value
    # in the codebase, and it is a promise the other eleven sites do not keep.
    # It has no callers, so nothing depends on the inconsistency today.
    mode: str = "LIVE"
    replay_start: str = ""

    # Run the poll loop inside the API service on a background thread, rather
    # than as a separate scheduled process. This is the shipped shape, and the
    # reason is process state that a per-tick job would throw away every
    # minute: `rat.py`'s in-memory event buffer, `poll.LAST_TICK_AT` (which is
    # how `/api/healthz` reports the loop is running at all), and
    # `api._bucket_limited`'s rate buckets. The service has to be one
    # long-lived process for those three, independent of where it is hosted.
    poll_in_service: bool = False

    # --- thresholds -------------------------------------------------------
    # FloodNet's own definition of a flood event: sustained depth > 10mm.
    # We adopt it rather than inventing one.
    flood_event_mm: int = 10
    # ~6in. NYC curb height. Above this, water is leaving the roadway and
    # heading for sidewalks and basement stairwells.
    curb_height_mm: int = 150

    # Consecutive clear readings required before an event is allowed to end.
    # Hysteresis: the system escalates fast and stands down slowly.
    clear_readings_to_stand_down: int = 5

    # --- the sensor watch, and the first outbound egress in this repo -----
    # "log" (the default) renders every message, writes it to the log, and marks
    # the outbox row `skipped`. Nothing leaves the process. "smtp" actually
    # sends, through the standard library — no new dependency, and no
    # third-party origin on the alerting path.
    #
    # ⚠️ The whole feature is exercisable end to end on the default. That is
    # the design, not a stub: a credential is the only thing missing, and the
    # honest headline is that this ships as a watch that cannot yet notify.
    mail_transport: str = "log"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    # ⚠️ Defaults True, and an EMPTY value in `.env` cannot turn it off —
    # pydantic re-applies this default for a key that arrives empty. Write the
    # literal string `false` if it must be off.
    smtp_starttls: bool = True
    # Socket timeout in seconds. Bounded because the drain shares the 60s poll
    # tick — see `poll.MAIL_BUDGET_S`, which is sized against this number.
    smtp_timeout: int = 10

    # The absolute origin confirmation and manage links are built from, e.g.
    # https://fluud.example.com — no trailing slash.
    #
    # ⚠️ The process does not know its own URL and a confirmation link cannot be
    # relative. With this empty, subscribing still works and the link cannot be
    # rendered, so `mail.py` logs the token instead and `probe` says so loudly.
    # An unconfirmable subscription is a dead one and must be visible rather
    # than silently pending forever.
    public_base_url: str = ""

    # --- Neon Auth, and the third third-party origin ----------------------
    # The auth service's base URL, e.g. https://<project>.neon.tech/auth.
    # `auth.jwks_url()` derives the key set from this rather than taking a
    # second URL — two independently settable endpoints is one deploy away
    # from verifying tokens against a different project's keys.
    #
    # ⚠️ The BROWSER needs this too, and it gets it somewhere else entirely:
    # `NEXT_PUBLIC_NEON_AUTH_URL`, baked into the bundle at BUILD time by the
    # Docker UI stage. Two variables, one value, and nothing checks that they
    # agree. Setting only this one produces an API that gates correctly and a
    # UI that can never sign anybody in.
    neon_auth_url: str = ""

    # The expected `iss` claim, checked only when set.
    #
    # ⚠️ **Empty by default on purpose.** The plausible guess is that it equals
    # `neon_auth_url`, but that was never confirmed against a token this
    # project issued, and a wrong value here rejects EVERY session — an outage
    # that presents as "sign-in succeeds and then the app says 401". The
    # signature is already checked against this project's own JWKS, so a
    # foreign token fails regardless; this is defence in depth. Read `iss` off
    # a real token and set it verbatim. See `auth.verify`.
    neon_auth_issuer: str = ""

    # Whether `/api/*` actually requires a verified session.
    #
    # ⚠️ **Defaults False, deliberately, and it is the same argument as
    # `mail_transport="log"`**: the whole feature is exercisable without a
    # credential, and a deployment that wants the gate turns it on in one
    # place. `/api/healthz` reports which way this is set, because a deploy
    # that is wrong about it is otherwise silent in both directions.
    #
    # ⚠️ **Turning this on puts a third party in front of a flood map.**
    # `auth.verify` fails CLOSED, including when Neon is unreachable — so an
    # outage there is an outage here, for the instrument as well as the
    # account. The basemap is ~1,400 committed coordinates so the drawing
    # survives somebody else's bad day; this setting is what trades that away.
    require_auth: bool = False

    # --- the Neon control API, and the fourth server-side origin ----------
    # Credentials for `neon.suspend`, which asks Neon to scale our own compute
    # to zero the moment a scheduled run finds the city quiet — see that module
    # for why the idle tail, not the queries, is what this database costs.
    #
    # ⚠️ **BOTH empty by default, and empty means the feature is simply off**,
    # on `mail_transport="log"`'s rule: the whole app is exercisable without
    # this credential, and a deployment that wants it turns it on in one place.
    # Unset is not a broken deployment — it is a compute that times out on its
    # own after `suspend_timeout_seconds`, which is what happened before this
    # existed and still happens everywhere this is not set.
    #
    # ⚠️ **There is deliberately NO endpoint setting.** `neon.endpoint_id`
    # derives the compute from `DATABASE_URL`, on `auth.jwks_url()`'s argument:
    # a separately configured endpoint is one deploy away from suspending a
    # different database than the one this process is connected to.
    #
    # ⚠️ **This key can stop a database. Nothing on the alerting or display path
    # may ever read it**, and `neon.py` is the only module allowed to.
    neon_api_key: str = ""
    neon_project_id: str = ""

    # How many instruments one address may watch. A 300-sensor subscription is
    # a scraper, not a resident.
    watch_max_sensors: int = 10
    # The ceiling on the whole table. This is a prototype and the cap bounds the
    # blast radius of both a database dump and a mail-bombing script.
    watch_max_subscribers: int = 500

    @property
    def cameras(self) -> list[str]:
        return [c.strip() for c in self.watch_cameras.split(",") if c.strip()]

    @property
    def is_replay(self) -> bool:
        return self.mode.upper() == "REPLAY"


settings = Settings()
