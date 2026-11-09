// Feeds the inbox model from the live sidebar: threads, the kinds of their
// pending interactions, the timing the grace and "stuck" need, evidence per
// environment, and the server's Verifications and Laters.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  experimental_useRpcKeyedQuery,
  experimental_useSidebarThreads,
  useSdk,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  evidenceFromRows,
  gitContract,
  GIT_PLUGIN_ID,
  pullRequestContract,
  PR_PLUGIN_ID,
} from "./evidence.js";
import {
  deriveInbox,
  isRunning,
  isVerified,
  nextChangeAt,
  summarizePendingInteractions,
  trackRuntime,
  type InboxSnapshot,
  type EnvironmentEvidence,
  type InboxView,
  type PendingInteractionSummary,
  type RuntimeTracking,
} from "./model/index.js";
import { useSignOffs, type SignOffs } from "./useSignOffs.js";

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
  const visible = useMemo(
    () => threads.filter((t) => !t.isHidden && !t.isArchived),
    [threads],
  );
  const signOffs = useSignOffs(useMemo(() => visible.map((t) => t.id), [visible]));
  const evidence = useEvidence(visible, signOffs);
  const [tick, setTick] = useState(0);

  // Advance the stop/stuck tracking once per new thread list.
  const trackingRef = useRef(NO_TRACKING);
  const runtime = useMemo(() => {
    trackingRef.current = trackRuntime(trackingRef.current, threads, Date.now());
    return trackingRef.current;
  }, [threads]);

  const snapshot = useMemo<InboxSnapshot>(
    () => ({
      threads,
      interactions,
      runtime,
      evidence,
      verifications: signOffs.verifications,
      laters: signOffs.laters,
      now: Date.now(),
    }),
    // `tick` re-reads the clock when a timed change is due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, interactions, runtime, evidence, signOffs, tick],
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
  return {
    ready: status !== "loading" && signOffs.loaded,
    view,
    threadsById,
  };
}

/** `bb--git status` takes at most this many keys per read. */
const MAX_EVIDENCE_KEYS = 200;

/**
 * Evidence for the environments of threads that could be Verify or FYI:
 * stopped, not waiting on the human, and not already verified. An
 * environment is in the result once both its git status and its pull request
 * have answered (or their read failed), so the model can hold back until then.
 */
function useEvidence(
  visible: readonly PluginSidebarThread[],
  { verifications }: SignOffs,
): Readonly<Record<string, EnvironmentEvidence>> {
  const keys = useMemo(() => {
    const candidates = visible
      .filter(
        (t) =>
          t.environment?.id &&
          !isRunning(t) &&
          !t.hasPendingInteraction &&
          !isVerified(t, verifications[t.id]),
      )
      .sort((a, b) => b.latestAttentionAt - a.latestAttentionAt);
    const ids = new Set<string>();
    for (const thread of candidates) {
      if (ids.size >= MAX_EVIDENCE_KEYS) break;
      ids.add(thread.environment!.id!);
    }
    return [...ids].sort();
  }, [visible, verifications]);
  const keysId = keys.join(",");
  const stableKeys = useMemo(() => keys, [keysId]); // eslint-disable-line react-hooks/exhaustive-deps

  const git = experimental_useRpcKeyedQuery({
    pluginId: GIT_PLUGIN_ID,
    contract: gitContract,
    method: "status",
    keys: stableKeys,
  });
  const prs = experimental_useRpcKeyedQuery({
    pluginId: PR_PLUGIN_ID,
    contract: pullRequestContract,
    method: "pullRequests",
    keys: stableKeys,
  });
  return useMemo(() => {
    const result: Record<string, EnvironmentEvidence> = {};
    for (const id of stableKeys) {
      const gitRow = git.data?.[id];
      const prRow = prs.data?.[id];
      const gitKnown = gitRow !== undefined || git.error !== null;
      const prKnown = prRow !== undefined || prs.error !== null;
      if (gitKnown && prKnown) {
        result[id] = evidenceFromRows(gitRow ?? null, prRow ?? null);
      }
    }
    return result;
  }, [stableKeys, git.data, git.error, prs.data, prs.error]);
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
