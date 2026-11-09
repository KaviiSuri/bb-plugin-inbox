// Evidence per environment, read from the bundled Git and GitHub PR Status
// plugins. Only the fields the Inbox reads are in these contracts
// (`bb plugin rpc inspect bb--git status`, `... bb--github-pr-status
// pullRequests` print the full schemas).
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  NO_EVIDENCE,
  type EnvironmentEvidence,
  type PullRequestEvidence,
} from "./model/index.js";

export const GIT_PLUGIN_ID = "bb--git";
export const PR_PLUGIN_ID = "bb--github-pr-status";

const keysInput = z.object({ keys: z.array(z.string()) });

const gitStatusRowSchema = z.union([
  z.object({
    outcome: z.literal("available"),
    workspace: z.object({
      allChanges: z.object({
        fileCount: z.number(),
        insertions: z.number(),
        deletions: z.number(),
      }),
    }),
  }),
  z.object({ outcome: z.enum(["not_applicable", "unavailable", "failed"]) }),
]);
export type GitStatusRow = z.infer<typeof gitStatusRowSchema>;

export const gitContract = defineRpcContract({
  status: {
    input: keysInput,
    output: z.record(z.string(), gitStatusRowSchema),
  },
});

const pullRequestRowSchema = z.union([
  z.object({
    outcome: z.literal("available"),
    pullRequest: z.object({
      number: z.number(),
      state: z.enum(["draft", "open", "merged", "closed"]),
      checks: z.object({
        state: z.enum(["passing", "failing", "pending", "no_checks", "unknown"]),
        totalCount: z.number(),
        failedCount: z.number(),
      }),
    }),
  }),
  z.object({ outcome: z.enum(["absent", "unavailable"]) }),
]);
export type PullRequestRow = z.infer<typeof pullRequestRowSchema>;

export const pullRequestContract = defineRpcContract({
  pullRequests: {
    input: keysInput,
    output: z.record(z.string(), pullRequestRowSchema),
  },
});

/**
 * One environment's evidence from its git status and pull request rows.
 * Anything but a clean read counts as nothing to show, the way bb's own
 * badges treat it.
 */
export function evidenceFromRows(
  git: GitStatusRow | null,
  pr: PullRequestRow | null,
): EnvironmentEvidence {
  const changes =
    git?.outcome === "available" ? git.workspace.allChanges : null;
  const pullRequest: PullRequestEvidence | null =
    pr?.outcome === "available"
      ? {
          number: pr.pullRequest.number,
          state: pr.pullRequest.state,
          checks: {
            state: pr.pullRequest.checks.state,
            totalCount: pr.pullRequest.checks.totalCount,
            failedCount: pr.pullRequest.checks.failedCount,
          },
        }
      : null;
  if (!pullRequest && (!changes || changes.fileCount === 0)) return NO_EVIDENCE;
  return {
    diff:
      changes && changes.fileCount > 0
        ? {
            fileCount: changes.fileCount,
            insertions: changes.insertions,
            deletions: changes.deletions,
          }
        : null,
    pullRequest,
  };
}

/** The opened row's evidence lines: the diffstat, then the PR and checks. */
export function describeEvidence({
  diff,
  pullRequest,
}: EnvironmentEvidence): string[] {
  const lines: string[] = [];
  if (diff) {
    const files = diff.fileCount === 1 ? "1 file" : `${diff.fileCount} files`;
    lines.push(`${files} · +${diff.insertions} −${diff.deletions}`);
  }
  if (pullRequest) {
    lines.push(
      `PR #${pullRequest.number} · ${pullRequest.state} · ${checksLabel(pullRequest.checks)}`,
    );
  }
  return lines;
}

function checksLabel(checks: PullRequestEvidence["checks"]): string {
  switch (checks.state) {
    case "passing":
      return "checks passing";
    case "failing":
      return `${checks.failedCount} of ${checks.totalCount} checks failing`;
    case "pending":
      return "checks running";
    case "no_checks":
      return "no checks";
    default:
      return "checks unknown";
  }
}
