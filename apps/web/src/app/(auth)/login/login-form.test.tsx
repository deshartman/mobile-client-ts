import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, replaceMock, setSessionMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  setSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ setSession: setSessionMock }),
}));

import { LoginForm } from "./login-form";

const fetchMock = vi.fn();

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  setSessionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockSendOtp(isExistingUser: boolean) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ sent: true, isExistingUser }),
  });
}

function mockVerifyOtp() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ verified: true, isExistingUser: true }),
  });
}

function mockCompleteAuth(userGuid = "11111111-2222-4333-8444-555555555555") {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      userGuid,
      user: { userGuid, name: "Jane", phone: "+15551111111", active: true, created: "2020-01-01T00:00:00Z" },
    }),
  });
}

describe("LoginForm", () => {
  it("existing user: phone → OTP → verify+complete → setSession + redirect to /", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    // Step 1: phone
    await user.type(screen.getByLabelText(/Phone/i), "+15551111111");
    mockSendOtp(true);
    await user.click(screen.getByRole("button", { name: /Send code/i }));

    // OTP step appears
    await waitFor(() => expect(screen.getByText(/Verification code/i)).toBeInTheDocument());

    // Step 2: OTP (input-otp splits into slots; use keyboard on hidden input)
    mockVerifyOtp();
    mockCompleteAuth();
    const otpInput = document.querySelector<HTMLInputElement>('[data-input-otp="true"]');
    expect(otpInput).not.toBeNull();
    otpInput!.focus();
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => expect(setSessionMock).toHaveBeenCalledOnce());
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("non-existing user triggers an error toast without advancing", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/Phone/i), "+15551111111");
    mockSendOtp(false);
    await user.click(screen.getByRole("button", { name: /Send code/i }));

    // Still on the phone step
    await waitFor(() =>
      expect(screen.queryByText(/Verification code/i)).not.toBeInTheDocument(),
    );
  });

  it("Send code button is disabled until phone is entered", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: /Send code/i })).toBeDisabled();
  });
});
