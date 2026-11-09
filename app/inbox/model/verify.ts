// Verify: finished work with Evidence to check. A Verification clears it
// (ADR 0007); failing PR checks keep it here, not under Broken (ADR 0005).
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { Verification } from "../../../shared/inbox-verification.js";
import { item, type InboxSnapshot, type Outcome } from "./types.js";

export interface DiffStat {
  fileCount: number;
  insertions: number;
  deletions: number;
}

export interface PullRequestEvidence {
  number: number;
  state: "draft" | "open" | "merged" | "closed";
  checks: {
    state: "passing" | "failing" | "pending" | "no_checks" | "unknown";
    totalCount: number;
    failedCount: number;
  };
}

/** What an environment holds to check; null fields mean none. */
export interface EnvironmentEvidence {
  /** Changes against the merge base, committed or not; null when none. */
  diff: DiffStat | null;
  pullRequest: PullRequestEvidence | null;
}

export const NO_EVIDENCE: EnvironmentEvidence = { diff: null, pullRequest: null };

export function hasEvidence(evidence: EnvironmentEvidence): boolean {
  return evidence.diff !== null || evidence.pullRequest !== null;
}

/**
 * The thread's evidence; NO_EVIDENCE when it has no environment, undefined
 * while its environment's evidence is still loading.
 */
export function evidenceOf(
  thread: PluginSidebarThread,
  { evidence }: InboxSnapshot,
): EnvironmentEvidence | undefined {
  const environmentId = thread.environment?.id;
  return environmentId ? evidence[environmentId] : NO_EVIDENCE;
}

/** The Verification covers everything the thread has done so far. */
export function isVerified(
  thread: PluginSidebarThread,
  verification: Verification | undefined,
): boolean {
  return (
    verification !== undefined &&
    verification.verifiedAt >= thread.latestAttentionAt
  );
}

function verifyReason({ diff, pullRequest }: EnvironmentEvidence): string {
  if (pullRequest) {
    const { checks } = pullRequest;
    if (checks.state === "failing") {
      return `PR #${pullRequest.number}: ${checks.failedCount} of ${checks.totalCount} checks failing`;
    }
    return `Finished with PR #${pullRequest.number} to check`;
  }
  return diff ? "Finished with changes to check" : "Finished";
}

/**
 * A finished thread with evidence. Holds back (no item) while the evidence
 * loads, so a Verify item doesn't flash up as FYI first.
 */
export function verify(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): Outcome | null {
  const evidence = evidenceOf(thread, snapshot);
  if (evidence === undefined) return { kind: "none" };
  if (!hasEvidence(evidence)) return null;
  if (isVerified(thread, snapshot.verifications[thread.id])) {
    return { kind: "none" };
  }
  return item({
    tier: "verify",
    word: "verify",
    reason: verifyReason(evidence),
    evidence,
  });
}
