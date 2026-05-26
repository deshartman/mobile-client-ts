"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError, usersApi } from "@/lib/client/api-client";

/**
 * Pinned footer: the user's provisioned Twilio number plus a Share
 * button (opens a QR modal pointing at /signup).
 */
export function MyNumberBar({ userGuid }: Readonly<{ userGuid: string }>) {
  const [twilioNumber, setTwilioNumber] = useState<string | undefined>(undefined);
  const [qrKey, setQrKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await usersApi.get(userGuid);
        if (!cancelled) setTwilioNumber(user.twilioNumber);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : "Failed to load your number");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userGuid]);

  return (
    <div className="flex items-center gap-3 border-t bg-background px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">My number</p>
        <p className="truncate text-sm font-medium tabular-nums">
          {twilioNumber ?? "—"}
        </p>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share signup QR code"
            onClick={() => setQrKey((k) => k + 1)}
          >
            <QrCode className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Share this app</DialogTitle>
            <DialogDescription>Scan to sign up</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/auth/qr?t=${qrKey}`}
            alt="Signup QR code"
            className="mx-auto h-64 w-64"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
