// Later: out of sight without verifying, until the thread has something new.
import type { Later } from "../../../shared/inbox-verification.js";
import type { InboxItem, InboxSnapshot } from "./types.js";

/** Still in Later: put there after the thread's latest attention. */
export function isLater(item: InboxItem, later: Later | undefined): boolean {
  return later !== undefined && later.laterAt >= item.attentionAt;
}

/** Leaves out every item still in Later. */
export function later(
  items: readonly InboxItem[],
  { laters }: InboxSnapshot,
): InboxItem[] {
  return items.filter((entry) => !isLater(entry, laters[entry.threadId]));
}
