// @vitest-environment jsdom

// Issue #25: on the client that tapped Verify or Later, the thread must come
// back when it finishes new work, without a reload. Live, the server's
// refresh of the thread's sign-off reads starts before the write is
// acknowledged, and is still reading when the acknowledgement lands. The
// return must not depend on any read landing at all.
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import {
  loadPluginApp,
  renderSlot,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import { defaultPreferences } from "../../shared/preferences.js";
import { signOffTag } from "../../shared/inbox-verification.js";
import { turnEndTag } from "../../shared/inbox-turn-end.js";

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

const THREAD_ID = "thr_done";
const ROW = "Add retry to webhook sender: verify";
const FINISHED = makeSidebarThread({
  id: THREAD_ID,
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
});

// Child turn ends, as the server's turn/completed events date them.
let completions: Record<string, number> = {};

// The live sidebar, which the test changes when the thread works again.
// renderSlot fixes its threads at render, so the test app's hook is wrapped.
let threads: PluginSidebarThread[] = [FINISHED];
const listeners = new Set<() => void>();
type TestSdkApp = Record<string, unknown> & {
  experimental_useSidebarThreads(): { threads: PluginSidebarThread[] };
};
const testSdkApp = (
  globalThis as unknown as { __bbPluginRuntime: { pluginSdkApp: TestSdkApp } }
).__bbPluginRuntime.pluginSdkApp;
const useTestSidebarThreads = testSdkApp.experimental_useSidebarThreads;

function useLiveSidebarThreads() {
  const state = useTestSidebarThreads();
  const live = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => threads,
  );
  return { ...state, threads: live };
}

beforeEach(() => {
  threads = [FINISHED];
  completions = {};
  verdicts = { [THREAD_ID]: report(15) };
  testSdkApp.experimental_useSidebarThreads = useLiveSidebarThreads;
});

afterEach(() => {
  cleanup();
  testSdkApp.experimental_useSidebarThreads = useTestSidebarThreads;
  listeners.clear();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

const keysOf = (input: unknown) => (input as { keys: string[] }).keys;
type Rows = Record<string, unknown>;

/** The classifier's verdict on each thread's latest turn end: a report. */
let verdicts: Rows = {};
const report = (turnKey: number, completedAt: number | null = null) => ({
  verdict: "report",
  source: "heuristic",
  fallback: null,
  grilling: false,
  turnKey,
  completedAt,
  classifiedAt: completedAt ?? turnKey,
});

/** What the server's Verification covered: src/a.ts as it was then. */
const DIFF_BASE = {
  headSha: "aaaa111",
  mergeBaseRef: "base999",
  files: [
    { path: "src/a.ts", revision: "100644:1111:100644:a0a0", content: "a\n", headMode: "100644" },
  ],
};

/** bb--git since the Verification's head: a.ts as verified, c.ts new. */
async function gitFiles<T>(args: {
  method: string;
  outputSchema: { parse(value: unknown): T };
}): Promise<T> {
  if (args.method === "fileSide") {
    return args.outputSchema.parse({
      outcome: "available",
      file: { content: "a\n", contentEncoding: "utf8" },
    });
  }
  return args.outputSchema.parse({
    outcome: "available",
    mergeBaseRef: "aaaa111",
    truncated: false,
    files: [{ path: "src/c.ts", revision: "000000:0000:100644:c1c1", additions: 5, deletions: 2 }],
  });
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

/**
 * The plugin's server. A write stores its row and then waits to be
 * acknowledged; sign-off reads wait while `holdReads` holds them.
 */
function server() {
  const verifications: Rows = {};
  const laters: Rows = {};
  let acknowledgement = gate();
  let readsHeld: Promise<void> | null = null;
  let readsFail = false;
  const readKeys: string[][] = [];
  const read = (rows: Rows) => async (input: unknown) => {
    readKeys.push(keysOf(input));
    if (readsFail) throw new Error("server unreachable");
    const answer = Object.fromEntries(
      keysOf(input).map((key) => [key, rows[key] ?? null]),
    );
    await readsHeld;
    return answer;
  };
  let refuse = false;
  const written = async <T,>(row: T): Promise<T> => {
    await acknowledgement.opened;
    acknowledgement = gate();
    if (refuse) throw new Error("storage unavailable");
    return row;
  };
  return {
    readKeys,
    acknowledge: () => acknowledgement.open(),
    /** Sign-off reads fail from now on: the server's row never arrives. */
    failReads() {
      readsFail = true;
    },
    /** The next writes fail instead of being stored. */
    refuseWrites() {
      refuse = true;
      verifications[THREAD_ID] = null;
      laters[THREAD_ID] = null;
    },
    holdReads() {
      const held = gate();
      readsHeld = held.opened;
      return () => {
        readsHeld = null;
        held.open();
      };
    },
    rpc: {
      inboxStart: () => ({ startedAt: 0 }),
      verifications: read(verifications),
      laters: read(laters),
      turnEnds: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, verdicts[key] ?? null])),
      verify: vi.fn((input: unknown) => {
        const { threadId, client } = input as { threadId: string; client: string };
        if (refuse) return written(null);
        verifications[threadId] = {
          threadId,
          verifiedAt: 1_000,
          client,
          diffBase: DIFF_BASE,
          prChecksState: "passing",
        };
        return written(verifications[threadId]);
      }),
      later: vi.fn((input: unknown) => {
        const { threadId, client } = input as { threadId: string; client: string };
        if (refuse) return written(null);
        laters[threadId] = { threadId, laterAt: 1_000, client };
        return written(laters[threadId]);
      }),
    },
  };
}

function renderInbox() {
  setPreferencesMirrorStorageForTest(null);
  const props: PluginThreadListProps = {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
  const backend = server();
  const slot = renderSlot(registration, props, {
    sidebarThreads: {
      projects: [makePluginProject({ id: "proj_app", name: "App" })],
      sections: [],
      threads,
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), activeTab: "inbox" },
      }),
      setPreference: (input: unknown) => input,
      status: (input: unknown) =>
        Object.fromEntries(
          keysOf(input).map((key) => [
            key,
            {
              outcome: "available",
              workspace: { allChanges: { fileCount: 1, insertions: 3, deletions: 0 } },
            },
          ]),
        ),
      pullRequests: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "absent" }])),
      ...backend.rpc,
    },
    sdk: {
      threads: {
        interactions: { list: async () => [] },
        output: async ({ threadId }: { threadId: string }) => ({ output: `Report from ${threadId}` }),
        events: {
          list: async ({ threadId }: { threadId: string }) =>
            (completions[threadId] === undefined
              ? []
              : [{ type: "turn/completed", createdAt: completions[threadId] }]) as never,
        },
      },
      plugins: { callRpc: gitFiles },
    },
  });
  return { backend, slot };
}

/**
 * Tap the row and the action. The server stores the sign-off, starts
 * refreshing the thread's reads, and acknowledges the write while that
 * refresh is still reading, as it did live.
 */
async function signOff(
  { backend, slot }: ReturnType<typeof renderInbox>,
  action: "Verify" | "Later",
) {
  fireEvent.click(await screen.findByRole("button", { name: ROW }));
  fireEvent.click(await screen.findByRole("button", { name: action }));
  await waitFor(() => expect(screen.queryByRole("button", { name: ROW })).toBeNull());
  const method = action === "Verify" ? backend.rpc.verify : backend.rpc.later;
  await waitFor(() => expect(method).toHaveBeenCalledOnce());

  const releaseReads = backend.holdReads();
  const readsBefore = backend.readKeys.length;
  const refreshed = slot.behavior.experimental_invalidateRpc([signOffTag(THREAD_ID)]);
  await vi.waitFor(() => expect(backend.readKeys.length).toBeGreaterThan(readsBefore));
  backend.acknowledge();
  await new Promise((resolve) => setTimeout(resolve, 20));
  releaseReads();
  await refreshed;
}

/**
 * The thread finished more work after the sign-off, and the classifier read
 * it as a report. (It skips the running state, whose stop grace would only
 * slow the test.)
 */
async function finishAgain(slot: RenderedSlot) {
  await act(async () => {
    threads = [{ ...FINISHED, latestAttentionAt: 2_000, lastReadAt: 2_000 }];
    for (const listener of listeners) listener();
  });
  verdicts = { [THREAD_ID]: report(2_000) };
  await slot.behavior.experimental_invalidateRpc([turnEndTag(THREAD_ID)]);
}

describe("Inbox: a signed-off thread comes back on the client that signed it off (#25)", () => {
  it("comes back after Verify when its new work finishes, scoped by the server's Verification", async () => {
    const inbox = renderInbox();
    await signOff(inbox, "Verify");

    await finishAgain(inbox.slot);

    // Scoping needs the server's diff base, which the prediction lacks.
    fireEvent.click(await screen.findByRole("button", { name: ROW }, { timeout: 3_000 }));
    expect(await screen.findByText("1 file · +5 −2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Already verified · 1 file/ })).toBeTruthy();
  });

  it("comes back after Later when its new work finishes, without a reload", async () => {
    const inbox = renderInbox();
    await signOff(inbox, "Later");

    await finishAgain(inbox.slot);

    expect(await screen.findByRole("button", { name: ROW }, { timeout: 3_000 })).toBeTruthy();
  });

  it.each(["Verify", "Later"] as const)(
    "still puts the row back when %s fails to store",
    async (action) => {
      const { backend } = renderInbox();
      backend.refuseWrites();

      fireEvent.click(await screen.findByRole("button", { name: ROW }));
      fireEvent.click(await screen.findByRole("button", { name: action }));
      await waitFor(() => expect(screen.queryByRole("button", { name: ROW })).toBeNull());
      backend.acknowledge();

      expect(await screen.findByRole("button", { name: ROW })).toBeTruthy();
    },
  );

  it.each(["Verify", "Later"] as const)(
    "comes back after %s even if the server's row never reaches this client",
    async (action) => {
      const { backend, slot } = renderInbox();
      fireEvent.click(await screen.findByRole("button", { name: ROW }));
      fireEvent.click(await screen.findByRole("button", { name: action }));
      await waitFor(() => expect(screen.queryByRole("button", { name: ROW })).toBeNull());
      const method = action === "Verify" ? backend.rpc.verify : backend.rpc.later;
      await waitFor(() => expect(method).toHaveBeenCalledOnce());
      // Offline from here: every read that could replace the prediction fails.
      backend.failReads();
      backend.acknowledge();
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      expect(screen.queryByRole("button", { name: ROW })).toBeNull();

      await finishAgain(slot);

      expect(await screen.findByRole("button", { name: ROW })).toBeTruthy();
    },
  );

});

describe("Inbox: Later on a parent's FYI dated by a folded child's report (#25)", () => {
  const PARENT_ROW = "Build billing: fyi";
  // The parent read its own report at 15; a research child reported at 500.
  // A child's success doesn't move its parent's attention, so the item is
  // dated by the child's turn end, later than the parent's own attention.
  const PARENT = makeSidebarThread({
    id: "thr_parent",
    projectId: "proj_app",
    title: "Build billing",
    latestAttentionAt: 15,
    lastReadAt: 15,
  });
  const CHILD = makeSidebarThread({
    id: "thr_child",
    projectId: "proj_app",
    title: "Research tax rules",
    parentThreadId: "thr_parent",
    latestAttentionAt: 10,
    lastReadAt: 0,
    updatedAt: 500,
  });

  it("clears at once, stays cleared, and comes back on the child's next report", async () => {
    threads = [PARENT, CHILD];
    completions = { thr_child: 500 };
    verdicts = { thr_parent: report(15), thr_child: report(10, 500) };
    const { backend, slot } = renderInbox();

    fireEvent.click(await screen.findByRole("button", { name: PARENT_ROW }));
    fireEvent.click(await screen.findByRole("button", { name: "Later" }));
    // Before the server has the write: the prediction alone clears it.
    await waitFor(() => expect(backend.rpc.later).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: PARENT_ROW })).toBeNull();

    backend.acknowledge();
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(screen.queryByRole("button", { name: PARENT_ROW })).toBeNull();

    // The child reports again, after the Later.
    completions = { thr_child: 2_000 };
    verdicts = { thr_parent: report(15), thr_child: report(10, 2_000) };
    await act(async () => {
      threads = [PARENT, { ...CHILD, updatedAt: 2_000 }];
      for (const listener of listeners) listener();
    });
    await slot.behavior.experimental_invalidateRpc([turnEndTag("thr_child")]);

    expect(await screen.findByRole("button", { name: PARENT_ROW })).toBeTruthy();
  });
});
