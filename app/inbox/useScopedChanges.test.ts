import { describe, expect, it } from "vitest";
import type { Verification } from "../../shared/inbox-verification.js";
import { environment, makeSidebarThread } from "./model/test-snapshot.js";
import { scopeTargets } from "./useScopedChanges.js";

const verification = (overrides: Partial<Verification> = {}): Verification => ({
  threadId: "thr_v",
  verifiedAt: 100,
  client: "Laptop",
  diffBase: { headSha: "aaaa111", mergeBaseRef: "base999", files: [] },
  prChecksState: null,
  ...overrides,
});

const thread = (overrides: Parameters<typeof makeSidebarThread>[0] = {}) =>
  makeSidebarThread({
    id: "thr_v",
    environment: environment("env_a"),
    latestAttentionAt: 200,
    ...overrides,
  });

const targetsFor = (
  overrides: Parameters<typeof makeSidebarThread>[0] = {},
  verified: Partial<Verification> = {},
) =>
  scopeTargets([thread(overrides)], { thr_v: verification(verified) }).map(
    (t) => [t.threadId, t.environmentId, t.sha],
  );

describe("scopeTargets: which verified threads to read changes for", () => {
  it("reads a verified thread whose new work finished, against its verified head", () => {
    expect(targetsFor()).toEqual([["thr_v", "env_a", "aaaa111"]]);
  });

  it("reads against the latest Verification's base, so a re-verified thread is scoped to it", () => {
    expect(
      targetsFor({}, { diffBase: { headSha: "bbbb222", mergeBaseRef: null, files: [] } }),
    ).toEqual([["thr_v", "env_a", "bbbb222"]]);
  });

  it("skips threads with no new work, still running, waiting on the human, or with no base", () => {
    expect(targetsFor({ latestAttentionAt: 100 })).toEqual([]);
    expect(targetsFor({ status: "active" })).toEqual([]);
    expect(targetsFor({ hasPendingInteraction: true })).toEqual([]);
    expect(targetsFor({}, { diffBase: null })).toEqual([]);
    expect(targetsFor({ environment: null })).toEqual([]);
    expect(scopeTargets([thread()], {})).toEqual([]);
  });
});
