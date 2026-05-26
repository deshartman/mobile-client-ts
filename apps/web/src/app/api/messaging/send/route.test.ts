import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessageMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    messagingService: { sendMessage: sendMessageMock },
  }),
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://t/a", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sendMessageMock.mockReset();
});

describe("POST /api/messaging/send", () => {
  it("400 on missing fields", async () => {
    const res = await POST(req({ userGuid: "not-a-uuid", to: "", body: "" }));
    expect(res.status).toBe(400);
  });

  it("delegates to service and returns its result", async () => {
    sendMessageMock.mockResolvedValue({
      threadId: "thr_1",
      messageSid: "SM11111111111111111111111111111111",
      status: "queued",
    });
    const res = await POST(
      req({
        userGuid: "11111111-2222-4333-8444-555555555555",
        to: "+15551111111",
        body: "hey",
      }),
    );
    expect(res.status).toBe(200);
    expect(sendMessageMock).toHaveBeenCalledWith({
      userGuid: "11111111-2222-4333-8444-555555555555",
      remoteAddress: "+15551111111",
      body: "hey",
    });
  });
});
