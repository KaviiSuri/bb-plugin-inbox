// Verifications and Laters in the plugin's own SQLite database: the latest of
// each per thread.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  diffBaseSchema,
  prChecksStateSchema,
  type Later,
  type Verification,
} from "../../shared/inbox-verification.js";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;

/** Append-only: never edit or reorder a shipped statement. */
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS verifications (
    thread_id TEXT PRIMARY KEY,
    verified_at INTEGER NOT NULL,
    client TEXT NOT NULL,
    diff_base TEXT,
    pr_checks_state TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS laters (
    thread_id TEXT PRIMARY KEY,
    later_at INTEGER NOT NULL,
    client TEXT NOT NULL
  )`,
];

interface VerificationRow {
  thread_id: string;
  verified_at: number;
  client: string;
  diff_base: string | null;
  pr_checks_state: string | null;
}

interface LaterRow {
  thread_id: string;
  later_at: number;
  client: string;
}

export function createSignOffStore(bb: BbPluginApi) {
  let db: Database | null = null;
  function open(): Database {
    if (!db) {
      db = bb.storage.database();
      bb.storage.migrate(db, MIGRATIONS);
    }
    return db;
  }

  function placeholders(count: number): string {
    return Array.from({ length: count }, () => "?").join(",");
  }

  function readVerifications(
    threadIds: readonly string[],
  ): Record<string, Verification | null> {
    const result: Record<string, Verification | null> = {};
    for (const id of threadIds) result[id] = null;
    if (threadIds.length === 0) return result;
    const rows = open()
      .prepare(
        `SELECT * FROM verifications WHERE thread_id IN (${placeholders(threadIds.length)})`,
      )
      .all(...threadIds) as VerificationRow[];
    for (const row of rows) result[row.thread_id] = toVerification(row);
    return result;
  }

  function readLaters(threadIds: readonly string[]): Record<string, Later | null> {
    const result: Record<string, Later | null> = {};
    for (const id of threadIds) result[id] = null;
    if (threadIds.length === 0) return result;
    const rows = open()
      .prepare(
        `SELECT * FROM laters WHERE thread_id IN (${placeholders(threadIds.length)})`,
      )
      .all(...threadIds) as LaterRow[];
    for (const row of rows) {
      result[row.thread_id] = {
        threadId: row.thread_id,
        laterAt: row.later_at,
        client: row.client,
      };
    }
    return result;
  }

  function writeVerification(verification: Verification): void {
    open()
      .prepare(
        `INSERT INTO verifications (thread_id, verified_at, client, diff_base, pr_checks_state)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (thread_id) DO UPDATE SET
           verified_at = excluded.verified_at,
           client = excluded.client,
           diff_base = excluded.diff_base,
           pr_checks_state = excluded.pr_checks_state`,
      )
      .run(
        verification.threadId,
        verification.verifiedAt,
        verification.client,
        verification.diffBase ? JSON.stringify(verification.diffBase) : null,
        verification.prChecksState,
      );
  }

  function writeLater(later: Later): void {
    open()
      .prepare(
        `INSERT INTO laters (thread_id, later_at, client) VALUES (?, ?, ?)
         ON CONFLICT (thread_id) DO UPDATE SET
           later_at = excluded.later_at,
           client = excluded.client`,
      )
      .run(later.threadId, later.laterAt, later.client);
  }

  return { readVerifications, readLaters, writeVerification, writeLater };
}

function toVerification(row: VerificationRow): Verification {
  const diffBase = row.diff_base
    ? diffBaseSchema.safeParse(JSON.parse(row.diff_base))
    : null;
  const prChecksState = prChecksStateSchema.safeParse(row.pr_checks_state);
  return {
    threadId: row.thread_id,
    verifiedAt: row.verified_at,
    client: row.client,
    diffBase: diffBase?.success ? diffBase.data : null,
    prChecksState: prChecksState.success ? prChecksState.data : null,
  };
}
