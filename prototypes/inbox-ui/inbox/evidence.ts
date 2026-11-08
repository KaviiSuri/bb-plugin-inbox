// PROTOTYPE — live evidence per environment: diffs from bb--git, PR checks
// from bb--github-pr-status (docs/research/sdk-surface.md §2). Tests are stubbed.
import { useCallback, useMemo } from "react";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { experimental_useRpcKeyedQuery, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import type { Diff, Evidence, FixtureExtras, PullRequest } from "./model";

const stats = z
  .object({
    insertions: z.number().optional(),
    deletions: z.number().optional(),
    fileCount: z.number().optional(),
    files: z
      .array(
        z.object({
          path: z.string(),
          status: z.string().optional(),
          insertions: z.number().optional(),
          deletions: z.number().optional(),
        }),
      )
      .optional(),
    commits: z.array(z.object({ shortSha: z.string(), subject: z.string() })).optional(),
  })
  .passthrough();

const git = defineRpcContract({
  status: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z
        .object({
          outcome: z.string(),
          workspace: z
            .object({
              workingTree: stats.optional(),
              mergeBase: stats.optional(),
              allChanges: stats.optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ),
  },
});

const prStatus = defineRpcContract({
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z
        .object({
          outcome: z.string(),
          pullRequest: z
            .object({
              number: z.number(),
              title: z.string(),
              url: z.string(),
              state: z.string(),
              checks: z
                .object({
                  state: z.string(),
                  totalCount: z.number().optional(),
                  passedCount: z.number().optional(),
                  failedCount: z.number().optional(),
                  pendingCount: z.number().optional(),
                })
                .passthrough(),
              review: z.object({ state: z.string() }).passthrough().optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ),
  },
});

export function useEvidence(
  threads: readonly PluginSidebarThread[],
  extras: Map<string, FixtureExtras>,
) {
  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const t of threads) if (t.environment?.id && !t.id.startsWith("fx-")) set.add(t.environment.id);
    return [...set].sort().slice(0, 200);
  }, [threads]);

  const gitQuery = experimental_useRpcKeyedQuery({
    pluginId: "bb--git",
    contract: git,
    method: "status",
    keys,
  });
  const prQuery = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract: prStatus,
    method: "pullRequests",
    keys,
  });

  return useCallback(
    (thread: PluginSidebarThread): Evidence => {
      const fixture = extras.get(thread.id)?.evidence;
      if (thread.id.startsWith("fx-")) {
        return { diff: fixture?.diff ?? null, pr: fixture?.pr ?? null, tests: fixture?.tests ?? null };
      }
      const envId = thread.environment?.id;
      if (!envId) return { diff: null, pr: null, tests: null };
      const g = (gitQuery.data as Record<string, z.infer<typeof git.status.output>[string]> | undefined)?.[envId];
      const p = (prQuery.data as Record<string, z.infer<typeof prStatus.pullRequests.output>[string]> | undefined)?.[envId];

      let diff: Diff | null = null;
      if (g?.outcome === "available" && g.workspace) {
        const w = g.workspace;
        const all = w.allChanges ?? w.mergeBase ?? w.workingTree;
        diff = {
          files: all?.fileCount ?? 0,
          insertions: all?.insertions ?? 0,
          deletions: all?.deletions ?? 0,
          commits: w.mergeBase?.commits?.length ?? 0,
        };
      }
      let pr: PullRequest | null = null;
      if (p?.outcome === "available" && p.pullRequest) {
        const c = p.pullRequest.checks;
        pr = {
          number: p.pullRequest.number,
          state: p.pullRequest.state,
          checks: {
            state: c.state,
            total: c.totalCount ?? 0,
            passed: c.passedCount ?? 0,
            failed: c.failedCount ?? 0,
            pending: c.pendingCount ?? 0,
          },
        };
      }
      // Tests: no SDK signal yet (docs/research/sdk-surface.md, Gaps).
      return { diff, pr, tests: null };
    },
    [extras, gitQuery.data, prQuery.data],
  );
}
