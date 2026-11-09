import { describe, expect, it } from "vitest";
import { deriveInbox, type InboxSnapshot } from "./index.js";
import { STOP_GRACE_MS, trackRuntime } from "./running.js";
import { makeSidebarThread, NOW, QUESTION, snapshot } from "./test-snapshot.js";

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
