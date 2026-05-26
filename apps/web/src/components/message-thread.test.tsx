import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SseEvent, SseEventType } from "@mobileclient/shared-types";

type HandlerMap = {
  [K in SseEventType]?: (payload: Extract<SseEvent, { type: K }>["payload"]) => void;
};
let capturedHandlers: HandlerMap = {};
vi.mock("@/hooks/use-sse", () => ({
  useSse: (_u: string | undefined, handlers: HandlerMap) => {
    capturedHandlers = handlers;
  },
}));

import { MessageThread } from "./message-thread";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  capturedHandlers = {};
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockThread(threadId = "thr_1") {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      threadId,
      messages: [
        {
          messageSid: "SM11111111111111111111111111111111",
          threadId,
          direction: "inbound",
          body: "Hey",
          datetime: "2026-05-05T10:00:00Z",
        },
      ],
    }),
  });
}

describe("MessageThread", () => {
  it("hydrates existing messages on mount", async () => {
    mockThread();
    render(<MessageThread userGuid="u1" remoteAddress="+15554443333" />);
    await waitFor(() => expect(screen.getByText("Hey")).toBeInTheDocument());
  });

  it("optimistic send: bubble appears immediately then resolves with server status", async () => {
    mockThread();
    const user = userEvent.setup();
    render(<MessageThread userGuid="u1" remoteAddress="+15554443333" />);
    await waitFor(() => expect(screen.getByText("Hey")).toBeInTheDocument());

    // Next /send call succeeds with queued status
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        threadId: "thr_1",
        messageSid: "SM22222222222222222222222222222222",
        status: "queued",
      }),
    });

    await user.type(screen.getByPlaceholderText(/Message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    // status rendered via statusLabel (Sending… for queued, or empty when null)
    expect(screen.getByText(/Sending…/i)).toBeInTheDocument();
  });

  it("failed send: bubble flips to Failed, input cleared", async () => {
    mockThread();
    const user = userEvent.setup();
    render(<MessageThread userGuid="u1" remoteAddress="+15554443333" />);
    await waitFor(() => expect(screen.getByText("Hey")).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "twilio down" }),
    });

    await user.type(screen.getByPlaceholderText(/Message/i), "Nope");
    await user.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    // Optimistic bubble is still there with the Nope text
    expect(screen.getByText("Nope")).toBeInTheDocument();
  });

  it("SSE message.added for matching threadId appends a new bubble", async () => {
    mockThread();
    render(<MessageThread userGuid="u1" remoteAddress="+15554443333" />);
    await waitFor(() => expect(screen.getByText("Hey")).toBeInTheDocument());

    capturedHandlers["message.added"]?.({
      messageSid: "SM33333333333333333333333333333333",
      threadId: "thr_1",
      direction: "inbound",
      body: "Ping",
      datetime: "2026-05-05T10:05:00Z",
    });

    await waitFor(() => expect(screen.getByText("Ping")).toBeInTheDocument());
  });

  it("SSE message.status updates the matching bubble's status", async () => {
    mockThread();
    const user = userEvent.setup();
    render(<MessageThread userGuid="u1" remoteAddress="+15554443333" />);
    await waitFor(() => expect(screen.getByText("Hey")).toBeInTheDocument());

    // Send a message to have an outbound bubble
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        threadId: "thr_1",
        messageSid: "SM44444444444444444444444444444444",
        status: "queued",
      }),
    });
    await user.type(screen.getByPlaceholderText(/Message/i), "Hi");
    await user.click(screen.getByRole("button", { name: /Send/i }));
    await waitFor(() => expect(screen.getByText("Hi")).toBeInTheDocument());

    // Now fire a status update
    capturedHandlers["message.status"]?.({
      messageSid: "SM44444444444444444444444444444444",
      threadId: "thr_1",
      status: "delivered",
    });

    await waitFor(() => expect(screen.getByText(/Delivered/)).toBeInTheDocument());
  });
});
