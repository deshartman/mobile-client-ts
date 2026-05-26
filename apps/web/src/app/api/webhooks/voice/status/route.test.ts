import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTwilioFormMock, handleVoiceStatusMock } = vi.hoisted(() => ({
  readTwilioFormMock: vi.fn(),
  handleVoiceStatusMock: vi.fn(),
}));

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    webhookService: { handleVoiceStatus: handleVoiceStatusMock },
  }),
}));

import { POST } from "./route";

function params(entries: Record<string, string>): URLSearchParams {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) u.set(k, v);
  return u;
}

beforeEach(() => {
  readTwilioFormMock.mockReset();
  handleVoiceStatusMock.mockReset();
});

describe("POST /api/webhooks/voice/status", () => {
  it("403 on bad signature", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("returns empty TwiML on schema mismatch", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ CallSid: "CA1" }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(handleVoiceStatusMock).not.toHaveBeenCalled();
  });

  it("delegates and returns empty TwiML on valid payload", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        CallSid: "CA00000000000000000000000000000001",
        CallStatus: "completed",
        From: "+1",
        To: "+2",
        Duration: "60",
      }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(handleVoiceStatusMock).toHaveBeenCalledOnce();
  });
});
