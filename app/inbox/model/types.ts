// The inbox model's shared shapes. Terms follow CONTEXT.md (Item, Tier,
// Blocked on you, Broken, Running count, New for you / Seen).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type {
  Later,
  Verification,
} from "../../../shared/inbox-verification.js";
import type { TurnEnd } from "../../../shared/inbox-turn-end.js";
import type { PendingInteractionSummary } from "./blocked.js";
import type { ComingBack, ScopedChanges } from "./coming-back.js";
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
  /**
   * Waiting threads whose interaction read failed or found nothing pending:
   * shown on the generic reason, never held back. Missing means loading.
   */
  interactionsMissing?: Readonly<Record<string, true>>;
  /** Latest server turn/completed event per child; null while unknown.
   * Sidebar latestAttentionAt does not advance on ordinary child idle. */
  childCompletions: Readonly<Record<string, number | null>>;
  /**
   * The classifier's stored verdict per thread it was asked about (ADR 0009):
   * null when the server has none, missing while it loads.
   */
  turnEnds: Readonly<Record<string, TurnEnd | null>>;
  /**
   * When this client started waiting on each verdict read that hasn't
   * answered (client clock); bounds that wait like a missing verdict's.
   */
  turnEndsWaitingSince: Readonly<Record<string, number>>;
  runtime: RuntimeTracking;
  /** Per environment id, once loaded: its diff and pull request. */
  evidence: Readonly<Record<string, EnvironmentEvidence>>;
  /** The latest Verification per thread id. */
  verifications: Readonly<Record<string, Verification>>;
  /** The latest Later per thread id. */
  laters: Readonly<Record<string, Later>>;
  /** Per verified thread id, its changes since the Verification's diff base. */
  scoped: Readonly<Record<string, ScopedChanges>>;
  /** When the Inbox started (ADR 0010); null while it loads. */
  inboxStartedAt: number | null;
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
  /** Set when a verified thread is coming back (ADR 0003). */
  comingBack?: ComingBack;
  /** A `human`-audience child's item: its parent, named on the row (ADR 0002). */
  parentThreadId?: string;
  /** A `human`-audience child's item: why it got its own item (ADR 0008). */
  audienceReason?: string;
  /** `parent`-audience children whose news folded into this item. */
  folded?: FoldedChild[];
  /** A folded child still waiting on a permission once this thread stopped. */
  childPermission?: { childThreadId: string; prompt: string };
  /** Something folded into it arrived since its thread was last opened. */
  news?: boolean;
}

/** A `parent`-audience child's news, shown on its owner's item. */
export interface FoldedChild {
  threadId: string;
  title: string;
  /** Finished with a report, stopped on an error, or waiting on a permission. */
  state: "reported" | "failed" | "waiting";
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

/** What an item wants of the human, and its evidence if it has any. */
export type Need = Pick<InboxItem, "tier" | "word" | "reason" | "comingBack"> & {
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
