// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import {
  loadPluginApp,
  renderSlot,
  type RenderSlotOptions,
} from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  flushPreferenceWritesForTest,
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import {
  defaultPreferences,
  PREFERENCES_CHANGED_CHANNEL,
  type PreferenceValues,
} from "../../shared/preferences.js";
import { signOffTag } from "../../shared/inbox-verification.js";

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

const THREADS = [
  makeSidebarThread({
    id: "thr_ask",
    projectId: "proj_app",
    title: "Grill: billing edge cases",
    hasPendingInteraction: true,
    latestAttentionAt: 30,
    lastReadAt: 0,
  }),
  makeSidebarThread({
    id: "thr_fail",
    projectId: "proj_app",
    title: "Regenerate OpenAPI client",
    status: "error",
    latestAttentionAt: 20,
    lastReadAt: 25,
  }),
  makeSidebarThread({
    id: "thr_run",
    projectId: "proj_app",
    title: "Bump eslint",
    status: "active",
    latestAttentionAt: 10,
  }),
  makeSidebarThread({
    id: "thr_done",
    projectId: "proj_app",
    title: "Add retry to webhook sender",
    latestAttentionAt: 15,
    lastReadAt: 16,
    environment: {
      id: "env_done",
      name: "env_done",
      branchName: "feat/retry",
      path: "/work/retry",
      isWorktree: true,
      providerId: null,
      workspaceDisplayKind: null,
    },
  }),
  makeSidebarThread({
    id: "thr_quiet",
    projectId: "proj_app",
    title: "Quiet thread",
    latestAttentionAt: 5,
    lastReadAt: 5,
  }),
];

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

/** The server's Verifications, as the plugin's keyed read answers them. */
type Rows = Record<string, Record<string, unknown>>;
type MarkInput = { threadId: string; client: string };

const keysOf = (input: unknown) => (input as { keys: string[] }).keys;

function signOffRpc(verifications: Rows, laters: Rows) {
  const read = (rows: Rows) => (input: unknown) =>
    Object.fromEntries(keysOf(input).map((key) => [key, rows[key] ?? null]));
  return {
    // Before every fixture's attention, so finished threads can be items.
    inboxStart: () => ({ startedAt: 0 }),
    verifications: read(verifications),
    laters: read(laters),
    verify: vi.fn((input: unknown) => {
      const { threadId, client } = input as MarkInput;
      verifications[threadId] = {
        threadId,
        verifiedAt: 1_000,
        client,
        diffBase: null,
        prChecksState: "passing",
      };
      return verifications[threadId];
    }),
    later: vi.fn((input: unknown) => {
      const { threadId, client } = input as MarkInput;
      laters[threadId] = { threadId, laterAt: 1_000, client };
      return laters[threadId];
    }),
  };
}

/** bb--git and bb--github-pr-status answers: env_done has a diff and a PR. */
const EVIDENCE_RPC = {
  status: (input: unknown) =>
    Object.fromEntries(
      keysOf(input).map((key) => [
        key,
        {
          outcome: "available",
          workspace: {
            allChanges: { fileCount: 3, insertions: 40, deletions: 12 },
          },
        },
      ]),
    ),
  pullRequests: (input: unknown) =>
    Object.fromEntries(
      keysOf(input).map((key) => [
        key,
        {
          outcome: "available",
          pullRequest: {
            number: 12,
            state: "open",
            checks: { state: "failing", totalCount: 7, failedCount: 2 },
          },
        },
      ]),
    ),
};

function renderList(
  preferences: Partial<PreferenceValues>,
  listProps = props(),
  options: RenderSlotOptions = {},
  signOffs = signOffRpc({}, {}),
) {
  const setPreference = vi.fn((input: unknown) => input);
  const slot = renderSlot(registration, listProps, {
    sidebarThreads: {
      projects: [makePluginProject({ id: "proj_app", name: "App" })],
      sections: [],
      threads: THREADS,
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), ...preferences },
      }),
      setPreference,
      ...EVIDENCE_RPC,
      ...signOffs,
    },
    sdk: {
      threads: {
        interactions: {
          list: async () => [
            {
              createdAt: 1,
              id: "int_1",
              providerId: "claude-code",
              providerRequestId: "req_1",
              providerThreadId: "pt_1",
              resolution: null,
              resolvedAt: null,
              status: "pending",
              statusReason: null,
              threadId: "thr_ask",
              turnId: "turn_1",
              payload: {
                kind: "user_question",
                questions: [
                  {
                    id: "q1",
                    prompt: "Charge on renewal or on signup?",
                    allowFreeText: true,
                    multiSelect: false,
                    required: true,
                  },
                ],
              },
            },
          ],
        },
      },
    },
    ...options,
  });
  return { slot, setPreference, signOffs };
}

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("Threads | Inbox tabs", () => {
  it("shows the Threads tab with the thread list, and the Inbox count", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ organizationMode: "chronological" });

    expect(await screen.findByRole("tab", { name: "Threads" })).toHaveProperty(
      "ariaSelected",
      "true",
    );
    await screen.findByText("Quiet thread");
    // New for you counts only the unopened ask; the opened failure is Seen.
    expect(screen.getByRole("tab", { name: /Inbox/ }).textContent).toBe(
      "Inbox1",
    );
  });

  it("shows the Inbox tab: bands, words, and the running count", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ activeTab: "inbox" });

    const fresh = await screen.findByRole("region", { name: "New for you" });
    expect(
      within(fresh).getByRole("button", {
        name: "Grill: billing edge cases: answer",
      }),
    ).toBeTruthy();
    const seen = screen.getByRole("region", { name: "Seen" });
    expect(
      within(seen).getByRole("button", {
        name: "Regenerate OpenAPI client: failed",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Quiet thread")).toBeNull();
    expect(document.querySelector("[data-sidebar-thread-id]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /1\s*running/ }));
    expect(
      within(screen.getByRole("list", { name: "Running threads" })).getByText(
        "Bump eslint",
      ),
    ).toBeTruthy();
  });

  it("opens a row's reason line, and Answer goes to the thread and closes the drawer", async () => {
    setPreferencesMirrorStorageForTest(null);
    const listProps = props();
    const { slot } = renderList({ activeTab: "inbox" }, listProps);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Grill: billing edge cases: answer",
      }),
    );
    await screen.findByText("Asks: Charge on renewal or on signup?");
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));

    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_ask" },
    ]);
    expect(listProps.onNavigate).toHaveBeenCalledOnce();
  });

  it("opens a running thread from the running count", async () => {
    setPreferencesMirrorStorageForTest(null);
    const listProps = props();
    const { slot } = renderList({ activeTab: "inbox" }, listProps);

    fireEvent.click(await screen.findByRole("button", { name: /1\s*running/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bump eslint" }));

    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_run" },
    ]);
    expect(listProps.onNavigate).toHaveBeenCalledOnce();
  });

  it("stores the chosen tab as a synced preference", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { setPreference } = renderList({});

    fireEvent.click(await screen.findByRole("tab", { name: /Inbox/ }));
    await screen.findByRole("region", { name: "New for you" });
    await flushPreferenceWritesForTest();

    await waitFor(() =>
      expect(setPreference).toHaveBeenCalledWith(
        expect.objectContaining({ key: "activeTab", value: "inbox" }),
      ),
    );
  });

  it("follows a tab change made in another client", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { slot } = renderList({});
    await screen.findByText("Quiet thread");

    await slot.behavior.emitRealtime(PREFERENCES_CHANGED_CHANNEL, {
      key: "activeTab",
      value: "inbox",
      origin: "another-client",
    });

    await screen.findByRole("region", { name: "New for you" });
    expect(screen.queryByText("Quiet thread")).toBeNull();
  });
});

describe("Inbox: Verify and Later", () => {
  const VERIFY_ROW = "Add retry to webhook sender: verify";

  it("opens a Verify row with its reason, diffstat, PR checks, and Verify / Open / Later", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ activeTab: "inbox" });

    const seen = await screen.findByRole("region", { name: "Seen" });
    fireEvent.click(await within(seen).findByRole("button", { name: VERIFY_ROW }));

    await screen.findByText("PR #12: 2 of 7 checks failing");
    expect(screen.getByText("3 files · +40 −12")).toBeTruthy();
    expect(screen.getByText("PR #12 · open · 2 of 7 checks failing")).toBeTruthy();
    for (const name of ["Verify", "Open", "Later"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("opening Verify does not mark it read or sign it off through the FYI shortcut", async () => {
    setPreferencesMirrorStorageForTest(null);
    const markRead = vi.fn(async () => undefined as never);
    const { signOffs } = renderList({ activeTab: "inbox" }, props(), {
      sdk: { threads: { markRead, interactions: { list: async () => [] } } },
    });
    fireEvent.click(await screen.findByRole("button", { name: VERIFY_ROW }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(markRead).not.toHaveBeenCalled();
    expect(signOffs.verify).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: VERIFY_ROW })).toBeTruthy();
  });

  it("keeps evidence off the resting row", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ activeTab: "inbox" });

    await screen.findByRole("button", { name: VERIFY_ROW });
    expect(screen.queryByText("3 files · +40 −12")).toBeNull();
    expect(document.querySelector("[data-inbox-evidence]")).toBeNull();
  });

  it("offers Verify only on Verify items", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ activeTab: "inbox" });

    for (const name of [
      "Grill: billing edge cases: answer",
      "Regenerate OpenAPI client: failed",
    ]) {
      fireEvent.click(await screen.findByRole("button", { name }));
      expect(screen.getByRole("button", { name: "Later" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Verify" })).toBeNull();
    }
  });

  it("stores a Verification for the thread, naming the client, and clears the row", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { signOffs } = renderList({ activeTab: "inbox" });

    fireEvent.click(await screen.findByRole("button", { name: VERIFY_ROW }));
    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: VERIFY_ROW })).toBeNull(),
    );
    expect(signOffs.verify).toHaveBeenCalledWith({
      threadId: "thr_done",
      client: expect.stringMatching(/ · /),
    });
    expect(signOffs.later).not.toHaveBeenCalled();
  });

  it("puts an item in Later without verifying it", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { signOffs } = renderList({ activeTab: "inbox" });

    fireEvent.click(await screen.findByRole("button", { name: VERIFY_ROW }));
    fireEvent.click(await screen.findByRole("button", { name: "Later" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: VERIFY_ROW })).toBeNull(),
    );
    expect(signOffs.later).toHaveBeenCalledWith({
      threadId: "thr_done",
      client: expect.any(String),
    });
    expect(signOffs.verify).not.toHaveBeenCalled();
  });

  it("clears the row when another client verifies it", async () => {
    setPreferencesMirrorStorageForTest(null);
    const verifications: Rows = {};
    const { slot } = renderList(
      { activeTab: "inbox" },
      props(),
      {},
      signOffRpc(verifications, {}),
    );
    await screen.findByRole("button", { name: VERIFY_ROW });

    verifications.thr_done = {
      threadId: "thr_done",
      verifiedAt: 1_000,
      client: "iPhone · browser",
      diffBase: null,
      prChecksState: null,
    };
    await slot.behavior.experimental_invalidateRpc([signOffTag("thr_done")]);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: VERIFY_ROW })).toBeNull(),
    );
  });
});

describe("Inbox: coming back", () => {
  const VERIFY_ROW = "Add retry to webhook sender: verify";
  /** thr_done was verified at 10, covering a.ts and b.ts; it finished again at 15. */
  const verified = () =>
    signOffRpc(
      {
        thr_done: {
          threadId: "thr_done",
          verifiedAt: 10,
          client: "Laptop · desktop",
          diffBase: {
            headSha: "aaaa111",
            mergeBaseRef: "base999",
            files: [
              { path: "src/a.ts", revision: "100644:1111:100644:a0a0", content: "a\n", headMode: "100644" },
              { path: "src/b.ts", revision: "100644:2222:100644:b0b0" },
            ],
          },
          prChecksState: "failing",
        },
      },
      {},
    );
  async function files<T>(args: {
    pluginId: string;
    method: string;
    input?: unknown;
    outputSchema: { parse(value: unknown): T };
  }): Promise<T> {
    if (args.method === "fileSide") {
      return args.outputSchema.parse({ outcome: "available", file: { content: "a\n", contentEncoding: "utf8" } });
    }
    expect(args).toMatchObject({
      pluginId: "bb--git",
      method: "files",
      input: {
        environmentId: "env_done",
        target: { type: "all", mergeBaseBranch: "aaaa111" },
      },
    });
    return args.outputSchema.parse({
      outcome: "available",
      mergeBaseRef: "aaaa111",
      truncated: false,
      files: [
        // Unchanged since the Verification: left out.
        { path: "src/b.ts", revision: "100644:9999:100644:b0b0", additions: 9, deletions: 9 },
        { path: "src/c.ts", revision: "000000:0000:100644:c1c1", additions: 5, deletions: 2 },
      ],
    });
  }

  it("opens with the diffstat of only what's new, and what was already verified a tap away", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList(
      { activeTab: "inbox" },
      props(),
      {
        sdk: {
          threads: { interactions: { list: async () => [] } },
          plugins: { callRpc: files },
        },
      },
      verified(),
    );

    fireEvent.click(await screen.findByRole("button", { name: VERIFY_ROW }));
    await screen.findByText("New changes; PR #12: 2 of 7 checks failing");
    expect(screen.getByText("1 file · +5 −2")).toBeTruthy();
    expect(screen.queryByText("3 files · +40 −12")).toBeNull();

    // Already verified: there, but folded away.
    expect(screen.queryByRole("list", { name: "Already verified" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Already verified · 2 files/ }),
    );
    const list = screen.getByRole("list", { name: "Already verified" });
    expect(within(list).getByText("src/a.ts")).toBeTruthy();
    expect(within(list).getByText("src/b.ts")).toBeTruthy();
    const priorFile = within(list).getByText("src/a.ts");
    expect(priorFile.closest("details")?.open).toBe(false);
    fireEvent.click(priorFile);
    expect(priorFile.closest("details")?.open).toBe(true);
    expect(within(list).getByText("a")).toBeTruthy();
    expect(screen.getByText("Verified on Laptop · desktop")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy();
  });
});

describe("Inbox: the verifying client sees the thread come back", () => {
  it("reads the thread's sign-offs again once the server has the Verification", async () => {
    setPreferencesMirrorStorageForTest(null);
    const signOffs = signOffRpc({}, {});
    const reads = vi.fn(signOffs.verifications);
    renderList({ activeTab: "inbox" }, props(), {}, {
      ...signOffs,
      verifications: reads,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Add retry to webhook sender: verify" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));
    await waitFor(() => expect(signOffs.verify).toHaveBeenCalledOnce());

    // Otherwise the prediction, which covers all future work, can outlive the
    // write and the thread never comes back here.
    await waitFor(() =>
      expect(reads).toHaveBeenLastCalledWith({ keys: ["thr_done"] }),
    );
    const after = reads.mock.invocationCallOrder.at(-1)!;
    expect(after).toBeGreaterThan(signOffs.verify.mock.invocationCallOrder[0]!);
  });
});
