// Child completion is not latestAttentionAt: bb advances that on a successful
// idle only for top-level threads. Read the server-stamped turn/completed
// event instead. updatedAt is only an invalidation key (rename/read change it).
import { useEffect, useMemo, useState } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { isRunning } from "./model/running.js";

type Read = { version: number; at: number | null };

export function useChildCompletions(
  threads: readonly PluginSidebarThread[],
): Readonly<Record<string, number | null>> {
  const sdk = useSdk();
  const [fetched, setFetched] = useState<Readonly<Record<string, Read>>>({});
  const candidates = threads.filter(
    (t) => t.parentThreadId && !t.isHidden && !t.isArchived && !isRunning(t),
  );
  const key = candidates.map((t) => `${t.id}@${t.updatedAt}`).join(",");
  useEffect(() => {
    const controller = new AbortController();
    const pending = candidates.filter((t) => fetched[t.id]?.version !== t.updatedAt);
    // Bound concurrent reads without ever treating a failed read as new work.
    async function worker() {
      while (!controller.signal.aborted) {
        const thread = pending.shift();
        if (!thread) return;
        try {
          const events = await sdk.threads.events.list({
            threadId: thread.id,
            types: ["turn/completed"],
            order: "desc",
            limit: "1",
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setFetched((current) => ({
            ...current,
            [thread.id]: { version: thread.updatedAt, at: events[0]?.createdAt ?? null },
          }));
        } catch {
          // Keep unknown; retry on the next sidebar change or remount.
        }
      }
    }
    for (let i = 0; i < Math.min(4, pending.length); i++) void worker();
    return () => controller.abort();
    // Versioned by sidebar updates, not by this hook's own state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, key]);

  return useMemo(() => {
    const result: Record<string, number | null> = {};
    for (const thread of candidates) {
      const read = fetched[thread.id];
      result[thread.id] = read?.version === thread.updatedAt ? read.at : null;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetched]);
}
