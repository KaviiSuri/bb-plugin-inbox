import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "../../server.js";
import { registerTurnEndClassifier, TURN_ENDS_CHANNEL } from "./index.js";

const PLUGIN_ID = "inbox";

const SELECTION = {
  providerId: "claude-code",
  model: "claude-haiku-5-5",
  reasoningLevel: "low",
};

type Thread = ReturnType<typeof makeThreadResponse>;
type EventRow = { seq: number; type: string; data: unknown };

interface Setup {
  provider?: boolean;
  watermark?: number;
  threads?: Thread[];
  leftoverHelpers?: Thread[];
  outputs?: Record<string, string | null>;
  events?: Record<string, EventRow[]>;
  spawn?: () => Promise<Thread>;
}

function thread(overrides: Partial<Thread> = {}): Thread {
  return makeThreadResponse({
    id: "thr_work",
    status: "idle",
    visibility: "visible",
    originPluginId: null,
    archivedAt: null,
    latestAttentionAt: 1_000,
    ...overrides,
  });
}

let helperCount = 0;
function helperThread(id = `thr_helper${(helperCount += 1)}`): Thread {
  return thread({
    id,
    visibility: "hidden",
    originPluginId: PLUGIN_ID,
    projectId: "proj_personal",
  });
}

async function setup(options: Setup = {}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: PLUGIN_ID,
    settings: options.provider
      ? { turnEndClassifier: JSON.stringify(SELECTION) }
      : {},
    sdk: {
      projects: {
        list: async () =>
          [
            { id: "proj_code", kind: "standard" },
            { id: "proj_personal", kind: "personal" },
          ] as never,
      },
      threads: {
        list: async (args?: { originPluginId?: string; offset?: number }) => {
          if (args?.originPluginId) return options.leftoverHelpers ?? [];
          return (args?.offset ?? 0) === 0 ? (options.threads ?? []) : [];
        },
        output: async ({ threadId }: { threadId: string }) => ({
          output: options.outputs?.[threadId] ?? null,
        }),
        spawn: options.spawn ?? (async () => helperThread()),
        archive: async () => ({ threads: [] }) as never,
        stop: async () => ({ ok: true as const }),
        events: {
          list: async ({ threadId, afterSeq }: { threadId: string; afterSeq?: string }) =>
            (options.events?.[threadId] ?? []).filter(
              (event) => event.seq > Number(afterSeq ?? 0),
            ) as never,
        },
      },
    },
  });
  if (options.watermark !== undefined) {
    await bb.storage.kv.set("turnEnd:watermark", options.watermark);
  }
  return { bb, harness };
}

async function start(options: Setup = {}, helperTimeoutMs = 2_000) {
  const host = await setup(options);
  const { ready } = registerTurnEndClassifier(host.bb, { helperTimeoutMs });
  await ready;
  return host;
}

type Host = Awaited<ReturnType<typeof setup>>;

function turnEnds(host: Host, keys: string[]) {
  return host.harness.behavior.callRpc("turnEnds", { keys }) as Promise<
    Record<string, Record<string, unknown> | null>
  >;
}

function spawnCalls(host: Host) {
  return host.harness.inspection.sdk.callsTo("threads.spawn") as [
    Record<string, unknown>,
  ][];
}

// Emit a turn end that needs the helper; the handler waits on the helper, so
// the test answers for it before awaiting.
async function idleWithHelper(
  host: Host,
  work: Thread,
  text: string,
  answer: (helperId: string) => Promise<unknown>,
) {
  const pending = host.harness.behavior.emitThreadEvent("thread.idle", {
    thread: work,
    lastAssistantText: text,
  });
  const before = spawnCalls(host).length;
  await vi.waitFor(() => expect(spawnCalls(host).length).toBeGreaterThan(before));
  const helperId = spawned.at(-1)!.id;
  await answer(helperId);
  await pending;
  return helperId;
}

// Helpers spawned by `recordingSpawn`, newest last.
const spawned: Thread[] = [];

function recordingSpawn(): () => Promise<Thread> {
  spawned.length = 0;
  return async () => {
    const helper = helperThread();
    spawned.push(helper);
    return helper;
  };
}

describe("turn-end classifier: helper thread on the configured provider", () => {
  it("spawns a hidden helper on the configured provider and model, stores its answer, and retires it", async () => {
    const host = await start({ provider: true, spawn: recordingSpawn() });
    const work = thread({ id: "thr_work", latestAttentionAt: 2_000 });

    const helperId = await idleWithHelper(host, work, "Pushed the branch.", (id) =>
      host.harness.behavior.emitThreadEvent("thread.idle", {
        thread: helperThread(id),
        lastAssistantText: "QUESTION",
      }),
    );

    const [[spawnArgs]] = spawnCalls(host);
    expect(spawnArgs).toMatchObject({
      providerId: "claude-code",
      model: "claude-haiku-5-5",
      reasoningLevel: "low",
      visibility: "hidden",
      projectId: "proj_personal",
      environment: { type: "host", workspace: { type: "personal" } },
      pluginMetadata: { role: "turn-end-classifier", forThreadId: "thr_work" },
    });
    expect(String(spawnArgs.prompt)).toContain("Pushed the branch.");

    // The model said QUESTION though the heuristic would say report.
    await expect(turnEnds(host, ["thr_work"])).resolves.toEqual({
      thr_work: {
        verdict: "question",
        source: "model",
        fallback: null,
        grilling: false,
        turnKey: 2_000,
        classifiedAt: expect.any(Number),
      },
    });
    expect(host.harness.inspection.sdk.callsTo("threads.archive")).toEqual([
      [{ threadId: helperId }],
    ]);
    expect(host.harness.inspection.sdk.callsTo("threads.stop")).toEqual([
      [{ threadId: helperId }],
    ]);
    expect(host.harness.realtimeSignals).toContainEqual({
      channel: TURN_ENDS_CHANNEL,
      payload: { threadIds: ["thr_work"] },
    });
  });

  it("reads an answer from a helper that went idle before spawn returned", async () => {
    const helper = helperThread("thr_fast_helper");
    let hostRef: Host | null = null;
    const host = await start({
      provider: true,
      spawn: async () => {
        await hostRef!.harness.behavior.emitThreadEvent("thread.idle", {
          thread: helper,
          lastAssistantText: "question",
        });
        return helper;
      },
    });
    hostRef = host;
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(),
      lastAssistantText: "Done.",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "question", source: "model" },
    });
  });

  it("doesn't pay for the same turn end twice", async () => {
    const host = await start({ provider: true, spawn: recordingSpawn() });
    await idleWithHelper(host, thread({ latestAttentionAt: 1 }), "Merged.", (id) =>
      host.harness.behavior.emitThreadEvent("thread.idle", {
        thread: helperThread(id),
        lastAssistantText: "REPORT",
      }),
    );
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 2 }),
      lastAssistantText: "Merged.",
    });
    expect(spawnCalls(host)).toHaveLength(1);
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "report", source: "model", turnKey: 2 },
    });
  });
});

describe("turn-end classifier: ordering", () => {
  it("keeps the newer verdict when an older turn end arrives late", async () => {
    const host = await start();
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 20 }),
      lastAssistantText: "Merged.",
    });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 10 }),
      lastAssistantText: "Should I merge?",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "report", turnKey: 20 },
    });
  });
});

describe("turn-end classifier: the heuristic decides", () => {
  it("uses the heuristic and spawns nothing when no provider is set", async () => {
    const host = await start({ provider: false });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(),
      lastAssistantText: "Two options. Which do you want?",
    });
    expect(spawnCalls(host)).toHaveLength(0);
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "question", source: "heuristic", fallback: "no-provider" },
    });
  });

  it("falls back to the heuristic when the helper thread fails, and still retires it", async () => {
    const host = await start({ provider: true, spawn: recordingSpawn() });
    const helperId = await idleWithHelper(
      host,
      thread(),
      "Should I merge it?",
      (id) =>
        host.harness.behavior.emitThreadEvent("thread.failed", {
          thread: helperThread(id),
          error: "provider crashed",
        }),
    );
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "question", source: "heuristic", fallback: "failed" },
    });
    expect(host.harness.inspection.sdk.callsTo("threads.archive")).toEqual([
      [{ threadId: helperId }],
    ]);
    expect(host.harness.inspection.sdk.callsTo("threads.stop")).toEqual([
      [{ threadId: helperId }],
    ]);
  });

  it("falls back to the heuristic when the helper can't be spawned", async () => {
    const host = await start({
      provider: true,
      spawn: async () => {
        throw new Error("provider not logged in");
      },
    });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(),
      lastAssistantText: "All green.",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "report", source: "heuristic", fallback: "failed" },
    });
  });

  it("falls back to the heuristic when the helper times out, and still retires it", async () => {
    const host = await start({ provider: true, spawn: recordingSpawn() }, 30);
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(),
      lastAssistantText: "Ready for review?",
    });
    const helperId = spawned.at(-1)!.id;
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "question", source: "heuristic", fallback: "timeout" },
    });
    expect(host.harness.inspection.sdk.callsTo("threads.archive")).toEqual([
      [{ threadId: helperId }],
    ]);
    expect(host.harness.inspection.sdk.callsTo("threads.stop")).toEqual([
      [{ threadId: helperId }],
    ]);
  });

  it("falls back to the heuristic when the helper's answer is neither word", async () => {
    const host = await start({ provider: true, spawn: recordingSpawn() });
    await idleWithHelper(host, thread(), "Shipped.", (id) =>
      host.harness.behavior.emitThreadEvent("thread.idle", {
        thread: helperThread(id),
        lastAssistantText: "I'm not sure.",
      }),
    );
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "report", source: "heuristic", fallback: "unparseable" },
    });
  });
});

describe("turn-end classifier: grilling-skill use", () => {
  const grillingRead: EventRow = {
    seq: 207,
    type: "item/started",
    data: {
      item: {
        type: "fileRead",
        id: "i41",
        path: "/Users/me/.agents/skills/grilling/SKILL.md",
        status: "pending",
      },
    },
  };

  it("records that a thread read the grilling skill, and keeps it on later turns", async () => {
    const events: Record<string, EventRow[]> = { thr_work: [grillingRead] };
    const host = await start({ events });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 1 }),
      lastAssistantText: "❓ **Q1** - **Storage**: KV or SQLite?\n\n➡️ KV.",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "question", grilling: true },
    });

    // The next turn reads no skill; grilling stays recorded.
    events.thr_work = [];
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 2 }),
      lastAssistantText: "Thanks, writing the ADR now. Done.",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "report", grilling: true, turnKey: 2 },
    });
  });

  it("doesn't record grilling for a thread that read other skills", async () => {
    const host = await start({
      events: {
        thr_work: [
          {
            seq: 30,
            type: "item/started",
            data: {
              item: {
                type: "commandExecution",
                id: "i3",
                command: "cat ~/.agents/skills/to-spec/SKILL.md",
                status: "pending",
              },
            },
          },
        ],
      },
    });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(),
      lastAssistantText: "Spec filed as #9.",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { grilling: false },
    });
  });

  it("reads only the events after the last scan, in pages the server accepts", async () => {
    const otherRead = (seq: number): EventRow => ({
      seq,
      type: "item/started",
      data: { item: { type: "fileRead", id: `i${seq}`, path: "/repo/README.md", status: "pending" } },
    });
    const events: Record<string, EventRow[]> = { thr_work: [otherRead(5)] };
    const host = await start({ events });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 1 }),
      lastAssistantText: "Done.",
    });
    events.thr_work!.push(otherRead(9));
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 2 }),
      lastAssistantText: "Done again.",
    });
    const pages = host.harness.inspection.sdk
      .callsTo("threads.events.list")
      .map(([args]) => args);
    expect(pages).toEqual([
      expect.objectContaining({ threadId: "thr_work", afterSeq: "0", limit: "100" }),
      expect.objectContaining({ threadId: "thr_work", afterSeq: "5", limit: "100" }),
    ]);
  });
});

describe("turn-end classifier: startup reconcile", () => {
  it("classifies idle threads it has no verdict for, with the heuristic on a first run", async () => {
    const host = await start({
      provider: true,
      threads: [
        thread({ id: "thr_idle", latestAttentionAt: 10 }),
        thread({ id: "thr_running", status: "active" }),
        thread({ id: "thr_hidden", visibility: "hidden" }),
      ],
      outputs: { thr_idle: "Which branch should I use?", thr_running: "?" },
    });
    expect(spawnCalls(host)).toHaveLength(0);
    await expect(
      turnEnds(host, ["thr_idle", "thr_running", "thr_hidden"]),
    ).resolves.toEqual({
      thr_idle: expect.objectContaining({
        verdict: "question",
        source: "heuristic",
        fallback: "startup",
        turnKey: 10,
      }),
      thr_running: null,
      thr_hidden: null,
    });
  });

  it("spends nothing on a first install, even with a provider already set", async () => {
    const missed = Array.from({ length: 3 }, (_, index) =>
      thread({ id: `thr_past${index}`, latestAttentionAt: 900 + index }),
    );
    const host = await start({
      provider: true,
      spawn: recordingSpawn(),
      threads: missed,
      outputs: Object.fromEntries(missed.map((t) => [t.id, "Should I merge?"])),
    });
    expect(spawnCalls(host)).toHaveLength(0);
    await expect(turnEnds(host, ["thr_past0", "thr_past2"])).resolves.toMatchObject({
      thr_past0: { source: "heuristic", fallback: "startup" },
      thr_past2: { source: "heuristic", fallback: "startup" },
    });
  });

  it("never classifies a helper thread that reads as visible", async () => {
    const host = await start({
      provider: true,
      spawn: recordingSpawn(),
      threads: [thread({ id: "thr_visible_helper", originPluginId: PLUGIN_ID })],
      outputs: { thr_visible_helper: "QUESTION" },
      watermark: 1,
    });
    expect(spawnCalls(host)).toHaveLength(0);
    expect(host.harness.inspection.sdk.callsTo("threads.output")).toHaveLength(0);
    await expect(turnEnds(host, ["thr_visible_helper"])).resolves.toEqual({
      thr_visible_helper: null,
    });
  });

  it("uses the model for turn ends missed since it last ran", async () => {
    spawned.length = 0;
    const host = await setup({
      provider: true,
      watermark: 500,
      threads: [
        thread({ id: "thr_old", latestAttentionAt: 100 }),
        thread({ id: "thr_new", latestAttentionAt: 900 }),
      ],
      outputs: { thr_old: "Done.", thr_new: "Done." },
      spawn: async () => {
        const helper = helperThread();
        spawned.push(helper);
        queueMicrotask(() => {
          void host.harness.behavior.emitThreadEvent("thread.idle", {
            thread: helper,
            lastAssistantText: "QUESTION",
          });
        });
        return helper;
      },
    });
    const { ready } = registerTurnEndClassifier(host.bb, { helperTimeoutMs: 2_000 });
    await ready;
    expect(spawnCalls(host)).toHaveLength(1);
    expect(spawnCalls(host)[0]![0]).toMatchObject({
      pluginMetadata: { forThreadId: "thr_new" },
    });
    await expect(turnEnds(host, ["thr_old", "thr_new"])).resolves.toMatchObject({
      thr_old: { source: "heuristic", fallback: "startup" },
      thr_new: { source: "model", verdict: "question" },
    });
  });

  it("asks the model about at most 10 missed turn ends, and uses the heuristic for the rest", async () => {
    const missed = Array.from({ length: 11 }, (_, index) =>
      thread({ id: `thr_missed${index}`, latestAttentionAt: 900 + index }),
    );
    const host = await setup({
      provider: true,
      watermark: 500,
      threads: missed,
      outputs: Object.fromEntries(missed.map((t) => [t.id, "Done."])),
      spawn: async () => {
        const helper = helperThread();
        queueMicrotask(() => {
          void host.harness.behavior.emitThreadEvent("thread.idle", {
            thread: helper,
            lastAssistantText: "REPORT",
          });
        });
        return helper;
      },
    });
    await registerTurnEndClassifier(host.bb, { helperTimeoutMs: 2_000 }).ready;
    expect(spawnCalls(host)).toHaveLength(10);
    await expect(turnEnds(host, ["thr_missed10"])).resolves.toMatchObject({
      thr_missed10: { source: "heuristic", fallback: "startup" },
    });
  });

  it("leaves threads whose verdict is current alone", async () => {
    const host = await setup({
      threads: [thread({ id: "thr_idle", latestAttentionAt: 10 })],
      outputs: { thr_idle: "Which one?" },
    });
    await host.bb.storage.kv.set("turnEnd:thr_idle", {
      verdict: "report",
      source: "heuristic",
      fallback: "no-provider",
      grilling: false,
      turnKey: 10,
      classifiedAt: 1,
      scannedSeq: 0,
      textHash: "",
    });
    await registerTurnEndClassifier(host.bb).ready;
    expect(host.harness.inspection.sdk.callsTo("threads.output")).toHaveLength(0);
    await expect(turnEnds(host, ["thr_idle"])).resolves.toMatchObject({
      thr_idle: { verdict: "report", turnKey: 10 },
    });
  });

  it("archives and stops helper threads left behind by an earlier run", async () => {
    const leftover = helperThread("thr_leftover");
    const host = await start({ leftoverHelpers: [leftover] });
    expect(host.harness.inspection.sdk.callsTo("threads.archive")).toEqual([
      [{ threadId: "thr_leftover" }],
    ]);
    expect(host.harness.inspection.sdk.callsTo("threads.stop")).toEqual([
      [{ threadId: "thr_leftover" }],
    ]);
  });
});

describe("turn-end classifier: the turnEnds rpc", () => {
  it("returns stored verdicts by thread id and null for the rest", async () => {
    const host = await start();
    for (const [id, text] of [
      ["thr_a", "Can I delete the old branch?"],
      ["thr_b", "Deleted the old branch."],
    ] as const) {
      await host.harness.behavior.emitThreadEvent("thread.idle", {
        thread: thread({ id }),
        lastAssistantText: text,
      });
    }
    await expect(turnEnds(host, ["thr_b", "thr_unknown", "thr_a"])).resolves.toEqual({
      thr_a: expect.objectContaining({ verdict: "question" }),
      thr_b: expect.objectContaining({ verdict: "report" }),
      thr_unknown: null,
    });
  });

  it("never classifies helper threads, archived threads or hidden threads", async () => {
    const host = await start({ provider: true });
    for (const excluded of [
      helperThread("thr_helper_x"),
      thread({ id: "thr_archived", archivedAt: 5 }),
      thread({ id: "thr_hidden", visibility: "hidden" }),
    ]) {
      await host.harness.behavior.emitThreadEvent("thread.idle", {
        thread: excluded,
        lastAssistantText: "Want me to continue?",
      });
    }
    expect(spawnCalls(host)).toHaveLength(0);
    await expect(
      turnEnds(host, ["thr_helper_x", "thr_archived", "thr_hidden"]),
    ).resolves.toEqual({ thr_helper_x: null, thr_archived: null, thr_hidden: null });
  });

  it("turns the helper on and off through the setting the picker writes", async () => {
    const host = await start({ provider: false, spawn: recordingSpawn() }, 30);
    await expect(
      host.harness.behavior.callRpc("setTurnEndClassifier", { selection: SELECTION }),
    ).resolves.toEqual({ selection: SELECTION });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 1 }),
      lastAssistantText: "Done.",
    });
    expect(spawnCalls(host)).toHaveLength(1);
    expect(spawnCalls(host)[0]![0]).toMatchObject(SELECTION);

    await expect(
      host.harness.behavior.callRpc("setTurnEndClassifier", { selection: null }),
    ).resolves.toEqual({ selection: null });
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread({ latestAttentionAt: 2 }),
      lastAssistantText: "Done again.",
    });
    expect(spawnCalls(host)).toHaveLength(1);
  });
});

describe("server wiring", () => {
  it("registers the classifier with the plugin", async () => {
    const host = await setup();
    await plugin(host.bb);
    await host.harness.behavior.emitThreadEvent("thread.idle", {
      thread: thread(),
      lastAssistantText: "Done?",
    });
    await expect(turnEnds(host, ["thr_work"])).resolves.toMatchObject({
      thr_work: { verdict: "question" },
    });
  });
});
