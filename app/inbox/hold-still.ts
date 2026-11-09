// While the human touches the Inbox, rows keep their band and position so
// nothing moves from under a finger. Content (word, reason) stays current.
import type { InboxItem, InboxView } from "./model/index.js";

/** Row order per band at the moment the list was touched. */
export interface HeldLayout {
  newForYou: readonly string[];
  seen: readonly string[];
}

export function layoutOf(view: InboxView): HeldLayout {
  return {
    newForYou: view.newForYou.map((item) => item.threadId),
    seen: view.seen.map((item) => item.threadId),
  };
}

export function holdStill(held: HeldLayout, view: InboxView): InboxView {
  const live = new Map<string, InboxItem>(
    [...view.newForYou, ...view.seen].map((item) => [item.threadId, item]),
  );
  const heldIds = new Set([...held.newForYou, ...held.seen]);
  const band = (heldOrder: readonly string[], liveItems: InboxItem[]) => [
    ...heldOrder.flatMap((id) => live.get(id) ?? []),
    ...liveItems.filter((item) => !heldIds.has(item.threadId)),
  ];
  return {
    ...view,
    newForYou: band(held.newForYou, view.newForYou),
    seen: band(held.seen, view.seen),
  };
}
