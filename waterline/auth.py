"""Neon Auth session verification. The real gate.

⚠️ **`RequireSession` in the UI is a curtain; this is the lock.** The Next
export is static files served by `StaticFiles` to anybody who asks, so every
component in the bundle is readable by an unauthenticated reader. What decides
whether a request gets *data* is this module and nothing else.

**How a session crosses the origin boundary.** The browser's Neon Auth session
cookie is scoped to Neon's origin, not ours, so our API never sees it. The
client asks the SDK for a signed JWT (`getJWTToken` in `lib/auth-client.ts`)
and sends it as `Authorization: Bearer …`. This module verifies that token's
signature against Neon Auth's published JWKS.

⚠️ **Nothing here trusts a claim it did not verify cryptographically.** In
particular the token is never decoded with `verify_signature=False` to "just
read the email" — an unverified JWT is a string the client wrote, and reading
an identity out of one is the whole of the vulnerability.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from .config import settings

log = logging.getLogger(__name__)

# How long a fetched JWKS is reused before it is re-fetched. Neon rotates
# signing keys, and a key we have never seen is handled by an immediate refetch
# (see `_signing_key`) rather than by waiting this out — so this bound only
# governs how long a REVOKED key stays acceptable.
JWKS_TTL_S = 600

# Bound on the JWKS fetch. This sits on the request path for the first request
# after a cold start, so an unbounded timeout is a hung API rather than a slow
# one.
JWKS_TIMEOUT_S = 5


@dataclass(frozen=True)
class Session:
    """A verified session. Nothing in here was taken on trust."""

    # Neon Auth's stable user id — Better Auth's `sub`. This is the identifier
    # to join on, NOT the email: an address can change upstream and a row keyed
    # on it would silently orphan.
    user_id: str
    # Verified only when the provider said so. ⚠️ Google's `email_verified` is
    # the reason a Google sign-in may be treated as proof of the mailbox at
    # all; an unverified address is not.
    email: str | None
    email_verified: bool


class _Jwks:
    """A JWKS client with a TTL, rebuilt rather than mutated.

    `PyJWKClient` does its own caching, but it has no notion of the key set
    being *replaced* — so a rotated key would keep failing until the process
    restarted. Holding the client behind a timestamp and dropping it wholesale
    is the cheapest correct version of that.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client: PyJWKClient | None = None
        self._fetched_at = 0.0
        self._url = ""

    def client(self, url: str) -> PyJWKClient:
        now = time.monotonic()
        with self._lock:
            stale = now - self._fetched_at > JWKS_TTL_S
            if self._client is None or stale or self._url != url:
                self._client = PyJWKClient(url, timeout=JWKS_TIMEOUT_S)
                self._fetched_at = now
                self._url = url
            return self._client

    def invalidate(self) -> None:
        with self._lock:
            self._client = None


_jwks = _Jwks()


def jwks_url() -> str:
    """Where the signing keys are published.

    ⚠️ **Derived from `NEON_AUTH_URL` rather than configured separately, on
    purpose.** Two independently settable URLs is one deploy away from
    verifying tokens against a *different* project's keys than the one that
    issued them — which fails open in the worst possible way: every token
    rejected, or worse, a token from another tenant accepted. One value, one
    project.
    """
    base = settings.neon_auth_url.rstrip("/")
    return f"{base}/.well-known/jwks.json"


def _signing_key(token: str):
    url = jwks_url()
    try:
        return _jwks.client(url).get_signing_key_from_jwt(token)
    except Exception:
        # An unknown `kid` is the normal shape of a key rotation, so give it
        # exactly one forced refetch before calling the token bad. Without
        # this, every session in flight fails until the TTL expires.
        _jwks.invalidate()
        return _jwks.client(url).get_signing_key_from_jwt(token)


def verify(token: str) -> Session:
    """Verify a bearer token, or raise 401.

    ⚠️ **This FAILS CLOSED, including when Neon itself is unreachable**, and
    that is the part to understand before relying on it. A JWKS fetch that
    times out means no request is served — the whole instrument, not one
    feature. That is the correct behaviour for an auth check and it is also
    exactly the cost `page.tsx` records: a third-party origin now sits in front
    of a flood map whose basemap is committed to this repo precisely so the
    drawing survives somebody else's outage. The lever is
    `settings.require_auth`, not a fallback here — an auth check that lets
    requests through when it cannot verify them is not an auth check.
    """
    try:
        key = _signing_key(token)
    except jwt.InvalidTokenError as e:
        # ⚠️ **A malformed token is OUR CALLER's problem and must not be
        # reported as the auth service's.** `get_signing_key_from_jwt` parses
        # the header before it fetches anything, so "Not enough segments"
        # arrives down the same path as a dead JWKS host — and blaming Neon for
        # a string this client sent is the same misattribution `geosearch.ts`
        # refuses when it insists a failed lookup is *about the lookup, not
        # about the water*. Distinguishing them costs one except clause.
        log.warning("jwt: malformed token: %s", e)
        raise HTTPException(status_code=401, detail="Invalid session.") from e
    except Exception as e:  # noqa: BLE001 — every remaining failure is a 401
        log.warning("jwks: could not resolve a signing key: %s", e)
        raise HTTPException(
            status_code=401,
            detail="Could not verify your session — the auth service did not answer.",
        ) from e

    try:
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256", "ES256", "EdDSA"],
            # ⚠️ Audience is NOT checked: Neon issues these for the project and
            # this API is the only consumer.
            options={"verify_aud": False, "require": ["exp", "sub"]},
            # ⚠️ **`iss` is checked only when NEON_AUTH_ISSUER is set, and the
            # empty default is an admission rather than an oversight.**
            #
            # The obvious guess is that `iss` equals `NEON_AUTH_URL`. That was
            # never verified against a token this project actually issued, and
            # **guessing wrong here rejects every session** — a total outage
            # that looks like "sign-in works but the app says 401", which is a
            # genuinely hard thing to diagnose from the front end.
            #
            # What is NOT weakened by leaving it off: the signature is checked
            # against a key set fetched from this project's own auth URL, so a
            # token from another tenant fails on the signature regardless. The
            # `iss` check is defence in depth on top of that, not the thing
            # holding the door.
            #
            # **Set it once you have read `iss` off a real token** — decode the
            # payload of what `getJWTToken()` returns and copy the claim
            # verbatim. That is the hardening step, and it is deliberately a
            # step somebody takes with evidence rather than a default somebody
            # inherits from a guess.
            issuer=settings.neon_auth_issuer or None,
        )
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail="Your session has expired.") from e
    except jwt.InvalidTokenError as e:
        log.warning("jwt: rejected a token: %s", e)
        raise HTTPException(status_code=401, detail="Invalid session.") from e

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid session.")

    return Session(
        user_id=str(sub),
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified", False)),
    )


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def require_session(authorization: str | None = Header(default=None)) -> Session | None:
    """FastAPI dependency. Returns the session, or raises 401.

    ⚠️ **Returns `None` — permitting the request — when `require_auth` is
    off**, which is the shipped default. That is not a security hole waiting to
    be found; it is the same shape as `mail_transport="log"`. The whole feature
    is exercisable without a credential, and a deployment that wants the gate
    turns it on in one place. `/api/healthz` reports which way it is set so a
    deploy cannot be wrong about it silently.
    """
    if not settings.require_auth:
        return None

    if not settings.neon_auth_url:
        # ⚠️ Configured to require auth with nothing to verify against. Refuse
        # rather than serve — this is a misconfiguration, and the failure mode
        # of guessing is an unauthenticated API that believes it is gated.
        log.error("require_auth is on but NEON_AUTH_URL is empty — refusing all requests")
        raise HTTPException(
            status_code=503,
            detail="Authentication is required but not configured on this server.",
        )

    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to read the instruments.")

    return verify(token)


def probe() -> tuple[bool, str]:
    """Is the auth configuration actually usable? For `poll probe`.

    Fetches the JWKS once and reports what happened, in the same shape the
    other probes use. ⚠️ **This is the only thing in the repo that can catch a
    wrong `NEON_AUTH_URL` before a reader does** — `./scripts/check` cannot
    reach the network, and the UI's own failure is a redirect loop that looks
    like a front-end bug.
    """
    if not settings.require_auth:
        return True, "require_auth=false — the API is OPEN, no session needed"
    if not settings.neon_auth_url:
        return False, "require_auth=true but NEON_AUTH_URL is empty"
    try:
        r = httpx.get(jwks_url(), timeout=JWKS_TIMEOUT_S)
        r.raise_for_status()
        keys = r.json().get("keys", [])
        if not keys:
            return False, f"auth   FAIL  {jwks_url()} returned no keys"
        return True, f"auth   OK    {len(keys)} signing key(s) at {jwks_url()}"
    except Exception as e:  # noqa: BLE001
        return False, f"{jwks_url()}: {e}"
