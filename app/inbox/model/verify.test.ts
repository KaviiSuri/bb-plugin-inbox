import { describe, expect, it } from "vitest";
import type { Verification } from "../../../shared/inbox-verification.js";
import { deriveInbox, STOP_GRACE_MS } from "./index.js";
import {
  DIFF,
  environment,
  makeSidebarThread,
  NOW,
  pullRequest,
  QUESTION,
  snapshot,
} from "./test-snapshot.js";
import { NO_EVIDENCE } from "./verify.js";

/** A finished thread in env_a, not yet opened since it finished. */
const finished = (overrides: Parameters<typeof makeSidebarThread>[0] = {}) =>
  makeSidebarThread({
    id: "thr_v",
    environment: environment("env_a"),
    latestAttentionAt: 100,
    lastReadAt: 0,
    ...overrides,
  });

function verification(verifiedAt: number): Verification {
  return {
    threadId: "thr_v",
    verifiedAt,
    client: "test",
    diffBase: null,
    prChecksState: null,
  };
}

describe("deriveInbox: Verify vs FYI by evidence", () => {
  it("makes finished work with a diff a Verify item carrying its evidence", () => {
    const view = deriveInbox(
      snapshot({ threads: [finished()], evidence: { env_a: DIFF } }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_v",
        tier: "verify",
        word: "verify",
        reason: "Finished with changes to check",
        evidence: DIFF,
      }),
    ]);
  });

  it("makes finished work with a pull request a Verify item", () => {
    const view = deriveInbox(
      snapshot({ threads: [finished()], evidence: { env_a: pullRequest() } }),
    );
    expect(view.newForYou).toMatchObject([
      { tier: "verify", word: "verify", reason: "Finished with PR #12 to check" },
    ]);
  });

  it("makes finished work with no diff and no pull request FYI, without evidence", () => {
    const view = deriveInbox(
      snapshot({ threads: [finished()], evidence: { env_a: NO_EVIDENCE } }),
    );
    expect(view.newForYou).toEqual([
      expect.objectContaining({ tier: "fyi", word: "fyi", evidence: null }),
    ]);
  });

  it("makes a finished thread with no environment FYI", () => {
    const view = deriveInbox(
      snapshot({ threads: [finished({ environment: null })] }),
    );
    expect(view.newForYou).toMatchObject([{ tier: "fyi" }]);
  });

  it("shows nothing for a finished thread until its evidence has loaded", () => {
    const view = deriveInbox(snapshot({ threads: [finished()] }));
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toEqual([]);
  });

  it("keeps a thread that asks or failed in its own tier, even with evidence", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          finished({ id: "thr_ask", hasPendingInteraction: true }),
          finished({ id: "thr_err", status: "error" }),
        ],
        interactions: { thr_ask: QUESTION },
        evidence: { env_a: DIFF },
      }),
    );
    expect(view.newForYou.map((i) => [i.threadId, i.tier])).toEqual([
      ["thr_ask", "blocked"],
      ["thr_err", "broken"],
    ]);
  });

  it("never makes a running thread with evidence an item", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished({ status: "active" })],
        evidence: { env_a: DIFF },
      }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.running.map((r) => r.threadId)).toEqual(["thr_v"]);
  });

  it("holds a thread that just stopped with evidence in the running count for the grace, not as Verify", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished()],
        evidence: { env_a: DIFF },
        runtime: {
          running: {},
          stoppedAt: { thr_v: NOW - STOP_GRACE_MS + 1 },
          waitingForHostSince: {},
        },
      }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.running).toEqual([
      expect.objectContaining({ threadId: "thr_v", settling: true }),
    ]);
  });

  it("orders Verify after Broken and before FYI", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          finished({ id: "thr_fyi", environment: null, latestAttentionAt: 300 }),
          finished({ id: "thr_ver", latestAttentionAt: 200 }),
          finished({ id: "thr_err", status: "error", latestAttentionAt: 100 }),
        ],
        evidence: { env_a: DIFF },
      }),
    );
    expect(view.newForYou.map((i) => i.tier)).toEqual([
      "broken",
      "verify",
      "fyi",
    ]);
  });
});

describe("deriveInbox: failing PR checks stay under Verify (ADR 0005)", () => {
  it("keeps finished work whose checks fail under Verify, with the failing checks in its reason", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished()],
        evidence: {
          env_a: pullRequest({ state: "failing", failedCount: 2, totalCount: 7 }),
        },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        tier: "verify",
        word: "verify",
        reason: "PR #12: 2 of 7 checks failing",
      },
    ]);
  });
});

describe("deriveInbox: a Verification clears a Verify item", () => {
  it("clears the item once a Verification covers the thread's latest attention", () => {
    const at = (verifiedAt: number) =>
      deriveInbox(
        snapshot({
          threads: [finished()],
          evidence: { env_a: DIFF },
          verifications: { thr_v: verification(verifiedAt) },
        }),
      );
    expect(at(99).newForYou).toMatchObject([{ tier: "verify" }]);
    expect(at(100).newForYou).toEqual([]);
    expect(at(100).seen).toEqual([]);
  });

  it("clears it from Seen too: opening didn't clear it, verifying does", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished({ lastReadAt: 150 })],
        evidence: { env_a: DIFF },
        verifications: { thr_v: verification(160) },
      }),
    );
    expect(view.seen).toEqual([]);
  });

  it("brings the item back when the thread has something new after the Verification", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished({ latestAttentionAt: 200 })],
        evidence: { env_a: DIFF },
        verifications: { thr_v: verification(150) },
      }),
    );
    expect(view.newForYou).toMatchObject([{ tier: "verify" }]);
  });

  it("never clears an item that isn't Verify", () => {
    const view = deriveInbox(
      snapshot({
        threads: [
          finished({ id: "thr_v", status: "error" }),
        ],
        evidence: { env_a: DIFF },
        verifications: { thr_v: verification(500) },
      }),
    );
    expect(view.newForYou).toMatchObject([{ tier: "broken" }]);
  });
});

describe("deriveInbox: opening a Verify item", () => {
  it("moves it to Seen but doesn't clear it", () => {
    const view = deriveInbox(
      snapshot({
        threads: [finished({ lastReadAt: 150 })],
        evidence: { env_a: DIFF },
      }),
    );
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toMatchObject([{ threadId: "thr_v", tier: "verify" }]);
    expect(view.tabCount).toBe(0);
  });
});
