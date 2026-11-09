// Git file contents used for sign-off snapshots and exact later comparisons.
// Copy of bb--git fileSide's public read contract (SDK 0.6.133).
import { z } from "zod";

export const gitFileSideSchema = z.union([
  z.object({
    outcome: z.literal("available"),
    file: z.object({ content: z.string(), contentEncoding: z.enum(["utf8", "base64"]) }),
  }),
  z.object({ outcome: z.literal("unavailable"), code: z.string() }),
]);

/** Bound stored snapshots and synchronous text comparisons. */
export const MAX_SNAPSHOT_BYTES = 100_000;
export const MAX_SNAPSHOT_FILES = 100;

export function textFromSide(row: z.infer<typeof gitFileSideSchema>): string | undefined {
  if (row.outcome === "unavailable") return row.code === "ENOENT" ? "" : undefined;
  return row.file.contentEncoding === "utf8" && row.file.content.length <= MAX_SNAPSHOT_BYTES
    ? row.file.content
    : undefined;
}
