import { beforeEach, describe, expect, it, vi } from "vitest";

const completeAuthMock = vi.fn();
const getUserMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    authService: { completeAuth: completeAuthMock },
    userService: { getUser: getUserMock },
  }),
}));

import { NotFoundError } from "@/lib/errors";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://test.local/api/auth/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  completeAuthMock.mockReset();
  getUserMock.mockReset();
});

describe("POST /api/auth/complete", () => {
  it("400 on invalid phone", async () => {
    const res = await POST(req({ phone: "bad" }));
    expect(res.status).toBe(400);
  });

  it("happy path returns { userGuid, user }", async () => {
    completeAuthMock.mockResolvedValue({
      userGuid: "11111111-2222-4333-8444-555555555555",
    });
    getUserMock.mockReturnValue({
      userGuid: "11111111-2222-4333-8444-555555555555",
      name: "John",
      active: true,
      created: "2020-01-01T00:00:00Z",
    });
    const res = await POST(req({ phone: "+15551111111", name: "John" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userGuid: string; user: { name: string } };
    expect(body.user.name).toBe("John");
  });

  it("maps AppError status through (e.g. NotFoundError → 404)", async () => {
    completeAuthMock.mockImplementation(() => {
      throw new NotFoundError("user vanished");
    });
    const res = await POST(req({ phone: "+15551111111", name: "John" }));
    expect(res.status).toBe(404);
  });
});
