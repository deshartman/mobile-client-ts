import { act, render, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionProvider, useSession } from "./use-session";

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("useSession", () => {
  it("throws when used outside a SessionProvider", () => {
    // Render a consumer without the provider — the hook should throw
    const Consumer = () => {
      useSession();
      return null;
    };
    expect(() => render(<Consumer />)).toThrow(/useSession/);
  });

  it("initially ready=true and session=null when sessionStorage is empty", async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    // ready flips true after first useEffect
    await act(async () => {});
    expect(result.current.ready).toBe(true);
    expect(result.current.session).toBeNull();
  });

  it("loads existing sessionStorage values on mount", async () => {
    sessionStorage.setItem("userGUID", "u1");
    sessionStorage.setItem("userName", "Jane");
    sessionStorage.setItem("userPhone", "+15551111111");

    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {});
    expect(result.current.session).toEqual({
      userGuid: "u1",
      userName: "Jane",
      userPhone: "+15551111111",
    });
  });

  it("setSession persists to sessionStorage and updates state", async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {});

    act(() => {
      result.current.setSession({ userGuid: "u2", userName: "X", userPhone: "+15552222222" });
    });

    expect(result.current.session?.userGuid).toBe("u2");
    expect(sessionStorage.getItem("userGUID")).toBe("u2");
  });

  it("clear removes from sessionStorage and nulls state", async () => {
    sessionStorage.setItem("userGUID", "u1");
    sessionStorage.setItem("userName", "Jane");
    sessionStorage.setItem("userPhone", "+15551111111");
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {});

    act(() => result.current.clear());
    expect(result.current.session).toBeNull();
    expect(sessionStorage.getItem("userGUID")).toBeNull();
  });
});
