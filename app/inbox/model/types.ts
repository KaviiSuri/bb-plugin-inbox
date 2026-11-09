// The inbox model's shared shapes. Terms follow CONTEXT.md (Item, Tier,
// Blocked on you, Broken, Running count, New for you / Seen).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { PendingInteractionSummary } from "./blocked.js";
import type { RuntimeTracking } from "./running.js";

export type Tier = "blocked" | "broken";
export type Word = "answer" | "approve" | "failed";

/** Tier order in the list: lower first. */
export const TIER_ORDER: Readonly<Record<Tier, number>> = {
  blocked: 0,
  broken: 1,
};

export interface InboxSnapshot {
  threads: readonly PluginSidebarThread[];
  /** For threads with `hasPendingInteraction`, what they wait on. */
  interactions: Readonly<Record<string, PendingInteractionSummary>>;
  runtime: RuntimeTracking;
  now: number;
}

export interface InboxItem {
  threadId: string;
  title: string;
  tier: Tier;
  word: Word;
  reason: string;
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

/** What an item wants of the human. */
export type Need = Pick<InboxItem, "tier" | "word" | "reason">;

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

export function item(need: Need): Outcome {
  return { kind: "item", need };
}
