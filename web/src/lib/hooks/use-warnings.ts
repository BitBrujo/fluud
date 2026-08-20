"use client";

import { useEffect, useState } from "react";

import type { RatEvent, SpeakEvent } from "../api-types";
import { applyRatEvent, EMPTY_FEED, type WarningFeed } from "../warning-feed";

export interface Warnings {
  /** The warning on screen now, or null for the idle state. */
  latest: SpeakEvent | null;
  /** Most recent first. A log, not a queue — stand-down does not clear it. */
  history: SpeakEvent[];
}

/**
 * The `/api/events` SSE stream.
 *
 * This hook is only the plumbing. Which warning is *current* — the part that
 * has to survive `EventSource` reconnecting and replaying up to five minutes of
 * buffered events — is decided by the pure reducer in `lib/warning-feed.ts`,
 * where it can be tested.
 *
 * **StrictMode:** the stream is opened in an effect with a real cleanup, so a
 * double mount never leaves two EventSources open. With the WebGL canvas gone
 * this is the only StrictMode hazard left in the app.
 */
export function useWarnings(): Warnings {
  const [feed, setFeed] = useState<WarningFeed>(EMPTY_FEED);

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.onmessage = (message: MessageEvent<string>) => {
      let event: RatEvent;
      try {
        event = JSON.parse(message.data) as RatEvent;
      } catch {
        return; // keepalives are comments and never reach onmessage
      }
      // The reducer returns the same object when nothing changed, so a
      // re-delivered warning costs one comparison and no render.
      setFeed((prev) => applyRatEvent(prev, event));
    };

    return () => source.close();
  }, []);

  return { latest: feed.latest, history: feed.history };
}
