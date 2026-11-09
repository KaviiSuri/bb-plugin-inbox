import { describe, expect, it } from "vitest";
import type { Verification } from "../../../shared/inbox-verification.js";
import { deriveInbox, type InboxView } from "./index.js";
import type { PendingInteractionSummary } from "./blocked.js";
import {
  DIFF,
  environment,
  makeSidebarThread,
  NOW,
  QUESTION,
  snapshot,
} from "./test-snapshot.js";

const PLAN: PendingInteractionSummary = {
  kind: "approval",
  reason: "Has a plan for you to review",
  subject: "plan",
};
const PERMISSION: PendingInteractionSummary = {
  kind: "approval",
  reason: "Wants to run rm -rf dist",
  subject: "command",
};

type Overrides = Parameters<typeof makeSidebarThread>[0];

/** A top-level thread: idle, opened at 50. */
const parent = (overrides: Overrides = {}) =>
  makeSidebarThread({
    id: "thr_parent",
    title: "Build billing",
    latestAttentionAt: 50,
    lastReadAt: 50,
    ...overrides,
  });
const runningParent = (overrides: Overrides = {}) =>
  parent({ status: "active", ...overrides });

/** A child of `parentId` that finished at 100, never opened. */
const child = (id: string, overrides: Overrides = {}) =>
  makeSidebarThread({
    id,
    title: `Child ${id}`,
    parentThreadId: "thr_parent",
    latestAttentionAt: 100,
    lastReadAt: 0,
    ...overrides,
  });

const rows = (view: InboxView) => [...view.newForYou, ...view.seen];
const rowIds = (view: InboxView) => rows(view).map((item) => item.threadId);

describe("deriveInbox: Audience, a child that asks the human (ADRs 0002, 0008)", () => {
  it("gives a child with a question form its own item naming its parent, even while the parent runs", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          runningParent(),
          child("thr_q", { hasPendingInteraction: true, status: "active" }),
        ],
        interactions: { thr_q: QUESTION },
      }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_q",
        tier: "blocked",
        word: "answer",
        reason: "Asks: which database?",
        parentThreadId: "thr_parent",
        audienceReason: "Its own item: it asks you through a question form",
      }),
    ]);
    expect(view.running.map((entry) => entry.threadId)).toContain("thr_parent");
  });

  it("gives a child with a plan to review its own item naming its parent, even while the parent runs", () => {
    const view = deriveInbox(
      snapshot({
        threads: [runningParent(), child("thr_p", { hasPendingInteraction: true })],
        interactions: { thr_p: PLAN },
      }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_p",
        tier: "blocked",
        word: "approve",
        parentThreadId: "thr_parent",
        audienceReason: "Its own item: it has a plan for you to review",
      }),
    ]);
  });

  it("gives a child waiting on a plugin's form its own item", () => {
    const view = deriveInbox(
      snapshot({
        threads: [runningParent(), child("thr_f", { hasPendingInteraction: true })],
        interactions: { thr_f: { kind: "plugin", reason: "Enter the API token" } },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_f",
        parentThreadId: "thr_parent",
        audienceReason: "Its own item: it waits on a form only you can fill",
      },
    ]);
  });

  it("never names a parent on a top-level thread's item", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent({ hasPendingInteraction: true })],
        interactions: { thr_parent: QUESTION },
      }),
    );
    expect(view.seen[0]).not.toHaveProperty("parentThreadId");
    expect(view.seen[0]).not.toHaveProperty("audienceReason");
  });

  it("treats a child whose parent is archived or hidden as top-level, so its news isn't lost", () => {
    for (const gone of [{ isArchived: true, archivedAt: 5 }, { isHidden: true }]) {
      const view = deriveInbox(
        snapshot({ threads: [parent(gone), child("thr_r")] }),
      );
      expect(view.newForYou).toMatchObject([
        { threadId: "thr_r", tier: "fyi", word: "fyi" },
      ]);
    }
  });

  it("holds a waiting child back, with no item anywhere, until its interaction has loaded", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent(), child("thr_x", { hasPendingInteraction: true })],
      }),
    );
    expect(rows(view)).toEqual([]);
  });
});

describe("deriveInbox: Audience, a child that answers to its parent folds in", () => {
  it("folds a finished research child into its stopped parent's FYI item", () => {
    const view = deriveInbox(
      snapshot({ threads: [parent(), child("thr_r1"), child("thr_r2", { latestAttentionAt: 120 })] }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_parent",
        tier: "fyi",
        word: "fyi",
        reason: "2 helpers reported",
        attentionAt: 120,
        folded: [
          expect.objectContaining({ threadId: "thr_r2", state: "reported" }),
          expect.objectContaining({ threadId: "thr_r1", state: "reported" }),
        ],
      }),
    ]);
    expect(view.seen).toEqual([]);
    expect(view.tabCount).toBe(1);
  });

  it("shows a folded child's report on the parent's own Verify item, keeping its evidence", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent({ environment: environment("env_p"), latestAttentionAt: 150, lastReadAt: 0 }),
          child("thr_r"),
        ],
        evidence: { env_p: DIFF },
      }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_parent",
        tier: "verify",
        evidence: DIFF,
        folded: [
          expect.objectContaining({
            threadId: "thr_r",
            title: "Child thr_r",
            state: "reported",
          }),
        ],
      }),
    ]);
  });

  it.each([
    ["Verify (a diff of its own)", { environment: environment("env_c") }],
    ["FYI (a report)", {}],
    ["Broken (an error)", { status: "error" }],
    ["Broken (a failed queued send)", { queuedWork: "failed" }],
  ] as const)("never shows a folded child as its own row under %s, in either band", (_, overrides) => {
    for (const lastReadAt of [0, 200]) {
      const view = deriveInbox(
        snapshot({
          threads: [parent(), child("thr_c", { lastReadAt, ...overrides })],
          evidence: { env_c: DIFF },
        }),
      );
      expect(rowIds(view)).not.toContain("thr_c");
    }
  });

  it("gives children of a still-running parent nothing but the running count", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          runningParent(),
          child("thr_done"),
          child("thr_failed", { status: "error" }),
          child("thr_perm", { hasPendingInteraction: true }),
          child("thr_busy", { status: "active" }),
        ],
        interactions: { thr_perm: PERMISSION },
      }),
    );
    expect(rows(view)).toEqual([]);
    expect(view.running.map((entry) => entry.threadId).sort()).toEqual([
      "thr_busy",
      "thr_parent",
    ]);
  });

  it("holds the parent's new item back while its own evidence loads, so it doesn't flash up as FYI first", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent({ environment: environment("env_p"), latestAttentionAt: 150, lastReadAt: 0 }),
          child("thr_r"),
        ],
      }),
    );
    expect(rows(view)).toEqual([]);
  });

  it("moves the parent's item to New for you when a child reports after the parent was opened", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent({ environment: environment("env_p"), latestAttentionAt: 50, lastReadAt: 60 }),
          child("thr_r", { latestAttentionAt: 100 }),
        ],
        evidence: { env_p: DIFF },
      }),
    );
    expect(view.newForYou).toMatchObject([
      { threadId: "thr_parent", tier: "verify", news: true },
    ]);
  });

  it("clears folded reports once the parent, or the child itself, was opened after them", () => {
    for (const threads of [
      [parent({ lastReadAt: 100 }), child("thr_r")],
      [parent(), child("thr_r", { lastReadAt: 100 })],
    ]) {
      expect(rows(deriveInbox(snapshot({ threads })))).toEqual([]);
    }
  });

  it("clears folded reports covered by the parent's Verification", () => {
    const verification: Verification = {
      threadId: "thr_parent",
      verifiedAt: 110,
      client: "test",
      diffBase: null,
      prChecksState: null,
    };
    const view = deriveInbox(
      snapshot({
        threads: [parent(), child("thr_r")],
        verifications: { thr_parent: verification },
      }),
    );
    expect(rows(view)).toEqual([]);
  });

  it("leaves out folded reports from before the Inbox started (ADR 0010)", () => {
    const view = deriveInbox(
      snapshot({ threads: [parent(), child("thr_r")], inboxStartedAt: 100 }),
    );
    expect(rows(view)).toEqual([]);
  });

  it("brings the parent back from Later when a child reports after it", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent(), child("thr_r", { latestAttentionAt: 100 })],
        laters: { thr_parent: { threadId: "thr_parent", laterAt: 90, client: "test" } },
      }),
    );
    expect(view.newForYou).toMatchObject([{ threadId: "thr_parent", tier: "fyi" }]);
  });

  it("brings the parent's own item back from Later when a child reports after it", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent({ environment: environment("env_p"), latestAttentionAt: 80, lastReadAt: 0 }),
          child("thr_r", { latestAttentionAt: 100 }),
        ],
        evidence: { env_p: DIFF },
        laters: { thr_parent: { threadId: "thr_parent", laterAt: 90, client: "test" } },
      }),
    );
    expect(view.newForYou).toMatchObject([
      { threadId: "thr_parent", tier: "verify", attentionAt: 100 },
    ]);
  });

  it("keeps a child that just stopped in the running count for its grace, off the parent's item", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent(), child("thr_r")],
        runtime: {
          running: {},
          stoppedAt: { thr_r: NOW - 500 },
          waitingForHostSince: {},
        },
      }),
    );
    expect(rows(view)).toEqual([]);
    expect(view.running).toMatchObject([{ threadId: "thr_r", settling: true }]);
  });

  it("keeps a running child in the running count, not on the parent's item", () => {
    const view = deriveInbox(
      snapshot({ threads: [parent(), child("thr_busy", { status: "active" })] }),
    );
    expect(rows(view)).toEqual([]);
    expect(view.running).toMatchObject([{ threadId: "thr_busy" }]);
  });
});

describe("deriveInbox: a folded child that failed escalates on its parent's item", () => {
  it("makes a stopped parent's item Broken, naming the failure, and lists the child", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent(), child("thr_r"), child("thr_e", { status: "error" })],
      }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_parent",
        tier: "broken",
        word: "failed",
        reason: "A helper failed: Stopped with an error",
        folded: expect.arrayContaining([
          expect.objectContaining({ threadId: "thr_e", state: "failed" }),
          expect.objectContaining({ threadId: "thr_r", state: "reported" }),
        ]),
      }),
    ]);
  });

  it("raises the parent's own Verify item to Broken", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent({ environment: environment("env_p"), latestAttentionAt: 150, lastReadAt: 0 }),
          child("thr_e", { status: "error" }),
        ],
        evidence: { env_p: DIFF },
      }),
    );
    expect(view.newForYou).toMatchObject([
      { threadId: "thr_parent", tier: "broken", word: "failed", evidence: null },
    ]);
  });

  it("counts several failures", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent(),
          child("thr_e1", { status: "error" }),
          child("thr_e2", { indicator: "unread-error" }),
        ],
      }),
    );
    expect(view.newForYou).toMatchObject([{ reason: "2 helpers failed" }]);
  });

  it("escalates a failure even from before the Inbox started, as Broken does", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent({ lastReadAt: 0 }), child("thr_e", { status: "error" })],
        inboxStartedAt: 500,
      }),
    );
    expect(view.newForYou).toMatchObject([{ threadId: "thr_parent", tier: "broken" }]);
  });

  it("lets go of the failure once the parent was opened after it", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent({ lastReadAt: 120 }), child("thr_e", { status: "error" })],
      }),
    );
    expect(rows(view)).toEqual([]);
  });
});

describe("deriveInbox: a child's permission prompt stays with the parent agent (ADR 0008)", () => {
  const waitingChild = () =>
    child("thr_perm", { hasPendingInteraction: true, title: "Run migrations" });

  it("keeps a child's permission prompt off the inbox while the parent runs", () => {
    const view = deriveInbox(
      snapshot({
        threads: [runningParent(), waitingChild()],
        interactions: { thr_perm: PERMISSION },
      }),
    );
    expect(rows(view)).toEqual([]);
  });

  it("keeps it off the parent's own item while the parent runs", () => {
    const view = deriveInbox(
      snapshot({
        threads: [runningParent({ hasPendingInteraction: true }), waitingChild()],
        interactions: { thr_parent: QUESTION, thr_perm: PERMISSION },
      }),
    );
    expect(rows(view)).toHaveLength(1);
    expect(rows(view)[0]).toMatchObject({ threadId: "thr_parent", word: "answer" });
    expect(rows(view)[0]).not.toHaveProperty("childPermission");
    expect(rows(view)[0]).not.toHaveProperty("folded");
  });

  it("keeps it off the inbox during the parent's stop grace", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent(), waitingChild()],
        interactions: { thr_perm: PERMISSION },
        runtime: {
          running: {},
          stoppedAt: { thr_parent: NOW - 500 },
          waitingForHostSince: {},
        },
      }),
    );
    expect(rows(view)).toEqual([]);
  });

  it("shows approve on the parent naming the child's prompt once the parent's turn ends with the child still waiting", () => {
    const view = deriveInbox(
      snapshot({
        threads: [parent(), waitingChild()],
        interactions: { thr_perm: PERMISSION },
      }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_parent",
        tier: "blocked",
        word: "approve",
        reason: "A helper waits on you: Wants to run rm -rf dist",
        childPermission: {
          childThreadId: "thr_perm",
          prompt: "Wants to run rm -rf dist",
        },
      }),
    ]);
    expect(rowIds(view)).not.toContain("thr_perm");
  });

  it("raises the parent's own Verify item to approve", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent({ environment: environment("env_p"), latestAttentionAt: 150, lastReadAt: 0 }),
          waitingChild(),
        ],
        interactions: { thr_perm: PERMISSION },
        evidence: { env_p: DIFF },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_parent",
        tier: "blocked",
        word: "approve",
        childPermission: { childThreadId: "thr_perm" },
      },
    ]);
  });
});

describe("deriveInbox: nested children fold to the nearest item owner", () => {
  it("folds a grandchild under a folded child into the top-level thread's item", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent(),
          child("thr_mid", { lastReadAt: 100 }),
          child("thr_grand", { parentThreadId: "thr_mid", latestAttentionAt: 130 }),
        ],
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_parent",
        reason: "1 helper reported",
        folded: [{ threadId: "thr_grand" }],
      },
    ]);
    expect(rowIds(view)).toEqual(["thr_parent"]);
  });

  it("folds a grandchild into a child that asks the human, which keeps its own item", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          runningParent(),
          child("thr_ask", { hasPendingInteraction: true }),
          child("thr_grand", { parentThreadId: "thr_ask", latestAttentionAt: 130 }),
        ],
        interactions: { thr_ask: QUESTION },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_ask",
        tier: "blocked",
        parentThreadId: "thr_parent",
        folded: [{ threadId: "thr_grand", state: "reported" }],
      },
    ]);
    expect(rowIds(view)).toEqual(["thr_ask"]);
  });

  it("puts a grandchild's permission on the top-level thread once it stops", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          parent(),
          child("thr_mid", { lastReadAt: 100 }),
          child("thr_grand", { parentThreadId: "thr_mid", hasPendingInteraction: true }),
        ],
        interactions: { thr_grand: PERMISSION },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_parent",
        word: "approve",
        childPermission: { childThreadId: "thr_grand" },
      },
    ]);
  });

  it("survives a parent cycle without an item or a hang", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          child("thr_a", { parentThreadId: "thr_b" }),
          child("thr_b", { parentThreadId: "thr_a" }),
        ],
      }),
    );
    expect(rows(view)).toEqual([]);
  });
});
