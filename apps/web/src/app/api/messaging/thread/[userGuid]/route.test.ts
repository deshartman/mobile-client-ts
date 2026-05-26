import { beforeEach, describe, expect, it, vi } from "vitest";

const getThreadMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    messagingService: { getThread: getThreadMock },
  }),
}));

import { GET } from "./route";

function paramsPromise(userGuid: string) {
  return { params: Promise.resolve({ userGuid }) };
}

beforeEach(() => {
  getThreadMock.mockReset();
});

describe("GET /api/messaging/thread/:userGuid?to=", () => {
  it("passes the to query string through to the service", async () => {
    getThreadMock.mockReturnValue({ messages: [] });
    const res = await GET(
      new Request("http://t/a?to=%2B15551111111"),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(200);
    expect(getThreadMock).toHaveBeenCalledWith("u1", "+15551111111");
  });

  it("defaults to empty string when no to= param", async () => {
    getThreadMock.mockReturnValue({ messages: [] });
    await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(getThreadMock).toHaveBeenCalledWith("u1", "");
  });
});
