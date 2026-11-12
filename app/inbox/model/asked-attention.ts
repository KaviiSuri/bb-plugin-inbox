// An ask dates by when it arrived. bb doesn't advance `latestAttentionAt`
// when a pending interaction (question form, plan, permission) appears
// mid-turn, only at turn end (#24), so a thread read after its last
// attention would sit in Seen while it waits on the human.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { InboxSnapshot } from "./types.js";

/**
 * When the thread's pending interaction arrived, or null when it isn't
 * waiting or that time hasn't loaded.
 */
export function askedAt(
  thread: PluginSidebarThread,
  { interactions }: Pick<InboxSnapshot, "interactions">,
): number | null {
  if (!thread.hasPendingInteraction) return null;
  return interactions[thread.id]?.askedAt ?? null;
}

/**
 * The thread as its item sees it: an ask newer than its attention takes
 * that as its attention, and is unread if the thread wasn't opened since.
 */
export function withAskedAt(
  thread: PluginSidebarThread,
  snapshot: Pick<InboxSnapshot, "interactions">,
): PluginSidebarThread {
  const at = askedAt(thread, snapshot);
  if (at === null || at <= thread.latestAttentionAt) return thread;
  return {
    ...thread,
    latestAttentionAt: at,
    isUnread: thread.isUnread || (thread.lastReadAt ?? 0) < at,
  };
}
