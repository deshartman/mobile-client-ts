import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, NotFoundError, TwilioRestError, ValidationError } from "./errors";
import { errorResponse, parseJson, zodErrorResponse } from "./http";

describe("errorResponse", () => {
  it("unwraps an AppError into { error, status, details? }", async () => {
    const res = errorResponse(new NotFoundError("missing", { guid: "x" }), "test");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; details: { guid: string } };
    expect(body.error).toBe("missing");
    expect(body.details.guid).toBe("x");
  });

  it("omits details when AppError has none", async () => {
    const res = errorResponse(new AppError("boom"), "test");
    const body = (await res.json()) as { error: string; details?: unknown };
    expect(body.details).toBeUndefined();
  });

  it("wraps a non-AppError as 500 with message", async () => {
    const res = errorResponse(new Error("generic"), "test");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("generic");
  });

  it("handles non-Error throws gracefully", async () => {
    const res = errorResponse("string thrown", "test");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("string thrown");
  });

  it("TwilioRestError surfaces twilioCode in details + 502 status", async () => {
    const err = new TwilioRestError("twilio said no", { twilioCode: 21610, stage: "purchase" });
    const res = errorResponse(err, "test");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { details: { twilioCode: number } };
    expect(body.details.twilioCode).toBe(21610);
  });
});

describe("zodErrorResponse", () => {
  it("returns 400 with a flattened error body", async () => {
    const schema = z.object({ phone: z.string() });
    const parsed = schema.safeParse({ phone: 42 });
    if (parsed.success) throw new Error("shouldn't parse");
    const res = zodErrorResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Invalid request body");
    expect(body.details).toBeDefined();
  });
});

describe("parseJson", () => {
  const schema = z.object({ phone: z.string() });

  function makeReq(body: string): Request {
    return new Request("https://test.local/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  it("returns parsed data on valid body", async () => {
    const result = await parseJson(makeReq('{"phone":"+15551111111"}'), schema);
    expect(result).toEqual({ phone: "+15551111111" });
  });

  it("returns 400 Response on malformed JSON", async () => {
    const result = await parseJson(makeReq("not-json"), schema);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  it("returns 400 Response on schema mismatch", async () => {
    const result = await parseJson(makeReq('{"phone":42}'), schema);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  it("throws ValidationError unused — verifies ValidationError can still be constructed", () => {
    // Covers errors.ts usage line for coverage
    expect(() => {
      throw new ValidationError("x");
    }).toThrow(ValidationError);
  });
});
