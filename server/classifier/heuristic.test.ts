import { describe, expect, it } from "vitest";
import { classifyTurnEnd } from "./heuristic.js";

describe("classifyTurnEnd heuristic", () => {
  it.each([
    ["no text at all", null, "report"],
    ["an empty message", "   \n", "report"],
    ["a plain report", "Pushed `feat/18` as `abc123`. All 40 tests pass.", "report"],
    ["a closing question", "I found two ways to do it.\n\nWhich one do you want?", "question"],
    ["a question wrapped in bold", "Done with the spike.\n\n**Should I open the PR now?**", "question"],
    ["a question followed by an emoji", "Ready to merge. Go ahead? 🙂", "question"],
    [
      "a question followed by its options",
      "Two options:\n\nWhich should I pick?\n\n1. Keep the KV store\n2. Move to SQLite",
      "question",
    ],
    [
      "a question with options in the same paragraph",
      "Which should I pick?\n- KV\n- SQLite",
      "question",
    ],
    [
      "an earlier question answered by the report",
      "Why did CI fail? A missing env var. I added it and CI is green.",
      "report",
    ],
    [
      "a question only inside a code block",
      "Here's the prompt I used:\n\n```\nDid the turn end with a question?\n```",
      "report",
    ],
    [
      "a question round only inside a code block",
      "Here's the template I'll use:\n\n```\n❓ **Q1** - **<title>**: <body>\n```\n\nDone.",
      "report",
    ],
    [
      "a question only inside a quote",
      "The issue asks:\n\n> Should failing checks be red?\n\nI kept them grey per ADR 0005.\n\n> Is that right?",
      "report",
    ],
    [
      "a report that ends on a list",
      "Changed files:\n\n- server.ts\n- server/classifier/heuristic.ts",
      "report",
    ],
    [
      "a grilling round that ends on a recommendation",
      "❓ **Q1** - **Storage**: KV or SQLite?\n\n➡️ KV, it avoids migration clashes.",
      "question",
    ],
    [
      "numbered Q labels without the emoji",
      "**Q1** - Where should verdicts live?\n\nRecommended: KV.",
      "question",
    ],
    ["a soft offer without a question mark", "All done. Let me know if you want more tests.", "report"],
  ] as const)("%s", (_name, text, expected) => {
    expect(classifyTurnEnd(text)).toBe(expected);
  });
});
