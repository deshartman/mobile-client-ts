"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video as VideoIcon, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVideoCall } from "@/hooks/use-video-call";
import { getVideoDeviceService } from "@/lib/client/video-device-service";
import { cn } from "@/lib/utils";

interface TranscriptionEvent {
  transcription_sid?: string;
  transcript?: string;
  transcription?: string;
  text?: string;
  participant?: { sid?: string };
  participant_sid?: string;
  partial_results?: boolean;
  partial?: boolean;
  sequence_number?: number;
  sequenceNumber?: number;
  timestamp?: string;
}

function pickTranscript(evt: TranscriptionEvent): string | undefined {
  return evt.transcript ?? evt.transcription ?? evt.text;
}

function pickParticipantSid(evt: TranscriptionEvent): string | undefined {
  return evt.participant?.sid ?? evt.participant_sid;
}

function pickSequence(evt: TranscriptionEvent): number | undefined {
  return evt.sequence_number ?? evt.sequenceNumber;
}

function isFinal(evt: TranscriptionEvent): boolean {
  if (typeof evt.partial_results === "boolean") return !evt.partial_results;
  if (typeof evt.partial === "boolean") return !evt.partial;
  return true;
}

interface Props {
  token: string;
  roomName: string;
  inviteToken: string;
  /** Display name shown overlaid on the remote tile while waiting for a peer. */
  remoteLabel?: string;
  /** Called when the call ends from any side. */
  onEnded: () => void;
  /**
   * Pass through to the SDK as `receiveTranscriptions: true` so
   * `room.on("transcription")` fires. Final-only utterances are POSTed
   * to /api/video/transcription with `keepalive: true`.
   */
  receiveTranscriptions?: boolean;
  /**
   * On hangup, the user POSTs /api/video/complete to forcibly end the
   * Twilio room. Both broker and guest call this; the room-ended webhook
   * is the source of truth for activity logging.
   */
  endpointBase?: string;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function VideoCallControls({
  token,
  roomName,
  inviteToken,
  remoteLabel,
  onEnded,
  receiveTranscriptions,
  endpointBase = "",
}: Readonly<Props>) {
  const opts = { token, roomName, receiveTranscriptions };
  // Register the transcription handler BEFORE useVideoCall calls connect,
  // so the SDK's room.on("transcription") subscription fires from the
  // very first event. Both broker and guest tabs run this; duplicate
  // (correlationSid, sequenceId) writes are deduped by the composite PK.
  if (receiveTranscriptions) {
    getVideoDeviceService().setTranscriptionHandler((evt) => {
      const t = evt as TranscriptionEvent;
      if (!isFinal(t)) return;
      const transcript = pickTranscript(t);
      const seq = pickSequence(t);
      const partSid = pickParticipantSid(t);
      if (!transcript || typeof seq !== "number" || !partSid) return;
      const body = {
        inviteToken,
        roomSid: getVideoDeviceService().getRoom()?.sid ?? "",
        participantSid: partSid,
        transcript,
        sequenceNumber: seq,
        timestamp: t.timestamp ?? new Date().toISOString(),
      };
      if (!body.roomSid) return;
      void fetch(`${endpointBase}/api/video/transcription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch((err: unknown) => {
        console.error("[VideoCallControls] transcription post failed:", err);
      });
    });
  }
  const { room, remote, muted, cameraOff, setupError, localVideoTrack, setMuted, setCameraOff, disconnect } =
    useVideoCall(opts);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [ended, setEnded] = useState(false);

  // Attach local video track once available.
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localVideoTrack) return;
    const node = localVideoTrack.attach();
    node.style.width = "100%";
    node.style.height = "100%";
    node.style.objectFit = "cover";
    el.appendChild(node);
    return () => {
      try {
        localVideoTrack.detach().forEach((n) => n.remove());
      } catch {
        /* ignore */
      }
    };
  }, [localVideoTrack]);

  // Attach remote video track when subscribed.
  useEffect(() => {
    const el = remoteVideoRef.current;
    const track = remote?.videoTrack;
    if (!el || !track) return;
    const node = track.attach();
    node.style.width = "100%";
    node.style.height = "100%";
    node.style.objectFit = "cover";
    el.appendChild(node);
    return () => {
      try {
        track.detach().forEach((n: HTMLMediaElement) => n.remove());
      } catch {
        /* ignore */
      }
    };
  }, [remote?.videoTrack]);

  // Attach remote audio (autoplay <audio>).
  useEffect(() => {
    const track = remote?.audioTrack;
    if (!track) return;
    const node = track.attach();
    document.body.appendChild(node);
    return () => {
      try {
        track.detach().forEach((n) => n.remove());
      } catch {
        /* ignore */
      }
    };
  }, [remote?.audioTrack]);

  // Start the timer once a peer is connected.
  useEffect(() => {
    if (remote && !startedAt) setStartedAt(Date.now());
  }, [remote, startedAt]);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Detect remote-driven end: room.disconnected fires → service.room becomes null.
  useEffect(() => {
    if (room) return;
    if (ended) return;
    if (!startedAt) return; // not yet connected, nothing to end
    setEnded(true);
    onEnded();
  }, [room, ended, startedAt, onEnded]);

  function toggleMute() {
    setMuted(!muted);
  }

  function toggleCamera() {
    setCameraOff(!cameraOff);
  }

  async function handleHangup() {
    if (ended) return;
    setEnded(true);
    try {
      // keepalive lets the request survive the page unload that may follow.
      await fetch(`${endpointBase}/api/video/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken }),
        keepalive: true,
      });
    } catch (err) {
      // We still tear down locally even if the server call fails.
      console.error("[VideoCallControls] complete failed:", err);
    }
    try {
      disconnect();
    } catch (err) {
      console.error("[VideoCallControls] disconnect failed:", err);
    }
    onEnded();
  }

  if (setupError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-destructive">{setupError.message}</p>
        <Button onClick={() => onEnded()} className="mt-4" variant="outline">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Remote tile fills */}
      <div
        ref={remoteVideoRef}
        className="absolute inset-0 flex items-center justify-center bg-black"
      />
      {!remote && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm uppercase tracking-wide text-white/70">Waiting for guest…</p>
            {remoteLabel && (
              <p className="mt-2 text-2xl font-semibold">{remoteLabel}</p>
            )}
          </div>
        </div>
      )}

      {/* Top bar with timer */}
      <div
        className="absolute left-0 right-0 top-0 z-20 flex items-center justify-center gap-2 px-4 pt-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        {startedAt ? (
          <span className="rounded-full bg-black/40 px-3 py-1 font-mono text-sm tabular-nums">
            {formatDuration(elapsed)}
          </span>
        ) : null}
      </div>

      {/* Picture-in-picture local preview */}
      <div
        ref={localVideoRef}
        className={cn(
          "absolute right-4 top-16 z-30 h-32 w-24 overflow-hidden rounded-lg border border-white/30 bg-black/80",
          cameraOff && "flex items-center justify-center text-xs text-white/60",
        )}
      >
        {cameraOff && <span>Camera off</span>}
      </div>

      {/* Controls bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-white/10 bg-black/40 px-6 py-4 backdrop-blur"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <ControlButton
          icon={muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          label={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          active={muted}
        />
        <Button
          variant="destructive"
          size="lg"
          onClick={handleHangup}
          disabled={ended}
          className="h-14 w-14 rounded-full p-0"
          aria-label="End call"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
        <ControlButton
          icon={cameraOff ? <VideoOff className="h-6 w-6" /> : <VideoIcon className="h-6 w-6" />}
          label={cameraOff ? "Camera on" : "Camera off"}
          onClick={toggleCamera}
          active={cameraOff}
        />
      </div>
    </div>
  );
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}

function ControlButton({ icon, label, onClick, active }: Readonly<ControlButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-20 flex-col items-center justify-center gap-1 rounded-lg p-2 transition-colors",
        active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10",
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}

