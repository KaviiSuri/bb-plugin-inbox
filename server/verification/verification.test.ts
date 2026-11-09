import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  signOffTag,
  verificationRpcContract,
} from "../../shared/inbox-verification.js";
import { registerVerification } from "./index.js";

const ENV = "env_a";
const REVISION = "100644:aaaa:100644:bbbb";

type CallRpcArgs = { pluginId: string; method: string; input?: unknown };

/** The bundled Git and PR plugins' answers for env_a. */
/** What the bundled plugins report; a test can change it between calls. */
interface Work {
  headSha: string;
  revision: string;
  checks: string;
}

function bundledPlugins(
  work: Work,
  { failGit = false }: { failGit?: boolean } = {},
) {
  return async ({ pluginId, method }: CallRpcArgs): Promise<unknown> => {
    if (pluginId === "bb--git" && failGit) throw new Error("machine offline");
    if (pluginId === "bb--git" && method === "status") {
      return {
        [ENV]: {
          outcome: "available",
          workspace: {
            checkout: { kind: "branch", branchName: "feat/x", headSha: work.headSha },
            branch: { currentBranch: "feat/x", defaultBranch: "main" },
          },
        },
      };
    }
    if (pluginId === "bb--git" && method === "files") {
      return {
        outcome: "available",
        files: [{ path: "a.ts", revision: work.revision }],
        mergeBaseRef: "base999",
      };
    }
    if (pluginId === "bb--github-pr-status" && method === "pullRequests") {
      return {
        [ENV]: { outcome: "available", pullRequest: { checks: { state: work.checks } } },
      };
    }
    throw new Error(`unexpected ${pluginId}.${method}`);
  };
}

afterEach(() => {
  vi.useRealTimers();
});

async function setup(options: { failGit?: boolean } = {}) {
  const work: Work = { headSha: "abc123", revision: REVISION, checks: "failing" };
  const callRpc = vi.fn(bundledPlugins(work, options));
  const host = createFakePluginHost({
    pluginId: "inbox",
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) =>
          makeThreadResponse({ id: threadId, environmentId: ENV }),
      },
      plugins: { callRpc: callRpc as never },
    },
  });
  registerVerification(host.bb);
  return { ...host, callRpc, work };
}

describe("verify", () => {
  it("stores a Verification with its diff base and checks state, read back through the keyed RPC", async () => {
    const { harness, callRpc } = await setup();
    vi.setSystemTime(5_000);
    const written = await harness.behavior.callRpc("verify", {
      threadId: "thr_1",
      client: "iPhone · browser",
    });
    const expected = {
      threadId: "thr_1",
      verifiedAt: 5_000,
      client: "iPhone · browser",
      diffBase: {
        headSha: "abc123",
        mergeBaseRef: "base999",
        files: [{ path: "a.ts", revision: REVISION }],
      },
      prChecksState: "failing",
    };
    expect(written).toEqual(expected);
    await expect(
      harness.behavior.callRpc("verifications", { keys: ["thr_1", "thr_2"] }),
    ).resolves.toEqual({ thr_1: expected, thr_2: null });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "bb--git",
        method: "files",
        input: {
          environmentId: ENV,
          target: { type: "all", mergeBaseBranch: "main" },
          ignoreWhitespace: false,
        },
      }),
    );
  });

  it("refreshes the thread's reads in every client", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc("verify", { threadId: "thr_1", client: "Mac" });
    expect(harness.inspection.experimental_rpcInvalidations).toEqual([
      [signOffTag("thr_1")],
    ]);
  });

  it("still records the Verification when git can't be read", async () => {
    const { harness } = await setup({ failGit: true });
    await harness.behavior.callRpc("verify", { threadId: "thr_1", client: "Mac" });
    await expect(
      harness.behavior.callRpc("verifications", { keys: ["thr_1"] }),
    ).resolves.toMatchObject({
      thr_1: { threadId: "thr_1", diffBase: null, prChecksState: "failing" },
    });
  });

  it("replaces an earlier Verification of the same thread, with the work it covers now", async () => {
    const { harness, work } = await setup();
    vi.setSystemTime(1_000);
    await harness.behavior.callRpc("verify", { threadId: "thr_1", client: "Mac" });
    work.headSha = "def456";
    work.revision = "100644:bbbb:100644:cccc";
    work.checks = "passing";
    vi.setSystemTime(2_000);
    await harness.behavior.callRpc("verify", { threadId: "thr_1", client: "iPhone" });
    await expect(
      harness.behavior.callRpc("verifications", { keys: ["thr_1"] }),
    ).resolves.toEqual({
      thr_1: {
        threadId: "thr_1",
        verifiedAt: 2_000,
        client: "iPhone",
        diffBase: {
          headSha: "def456",
          mergeBaseRef: "base999",
          files: [{ path: "a.ts", revision: "100644:bbbb:100644:cccc" }],
        },
        prChecksState: "passing",
      },
    });
  });
});

describe("later", () => {
  it("stores a Later, read back through the keyed RPC, and refreshes the thread's reads", async () => {
    const { harness } = await setup();
    vi.setSystemTime(7_000);
    await expect(
      harness.behavior.callRpc("later", { threadId: "thr_1", client: "Mac" }),
    ).resolves.toEqual({ threadId: "thr_1", laterAt: 7_000, client: "Mac" });
    await expect(
      harness.behavior.callRpc("laters", { keys: ["thr_1", "thr_2"] }),
    ).resolves.toEqual({
      thr_1: { threadId: "thr_1", laterAt: 7_000, client: "Mac" },
      thr_2: null,
    });
    expect(harness.inspection.experimental_rpcInvalidations).toEqual([
      [signOffTag("thr_1")],
    ]);
  });

  it("is not a Verification", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc("later", { threadId: "thr_1", client: "Mac" });
    await expect(
      harness.behavior.callRpc("verifications", { keys: ["thr_1"] }),
    ).resolves.toEqual({ thr_1: null });
  });
});

describe("keyed reads", () => {
  it("tag each thread's row with the tag its writes invalidate", () => {
    const { verifications, laters } = verificationRpcContract;
    expect(verifications.keyTags?.("thr_1", null)).toEqual([signOffTag("thr_1")]);
    expect(laters.keyTags?.("thr_1", null)).toEqual([signOffTag("thr_1")]);
  });
});

describe("inboxStart (ADR 0010)", () => {
  it("is recorded on the first run and kept by every later run", async () => {
    vi.setSystemTime(1_000);
    const first = createFakePluginHost({ pluginId: "inbox" });
    registerVerification(first.bb);
    await expect(
      first.harness.behavior.callRpc("inboxStart", null),
    ).resolves.toEqual({ startedAt: 1_000 });

    vi.setSystemTime(9_000);
    const second = await first.harness.lifecycle.reload(registerVerification);
    await expect(
      second.harness.behavior.callRpc("inboxStart", null),
    ).resolves.toEqual({ startedAt: 1_000 });
  });
});
