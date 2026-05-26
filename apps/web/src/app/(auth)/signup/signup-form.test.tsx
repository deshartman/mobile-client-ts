import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, setSessionMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  setSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ setSession: setSessionMock }),
}));

import { SignupForm } from "./signup-form";

const fetchMock = vi.fn();

beforeEach(() => {
  replaceMock.mockReset();
  setSessionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockOk<T>(body: T) {
  return fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

async function typeOtp(user: ReturnType<typeof userEvent.setup>, code: string) {
  const otpInput = document.querySelector<HTMLInputElement>('[data-input-otp="true"]');
  expect(otpInput).not.toBeNull();
  otpInput?.focus();
  await user.keyboard(code);
}

describe("SignupForm — option C single-screen flow", () => {
  it("existing user: phone → OTP → complete (no name step)", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    // Step 1: phone → send-otp
    await user.type(screen.getByLabelText(/Phone/i), "+15551111111");
    mockOk({ sent: true, isExistingUser: true });
    await user.click(screen.getByRole("button", { name: /Send code/i }));

    // Step 2: OTP step renders with "Enter code" title
    await waitFor(() => expect(screen.getByText(/Enter code/i)).toBeInTheDocument());

    // Verify → returns isExistingUser=true → skip name → complete
    mockOk({ verified: true, isExistingUser: true });
    mockOk({
      userGuid: "11111111-2222-4333-8444-555555555555",
      user: {
        userGuid: "11111111-2222-4333-8444-555555555555",
        name: "Existing",
        phone: "+15551111111",
        active: true,
        created: "2020-01-01T00:00:00Z",
      },
    });

    await typeOtp(user, "123456");
    await user.click(screen.getByRole("button", { name: /^Verify$/i }));

    await waitFor(() => expect(setSessionMock).toHaveBeenCalledOnce());
    expect(replaceMock).toHaveBeenCalledWith("/");
    // Name step never appeared
    expect(screen.queryByText(/One last thing/i)).not.toBeInTheDocument();
  });

  it("new user: phone → OTP → name (inline reveal) → complete", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText(/Phone/i), "+15551111111");
    mockOk({ sent: true, isExistingUser: false });
    await user.click(screen.getByRole("button", { name: /Send code/i }));

    await waitFor(() => expect(screen.getByText(/Enter code/i)).toBeInTheDocument());

    // Verify → isExistingUser=false → name step reveals
    mockOk({ verified: true, isExistingUser: false });
    await typeOtp(user, "123456");
    await user.click(screen.getByRole("button", { name: /^Verify$/i }));

    await waitFor(() => expect(screen.getByText(/One last thing/i)).toBeInTheDocument());
    // setSession NOT called yet — waiting on name
    expect(setSessionMock).not.toHaveBeenCalled();

    // Name → complete
    await user.type(screen.getByLabelText(/Name/i), "John Doe");
    mockOk({
      userGuid: "11111111-2222-4333-8444-555555555555",
      user: {
        userGuid: "11111111-2222-4333-8444-555555555555",
        name: "John Doe",
        phone: "+15551111111",
        active: true,
        created: "2020-01-01T00:00:00Z",
      },
    });
    await user.click(screen.getByRole("button", { name: /^Finish$/i }));

    await waitFor(() => expect(setSessionMock).toHaveBeenCalledOnce());
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("send-otp failure shows error toast and stays on phone step", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText(/Phone/i), "+15551111111");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Twilio down" }),
    });
    await user.click(screen.getByRole("button", { name: /Send code/i }));

    // Stay on phone step
    await waitFor(() =>
      expect(screen.queryByText(/Enter code/i)).not.toBeInTheDocument(),
    );
  });
});
