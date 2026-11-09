// Feeds the inbox model from the live sidebar: threads, the kinds of their
// pending interactions, and the timing the grace and "stuck" need.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  experimental_useSidebarThreads,
  useSdk,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  deriveInbox,
  nextChangeAt,
  summarizePendingInteractions,
  trackRuntime,
  type InboxSnapshot,
  type InboxView,
  type PendingInteractionSummary,
  type RuntimeTracking,
} from "./model/index.js";

const NO_TRACKING: RuntimeTracking = {
  running: {},
  stoppedAt: {},
  waitingForHostSince: {},
};

export interface InboxViewState {
  ready: boolean;
  view: InboxView;
  threadsById: ReadonlyMap<string, PluginSidebarThread>;
}

export function useInboxView(): InboxViewState {
  const { status, threads } = experimental_useSidebarThreads();
  const interactions = usePendingInteractions(threads);
  const [tick, setTick] = useState(0);

  // Advance the stop/stuck tracking once per new thread list.
  const trackingRef = useRef(NO_TRACKING);
  const runtime = useMemo(() => {
    trackingRef.current = trackRuntime(trackingRef.current, threads, Date.now());
    return trackingRef.current;
  }, [threads]);

  const snapshot = useMemo<InboxSnapshot>(
    () => ({ threads, interactions, runtime, now: Date.now() }),
    // `tick` re-reads the clock when a timed change is due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, interactions, runtime, tick],
  );
  const view = useMemo(() => deriveInbox(snapshot), [snapshot]);

  // Re-derive when a grace ends or a wait for a machine turns stuck.
  const wakeAt = nextChangeAt(snapshot);
  useEffect(() => {
    if (wakeAt === null) return;
    const timer = setTimeout(
      () => setTick((n) => n + 1),
      Math.max(0, wakeAt - Date.now() + 1),
    );
    return () => clearTimeout(timer);
  }, [wakeAt]);

  const threadsById = useMemo(
    () => new Map(threads.map((thread) => [thread.id, thread])),
    [threads],
  );
  return { ready: status !== "loading", view, threadsById };
}

/**
 * The interaction each waiting thread is blocked on, fetched only for threads
 * with `hasPendingInteraction`, and again whenever that thread changes.
 */
function usePendingInteractions(
  threads: readonly PluginSidebarThread[],
): Readonly<Record<string, PendingInteractionSummary>> {
  const sdk = useSdk();
  const [fetched, setFetched] = useState<
    Readonly<Record<string, { version: string; summary: PendingInteractionSummary | null }>>
  >({});
  const waiting = useMemo(
    () =>
      threads
        .filter((t) => t.hasPendingInteraction && !t.isHidden && !t.isArchived)
        .map((t) => ({ id: t.id, version: `${t.updatedAt}:${t.latestAttentionAt}` })),
    [threads],
  );
  const waitingKey = waiting.map((w) => `${w.id}@${w.version}`).join(",");

  useEffect(() => {
    const controller = new AbortController();
    for (const { id, version } of waiting) {
      if (fetched[id]?.version === version) continue;
      sdk.threads.interactions
        .list({ threadId: id, signal: controller.signal })
        .then((list) => {
          const summary = summarizePendingInteractions(list);
          setFetched((current) => ({ ...current, [id]: { version, summary } }));
        })
        .catch(() => {
          // Leave the item on its generic reason; the next change retries.
        });
    }
    return () => controller.abort();
    // Keyed on the waiting threads' versions, not on `fetched`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, waitingKey]);

  return useMemo(() => {
    const summaries: Record<string, PendingInteractionSummary> = {};
    for (const { id } of waiting) {
      const summary = fetched[id]?.summary;
      if (summary) summaries[id] = summary;
    }
    return summaries;
  }, [waiting, fetched]);
}
