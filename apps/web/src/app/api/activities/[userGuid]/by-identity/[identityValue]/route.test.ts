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

describe("GET /api/activities/:userGuid/by-identity/:identityValue", () => {
  it("URL-decodes the identityValue before delegating", async () => {
    getActivitiesMock.mockReturnValue([]);
    const res = await GET(new Request("http://t/a"), {
      params: Promise.resolve({
        userGuid: "u1",
        identityValue: encodeURIComponent("+1 (555) 444-3333"),
      }),
    });
    expect(res.status).toBe(200);
    expect(getActivitiesMock).toHaveBeenCalledWith("u1", {
      identityValue: "+1 (555) 444-3333",
    });
  });
});
