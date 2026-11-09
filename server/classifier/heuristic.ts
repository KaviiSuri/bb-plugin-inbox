// The deterministic stand-in for the turn-end classifier (ADR 0009): does the
// last message end with a question addressed to the user? Used when no
// classifier provider is set, and whenever the helper thread fails.

export type TurnEndVerdict = "question" | "report";

// Grilling-style rounds ("❓ **Q1** - ...") end on a recommended answer, not a
// question mark, so they are matched by shape anywhere in the message.
const QUESTION_ROUND = /❓|^\s*(?:\*\*)?Q\d+(?:\*\*)?\s*[-–—:]/mu;

// Closing decoration that can follow the final question mark.
const TRAILING_DECORATION = /[\s*_`'"’”)\]\p{Extended_Pictographic}️]+$/u;

const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)]|[a-z][.)])\s+/iu;

export function classifyTurnEnd(text: string | null | undefined): TurnEndVerdict {
  if (!text) return "report";
  const prose = stripCodeBlocks(text);
  if (QUESTION_ROUND.test(prose)) return "question";
  const paragraph = lastProseParagraph(prose);
  if (paragraph === null) return "report";
  return paragraph.replace(TRAILING_DECORATION, "").endsWith("?")
    ? "question"
    : "report";
}

function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/gu, "\n\n");
}

// The last paragraph that isn't a quote or a list of options. "Which one?"
// followed by a numbered list of choices still ends with a question.
function lastProseParagraph(text: string): string | null {
  const paragraphs = text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const lines = paragraphs[index]!.split("\n").map((line) => line.trim());
    if (lines.every((line) => line.startsWith(">"))) continue;
    if (lines.every((line) => LIST_ITEM.test(line))) {
      if (index === paragraphs.length - 1) continue;
      return null;
    }
    const prose = lines.filter((line) => !LIST_ITEM.test(line));
    if (prose.length === 0) continue;
    return prose.at(-1)!;
  }
  return null;
}
