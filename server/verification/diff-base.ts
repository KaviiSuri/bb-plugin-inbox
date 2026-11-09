// What a Verification covers, read from the bundled Git and GitHub PR Status
// plugins when the human verifies: the head commit and per-file revisions
// (`bb--git status` and `files`, target "all" against the default branch),
// and the PR's checks state. Reads that fail leave their field null; the
// Verification is still recorded.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type {
  DiffBase,
  PrChecksState,
} from "../../shared/inbox-verification.js";
import { prChecksStateSchema } from "../../shared/inbox-verification.js";
import { gitFileSideSchema, MAX_SNAPSHOT_FILES, textFromSide } from "../../shared/inbox-git-content.js";

const gitStatusSchema = z.record(
  z.string(),
  z.union([
    z.object({
      outcome: z.literal("available"),
      workspace: z.object({
        checkout: z.object({ headSha: z.string().nullable().optional() }),
        branch: z.object({ defaultBranch: z.string() }),
      }),
    }),
    z.object({ outcome: z.string() }),
  ]),
);

const gitFilesSchema = z.union([
  z.object({
    outcome: z.literal("available"),
    files: z.array(z.object({ path: z.string(), revision: z.string() })),
    mergeBaseRef: z.string().nullable(),
  }),
  z.object({ outcome: z.string() }),
]);

const pullRequestsSchema = z.record(
  z.string(),
  z.union([
    z.object({
      outcome: z.literal("available"),
      pullRequest: z.object({
        checks: z.object({ state: prChecksStateSchema }),
      }),
    }),
    z.object({ outcome: z.string() }),
  ]),
);

export interface CoveredWork {
  diffBase: DiffBase | null;
  prChecksState: PrChecksState | null;
}

export async function readCoveredWork(
  bb: BbPluginApi,
  threadId: string,
): Promise<CoveredWork> {
  const environmentId = await environmentOf(bb, threadId);
  if (!environmentId) return { diffBase: null, prChecksState: null };
  const [diffBase, prChecksState] = await Promise.all([
    readDiffBase(bb, environmentId),
    readPrChecksState(bb, environmentId),
  ]);
  return { diffBase, prChecksState };
}

async function environmentOf(
  bb: BbPluginApi,
  threadId: string,
): Promise<string | null> {
  try {
    const thread = await bb.sdk.threads.get({ threadId });
    return thread.environmentId;
  } catch (error) {
    bb.log.warn(`verify ${threadId}: could not read the thread: ${message(error)}`);
    return null;
  }
}

async function readDiffBase(
  bb: BbPluginApi,
  environmentId: string,
): Promise<DiffBase | null> {
  try {
    const status = await bb.sdk.plugins.callRpc({
      pluginId: "bb--git",
      method: "status",
      input: { keys: [environmentId] },
      outputSchema: gitStatusSchema,
    });
    const row = status[environmentId];
    if (row?.outcome !== "available" || !("workspace" in row)) return null;
    const { checkout, branch } = row.workspace;
    const files = await bb.sdk.plugins.callRpc({
      pluginId: "bb--git",
      method: "files",
      input: {
        environmentId,
        target: { type: "all", mergeBaseBranch: branch.defaultBranch },
        ignoreWhitespace: false,
      },
      outputSchema: gitFilesSchema,
    });
    if (files.outcome !== "available" || !("files" in files)) return null;
    // A head SHA alone cannot represent uncommitted work. Preserve bounded
    // text snapshots too, so a later edit is compared with what was signed
    // off, not with the file as it was at HEAD. Old/binary/large bases without
    // text fall back explicitly rather than claiming an exact scoped diff.
    const captured = [];
    for (const [index, file] of files.files.entries()) {
      let content: string | undefined;
      if (index < MAX_SNAPSHOT_FILES && files.mergeBaseRef) {
        try {
          const side = await bb.sdk.plugins.callRpc({
            pluginId: "bb--git",
            method: "fileSide",
            input: {
              environmentId,
              query: { target: "all", mergeBaseRef: files.mergeBaseRef, path: file.path, side: "new" },
            },
            outputSchema: gitFileSideSchema,
          });
          content = textFromSide(side);
        } catch {
          // Still record the sign-off; future work uses an honest fallback.
        }
      }
      captured.push({ path: file.path, revision: file.revision, ...(content === undefined ? {} : { content }) });
    }
    return {
      headSha: checkout.headSha ?? null,
      mergeBaseRef: files.mergeBaseRef,
      files: captured,
    };
  } catch (error) {
    bb.log.warn(`verify: could not read git for ${environmentId}: ${message(error)}`);
    return null;
  }
}

async function readPrChecksState(
  bb: BbPluginApi,
  environmentId: string,
): Promise<PrChecksState | null> {
  try {
    const rows = await bb.sdk.plugins.callRpc({
      pluginId: "bb--github-pr-status",
      method: "pullRequests",
      input: { keys: [environmentId] },
      outputSchema: pullRequestsSchema,
    });
    const row = rows[environmentId];
    return row?.outcome === "available" && "pullRequest" in row
      ? row.pullRequest.checks.state
      : null;
  } catch (error) {
    bb.log.warn(
      `verify: could not read the pull request for ${environmentId}: ${message(error)}`,
    );
    return null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
