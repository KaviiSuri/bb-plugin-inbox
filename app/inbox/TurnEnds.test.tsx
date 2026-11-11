// @vitest-environment jsdom

// The classifier's verdicts through the real route: the sidebar threads, the
// keyed `turnEnds` rpc, its server refresh by tag, the child completion
// events, and the rows the Inbox tab draws (#15).
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import { defaultPreferences } from "../../shared/preferences.js";
import { turnEndTag, type TurnEnd } from "../../shared/inbox-turn-end.js";

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

// Turns that just finished, in server time, so a missing verdict is pending.
const NOW = Date.now();
const START = NOW - 3_600_000;
const JUST_ENDED = NOW - 1_000;
const LONG_AGO = NOW - 600_000;

const keysOf = (input: unknown) => (input as { keys: string[] }).keys;

function verdict(overrides: Partial<TurnEnd> = {}): TurnEnd {
  return {
    verdict: "report",
    source: "heuristic",
    fallback: "no-provider",
    grilling: false,
    turnKey: 0,
    completedAt: null,
    classifiedAt: 0,
    ...overrides,
  };
}

const env = (id: string) => ({
  id,
  name: id,
  branchName: id,
  path: `/work/${id}`,
  isWorktree: true,
  providerId: null,
  workspaceDisplayKind: null,
});

const top = (overrides: Parameters<typeof makeSidebarThread>[0] = {}) =>
  makeSidebarThread({
    id: "thr_top",
    projectId: "proj_app",
    title: "Pick a database",
    latestAttentionAt: JUST_ENDED,
    lastReadAt: 0,
    isUnread: true,
    ...overrides,
  });

const PARENT = makeSidebarThread({
  id: "thr_parent",
  projectId: "proj_app",
  title: "Build billing",
  status: "active",
  latestAttentionAt: START + 1,
  lastReadAt: START + 1,
});

/** A child whose attention stayed at creation, as bb leaves it (#14). */
const child = (id: string, title: string, overrides = {}) =>
  makeSidebarThread({
    id,
    projectId: "proj_app",
    title,
    parentThreadId: "thr_parent",
    latestAttentionAt: START - 10,
    lastReadAt: START - 9,
    ...overrides,
  });

/** A classifier helper as the sidebar lists it: hidden, in the personal project. */
const HELPER = makeSidebarThread({
  id: "thr_helper",
  projectId: "proj_personal",
  title: "Inbox: classify a turn end",
  isHidden: true,
  latestAttentionAt: JUST_ENDED,
  lastReadAt: 0,
  isUnread: true,
});

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

interface Options {
  verdicts?: Record<string, TurnEnd>;
  /** Latest turn/completed per child. */
  completions?: Record<string, number>;
  turnEndsFails?: boolean;
  activeTab?: "inbox" | "threads";
}

function renderInbox(threads: PluginSidebarThread[], options: Options = {}) {
  const verdicts = { ...options.verdicts };
  const turnEndKeys: string[][] = [];
  const statusKeys: string[] = [];
  const none = (input: unknown) =>
    Object.fromEntries(keysOf(input).map((key) => [key, null]));
  const slot = renderSlot(registration, props(), {
    sidebarThreads: {
      projects: [
        makePluginProject({ id: "proj_app", name: "App" }),
        makePluginProject({ id: "proj_personal", name: "Personal" }),
      ],
      sections: [],
      threads,
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), activeTab: options.activeTab ?? "inbox" },
      }),
      setPreference: (input: unknown) => input,
      inboxStart: () => ({ startedAt: START }),
      verifications: none,
      laters: none,
      turnEnds: (input: unknown) => {
        turnEndKeys.push(keysOf(input));
        if (options.turnEndsFails) throw new Error("classifier offline");
        return Object.fromEntries(
          keysOf(input).map((key) => [key, verdicts[key] ?? null]),
        );
      },
      status: (input: unknown) => (
        statusKeys.push(...keysOf(input)),
        Object.fromEntries(
          keysOf(input).map((key) => [key, { outcome: "not_applicable" }]),
        )
      ),
      pullRequests: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "absent" }])),
    },
    sdk: {
      threads: {
        output: async ({ threadId }: { threadId: string }) => ({
          output: `Report from ${threadId}`,
        }),
        markRead: async () => undefined as never,
        events: {
          list: async ({ threadId }: { threadId: string }) => {
            const at = options.completions?.[threadId];
            return (at === undefined ? [] : [{ type: "turn/completed", createdAt: at }]) as never;
          },
        },
        interactions: { list: async () => [] as never },
      },
    },
  });
  return { slot, verdicts, turnEndKeys, statusKeys };
}

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("Inbox: turn-end verdicts through the keyed rpc (#15)", () => {
  it("shows a top-level thread whose turn ended with a question as answer", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { turnEndKeys } = renderInbox([top()], {
      verdicts: { thr_top: verdict({ verdict: "question", turnKey: JUST_ENDED }) },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Pick a database: answer" }));
    await screen.findByText("Ended its turn with a question for you");
    expect(turnEndKeys.flat()).toContain("thr_top");
  });

  it("keeps an ordinary report as FYI", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox([top()], {
      verdicts: { thr_top: verdict({ verdict: "report", turnKey: JUST_ENDED }) },
    });
    await screen.findByRole("button", { name: "Pick a database: fyi" });
    expect(screen.queryByRole("button", { name: "Pick a database: answer" })).toBeNull();
  });

  it("counts a turn whose verdict is stale as running until the server's refresh brings this turn's verdict", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { slot, verdicts } = renderInbox([top()], {
      // The previous turn asked; this one hasn't been read yet.
      verdicts: { thr_top: verdict({ verdict: "question", turnKey: LONG_AGO }) },
    });
    const footer = await screen.findByRole("button", { expanded: false });
    expect(footer.textContent).toBe("1running");
    expect(screen.queryByRole("button", { name: /^Pick a database: / })).toBeNull();

    verdicts.thr_top = verdict({ verdict: "question", turnKey: JUST_ENDED });
    await slot.behavior.experimental_invalidateRpc([turnEndTag("thr_top")]);
    await screen.findByRole("button", { name: "Pick a database: answer" });
  });

  it("never hides finished work when the verdicts can't be read", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox([top({ latestAttentionAt: LONG_AGO })], { turnEndsFails: true });
    await screen.findByRole("button", { name: "Pick a database: fyi" });
  });

  it("asks only about turns that ended after the Inbox started", async () => {
    setPreferencesMirrorStorageForTest(null);
    const old = top({ id: "thr_old", title: "Old question", latestAttentionAt: START - 5 });
    const { turnEndKeys } = renderInbox([old, top()], {
      verdicts: {
        thr_old: verdict({ verdict: "question", turnKey: START - 5 }),
        thr_top: verdict({ verdict: "question", turnKey: JUST_ENDED }),
      },
    });
    await screen.findByRole("button", { name: "Pick a database: answer" });
    expect(screen.queryByRole("button", { name: /^Old question/ })).toBeNull();
    expect(turnEndKeys.flat()).not.toContain("thr_old");
  });

  it("gives a child that asks in plain text its own row naming its parent, matched by its turn/completed time", async () => {
    setPreferencesMirrorStorageForTest(null);
    const ended = JUST_ENDED;
    renderInbox([PARENT, child("thr_ask", "Name the flag", { updatedAt: ended + 2 })], {
      completions: { thr_ask: ended },
      verdicts: {
        thr_ask: verdict({ verdict: "question", turnKey: START - 10, completedAt: ended }),
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Name the flag: answer" }));
    await screen.findByText("Its own item: it ended its turn with a question for you");
    expect(document.querySelector("[data-inbox-parent]")?.textContent).toBe("FromBuild billing");
  });

  it("gives a grilling child's report its own FYI row and reads its own environment's evidence", async () => {
    setPreferencesMirrorStorageForTest(null);
    const ended = JUST_ENDED;
    const { statusKeys } = renderInbox(
      [
        { ...PARENT, status: "idle" },
        child("thr_grill", "Grill: pricing", { updatedAt: ended + 2, environment: env("env_grill") }),
        child("thr_research", "Research: Stripe", { updatedAt: ended + 2, environment: env("env_research") }),
      ],
      {
        completions: { thr_grill: ended, thr_research: ended },
        verdicts: {
          thr_grill: verdict({ grilling: true, turnKey: START - 10, completedAt: ended }),
          thr_research: verdict({ turnKey: START - 10, completedAt: ended }),
        },
      },
    );
    fireEvent.click(await screen.findByRole("button", { name: "Grill: pricing: fyi" }));
    await screen.findByText("Its own item: it grills you with the grilling skill");
    // The report child still folds into its parent.
    await screen.findByRole("button", { name: "Build billing: fyi" });
    expect(screen.queryByRole("button", { name: /^Research: Stripe: / })).toBeNull();
    expect(statusKeys).toContain("env_grill");
    expect(statusKeys).not.toContain("env_research");
  });
});

describe("classifier helper threads (#15)", () => {
  it("never shows a hidden helper in the Inbox, its Running count or its verdict reads", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { turnEndKeys } = renderInbox([HELPER, top()], {
      verdicts: {
        thr_helper: verdict({ verdict: "question", turnKey: JUST_ENDED }),
        thr_top: verdict({ verdict: "question", turnKey: JUST_ENDED }),
      },
    });
    await screen.findByRole("button", { name: "Pick a database: answer" });
    expect(screen.queryByText("Inbox: classify a turn end")).toBeNull();
    expect(screen.queryByText("running")).toBeNull();
    expect(turnEndKeys.flat()).not.toContain("thr_helper");
  });

  it("never shows a hidden helper in the Threads tab", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox([HELPER, top()], { activeTab: "threads" });
    await screen.findByText("Pick a database");
    await waitFor(() => expect(screen.queryByText("Inbox: classify a turn end")).toBeNull());
  });
});
