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
 * Until the server answers, a sign-off is predicted to cover all of the
 * thread's work, so the row leaves at once.
 */
const PREDICTED_AT = Number.MAX_SAFE_INTEGER;

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
   * have replaced this client's predictions.
   */
  refresh(threadId: string): Promise<void>;
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
      // asking again while it's in flight just joins it, so keep reading.
      async refresh(threadId) {
        for (const wait of [0, ...RELEASE_RETRY_MS]) {
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          await Promise.all([
            refetchVerifications([threadId]),
            refetchLaters([threadId]),
          ]);
          const rows = rowsRef.current;
          if (
            rows.verifications?.[threadId]?.verifiedAt !== PREDICTED_AT &&
            rows.laters?.[threadId]?.laterAt !== PREDICTED_AT
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
  verify(threadId: string): Promise<void>;
  later(threadId: string): Promise<void>;
}

/**
 * Verify and Later, predicted at once. `refresh` reads the thread's sign-offs
 * again once the server has the write: the server's own refresh starts before
 * the write is acknowledged, and the prediction (which covers all future
 * work) would then stay until a reload, so the thread could never come back
 * in this client (#13, #25).
 */
export function useSignOffActions(
  refresh: (threadId: string) => Promise<void>,
): SignOffActions {
  const verify = experimental_useRpcMutation({
    contract: verificationRpcContract,
    method: "verify",
    optimistic: ({ threadId, client }, cache) => {
      cache.updateKey("verifications", threadId, () => ({
        threadId,
        verifiedAt: PREDICTED_AT,
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
        laterAt: PREDICTED_AT,
        client,
      }));
    },
  });
  return useMemo(
    () => ({
      async verify(threadId) {
        await verify.mutate({ threadId, client: currentClient() });
        void refresh(threadId);
      },
      async later(threadId) {
        await later.mutate({ threadId, client: currentClient() });
        void refresh(threadId);
      },
    }),
    [verify.mutate, later.mutate, refresh],
  );
}
