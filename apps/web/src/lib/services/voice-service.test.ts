import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import { resetEnvCache } from "@/lib/env";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { UserService } from "./user-service";
import { VoiceService } from "./voice-service";

let db: Database.Database;
let users: UserService;
let svc: VoiceService;
let userGuid: string;

beforeEach(() => {
  db = createTestDb();
  users = new UserService(db);
  svc = new VoiceService(users);
  userGuid = users.createUser({
    name: "John",
    twilioNumber: "+15559990000",
  });
  // Clear any transcription leftover from prior tests
  delete process.env.TRANSCRIPTION_ENGINE;
  resetEnvCache();
});

describe("VoiceService.generateToken", () => {
  it("rejects missing userGuid", () => {
    expect(() => svc.generateToken("")).toThrow(ValidationError);
  });

  it("throws NotFoundError when user does not exist", () => {
    expect(() => svc.generateToken("00000000-0000-4000-8000-000000000000")).toThrow(NotFoundError);
  });

  it("returns a token + identity for a known user", () => {
    const result = svc.generateToken(userGuid);
    expect(result.identity).toBe(userGuid);
    expect(result.token.split(".").length).toBe(3); // JWT shape
  });

  it("uses edge region from env when set", () => {
    const saved = process.env.TWILIO_REGION;
    process.env.TWILIO_REGION = "au1";
    try {
      const t = svc.generateToken(userGuid);
      expect(typeof t.token).toBe("string");
    } finally {
      if (saved === undefined) delete process.env.TWILIO_REGION;
      else process.env.TWILIO_REGION = saved;
    }
  });
});

describe("VoiceService.generateIncomingTwiml", () => {
  it("returns a <Say> when identity is missing", () => {
    const xml = svc.generateIncomingTwiml(undefined);
    expect(xml).toContain("<Say>");
    expect(xml).not.toContain("<Dial>");
  });

  it("returns <Dial><Client>{identity}</Client></Dial> when present", () => {
    const xml = svc.generateIncomingTwiml(userGuid);
    expect(xml).toContain("<Dial>");
    expect(xml).toContain(`<Client>${userGuid}</Client>`);
  });

  it("prepends <Start><Transcription> when TRANSCRIPTION_ENGINE set", () => {
    process.env.TRANSCRIPTION_ENGINE = "deepgram";
    resetEnvCache();
    try {
      const xml = svc.generateIncomingTwiml(userGuid);
      expect(xml).toContain("<Transcription");
      expect(xml).toContain('transcriptionEngine="deepgram"');
    } finally {
      delete process.env.TRANSCRIPTION_ENGINE;
      resetEnvCache();
    }
  });
});

describe("VoiceService.generateOutgoingTwiml", () => {
  it("defaults to phone destination", () => {
    const xml = svc.generateOutgoingTwiml({ userGuid, To: "+15551112222" });
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+15551112222");
  });

  it("routes To with URL-decoded leading space as E.164", () => {
    // Express/Twilio URL-decode often turns '+' → ' '. The TwiML builder
    // restores it. We verify the outbound leg carries a leading '+'.
    const xml = svc.generateOutgoingTwiml({ userGuid, To: " 15551112222" });
    expect(xml).toContain("+15551112222");
  });

  it("errors gracefully with an error <Say> on missing phone number", () => {
    // destinationType=phone but no To — builder should catch and return <Say>
    const xml = svc.generateOutgoingTwiml({ userGuid, destinationType: "phone" });
    expect(xml).toContain("<Say>");
    expect(xml).toContain("unable to connect");
  });

  it("errors gracefully when user has no twilio_number", () => {
    const guid = users.createUser({ name: "NoNumber" });
    const xml = svc.generateOutgoingTwiml({ userGuid: guid, To: "+15551112222" });
    expect(xml).toContain("<Say>");
  });

  it("emits caller ID = user's twilioNumber", () => {
    const xml = svc.generateOutgoingTwiml({ userGuid, To: "+15551112222" });
    expect(xml).toContain('callerId="+15559990000"');
  });

  it("custom destinationType emits a <Say> prompt", () => {
    const xml = svc.generateOutgoingTwiml({ userGuid, destinationType: "custom" });
    expect(xml).toContain("<Say>");
  });

  it("assistant destinationType requires assistantSid", () => {
    const xml = svc.generateOutgoingTwiml({ userGuid, destinationType: "assistant" });
    // No assistant sid → error <Say>
    expect(xml).toContain("<Say>");
  });

  it("flex destinationType requires workflow+workspace env", () => {
    // FLEX_WORKFLOW_SID / FLEX_WORKSPACE_SID are not set in test env
    const xml = svc.generateOutgoingTwiml({ userGuid, destinationType: "flex" });
    expect(xml).toContain("<Say>");
  });

  it("throws AppError path: user without number for phone is handled, not raised", () => {
    // Sanity: the TwiML builder is expected to NEVER throw (Twilio retries if
    // it does). It returns error <Say> instead. Verify with an internal-ish
    // failure case.
    const guid = users.createUser({ name: "x" });
    expect(() =>
      svc.generateOutgoingTwiml({ userGuid: guid, To: "+15551112222" }),
    ).not.toThrow(AppError);
  });
});
