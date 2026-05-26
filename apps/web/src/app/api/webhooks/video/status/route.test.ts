import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTwilioFormMock, handleRoomEndedMock } = vi.hoisted(() => ({
  readTwilioFormMock: vi.fn(),
  handleRoomEndedMock: vi.fn(),
}));

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    videoService: { handleRoomEndedWebhook: handleRoomEndedMock },
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
  handleRoomEndedMock.mockReset();
});

describe("POST /api/webhooks/video/status", () => {
  it("403 on bad signature", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("ignores non room-ended events", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        RoomSid: "RM00000000000000000000000000000001",
        StatusCallbackEvent: "participant-connected",
      }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(handleRoomEndedMock).not.toHaveBeenCalled();
  });

  it("delegates on room-ended", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        RoomSid: "RM00000000000000000000000000000001",
        StatusCallbackEvent: "room-ended",
      }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(handleRoomEndedMock).toHaveBeenCalledWith("RM00000000000000000000000000000001");
  });
});
