// What changed since each verified thread's Verification (ADR 0003), read once
// per finish for the threads that are coming back. `bb--git files` compares
// against the merge base of HEAD and the branch it's given, so naming the
// verified head commit gives exactly the work since it, committed or not.
import { useEffect, useMemo, useState } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { Verification } from "../../shared/inbox-verification.js";
import { gitFilesSchema, GIT_PLUGIN_ID } from "./evidence.js";
import {
  isRunning,
  scopeChanges,
  scopeTarget,
  type ScopedChanges,
} from "./model/index.js";

interface Target {
  threadId: string;
  environmentId: string;
  sha: string;
  verification: Verification;
  attentionAt: number;
}

/** Verified threads whose new work has finished, asked or failed. */
export function scopeTargets(
  threads: readonly PluginSidebarThread[],
  verifications: Readonly<Record<string, Verification>>,
): Target[] {
  const targets: Target[] = [];
  for (const thread of threads) {
    const verification = verifications[thread.id];
    const environmentId = thread.environment?.id;
    const base = verification?.diffBase;
    const sha = base ? scopeTarget(base) : null;
    if (!verification || !environmentId || !base || !sha) continue;
    if (verification.verifiedAt >= thread.latestAttentionAt) continue;
    if (isRunning(thread) || thread.hasPendingInteraction) continue;
    targets.push({
      threadId: thread.id,
      environmentId,
      sha,
      verification,
      attentionAt: thread.latestAttentionAt,
    });
  }
  return targets;
}

export function useScopedChanges(
  threads: readonly PluginSidebarThread[],
  verifications: Readonly<Record<string, Verification>>,
): Readonly<Record<string, ScopedChanges>> {
  const sdk = useSdk();
  const [read, setRead] = useState<Readonly<Record<string, ScopedChanges>>>({});
  const targets = useMemo(
    () => scopeTargets(threads, verifications),
    [threads, verifications],
  );
  const targetsKey = targets
    .map((t) => `${t.threadId}@${t.verification.verifiedAt}:${t.attentionAt}`)
    .join(",");

  useEffect(() => {
    const controller = new AbortController();
    for (const target of targets) {
      const { threadId, verification, attentionAt } = target;
      const current = read[threadId];
      if (
        current?.verifiedAt === verification.verifiedAt &&
        current.attentionAt === attentionAt
      ) {
        continue;
      }
      const stamp = { verifiedAt: verification.verifiedAt, attentionAt };
      sdk.plugins
        .callRpc({
          pluginId: GIT_PLUGIN_ID,
          method: "files",
          input: {
            environmentId: target.environmentId,
            target: { type: "all", mergeBaseBranch: target.sha },
            ignoreWhitespace: false,
          },
          outputSchema: gitFilesSchema,
          signal: controller.signal,
        })
        .then((result): ScopedChanges => {
          if (result.outcome !== "available" || !("files" in result)) {
            return { ...stamp, outcome: "unavailable" };
          }
          const scoped = scopeChanges(result.files, verification.diffBase!);
          return { ...stamp, outcome: "available", ...scoped };
        })
        .catch((): ScopedChanges | null =>
          controller.signal.aborted ? null : { ...stamp, outcome: "unavailable" },
        )
        .then((scoped) => {
          if (scoped) setRead((all) => ({ ...all, [threadId]: scoped }));
        });
    }
    return () => controller.abort();
    // Keyed on each target's Verification and finish, not on `read`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, targetsKey]);

  return read;
}
