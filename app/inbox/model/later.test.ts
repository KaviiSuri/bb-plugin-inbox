import { describe, expect, it } from "vitest";
import type { Later } from "../../../shared/inbox-verification.js";
import { deriveInbox } from "./index.js";
import {
  DIFF,
  environment,
  makeSidebarThread,
  QUESTION,
  snapshot,
} from "./test-snapshot.js";

function later(threadId: string, laterAt: number): Later {
  return { threadId, laterAt, client: "test" };
}

describe("deriveInbox: Later", () => {
  const threads = [
    makeSidebarThread({
      id: "thr_v",
      environment: environment("env_a"),
      latestAttentionAt: 100,
    }),
    makeSidebarThread({
      id: "thr_ask",
      hasPendingInteraction: true,
      latestAttentionAt: 100,
    }),
    makeSidebarThread({ id: "thr_err", status: "error", latestAttentionAt: 100 }),
    makeSidebarThread({ id: "thr_fyi", latestAttentionAt: 100 }),
  ];
  const all = (laterAt: number) =>
    deriveInbox(
      snapshot({
        threads,
        interactions: { thr_ask: QUESTION },
        evidence: { env_a: DIFF },
        laters: Object.fromEntries(
          threads.map((t) => [t.id, later(t.id, laterAt)]),
        ),
      }),
    );

  it("hides an item of any tier, out of the count too", () => {
    const view = all(120);
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toEqual([]);
    expect(view.tabCount).toBe(0);
  });

  it("brings it back once the thread's latest attention passes the Later", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_v",
            environment: environment("env_a"),
            latestAttentionAt: 130,
          }),
        ],
        evidence: { env_a: DIFF },
        laters: { thr_v: later("thr_v", 120) },
      }),
    );
    expect(view.newForYou).toMatchObject([{ threadId: "thr_v", tier: "verify" }]);
    expect(all(99).newForYou).toHaveLength(4);
  });

  it("doesn't verify: a Later item that comes back still needs a Verification", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_v",
            environment: environment("env_a"),
            latestAttentionAt: 130,
            lastReadAt: 130,
          }),
        ],
        evidence: { env_a: DIFF },
        laters: { thr_v: later("thr_v", 120) },
      }),
    );
    expect(view.seen).toMatchObject([{ threadId: "thr_v", tier: "verify" }]);
  });
});
