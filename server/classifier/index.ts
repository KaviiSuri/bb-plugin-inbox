import { createHash } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { eventUsesGrilling, GRILLING_EVENT_TYPES } from "./grilling.js";
import { classifyTurnEnd, type TurnEndVerdict } from "./heuristic.js";
import { createHelperRunner, type HelperOutcome } from "./helper.js";
import { defineSelectionSetting, selectionSchema } from "./selection.js";
import {
  createTurnEndStore,
  publicTurnEnd,
  turnEndSchema,
  type StoredTurnEnd,
  type TurnEnd,
} from "./store.js";

export { classifyTurnEnd } from "./heuristic.js";
export { TURN_ENDS_CHANNEL, type TurnEnd } from "./store.js";

// The server half of the turn-end classifier (issue #18, ADRs 0008 and 0009):
// on every `thread.idle`, decide whether the turn ended with a question for
// the human or a report, note whether the thread has used the grilling skill,
// and store both per thread for the inbox to read.

export const turnEndRpcContract = defineRpcContract({
  // Keyed for `experimental_useRpcKeyedQuery`: one row per requested thread,
  // null when there's no verdict (never classified, or a helper thread).
  turnEnds: {
    input: z.object({ keys: z.array(z.string().min(1)).max(500) }).strict(),
    output: z.record(z.string(), turnEndSchema.nullable()),
  },
  setTurnEndClassifier: {
    input: z.object({ selection: selectionSchema.nullable() }).strict(),
    output: z.object({ selection: selectionSchema.nullable() }).strict(),
  },
});

const WATERMARK_KV_KEY = "turnEnd:watermark";
const DEFAULT_HELPER_TIMEOUT_MS = 90_000;
const HELPER_CONCURRENCY = 2;
// Turn ends missed while the plugin was unloaded get the model at startup only
// up to this many; the rest use the heuristic. A first install uses the
// heuristic for all of them.
const STARTUP_MODEL_BUDGET = 10;
const LIST_PAGE = 200;
// The server refuses an events page over 100 rows.
const EVENTS_PAGE = 100;
const MAX_EVENT_PAGES = 100;

type Fallback = NonNullable<TurnEnd["fallback"]>;

interface ThreadFacts {
  id: string;
  status: string;
  visibility: string;
  archivedAt: number | null;
  originPluginId: string | null;
  latestAttentionAt: number;
}

export interface TurnEndClassifierOptions {
  helperTimeoutMs?: number;
}

export function registerTurnEndClassifier(
  bb: BbPluginApi,
  options: TurnEndClassifierOptions = {},
) {
  const store = createTurnEndStore(bb);
  const selection = defineSelectionSetting(bb);
  const runner = createHelperRunner(bb, {
    timeoutMs: options.helperTimeoutMs ?? DEFAULT_HELPER_TIMEOUT_MS,
  });
  const limit = createLimiter(HELPER_CONCURRENCY);
  const perThread = new Map<string, Promise<void>>();

  function classifiable(thread: ThreadFacts): boolean {
    return (
      !runner.isHelper(thread) &&
      thread.visibility !== "hidden" &&
      thread.archivedAt === null
    );
  }

  async function scanGrilling(
    threadId: string,
    previous: StoredTurnEnd | null,
  ): Promise<{ grilling: boolean; scannedSeq: number }> {
    let grilling = previous?.grilling ?? false;
    let scannedSeq = previous?.scannedSeq ?? 0;
    if (grilling) return { grilling, scannedSeq };
    try {
      for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
        const events = await bb.sdk.threads.events.list({
          threadId,
          afterSeq: String(scannedSeq),
          limit: String(EVENTS_PAGE),
          order: "asc",
          types: [...GRILLING_EVENT_TYPES],
        });
        for (const event of events) {
          scannedSeq = Math.max(scannedSeq, event.seq);
          if (eventUsesGrilling(event)) grilling = true;
        }
        if (grilling || events.length < EVENTS_PAGE) break;
      }
    } catch (error) {
      bb.log.warn(`could not read events of ${threadId}: ${describe(error)}`);
    }
    return { grilling, scannedSeq };
  }

  async function decide(
    thread: ThreadFacts,
    text: string | null,
    previous: StoredTurnEnd | null,
    useModel: boolean,
  ): Promise<{ verdict: TurnEndVerdict; source: TurnEnd["source"]; fallback: Fallback | null }> {
    const heuristic = (fallback: Fallback) => ({
      verdict: classifyTurnEnd(text),
      source: "heuristic" as const,
      fallback,
    });
    if (previous?.source === "model" && previous.textHash === hashText(text)) {
      return { verdict: previous.verdict, source: "model", fallback: null };
    }
    const chosen = await selection.get();
    if (chosen === null) return heuristic("no-provider");
    if (!text) return heuristic("no-text");
    if (!useModel) return heuristic("startup");
    const outcome: HelperOutcome = await limit(() =>
      runner.classify(thread.id, text, chosen),
    );
    if (outcome.kind === "verdict") {
      return { verdict: outcome.verdict, source: "model", fallback: null };
    }
    return heuristic(outcome.kind);
  }

  async function classifyNow(
    thread: ThreadFacts,
    text: string | null,
    useModel: boolean,
  ): Promise<void> {
    const previous = await store.get(thread.id);
    // An older turn end arriving late never replaces a newer verdict.
    if (previous && previous.turnKey > thread.latestAttentionAt) return;
    const { grilling, scannedSeq } = await scanGrilling(thread.id, previous);
    const decision = await decide(thread, text, previous, useModel);
    await store.put(thread.id, {
      ...decision,
      grilling,
      scannedSeq,
      turnKey: thread.latestAttentionAt,
      classifiedAt: Date.now(),
      textHash: hashText(text),
    });
  }

  // One classification per thread at a time, in arrival order, so a stored
  // record is never read and written by two classifications at once.
  function classify(thread: ThreadFacts, text: string | null, useModel: boolean) {
    const previous = perThread.get(thread.id) ?? Promise.resolve();
    const next = previous
      .then(() => classifyNow(thread, text, useModel))
      .catch((error) => {
        bb.log.warn(`could not classify ${thread.id}: ${describe(error)}`);
      });
    perThread.set(thread.id, next);
    void next.finally(() => {
      if (perThread.get(thread.id) === next) perThread.delete(thread.id);
    });
    return next;
  }

  async function reconcile(): Promise<void> {
    await runner.cleanUpLeftovers().catch((error) => {
      bb.log.warn(`could not clean up classifier helpers: ${describe(error)}`);
    });
    const watermark = await bb.storage.kv.get<number>(WATERMARK_KV_KEY);
    const startedAt = Date.now();
    let modelBudget = STARTUP_MODEL_BUDGET;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const page = await bb.sdk.threads.list({
        archived: false,
        limit: LIST_PAGE,
        offset,
      });
      for (const thread of page) {
        if (thread.status !== "idle" || !classifiable(thread)) continue;
        const stored = await store.get(thread.id);
        if (stored && stored.turnKey >= thread.latestAttentionAt) continue;
        const { output } = await bb.sdk.threads.output({ threadId: thread.id });
        const useModel =
          modelBudget > 0 &&
          watermark !== undefined &&
          thread.latestAttentionAt > watermark;
        if (useModel) modelBudget -= 1;
        await classify(thread, output, useModel);
      }
      if (page.length < LIST_PAGE) break;
    }
    await bb.storage.kv.set(WATERMARK_KV_KEY, startedAt);
  }

  bb.events.on("thread.idle", async ({ thread, lastAssistantText }) => {
    if (runner.isHelper(thread)) {
      runner.settle(thread.id, { kind: "idle", text: lastAssistantText });
      return;
    }
    if (!classifiable(thread)) return;
    await classify(thread, lastAssistantText, true);
    await bb.storage.kv.set(WATERMARK_KV_KEY, Date.now());
  });

  bb.events.on("thread.failed", ({ thread }) => {
    if (runner.isHelper(thread)) runner.settle(thread.id, { kind: "failed" });
  });

  bb.events.on("thread.deleted", async ({ thread }) => {
    await store.remove(thread.id);
  });

  bb.rpc.register(turnEndRpcContract, {
    async turnEnds({ keys }) {
      const rows: Record<string, TurnEnd | null> = {};
      await Promise.all(
        keys.map(async (threadId) => {
          const stored = await store.get(threadId);
          rows[threadId] = stored === null ? null : publicTurnEnd(stored);
        }),
      );
      return rows;
    },
    async setTurnEndClassifier({ selection: next }) {
      await selection.set(next);
      return { selection: await selection.get() };
    },
  });

  bb.onDispose(() => runner.abandonAll());

  const ready = reconcile().catch((error) => {
    bb.log.warn(`turn-end reconcile failed: ${describe(error)}`);
  });

  return { ready };
}

function createLimiter(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    // A finished task hands its slot straight to the next queued one.
    if (running >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      running += 1;
    }
    try {
      return await task();
    } finally {
      const next = queue.shift();
      if (next) next();
      else running -= 1;
    }
  };
}

function hashText(text: string | null): string {
  return createHash("sha256").update(text ?? "").digest("hex");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
