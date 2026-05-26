"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getVideoDeviceService,
  type RemoteVideoState,
} from "@/lib/client/video-device-service";

/**
 * Subscribe to the video singleton. Mirrors [use-voice-device.ts](use-voice-device.ts):
 * snapshots are primitives or stable refs so useSyncExternalStore doesn't loop.
 */
export interface UseVideoCallOpts {
  token: string;
  roomName: string;
  /** Phase 3 wires this up; left as an option so the hook is forward-compatible. */
  receiveTranscriptions?: boolean;
}

export function useVideoCall(opts: UseVideoCallOpts | null) {
  const service = getVideoDeviceService();
  const [setupError, setSetupError] = useState<Error | null>(null);

  const remote = useSyncExternalStore<RemoteVideoState | null>(
    (fn) => service.subscribe(fn),
    () => service.getRemote(),
    () => null,
  );
  const room = useSyncExternalStore(
    (fn) => service.subscribe(fn),
    () => service.getRoom(),
    () => null,
  );
  const muted = useSyncExternalStore<boolean>(
    (fn) => service.subscribe(fn),
    () => service.isMuted(),
    () => false,
  );
  const cameraOff = useSyncExternalStore<boolean>(
    (fn) => service.subscribe(fn),
    () => service.isCameraOff(),
    () => false,
  );

  useEffect(() => {
    if (!opts) return;
    service
      .connect({
        token: opts.token,
        roomName: opts.roomName,
        receiveTranscriptions: opts.receiveTranscriptions,
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        console.error("[useVideoCall] connect failed:", e);
        setSetupError(e);
      });
  }, [service, opts]);

  return {
    room,
    remote,
    muted,
    cameraOff,
    setupError,
    localVideoTrack: service.getLocalVideoTrack(),
    setMuted: service.setMuted.bind(service),
    setCameraOff: service.setCameraOff.bind(service),
    disconnect: service.disconnect.bind(service),
  };
}
