import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTwilioFormMock, generateOutgoingTwimlMock, registerOutboundCallMock } = vi.hoisted(
  () => ({
    readTwilioFormMock: vi.fn(),
    generateOutgoingTwimlMock: vi.fn(),
    registerOutboundCallMock: vi.fn(),
  }),
);

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    voiceService: { generateOutgoingTwiml: generateOutgoingTwimlMock },
    webhookService: { registerOutboundCall: registerOutboundCallMock },
  }),
}));

import { POST } from "./route";

function params(entries: Record<string, string>): URLSearchParams {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) u.set(k, v);
  return u;
}

beforeEach(() => {
  readTwilioFormMock.mockReset();
  generateOutgoingTwimlMock.mockReset();
  registerOutboundCallMock.mockReset();
});

describe("POST /api/voice/outgoing", () => {
  it("returns 403 TwiML when signature validation fails", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Unauthorized");
  });

  it("registers outbound call for phone destination with CallSid + userGuid + To", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        CallSid: "CA00000000000000000000000000000001",
        userGuid: "u1",
        To: "+15551112222",
      }),
      raw: "",
    });
    generateOutgoingTwimlMock.mockReturnValue("<Response/>");
    await POST(new Request("http://t/a", { method: "POST" }));
    expect(registerOutboundCallMock).toHaveBeenCalledWith({
      callSid: "CA00000000000000000000000000000001",
      userGuid: "u1",
      to: "+15551112222",
      contactGuid: undefined,
    });
  });

  it("does NOT register when destinationType is not phone", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        CallSid: "CA00000000000000000000000000000001",
        userGuid: "u1",
        To: "+1",
        destinationType: "assistant",
      }),
      raw: "",
    });
    generateOutgoingTwimlMock.mockReturnValue("<Response/>");
    await POST(new Request("http://t/a", { method: "POST" }));
    expect(registerOutboundCallMock).not.toHaveBeenCalled();
  });

  it("returns the TwiML produced by the service", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ userGuid: "u1", To: "+1", destinationType: "phone" }),
      raw: "",
    });
    generateOutgoingTwimlMock.mockReturnValue("<Response>hello</Response>");
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(await res.text()).toContain("<Response>hello</Response>");
  });

  it("falls back to empty TwiML if the service throws", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ userGuid: "u1", To: "+1", destinationType: "phone" }),
      raw: "",
    });
    generateOutgoingTwimlMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<Response/>");
  });
});
