import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    videoService: { ingestVideoTranscription: ingestMock },
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
  ingestMock.mockReset();
});

describe("POST /api/video/transcription", () => {
  it("400 on missing fields", async () => {
    const res = await POST(req({ inviteToken: "x" }));
    expect(res.status).toBe(400);
  });

  it("delegates to service and returns its result", async () => {
    ingestMock.mockReturnValue({ inserted: true });
    const res = await POST(
      req({
        inviteToken: "0123456789012345678901234567890123456789ab",
        roomSid: "RM00000000000000000000000000000001",
        participantSid: "PA00000000000000000000000000000099",
        transcript: "Hello",
        sequenceNumber: 1,
        timestamp: "2026-05-05T10:00:00Z",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: true });
  });
});
