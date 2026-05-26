import { beforeEach, describe, expect, it, vi } from "vitest";

const findThreadByIdMock = vi.fn();
const markThreadReadMock = vi.fn();
const broadcastMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    messagesRepo: {
      findThreadById: findThreadByIdMock,
      markThreadRead: markThreadReadMock,
    },
    sseService: { broadcast: broadcastMock },
  }),
}));

import { POST } from "./route";

function paramsPromise(userGuid: string, threadId: string) {
  return { params: Promise.resolve({ userGuid, threadId }) };
}

beforeEach(() => {
  findThreadByIdMock.mockReset();
  markThreadReadMock.mockReset();
  broadcastMock.mockReset();
});

describe("POST /api/messaging/thread/:userGuid/:threadId/read", () => {
  it("404 when thread not found", async () => {
    findThreadByIdMock.mockReturnValue(undefined);
    const res = await POST(new Request("http://t/a", { method: "POST" }), paramsPromise("u1", "thr_1"));
    expect(res.status).toBe(404);
  });

  it("404 when thread belongs to a different user", async () => {
    findThreadByIdMock.mockReturnValue({
      threadId: "thr_1",
      userGuid: "someone-else",
      remoteAddress: "+1",
      proxyAddress: "+2",
      created: "2026-05-05T00:00:00Z",
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }), paramsPromise("u1", "thr_1"));
    expect(res.status).toBe(404);
  });

  it("broadcasts thread.read when markedCount > 0", async () => {
    findThreadByIdMock.mockReturnValue({
      threadId: "thr_1",
      userGuid: "u1",
      remoteAddress: "+1",
      proxyAddress: "+2",
      created: "2026-05-05T00:00:00Z",
    });
    markThreadReadMock.mockReturnValue(3);
    const res = await POST(new Request("http://t/a", { method: "POST" }), paramsPromise("u1", "thr_1"));
    expect(res.status).toBe(200);
    expect(broadcastMock).toHaveBeenCalledOnce();
    const event = broadcastMock.mock.calls[0]?.[0];
    expect(event.type).toBe("thread.read");
    const body = (await res.json()) as { markedCount: number };
    expect(body.markedCount).toBe(3);
  });

  it("does NOT broadcast when markedCount=0", async () => {
    findThreadByIdMock.mockReturnValue({
      threadId: "thr_1",
      userGuid: "u1",
      remoteAddress: "+1",
      proxyAddress: "+2",
      created: "2026-05-05T00:00:00Z",
    });
    markThreadReadMock.mockReturnValue(0);
    await POST(new Request("http://t/a", { method: "POST" }), paramsPromise("u1", "thr_1"));
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});
