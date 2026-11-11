// Did a thread use the grilling skill? ADR 0008 makes that a `human`-audience
// signal. Read from the thread's raw events (`bb.sdk.threads.events.list`).
//
// A skill counts once its load completed: an `item/completed` whose item's
// `status` is "completed". `item/started` also fires for a load that then
// fails, as Claude Code's does for a skill it doesn't have. Signals, each seen
// live through `bb thread log --json` (2026-11-11 unless noted):
// - pi's read tool: `{ type: "fileRead", path: ".../grilling/SKILL.md" }`
//   (thr_fry4mv3eju seq 209, 2026-11-09).
// - Codex's shell read: `{ type: "commandExecution", command: "/bin/zsh -lc
//   'cat .../grilling/SKILL.md'" }` (thr_32kzj24hjb seq 26).
// - Claude Code's skill tool: `{ type: "toolCall", tool: "Skill",
//   arguments: { skill: "grilling" } }` (thr_jytmedct3z seq 25-26; that load
//   failed, `status: "failed"`, so it doesn't count).
// - inferred, not seen live: a user turn that invokes `/grilling` (a `command`
//   mention with `source: "skill"`, or text starting with the slash command).
//
// The skill family is matched by name: `grilling`, `grill-me`,
// `grill-with-docs`.

export const GRILLING_EVENT_TYPES = [
  "item/completed",
  "client/turn/requested",
] as const;

const GRILL_SKILL_NAME = /^grill(?:ing|-[a-z0-9-]+)?$/u;
const GRILL_SKILL_FILE = /(?:^|[\\/])grill(?:ing|-[a-z0-9-]+)?[\\/]SKILL\.md\b/u;
const GRILL_SLASH_COMMAND = /^\s*[/$]grill(?:ing|-[a-z0-9-]+)?\b/u;

interface EventLike {
  type: string;
  data?: unknown;
}

export function eventUsesGrilling(event: EventLike): boolean {
  const data = asRecord(event.data);
  if (data === null) return false;
  if (event.type === "item/completed") return itemUsesGrilling(asRecord(data.item));
  if (event.type === "client/turn/requested") {
    return Array.isArray(data.input) && data.input.some(inputInvokesGrilling);
  }
  return false;
}

function itemUsesGrilling(item: Record<string, unknown> | null): boolean {
  if (item === null || item.status !== "completed") return false;
  switch (item.type) {
    case "fileRead":
      return typeof item.path === "string" && GRILL_SKILL_FILE.test(item.path);
    case "commandExecution":
      return (
        typeof item.command === "string" && GRILL_SKILL_FILE.test(item.command)
      );
    case "toolCall":
      return (
        typeof item.tool === "string" &&
        /skill/iu.test(item.tool) &&
        Object.values(asRecord(item.arguments) ?? {}).some(
          (value) =>
            typeof value === "string" &&
            (GRILL_SKILL_NAME.test(value.trim().replace(/^\//u, "")) ||
              GRILL_SKILL_FILE.test(value)),
        )
      );
    default:
      return false;
  }
}

function inputInvokesGrilling(part: unknown): boolean {
  const input = asRecord(part);
  if (input === null || input.type !== "text") return false;
  if (typeof input.text === "string" && GRILL_SLASH_COMMAND.test(input.text)) {
    return true;
  }
  if (!Array.isArray(input.mentions)) return false;
  return input.mentions.some((mention) => {
    const target = asRecord(asRecord(mention)?.resource) ?? asRecord(mention);
    return (
      target !== null &&
      target.kind === "command" &&
      target.source === "skill" &&
      typeof target.name === "string" &&
      GRILL_SKILL_NAME.test(target.name)
    );
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
