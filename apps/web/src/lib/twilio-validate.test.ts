import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "./env";
import { readTwilioForm, twimlResponse, EMPTY_TWIML, FORBIDDEN_TWIML } from "./twilio-validate";

const validateRequestMock = vi.fn();
vi.mock("twilio", () => ({
  default: {
    validateRequest: (...args: unknown[]) => validateRequestMock(...args),
  },
}));

function makeReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://test.local/api/webhooks/messaging/inbound", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  validateRequestMock.mockReset();
});

describe("readTwilioForm", () => {
  it("bypasses validation when TWILIO_AUTH_TOKEN is unset", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    resetEnvCache();
    try {
      const result = await readTwilioForm(makeReq("From=%2B15551111111&Body=hey"));
      expect(result).toBeTruthy();
      expect(result!.params.get("From")).toBe("+15551111111");
      expect(result!.params.get("Body")).toBe("hey");
      expect(validateRequestMock).not.toHaveBeenCalled();
    } finally {
      process.env.TWILIO_AUTH_TOKEN = "test_auth_token";
      resetEnvCache();
    }
  });

  it("returns null when signature header is missing (token set)", async () => {
    const result = await readTwilioForm(makeReq("From=%2B15551111111"));
    expect(result).toBeNull();
  });

  it("returns null when validateRequest returns false", async () => {
    validateRequestMock.mockReturnValue(false);
    const result = await readTwilioForm(
      makeReq("From=%2B15551111111", { "x-twilio-signature": "bogus" }),
    );
    expect(result).toBeNull();
  });

  it("returns { params, raw } when validateRequest returns true", async () => {
    validateRequestMock.mockReturnValue(true);
    const result = await readTwilioForm(
      makeReq("From=%2B15551111111&Body=ok", { "x-twilio-signature": "good" }),
    );
    expect(result).toBeTruthy();
    expect(result!.params.get("From")).toBe("+15551111111");
    expect(result!.raw).toBe("From=%2B15551111111&Body=ok");
  });

  it("passes the full SERVER_BASE_URL + pathname to validateRequest", async () => {
    validateRequestMock.mockReturnValue(true);
    await readTwilioForm(
      makeReq("x=1", { "x-twilio-signature": "good" }),
    );
    const [authToken, sig, url, params] = validateRequestMock.mock.calls[0] ?? [];
    expect(authToken).toBe("test_auth_token");
    expect(sig).toBe("good");
    expect(url).toBe("https://test.local/api/webhooks/messaging/inbound");
    expect(params).toEqual({ x: "1" });
  });
});

describe("twimlResponse", () => {
  it("returns a Response with text/xml content type", () => {
    const res = twimlResponse(EMPTY_TWIML);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(res.status).toBe(200);
  });

  it("honours custom status", () => {
    const res = twimlResponse(FORBIDDEN_TWIML, 403);
    expect(res.status).toBe(403);
  });
});
