import { describe, expect, it } from "vitest";
import { holdStill, layoutOf } from "./hold-still.js";
import type { InboxItem, InboxView } from "./model.js";

function item(threadId: string, word: InboxItem["word"] = "answer"): InboxItem {
  return {
    threadId,
    title: threadId,
    tier: word === "failed" ? "broken" : "blocked",
    word,
    reason: "",
    attentionAt: 0,
  };
}

function view(newForYou: InboxItem[], seen: InboxItem[] = []): InboxView {
  return { newForYou, seen, running: [], tabCount: newForYou.length };
}

const ids = (items: InboxItem[]) => items.map((i) => i.threadId);

describe("holdStill: the list holds still while the human touches it", () => {
  it("keeps every row where it was, with its content kept current", () => {
    const held = layoutOf(view([item("a"), item("b")], [item("c")]));
    const next = holdStill(
      held,
      view([item("b"), item("a", "approve")], [item("c")]),
    );
    expect(ids(next.newForYou)).toEqual(["a", "b"]);
    expect(next.newForYou[0]?.word).toBe("approve");
  });

  it("keeps a row in its band after it was seen", () => {
    const held = layoutOf(view([item("a"), item("b")]));
    const next = holdStill(held, view([item("b")], [item("a")]));
    expect(ids(next.newForYou)).toEqual(["a", "b"]);
    expect(next.seen).toEqual([]);
  });

  it("adds new rows at the end of their band and drops gone ones", () => {
    const held = layoutOf(view([item("a"), item("b")]));
    const next = holdStill(held, view([item("new"), item("b")]));
    expect(ids(next.newForYou)).toEqual(["b", "new"]);
  });
});
