// Broken: a thread that stopped on an error or got stuck.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { item, type InboxSnapshot, type Outcome } from "./types.js";

/** How long a thread waits for its machine before it counts as stuck. */
export const STUCK_WAITING_FOR_HOST_MS = 60_000;

function failed(reason: string): Outcome {
  return item({ tier: "broken", word: "failed", reason });
}

/** Waiting for its machine too long; applies even while "running". */
export function stuck(
  thread: PluginSidebarThread,
  { runtime, now }: InboxSnapshot,
): Outcome | null {
  const waitingSince = runtime.waitingForHostSince[thread.id];
  if (
    thread.runtimeStatus === "waiting-for-host" &&
    waitingSince !== undefined &&
    now - waitingSince >= STUCK_WAITING_FOR_HOST_MS
  ) {
    return failed("Stuck waiting for its machine");
  }
  return null;
}

/** An error signal on a thread that isn't running. */
export function broken(thread: PluginSidebarThread): Outcome | null {
  if (thread.status === "error") return failed("Stopped with an error");
  if (thread.queuedWork === "failed") {
    return failed("A queued message failed to send");
  }
  if (thread.indicator === "unread-error") {
    return failed("Its last turn ended in an error");
  }
  return null;
}

/** Deadlines at which a wait for a machine turns stuck. */
export function stuckDeadlines({ runtime }: InboxSnapshot): number[] {
  return Object.values(runtime.waitingForHostSince).map(
    (at) => at + STUCK_WAITING_FOR_HOST_MS,
  );
}
