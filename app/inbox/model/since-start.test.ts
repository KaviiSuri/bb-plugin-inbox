import { describe, expect, it } from "vitest";
import { deriveInbox } from "./index.js";
import {
  DIFF,
  environment,
  makeSidebarThread,
  QUESTION,
  snapshot,
} from "./test-snapshot.js";

const START = 500;

/** A finished thread in env_a with a diff, unopened since its attention. */
const finished = (latestAttentionAt: number, id = "thr_old") =>
  makeSidebarThread({
    id,
    environment: environment("env_a"),
    latestAttentionAt,
    lastReadAt: 0,
  });

describe("deriveInbox: the Inbox starts at install (ADR 0010)", () => {
  it("makes no item for work finished before the Inbox started", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          finished(400),
          finished(START, "thr_at_start"),
          makeSidebarThread({ id: "thr_report", latestAttentionAt: 400 }),
        ],
        evidence: { env_a: DIFF },
        inboxStartedAt: START,
      }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toEqual([]);
  });

  it("makes the same thread a Verify item once it finishes new work", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished(600)],
        evidence: { env_a: DIFF },
        inboxStartedAt: START,
      }),
    );
    expect(view.newForYou).toMatchObject([{ threadId: "thr_old", tier: "verify" }]);
  });

  it("still shows an old thread that is Blocked on you or Broken", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({ id: "thr_ask", hasPendingInteraction: true, latestAttentionAt: 100 }),
          makeSidebarThread({ id: "thr_err", status: "error", latestAttentionAt: 100 }),
        ],
        interactions: { thr_ask: QUESTION },
        inboxStartedAt: START,
      }),
    );
    expect(view.newForYou.map((i) => [i.threadId, i.tier])).toEqual([
      ["thr_ask", "blocked"],
      ["thr_err", "broken"],
    ]);
  });

  it("holds back Verify and FYI while the start time loads", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          finished(600),
          makeSidebarThread({ id: "thr_report", latestAttentionAt: 600 }),
          makeSidebarThread({ id: "thr_err", status: "error", latestAttentionAt: 600 }),
        ],
        evidence: { env_a: DIFF },
        inboxStartedAt: null,
      }),
    );
    expect(view.newForYou.map((i) => i.threadId)).toEqual(["thr_err"]);
  });
});
