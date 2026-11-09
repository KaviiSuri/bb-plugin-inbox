import { describe, expect, it } from "vitest";
import { deriveInbox, nextChangeAt, STOP_GRACE_MS, STUCK_WAITING_FOR_HOST_MS } from "./index.js";
import { makeSidebarThread, NOW, QUESTION, snapshot } from "./test-snapshot.js";

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

  it("ignores a wait that already turned stuck, so a later grace still wakes the list", () => {
    expect(
      nextChangeAt(
        snapshot({
          runtime: {
            running: {},
            stoppedAt: { just_stopped: NOW - 500 },
            waitingForHostSince: {
              stuck: NOW - STUCK_WAITING_FOR_HOST_MS - 10_000,
            },
          },
        }),
      ),
    ).toBe(NOW - 500 + STOP_GRACE_MS);
  });
});
