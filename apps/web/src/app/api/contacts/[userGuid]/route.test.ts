import { beforeEach, describe, expect, it, vi } from "vitest";

const getContactsMock = vi.fn();
const createContactMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    contactService: { getContacts: getContactsMock, createContact: createContactMock },
  }),
}));

import { GET, POST } from "./route";

function paramsPromise(userGuid: string) {
  return { params: Promise.resolve({ userGuid }) };
}

beforeEach(() => {
  getContactsMock.mockReset();
  createContactMock.mockReset();
});

describe("GET /api/contacts/:userGuid", () => {
  it("returns the service result as JSON", async () => {
    getContactsMock.mockReturnValue([{ contactGuid: "c1", userGuid: "u1", identities: [] }]);
    const res = await GET(new Request("http://t/a"), paramsPromise("u1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/contacts/:userGuid", () => {
  it("400 without required identities", async () => {
    const res = await POST(
      new Request("http://t/a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "X" }),
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(400);
  });

  it("201 on valid create", async () => {
    createContactMock.mockReturnValue({
      contactGuid: "c1",
      userGuid: "u1",
      firstName: "X",
      identities: [{ type: "Phone", value: "+1" }],
    });
    const res = await POST(
      new Request("http://t/a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "X",
          identities: [{ type: "Phone", value: "+1" }],
        }),
      }),
      paramsPromise("u1"),
    );
    expect(res.status).toBe(201);
  });
});
