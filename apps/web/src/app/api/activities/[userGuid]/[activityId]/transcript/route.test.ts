import { beforeEach, describe, expect, it, vi } from "vitest";

const getByCorrelationSidMock = vi.fn();
const prepareMock = vi.fn();

vi.mock("@mobileclient/db", async () => {
  const actual = await vi.importActual<typeof import("@mobileclient/db")>("@mobileclient/db");
  return {
    ...actual,
    getDb: () => ({
      prepare: prepareMock,
    }),
  };
});
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    transcriptionsRepo: { getByCorrelationSid: getByCorrelationSidMock },
  }),
}));

import { GET } from "./route";

function paramsPromise(userGuid: string, activityId: string) {
  return { params: Promise.resolve({ userGuid, activityId }) };
}

beforeEach(() => {
  getByCorrelationSidMock.mockReset();
  prepareMock.mockReset();
});

describe("GET /api/activities/:userGuid/:activityId/transcript", () => {
  it("returns { correlationSid: null, utterances: [] } when activity has no call_sid", async () => {
    prepareMock.mockReturnValue({ get: vi.fn().mockReturnValue({ call_sid: null }) });
    const res = await GET(new Request("http://t/a"), paramsPromise("u1", "a1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { correlationSid: string | null; utterances: unknown[] };
    expect(body.correlationSid).toBeNull();
    expect(body.utterances).toEqual([]);
    expect(getByCorrelationSidMock).not.toHaveBeenCalled();
  });

  it("joins on call_sid when present", async () => {
    prepareMock.mockReturnValue({
      get: vi.fn().mockReturnValue({ call_sid: "CA00000000000000000000000000000001" }),
    });
    getByCorrelationSidMock.mockReturnValue([
      {
        correlationSid: "CA00000000000000000000000000000001",
        sequenceId: 0,
        track: "inbound_track",
        transcript: "hi",
        datetime: "2026-05-05T10:00:00Z",
        source: "voice",
      },
    ]);
    const res = await GET(new Request("http://t/a"), paramsPromise("u1", "a1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { correlationSid: string; utterances: unknown[] };
    expect(body.correlationSid).toBe("CA00000000000000000000000000000001");
    expect(body.utterances).toHaveLength(1);
  });
});
