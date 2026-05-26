import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readTwilioFormMock,
  getUserByTwilioNumberMock,
  generateIncomingTwimlMock,
  registerIncomingCallMock,
} = vi.hoisted(() => ({
  readTwilioFormMock: vi.fn(),
  getUserByTwilioNumberMock: vi.fn(),
  generateIncomingTwimlMock: vi.fn(),
  registerIncomingCallMock: vi.fn(),
}));

vi.mock("@/lib/twilio-validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio-validate")>(
    "@/lib/twilio-validate",
  );
  return { ...actual, readTwilioForm: readTwilioFormMock };
});

vi.mock("@/lib/container", () => ({
  getServices: () => ({
    userService: { getUserByTwilioNumber: getUserByTwilioNumberMock },
    voiceService: { generateIncomingTwiml: generateIncomingTwimlMock },
    webhookService: { registerIncomingCall: registerIncomingCallMock },
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
  getUserByTwilioNumberMock.mockReset();
  generateIncomingTwimlMock.mockReset();
  registerIncomingCallMock.mockReset();
});

describe("POST /api/voice/incoming", () => {
  it("403 on bad signature", async () => {
    readTwilioFormMock.mockResolvedValue(null);
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("returns fallback TwiML when To owner is not found", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ CallSid: "CA1", From: "+1", To: "+15550000000" }),
      raw: "",
    });
    getUserByTwilioNumberMock.mockReturnValue(undefined);
    generateIncomingTwimlMock.mockReturnValue("<Say>nope</Say>");
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(generateIncomingTwimlMock).toHaveBeenCalledWith(undefined);
    expect(registerIncomingCallMock).not.toHaveBeenCalled();
  });

  it("registers the incoming call and returns client-routed TwiML", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({
        CallSid: "CA00000000000000000000000000000001",
        From: "+15554443333",
        To: "+15559990000",
      }),
      raw: "",
    });
    getUserByTwilioNumberMock.mockReturnValue({ userGuid: "u1", user: {} });
    generateIncomingTwimlMock.mockReturnValue("<Dial><Client>u1</Client></Dial>");
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(registerIncomingCallMock).toHaveBeenCalledWith({
      callSid: "CA00000000000000000000000000000001",
      userGuid: "u1",
      from: "+15554443333",
      to: "+15559990000",
    });
  });

  it("returns fallback when To is missing", async () => {
    readTwilioFormMock.mockResolvedValue({
      params: params({ CallSid: "CA1" }),
      raw: "",
    });
    generateIncomingTwimlMock.mockReturnValue("<Say>nope</Say>");
    const res = await POST(new Request("http://t/a", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(generateIncomingTwimlMock).toHaveBeenCalledWith(undefined);
  });
});
