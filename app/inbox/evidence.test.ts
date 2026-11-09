import { describe, expect, it } from "vitest";
import { describeEvidence, evidenceFromRows } from "./evidence.js";
import { NO_EVIDENCE } from "./model/index.js";

const changes = (fileCount: number) =>
  ({
    outcome: "available",
    workspace: { allChanges: { fileCount, insertions: 40, deletions: 12 } },
  }) as const;

const pr = {
  outcome: "available",
  pullRequest: {
    number: 12,
    state: "open",
    checks: { state: "passing", totalCount: 7, failedCount: 0 },
  },
} as const;

describe("evidenceFromRows", () => {
  it("is a diffstat when the environment has changes against its merge base", () => {
    expect(evidenceFromRows(changes(3), { outcome: "absent" })).toEqual({
      diff: { fileCount: 3, insertions: 40, deletions: 12 },
      pullRequest: null,
    });
  });

  it("is nothing for a clean checkout with no pull request", () => {
    expect(evidenceFromRows(changes(0), { outcome: "absent" })).toBe(NO_EVIDENCE);
  });

  it("counts a pull request on a clean checkout", () => {
    expect(evidenceFromRows(changes(0), pr)).toEqual({
      diff: null,
      pullRequest: pr.pullRequest,
    });
  });

  it("treats unreadable rows as nothing to show", () => {
    expect(
      evidenceFromRows({ outcome: "unavailable" }, { outcome: "unavailable" }),
    ).toBe(NO_EVIDENCE);
    expect(evidenceFromRows(null, null)).toBe(NO_EVIDENCE);
  });
});

describe("describeEvidence", () => {
  it("is the diffstat, then the PR with its checks", () => {
    expect(
      describeEvidence({
        diff: { fileCount: 1, insertions: 2, deletions: 0 },
        pullRequest: {
          ...pr.pullRequest,
          checks: { state: "failing", totalCount: 7, failedCount: 2 },
        },
      }),
    ).toEqual(["1 file · +2 −0", "PR #12 · open · 2 of 7 checks failing"]);
  });
});
