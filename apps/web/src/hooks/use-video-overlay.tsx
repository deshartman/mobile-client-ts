"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Sibling of [use-call-overlay.tsx](use-call-overlay.tsx). Held separately
 * because video has different lifecycle: the broker initiates with a
 * server round-trip (returns token + invite + roomName) before any local
 * SDK work, whereas voice can dial the moment Device is ready.
 */

export interface BrokerVideoSession {
  token: string;
  identity: string;
  roomName: string;
  roomSid: string;
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
  contactGuid?: string;
  remoteAddress: string;
  displayName?: string;
}

interface VideoOverlayContextValue {
  session: BrokerVideoSession | null;
  open: (s: BrokerVideoSession) => void;
  close: () => void;
}

const VideoOverlayContext = createContext<VideoOverlayContextValue | null>(null);

export function VideoOverlayProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<BrokerVideoSession | null>(null);

  const open = useCallback((s: BrokerVideoSession) => setSession(s), []);
  const close = useCallback(() => setSession(null), []);

  const value = useMemo<VideoOverlayContextValue>(
    () => ({ session, open, close }),
    [session, open, close],
  );

  return <VideoOverlayContext.Provider value={value}>{children}</VideoOverlayContext.Provider>;
}

export function useVideoOverlay(): VideoOverlayContextValue {
  const ctx = useContext(VideoOverlayContext);
  if (!ctx) throw new Error("useVideoOverlay must be used within <VideoOverlayProvider>");
  return ctx;
}
