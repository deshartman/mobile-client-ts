import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MainListRow } from "@mobileclient/shared-types";

// SSE hook: noop for these tests; we verify rendering from /api/main-list.
vi.mock("@/hooks/use-sse", () => ({
  useSse: () => {},
}));

// next/navigation's useRouter otherwise throws "expected app router to be
// mounted" outside the Next app shell. ListRow uses push() for nav.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { MainList } from "./main-list";
import { CallOverlayProvider } from "@/hooks/use-call-overlay";
import { SessionProvider } from "@/hooks/use-session";
import { VideoOverlayProvider } from "@/hooks/use-video-overlay";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SessionProvider>
      <CallOverlayProvider>
        <VideoOverlayProvider>{ui}</VideoOverlayProvider>
      </CallOverlayProvider>
    </SessionProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockRows(rows: MainListRow[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => rows,
  });
}

describe("MainList", () => {
  it("shows a loading placeholder initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<MainList userGuid="u1" />);
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it("renders contact row with initials and unread dot", async () => {
    mockRows([
      {
        kind: "contact",
        guid: "c1",
        firstName: "Emma",
        lastName: "Thompson",
        company: "Tech Corp",
        identities: [],
        lastInteractedAt: "2026-05-05T10:15:00Z",
        unreadCount: 3,
      },
    ]);
    renderWithProviders(<MainList userGuid="u1" />);
    await waitFor(() => expect(screen.getByText("Emma Thompson")).toBeInTheDocument());
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    expect(screen.getByLabelText(/3 unread/i)).toBeInTheDocument();
    expect(screen.getByText(/ET/i)).toBeInTheDocument();
  });

  it("renders unknown row with identityValue and '?' avatar", async () => {
    mockRows([
      {
        kind: "unknown",
        identities: [],
        identityValue: "+15554443333",
        lastInteractedAt: "2026-05-05T10:15:00Z",
        unreadCount: 0,
      },
    ]);
    renderWithProviders(<MainList userGuid="u1" />);
    await waitFor(() => expect(screen.getByText("+15554443333")).toBeInTheDocument());
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("empty state message when 0 rows", async () => {
    mockRows([]);
    renderWithProviders(<MainList userGuid="u1" />);
    await waitFor(() =>
      expect(screen.getByText(/No contacts yet/i)).toBeInTheDocument(),
    );
  });

  it("error state when fetch rejects", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    renderWithProviders(<MainList userGuid="u1" />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("renders one row per main-list entry as an expandable button", async () => {
    mockRows([
      {
        kind: "contact",
        guid: "c1",
        firstName: "Alice",
        identities: [],
        lastInteractedAt: undefined,
        unreadCount: 0,
      },
      {
        kind: "unknown",
        identities: [],
        identityValue: "+15559999999",
        lastInteractedAt: undefined,
        unreadCount: 0,
      },
    ]);
    renderWithProviders(<MainList userGuid="u1" />);
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    // Each row is a toggle button (not a link); the drawer reveals
    // per-row actions (Call/Message/WhatsApp/Video/Group). Activity
    // moved out of the drawer to its own icon in the row header.
    expect(screen.getByRole("button", { name: /Alice/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+15559999999/ })).toBeInTheDocument();
  });
});
