import { describe, expect, it } from "vitest";
import { eventUsesGrilling } from "./grilling.js";

// A finished item, as `threads.events.list` returns it.
const completed = (item: Record<string, unknown>) => ({
  type: "item/completed",
  data: { item: { status: "completed", ...item } },
});

const userTurn = (input: unknown[]) => ({
  type: "client/turn/requested",
  data: { input },
});

// Events copied from live threads through `bb thread log --json`.
const LIVE = {
  // pi (thr_fry4mv3eju seq 209).
  piRead: {
    type: "item/completed",
    data: {
      providerThreadId: "pi_f97e44bb-8f66-4351-8f32-5242fc92c166",
      item: {
        type: "fileRead",
        id: "da7fc1ba58-i41",
        path: "/Users/kavii/.agents/skills/grilling/SKILL.md",
        cmd: "read { path: /Users/kavii/.agents/skills/grilling/... }",
        status: "completed",
      },
    },
  },
  // Codex gpt-6-luna (thr_32kzj24hjb seq 26), output trimmed.
  codexShellRead: {
    type: "item/completed",
    data: {
      providerThreadId: "01a1c9b8-1e16-75b2-b3d1-989375a4eee3",
      item: {
        type: "commandExecution",
        id: "da3bb9f829-i2",
        command: "/bin/zsh -lc 'cat /Users/kavii/.agents/skills/grilling/SKILL.md'",
        cwd: "/Users/kavii/.bb/plugins/environment-personal-workspace/host-data/workspaces/thr_32kzj24hjb",
        status: "completed",
        approvalStatus: null,
        aggregatedOutput: "---\nname: grilling\n…",
        presentation: { title: "cat /Users/kavii/.agents/skills/grilling/SKILL.md" },
      },
    },
  },
  // Claude Code haiku (thr_jytmedct3z seq 25 and 26): the load started, then
  // failed because that install has no grilling skill.
  claudeSkillStarted: {
    type: "item/started",
    data: {
      providerThreadId: "117157bc-83bc-419b-810d-4944b39386f5",
      item: {
        type: "toolCall",
        id: "da5154df80-i2",
        tool: "Skill",
        arguments: { skill: "grilling" },
        status: "pending",
        presentation: { title: "grilling" },
      },
    },
  },
  claudeSkillFailed: {
    type: "item/completed",
    data: {
      providerThreadId: "117157bc-83bc-419b-810d-4944b39386f5",
      item: {
        type: "toolCall",
        id: "da5154df80-i2",
        tool: "Skill",
        arguments: { skill: "grilling" },
        status: "failed",
        result: "<tool_use_error>Unknown skill: grilling</tool_use_error>",
        presentation: { title: "grilling" },
      },
    },
  },
} as const;

describe("eventUsesGrilling on live event shapes", () => {
  it("counts pi's completed read of the skill", () => {
    expect(eventUsesGrilling(LIVE.piRead)).toBe(true);
  });

  it("counts Codex's completed shell read of the skill", () => {
    expect(eventUsesGrilling(LIVE.codexShellRead)).toBe(true);
  });

  it("doesn't count Claude Code's skill load that only started, or failed", () => {
    expect(eventUsesGrilling(LIVE.claudeSkillStarted)).toBe(false);
    expect(eventUsesGrilling(LIVE.claudeSkillFailed)).toBe(false);
  });

  it("counts Claude Code's skill load once it completed", () => {
    const loaded = {
      ...LIVE.claudeSkillFailed,
      data: {
        ...LIVE.claudeSkillFailed.data,
        item: { ...LIVE.claudeSkillFailed.data.item, status: "completed", result: "Launching skill: grilling" },
      },
    };
    expect(eventUsesGrilling(loaded)).toBe(true);
  });
});

describe("eventUsesGrilling", () => {
  it.each([
    [
      "pi's read tool on the grilling skill",
      completed({ type: "fileRead", path: "/Users/me/.agents/skills/grilling/SKILL.md" }),
      true,
    ],
    [
      "a read of grill-with-docs",
      completed({ type: "fileRead", path: "/Users/me/.claude/skills/grill-with-docs/SKILL.md" }),
      true,
    ],
    [
      "a shell read of the grilling skill",
      completed({ type: "commandExecution", command: "cat ~/.agents/skills/grilling/SKILL.md" }),
      true,
    ],
    [
      "a read of another skill",
      completed({ type: "fileRead", path: "/Users/me/.agents/skills/tdd/SKILL.md" }),
      false,
    ],
    [
      "a command that only mentions grilling",
      completed({ type: "commandExecution", command: "bb thread search grilling" }),
      false,
    ],
    [
      "a file in a grilling folder that isn't the skill",
      completed({ type: "fileRead", path: "/repo/docs/grilling/notes.md" }),
      false,
    ],
    [
      "a skill tool call for grilling",
      completed({ type: "toolCall", tool: "Skill", arguments: { skill: "grilling" } }),
      true,
    ],
    [
      "a skill tool call for another skill",
      completed({ type: "toolCall", tool: "Skill", arguments: { skill: "tdd" } }),
      false,
    ],
    [
      "a non-skill tool whose argument says grilling",
      completed({ type: "toolCall", tool: "bash", arguments: { command: "grilling" } }),
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
