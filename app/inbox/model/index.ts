// The inbox model: every rule that decides what the Inbox tab shows. Pure, no
// React and no SDK calls. Each concern lives in its own module; this file only
// composes them, so a new rule is one line here.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { audience } from "./audience.js";
import { blocked } from "./blocked.js";
import { broken, stuck, stuckDeadlines } from "./broken.js";
import { comingBack } from "./coming-back.js";
import { fyi } from "./fyi.js";
import { later } from "./later.js";
import { graceDeadlines, running, settling } from "./running.js";
import { sinceStart } from "./since-start.js";
import { verify } from "./verify.js";
import {
  TIER_ORDER,
  type InboxItem,
  type ItemRule,
  type InboxSnapshot,
  type InboxView,
  type Outcome,
  type RunningThread,
  type ThreadRule,
} from "./types.js";

export * from "./types.js";
export {
  summarizePendingInteractions,
  type PendingInteractionKind,
  type PendingInteractionList,
  type PendingInteractionSummary,
} from "./blocked.js";
export { STUCK_WAITING_FOR_HOST_MS } from "./broken.js";
export { isLater } from "./later.js";
export {
  scopeChanges,
  scopeTarget,
  type ChangedFile,
  type ComingBack,
  type ScopedChanges,
} from "./coming-back.js";
export {
  evidenceOf,
  hasEvidence,
  isVerified,
  NO_EVIDENCE,
  type DiffStat,
  type EnvironmentEvidence,
  type PullRequestEvidence,
} from "./verify.js";
export {
  isRunning,
  STOP_GRACE_MS,
  trackRuntime,
  type RuntimeTracking,
} from "./running.js";

/**
 * The per-thread pass, in order: the first rule with an outcome decides.
 * Needing the human beats running; running beats everything after it.
 */
const THREAD_RULES: readonly ThreadRule[] = [
  blocked,
  stuck,
  running,
  broken,
  settling,
  sinceStart,
  comingBack,
  verify,
  fyi,
];

/** Then the passes over the items, in order. */
const ITEM_RULES: readonly ItemRule[] = [audience, later];

function outcomeOf(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): Outcome {
  for (const rule of THREAD_RULES) {
    const outcome = rule(thread, snapshot);
    if (outcome) return outcome;
  }
  return { kind: "none" };
}

/** Tier first, then newest attention first. */
function compareItems(a: InboxItem, b: InboxItem): number {
  return (
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.attentionAt - a.attentionAt
  );
}

export function deriveInbox(snapshot: InboxSnapshot): InboxView {
  let items: InboxItem[] = [];
  const runningThreads: RunningThread[] = [];
  const unread = new Set<string>();
  for (const thread of snapshot.threads) {
    if (thread.isHidden || thread.isArchived) continue;
    if (thread.isUnread) unread.add(thread.id);
    const outcome = outcomeOf(thread, snapshot);
    if (outcome.kind === "running") {
      runningThreads.push({
        threadId: thread.id,
        title: thread.displayTitle,
        settling: outcome.settling,
      });
    } else if (outcome.kind === "item") {
      const { evidence = null, ...need } = outcome.need;
      items.push({
        threadId: thread.id,
        title: thread.displayTitle,
        ...need,
        evidence,
        attentionAt: thread.latestAttentionAt,
      });
    }
  }
  for (const rule of ITEM_RULES) items = rule(items, snapshot);
  // Seen once the thread was opened since its latest attention, unless
  // something folded into it arrived after that.
  const isNew = (entry: InboxItem) =>
    unread.has(entry.threadId) || entry.news === true;
  const newForYou = items.filter(isNew);
  const seen = items.filter((entry) => !isNew(entry));
  newForYou.sort(compareItems);
  seen.sort(compareItems);
  return {
    newForYou,
    seen,
    running: runningThreads,
    tabCount: newForYou.length,
  };
}

/**
 * When the view next changes with no new snapshot: a grace ending or a wait
 * for a machine turning stuck. Null when nothing is timed.
 */
export function nextChangeAt(snapshot: InboxSnapshot): number | null {
  const deadlines = [
    ...graceDeadlines(snapshot),
    ...stuckDeadlines(snapshot),
  ].filter((at) => at > snapshot.now);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}
