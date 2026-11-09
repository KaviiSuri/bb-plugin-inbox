import { describe, expect, it } from "vitest";
import { makeSidebarThread } from "../model/fixtures.js";
import {
  deriveInbox,
  nextChangeAt,
  STOP_GRACE_MS,
  trackRuntime,
  STUCK_WAITING_FOR_HOST_MS,
  type InboxSnapshot,
  summarizePendingInteractions,
  type PendingInteractionList,
  type PendingInteractionSummary,
} from "./model.js";

const NOW = 1_000_000;

const QUESTION: PendingInteractionSummary = {
  kind: "user_question",
  reason: "Asks: which database?",
};

function snapshot(overrides: Partial<InboxSnapshot> = {}): InboxSnapshot {
  return {
    threads: [],
    interactions: {},
    runtime: { running: {}, stoppedAt: {}, waitingForHostSince: {} },
    now: NOW,
    ...overrides,
  };
}

describe("deriveInbox: order", () => {
  it("puts Blocked on you before Broken, newest first within a tier", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({ id: "broken_new", status: "error", latestAttentionAt: 90 }),
          makeSidebarThread({ id: "ask_old", hasPendingInteraction: true, latestAttentionAt: 10 }),
          makeSidebarThread({ id: "broken_old", status: "error", latestAttentionAt: 20 }),
          makeSidebarThread({ id: "ask_new", hasPendingInteraction: true, latestAttentionAt: 50 }),
        ],
      }),
    );
    expect(view.newForYou.map((item) => item.threadId)).toEqual([
      "ask_new",
      "ask_old",
      "broken_new",
      "broken_old",
    ]);
  });
});

describe("deriveInbox: New for you and Seen", () => {
  const threads = [
    makeSidebarThread({
      id: "opened",
      status: "error",
      latestAttentionAt: 50,
      lastReadAt: 60,
    }),
    makeSidebarThread({
      id: "not_opened",
      status: "error",
      latestAttentionAt: 50,
      lastReadAt: 40,
    }),
    makeSidebarThread({
      id: "opened_ask",
      hasPendingInteraction: true,
      latestAttentionAt: 30,
      lastReadAt: 30,
    }),
  ];

  it("moves an item to Seen once its thread was opened since its latest attention", () => {
    const view = deriveInbox(snapshot({ threads }));
    expect(view.newForYou.map((item) => item.threadId)).toEqual(["not_opened"]);
    expect(view.seen.map((item) => item.threadId)).toEqual([
      "opened_ask",
      "opened",
    ]);
  });

  it("counts only New for you on the Inbox tab", () => {
    expect(deriveInbox(snapshot({ threads })).tabCount).toBe(1);
    expect(
      deriveInbox(
        snapshot({
          threads: [
            ...threads,
            makeSidebarThread({ id: "busy", status: "active" }),
          ],
        }),
      ).tabCount,
    ).toBe(1);
  });
});

describe("deriveInbox: hidden and archived threads", () => {
  it.each([
    ["hidden", { isHidden: true }],
    ["archived", { isArchived: true, archivedAt: 5 }],
  ] as const)("never shows a %s thread, as an item or in the count", (_, overrides) => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({ id: "thr_ask", hasPendingInteraction: true, ...overrides }),
          makeSidebarThread({ id: "thr_err", status: "error", ...overrides }),
          makeSidebarThread({ id: "thr_run", status: "active", ...overrides }),
          makeSidebarThread({ id: "thr_settle", ...overrides }),
        ],
        interactions: { thr_ask: QUESTION },
        runtime: {
          running: {},
          stoppedAt: { thr_settle: NOW },
          waitingForHostSince: {},
        },
      }),
    );
    expect(view).toMatchObject({ newForYou: [], seen: [], running: [] });
  });
});

describe("deriveInbox: Running count", () => {
  it.each([
    ["active", { status: "active" }],
    ["starting", { status: "starting" }],
    ["stopping", { status: "stopping" }],
    ["pending", { status: "pending" }],
    ["running a workflow", { activity: { workflows: 1 } }],
    ["running a background agent", { activity: { backgroundAgents: 1 } }],
    ["running a background command", { activity: { backgroundCommands: 2 } }],
  ] as const)("counts a thread that is %s, never as an item", (_, overrides) => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_run",
            title: "Busy",
            isUnread: true,
            ...overrides,
          }),
        ],
      }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toEqual([]);
    expect(view.running).toEqual([
      { threadId: "thr_run", title: "Busy", settling: false },
    ]);
  });

  it("keeps a running thread that failed a queued send in the running count", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_run",
            status: "active",
            queuedWork: "failed",
          }),
        ],
      }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.running.map((r) => r.threadId)).toEqual(["thr_run"]);
  });

  it("makes a running thread that waits on you an item, not a count", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_ask",
            status: "active",
            hasPendingInteraction: true,
          }),
        ],
        interactions: { thr_ask: QUESTION },
      }),
    );
    expect(view.running).toEqual([]);
    expect(view.newForYou).toMatchObject([{ threadId: "thr_ask", word: "answer" }]);
  });

  it("does not count plan mode alone as running", () => {
    const view = deriveInbox(
      snapshot({
        threads: [makeSidebarThread({ id: "thr_plan", activity: { planMode: 1 } })],
      }),
    );
    expect(view.running).toEqual([]);
  });
});

describe("deriveInbox: the stop grace", () => {
  function justStopped(
    overrides: Parameters<typeof makeSidebarThread>[0],
    stoppedAgo: number,
    interactions: InboxSnapshot["interactions"] = {},
  ) {
    return deriveInbox(
      snapshot({
        threads: [makeSidebarThread({ id: "thr_s", title: "Done", ...overrides })],
        interactions,
        runtime: {
          running: {},
          stoppedAt: { thr_s: NOW - stoppedAgo },
          waitingForHostSince: {},
        },
      }),
    );
  }

  it("holds a thread that just stopped in the running count for 2 seconds", () => {
    expect(justStopped({}, STOP_GRACE_MS - 1).running).toEqual([
      { threadId: "thr_s", title: "Done", settling: true },
    ]);
    expect(justStopped({}, STOP_GRACE_MS).running).toEqual([]);
  });

  it("skips the grace when the thread waits on you", () => {
    const view = justStopped({ hasPendingInteraction: true }, 0, {
      thr_s: QUESTION,
    });
    expect(view.running).toEqual([]);
    expect(view.newForYou).toMatchObject([{ threadId: "thr_s", word: "answer" }]);
  });

  it("skips the grace when the thread is broken", () => {
    const view = justStopped({ status: "error" }, 0);
    expect(view.running).toEqual([]);
    expect(view.newForYou).toMatchObject([{ threadId: "thr_s", word: "failed" }]);
  });
});

describe("trackRuntime", () => {
  const EMPTY = { running: {}, stoppedAt: {}, waitingForHostSince: {} };

  it("records when a running thread is first seen stopped", () => {
    const busy = makeSidebarThread({ id: "thr_t", status: "active" });
    const idle = makeSidebarThread({ id: "thr_t", status: "idle" });
    const t1 = trackRuntime(EMPTY, [busy], 10);
    expect(t1.stoppedAt).toEqual({});
    const t2 = trackRuntime(t1, [idle], 20);
    expect(t2.stoppedAt).toEqual({ thr_t: 20 });
    expect(trackRuntime(t2, [idle], 30).stoppedAt).toEqual({ thr_t: 20 });
  });

  it("never starts a grace for a thread it never saw running", () => {
    const idle = makeSidebarThread({ id: "thr_t" });
    expect(trackRuntime(EMPTY, [idle], 10).stoppedAt).toEqual({});
  });

  it("forgets a stop once its grace is over or the thread runs again", () => {
    const busy = makeSidebarThread({ id: "thr_t", status: "active" });
    const idle = makeSidebarThread({ id: "thr_t" });
    const stopped = trackRuntime(trackRuntime(EMPTY, [busy], 0), [idle], 10);
    expect(trackRuntime(stopped, [busy], 11).stoppedAt).toEqual({});
    expect(
      trackRuntime(stopped, [idle], 10 + STOP_GRACE_MS).stoppedAt,
    ).toEqual({});
  });

  it("records when a thread started waiting for its machine", () => {
    const waiting = makeSidebarThread({
      id: "thr_h",
      runtimeStatus: "waiting-for-host",
    });
    const t1 = trackRuntime(EMPTY, [waiting], 10);
    const t2 = trackRuntime(t1, [waiting], 50);
    expect(t2.waitingForHostSince).toEqual({ thr_h: 10 });
    const ready = makeSidebarThread({ id: "thr_h", runtimeStatus: "idle" });
    expect(trackRuntime(t2, [ready], 60).waitingForHostSince).toEqual({});
  });
});

describe("deriveInbox: Broken", () => {
  it.each([
    ["stopped on an error", { status: "error" }, "Stopped with an error"],
    [
      "a queued message failed to send",
      { queuedWork: "failed" },
      "A queued message failed to send",
    ],
    [
      "its turn ended in an error",
      { indicator: "unread-error" },
      "Its last turn ended in an error",
    ],
  ] as const)("shows a thread where %s as failed", (_, overrides, reason) => {
    const view = deriveInbox(
      snapshot({ threads: [makeSidebarThread({ id: "thr_b", ...overrides })] }),
    );
    expect(view.newForYou).toMatchObject([
      { threadId: "thr_b", tier: "broken", word: "failed", reason },
    ]);
  });

  it("shows a thread stuck waiting for its machine as failed, after a while", () => {
    const thread = makeSidebarThread({
      id: "thr_host",
      status: "active",
      runtimeStatus: "waiting-for-host",
    });
    const waiting = (since: number) =>
      deriveInbox(
        snapshot({
          threads: [thread],
          runtime: {
            running: {},
            stoppedAt: {},
            waitingForHostSince: { thr_host: since },
          },
        }),
      );
    expect(waiting(NOW - STUCK_WAITING_FOR_HOST_MS + 1).newForYou).toEqual([]);
    expect(waiting(NOW - STUCK_WAITING_FOR_HOST_MS).newForYou).toMatchObject([
      {
        threadId: "thr_host",
        tier: "broken",
        word: "failed",
        reason: "Stuck waiting for its machine",
      },
    ]);
  });

  it("does not call a thread with no error signal broken", () => {
    const view = deriveInbox(
      snapshot({ threads: [makeSidebarThread({ id: "thr_ok" })] }),
    );
    expect(view.newForYou).toEqual([]);
  });
});

describe("deriveInbox: Blocked on you", () => {
  it("shows a thread waiting on a question form as answer", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_q",
            title: "Grill: billing",
            hasPendingInteraction: true,
          }),
        ],
        interactions: { thr_q: QUESTION },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_q",
        tier: "blocked",
        word: "answer",
        reason: "Asks: which database?",
      },
    ]);
  });

  it("shows a thread waiting on an approval (permission, command, plan…) as approve", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({ id: "thr_a", hasPendingInteraction: true }),
        ],
        interactions: {
          thr_a: { kind: "approval", reason: "Has a plan for you to review" },
        },
      }),
    );
    expect(view.newForYou).toMatchObject([
      { threadId: "thr_a", tier: "blocked", word: "approve" },
    ]);
  });

  it("says the thread is waiting for you until its interaction has loaded", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({ id: "thr_x", hasPendingInteraction: true }),
        ],
      }),
    );
    expect(view.newForYou).toMatchObject([
      { tier: "blocked", word: "answer", reason: "Waiting for you" },
    ]);
  });
});

describe("summarizePendingInteractions: answer vs approve", () => {
  const base = {
    createdAt: 1,
    id: "int_1",
    providerId: "claude-code",
    providerRequestId: "req_1",
    providerThreadId: "pt_1",
    resolution: null,
    resolvedAt: null,
    status: "pending",
    statusReason: null,
    threadId: "thr_1",
    turnId: "turn_1",
  } as const;
  const approval = (subject: Record<string, unknown>) => ({
    ...base,
    payload: {
      kind: "approval",
      availableDecisions: ["allow_once", "deny"],
      reason: null,
      subject: { itemId: "item_1", ...subject },
    },
  });

  it("reads a question form as answer, with its first question", () => {
    const summary = summarizePendingInteractions([
      {
        ...base,
        payload: {
          kind: "user_question",
          questions: [
            {
              id: "q1",
              prompt: "Which database should we use?",
              allowFreeText: true,
              multiSelect: false,
              required: true,
            },
          ],
        },
      },
    ] as unknown as PendingInteractionList);
    expect(summary).toEqual({
      kind: "user_question",
      reason: "Asks: Which database should we use?",
    });
  });

  it.each([
    [
      "a command",
      { kind: "command", command: "rm -rf dist", cwd: null, sessionGrant: null },
      "Wants to run rm -rf dist",
    ],
    [
      "a file change",
      { kind: "file_change", sessionGrant: null, writeScope: null },
      "Wants to change files",
    ],
    [
      "a permission",
      {
        kind: "permission_grant",
        permissions: { fileSystem: null, network: null },
        toolName: null,
      },
      "Wants more permissions",
    ],
    [
      "a plan",
      { kind: "plan", plan: "1. Do it", planFilePath: null },
      "Has a plan for you to review",
    ],
    [
      "a tool",
      {
        kind: "tool_use",
        tool: "WebFetch",
        presentation: { icon: { glyph: "x" }, label: { pending: "Fetch", completed: "Fetched" } },
      },
      "Wants to use WebFetch",
    ],
  ])("reads an approval of %s as approve", (_, subject, reason) => {
    expect(
      summarizePendingInteractions([
        approval(subject),
      ] as unknown as PendingInteractionList),
    ).toEqual({ kind: "approval", reason });
  });

  it("ignores interactions that are no longer pending", () => {
    expect(
      summarizePendingInteractions([
        { ...approval({ kind: "file_change" }), status: "resolved" },
      ] as unknown as PendingInteractionList),
    ).toBeNull();
  });

  it("reads a plugin's form as answer, with its title", () => {
    expect(
      summarizePendingInteractions([
        {
          ...base,
          origin: { kind: "plugin", pluginId: "secrets", rendererId: "form" },
          payload: { kind: "plugin", data: null, title: "Enter the API token" },
        },
      ] as unknown as PendingInteractionList),
    ).toEqual({ kind: "plugin", reason: "Enter the API token" });
  });
});

describe("nextChangeAt", () => {
  it("is when the earliest grace ends or a wait for a machine turns stuck", () => {
    expect(nextChangeAt(snapshot())).toBeNull();
    expect(
      nextChangeAt(
        snapshot({
          runtime: {
            running: {},
            stoppedAt: { a: NOW - 500 },
            waitingForHostSince: { b: NOW - 1_000 },
          },
        }),
      ),
    ).toBe(NOW - 500 + STOP_GRACE_MS);
    expect(
      nextChangeAt(
        snapshot({
          runtime: {
            running: {},
            stoppedAt: {},
            waitingForHostSince: { b: NOW - 1_000 },
          },
        }),
      ),
    ).toBe(NOW - 1_000 + STUCK_WAITING_FOR_HOST_MS);
  });
});
