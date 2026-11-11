// A child's own item dates by its latest turn end. bb doesn't advance a
// child's `latestAttentionAt` when it finishes a turn (#14), so a child that
// answers to the human (ADR 0002) would otherwise never show a later turn:
// Verify, FYI, Later and New / Seen all compare against attention.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { InboxSnapshot } from "./types.js";

/**
 * The thread as its own item sees it: a child whose latest `turn/completed`
 * is newer than its attention takes that as its attention, and is unread
 * if it wasn't opened since. Top-level threads, and children whose turn end
 * is still being read, are returned as they are.
 */
export function withChildTurnEnd(
  thread: PluginSidebarThread,
  { childCompletions }: Pick<InboxSnapshot, "childCompletions">,
): PluginSidebarThread {
  if (!thread.parentThreadId) return thread;
  const completedAt = childCompletions[thread.id];
  if (completedAt == null || completedAt <= thread.latestAttentionAt) return thread;
  return {
    ...thread,
    latestAttentionAt: completedAt,
    isUnread: thread.isUnread || (thread.lastReadAt ?? 0) < completedAt,
  };
}
