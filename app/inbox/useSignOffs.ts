// Verifications and Laters from the plugin's server, kept current across
// clients: the server invalidates a thread's reads on every write.
import { useEffect, useMemo, useRef } from "react";
import {
  experimental_useRpcKeyedQuery,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
} from "@get-bb/plugin-sdk/app";
import {
  verificationRpcContract,
  type Later,
  type Verification,
} from "../../shared/inbox-verification.js";
import { currentClient } from "./client-name.js";

/**
 * Waits between reads of a signed-off thread while its prediction is still
 * showing, about 25 seconds in all.
 */
const RELEASE_RETRY_MS = [50, 100, 200, 400, 800, 1_600, 3_200, 6_400, 12_800];

export interface SignOffs {
  verifications: Readonly<Record<string, Verification>>;
  laters: Readonly<Record<string, Later>>;
  /** Both reads have answered at least once. */
  loaded: boolean;
  /**
   * Reads one thread's Verification and Later again, until the server's rows
   * have replaced this client's prediction, dated `predictedAt`.
   */
  refresh(threadId: string, predictedAt: number): Promise<void>;
}

export function useSignOffs(threadIds: readonly string[]): SignOffs {
  const verifications = experimental_useRpcKeyedQuery({
    contract: verificationRpcContract,
    method: "verifications",
    keys: threadIds,
  });
  const laters = experimental_useRpcKeyedQuery({
    contract: verificationRpcContract,
    method: "laters",
    keys: threadIds,
  });
  // Latched: a new thread's missing row mustn't blank the whole Inbox.
  const loadedRef = useRef(false);
  if (!verifications.isLoading && !laters.isLoading) loadedRef.current = true;
  const loaded = loadedRef.current;
  const { refetchKeys: refetchVerifications } = verifications;
  const { refetchKeys: refetchLaters } = laters;
  const rowsRef = useRef({ verifications: verifications.data, laters: laters.data });
  useEffect(() => {
    rowsRef.current = { verifications: verifications.data, laters: laters.data };
  }, [verifications.data, laters.data]);
  return useMemo(
    () => ({
      verifications: present(verifications.data),
      laters: present(laters.data),
      loaded,
      // A read only releases a prediction if it started after the write was
      // acknowledged. The server's own refresh usually starts before that, and
      // asking again while it's in flight just joins it, so keep reading: the
      // server's Verification carries the diff base that scopes a return.
      async refresh(threadId, predictedAt) {
        for (const wait of [0, ...RELEASE_RETRY_MS]) {
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          await Promise.all([
            refetchVerifications([threadId]),
            refetchLaters([threadId]),
          ]);
          const rows = rowsRef.current;
          if (
            rows.verifications?.[threadId]?.verifiedAt !== predictedAt &&
            rows.laters?.[threadId]?.laterAt !== predictedAt
          ) {
            return;
          }
        }
      },
    }),
    [verifications.data, laters.data, loaded, refetchVerifications, refetchLaters],
  );
}

function present<T>(
  rows: Readonly<Record<string, T | null>> | undefined,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, row] of Object.entries(rows ?? {})) {
    if (row) out[id] = row;
  }
  return out;
}

/** When the Inbox started (ADR 0010); null until the server answers. */
export function useInboxStart(): number | null {
  const { data } = experimental_useRpcQuery({
    contract: verificationRpcContract,
    method: "inboxStart",
    input: null,
  });
  return data?.startedAt ?? null;
}

export interface SignOffActions {
  /**
   * `coveredAt` is the latest attention the row showed; any newer work
   * brings the thread back even if the server's row never arrives here.
   */
  verify(threadId: string, coveredAt: number): Promise<void>;
  later(threadId: string, coveredAt: number): Promise<void>;
}

/**
 * Verify and Later, predicted at once. The prediction covers only the work
 * the row showed, dated at its attention, never future work: the server's row
 * can be slow to replace it, or never arrive (#25). `refresh` then reads the
 * thread's sign-offs until the server's rows replace it.
 */
export function useSignOffActions(
  refresh: (threadId: string, predictedAt: number) => Promise<void>,
): SignOffActions {
  // Read by the optimistic updates, which only get the write's input.
  const coveredRef = useRef(new Map<string, number>());
  const covered = (threadId: string) => coveredRef.current.get(threadId) ?? 0;
  const verify = experimental_useRpcMutation({
    contract: verificationRpcContract,
    method: "verify",
    optimistic: ({ threadId, client }, cache) => {
      cache.updateKey("verifications", threadId, () => ({
        threadId,
        verifiedAt: covered(threadId),
        client,
        diffBase: null,
        prChecksState: null,
      }));
    },
  });
  const later = experimental_useRpcMutation({
    contract: verificationRpcContract,
    method: "later",
    optimistic: ({ threadId, client }, cache) => {
      cache.updateKey("laters", threadId, () => ({
        threadId,
        laterAt: covered(threadId),
        client,
      }));
    },
  });
  return useMemo(
    () => ({
      async verify(threadId, coveredAt) {
        coveredRef.current.set(threadId, coveredAt);
        await verify.mutate({ threadId, client: currentClient() });
        void refresh(threadId, coveredAt);
      },
      async later(threadId, coveredAt) {
        coveredRef.current.set(threadId, coveredAt);
        await later.mutate({ threadId, client: currentClient() });
        void refresh(threadId, coveredAt);
      },
    }),
    [verify.mutate, later.mutate, refresh],
  );
}
