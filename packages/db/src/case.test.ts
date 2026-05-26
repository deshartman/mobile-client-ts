import { describe, it, expect } from "vitest";
import { rowToCamel, rowsToCamel, snakeToCamel } from "./case";

describe("snakeToCamel", () => {
  it("leaves single-word keys alone", () => {
    expect(snakeToCamel("name")).toBe("name");
  });

  it("converts simple snake_case", () => {
    expect(snakeToCamel("first_name")).toBe("firstName");
  });

  it("converts multi-segment snake_case", () => {
    expect(snakeToCamel("twilio_number_sid")).toBe("twilioNumberSid");
  });

  it("handles empty string", () => {
    expect(snakeToCamel("")).toBe("");
  });
});

describe("rowToCamel", () => {
  it("camelcases top-level keys and preserves values", () => {
    const out = rowToCamel({
      user_guid: "abc",
      first_name: "Emma",
      active: 1,
      company: null,
    });
    expect(out).toEqual({ userGuid: "abc", firstName: "Emma", active: 1, company: null });
  });

  it("returns empty object for empty input", () => {
    expect(rowToCamel({})).toEqual({});
  });

  it("does not recurse into nested values", () => {
    const nested = { inner_key: "stays" };
    const out = rowToCamel({ outer_key: nested });
    expect(out).toEqual({ outerKey: nested });
  });
});

describe("rowsToCamel", () => {
  it("maps each row", () => {
    const out = rowsToCamel([
      { first_name: "A" },
      { first_name: "B" },
    ]);
    expect(out).toEqual([{ firstName: "A" }, { firstName: "B" }]);
  });

  it("handles empty array", () => {
    expect(rowsToCamel([])).toEqual([]);
  });
});
