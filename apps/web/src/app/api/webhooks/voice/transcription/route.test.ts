import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTwilioFormMock, handleTranscriptionMock } = vi.hoisted(() => ({
  readTwilioFormMock: vi.fn(),
  handleTranscriptionMock: vi.fn(),
}));

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    webhookService: { handleTranscription: handleTranscriptionMock },
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
  handleTranscriptionMock.mockReset();
});

describe("POST /api/webhooks/voice/transcription", () => {
  it("403 on bad signature", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("204 on schema mismatch", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ CallSid: "CA1" }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(204);
    expect(handleTranscriptionMock).not.toHaveBeenCalled();
  });

  it("delegates on valid payload with TranscriptionEvent", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        TranscriptionSid: "GT1",
        CallSid: "CA00000000000000000000000000000001",
        SequenceId: "0",
        Track: "inbound_track",
        TranscriptionData: '{"transcript":"hi"}',
        TranscriptionEvent: "transcription-content",
        Final: "true",
      }),
      raw: "",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(204);
    expect(handleTranscriptionMock).toHaveBeenCalledOnce();
    const arg = handleTranscriptionMock.mock.calls[0]?.[0];
    expect(arg.transcriptionEvent).toBe("transcription-content");
    expect(arg.final).toBe("true");
  });
});
