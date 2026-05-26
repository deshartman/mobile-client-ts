import { beforeEach, describe, expect, it, vi } from "vitest";

const getMainListMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    contactService: { getMainList: getMainListMock },
  }),
}));

import { GET } from "./route";

function paramsPromise(userGuid: string) {
  return { params: Promise.resolve({ userGuid }) };
}

beforeEach(() => {
  getMainListMock.mockReset();
});

describe("GET /api/main-list/:userGuid", () => {
  it("returns rows as JSON", async () => {
    getMainListMock.mockReturnValue([
      { kind: "contact", guid: "c1", identities: [], unreadCount: 0 },
    ]);
    const res = await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });

  it("500 on service throw", async () => {
    getMainListMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(res.status).toBe(500);
  });
});
