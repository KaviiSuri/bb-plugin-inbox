// Shared fixtures for the inbox model's tests.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { TurnEnd } from "../../../shared/inbox-turn-end.js";
import type { PendingInteractionSummary } from "./blocked.js";
import type { InboxSnapshot } from "./types.js";
import type { EnvironmentEvidence, PullRequestEvidence } from "./verify.js";

export { makeSidebarThread } from "../../model/fixtures.js";

export const NOW = 1_000_000;

export const QUESTION: PendingInteractionSummary = {
  kind: "user_question",
  reason: "Asks: which database?",
};

/** A stored verdict, as the `turnEnds` rpc returns it. */
export function turnEnd(overrides: Partial<TurnEnd> = {}): TurnEnd {
  return {
    verdict: "report",
    source: "heuristic",
    fallback: "no-provider",
    grilling: false,
    turnKey: 0,
    completedAt: null,
    classifiedAt: 0,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<InboxSnapshot> = {}): InboxSnapshot {
  const threads = overrides.threads ?? [];
  // Simple fixtures use coincident attention/completion times. Lifecycle
  // regressions override these with captured server turn/completed times.
  const childCompletions =
    overrides.childCompletions ??
    Object.fromEntries(threads.map((t) => [t.id, t.latestAttentionAt]));
  return {
    threads: [],
    interactions: {},
    childCompletions,
    // Every turn ended in a report unless a test says otherwise.
    turnEnds: Object.fromEntries(
      threads.map((t) => [
        t.id,
        turnEnd({
          turnKey: t.latestAttentionAt,
          completedAt: childCompletions[t.id] ?? null,
        }),
      ]),
    ),
    turnEndsWaitingSince: {},
    runtime: { running: {}, stoppedAt: {}, waitingForHostSince: {} },
    evidence: {},
    verifications: {},
    laters: {},
    scoped: {},
    inboxStartedAt: 0,
    now: NOW,
    ...overrides,
  };
}

/** A thread's `environment`, for evidence keyed by environment id. */
export function environment(id: string): PluginSidebarThread["environment"] {
  return {
    id,
    name: id,
    branchName: "feat/x",
    path: `/work/${id}`,
    isWorktree: true,
    providerId: null,
    workspaceDisplayKind: null,
  };
}

export const DIFF: EnvironmentEvidence = {
  diff: { fileCount: 3, insertions: 40, deletions: 12 },
  pullRequest: null,
};

export function pullRequest(
  checks: Partial<PullRequestEvidence["checks"]> = {},
): EnvironmentEvidence {
  return {
    diff: null,
    pullRequest: {
      number: 12,
      state: "open",
      checks: { state: "passing", totalCount: 7, failedCount: 0, ...checks },
    },
  };
}
