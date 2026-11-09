// FYI: finished with nothing to verify. Opening the thread clears it, the one
// exception to clear = verified (ADR 0004).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { item, type Outcome } from "./types.js";

/** Runs after `verify`, so the thread has finished with no evidence. */
export function fyi(thread: PluginSidebarThread): Outcome | null {
  const opened = (thread.lastReadAt ?? 0) >= thread.latestAttentionAt;
  if (opened) return { kind: "none" };
  return item({ tier: "fyi", word: "fyi", reason: "Reported back; nothing to verify" });
}
