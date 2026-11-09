// Coming back (ADR 0003): a verified thread that did more work re-enters the
// inbox once that work finishes, asks or fails, showing only what changed
// since the Verification's diff base. It also comes back under Verify, with
// no new work, when its PR checks fail now but didn't at sign-off (ADR 0005).
// Runs after Blocked on you, Broken and running, so asking or failing come
// back in their own tier and running work never comes back early.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type {
  DiffBase,
  Verification,
} from "../../../shared/inbox-verification.js";
import { fyi } from "./fyi.js";
import { item, type InboxSnapshot, type Outcome } from "./types.js";
import {
  evidenceOf,
  hasEvidence,
  type DiffStat,
  type EnvironmentEvidence,
  type PullRequestEvidence,
} from "./verify.js";

/** One row of `bb--git files`: a changed file and its revision. */
export interface ChangedFile {
  path: string;
  revision: string;
  additions: number;
  deletions: number;
}

/**
 * What changed since a Verification's diff base, read for one finish of the
 * thread. `verifiedAt` and `attentionAt` name the Verification and the finish
 * it was read for, so a read for an older one is never used.
 */
export type ScopedChanges = {
  verifiedAt: number;
  attentionAt: number;
} & (
  | { outcome: "available"; diff: DiffStat | null; paths: string[] }
  /** The read failed: the item falls back to all of its changes. */
  | { outcome: "unavailable" }
);

/** What an item that's coming back carries besides its scoped evidence. */
export interface ComingBack {
  verifiedAt: number;
  client: string;
  /** False when what's new couldn't be told apart: evidence is everything. */
  scoped: boolean;
  /** The files the Verification covered, reachable from the opened row. */
  verifiedPaths: string[];
}

/**
 * The commit to compare against for changes since the base: its head, or its
 * merge base when the head wasn't known. Null when neither was.
 */
export function scopeTarget(base: DiffBase): string | null {
  return base.headSha ?? base.mergeBaseRef;
}

/** A revision's new side (mode and blob): the file's content now. */
function contentOf(revision: string): string {
  return revision.split(":").slice(2).join(":");
}

/**
 * The changes since the base, from `files` read against `scopeTarget`. A file
 * whose content is what it was at the Verification is left out: it was
 * already verified, uncommitted then and committed since, or rebased.
 */
export function scopeChanges(
  files: readonly ChangedFile[],
  base: DiffBase,
): { diff: DiffStat | null; paths: string[] } {
  const verified = new Map(
    base.files.map((file) => [file.path, contentOf(file.revision)]),
  );
  const changed = files.filter(
    (file) => verified.get(file.path) !== contentOf(file.revision),
  );
  if (changed.length === 0) return { diff: null, paths: [] };
  return {
    diff: {
      fileCount: changed.length,
      insertions: changed.reduce((sum, file) => sum + file.additions, 0),
      deletions: changed.reduce((sum, file) => sum + file.deletions, 0),
    },
    paths: changed.map((file) => file.path),
  };
}

/**
 * PR checks fail now but didn't when the work was verified. With no checks
 * state recorded (no PR then, or it couldn't be read, or a sign-off still
 * saving) there's nothing to say they turned, so they didn't.
 */
function checksTurnedFailing(
  pullRequest: PullRequestEvidence | null,
  verification: Verification,
): pullRequest is PullRequestEvidence {
  return (
    pullRequest?.checks.state === "failing" &&
    verification.prChecksState !== null &&
    verification.prChecksState !== "failing"
  );
}

function failingChecks({ number, checks }: PullRequestEvidence): string {
  return `PR #${number}: ${checks.failedCount} of ${checks.totalCount} checks failing`;
}

function comingBackOf(
  verification: Verification,
  scoped: boolean,
): ComingBack {
  return {
    verifiedAt: verification.verifiedAt,
    client: verification.client,
    scoped,
    verifiedPaths: verification.diffBase?.files.map((file) => file.path) ?? [],
  };
}

function back(
  verification: Verification,
  reason: string,
  evidence: EnvironmentEvidence,
  scoped: boolean,
): Outcome {
  return item({
    tier: "verify",
    word: "verify",
    reason,
    evidence,
    comingBack: comingBackOf(verification, scoped),
  });
}

/**
 * Decides every finished thread that has a Verification, holding back while
 * its evidence or its scoped changes load. Returns null only for new work
 * with nothing to verify, which `fyi` then reports.
 */
export function comingBack(
  thread: PluginSidebarThread,
  snapshot: InboxSnapshot,
): Outcome | null {
  const verification = snapshot.verifications[thread.id];
  if (!verification) return null;
  const evidence = evidenceOf(thread, snapshot);
  if (evidence === undefined) return { kind: "none" };
  const { pullRequest } = evidence;
  const turnedFailing = checksTurnedFailing(pullRequest, verification);

  // No new work: only checks that started failing bring it back.
  if (verification.verifiedAt >= thread.latestAttentionAt) {
    if (!turnedFailing) return { kind: "none" };
    return back(
      verification,
      `${failingChecks(pullRequest)} since you verified`,
      { diff: null, pullRequest },
      true,
    );
  }

  if (!hasEvidence(evidence)) return null;
  const scope = scopedChangesFor(thread, verification, snapshot);
  if (scope === "loading") return { kind: "none" };
  if (scope === "unscoped") {
    const reason = turnedFailing
      ? `New work; ${failingChecks(pullRequest)}`
      : "New work; couldn't tell what changed since you verified";
    return back(verification, reason, evidence, false);
  }
  if (scope.diff) {
    const reason = turnedFailing
      ? `New changes; ${failingChecks(pullRequest)}`
      : "New changes since you verified";
    return back(verification, reason, { diff: scope.diff, pullRequest }, true);
  }
  if (turnedFailing) {
    return back(
      verification,
      `${failingChecks(pullRequest)} since you verified`,
      { diff: null, pullRequest },
      true,
    );
  }
  // Only a report since the base: FYI, cleared by opening (ADR 0004).
  return fyi(thread);
}

/**
 * The thread's changes since the Verification, "loading" until they're read
 * for this finish, or "unscoped" when they can't be: no diff base was
 * recorded (git couldn't be read at sign-off) or the read failed.
 */
function scopedChangesFor(
  thread: PluginSidebarThread,
  verification: Verification,
  snapshot: InboxSnapshot,
): { diff: DiffStat | null } | "loading" | "unscoped" {
  const base = verification.diffBase;
  if (!base || scopeTarget(base) === null) return "unscoped";
  const scoped = snapshot.scoped[thread.id];
  if (
    !scoped ||
    scoped.verifiedAt !== verification.verifiedAt ||
    scoped.attentionAt !== thread.latestAttentionAt
  ) {
    return "loading";
  }
  return scoped.outcome === "available" ? scoped : "unscoped";
}
