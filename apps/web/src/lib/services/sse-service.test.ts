import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SseEvent } from "@mobileclient/shared-types";
import { SseService } from "./sse-service";

const VALID_GUID = "11111111-2222-4333-8444-555555555555";

function makeController() {
  return { enqueue: vi.fn(), close: vi.fn(), error: vi.fn() } as unknown as ReadableStreamDefaultController<Uint8Array>;
}

let svc: SseService;
beforeEach(() => {
  svc = new SseService();
});

describe("SseService.register / unregister", () => {
  it("tracks multiple clients per user", () => {
    const a = makeController();
    const b = makeController();
    svc.register(VALID_GUID, a);
    svc.register(VALID_GUID, b);
    svc.broadcast({
      type: "thread.read",
      userGuid: VALID_GUID,
      payload: {
        threadId: "thr_1",
        remoteAddress: "+15551112222",
        readAt: "2026-05-05T00:00:00Z",
      },
    });
    expect((a.enqueue as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((b.enqueue as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("unregister removes the client and drops the user bucket when empty", () => {
    const a = makeController();
    svc.register(VALID_GUID, a);
    svc.unregister(VALID_GUID, a);
    svc.broadcast({
      type: "thread.read",
      userGuid: VALID_GUID,
      payload: {
        threadId: "thr_1",
        remoteAddress: "+15551112222",
        readAt: "2026-05-05T00:00:00Z",
      },
    });
    expect((a.enqueue as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("unregister is a no-op for unknown client", () => {
    const a = makeController();
    expect(() => svc.unregister(VALID_GUID, a)).not.toThrow();
  });
});

describe("SseService.broadcast", () => {
  it("writes a valid SSE frame: event + data", () => {
    const c = makeController();
    svc.register(VALID_GUID, c);
    const event: SseEvent = {
      type: "thread.read",
      userGuid: VALID_GUID,
      payload: {
        threadId: "thr_1",
        remoteAddress: "+15551112222",
        readAt: "2026-05-05T00:00:00Z",
      },
    };
    svc.broadcast(event);
    const bytes = (c.enqueue as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Uint8Array;
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("event: thread.read\n");
    expect(text).toContain('"threadId":"thr_1"');
    expect(text.endsWith("\n\n")).toBe(true);
  });

  it("is a no-op when no clients are registered for that user", () => {
    expect(() =>
      svc.broadcast({
        type: "thread.read",
        userGuid: VALID_GUID,
        payload: {
          threadId: "thr_1",
          remoteAddress: "+15551112222",
          readAt: "2026-05-05T00:00:00Z",
        },
      }),
    ).not.toThrow();
  });

  it("drops a controller that throws on enqueue (client disconnected)", () => {
    const good = makeController();
    const bad = {
      enqueue: vi.fn(() => {
        throw new Error("disconnected");
      }),
      close: vi.fn(),
      error: vi.fn(),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
    svc.register(VALID_GUID, bad);
    svc.register(VALID_GUID, good);

    svc.broadcast({
      type: "thread.read",
      userGuid: VALID_GUID,
      payload: {
        threadId: "thr_1",
        remoteAddress: "+15551112222",
        readAt: "2026-05-05T00:00:00Z",
      },
    });
    // second broadcast: bad was dropped; only good should receive
    svc.broadcast({
      type: "thread.read",
      userGuid: VALID_GUID,
      payload: {
        threadId: "thr_1",
        remoteAddress: "+15551112222",
        readAt: "2026-05-05T00:00:00Z",
      },
    });
    expect((bad.enqueue as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((good.enqueue as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

describe("SseService.heartbeat", () => {
  it("writes a comment-only frame that browsers ignore for event dispatch", () => {
    const c = makeController();
    svc.register(VALID_GUID, c);
    svc.heartbeat(VALID_GUID);
    const bytes = (c.enqueue as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Uint8Array;
    const text = new TextDecoder().decode(bytes);
    expect(text).toMatch(/^:\s/);
    expect(text.endsWith("\n\n")).toBe(true);
  });

  it("is a no-op for unknown user", () => {
    expect(() => svc.heartbeat(VALID_GUID)).not.toThrow();
  });
});
