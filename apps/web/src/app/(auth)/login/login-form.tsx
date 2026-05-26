"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { ApiError, authApi } from "@/lib/client/api-client";
import { toE164 } from "@/lib/client/phone";

type Step = "phone" | "otp";

export function LoginForm() {
  const router = useRouter();
  const { setSession } = useSession();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    setSubmitting(true);
    try {
      const { isExistingUser } = await authApi.sendOtp({ phone: e164 });
      if (!isExistingUser) {
        toast.error("No account for that number. Try Sign up.");
        return;
      }
      setPhone(e164);
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyAndComplete() {
    setSubmitting(true);
    try {
      await authApi.verifyOtp({ phone, code });
      const { user } = await authApi.complete({ phone });
      setSession({
        userGuid: user.userGuid,
        userName: user.name,
        userPhone: user.phone ?? phone,
      });
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "phone" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="+61 4xx xxx xxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !phone}>
              {submitting ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Verification code</Label>
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={submitting || code.length < 6}
              onClick={handleVerifyAndComplete}
            >
              {submitting ? "Verifying…" : "Sign in"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
