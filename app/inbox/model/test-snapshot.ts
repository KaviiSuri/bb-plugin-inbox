// Shared fixtures for the inbox model's tests.
import type { PendingInteractionSummary } from "./blocked.js";
import type { InboxSnapshot } from "./types.js";

export { makeSidebarThread } from "../../model/fixtures.js";

export const NOW = 1_000_000;

export const QUESTION: PendingInteractionSummary = {
  kind: "user_question",
  reason: "Asks: which database?",
};

export function snapshot(overrides: Partial<InboxSnapshot> = {}): InboxSnapshot {
  return {
    threads: [],
    interactions: {},
    runtime: { running: {}, stoppedAt: {}, waitingForHostSince: {} },
    now: NOW,
    ...overrides,
  };
}
