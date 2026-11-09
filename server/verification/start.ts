// When the Inbox started (ADR 0010): recorded once, on the plugin's first run,
// and never overwritten. Verify and FYI items only cover work after it.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

const STARTED_AT_KEY = "inbox:startedAt";

/** Reads the start time, writing now as the start on the very first run. */
export async function ensureInboxStart(bb: BbPluginApi): Promise<number> {
  const stored = await bb.storage.kv.get<number>(STARTED_AT_KEY);
  if (typeof stored === "number") return stored;
  const startedAt = Date.now();
  await bb.storage.kv.set(STARTED_AT_KEY, startedAt);
  return startedAt;
}
