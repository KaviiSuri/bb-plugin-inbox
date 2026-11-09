import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

// Turn-end records live in the plugin's KV, one row per thread, rather than
// the plugin database: `bb.storage.migrate` numbers migrations by index, so a
// second module with its own migration list (#12's Verifications) would
// collide with ours.

const KV_PREFIX = "turnEnd:";

export const TURN_ENDS_CHANNEL = "turn-ends";

export const turnEndSchema = z
  .object({
    verdict: z.enum(["question", "report"]),
    // Who decided: the helper thread's model, or the heuristic.
    source: z.enum(["model", "heuristic"]),
    // Why the heuristic decided, when it did: no provider set, nothing to
    // read, a turn end found by the startup reconcile past its model budget,
    // or the helper thread failed, timed out or gave no clear answer.
    fallback: z
      .enum(["no-provider", "no-text", "startup", "failed", "timeout", "unparseable"])
      .nullable(),
    // Sticky: once a thread has used the grilling skill it stays true.
    grilling: z.boolean(),
    // The thread's `latestAttentionAt` for the turn end this verdict covers.
    turnKey: z.number(),
    classifiedAt: z.number(),
  })
  .strict();

export type TurnEnd = z.infer<typeof turnEndSchema>;

const storedTurnEndSchema = turnEndSchema
  .extend({
    // How far the grilling scan has read the thread's events.
    scannedSeq: z.number(),
    // The text the verdict was made from, so an unchanged turn end isn't
    // classified (and paid for) twice.
    textHash: z.string(),
  })
  .strict();

export type StoredTurnEnd = z.infer<typeof storedTurnEndSchema>;

export function createTurnEndStore(bb: BbPluginApi) {
  async function get(threadId: string): Promise<StoredTurnEnd | null> {
    const raw = await bb.storage.kv.get<unknown>(`${KV_PREFIX}${threadId}`);
    if (raw === undefined) return null;
    const parsed = storedTurnEndSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async function put(threadId: string, record: StoredTurnEnd): Promise<void> {
    await bb.storage.kv.set(`${KV_PREFIX}${threadId}`, record);
    bb.realtime.publish(TURN_ENDS_CHANNEL, { threadIds: [threadId] });
  }

  async function remove(threadId: string): Promise<void> {
    await bb.storage.kv.delete(`${KV_PREFIX}${threadId}`);
  }

  return { get, put, remove };
}

export type TurnEndStore = ReturnType<typeof createTurnEndStore>;

export function publicTurnEnd(record: StoredTurnEnd): TurnEnd {
  const { scannedSeq: _seq, textHash: _hash, ...turnEnd } = record;
  return turnEnd;
}
