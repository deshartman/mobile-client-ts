"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Shared call-overlay state. An overlay covers the current page while a
 * call is active (either outgoing dial or accepted incoming). The layout
 * mounts one <CallOverlay>, driven by this context. Anywhere in the app
 * (e.g. the contact detail "Call" button) can request an outbound call,
 * or expand a ringing incoming call to the full-screen view, without
 * navigating.
 */

interface OutgoingDial {
  direction: "outgoing";
  to: string;
  contactGuid?: string;
  displayName?: string;
}

interface IncomingExpanded {
  direction: "incoming";
}

export type OverlayRequest = OutgoingDial | IncomingExpanded;

interface CallOverlayContextValue {
  overlay: OverlayRequest | null;
  openOutgoing: (req: Omit<OutgoingDial, "direction">) => void;
  openIncoming: () => void;
  close: () => void;
}

const CallOverlayContext = createContext<CallOverlayContextValue | null>(null);

export function CallOverlayProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [overlay, setOverlay] = useState<OverlayRequest | null>(null);

  const openOutgoing = useCallback(
    (req: Omit<OutgoingDial, "direction">) => {
      setOverlay({ direction: "outgoing", ...req });
    },
    [],
  );
  const openIncoming = useCallback(() => {
    setOverlay({ direction: "incoming" });
  }, []);
  const close = useCallback(() => {
    setOverlay(null);
  }, []);

  const value = useMemo<CallOverlayContextValue>(
    () => ({ overlay, openOutgoing, openIncoming, close }),
    [overlay, openOutgoing, openIncoming, close],
  );

  return <CallOverlayContext.Provider value={value}>{children}</CallOverlayContext.Provider>;
}

export function useCallOverlay(): CallOverlayContextValue {
  const ctx = useContext(CallOverlayContext);
  if (!ctx) throw new Error("useCallOverlay must be used within <CallOverlayProvider>");
  return ctx;
}
