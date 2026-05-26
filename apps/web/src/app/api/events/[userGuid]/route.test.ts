import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerMock = vi.fn();
const unregisterMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    sseService: { register: registerMock, unregister: unregisterMock },
  }),
}));

import { GET } from "./route";

function paramsPromise(userGuid: string) {
  return { params: Promise.resolve({ userGuid }) };
}

beforeEach(() => {
  registerMock.mockReset();
  unregisterMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/events/:userGuid", () => {
  it("returns a Response with SSE headers and registers the client", async () => {
    const controller = new AbortController();
    const req = new Request("http://t/a", { signal: controller.signal });
    const res = await GET(req, paramsPromise("u1"));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    // Start the stream by reading first chunk so the `start()` callback fires
    const reader = res.body!.getReader();
    await reader.read();
    expect(registerMock).toHaveBeenCalledOnce();

    // Abort cleans up
    controller.abort();
    expect(unregisterMock).toHaveBeenCalledOnce();
  });
});
