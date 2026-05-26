import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTwilioFormMock, handleMessageStatusMock } = vi.hoisted(() => ({
  readTwilioFormMock: vi.fn(),
  handleMessageStatusMock: vi.fn(),
}));

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    webhookService: { handleMessageStatus: handleMessageStatusMock },
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
  handleMessageStatusMock.mockReset();
});

describe("POST /api/webhooks/messaging/status", () => {
  it("403 on bad signature", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("204 on schema mismatch (does not throw, does not call service)", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ MessageSid: "SM1" }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(204);
    expect(handleMessageStatusMock).not.toHaveBeenCalled();
  });

  it("204 on success and delegates to webhook service", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        MessageSid: "SM11111111111111111111111111111111",
        MessageStatus: "delivered",
      }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(204);
    expect(handleMessageStatusMock).toHaveBeenCalledWith({
      messageSid: "SM11111111111111111111111111111111",
      messageStatus: "delivered",
    });
  });
});
