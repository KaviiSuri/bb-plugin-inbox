// The Running count: running threads are never items, and a thread that just
// stopped stays counted for a short grace so it doesn't flicker.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { InboxSnapshot, Outcome } from "./types.js";

/** What the list remembers between snapshots to time the grace and "stuck". */
export interface RuntimeTracking {
  /** Threads seen running in the last snapshot. */
  running: Readonly<Record<string, true>>;
  /** When a thread was first seen stopped after running. */
  stoppedAt: Readonly<Record<string, number>>;
  /** When a thread was first seen waiting for its machine. */
  waitingForHostSince: Readonly<Record<string, number>>;
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

/** A running thread goes to the count. */
export function running(thread: PluginSidebarThread): Outcome | null {
  return isRunning(thread) ? { kind: "running", settling: false } : null;
}

/** A thread that just stopped, with nothing for the human, stays counted. */
export function settling(
  thread: PluginSidebarThread,
  { runtime, now }: InboxSnapshot,
): Outcome | null {
  const stoppedAt = runtime.stoppedAt[thread.id];
  return stoppedAt !== undefined && now - stoppedAt < STOP_GRACE_MS
    ? { kind: "running", settling: true }
    : null;
}

/** Deadlines at which a grace ends. */
export function graceDeadlines({ runtime }: InboxSnapshot): number[] {
  return Object.values(runtime.stoppedAt).map((at) => at + STOP_GRACE_MS);
}
