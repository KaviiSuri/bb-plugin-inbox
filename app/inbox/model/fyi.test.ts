import { describe, expect, it } from "vitest";
import { deriveInbox } from "./index.js";
import { makeSidebarThread, snapshot } from "./test-snapshot.js";

describe("deriveInbox: FYI is cleared by opening (ADR 0004)", () => {
  const report = (lastReadAt: number | null) =>
    deriveInbox(
      snapshot({
        threads: [
          makeSidebarThread({
            id: "thr_r",
            latestAttentionAt: 100,
            lastReadAt,
          }),
        ],
      }),
    );

  it("shows an unopened report as FYI under New for you", () => {
    expect(report(null).newForYou).toMatchObject([
      { threadId: "thr_r", tier: "fyi", word: "fyi" },
    ]);
    expect(report(99).newForYou).toMatchObject([{ tier: "fyi" }]);
  });

  it("clears it once the thread was opened since it reported, never parking it in Seen", () => {
    for (const view of [report(100), report(150)]) {
      expect(view.newForYou).toEqual([]);
      expect(view.seen).toEqual([]);
    }
  });
});
