// The inbox model: every rule that decides what the Inbox tab shows. Pure, no
// React and no SDK calls, so later tickets extend it through fixture tests.
// Terms follow CONTEXT.md (Item, Tier, Blocked on you, Broken, Running count,
// New for you / Seen).
import type {
  PluginBrowserBbSdk,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

/** What `threads.interactions.list` returns; the SDK doesn't name the type. */
export type PendingInteractionList = Awaited<
  ReturnType<PluginBrowserBbSdk["threads"]["interactions"]["list"]>
>;
type PendingInteraction = PendingInteractionList[number];

export type Tier = "blocked" | "broken";
export type Word = "answer" | "approve" | "failed";

/** What a thread's pending interaction asks of the human. */
export type PendingInteractionKind = "user_question" | "approval" | "plugin";

export interface PendingInteractionSummary {
  kind: PendingInteractionKind;
  /** The reason line, e.g. "Asks: which database?". */
  reason: string;
}

/**
 * The first still-pending interaction, as the word's kind and a reason line;
 * null when none is pending.
 */
export function summarizePendingInteractions(
  interactions: PendingInteractionList,
): PendingInteractionSummary | null {
  const pending = interactions.find((i) => i.status === "pending");
  return pending ? summarize(pending) : null;
}

function summarize(interaction: PendingInteraction): PendingInteractionSummary {
  const { payload } = interaction;
  switch (payload.kind) {
    case "user_question": {
      const prompt = payload.questions[0]?.prompt;
      return {
        kind: "user_question",
        reason: prompt ? `Asks: ${prompt}` : "Asks you a question",
      };
    }
    case "plugin":
      return { kind: "plugin", reason: payload.title };
    case "approval":
      return { kind: "approval", reason: approvalReason(payload.subject) };
    default:
      return { kind: "plugin", reason: "Waiting for you" };
  }
}

type ApprovalSubject = Extract<
  PendingInteraction["payload"],
  { kind: "approval" }
>["subject"];

function approvalReason(subject: ApprovalSubject): string {
  switch (subject.kind) {
    case "command":
      return `Wants to run ${subject.command}`;
    case "file_change":
      return "Wants to change files";
    case "permission_grant":
      return "Wants more permissions";
    case "plan":
      return "Has a plan for you to review";
    case "tool_use":
      return `Wants to use ${subject.presentation.title ?? subject.tool}`;
    default:
      return "Wants your approval";
  }
}

/** What the list remembers between snapshots to time the grace and "stuck". */
export interface RuntimeTracking {
  /** Threads seen running in the last snapshot. */
  running: Readonly<Record<string, true>>;
  /** When a thread was first seen stopped after running. */
  stoppedAt: Readonly<Record<string, number>>;
  /** When a thread was first seen waiting for its machine. */
  waitingForHostSince: Readonly<Record<string, number>>;
}

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

/** `status` values that mean the thread is still working. */
const RUNNING_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "starting",
  "stopping",
  "pending",
]);

/**
 * Working right now: a busy status or live background work. Plan mode alone
 * is a mode, not work. Ignores pending interactions; `deriveInbox` puts those
 * first.
 */
export function isRunning(thread: PluginSidebarThread): boolean {
  if (RUNNING_STATUSES.has(thread.status)) return true;
  const { workflows, backgroundAgents, backgroundCommands } = thread.activity;
  return workflows + backgroundAgents + backgroundCommands > 0;
}

/** How long a stopped thread stays in the Running count, to avoid flicker. */
export const STOP_GRACE_MS = 2_000;

/**
 * Advance the tracking for a new snapshot: note threads that just stopped and
 * threads that started waiting for their machine; forget what no longer
 * applies.
 */
export function trackRuntime(
  previous: RuntimeTracking,
  threads: readonly PluginSidebarThread[],
  now: number,
): RuntimeTracking {
  const running: Record<string, true> = {};
  const stoppedAt: Record<string, number> = {};
  const waitingForHostSince: Record<string, number> = {};
  for (const thread of threads) {
    const { id } = thread;
    if (isRunning(thread)) {
      running[id] = true;
    } else {
      const since = previous.running[id] ? now : previous.stoppedAt[id];
      if (since !== undefined && now - since < STOP_GRACE_MS) {
        stoppedAt[id] = since;
      }
    }
    if (thread.runtimeStatus === "waiting-for-host") {
      waitingForHostSince[id] = previous.waitingForHostSince[id] ?? now;
    }
  }
  return { running, stoppedAt, waitingForHostSince };
}

/** How long a thread waits for its machine before it counts as stuck. */
export const STUCK_WAITING_FOR_HOST_MS = 60_000;

type Need = Pick<InboxItem, "tier" | "word" | "reason">;

function blockedNeed(
  thread: PluginSidebarThread,
  interactions: InboxSnapshot["interactions"],
): Need | null {
  if (!thread.hasPendingInteraction) return null;
  const interaction = interactions[thread.id];
  return {
    tier: "blocked",
    word: interaction?.kind === "approval" ? "approve" : "answer",
    reason: interaction?.reason ?? "Waiting for you",
  };
}

function broken(reason: string): Need {
  return { tier: "broken", word: "failed", reason };
}

function stuckNeed(
  thread: PluginSidebarThread,
  runtime: RuntimeTracking,
  now: number,
): Need | null {
  const waitingSince = runtime.waitingForHostSince[thread.id];
  if (
    thread.runtimeStatus === "waiting-for-host" &&
    waitingSince !== undefined &&
    now - waitingSince >= STUCK_WAITING_FOR_HOST_MS
  ) {
    return broken("Stuck waiting for its machine");
  }
  return null;
}

function brokenNeed(thread: PluginSidebarThread): Need | null {
  if (thread.status === "error") return broken("Stopped with an error");
  if (thread.queuedWork === "failed") {
    return broken("A queued message failed to send");
  }
  if (thread.indicator === "unread-error") {
    return broken("Its last turn ended in an error");
  }
  return null;
}

const TIER_ORDER: Readonly<Record<Tier, number>> = { blocked: 0, broken: 1 };

/** Tier first, then newest attention first. */
function compareItems(a: InboxItem, b: InboxItem): number {
  return (
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.attentionAt - a.attentionAt
  );
}

export function deriveInbox(snapshot: InboxSnapshot): InboxView {
  const { interactions, runtime, now } = snapshot;
  const newForYou: InboxItem[] = [];
  const seen: InboxItem[] = [];
  const running: RunningThread[] = [];
  for (const thread of snapshot.threads) {
    if (thread.isHidden || thread.isArchived) continue;
    let need =
      blockedNeed(thread, interactions) ?? stuckNeed(thread, runtime, now);
    if (!need && isRunning(thread)) {
      running.push({
        threadId: thread.id,
        title: thread.displayTitle,
        settling: false,
      });
      continue;
    }
    need ??= brokenNeed(thread);
    if (!need) {
      const stoppedAt = runtime.stoppedAt[thread.id];
      if (stoppedAt !== undefined && now - stoppedAt < STOP_GRACE_MS) {
        running.push({
          threadId: thread.id,
          title: thread.displayTitle,
          settling: true,
        });
      }
      continue;
    }
    // Seen once the thread was opened since its latest attention.
    (thread.isUnread ? newForYou : seen).push({
      threadId: thread.id,
      title: thread.displayTitle,
      ...need,
      attentionAt: thread.latestAttentionAt,
    });
  }
  newForYou.sort(compareItems);
  seen.sort(compareItems);
  return { newForYou, seen, running, tabCount: newForYou.length };
}

/**
 * When the view next changes with no new snapshot: a grace ending or a wait
 * for a machine turning stuck. Null when nothing is timed.
 */
export function nextChangeAt({ runtime, now }: InboxSnapshot): number | null {
  const deadlines = [
    ...Object.values(runtime.stoppedAt).map((at) => at + STOP_GRACE_MS),
    ...Object.values(runtime.waitingForHostSince).map(
      (at) => at + STUCK_WAITING_FOR_HOST_MS,
    ),
  ].filter((at) => at > now);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}
