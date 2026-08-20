"use client";

import { useEffect, useState } from "react";

import { PaintRule } from "@/components/paint-rule";
import { Panel, PanelHeader, PanelTitle, PanelTools } from "@/components/panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { SprayDefs } from "@/components/spray";
import { ManageFace } from "@/components/watch-manage";
import { BUTTON } from "@/components/watch-parts";
import { ApiError, confirmWatch, getWatchSubscription } from "@/lib/api";
import type { WatchSubscriptionResponse } from "@/lib/api-types";
import { useHealth } from "@/lib/hooks/use-health";

/**
 * The manage page, at `/watch/`. **The only page an emailed link opens.**
 *
 * ## ⚠️ Why this route exists, and it is a bug fix rather than a feature
 *
 * The confirm and manage links pointed at `/map/?confirm=…` and
 * `/map/?watch=…` until 2026-08-16, and **every one of them was unreachable in
 * production.** `/map` is `MapRoute` → `RequireSession` → `MapWorkspace`; a
 * signed-out reader is redirected to sign-in before the workspace mounts, so
 * `WatchPanel` never mounted and the effect that read the token never ran. A
 * reader who did sign in came back to `AFTER_SIGN_IN`, which is the bare string
 * `"/map"` — the query string, and with it the token, gone.
 *
 * ⚠️ **That defeated a deliberate exemption.** `api._AUTH_EXEMPT` carries
 * `/api/watch/confirm` and `/api/watch/unsubscribe` with a docblock arguing
 * that these are reached from an email by somebody who may have no account at
 * all, and that an unsubscribe link demanding a sign-in is indefensible. A
 * curtain in front of the routes made the exemption unreachable.
 *
 * So this page is **not** wrapped in `RequireSession`, and
 * `/api/watch/subscription` joined that frozenset on the same argument: the
 * manage token is an opaque single-purpose bearer credential mailed to a proven
 * mailbox, which is a stronger claim about that specific mailbox than a session
 * is.
 *
 * ## ⚠️ It fetches `/api/healthz` and NOTHING else that could 401
 *
 * No `/api/status`, so `mode={null}` and the badge says `UNKNOWN` — the
 * truthful answer before anybody has proved anything. No `/api/sensors`, which
 * is why the add-instruments control is withheld (see below). `/api/healthz` is
 * exempt from the gate, carries no reading, and answers one question this page
 * has to be able to answer honestly: whether a confirmation could have been
 * sent at all.
 *
 * ## ⚠️ The chrome is not optional here
 *
 * `SiteFooter` is the site's only route to `/terms`, and §04 is where the
 * subscriber record — this reader's own address, tokens and watched set — is
 * disclosed. This is the page where somebody manages that record. It also
 * carries *"This is a prototype. It is not an emergency service."*, and a
 * stranger arriving straight from a flood email is the last reader who should
 * miss it. **Removing the footer from this route removes its last job here.**
 *
 * ## The token is stripped on the tick it is read
 *
 * ⚠️ **Read from `window.location.search`, not `useSearchParams`** — that hook
 * forces a Suspense boundary under `output: "export"`. The parameter is then
 * removed with `replaceState`: a confirm token is single-use and a manage token
 * is a bearer credential, and neither should survive in the address bar, in a
 * bookmark, or in a screenshot of a demo.
 *
 * ⚠️ **One effect, every `setState` inside an async continuation.** The obvious
 * two-effect version flashes an empty manage face before the subscription
 * lands, so a bad link puts the reader on a surface that then fails underneath
 * them.
 *
 * ## ⚠️ Adding an instrument is withheld, and said in words
 *
 * The add control needs the full registry from `/api/sensors`, which stays
 * gated — this page has no session and must not need one. So `ManageFace` is
 * mounted with no `addable` and the control does not render at all: withheld,
 * never disabled, on `sensor-row.tsx`'s rule that offering a control the server
 * would refuse reads as a promise. **A silent gap would read as something
 * failing to load**, so the sentence below the face says which things still
 * work and which one does not.
 *
 * ⚠️ **The existing rows cost no request.** `WatchSensorRef` carries `name` and
 * `borough`, so every watched instrument names itself off the subscription
 * response. Only adding needs the registry.
 */
export default function WatchRoute() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [token, setToken] = useState<string | null>(null);
  const [sub, setSub] = useState<WatchSubscriptionResponse | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const health = useHealth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const confirm = params.get("confirm");
    const manage = params.get("watch");

    params.delete("confirm");
    params.delete("watch");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : ""),
    );

    if (!confirm && !manage) {
      setError(
        "This page needs the link from a Fluud email. Open the confirmation " +
          "or settings link you were sent, and it will bring its own key.",
      );
      setState("error");
      return;
    }

    let live = true;

    async function open() {
      try {
        let tok = manage;
        if (confirm) {
          const r = await confirmWatch(confirm);
          if (!live) return;
          tok = r.manage_token;
          setBanner("Address confirmed.");
        }
        const loaded = await getWatchSubscription(tok!);
        if (!live) return;
        setToken(tok);
        setSub(loaded);
        setNote(loaded.note);
        setState("ready");
      } catch (e) {
        if (!live) return;
        setError(
          e instanceof ApiError ? e.message : "that link could not be used",
        );
        setState("error");
      }
    }

    void open();
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      {/* The spray filter every `<Spray>` on this page references. An SVG
          filter id is document-scoped and each page is its own document, so
          each renders exactly one of these. */}
      <SprayDefs />

      <PaintRule />
      {/* ⚠️ `mode={null}` — this page does not poll `/api/status`, and with the
          gate on that request is a guaranteed 401 for the signed-out reader
          this page exists for. `UNKNOWN` is the truthful answer. */}
      <SiteNav mode={null} />

      <main className="flex-1 px-5 py-10 pb-12 sm:px-8 lg:px-11">
        <div className="mx-auto w-full max-w-[560px]">
          <Panel>
            <PanelHeader>
              <PanelTitle>your watch</PanelTitle>
              <PanelTools>
                {state === "ready" && sub && (
                  <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--wl-cyan)] uppercase">
                    {sub.email_masked}
                  </span>
                )}
              </PanelTools>
            </PanelHeader>

            <div className="flex min-w-0 flex-col gap-3 px-3 py-3">
              {state === "loading" && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Opening that link…
                </p>
              )}

              {state === "error" && (
                <>
                  <p className="text-[11px] leading-relaxed text-[var(--wl-emergency)]">
                    {error}
                  </p>
                  {/* ⚠️ It says what this page could not do and nothing about
                      the water. A link that has expired, been used, or had its
                      subscription deleted all land here, and this page cannot
                      tell them apart — the server answers 404 for all three on
                      purpose, so that a caller cannot use it to test whether an
                      address is on Fluud. */}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    A confirmation link works once. A settings link stops
                    working when the address is removed. Fluud cannot tell you
                    which happened here, deliberately — the answer would say
                    whether that address is on Fluud at all. Nothing about this
                    is a statement about conditions.
                  </p>
                </>
              )}

              {removed && (
                <p
                  className="text-[11px] leading-relaxed text-muted-foreground"
                  role="status"
                >
                  Removed. Your address and everything queued for it are gone.
                  Nothing further will be sent.
                </p>
              )}

              {state === "ready" && sub && token && !removed && (
                <>
                  {banner && (
                    <p
                      className="text-[11px] leading-relaxed text-muted-foreground"
                      role="status"
                    >
                      {banner}{" "}
                      {/*
                       * ⚠️ **The promise half is gated on the server being able
                       * to keep it**, exactly as the wizard's `sent` face is.
                       * `MAIL_TRANSPORT=log` renders every message into a log
                       * file and marks the outbox row `skipped` — telling a
                       * reader Fluud will write to them against that is a
                       * promise nothing can keep.
                       *
                       * ⚠️ **`=== false`, never `!`** — `undefined` means an
                       * older instance did not say, and absence is not a
                       * verdict. `plausible === false`'s rule, one payload
                       * over. It reports CAPABILITY, never delivery: a
                       * configured relay that bounces still reads `true`.
                       */}
                      {health.data?.mail_delivers === false
                        ? "This deployment has no mail transport configured, so nothing can be sent to it."
                        : "Fluud will write to you when a watched instrument changes."}
                    </p>
                  )}

                  <ManageFace
                    token={token}
                    sub={sub}
                    onSub={setSub}
                    onDeleted={() => setRemoved(true)}
                    note={note}
                  />

                  {/* ⚠️ The withheld add control, named rather than left as a
                      gap. It must not send a signed-out reader somewhere that
                      will bounce them without saying so, so it says what the
                      map costs before they press anything. */}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Adding an instrument happens on the map, which needs a Fluud
                    sign-in. Dropping one, changing these settings, and stopping
                    altogether do not.
                  </p>
                </>
              )}
            </div>
          </Panel>

          {(state === "error" || removed) && (
            <a href="/map/" className={`${BUTTON} mt-4 inline-block`}>
              open the map
            </a>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
