"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { IncomingCallBanner } from "@/components/incoming-call-banner";
import { CallOverlayProvider } from "@/hooks/use-call-overlay";
import { useSession } from "@/hooks/use-session";
import { VideoOverlayProvider } from "@/hooks/use-video-overlay";

// CallOverlay touches the Voice SDK → client-only.
const CallOverlay = dynamic(
  () => import("@/components/call-overlay").then((m) => m.CallOverlay),
  { ssr: false },
);
const VideoOverlay = dynamic(
  () => import("@/components/video-overlay").then((m) => m.VideoOverlay),
  { ssr: false },
);

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { session, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace("/signup");
  }, [ready, session, router]);

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (!session) return null;

  return (
    <CallOverlayProvider>
      <VideoOverlayProvider>
        <IncomingCallBanner userGuid={session.userGuid} />
        {children}
        <CallOverlay userGuid={session.userGuid} />
        <VideoOverlay userGuid={session.userGuid} />
      </VideoOverlayProvider>
    </CallOverlayProvider>
  );
}
