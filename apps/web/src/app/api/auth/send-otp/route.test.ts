import { beforeEach, describe, expect, it, vi } from "vitest";

const requestOtpMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    authService: { requestOtp: requestOtpMock },
  }),
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://test.local/api/auth/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requestOtpMock.mockReset();
});

describe("POST /api/auth/send-otp", () => {
  it("400s on invalid phone shape", async () => {
    const res = await POST(req({ phone: "bad" }));
    expect(res.status).toBe(400);
  });

  it("400s on malformed JSON", async () => {
    const bad = new Request("http://test.local/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("happy path returns { sent: true, isExistingUser } and calls service", async () => {
    requestOtpMock.mockResolvedValue({ isExistingUser: true });
    const res = await POST(req({ phone: "+15551111111" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: boolean; isExistingUser: boolean };
    expect(body).toEqual({ sent: true, isExistingUser: true });
    expect(requestOtpMock).toHaveBeenCalledWith("+15551111111");
  });

  it("500s when service throws a plain Error", async () => {
    requestOtpMock.mockRejectedValue(new Error("twilio down"));
    const res = await POST(req({ phone: "+15551111111" }));
    expect(res.status).toBe(500);
  });
});
