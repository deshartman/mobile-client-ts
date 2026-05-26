import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import { TranscriptionsRepository } from "./transcriptions-repository";

const VALID_CA = "CA00000000000000000000000000000001";
const VALID_RM = "RM00000000000000000000000000000001";
const VALID_PA = "PA00000000000000000000000000000099";

let db: Database.Database;
let repo: TranscriptionsRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new TranscriptionsRepository(db);
});

describe("TranscriptionsRepository.insertIfAbsent", () => {
  it("inserts a new utterance and returns true", () => {
    const ok = repo.insertIfAbsent({
      correlationSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcript: "Hello",
      confidence: 0.9,
      datetime: "2026-05-05T10:00:00Z",
    });
    expect(ok).toBe(true);
  });

  it("returns false for duplicate (correlation_sid, sequence_id) — webhook retry idempotency", () => {
    const args = {
      correlationSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track" as const,
      transcript: "Hello",
      datetime: "2026-05-05T10:00:00Z",
    };
    expect(repo.insertIfAbsent(args)).toBe(true);
    expect(repo.insertIfAbsent(args)).toBe(false);
  });

  it("different sequence_id on same correlation_sid is a new row", () => {
    repo.insertIfAbsent({
      correlationSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcript: "A",
    });
    const ok = repo.insertIfAbsent({
      correlationSid: VALID_CA,
      sequenceId: 1,
      track: "outbound_track",
      transcript: "B",
    });
    expect(ok).toBe(true);
    expect(repo.getByCorrelationSid(VALID_CA)).toHaveLength(2);
  });

  it("defaults datetime to now when omitted", () => {
    repo.insertIfAbsent({
      correlationSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcript: "A",
    });
    const rows = repo.getByCorrelationSid(VALID_CA);
    expect(rows[0]?.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("persists video utterances with source + participantSid + no track", () => {
    const ok = repo.insertIfAbsent({
      correlationSid: VALID_RM,
      sequenceId: 5,
      transcript: "Hi from video",
      datetime: "2026-05-05T10:00:00Z",
      source: "video",
      participantSid: VALID_PA,
    });
    expect(ok).toBe(true);
    const rows = repo.getByCorrelationSid(VALID_RM);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("video");
    expect(rows[0]?.participantSid).toBe(VALID_PA);
    expect(rows[0]?.track).toBeUndefined();
  });

  it("composite-PK collision is a no-op even across broker + guest writers", () => {
    const args = {
      correlationSid: VALID_RM,
      sequenceId: 0,
      transcript: "duplicate utterance",
      datetime: "2026-05-05T10:00:00Z",
      source: "video" as const,
      participantSid: VALID_PA,
    };
    expect(repo.insertIfAbsent(args)).toBe(true);
    expect(repo.insertIfAbsent(args)).toBe(false);
    expect(repo.getByCorrelationSid(VALID_RM)).toHaveLength(1);
  });
});

describe("TranscriptionsRepository.getByCorrelationSid", () => {
  it("returns rows ordered by sequence_id", () => {
    repo.insertIfAbsent({ correlationSid: VALID_CA, sequenceId: 2, track: "inbound_track", transcript: "C" });
    repo.insertIfAbsent({ correlationSid: VALID_CA, sequenceId: 0, track: "inbound_track", transcript: "A" });
    repo.insertIfAbsent({ correlationSid: VALID_CA, sequenceId: 1, track: "outbound_track", transcript: "B" });
    expect(repo.getByCorrelationSid(VALID_CA).map((r) => r.transcript)).toEqual(["A", "B", "C"]);
  });

  it("returns empty array for unknown correlation_sid", () => {
    expect(repo.getByCorrelationSid("CA99999999999999999999999999999999")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(repo.getByCorrelationSid("")).toEqual([]);
  });

  it("defaults source to 'voice' for older rows", () => {
    repo.insertIfAbsent({
      correlationSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcript: "A",
    });
    expect(repo.getByCorrelationSid(VALID_CA)[0]?.source).toBe("voice");
  });
});
