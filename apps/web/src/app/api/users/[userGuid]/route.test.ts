import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const deleteUserMock = vi.fn();
const releaseForUserMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    userService: { getUser: getUserMock, updateUser: updateUserMock, deleteUser: deleteUserMock },
    twilioNumberService: { releaseForUser: releaseForUserMock },
  }),
}));

import { NotFoundError } from "@/lib/errors";
import { DELETE, GET, PUT } from "./route";

function paramsPromise(userGuid: string) {
  return { params: Promise.resolve({ userGuid }) };
}

beforeEach(() => {
  getUserMock.mockReset();
  updateUserMock.mockReset();
  deleteUserMock.mockReset();
  releaseForUserMock.mockReset();
});

describe("GET /api/users/:userGuid", () => {
  it("200 on found", async () => {
    getUserMock.mockReturnValue({ userGuid: "u1", name: "J", active: true, created: "2020-01-01T00:00:00Z" });
    const res = await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(res.status).toBe(200);
  });

  it("404 on not found", async () => {
    getUserMock.mockReturnValue(undefined);
    const res = await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/users/:userGuid", () => {
  it("200 on update", async () => {
    updateUserMock.mockReturnValue({
      userGuid: "u1",
      name: "J",
      active: true,
      created: "2020-01-01T00:00:00Z",
    });
    const res = await PUT(
      new Request("http://t/a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Jane" }),
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(200);
    expect(updateUserMock).toHaveBeenCalledWith("u1", { name: "Jane" });
  });

  it("400 on malformed body", async () => {
    const res = await PUT(
      new Request("http://t/a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(400);
  });

  it("404 when update throws NotFoundError", async () => {
    updateUserMock.mockImplementation(() => {
      throw new NotFoundError("gone");
    });
    const res = await PUT(
      new Request("http://t/a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/users/:userGuid", () => {
  it("204 on success and releases the number first", async () => {
    releaseForUserMock.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://t/a", { method: "DELETE" }), paramsPromise("u1"));
    expect(res.status).toBe(204);
    expect(releaseForUserMock).toHaveBeenCalledWith("u1");
    expect(deleteUserMock).toHaveBeenCalledWith("u1");
  });

  it("continues with delete when number release fails", async () => {
    releaseForUserMock.mockRejectedValue(new Error("leak"));
    const res = await DELETE(new Request("http://t/a", { method: "DELETE" }), paramsPromise("u1"));
    expect(res.status).toBe(204);
    expect(deleteUserMock).toHaveBeenCalledWith("u1");
  });
});
