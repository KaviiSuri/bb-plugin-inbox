import { describe, expect, it } from "vitest";
import { eventUsesGrilling } from "./grilling.js";

const started = (item: Record<string, unknown>) => ({
  type: "item/started",
  data: { item },
});

const userTurn = (input: unknown[]) => ({
  type: "client/turn/requested",
  data: { input },
});

describe("eventUsesGrilling", () => {
  it.each([
    [
      "pi's read tool on the grilling skill",
      started({ type: "fileRead", path: "/Users/me/.agents/skills/grilling/SKILL.md" }),
      true,
    ],
    [
      "a read of grill-with-docs",
      started({ type: "fileRead", path: "/Users/me/.claude/skills/grill-with-docs/SKILL.md" }),
      true,
    ],
    [
      "a shell read of the grilling skill",
      started({ type: "commandExecution", command: "cat ~/.agents/skills/grilling/SKILL.md" }),
      true,
    ],
    [
      "a read of another skill",
      started({ type: "fileRead", path: "/Users/me/.agents/skills/tdd/SKILL.md" }),
      false,
    ],
    [
      "a command that only mentions grilling",
      started({ type: "commandExecution", command: "bb thread search grilling" }),
      false,
    ],
    [
      "a file in a grilling folder that isn't the skill",
      started({ type: "fileRead", path: "/repo/docs/grilling/notes.md" }),
      false,
    ],
    [
      "a skill tool call for grilling",
      started({ type: "toolCall", tool: "Skill", arguments: { skill: "grilling" } }),
      true,
    ],
    [
      "a skill tool call for another skill",
      started({ type: "toolCall", tool: "Skill", arguments: { skill: "tdd" } }),
      false,
    ],
    [
      "a non-skill tool whose argument says grilling",
      started({ type: "toolCall", tool: "bash", arguments: { command: "grilling" } }),
      false,
    ],
    [
      "a user turn that types /grilling",
      userTurn([{ type: "text", text: "/grilling the inbox plan", mentions: [] }]),
      true,
    ],
    [
      "a user turn with a grilling skill command mention",
      userTurn([
        {
          type: "text",
          text: "please $grill-me",
          mentions: [
            {
              start: 7,
              end: 16,
              resource: { kind: "command", name: "grill-me", source: "skill", label: "grill-me" },
            },
          ],
        },
      ]),
      true,
    ],
    [
      "a user turn with a non-skill command named like grilling",
      userTurn([
        {
          type: "text",
          text: "run grill-me",
          mentions: [
            {
              start: 4,
              end: 12,
              resource: { kind: "command", name: "grill-me", source: "command", label: "grill-me" },
            },
          ],
        },
      ]),
      false,
    ],
    [
      "a user turn that only talks about grilling",
      userTurn([{ type: "text", text: "Don't use grilling here.", mentions: [] }]),
      false,
    ],
    ["an unrelated event", { type: "turn/completed", data: {} }, false],
  ] as const)("%s", (_name, event, expected) => {
    expect(eventUsesGrilling(event)).toBe(expected);
  });
});
