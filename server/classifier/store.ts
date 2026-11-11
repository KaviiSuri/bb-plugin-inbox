import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  turnEndSchema,
  turnEndTag,
  type TurnEnd,
} from "../../shared/inbox-turn-end.js";

export { turnEndSchema, type TurnEnd };

// Turn-end records live in the plugin's KV, one row per thread, rather than
// the plugin database: `bb.storage.migrate` numbers migrations by index, so a
// second module with its own migration list (#12's Verifications) would
// collide with ours.

const KV_PREFIX = "turnEnd:";

export const TURN_ENDS_CHANNEL = "turn-ends";

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
    bb.rpc.experimental_invalidate([turnEndTag(threadId)]);
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
