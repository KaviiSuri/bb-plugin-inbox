// Feeds the inbox model from the live sidebar: threads, the kinds of their
// pending interactions, the timing the grace and "stuck" need, evidence per
// environment, the server's Verifications and Laters, and the classifier's
// turn-end verdicts.
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
  nextChangeAt,
  summarizePendingInteractions,
  trackRuntime,
  withChildTurnEnd,
  type InboxSnapshot,
  type EnvironmentEvidence,
  type InboxView,
  type PendingInteractionSummary,
  type RuntimeTracking,
} from "./model/index.js";
import { useChildCompletions } from "./useChildCompletions.js";
import { useScopedChanges } from "./useScopedChanges.js";
import { useInboxStart, useSignOffs } from "./useSignOffs.js";
import { useTurnEnds } from "./useTurnEnds.js";
import type { TurnEnd } from "../../shared/inbox-turn-end.js";

const NO_TRACKING: RuntimeTracking = {
  running: {},
  stoppedAt: {},
  waitingForHostSince: {},
};

export interface InboxViewState {
  ready: boolean;
  view: InboxView;
  threadsById: ReadonlyMap<string, PluginSidebarThread>;
  /** Reads one thread's Verification and Later again. */
  refreshSignOffs(threadId: string): Promise<void>;
}

export function useInboxView(): InboxViewState {
  const { status, threads } = experimental_useSidebarThreads();
  const { interactions, interactionsMissing, interactionsWaitingSince } =
    usePendingInteractions(threads);
  const childCompletions = useChildCompletions(threads);
  // Children dated by their latest turn end, as their own items see them,
  // so evidence and scoped reads are keyed like the model compares.
  const visible = useMemo(
    () =>
      threads
        .filter((t) => !t.isHidden && !t.isArchived)
        .map((t) => withChildTurnEnd(t, { childCompletions })),
    [threads, childCompletions],
  );
  const signOffs = useSignOffs(useMemo(() => visible.map((t) => t.id), [visible]));
  const inboxStartedAt = useInboxStart();
  const { turnEnds, waitingSince: turnEndsWaitingSince } = useTurnEnds(
    threads,
    childCompletions,
    inboxStartedAt,
  );
  const evidence = useEvidence(visible, inboxStartedAt, turnEnds);
  const scoped = useScopedChanges(visible, signOffs.verifications);
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
      interactionsMissing,
      interactionsWaitingSince,
      childCompletions,
      turnEnds,
      turnEndsWaitingSince,
      runtime,
      evidence,
      verifications: signOffs.verifications,
      laters: signOffs.laters,
      scoped,
      inboxStartedAt,
      now: Date.now(),
    }),
    // `tick` re-reads the clock when a timed change is due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads, interactions, interactionsMissing, interactionsWaitingSince, childCompletions, turnEnds, turnEndsWaitingSince, runtime, evidence, signOffs, scoped, inboxStartedAt, tick],
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
    refreshSignOffs: signOffs.refresh,
  };
}

/** `bb--git status` takes at most this many keys per read. */
const MAX_EVIDENCE_KEYS = 200;

/**
 * Evidence for the environments of threads that could be Verify or FYI:
 * stopped, not waiting on the human, not folded into a parent (a child that
 * hasn't used the grilling skill), and with work after the Inbox started
 * (none until that start has loaded).
 * Verified threads are read too: their PR checks can turn failing after
 * the Verification. An
 * environment is in the result once both its git status and its pull request
 * have answered (or their read failed), so the model can hold back until then.
 */
function useEvidence(
  visible: readonly PluginSidebarThread[],
  inboxStartedAt: number | null,
  turnEnds: Readonly<Record<string, TurnEnd | null>>,
): Readonly<Record<string, EnvironmentEvidence>> {
  const keys = useMemo(() => {
    const visibleIds = new Set(visible.map((t) => t.id));
    const candidates = visible
      .filter(
        (t) =>
          t.environment?.id &&
          // A child without a pending interaction folds into its parent's
          // item, so its own evidence is never shown, unless it grills the
          // human: then its finished work is its own item (ADR 0008).
          (!(t.parentThreadId && visibleIds.has(t.parentThreadId)) ||
            turnEnds[t.id]?.grilling === true) &&
          !isRunning(t) &&
          !t.hasPendingInteraction &&
          inboxStartedAt !== null &&
          t.latestAttentionAt > inboxStartedAt,
      )
      .sort((a, b) => b.latestAttentionAt - a.latestAttentionAt);
    const ids = new Set<string>();
    for (const thread of candidates) {
      if (ids.size >= MAX_EVIDENCE_KEYS) break;
      ids.add(thread.environment!.id!);
    }
    return [...ids].sort();
  }, [visible, inboxStartedAt, turnEnds]);
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
 * with `hasPendingInteraction`, and again whenever that thread changes. Also
 * the waiting threads whose read failed or found nothing pending, so the
 * model shows them rather than hold them back as loading, and when this client
 * started waiting on each read still open, so the model bounds that wait.
 */
export function usePendingInteractions(
  threads: readonly PluginSidebarThread[],
): Pick<
  InboxSnapshot,
  "interactions" | "interactionsMissing" | "interactionsWaitingSince"
> {
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
    // Forget threads that stopped waiting, so a later ask isn't dated by
    // the one before it.
    const waitingIds = new Set(waiting.map((w) => w.id));
    setFetched((current) =>
      Object.keys(current).every((id) => waitingIds.has(id))
        ? current
        : Object.fromEntries(
            Object.entries(current).filter(([id]) => waitingIds.has(id)),
          ),
    );
    for (const { id, version } of waiting) {
      if (fetched[id]?.version === version) continue;
      sdk.threads.interactions
        .list({ threadId: id, signal: controller.signal })
        .then((list) => {
          const summary = summarizePendingInteractions(list);
          setFetched((current) => ({ ...current, [id]: { version, summary } }));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // Show the item on its generic reason; the next change retries.
          setFetched((current) => ({
            ...current,
            [id]: { version, summary: current[id]?.summary ?? null },
          }));
        });
    }
    return () => controller.abort();
    // Keyed on the waiting threads' versions, not on `fetched`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, waitingKey]);

  // First time each still-open read was seen, kept across renders.
  const openSinceRef = useRef<Record<string, number>>({});
  return useMemo(() => {
    const interactions: Record<string, PendingInteractionSummary> = {};
    const interactionsMissing: Record<string, true> = {};
    const interactionsWaitingSince: Record<string, number> = {};
    const now = Date.now();
    for (const { id } of waiting) {
      const entry = fetched[id];
      if (entry?.summary) interactions[id] = entry.summary;
      else if (entry) interactionsMissing[id] = true;
      else interactionsWaitingSince[id] = openSinceRef.current[id] ?? now;
    }
    openSinceRef.current = interactionsWaitingSince;
    return { interactions, interactionsMissing, interactionsWaitingSince };
  }, [waiting, fetched]);
}
