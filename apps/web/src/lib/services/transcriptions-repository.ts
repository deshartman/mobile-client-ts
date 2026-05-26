import type Database from "better-sqlite3";
import { rowToCamel } from "@mobileclient/db";
import {
  TranscriptionSchema,
  type Transcription,
  type TranscriptionSource,
  type TranscriptionTrack,
} from "@mobileclient/shared-types";

export interface InsertTranscriptionInput {
  correlationSid: string;
  sequenceId: number;
  track?: TranscriptionTrack;
  transcript: string;
  confidence?: number;
  datetime?: string;
  source?: TranscriptionSource;
  participantSid?: string;
}

export class TranscriptionsRepository {
  private readonly insertStmt;
  private readonly selectByCorrelationSidStmt;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO transcriptions
          (correlation_sid, sequence_id, track, transcript, confidence, datetime, source, participant_sid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectByCorrelationSidStmt = db.prepare(
      "SELECT * FROM transcriptions WHERE correlation_sid = ? ORDER BY sequence_id ASC",
    );
  }

  insertIfAbsent(input: InsertTranscriptionInput): boolean {
    const result = this.insertStmt.run(
      input.correlationSid,
      input.sequenceId,
      input.track ?? null,
      input.transcript,
      input.confidence ?? null,
      input.datetime ?? new Date().toISOString(),
      input.source ?? "voice",
      input.participantSid ?? null,
    );
    return result.changes > 0;
  }

  getByCorrelationSid(correlationSid: string): Transcription[] {
    if (!correlationSid) return [];
    const rows = this.selectByCorrelationSidStmt.all(correlationSid) as Record<string, unknown>[];
    return rows.map((r) => TranscriptionSchema.parse(rowToCamel(r)));
  }
}
