import { beforeEach, describe, expect, it, vi } from "vitest";

const getActivitiesMock = vi.fn();
vi.mock("@/lib/container", () => ({
  getServices: () => ({
    contactService: { getActivities: getActivitiesMock },
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  getActivitiesMock.mockReset();
});

describe("GET /api/activities/:userGuid/by-contact/:contactGuid", () => {
  it("passes {contactGuid} filter to the service", async () => {
    getActivitiesMock.mockReturnValue([]);
    const res = await GET(new Request("http://t/a"), {
      params: Promise.resolve({ userGuid: "u1", contactGuid: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(getActivitiesMock).toHaveBeenCalledWith("u1", { contactGuid: "c1" });
  });
});
