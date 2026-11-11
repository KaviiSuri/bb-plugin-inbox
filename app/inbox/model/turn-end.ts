// Turn ends (ADRs 0008, 0009): the server's classifier reads how each turn
// ended, a question for the human or a report, and stores one verdict per
// thread (server/classifier/). A finished thread whose turn ended with a
// question is Blocked on you, word `answer`. A verdict counts only for the
// turn it was made for: a new turn, running or finished, never inherits it.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { TurnEnd } from "../../../shared/inbox-turn-end.js";
import { isRunning } from "./running.js";
import { item, type InboxSnapshot, type Outcome } from "./types.js";

/**
 * How long a finished turn waits for its verdict: in the Running count while
 * the server has none yet, held back while the read itself hasn't answered.
 * The heuristic answers in milliseconds; a helper thread on the user's model
 * takes longer. After this the turn counts as a report, so an unanswered
 * read, or one that never resolves, never hides the thread.
 */
export const CLASSIFY_GRACE_MS = 30_000;

/** What the Inbox knows about how a thread's latest turn ended. */
export type TurnEndState =
  | "question"
  | "report"
  /** The verdict read hasn't answered yet, within the grace. */
  | "loading"
  /** No verdict for this turn yet, within the grace. */
  | "pending";

type TurnEndFacts = Pick<InboxSnapshot, "childCompletions" | "inboxStartedAt">;

/**
 * When the thread's latest turn ended, in server time; null while unknown.
 * bb advances `latestAttentionAt` on idle only for top-level threads; a
 * child's turn end is its latest `turn/completed` event (#14).
 */
export function turnEndedAt(
  thread: PluginSidebarThread,
  { childCompletions }: Pick<InboxSnapshot, "childCompletions">,
): number | null {
  if (!thread.parentThreadId) return thread.latestAttentionAt;
  return childCompletions[thread.id] ?? null;
}

/**
 * The verdict was made for this turn: a top-level thread's by its attention
 * at that idle, a child's by that turn's completion event.
 */
function covers(
  verdict: TurnEnd,
  thread: PluginSidebarThread,
  endedAt: number,
): boolean {
  return thread.parentThreadId
    ? verdict.completedAt === endedAt
    : verdict.turnKey === endedAt;
}

/**
 * A finished turn the Inbox asks the classifier about: it ended after the
 * Inbox started (ADR 0010). The hook reads verdicts for exactly these.
 */
export function needsTurnEnd(
  thread: PluginSidebarThread,
  snapshot: TurnEndFacts,
): boolean {
  const endedAt = turnEndedAt(thread, snapshot);
  const { inboxStartedAt } = snapshot;
  return endedAt !== null && inboxStartedAt !== null && endedAt > inboxStartedAt;
}

/**
 * When the wait for this turn's verdict ends: the grace after the turn
 * ended, or after the client started waiting on the read if that was later
 * (a reload long after the turn still gives the read its grace). Null when
 * there's nothing to wait for: the verdict covers this turn, or the turn
 * end itself is unknown.
 */
function waitEndsAt(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): number | null {
  const endedAt = turnEndedAt(thread, snapshot);
  if (endedAt === null) return null;
  const verdict = snapshot.turnEnds[thread.id];
  if (verdict && covers(verdict, thread, endedAt)) return null;
  const readSince =
    verdict === undefined ? (snapshot.turnEndsWaitingSince[thread.id] ?? endedAt) : endedAt;
  return Math.max(endedAt, readSince) + CLASSIFY_GRACE_MS;
}

/** How the thread's latest turn ended, as far as the Inbox knows. */
export function turnEndOf(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): TurnEndState {
  const endedAt = turnEndedAt(thread, snapshot);
  if (endedAt === null) return "loading";
  const verdict = snapshot.turnEnds[thread.id];
  if (verdict && covers(verdict, thread, endedAt)) return verdict.verdict;
  if (snapshot.now >= waitEndsAt(thread, snapshot)!) return "report";
  return verdict === undefined ? "loading" : "pending";
}

/** The thread has used the grilling skill; sticky across its turns. */
export function usedGrilling(
  thread: PluginSidebarThread,
  { turnEnds }: InboxSnapshot,
): boolean {
  return turnEnds[thread.id]?.grilling === true;
}

/**
 * A finished turn that ended with a question for the human: Blocked on you.
 * Runs after the pending-interaction, Broken and running rules, so a form,
 * plan or permission keeps its own word and a new running turn is counted.
 * Only covers turns after the Inbox started and not already verified. While
 * the verdict is pending the thread stays in the Running count; while the
 * verdicts load it holds back, so no item flashes up as FYI first.
 */
export function asks(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): Outcome | null {
  if (!needsTurnEnd(thread, snapshot)) return null;
  const verifiedAt = snapshot.verifications[thread.id]?.verifiedAt ?? 0;
  if (verifiedAt >= turnEndedAt(thread, snapshot)!) return null;
  switch (turnEndOf(thread, snapshot)) {
    case "question":
      return item({
        tier: "blocked",
        word: "answer",
        reason: "Ended its turn with a question for you",
      });
    case "pending":
      return { kind: "running", settling: true };
    case "loading":
      return { kind: "none" };
    default:
      return null;
  }
}

/** When a wait for a verdict runs out and the turn counts as a report. */
export function classifyDeadlines(snapshot: InboxSnapshot): number[] {
  const deadlines: number[] = [];
  for (const thread of snapshot.threads) {
    if (thread.isHidden || thread.isArchived) continue;
    if (isRunning(thread) || thread.hasPendingInteraction) continue;
    if (!needsTurnEnd(thread, snapshot)) continue;
    const state = turnEndOf(thread, snapshot);
    if (state !== "pending" && state !== "loading") continue;
    const endsAt = waitEndsAt(thread, snapshot);
    if (endsAt !== null) deadlines.push(endsAt);
  }
  return deadlines;
}
