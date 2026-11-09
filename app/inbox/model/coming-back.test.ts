import { describe, expect, it } from "vitest";
import type {
  DiffBase,
  PrChecksState,
  Verification,
} from "../../../shared/inbox-verification.js";
import {
  scopeChanges,
  scopeTarget,
  type ChangedFile,
  type ScopedChanges,
} from "./coming-back.js";
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
import { NO_EVIDENCE, type EnvironmentEvidence } from "./verify.js";
import type { InboxSnapshot } from "./types.js";

const BASE: DiffBase = {
  headSha: "aaaa111",
  mergeBaseRef: "base999",
  files: [
    { path: "a.ts", revision: "100644:1111:100644:a0a0", content: "one\ntwo\n", headMode: "100644" },
    { path: "b.ts", revision: "100644:2222:100644:b0b0", content: "b\n", headMode: "100644" },
  ],
};

function verification(
  verifiedAt: number,
  overrides: Partial<Verification> = {},
): Verification {
  return {
    threadId: "thr_v",
    verifiedAt,
    client: "Laptop",
    diffBase: BASE,
    prChecksState: null,
    ...overrides,
  };
}

/** Verified at 100; did more work, which finished at 200. */
const returned = (overrides: Parameters<typeof makeSidebarThread>[0] = {}) =>
  makeSidebarThread({
    id: "thr_v",
    environment: environment("env_a"),
    latestAttentionAt: 200,
    lastReadAt: 0,
    ...overrides,
  });

const NEW_CHANGES: ScopedChanges = {
  verifiedAt: 100,
  attentionAt: 200,
  outcome: "available",
  diff: { fileCount: 1, insertions: 5, deletions: 2 },
  paths: ["c.ts"],
};

const NOTHING_NEW: ScopedChanges = {
  verifiedAt: 100,
  attentionAt: 200,
  outcome: "available",
  diff: null,
  paths: [],
};

function view(overrides: Partial<InboxSnapshot> = {}) {
  return deriveInbox(
    snapshot({
      threads: [returned()],
      evidence: { env_a: DIFF },
      verifications: { thr_v: verification(100) },
      scoped: { thr_v: NEW_CHANGES },
      ...overrides,
    }),
  );
}

const failing = (failedCount = 2): EnvironmentEvidence => ({
  diff: DIFF.diff,
  pullRequest: pullRequest({ state: "failing", failedCount, totalCount: 7 })
    .pullRequest,
});

describe("deriveInbox: coming back (ADR 0003)", () => {
  it("shows no item while the new work runs", () => {
    const running = view({ threads: [returned({ status: "active" })] });
    expect(running.newForYou).toEqual([]);
    expect(running.seen).toEqual([]);
    expect(running.running.map((r) => r.threadId)).toEqual(["thr_v"]);

    const settling = view({
      runtime: {
        running: {},
        stoppedAt: { thr_v: NOW - STOP_GRACE_MS + 1 },
        waitingForHostSince: {},
      },
    });
    expect(settling.newForYou).toEqual([]);
  });

  it("comes back under Verify once it finishes, with evidence scoped to the new changes", () => {
    expect(view().newForYou).toEqual([
      expect.objectContaining({
        threadId: "thr_v",
        tier: "verify",
        word: "verify",
        reason: "New changes since you verified",
        evidence: { diff: NEW_CHANGES.diff, pullRequest: null },
        comingBack: {
          verifiedAt: 100,
          client: "Laptop",
          scoped: true,
          verifiedPaths: ["a.ts", "b.ts"],
          verifiedFiles: BASE.files,
        },
      }),
    ]);
  });

  it("comes back as Blocked on you if the new work asks", () => {
    const asks = view({
      threads: [returned({ hasPendingInteraction: true })],
      interactions: { thr_v: QUESTION },
    });
    expect(asks.newForYou).toMatchObject([
      { threadId: "thr_v", tier: "blocked", word: "answer" },
    ]);
  });

  it("comes back as Broken if the new work fails", () => {
    expect(
      view({ threads: [returned({ status: "error" })] }).newForYou,
    ).toMatchObject([{ threadId: "thr_v", tier: "broken", word: "failed" }]);
  });

  it("comes back as FYI when only a report came after the base, cleared by opening", () => {
    const reported = view({ scoped: { thr_v: NOTHING_NEW } });
    expect(reported.newForYou).toEqual([
      expect.objectContaining({ tier: "fyi", word: "fyi", evidence: null }),
    ]);
    expect(reported.newForYou[0]!.comingBack).toBeUndefined();

    const opened = view({
      threads: [returned({ lastReadAt: 200 })],
      scoped: { thr_v: NOTHING_NEW },
    });
    expect(opened.newForYou).toEqual([]);
    expect(opened.seen).toEqual([]);
  });

  it("comes back as FYI when the new work left nothing to verify at all", () => {
    expect(
      view({ evidence: { env_a: NO_EVIDENCE }, scoped: { thr_v: NOTHING_NEW } }).newForYou,
    ).toMatchObject([{ tier: "fyi" }]);
  });

  it("still asks to Verify a revert of verified uncommitted work when git has no remaining HEAD diff", () => {
    expect(view({
      evidence: { env_a: NO_EVIDENCE },
      scoped: { thr_v: { ...NEW_CHANGES, diff: { fileCount: 1, insertions: 0, deletions: 1 } } },
    }).newForYou).toMatchObject([{
      tier: "verify",
      evidence: { diff: { fileCount: 1, insertions: 0, deletions: 1 } },
    }]);
  });

  it("holds back until the scoped changes for this finish have loaded", () => {
    expect(view({ scoped: {} }).newForYou).toEqual([]);
    // Read for an earlier finish, or for an earlier Verification: stale.
    expect(
      view({ scoped: { thr_v: { ...NEW_CHANGES, attentionAt: 150 } } }).newForYou,
    ).toEqual([]);
    expect(
      view({ scoped: { thr_v: { ...NEW_CHANGES, verifiedAt: 90 } } }).newForYou,
    ).toEqual([]);
  });

  it("falls back to all of its changes, saying so, when no diff base was recorded", () => {
    const unscoped = view({
      verifications: { thr_v: verification(100, { diffBase: null }) },
      scoped: {},
    });
    expect(unscoped.newForYou).toEqual([
      expect.objectContaining({
        tier: "verify",
        reason: "New work; couldn't tell what changed since you verified",
        evidence: DIFF,
        comingBack: expect.objectContaining({ scoped: false, verifiedPaths: [] }),
      }),
    ]);
  });

  it("keeps the unscoped label visible alongside failing PR checks when the diff base is null", () => {
    const entry = view({
      evidence: { env_a: failing(1) },
      verifications: { thr_v: verification(100, { diffBase: null, prChecksState: "passing" }) },
    }).newForYou[0]!;
    expect(entry.reason).toContain("couldn't tell what changed since you verified");
    expect(entry.reason).toContain("PR #12: 1 of 7 checks failing");
    expect(entry.comingBack?.scoped).toBe(false);
  });

  it("falls back to all of its changes when reading the scoped changes failed", () => {
    const failed = view({
      scoped: { thr_v: { verifiedAt: 100, attentionAt: 200, outcome: "unavailable" } },
    });
    expect(failed.newForYou).toMatchObject([
      { tier: "verify", evidence: DIFF, comingBack: { scoped: false } },
    ]);
  });
});

describe("deriveInbox: re-verifying a returning item", () => {
  it("clears it, and the next return is scoped to the new Verification's base", () => {
    const second = verification(250, {
      diffBase: { ...BASE, headSha: "bbbb222" },
    });
    expect(
      view({ verifications: { thr_v: second } }).newForYou,
    ).toEqual([]);

    const nextReturn = (scoped: ScopedChanges) =>
      view({
        threads: [returned({ latestAttentionAt: 300 })],
        verifications: { thr_v: second },
        scoped: { thr_v: scoped },
      });
    // A read against the first Verification's base no longer counts.
    expect(
      nextReturn({ ...NEW_CHANGES, attentionAt: 300 }).newForYou,
    ).toEqual([]);
    expect(
      nextReturn({ ...NEW_CHANGES, verifiedAt: 250, attentionAt: 300 }).newForYou,
    ).toMatchObject([
      { tier: "verify", comingBack: { verifiedAt: 250, scoped: true } },
    ]);
  });
});

describe("deriveInbox: checks that start failing after a Verification (ADR 0005)", () => {
  /** Verified at 100, and nothing since. */
  const covered = (prChecksState: PrChecksState | null) =>
    view({
      threads: [returned({ latestAttentionAt: 100 })],
      evidence: { env_a: failing() },
      verifications: { thr_v: verification(100, { prChecksState }) },
      scoped: {},
    });

  it("comes back under Verify, with no new work, when checks turn failing", () => {
    for (const was of ["passing", "pending", "no_checks", "unknown"] as const) {
      expect(covered(was).newForYou).toEqual([
        expect.objectContaining({
          tier: "verify",
          word: "verify",
          reason: "PR #12: 2 of 7 checks failing since you verified",
          evidence: { diff: null, pullRequest: failing().pullRequest },
        }),
      ]);
    }
  });

  it("brings nothing back when checks were already failing at sign-off", () => {
    const view = covered("failing");
    expect(view.newForYou).toEqual([]);
    expect(view.seen).toEqual([]);
  });

  it("brings nothing back on checks alone when no checks state was recorded at sign-off", () => {
    expect(covered(null).newForYou).toEqual([]);
  });

  it("stays cleared while checks pass after the Verification", () => {
    expect(
      view({
        threads: [returned({ latestAttentionAt: 100 })],
        evidence: { env_a: pullRequest() },
        verifications: { thr_v: verification(100, { prChecksState: "passing" }) },
      }).newForYou,
    ).toEqual([]);
  });

  it("says so in the reason when new changes come back with checks turned failing", () => {
    expect(
      view({
        evidence: { env_a: failing() },
        verifications: { thr_v: verification(100, { prChecksState: "passing" }) },
      }).newForYou,
    ).toMatchObject([
      { tier: "verify", reason: "New changes; PR #12: 2 of 7 checks failing" },
    ]);
  });

  it("comes back under Verify, not FYI, when only a report came after the base but checks turned failing", () => {
    expect(
      view({
        evidence: { env_a: failing() },
        verifications: { thr_v: verification(100, { prChecksState: "passing" }) },
        scoped: { thr_v: NOTHING_NEW },
      }).newForYou,
    ).toMatchObject([
      {
        tier: "verify",
        reason: "PR #12: 2 of 7 checks failing since you verified",
        evidence: { diff: null },
      },
    ]);
  });
});

describe("scopeChanges", () => {
  const file = (path: string, revision: string, additions = 1, deletions = 0): ChangedFile => ({
    path,
    revision,
    additions,
    deletions,
  });

  it("keeps files whose content changed since the base, with their line counts", () => {
    expect(
      scopeChanges(
        [
          file("a.ts", "100644:a0a0:100644:a1a1", 4, 1),
          file("c.ts", "000000:0000:100644:c1c1", 10, 0),
        ],
        BASE,
        { "a.ts": "one\nthree\n", "b.ts": "b\n" },
      ),
    ).toEqual({
      diff: { fileCount: 2, insertions: 11, deletions: 1 },
      paths: ["c.ts", "a.ts"],
    });
  });

  it("counts a reverted executable bit even when the file disappears from the HEAD diff", () => {
    expect(scopeChanges([], {
      ...BASE,
      files: [{ path: "run.sh", revision: "100644:aaaa:100755:aaaa", content: "echo ok\n", headMode: "100644" }],
    }, { "run.sh": "echo ok\n" })).toEqual({
      diff: { fileCount: 1, insertions: 0, deletions: 0 }, paths: ["run.sh"],
    });
  });

  it("counts restoring a verified empty-file deletion even when the HEAD diff is empty", () => {
    expect(scopeChanges([], {
      ...BASE,
      files: [{ path: "empty", revision: "100644:aaaa:000000:0000", content: "", headMode: "100644" }],
    }, { empty: "" })).toEqual({
      diff: { fileCount: 1, insertions: 0, deletions: 0 }, paths: ["empty"],
    });
  });

  it("admits scope is unavailable when equal text has no reliable HEAD mode or presence metadata", () => {
    for (const revision of ["100644:aaaa:100755:aaaa", "100644:aaaa:000000:0000"]) {
      expect(scopeChanges([], { ...BASE, files: [{ path: "x", revision, content: "" }] }, { x: "" })).toBeNull();
    }
  });

  it("counts only the extra line after signing off an uncommitted addition, not the whole file", () => {
    expect(scopeChanges(
      [file("a.ts", "000000:0000:100644:aaaa", 3, 0)],
      { ...BASE, files: [BASE.files[0]!] },
      { "a.ts": "one\ntwo\nthree\n" },
    )).toEqual({ diff: { fileCount: 1, insertions: 1, deletions: 0 }, paths: ["a.ts"] });
  });

  it("counts reverting a verified uncommitted edit even when git now has no diff against HEAD", () => {
    expect(scopeChanges([], { ...BASE, files: [BASE.files[0]!] }, { "a.ts": "one\n" }))
      .toEqual({ diff: { fileCount: 1, insertions: 0, deletions: 1 }, paths: ["a.ts"] });
  });

  it("falls back instead of labelling an old base with no content snapshot as exactly scoped", () => {
    expect(scopeChanges(
      [file("a.ts", "100644:1111:100644:ffff", 40, 0)],
      { ...BASE, files: [{ path: "a.ts", revision: "100644:1111:100644:a0a0" }] },
    )).toBeNull();
  });

  it("leaves out files whose content is what was verified, even against another old side", () => {
    // b.ts was uncommitted at sign-off and committed since.
    expect(
      scopeChanges([file("b.ts", "100644:9999:100644:b0b0", 3, 3)], BASE, { "a.ts": "one\ntwo\n" }),
    ).toEqual({ diff: null, paths: [] });
  });
});

describe("scopeTarget", () => {
  it("compares against the verified head, or the merge base without one", () => {
    expect(scopeTarget(BASE)).toBe("aaaa111");
    expect(scopeTarget({ ...BASE, headSha: null })).toBe("base999");
    expect(scopeTarget({ ...BASE, headSha: null, mergeBaseRef: null })).toBeNull();
  });
});
