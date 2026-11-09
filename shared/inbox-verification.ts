// Verifications and Laters (CONTEXT.md): the RPC contract between the
// plugin's server, which stores them (ADR 0007), and the Inbox tab.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/**
 * What a Verification covered, so later work can be scoped to what changed
 * since: the environment's head commit, the merge base it was compared with,
 * and each changed file's revision as `bb--git files` reports it.
 */
export const diffBaseSchema = z
  .object({
    headSha: z.string().nullable(),
    mergeBaseRef: z.string().nullable(),
    files: z.array(
      z.object({
        path: z.string(),
        revision: z.string(),
        /** Text at sign-off, including uncommitted work; absent on older bases. */
        content: z.string().optional(),
        /** Mode of this path at headSha, not at the branch's merge base. */
        headMode: z.string().regex(/^[0-7]{6}$/).optional(),
      }).strict(),
    ),
  })
  .strict();
export type DiffBase = z.infer<typeof diffBaseSchema>;

export const prChecksStateSchema = z.enum([
  "passing",
  "failing",
  "pending",
  "no_checks",
  "unknown",
]);
export type PrChecksState = z.infer<typeof prChecksStateSchema>;

/** The sign-off that clears a Verify item. Names a client, not a person. */
export const verificationSchema = z
  .object({
    threadId: z.string().min(1),
    verifiedAt: z.number(),
    client: z.string(),
    /** Null when git couldn't be read at the time (machine offline). */
    diffBase: diffBaseSchema.nullable(),
    /** Null when the thread had no pull request. */
    prChecksState: prChecksStateSchema.nullable(),
  })
  .strict();
export type Verification = z.infer<typeof verificationSchema>;

/** Out of sight, not verified, until the thread has something new. */
export const laterSchema = z
  .object({
    threadId: z.string().min(1),
    laterAt: z.number(),
    client: z.string(),
  })
  .strict();
export type Later = z.infer<typeof laterSchema>;

const keysInput = z.object({ keys: z.array(z.string().min(1)) }).strict();
const markInput = z
  .object({ threadId: z.string().min(1), client: z.string().max(200) })
  .strict();

/** The tag a thread's Verification and Later reads refresh on. */
export function signOffTag(threadId: string): string {
  return `sign-off:${threadId}`;
}

export const verificationRpcContract = defineRpcContract({
  verifications: {
    input: keysInput,
    output: z.record(z.string(), verificationSchema.nullable()),
    keyTags: (key) => [signOffTag(key)],
  },
  laters: {
    input: keysInput,
    output: z.record(z.string(), laterSchema.nullable()),
    keyTags: (key) => [signOffTag(key)],
  },
  /** When the Inbox started (ADR 0010); recorded once, on first run. */
  inboxStart: {
    input: z.null(),
    output: z.object({ startedAt: z.number() }).strict(),
  },
  verify: { input: markInput, output: verificationSchema },
  later: { input: markInput, output: laterSchema },
});
