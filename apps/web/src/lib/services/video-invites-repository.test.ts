import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import { VideoInvitesRepository } from "./video-invites-repository";
import { UserService } from "./user-service";

const VALID_RM = "RM00000000000000000000000000000001";

function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

let db: Database.Database;
let repo: VideoInvitesRepository;
let userGuid: string;

beforeEach(() => {
  db = createTestDb();
  repo = new VideoInvitesRepository(db);
  const users = new UserService(db);
  userGuid = users.createUser({ name: "Broker", twilioNumber: "+15559990000" });
});

describe("VideoInvitesRepository.insert + find", () => {
  it("inserts and reads back by token + by roomSid", () => {
    const token = makeToken();
    const created = repo.insert({
      inviteToken: token,
      userGuid,
      remoteAddress: "+15554443333",
      roomSid: VALID_RM,
      roomName: "video-abc",
      createdAt: "2026-05-05T10:00:00Z",
      expiresAt: "2026-05-05T10:30:00Z",
    });
    expect(created.inviteToken).toBe(token);
    expect(repo.findByToken(token)?.roomSid).toBe(VALID_RM);
    expect(repo.findByRoomSid(VALID_RM)?.inviteToken).toBe(token);
  });

  it("findByToken returns undefined for unknown token", () => {
    expect(repo.findByToken(makeToken())).toBeUndefined();
  });
});

describe("VideoInvitesRepository.markConsumed (single-use atomic)", () => {
  it("first call returns true, second returns false — race-safe", () => {
    const token = makeToken();
    repo.insert({
      inviteToken: token,
      userGuid,
      remoteAddress: "+15554443333",
      roomSid: VALID_RM,
      roomName: "video-abc",
      createdAt: "2026-05-05T10:00:00Z",
      expiresAt: "2026-05-05T10:30:00Z",
    });
    expect(repo.markConsumed(token, "2026-05-05T10:01:00Z")).toBe(true);
    expect(repo.markConsumed(token, "2026-05-05T10:01:01Z")).toBe(false);
    expect(repo.findByToken(token)?.consumedAt).toBe("2026-05-05T10:01:00Z");
  });

  it("returns false for unknown token", () => {
    expect(repo.markConsumed(makeToken(), "2026-05-05T10:00:00Z")).toBe(false);
  });
});

describe("VideoInvitesRepository.markEnded (idempotent webhook)", () => {
  it("first call returns true, second returns false — Twilio retry-safe", () => {
    const token = makeToken();
    repo.insert({
      inviteToken: token,
      userGuid,
      remoteAddress: "+15554443333",
      roomSid: VALID_RM,
      roomName: "video-abc",
      createdAt: "2026-05-05T10:00:00Z",
      expiresAt: "2026-05-05T10:30:00Z",
    });
    expect(repo.markEnded(VALID_RM, "2026-05-05T10:05:00Z")).toBe(true);
    expect(repo.markEnded(VALID_RM, "2026-05-05T10:05:01Z")).toBe(false);
    expect(repo.findByToken(token)?.endedAt).toBe("2026-05-05T10:05:00Z");
  });
});

describe("VideoInvitesRepository.markGuestJoined", () => {
  it("first call returns true, second returns false", () => {
    const token = makeToken();
    repo.insert({
      inviteToken: token,
      userGuid,
      remoteAddress: "+15554443333",
      roomSid: VALID_RM,
      roomName: "video-abc",
      createdAt: "2026-05-05T10:00:00Z",
      expiresAt: "2026-05-05T10:30:00Z",
    });
    expect(repo.markGuestJoined(token, "2026-05-05T10:02:00Z")).toBe(true);
    expect(repo.markGuestJoined(token, "2026-05-05T10:02:01Z")).toBe(false);
    expect(repo.findByToken(token)?.guestJoinedAt).toBe("2026-05-05T10:02:00Z");
  });
});
