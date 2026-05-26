"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { VerifyOtpResponse } from "@mobileclient/shared-types";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { ApiError, authApi } from "@/lib/client/api-client";
import { toE164 } from "@/lib/client/phone";

type Step = "phone" | "otp" | "name";

export function SignupForm() {
  const router = useRouter();
  const { setSession } = useSession();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    setSubmitting(true);
    try {
      await authApi.sendOtp({ phone: e164 });
      setPhone(e164);
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    setSubmitting(true);
    try {
      const result = await authApi.verifyOtp({ phone, code });
      handleOtpVerified(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not verify code");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Decide what happens after OTP verification succeeds.
   *
   * Option C (single screen inline reveal):
   *   - If isExistingUser → call /api/auth/complete with just the phone,
   *     save the returned session, and router.replace("/") to land on the
   *     main list. No name step needed.
   *   - If new user → transition to the "name" step so the user can enter
   *     a display name; the name-step form then calls complete with phone
   *     + name in handleComplete below.
   *
   * Why: existing users already have their name on record, so asking again
   * is friction. New users must see the name field, but keeping it on the
   * same screen (rather than routing) preserves the OTP context in case
   * anything goes wrong and we need to fall back.
   */
  async function handleOtpVerified(result: VerifyOtpResponse) {
    if (result.isExistingUser) {
      const { user } = await authApi.complete({ phone });
      setSession({
        userGuid: user.userGuid,
        userName: user.name,
        userPhone: user.phone ?? phone,
      });
      router.replace("/");
      return;
    }
    setStep("name");
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { user } = await authApi.complete({ phone, name: name.trim() });
      setSession({
        userGuid: user.userGuid,
        userName: user.name,
        userPhone: user.phone ?? phone,
      });
      router.replace("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">
          {step === "phone" && "Sign up"}
          {step === "otp" && "Enter code"}
          {step === "name" && "One last thing"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "phone" && (
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
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center space-y-2">
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
              onClick={handleVerifyOtp}
            >
              {submitting ? "Verifying…" : "Verify"}
            </Button>
          </div>
        )}

        {step === "name" && (
          <form onSubmit={handleComplete} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Des Hartman"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Finish"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
