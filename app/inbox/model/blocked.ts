// Blocked on you: a thread waiting on a question, a permission or a plan.
import type {
  PluginBrowserBbSdk,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { item, type InboxSnapshot, type Outcome } from "./types.js";

/** What `threads.interactions.list` returns; the SDK doesn't name the type. */
export type PendingInteractionList = Awaited<
  ReturnType<PluginBrowserBbSdk["threads"]["interactions"]["list"]>
>;
type PendingInteraction = PendingInteractionList[number];

/** What a thread's pending interaction asks of the human. */
export type PendingInteractionKind = "user_question" | "approval" | "plugin";

export interface PendingInteractionSummary {
  kind: PendingInteractionKind;
  /** The reason line, e.g. "Asks: which database?". */
  reason: string;
  /** For an approval, what it approves; a plan review makes a child `human`. */
  subject?: ApprovalSubject["kind"];
}

/**
 * The first still-pending interaction, as the word's kind and a reason line;
 * null when none is pending.
 */
export function summarizePendingInteractions(
  interactions: PendingInteractionList,
): PendingInteractionSummary | null {
  const pending = interactions.find((i) => i.status === "pending");
  return pending ? summarize(pending) : null;
}

function summarize(interaction: PendingInteraction): PendingInteractionSummary {
  const { payload } = interaction;
  switch (payload.kind) {
    case "user_question": {
      const prompt = payload.questions[0]?.prompt;
      return {
        kind: "user_question",
        reason: prompt ? `Asks: ${prompt}` : "Asks you a question",
      };
    }
    case "plugin":
      return { kind: "plugin", reason: payload.title };
    case "approval":
      return {
        kind: "approval",
        reason: approvalReason(payload.subject),
        subject: payload.subject.kind,
      };
    default:
      return { kind: "plugin", reason: "Waiting for you" };
  }
}

type ApprovalSubject = Extract<
  PendingInteraction["payload"],
  { kind: "approval" }
>["subject"];

function approvalReason(subject: ApprovalSubject): string {
  switch (subject.kind) {
    case "command":
      return `Wants to run ${subject.command}`;
    case "file_change":
      return "Wants to change files";
    case "permission_grant":
      return "Wants more permissions";
    case "plan":
      return "Has a plan for you to review";
    case "tool_use":
      return `Wants to use ${subject.presentation.title ?? subject.tool}`;
    default:
      return "Wants your approval";
  }
}

/** A pending interaction makes an item, even while the thread runs. */
export function blocked(
  thread: PluginSidebarThread,
  { interactions }: InboxSnapshot,
): Outcome | null {
  if (!thread.hasPendingInteraction) return null;
  const interaction = interactions[thread.id];
  return item({
    tier: "blocked",
    word: interaction?.kind === "approval" ? "approve" : "answer",
    reason: interaction?.reason ?? "Waiting for you",
  });
}
