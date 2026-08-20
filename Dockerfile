# Two stages, one runtime image. Node builds the UI and is then thrown away —
# what ships is python:3.11-slim with no Node in it, grown only by the size of
# the static export.

FROM node:22-slim AS ui
# node:22-slim, not alpine: Next's SWC binary is glibc-first.
WORKDIR /ui
# Manifests first, so a source-only change reuses the install layer.
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./

# ⚠️ **THE AUTH URL IS BAKED IN HERE, AT BUILD TIME, AND THERE IS NO SECOND
# CHANCE AT RUNTIME.**
#
# `output: "export"` compiles the UI to static files, so `NEXT_PUBLIC_*` is not
# read from the environment when the container starts — it is substituted into
# the bundle now, by this `RUN`. A container built without this arg produces a
# UI that can never sign anybody in, no matter what the runtime environment
# says, and restarting it with the variable set changes nothing.
#
#   docker build --build-arg NEXT_PUBLIC_NEON_AUTH_URL=https://…/auth .
#
# ⚠️ **This is the same value as the API's `NEON_AUTH_URL`, and it arrives by a
# completely different route** — that one is ordinary runtime env read by
# `config.py`. Two variables, one value, two mechanisms, and **nothing checks
# that they agree**. The failure when they disagree is a site nobody can enter:
# the API gates correctly and the UI cannot produce a token it will accept.
# `/api/healthz`'s `auth_required` is what a post-deploy `curl` reads to catch
# it, because `./scripts/check` cannot see a built image.
#
# Empty by default so a plain `docker build` still works. `page.tsx` renders
# "sign-in is not configured" in words rather than a button that does nothing.
ARG NEXT_PUBLIC_NEON_AUTH_URL=""
ENV NEXT_PUBLIC_NEON_AUTH_URL=$NEXT_PUBLIC_NEON_AUTH_URL

RUN npm run build
# → /ui/out : index.html, 404.html, _next/static/*, auth/*/index.html

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY schema.sql .
COPY waterline/ ./waterline/

# AFTER `COPY waterline/`, or that copy clobbers this one. api.py mounts this
# directory at "/" and 503s with instructions when it is absent, so a failed UI
# build cannot ship a half-built page — it ships no page.
COPY --from=ui /ui/out ./waterline/web/

EXPOSE 8080

# The API service, with the poll loop on a background thread when
# `POLL_IN_SERVICE=true` (the shipped shape — see `waterline/config.py`).
#
# `${PORT:-8080}` because most container hosts assign the port. ⚠️ The host has
# to keep this container RUNNING between requests: a platform that suspends CPU
# while no request is in flight stops the poll thread with no error at all, and
# the symptom is stale readings rather than a crash. `/api/healthz` reports
# `last_tick_at` so that is visible from outside.
#
# To run the poller as a separate scheduled process instead, override the
# command with `python -m waterline.poll once`. Nothing here assumes either
# shape.
CMD exec uvicorn waterline.api:app --host 0.0.0.0 --port ${PORT:-8080}

