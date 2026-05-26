import { beforeEach, describe, expect, it, vi } from "vitest";

const redeemMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    videoService: { redeemGuestInvite: redeemMock },
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
  redeemMock.mockReset();
});

describe("POST /api/video/guest-token", () => {
  it("400 on missing token", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("delegates to service and returns its result", async () => {
    redeemMock.mockReturnValue({
      token: "j.w.t",
      identity: "guest-12345678",
      roomName: "video-x",
    });
    const res = await POST(
      req({ inviteToken: "0123456789012345678901234567890123456789ab", displayName: "Alex" }),
    );
    expect(res.status).toBe(200);
    expect(redeemMock).toHaveBeenCalledWith({
      inviteToken: "0123456789012345678901234567890123456789ab",
      displayName: "Alex",
    });
  });
});
