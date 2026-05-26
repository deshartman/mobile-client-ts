import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtpMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    authService: { verifyOtp: verifyOtpMock },
  }),
}));

import { UnauthorizedError } from "@/lib/errors";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://test.local/api/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  verifyOtpMock.mockReset();
});

describe("POST /api/auth/verify-otp", () => {
  it("400 on non-6-digit code shape", async () => {
    const res = await POST(req({ phone: "+15551111111", code: "abc" }));
    expect(res.status).toBe(400);
  });

  it("happy path returns verified payload", async () => {
    verifyOtpMock.mockReturnValue({ verified: true, isExistingUser: false });
    const res = await POST(req({ phone: "+15551111111", code: "123456" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verified: boolean };
    expect(body.verified).toBe(true);
  });

  it("UnauthorizedError from service → 401", async () => {
    verifyOtpMock.mockImplementation(() => {
      throw new UnauthorizedError("Invalid code");
    });
    const res = await POST(req({ phone: "+15551111111", code: "123456" }));
    expect(res.status).toBe(401);
  });
});
