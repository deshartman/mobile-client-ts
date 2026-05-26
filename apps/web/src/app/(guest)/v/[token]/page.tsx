import { getServices } from "@/lib/container";
import { isAppError } from "@/lib/errors";
import { GuestVideoJoin } from "@/components/guest-video-join";

interface Props {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export default async function GuestVideoPage({ params }: Readonly<Props>) {
  const { token } = await params;

  let errorMessage: string | null = null;
  try {
    getServices().videoService.validateInvite(token);
  } catch (err) {
    errorMessage = isAppError(err) ? err.message : "Invite invalid";
  }

  if (errorMessage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Can't join this call</h1>
        <p className="text-sm text-white/70">{errorMessage}</p>
      </div>
    );
  }

  return <GuestVideoJoin inviteToken={token} />;
}
