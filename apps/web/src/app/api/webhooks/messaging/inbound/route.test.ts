import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTwilioFormMock, handleInboundSmsMock } = vi.hoisted(() => ({
  readTwilioFormMock: vi.fn(),
  handleInboundSmsMock: vi.fn(),
}));

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    webhookService: { handleInboundSms: handleInboundSmsMock },
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
  handleInboundSmsMock.mockReset();
});

describe("POST /api/webhooks/messaging/inbound", () => {
  it("403 on bad signature", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("returns EMPTY_TWIML on schema mismatch (does not throw)", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ From: "+1" }), // missing MessageSid
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(handleInboundSmsMock).not.toHaveBeenCalled();
  });

  it("delegates and returns empty TwiML on success", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        From: "+15554443333",
        To: "+15559990000",
        Body: "hey",
        MessageSid: "SM11111111111111111111111111111111",
        NumMedia: "0",
      }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(handleInboundSmsMock).toHaveBeenCalledOnce();
  });

  it("swallows handler throw and still returns empty TwiML", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        From: "+15554443333",
        To: "+15559990000",
        Body: "hey",
        MessageSid: "SM11111111111111111111111111111111",
        NumMedia: "0",
      }),
      raw: "",
    });
    handleInboundSmsMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
  });
});
