// The inbox model's shared shapes. Terms follow CONTEXT.md (Item, Tier,
// Blocked on you, Broken, Running count, New for you / Seen).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type {
  Later,
  Verification,
} from "../../../shared/inbox-verification.js";
import type { PendingInteractionSummary } from "./blocked.js";
import type { RuntimeTracking } from "./running.js";
import type { EnvironmentEvidence } from "./verify.js";

export type Tier = "blocked" | "broken" | "verify" | "fyi";
export type Word = "answer" | "approve" | "failed" | "verify" | "fyi";

/** Tier order in the list: lower first. */
export const TIER_ORDER: Readonly<Record<Tier, number>> = {
  blocked: 0,
  broken: 1,
  verify: 2,
  fyi: 3,
};

export interface InboxSnapshot {
  threads: readonly PluginSidebarThread[];
  /** For threads with `hasPendingInteraction`, what they wait on. */
  interactions: Readonly<Record<string, PendingInteractionSummary>>;
  runtime: RuntimeTracking;
  /** Per environment id, once loaded: its diff and pull request. */
  evidence: Readonly<Record<string, EnvironmentEvidence>>;
  /** The latest Verification per thread id. */
  verifications: Readonly<Record<string, Verification>>;
  /** The latest Later per thread id. */
  laters: Readonly<Record<string, Later>>;
  now: number;
}

export interface InboxItem {
  threadId: string;
  title: string;
  tier: Tier;
  word: Word;
  reason: string;
  /** What a Verify item carries to check; null on every other tier. */
  evidence: EnvironmentEvidence | null;
  attentionAt: number;
}

export interface RunningThread {
  threadId: string;
  title: string;
  /** Just stopped; held in the count for the grace so it doesn't flicker. */
  settling: boolean;
}

export interface InboxView {
  newForYou: InboxItem[];
  seen: InboxItem[];
  running: RunningThread[];
  /** The number on the Inbox tab: New for you only. */
  tabCount: number;
}

/** What an item wants of the human, and its evidence if it has any. */
export type Need = Pick<InboxItem, "tier" | "word" | "reason"> & {
  evidence?: EnvironmentEvidence;
};

/** Where one thread lands in the view. */
export type Outcome =
  | { kind: "item"; need: Need }
  | { kind: "running"; settling: boolean }
  | { kind: "none" };

/**
 * One rule of the per-thread pass: decides the thread's outcome, or returns
 * null to leave it to the next rule.
 */
export type ThreadRule = (
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
) => Outcome | null;

/**
 * One rule of the pass over the items the per-thread pass made: returns the
 * items to keep, for rules that look across threads or hide items.
 */
export type ItemRule = (
  items: readonly InboxItem[],
  snapshot: InboxSnapshot,
) => InboxItem[];

export function item(need: Need): Outcome {
  return { kind: "item", need };
}
