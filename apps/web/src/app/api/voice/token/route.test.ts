import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTokenMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    voiceService: { generateToken: generateTokenMock },
  }),
}));

import { NotFoundError } from "@/lib/errors";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://t/a", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  generateTokenMock.mockReset();
});

describe("POST /api/voice/token", () => {
  it("400 on missing userGuid", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns token on success", async () => {
    generateTokenMock.mockReturnValue({ token: "jwt.body.sig", identity: "u1" });
    const res = await POST(req({ userGuid: "11111111-2222-4333-8444-555555555555" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe("jwt.body.sig");
  });

  it("404 when user not found", async () => {
    generateTokenMock.mockImplementation(() => {
      throw new NotFoundError("not found");
    });
    const res = await POST(req({ userGuid: "11111111-2222-4333-8444-555555555555" }));
    expect(res.status).toBe(404);
  });
});
