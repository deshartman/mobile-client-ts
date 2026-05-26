"use client";

import dynamic from "next/dynamic";
import { useSse } from "@/hooks/use-sse";
import { useVideoOverlay } from "@/hooks/use-video-overlay";

const VideoCallControls = dynamic(
  () => import("@/components/video-call-controls").then((m) => m.VideoCallControls),
  { ssr: false },
);

/**
 * Broker-side full-screen video overlay. Driven by VideoOverlayContext —
 * the contact-detail Video button calls /api/video/start, then opens
 * with the resulting session.
 *
 * Subscribes to `video.ended` SSE so the broker overlay closes when the
 * guest hangs up first (or when the room-ended webhook completes).
 */
export function VideoOverlay({ userGuid }: Readonly<{ userGuid: string }>) {
  const { session, close } = useVideoOverlay();

  useSse(userGuid, {
    "video.ended": (payload) => {
      if (!session) return;
      if (payload.roomSid !== session.roomSid) return;
      close();
    },
  });

  if (!session) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <VideoCallControls
        token={session.token}
        roomName={session.roomName}
        inviteToken={session.inviteToken}
        remoteLabel={session.displayName ?? session.remoteAddress}
        onEnded={close}
        receiveTranscriptions
      />
    </div>
  );
}
