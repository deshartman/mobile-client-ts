"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, videoApi } from "@/lib/client/api-client";

const VideoCallControls = dynamic(
  () => import("@/components/video-call-controls").then((m) => m.VideoCallControls),
  { ssr: false },
);

interface JoinedSession {
  token: string;
  identity: string;
  roomName: string;
}

/**
 * Guest-side join CTA + in-call surface. Renders a "Join video call"
 * button that calls /api/video/guest-token (single-use claim) and then
 * mounts <VideoCallControls> with the resulting Twilio AccessToken.
 *
 * No session check, no SSE — the invite token is the only credential.
 */
export function GuestVideoJoin({ inviteToken }: Readonly<{ inviteToken: string }>) {
  const [session, setSession] = useState<JoinedSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [ended, setEnded] = useState(false);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    try {
      const result = await videoApi.guestToken({ inviteToken });
      setSession(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  }

  if (ended) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Call ended</h1>
        <p className="text-sm text-white/70">You can close this tab.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Video call</h1>
        <p className="max-w-sm text-sm text-white/70">
          Tap join to enter the call. You'll be asked to allow camera and microphone access.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleJoin} disabled={joining} size="lg" className="rounded-full">
          {joining ? "Joining…" : "Join video call"}
        </Button>
      </div>
    );
  }

  return (
    <VideoCallControls
      token={session.token}
      roomName={session.roomName}
      inviteToken={inviteToken}
      onEnded={() => setEnded(true)}
      receiveTranscriptions
    />
  );
}
