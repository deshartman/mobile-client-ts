"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCallOverlay } from "@/hooks/use-call-overlay";
import { useVoiceDevice } from "@/hooks/use-voice-device";

export function IncomingCallBannerInner({ userGuid }: Readonly<{ userGuid: string }>) {
  const { call, answer, reject } = useVoiceDevice(userGuid);
  const { openIncoming, overlay } = useCallOverlay();

  if (!call) return null;
  if (String(call.direction) !== "INCOMING") return null;
  // When the user expands into the full-screen incoming view, the overlay
  // owns Answer/Reject — hide the banner so it doesn't stack.
  if (overlay?.direction === "incoming") return null;

  const from = call.parameters["From"] ?? "Unknown";

  async function handleAnswer(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await answer();
      openIncoming();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to answer");
    }
  }

  async function handleReject(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await reject();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    }
  }

  // Tapping the banner (outside the buttons) expands the ringing call
  // into the full-screen overlay — without accepting. That matches the
  // "click banner to view" ask: see who's calling, still choose.
  return (
    <button
      type="button"
      onClick={() => openIncoming()}
      className="sticky top-0 z-50 flex w-full items-center justify-between gap-2 border-b bg-primary px-4 py-2 text-left text-primary-foreground shadow"
      aria-label={`Incoming call from ${from}, tap to view`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs opacity-80">Incoming call</p>
        <p className="truncate text-sm font-semibold">{from}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={handleAnswer}>
        Answer
      </Button>
      <Button size="sm" variant="destructive" onClick={handleReject}>
        Reject
      </Button>
    </button>
  );
}
