import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    videoService: { completeVideoCall: completeMock },
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
  completeMock.mockReset();
});

describe("POST /api/video/complete", () => {
  it("400 on missing token", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("delegates to service and returns ok", async () => {
    completeMock.mockResolvedValue(undefined);
    const res = await POST(req({ inviteToken: "0123456789012345678901234567890123456789ab" }));
    expect(res.status).toBe(200);
    expect(completeMock).toHaveBeenCalledWith("0123456789012345678901234567890123456789ab");
  });
});
