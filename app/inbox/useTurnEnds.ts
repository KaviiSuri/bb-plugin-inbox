// The classifier's verdicts (ADR 0009), read through the server's keyed rpc.
// The server refreshes a thread's read whenever it stores a new verdict.
import { useMemo, useRef } from "react";
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

export interface TurnEndReads {
  /** A row (or null for none) once read; missing while the read is open. */
  turnEnds: Readonly<Record<string, TurnEnd | null>>;
  /** When this client started waiting on each read still open. */
  waitingSince: Readonly<Record<string, number>>;
}

/**
 * Verdicts for the visible threads whose latest turn the Inbox asks about.
 * A failed read counts as no verdict, so the turn is a report once its grace
 * runs out; a read that never answers is bounded by `waitingSince`.
 */
export function useTurnEnds(
  threads: readonly PluginSidebarThread[],
  childCompletions: Readonly<Record<string, number | null>>,
  inboxStartedAt: number | null,
): TurnEndReads {
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
  // First time each still-open read was seen, kept across renders.
  const openSinceRef = useRef<Record<string, number>>({});
  return useMemo(() => {
    const turnEnds: Record<string, TurnEnd | null> = {};
    const waitingSince: Record<string, number> = {};
    const now = Date.now();
    for (const id of stableKeys) {
      const row = data?.[id];
      if (row !== undefined) turnEnds[id] = row;
      else if (error !== null) turnEnds[id] = null;
      else waitingSince[id] = openSinceRef.current[id] ?? now;
    }
    for (const id of overflow) turnEnds[id] = null;
    openSinceRef.current = waitingSince;
    return { turnEnds, waitingSince };
  }, [stableKeys, overflow, data, error]);
}
