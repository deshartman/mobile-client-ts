import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, SseEventType } from "@mobileclient/shared-types";
import { useSse } from "./use-sse";

// Capture EventSource instances created by the hook so we can fire events at them.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: EventListener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn as (ev: MessageEvent) => void);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: EventListener): void {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((f) => f !== (fn as unknown)),
    );
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    const fns = this.listeners.get(type) ?? [];
    for (const fn of fns) fn(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness({
  userGuid,
  onActivity,
}: {
  userGuid: string | undefined;
  onActivity?: (a: Activity) => void;
}) {
  useSse(userGuid, {
    "activity.added": (payload) => onActivity?.(payload),
  });
  return null;
}

describe("useSse", () => {
  it("opens an EventSource to /api/events/:userGuid", () => {
    render(<Harness userGuid="u1" />);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain("/api/events/u1");
  });

  it("dispatches to the matching handler by event type", () => {
    const onActivity = vi.fn();
    render(<Harness userGuid="u1" onActivity={onActivity} />);
    const es = FakeEventSource.instances[0]!;
    es.emit("activity.added", {
      id: "a1",
      userGuid: "u1",
      type: "Phone",
      datetime: "2026-05-05T10:00:00Z",
      duration: 1,
    });
    expect(onActivity).toHaveBeenCalledOnce();
    const arg = onActivity.mock.calls[0]?.[0];
    expect(arg.id).toBe("a1");
  });

  it("ignores malformed JSON silently", () => {
    const onActivity = vi.fn();
    render(<Harness userGuid="u1" onActivity={onActivity} />);
    const es = FakeEventSource.instances[0]!;
    const fns = es.listeners.get("activity.added" as SseEventType) ?? [];
    // Fire a MessageEvent whose data is not valid JSON
    for (const fn of fns) fn(new MessageEvent("activity.added", { data: "not-json" }));
    expect(onActivity).not.toHaveBeenCalled();
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = render(<Harness userGuid="u1" />);
    const es = FakeEventSource.instances[0]!;
    unmount();
    expect(es.closed).toBe(true);
  });

  it("does not open a connection when userGuid is undefined", () => {
    render(<Harness userGuid={undefined} />);
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
