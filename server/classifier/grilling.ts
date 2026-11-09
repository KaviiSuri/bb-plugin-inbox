// Did a thread use the grilling skill? ADR 0008 makes that a `human`-audience
// signal. Read from the thread's raw events (`bb.sdk.threads.events.list`).
//
// Signals, by where they were confirmed:
// - pi's read tool: an `item/started` whose item is
//   `{ type: "fileRead", path: ".../grilling/SKILL.md" }` (seen on a live pi
//   thread, thr_fry4mv3eju seq 207).
// - a shell read of the skill file: a `commandExecution` item whose `command`
//   names `.../grilling/SKILL.md` (pi reads skills this way too, e.g.
//   thr_s7ij7ggswg seq 30 for other skills).
// - inferred, not seen live: a `toolCall` to a tool named like "Skill" (Claude
//   Code's skill tool) with a grill skill in its arguments, and a user turn
//   that invokes `/grilling` (a `command` mention with `source: "skill"`, or
//   text starting with the slash command).
//
// The skill family is matched by name: `grilling`, `grill-me`,
// `grill-with-docs`.

export const GRILLING_EVENT_TYPES = [
  "item/started",
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
  if (event.type === "item/started") return itemUsesGrilling(asRecord(data.item));
  if (event.type === "client/turn/requested") {
    return Array.isArray(data.input) && data.input.some(inputInvokesGrilling);
  }
  return false;
}

function itemUsesGrilling(item: Record<string, unknown> | null): boolean {
  if (item === null) return false;
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
