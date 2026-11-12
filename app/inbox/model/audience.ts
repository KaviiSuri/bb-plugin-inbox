// Audience (ADRs 0006, 0008): who a thread answers to, inferred from what it
// does, never declared at spawn. A top-level thread answers to the human. A
// child answers to the human, and keeps its own item naming its parent
// (ADR 0002), while it waits on a question form, a plugin's form or a plan
// review, and when the classifier says it ended its turn with a question for
// the human or it has used the grilling skill. Every other child answers to
// its parent: it never has a row of its own, and its news folds into the item
// of its owner, the nearest ancestor that answers to the human. A child waiting on a permission stays with its
// parent agent until the parent stops; then the owner's item asks to approve.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { askedAt } from "./asked-attention.js";
import { broken, stuck } from "./broken.js";
import { isRunning, settling } from "./running.js";
import { needsTurnEnd, turnEndOf, usedGrilling } from "./turn-end.js";
import {
  TIER_ORDER,
  type FoldedChild,
  type InboxItem,
  type InboxSnapshot,
  type Need,
} from "./types.js";
import { evidenceOf, isVerified } from "./verify.js";

type ThreadsById = ReadonlyMap<string, PluginSidebarThread>;

/**
 * Why a thread with a parent answers to the human, as the opened row says
 * it; null when it answers to its parent. A pending interaction decides on
 * its own: a permission stays with the parent whatever the classifier said
 * about an earlier turn. Otherwise the classifier's signals (ADR 0008).
 */
export function humanAudienceReason(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): string | null {
  if (!thread.hasPendingInteraction) return classifiedReason(thread, snapshot);
  const interaction = snapshot.interactions[thread.id];
  switch (interaction?.kind) {
    case "user_question":
      return "Its own item: it asks you through a question form";
    case "plugin":
      return "Its own item: it waits on a form only you can fill";
    case "approval":
      return interaction.subject === "plan"
        ? "Its own item: it has a plan for you to review"
        : null;
    default:
      return null;
  }
}

/** The classifier's reason a finished child answers to the human. */
function classifiedReason(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): string | null {
  if (isRunning(thread)) return null;
  if (usedGrilling(thread, snapshot)) {
    return "Its own item: it grills you with the grilling skill";
  }
  if (needsTurnEnd(thread, snapshot) && turnEndOf(thread, snapshot) === "question") {
    return "Its own item: it asks you in plain text";
  }
  return null;
}

/** The visible parent, or undefined for a top-level thread. */
function parentOf(
  thread: PluginSidebarThread,
  byId: ThreadsById,
): PluginSidebarThread | undefined {
  return thread.parentThreadId ? byId.get(thread.parentThreadId) : undefined;
}

/**
 * Top-level, or a child that asks the human. A child whose parent is hidden,
 * archived or gone counts as top-level, so its news isn't lost.
 */
function answersToHuman(
  thread: PluginSidebarThread,
  byId: ThreadsById,
  snapshot: InboxSnapshot,
): boolean {
  return (
    parentOf(thread, byId) === undefined ||
    humanAudienceReason(thread, snapshot) !== null
  );
}

/** The nearest ancestor that answers to the human; null on a cycle. */
function ownerOf(
  thread: PluginSidebarThread,
  byId: ThreadsById,
  snapshot: InboxSnapshot,
): PluginSidebarThread | null {
  const visited = new Set([thread.id]);
  let parent = parentOf(thread, byId);
  while (parent && !visited.has(parent.id)) {
    if (answersToHuman(parent, byId, snapshot)) return parent;
    visited.add(parent.id);
    parent = parentOf(parent, byId);
  }
  return null;
}

/**
 * A folded child's news, or null when it has none: still running (it's in
 * the Running count), its interaction still loading, or a failure or report
 * its owner has seen. Reports also wait for the Inbox's start (ADR 0010).
 */
function newsOf(
  child: PluginSidebarThread,
  owner: PluginSidebarThread,
  snapshot: InboxSnapshot,
): FoldedChild | null {
  const base = {
    threadId: child.id,
    title: child.displayTitle,
    attentionAt: child.latestAttentionAt,
  };
  if (child.hasPendingInteraction) {
    // Anything else would make it answer to the human; hold back while
    // loading, but don't lose a waiting child whose read failed.
    const interaction = snapshot.interactions[child.id];
    if (!interaction) {
      if (!snapshot.interactionsMissing?.[child.id]) return null;
      return { ...base, state: "waiting", reason: "Waiting for you" };
    }
    // Dated by when it asked: bb doesn't move attention for it (#24).
    const at = askedAt(child, snapshot);
    if (at !== null) base.attentionAt = Math.max(base.attentionAt, at);
    return { ...base, state: "waiting", reason: interaction.reason };
  }
  const stuckOutcome = stuck(child, snapshot);
  if (!stuckOutcome && isRunning(child)) return null;
  const failure = stuckOutcome ?? broken(child);
  if (!failure && settling(child, snapshot)) return null;
  // Its verdict could still give it its own item: hold the report back
  // rather than fold it and then move it.
  if (!failure && needsTurnEnd(child, snapshot)) {
    const state = turnEndOf(child, snapshot);
    if (state === "loading" || state === "pending") return null;
  }

  // A successful child idle does not advance sidebar latestAttentionAt.
  // Completion is the server event's timestamp, never updatedAt (renames and
  // mark-read also change that). Failures still carry sidebar attention.
  const completedAt = snapshot.childCompletions[child.id];
  const attentionAt = failure
    ? Math.max(child.latestAttentionAt, completedAt ?? 0)
    : completedAt;
  if (attentionAt === undefined || attentionAt === null) return null;
  base.attentionAt = attentionAt;
  const seenAt = Math.max(
    child.lastReadAt ?? 0,
    owner.lastReadAt ?? 0,
    snapshot.verifications[owner.id]?.verifiedAt ?? 0,
  );
  if (attentionAt <= seenAt) return null;
  if (failure?.kind === "item") {
    return { ...base, state: "failed", reason: failure.need.reason };
  }
  const { inboxStartedAt } = snapshot;
  if (inboxStartedAt === null || attentionAt <= inboxStartedAt) {
    return null;
  }
  return { ...base, state: "reported", reason: "Reported back" };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What the folded news alone asks of the human, most urgent first. */
function needOf(folded: readonly FoldedChild[]): Need {
  const waiting = folded.find((child) => child.state === "waiting");
  if (waiting) {
    return {
      tier: "blocked",
      word: "approve",
      reason: `A helper waits on you: ${waiting.reason}`,
    };
  }
  const failed = folded.filter((child) => child.state === "failed");
  if (failed.length === 1) {
    return {
      tier: "broken",
      word: "failed",
      reason: `A helper failed: ${failed[0]!.reason}`,
    };
  }
  if (failed.length > 1) {
    return {
      tier: "broken",
      word: "failed",
      reason: `${plural(failed.length, "helper")} failed`,
    };
  }
  return {
    tier: "fyi",
    word: "fyi",
    reason: `${plural(folded.length, "helper")} reported`,
  };
}

/**
 * Still deciding Verify vs FYI: the owner's own evidence is loading, so a new
 * item holds back rather than flash up as FYI first (as `verify` does).
 */
function ownEvidenceLoading(
  owner: PluginSidebarThread,
  snapshot: InboxSnapshot,
): boolean {
  const { inboxStartedAt } = snapshot;
  return (
    evidenceOf(owner, snapshot) === undefined &&
    inboxStartedAt !== null &&
    owner.latestAttentionAt > inboxStartedAt &&
    !isVerified(owner, snapshot.verifications[owner.id])
  );
}

/** Puts folded news on the owner's item, making or escalating it as needed. */
function foldInto(
  owner: PluginSidebarThread,
  existing: InboxItem | undefined,
  folded: FoldedChild[],
  snapshot: InboxSnapshot,
): InboxItem | null {
  // While the owner runs, its children are its own business.
  const ownerStopped = !isRunning(owner) && !settling(owner, snapshot);
  const shown = ownerStopped
    ? folded
    : folded.filter((child) => child.state !== "waiting");
  if (shown.length === 0) return existing ?? null;
  const latest = Math.max(...shown.map((child) => child.attentionAt));
  const news = latest > (owner.lastReadAt ?? 0);
  const waiting = shown.find((child) => child.state === "waiting");
  const childPermission = waiting
    ? { childThreadId: waiting.threadId, prompt: waiting.reason }
    : undefined;

  if (existing) {
    const need = needOf(shown);
    const escalate =
      need.tier !== "fyi" &&
      TIER_ORDER[need.tier] < TIER_ORDER[existing.tier];
    return {
      ...existing,
      ...(escalate ? { ...need, evidence: null } : {}),
      folded: shown,
      ...(childPermission ? { childPermission } : {}),
      news: existing.news || news,
      attentionAt: Math.max(existing.attentionAt, latest),
    };
  }
  if (!ownerStopped || ownEvidenceLoading(owner, snapshot)) return null;
  return {
    threadId: owner.id,
    title: owner.displayTitle,
    ...needOf(shown),
    evidence: null,
    attentionAt: Math.max(owner.latestAttentionAt, latest),
    folded: shown,
    ...(childPermission ? { childPermission } : {}),
    news,
  };
}

/**
 * Routes items by Audience: a child that asks the human keeps its item and
 * names its parent; every other child's item is dropped and its news folds
 * into its owner's item.
 */
export function audience(
  items: readonly InboxItem[],
  snapshot: InboxSnapshot,
): InboxItem[] {
  const byId: ThreadsById = new Map(
    snapshot.threads
      .filter((thread) => !thread.isHidden && !thread.isArchived)
      .map((thread) => [thread.id, thread]),
  );
  const foldedByOwner = new Map<string, FoldedChild[]>();
  const foldedIds = new Set<string>();
  for (const child of byId.values()) {
    if (answersToHuman(child, byId, snapshot)) continue;
    foldedIds.add(child.id);
    const owner = ownerOf(child, byId, snapshot);
    const news = owner && newsOf(child, owner, snapshot);
    if (!owner || !news) continue;
    foldedByOwner.set(owner.id, [...(foldedByOwner.get(owner.id) ?? []), news]);
  }

  const result = new Map<string, InboxItem>();
  for (const entry of items) {
    if (foldedIds.has(entry.threadId)) continue;
    const thread = byId.get(entry.threadId);
    const parent = thread && parentOf(thread, byId);
    const reason = thread && humanAudienceReason(thread, snapshot);
    result.set(
      entry.threadId,
      parent && reason
        ? { ...entry, parentThreadId: parent.id, audienceReason: reason }
        : entry,
    );
  }
  for (const [ownerId, folded] of foldedByOwner) {
    folded.sort((a, b) => b.attentionAt - a.attentionAt);
    const owner = byId.get(ownerId)!;
    const merged = foldInto(owner, result.get(ownerId), folded, snapshot);
    if (merged) result.set(ownerId, merged);
  }
  return [...result.values()];
}
