import { describe, expect, it } from "vitest";
import { STUCK_WAITING_FOR_HOST_MS } from "./broken.js";
import { deriveInbox } from "./index.js";
import { makeSidebarThread, NOW, snapshot } from "./test-snapshot.js";

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
    expect(view.newForYou).not.toContainEqual(
      expect.objectContaining({ tier: "broken" }),
    );
  });
});
