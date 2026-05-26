"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Call } from "@twilio/voice-sdk";
import { getDeviceService } from "@/lib/client/device-service";

async function fetchToken(userGuid: string): Promise<string> {
  const res = await fetch("/api/voice/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userGuid }),
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Subscribe to the Voice SDK device singleton. Idempotent setup — the
 * first caller triggers registration; subsequent mounts (e.g. the
 * incoming overlay + an active call screen) share the same device.
 *
 * `call` and `ready` are tracked as independent primitive snapshots so
 * useSyncExternalStore doesn't allocate a new object on every read
 * (which would loop indefinitely: new object → not equal → re-render).
 */
export function useVoiceDevice(userGuid: string | undefined) {
  const service = getDeviceService();
  const [setupError, setSetupError] = useState<Error | null>(null);

  const call = useSyncExternalStore<Call | null>(
    (fn) => service.subscribe(fn),
    () => service.getCall(),
    () => null,
  );
  const ready = useSyncExternalStore<boolean>(
    (fn) => service.subscribe(fn),
    () => service.isDeviceReady(),
    () => false,
  );

  useEffect(() => {
    if (!userGuid) return;
    service.setup(() => fetchToken(userGuid)).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[useVoiceDevice] setup failed:", e);
      setSetupError(e);
    });
  }, [service, userGuid]);

  return {
    call,
    ready,
    setupError,
    makeCall: service.makeCall.bind(service),
    answer: service.answer.bind(service),
    reject: service.reject.bind(service),
    endCall: service.endCall.bind(service),
    setMuted: service.setMuted.bind(service),
    sendDigits: service.sendDigits.bind(service),
    cycleSpeaker: service.cycleSpeaker.bind(service),
    destroy: service.destroy.bind(service),
  };
}
