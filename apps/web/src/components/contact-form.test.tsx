import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@mobileclient/shared-types";

const { replaceMock, pushMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    session: { userGuid: "u1", userName: "John", userPhone: "+15551111111" },
  }),
}));

vi.mock("@/lib/client/image", () => ({
  fileToAvatarDataUrl: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
}));

import { ContactForm } from "./contact-form";

const fetchMock = vi.fn();

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ContactForm — create", () => {
  it("auto-saves a new contact on Phone blur and replaces URL with /contact/<guid>", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        contactGuid: "contact-new",
        userGuid: "u1",
        firstName: "Alice",
        identities: [{ type: "Phone", value: "+15554443333" }],
      }),
    });

    await user.type(screen.getByLabelText(/First Name/i), "Alice");
    const phone = screen.getByLabelText(/^Phone$/i);
    await user.type(phone, "+15554443333");
    await user.tab(); // blur

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/contact/contact-new"));
  });

  it("does not save when no identity value provided", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText(/First Name/i), "X");
    await user.tab();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ContactForm — edit", () => {
  const initial: Contact = {
    contactGuid: "c1",
    userGuid: "u1",
    firstName: "Emma",
    lastName: "Thompson",
    company: "Tech Corp",
    identities: [{ type: "Phone", value: "+15554443333" }],
  };

  it("pre-fills fields from initial contact", () => {
    render(<ContactForm initial={initial} />);
    expect(screen.getByLabelText(/First Name/i)).toHaveValue("Emma");
    expect(screen.getByLabelText(/Last Name/i)).toHaveValue("Thompson");
    expect(screen.getByLabelText(/Company/i)).toHaveValue("Tech Corp");
    expect(screen.getByLabelText(/^Phone$/i)).toHaveValue("+15554443333");
  });

  it("renders Delete button (no Save — auto-saves on blur)", () => {
    render(<ContactForm initial={initial} />);
    expect(screen.getByRole("button", { name: /Delete contact/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save$/i })).not.toBeInTheDocument();
  });

  it("PUTs an update on field blur", async () => {
    const user = userEvent.setup();
    render(<ContactForm initial={initial} />);

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => initial });

    const firstName = screen.getByLabelText(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Em");
    await user.tab();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/contacts/u1/c1");
    expect(init!.method).toBe("PUT");
  });
});
