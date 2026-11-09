// Verify and FYI only cover work finished after the Inbox started (ADR 0010),
// so old threads with leftover diffs don't arrive as a day-one backlog.
// Runs after the Blocked on you and Broken rules, which it leaves alone.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { InboxSnapshot, Outcome } from "./types.js";

/**
 * No item for a finished thread whose latest attention isn't after the
 * Inbox's start; none either while the start is loading, so nothing flashes.
 */
export function sinceStart(
  thread: PluginSidebarThread,
  { inboxStartedAt }: InboxSnapshot,
): Outcome | null {
  if (inboxStartedAt === null || thread.latestAttentionAt <= inboxStartedAt) {
    return { kind: "none" };
  }
  return null;
}
