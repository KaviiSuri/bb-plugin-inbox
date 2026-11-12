// An ask dates by when it arrived. bb doesn't advance `latestAttentionAt`
// when a pending interaction (question form, plan, permission) appears
// mid-turn, only at turn end (#24), so a thread read after its last
// attention would sit in Seen while it waits on the human.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { InboxSnapshot } from "./types.js";

/**
 * How long a thread already read is held back while its interaction read is
 * open. After that it shows with what's known, so a read that never answers
 * can't hide an ask.
 */
export const ASK_READ_GRACE_MS = 5_000;

/**
 * Still waiting, within the grace, on the read that dates the thread's ask:
 * the item holds back rather than show in Seen and then move to New.
 */
export function askLoading(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): boolean {
  if (!thread.hasPendingInteraction || snapshot.interactions[thread.id]) {
    return false;
  }
  if (snapshot.interactionsMissing?.[thread.id]) return false;
  const since = snapshot.interactionsWaitingSince?.[thread.id] ?? snapshot.now;
  return snapshot.now < since + ASK_READ_GRACE_MS;
}

/** When each open interaction read's grace runs out. */
export function askDeadlines(snapshot: InboxSnapshot): number[] {
  const deadlines: number[] = [];
  for (const thread of snapshot.threads) {
    if (thread.isHidden || thread.isArchived) continue;
    const since = snapshot.interactionsWaitingSince?.[thread.id];
    if (since !== undefined && askLoading(thread, snapshot)) {
      deadlines.push(since + ASK_READ_GRACE_MS);
    }
  }
  return deadlines;
}

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
