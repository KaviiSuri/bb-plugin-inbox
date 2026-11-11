// The classifier's verdicts (ADR 0009), read through the server's keyed rpc.
// The server refreshes a thread's read whenever it stores a new verdict.
import { useMemo } from "react";
import {
  experimental_useRpcKeyedQuery,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  turnEndRpcContract,
  type TurnEnd,
} from "../../shared/inbox-turn-end.js";
import { needsTurnEnd, turnEndedAt } from "./model/index.js";

/** The rpc takes at most this many keys per read. */
const MAX_TURN_END_KEYS = 500;

/**
 * Verdicts for the visible threads whose latest turn the Inbox asks about:
 * a row (or null for none) once read, missing while loading. A failed read
 * counts as no verdict, so the turn is a report once its grace runs out.
 */
export function useTurnEnds(
  threads: readonly PluginSidebarThread[],
  childCompletions: Readonly<Record<string, number | null>>,
  inboxStartedAt: number | null,
): Readonly<Record<string, TurnEnd | null>> {
  const { keys, overflow } = useMemo(() => {
    const facts = { childCompletions, inboxStartedAt };
    const candidates = threads
      .filter((t) => !t.isHidden && !t.isArchived && needsTurnEnd(t, facts))
      .sort((a, b) => turnEndedAt(b, facts)! - turnEndedAt(a, facts)!)
      .map((t) => t.id);
    return {
      keys: candidates.slice(0, MAX_TURN_END_KEYS).sort(),
      overflow: candidates.slice(MAX_TURN_END_KEYS),
    };
  }, [threads, childCompletions, inboxStartedAt]);
  const keysId = keys.join(",");
  const stableKeys = useMemo(() => keys, [keysId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error } = experimental_useRpcKeyedQuery({
    contract: turnEndRpcContract,
    method: "turnEnds",
    keys: stableKeys,
  });
  return useMemo(() => {
    const result: Record<string, TurnEnd | null> = {};
    for (const id of stableKeys) {
      const row = data?.[id];
      if (row !== undefined) result[id] = row;
      else if (error !== null) result[id] = null;
    }
    for (const id of overflow) result[id] = null;
    return result;
  }, [stableKeys, overflow, data, error]);
}
