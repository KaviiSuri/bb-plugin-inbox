// @vitest-environment jsdom
// #24: a question form, plan or permission that arrives mid-turn, after the
// human last read the thread, is New for you even though bb doesn't move the
// thread's latest attention for it. Driven through the real sidebar route.

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import { defaultPreferences } from "../../shared/preferences.js";

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

// Every thread here last had attention at 40 (its turn started or ended) and
// was read at 50; the ask arrives at 60 unless a test says otherwise.
const ATTENTION = 40;
const READ = 50;
const ASKED = 60;

const topLevel = (id: string, title: string, overrides = {}) =>
  makeSidebarThread({
    id,
    projectId: "proj_app",
    title,
    status: "active",
    hasPendingInteraction: true,
    latestAttentionAt: ATTENTION,
    lastReadAt: READ,
    ...overrides,
  });
const PARENT = makeSidebarThread({
  id: "thr_parent",
  projectId: "proj_app",
  title: "Build billing",
  status: "active",
  latestAttentionAt: ATTENTION,
  lastReadAt: READ,
});
const child = (id: string, title: string, overrides = {}) =>
  topLevel(id, title, { parentThreadId: "thr_parent", ...overrides });

const QUESTION = {
  kind: "user_question",
  questions: [
    { id: "q1", prompt: "Monthly or yearly?", allowFreeText: true, multiSelect: false, required: true },
  ],
};
const PLAN = {
  kind: "approval",
  availableDecisions: ["allow_once", "deny"],
  reason: null,
  subject: { kind: "plan", itemId: "i1", plan: "1. Do it" },
};
const PERMISSION = {
  kind: "approval",
  availableDecisions: ["allow_once", "deny"],
  reason: null,
  subject: { itemId: "i1", kind: "command", command: "npm run migrate", cwd: null, sessionGrant: null },
};

const interaction = (threadId: string, payload: object, createdAt: number) => ({
  createdAt,
  id: `int_${threadId}`,
  providerId: "claude-code",
  providerRequestId: "req_1",
  providerThreadId: "pt_1",
  resolution: null,
  resolvedAt: null,
  status: "pending",
  statusReason: null,
  threadId,
  turnId: "turn_1",
  payload,
});

type Asks = Record<string, { payload: object; createdAt?: number }>;

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

function renderInbox(
  threads: PluginSidebarThread[],
  list: (threadId: string) => Promise<unknown[]>,
) {
  const keysOf = (input: unknown) => (input as { keys: string[] }).keys;
  const none = (input: unknown) =>
    Object.fromEntries(keysOf(input).map((key) => [key, null]));
  return renderSlot(registration, props(), {
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
      inboxStart: () => ({ startedAt: 0 }),
      verifications: none,
      laters: none,
      turnEnds: none,
      status: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "not_applicable" }])),
      pullRequests: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "absent" }])),
    },
    sdk: {
      threads: {
        output: async () => ({ output: "Report" }),
        markRead: async () => undefined as never,
        // Children's turns ended with their attention.
        events: {
          list: async ({ threadId }: { threadId: string }) =>
            [{ type: "turn/completed", createdAt: threads.find((t) => t.id === threadId)!.latestAttentionAt }] as never,
        },
        interactions: {
          list: ({ threadId }: { threadId: string }) => list(threadId) as never,
        },
      },
    },
  });
}

function renderAsks(threads: PluginSidebarThread[], asks: Asks) {
  return renderInbox(threads, async (threadId) => {
    const ask = asks[threadId];
    return ask ? [interaction(threadId, ask.payload, ask.createdAt ?? ASKED)] : [];
  });
}

const band = (name: "New for you" | "Seen") =>
  screen.queryByRole("region", { name }) ?? document.querySelector(`[aria-label="${name}"]`);

async function expectIn(name: "New for you" | "Seen", row: string) {
  await waitFor(() => {
    const section = band(name);
    expect(section).toBeTruthy();
    within(section as HTMLElement).getByRole("button", { name: row });
  });
}

function tabCount(): string | null {
  return document.querySelector('[aria-label$=" new"]')?.getAttribute("aria-label") ?? null;
}

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("Inbox: asks that arrive mid-turn (#24)", () => {
  it("read before the ask → New: a top-level question form is New for you and counted", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([topLevel("thr_q", "QA: question form")], {
      thr_q: { payload: QUESTION },
    });
    await expectIn("New for you", "QA: question form: answer");
    expect(tabCount()).toBe("1 new");
  });

  it("opened after the ask → Seen: a top-level question form read since it asked is Seen", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([topLevel("thr_q", "QA: question form", { lastReadAt: 70 })], {
      thr_q: { payload: QUESTION },
    });
    await expectIn("Seen", "QA: question form: answer");
    expect(tabCount()).toBeNull();
  });

  it("read before the ask → New: a top-level plan review is New for you", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([topLevel("thr_p", "QA: plan review")], {
      thr_p: { payload: PLAN },
    });
    await expectIn("New for you", "QA: plan review: approve");
  });

  it("read before the ask → New: a top-level permission is New for you", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([topLevel("thr_perm", "QA: permission")], {
      thr_perm: { payload: PERMISSION },
    });
    await expectIn("New for you", "QA: permission: approve");
  });

  it("read before the ask → New: a child's question form is its own New item", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([PARENT, child("thr_cq", "QA: child question form")], {
      thr_cq: { payload: QUESTION },
    });
    await expectIn("New for you", "QA: child question form: answer");
  });

  it("opened after the ask → Seen: a child's question form read since it asked is Seen", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([PARENT, child("thr_cq", "QA: child question form", { lastReadAt: 70 })], {
      thr_cq: { payload: QUESTION },
    });
    await expectIn("Seen", "QA: child question form: answer");
  });

  it("read before the ask → New: a child's plan is its own New item", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([PARENT, child("thr_cp", "QA: child plan")], {
      thr_cp: { payload: PLAN },
    });
    await expectIn("New for you", "QA: child plan: approve");
  });

  it("read before the ask → New: a child's permission surfaces on its stopped parent as a New approve", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks([{ ...PARENT, status: "idle" }, child("thr_cperm", "QA: child permission")], {
      thr_cperm: { payload: PERMISSION },
    });
    await expectIn("New for you", "Build billing: approve");
  });

  it("opened after the ask → Seen: a child's permission on a parent read since it asked is Seen", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderAsks(
      [{ ...PARENT, status: "idle", lastReadAt: 70 }, child("thr_cperm", "QA: child permission")],
      { thr_cperm: { payload: PERMISSION } },
    );
    await expectIn("Seen", "Build billing: approve");
  });

  it("holds a read thread's ask back while its arrival time loads, rather than flash it in Seen", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox([topLevel("thr_q", "QA: question form")], () => new Promise(() => {}));
    await screen.findByRole("region", { name: "Running threads" }).catch(() => undefined);
    // Give the inbox every chance to render the row.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: /QA: question form/ })).toBeNull();
  });

  it("still shows the ask, on its generic reason, when the interaction read fails", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox([topLevel("thr_q", "QA: question form")], () =>
      Promise.reject(new Error("offline")),
    );
    await expectIn("Seen", "QA: question form: answer");
  });

  it("still surfaces a waiting child on its stopped parent when the child's read fails", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox(
      [{ ...PARENT, status: "idle" }, child("thr_cperm", "QA: child permission", { latestAttentionAt: 60 })],
      () => Promise.reject(new Error("offline")),
    );
    await expectIn("New for you", "Build billing: approve");
  });

  it("still shows the ask when the read finds nothing pending", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox([topLevel("thr_q", "QA: question form")], async () => []);
    await expectIn("Seen", "QA: question form: answer");
  });
});
