import { beforeEach, describe, expect, it, vi } from "vitest";

const startVideoCallMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    videoService: { startVideoCall: startVideoCallMock },
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
  startVideoCallMock.mockReset();
});

describe("POST /api/video/start", () => {
  it("400 on missing fields", async () => {
    const res = await POST(req({ userGuid: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("delegates to service and returns its result", async () => {
    startVideoCallMock.mockResolvedValue({
      token: "j.w.t",
      identity: "u",
      roomName: "video-x",
      roomSid: "RM00000000000000000000000000000001",
      inviteToken: "0123456789012345678901234567890123456789ab",
      inviteUrl: "http://t/v/0123456789012345678901234567890123456789ab",
      expiresAt: "2026-05-05T11:00:00Z",
    });
    const res = await POST(
      req({
        userGuid: "11111111-2222-4333-8444-555555555555",
        remoteAddress: "+15551111111",
      }),
    );
    expect(res.status).toBe(200);
    expect(startVideoCallMock).toHaveBeenCalledWith({
      userGuid: "11111111-2222-4333-8444-555555555555",
      remoteAddress: "+15551111111",
    });
  });
});
