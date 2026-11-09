// The opened row's Audience lines (ADRs 0002, 0008): for a child with its own
// item, its parent and why it got the item; for any item, the news of the
// `parent`-audience children folded into it, each child's report fetched
// only while the row is open.
import { useEffect, useState } from "react";
import { ThreadTitle, useSdk } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { FoldedChild, InboxItem } from "./model/index.js";

/** Phone (drawer) widths get 40px tap targets, as on the item rows. */
const CHILD_ROW_CLASS = "min-h-[var(--bb-sidebar-row-height)] max-md:min-h-10";

/** A child with its own item: which parent it belongs to, and why. */
export function AudienceLines({ item }: { item: InboxItem }) {
  if (!item.parentThreadId) return null;
  return (
    <>
      <span
        data-inbox-parent=""
        className="flex min-w-0 gap-1 text-xs text-muted-foreground"
      >
        <span className="shrink-0">From</span>
        <span className="min-w-0 truncate">
          <ThreadTitle threadId={item.parentThreadId} />
        </span>
      </span>
      {item.audienceReason ? (
        <span
          data-inbox-audience=""
          className="text-xs break-words text-subtle-foreground"
        >
          {item.audienceReason}
        </span>
      ) : null}
    </>
  );
}

const STATE_WORD: Readonly<Record<FoldedChild["state"], string>> = {
  reported: "reported",
  failed: "failed",
  waiting: "approve",
};

/** The folded children's news: each child, its state, and its report. */
export function FoldedChildren({
  item,
  onOpenThread,
}: {
  item: InboxItem;
  onOpenThread: (threadId: string) => void;
}) {
  const folded = item.folded ?? [];
  const reports = useChildReports(
    folded.filter((child) => child.state === "reported"),
  );
  if (folded.length === 0) return null;
  return (
    <ul aria-label="Helpers" className="-ml-2.5 flex flex-col gap-0.5">
      {folded.map((child) => {
        // A failure or prompt the reason line already names isn't repeated.
        const report =
          child.state === "reported"
            ? reports[child.threadId]
            : item.reason.endsWith(child.reason)
              ? null
              : child.reason;
        return (
          <li key={child.threadId} data-inbox-folded={child.threadId}>
            <button
              type="button"
              aria-label={`${child.title}: ${STATE_WORD[child.state]}`}
              onClick={() => onOpenThread(child.threadId)}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-xs text-sidebar-foreground hover:bg-state-hover max-md:text-sm",
                CHILD_ROW_CLASS,
              )}
            >
              <span className="bb-thread-title min-w-0 flex-1 truncate">
                <ThreadTitle threadId={child.threadId} />
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  child.state === "failed"
                    ? "text-destructive"
                    : child.state === "waiting"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-subtle-foreground",
                )}
              >
                {STATE_WORD[child.state]}
              </span>
            </button>
            {report ? (
              <p className="line-clamp-4 px-2.5 pb-1 text-xs break-words whitespace-pre-line text-muted-foreground">
                {report}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Each reported child's last output (`threads.output`), fetched once per
 * report while the row is open; missing until it answers or if it fails.
 */
function useChildReports(
  children: readonly FoldedChild[],
): Readonly<Record<string, string>> {
  const sdk = useSdk();
  const [fetched, setFetched] = useState<
    Readonly<Record<string, { at: number; output: string | null }>>
  >({});
  const key = children.map((c) => `${c.threadId}@${c.attentionAt}`).join(",");

  useEffect(() => {
    const controller = new AbortController();
    for (const child of children) {
      if (fetched[child.threadId]?.at === child.attentionAt) continue;
      sdk.threads
        .output({ threadId: child.threadId, signal: controller.signal })
        .then(({ output }) => {
          setFetched((current) => ({
            ...current,
            [child.threadId]: { at: child.attentionAt, output },
          }));
        })
        .catch(() => {
          // Leave the child without a report; reopening the row retries.
        });
    }
    return () => controller.abort();
    // Keyed on the children's reports, not on `fetched`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, key]);

  const reports: Record<string, string> = {};
  for (const child of children) {
    const output = fetched[child.threadId]?.output?.trim();
    if (output) reports[child.threadId] = output;
  }
  return reports;
}
