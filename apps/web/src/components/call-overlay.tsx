"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useCallOverlay } from "@/hooks/use-call-overlay";
import { useVoiceDevice } from "@/hooks/use-voice-device";

const CallControls = dynamic(
  () => import("@/components/call-controls").then((m) => m.CallControls),
  { ssr: false },
);

/**
 * Full-screen call overlay mounted at the (app) layout. Driven by
 * CallOverlayContext — the contact detail Call button opens outgoing;
 * the incoming banner opens incoming (or Answer opens it pre-accepted).
 *
 * While open, the overlay covers the current page. When the call ends
 * we hold "Call ended" for 800ms then close, matching the legacy UX.
 */
export function CallOverlay({ userGuid }: Readonly<{ userGuid: string }>) {
  const { overlay, close } = useCallOverlay();
  const { call } = useVoiceDevice(userGuid);

  // If an incoming call is ringing but no overlay is open, we do NOT
  // auto-open it — the banner handles ringing state without stealing
  // focus. The user must tap the banner or Answer to expand.

  // Auto-close if the singleton no longer has a call while the overlay
  // is expanded to an incoming view. (Outgoing closes via its own
  // onEnded → 800ms timer → close, kicked below.)
  useEffect(() => {
    if (!overlay) return;
    if (overlay.direction !== "incoming") return;
    if (!call) {
      const t = setTimeout(() => close(), 300);
      return () => clearTimeout(t);
    }
  }, [overlay, call, close]);

  if (!overlay) return null;

  function handleEnded() {
    setTimeout(() => close(), 800);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {overlay.direction === "outgoing" ? (
        <CallControls
          direction="outgoing"
          userGuid={userGuid}
          to={overlay.to}
          displayName={overlay.displayName}
          onEnded={handleEnded}
        />
      ) : (
        <CallControls
          direction="incoming"
          userGuid={userGuid}
          onEnded={handleEnded}
        />
      )}
    </div>
  );
}
