import { describe, expect, it } from "vitest";
import {
  summarizePendingInteractions,
  type PendingInteractionList,
} from "./blocked.js";
import { deriveInbox } from "./index.js";
import { makeSidebarThread, QUESTION, snapshot } from "./test-snapshot.js";

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

describe("deriveInbox: an ask that arrives mid-turn (#24)", () => {
  // Attention at 40 (the turn started), read at 50, asked at 60.
  const read = makeSidebarThread({
    id: "thr_q",
    status: "active",
    hasPendingInteraction: true,
    latestAttentionAt: 40,
    lastReadAt: 50,
  });
  const asked = (askedAt: number) => ({ thr_q: { ...QUESTION, askedAt } });

  it("read before the ask → New, dated by the ask", () => {
    const view = deriveInbox(snapshot({ threads: [read], interactions: asked(60) }));
    expect(view.newForYou).toMatchObject([{ threadId: "thr_q", attentionAt: 60 }]);
    expect(view.tabCount).toBe(1);
  });

  it("opened after the ask → Seen", () => {
    const view = deriveInbox(
      snapshot({ threads: [{ ...read, lastReadAt: 70 }], interactions: asked(60) }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toMatchObject([{ threadId: "thr_q" }]);
  });

  it("holds a read thread back while its ask's time loads", () => {
    const view = deriveInbox(snapshot({ threads: [read] }));
    expect([...view.newForYou, ...view.seen]).toEqual([]);
  });

  it("shows a read thread whose interaction read failed, in Seen", () => {
    const view = deriveInbox(
      snapshot({ threads: [read], interactionsMissing: { thr_q: true } }),
    );
    expect(view.seen).toMatchObject([{ threadId: "thr_q", reason: "Waiting for you" }]);
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
      askedAt: 1,
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
    ).toEqual({ kind: "approval", reason, subject: subject.kind, askedAt: 1 });
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
    ).toEqual({ kind: "plugin", reason: "Enter the API token", askedAt: 1 });
  });

  it("dates the ask by the newest still-pending interaction", () => {
    expect(
      summarizePendingInteractions([
        { ...approval({ kind: "file_change" }), createdAt: 90, status: "resolved" },
        { ...approval({ kind: "file_change" }), createdAt: 40 },
        { ...approval({ kind: "file_change" }), createdAt: 60 },
      ] as unknown as PendingInteractionList)?.askedAt,
    ).toBe(60);
  });
});
