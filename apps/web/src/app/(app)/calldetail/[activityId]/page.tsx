"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import type { Transcription } from "@mobileclient/shared-types";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { ApiError } from "@/lib/client/api-client";

interface TranscriptResponse {
  correlationSid: string | null;
  utterances: Transcription[];
}

interface Props {
  params: Promise<{ activityId: string }>;
}

export default function CallDetailPage({ params }: Readonly<Props>) {
  const { activityId } = use(params);
  const { session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<TranscriptResponse | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/activities/${encodeURIComponent(session.userGuid)}/${encodeURIComponent(activityId)}/transcript`,
        );
        if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
        const payload = (await res.json()) as TranscriptResponse;
        if (!cancelled) setData(payload);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, activityId]);

  if (!session) return null;
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← Back
        </Button>
        <h1 className="text-sm font-semibold">Call transcript</h1>
        <span className="w-16" />
      </header>
      {!data.correlationSid || data.utterances.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No transcript for this call.
        </p>
      ) : (
        <ul className="space-y-2 p-4">
          {(() => {
            // For video, attribute by participantSid; the FIRST observed
            // participant is the broker (the one that started the room).
            const firstVideoParticipant = data.utterances.find(
              (u) => u.source === "video",
            )?.participantSid;
            return data.utterances.map((u) => {
              const isOutbound =
                u.source === "video"
                  ? u.participantSid === firstVideoParticipant
                  : u.track === "outbound_track";
              return (
                <li
                  key={`${u.correlationSid}-${u.sequenceId}`}
                  className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      isOutbound ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {u.transcript}
                  </div>
                  {typeof u.confidence === "number" && (
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {Math.round(u.confidence * 100)}%
                    </span>
                  )}
                </li>
              );
            });
          })()}
        </ul>
      )}
    </main>
  );
}
