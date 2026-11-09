// Verifications and Laters from the plugin's server, kept current across
// clients: the server invalidates a thread's reads on every write.
import { useMemo, useRef } from "react";
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

export interface SignOffs {
  verifications: Readonly<Record<string, Verification>>;
  laters: Readonly<Record<string, Later>>;
  /** Both reads have answered at least once. */
  loaded: boolean;
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
  return useMemo(
    () => ({
      verifications: present(verifications.data),
      laters: present(laters.data),
      loaded,
    }),
    [verifications.data, laters.data, loaded],
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

export function useSignOffActions(): SignOffActions {
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
      },
      async later(threadId) {
        await later.mutate({ threadId, client: currentClient() });
      },
    }),
    [verify.mutate, later.mutate],
  );
}
