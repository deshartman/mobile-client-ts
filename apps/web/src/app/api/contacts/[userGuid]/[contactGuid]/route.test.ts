import { beforeEach, describe, expect, it, vi } from "vitest";

const getContactMock = vi.fn();
const updateContactMock = vi.fn();
const deleteContactMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    contactService: {
      getContact: getContactMock,
      updateContact: updateContactMock,
      deleteContact: deleteContactMock,
    },
  }),
}));

import { DELETE, GET, PUT } from "./route";

function paramsPromise(userGuid: string, contactGuid: string) {
  return { params: Promise.resolve({ userGuid, contactGuid }) };
}

beforeEach(() => {
  getContactMock.mockReset();
  updateContactMock.mockReset();
  deleteContactMock.mockReset();
});

describe("GET", () => {
  it("200 on found", async () => {
    getContactMock.mockReturnValue({ contactGuid: "c1", userGuid: "u1", identities: [] });
    const res = await GET(new Request("http://t/a"), paramsPromise("u1", "c1"));
    expect(res.status).toBe(200);
  });

  it("404 on missing", async () => {
    getContactMock.mockReturnValue(undefined);
    const res = await GET(new Request("http://t/a"), paramsPromise("u1", "c1"));
    expect(res.status).toBe(404);
  });
});

describe("PUT", () => {
  it("200 on successful update", async () => {
    updateContactMock.mockReturnValue(undefined);
    getContactMock.mockReturnValue({
      contactGuid: "c1",
      userGuid: "u1",
      firstName: "Jane",
      identities: [],
    });
    const res = await PUT(
      new Request("http://t/a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Jane" }),
      }),
      paramsPromise("u1", "c1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE", () => {
  it("204 on deleted", async () => {
    deleteContactMock.mockReturnValue(true);
    const res = await DELETE(new Request("http://t/a", { method: "DELETE" }), paramsPromise("u1", "c1"));
    expect(res.status).toBe(204);
  });

  it("404 when nothing was deleted", async () => {
    deleteContactMock.mockReturnValue(false);
    const res = await DELETE(new Request("http://t/a", { method: "DELETE" }), paramsPromise("u1", "c1"));
    expect(res.status).toBe(404);
  });
});
