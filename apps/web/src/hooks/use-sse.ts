"use client";

import { useEffect, useRef } from "react";
import type { SseEvent, SseEventType } from "@mobileclient/shared-types";

type Handlers = {
  [K in SseEventType]?: (payload: Extract<SseEvent, { type: K }>["payload"]) => void;
};

/**
 * Subscribe to the /api/events/:userGuid stream.
 *
 * Pass a handler map keyed by event type. Re-renders don't reopen the
 * connection; the EventSource is keyed to userGuid. Handlers are read
 * from a ref so callers can close over fresh state without triggering
 * reconnects.
 */
export function useSse(userGuid: string | undefined, handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userGuid) return;

    const es = new EventSource(`/api/events/${encodeURIComponent(userGuid)}`);

    const dispatchers: Array<[SseEventType, (ev: MessageEvent) => void]> = [];
    const register = <K extends SseEventType>(type: K) => {
      const fn = (ev: MessageEvent<string>) => {
        const h = handlersRef.current[type];
        if (!h) return;
        try {
          const payload = JSON.parse(ev.data);
          (h as (p: unknown) => void)(payload);
        } catch {
          // malformed event frame — drop silently
        }
      };
      es.addEventListener(type, fn as EventListener);
      dispatchers.push([type, fn]);
    };

    register("activity.added");
    register("message.added");
    register("message.status");
    register("incoming-call");
    register("thread.read");
    register("video.guestJoined");
    register("video.ended");

    return () => {
      for (const [type, fn] of dispatchers) {
        es.removeEventListener(type, fn as EventListener);
      }
      es.close();
    };
  }, [userGuid]);
}
