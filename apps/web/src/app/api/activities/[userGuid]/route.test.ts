import { beforeEach, describe, expect, it, vi } from "vitest";

const getActivitiesMock = vi.fn();
const addActivityMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    contactService: { getActivities: getActivitiesMock, addActivity: addActivityMock },
  }),
}));

import { GET, POST } from "./route";

function paramsPromise(userGuid: string) {
  return { params: Promise.resolve({ userGuid }) };
}

beforeEach(() => {
  getActivitiesMock.mockReset();
  addActivityMock.mockReset();
});

describe("GET /api/activities/:userGuid", () => {
  it("returns activities", async () => {
    getActivitiesMock.mockReturnValue([
      { id: "a1", userGuid: "u1", type: "Phone", datetime: "2026-05-05T00:00:00Z", duration: 1 },
    ]);
    const res = await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/activities/:userGuid", () => {
  it("400 on bad body", async () => {
    const res = await POST(
      new Request("http://t/a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "Bogus" }),
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(400);
  });

  it("201 on create", async () => {
    addActivityMock.mockReturnValue({
      id: "a1",
      userGuid: "u1",
      type: "Phone",
      datetime: "2026-05-05T00:00:00Z",
      duration: 2,
    });
    const res = await POST(
      new Request("http://t/a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "Phone", duration: 2 }),
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(201);
  });
});
