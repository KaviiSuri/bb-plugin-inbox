// The turn-end classifier's contract (ADRs 0008, 0009), shared by the server
// that stores verdicts (server/classifier/) and the Inbox that reads them
// (app/inbox/useTurnEnds.ts). Kept free of server-only imports so the app
// bundle can hold the contract itself, as a keyed query needs it.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const turnEndSchema = z
  .object({
    verdict: z.enum(["question", "report"]),
    // Who decided: the helper thread's model, or the heuristic.
    source: z.enum(["model", "heuristic"]),
    // Why the heuristic decided, when it did: no provider set, nothing to
    // read, a turn end found by the startup reconcile past its model budget,
    // or the helper thread failed, timed out or gave no clear answer.
    fallback: z
      .enum(["no-provider", "no-text", "startup", "failed", "timeout", "unparseable"])
      .nullable(),
    // Sticky: once a thread has used the grilling skill it stays true.
    grilling: z.boolean(),
    // The thread's `latestAttentionAt` for the turn end this verdict covers.
    // bb advances it on idle only for top-level threads, so it names a
    // top-level thread's turn; a child's stays at its creation.
    turnKey: z.number(),
    // The server time of the thread's latest `turn/completed` event when the
    // verdict was made, null when there was none or it couldn't be read. It
    // names a child's turn (#14: the Inbox dates child reports by it).
    // Records stored before #15 lack it.
    completedAt: z.number().nullable().default(null),
    classifiedAt: z.number(),
  })
  .strict();

export type TurnEnd = z.infer<typeof turnEndSchema>;

export const selectionSchema = z
  .object({
    providerId: z.string().min(1),
    model: z.string().min(1),
    reasoningLevel: z.string().min(1),
    serviceTier: z.string().min(1).optional(),
  })
  .strict();

export type ClassifierSelection = z.infer<typeof selectionSchema>;

/** The tag a thread's turn-end read refreshes on. */
export function turnEndTag(threadId: string): string {
  return `turn-end:${threadId}`;
}

export const turnEndRpcContract = defineRpcContract({
  // Keyed for `experimental_useRpcKeyedQuery`: one row per requested thread,
  // null when there's no verdict (never classified, or a helper thread).
  turnEnds: {
    input: z.object({ keys: z.array(z.string().min(1)).max(500) }).strict(),
    output: z.record(z.string(), turnEndSchema.nullable()),
    keyTags: (key) => [turnEndTag(key)],
  },
  getTurnEndClassifier: {
    input: z.null(),
    output: z.object({ selection: selectionSchema.nullable() }).strict(),
  },
  setTurnEndClassifier: {
    input: z.object({ selection: selectionSchema.nullable() }).strict(),
    output: z.object({ selection: selectionSchema.nullable() }).strict(),
  },
});
