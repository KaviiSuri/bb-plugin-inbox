// @vitest-environment jsdom
// #24, timing: an interaction read that never answers, answers late, or is
// aborted by the thread changing. The sidebar's threads come from a store
// here so a test can change a thread mid-read; everything else is the real
// sidebar route.

import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import { defaultPreferences } from "../../shared/preferences.js";
import { ASK_READ_GRACE_MS } from "./model/index.js";

const store = vi.hoisted(() => {
  let threads: PluginSidebarThread[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => threads,
    set(next: PluginSidebarThread[]) {
      threads = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const original = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return {
    ...original,
    experimental_useSidebarThreads: () => {
      const state = original.experimental_useSidebarThreads();
      const threads = useSyncExternalStore(store.subscribe, store.get);
      return { ...state, threads };
    },
  };
});

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

// Attention at 40, read at 50: the thread was read before it asked.
const ASKING = makeSidebarThread({
  id: "thr_q",
  projectId: "proj_app",
  title: "QA: question form",
  status: "active",
  hasPendingInteraction: true,
  latestAttentionAt: 40,
  lastReadAt: 50,
  updatedAt: 40,
});

const question = (createdAt: number) => ({
  createdAt,
  id: "int_thr_q",
  providerId: "claude-code",
  providerRequestId: "req_1",
  providerThreadId: "pt_1",
  resolution: null,
  resolvedAt: null,
  status: "pending",
  statusReason: null,
  threadId: "thr_q",
  turnId: "turn_1",
  payload: {
    kind: "user_question",
    questions: [
      { id: "q1", prompt: "Monthly or yearly?", allowFreeText: true, multiSelect: false, required: true },
    ],
  },
});

type List = (args: { threadId: string; signal?: AbortSignal }) => Promise<unknown[]>;

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

function renderInbox(list: List) {
  store.set([ASKING]);
  const keysOf = (input: unknown) => (input as { keys: string[] }).keys;
  const none = (input: unknown) =>
    Object.fromEntries(keysOf(input).map((key) => [key, null]));
  return renderSlot(registration, props(), {
    sidebarThreads: {
      projects: [makePluginProject({ id: "proj_app", name: "App" })],
      sections: [],
      threads: [],
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), activeTab: "inbox" },
      }),
      setPreference: (input: unknown) => input,
      inboxStart: () => ({ startedAt: 0 }),
      verifications: none,
      laters: none,
      turnEnds: none,
      status: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "not_applicable" }])),
      pullRequests: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "absent" }])),
    },
    sdk: {
      threads: {
        events: { list: async () => [] as never },
        interactions: { list: list as never },
      },
    },
  });
}

const ROW = "QA: question form: answer";

function bandOf(row: string): "New for you" | "Seen" | null {
  for (const name of ["New for you", "Seen"] as const) {
    const section = document.querySelector(`[aria-label="${name}"]`);
    if (section && within(section as HTMLElement).queryByRole("button", { name: row })) {
      return name;
    }
  }
  return null;
}

/** Lets pending reads, renders and effects settle without moving the clock far. */
async function settle(ms = 50) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("Inbox: the read that dates an ask (#24)", () => {
  it("shows a read thread's ask once the grace runs out when its interaction read never answers, and not before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setPreferencesMirrorStorageForTest(null);
    renderInbox(() => new Promise(() => {}));
    await screen.findByRole("tab", { name: /Inbox/ });
    await settle();
    expect(bandOf(ROW)).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ASK_READ_GRACE_MS + 10);
    });
    await waitFor(() => expect(bandOf(ROW)).toBe("Seen"));
  });

  it("dates the ask by a read that answers after the grace, moving it to New for you", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setPreferencesMirrorStorageForTest(null);
    let answer!: (list: unknown[]) => void;
    renderInbox(() => new Promise((resolve) => (answer = resolve)));
    await screen.findByRole("tab", { name: /Inbox/ });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ASK_READ_GRACE_MS + 10);
    });
    await waitFor(() => expect(bandOf(ROW)).toBe("Seen"));

    await act(async () => answer([question(60)]));
    await waitFor(() => expect(bandOf(ROW)).toBe("New for you"));
    expect(document.querySelector('[aria-label$=" new"]')?.getAttribute("aria-label")).toBe("1 new");
  });

  it("doesn't flash an ask into Seen when a thread change aborts its read in flight", async () => {
    setPreferencesMirrorStorageForTest(null);
    const reads: Array<(list: unknown[]) => void> = [];
    const seenBands: Array<string | null> = [];
    renderInbox(({ signal }) =>
      new Promise((resolve, reject) => {
        reads.push(resolve);
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
    );
    await screen.findByRole("tab", { name: /Inbox/ });
    await waitFor(() => expect(reads).toHaveLength(1));

    // The thread changes (a new version) while its first read is open.
    const observer = new MutationObserver(() => seenBands.push(bandOf(ROW)));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await act(async () => store.set([{ ...ASKING, updatedAt: 45 }]));
    await waitFor(() => expect(reads).toHaveLength(2));
    await settle();
    expect(bandOf(ROW)).toBeNull();

    await act(async () => reads[1]!([question(60)]));
    await waitFor(() => expect(bandOf(ROW)).toBe("New for you"));
    observer.disconnect();
    expect(seenBands).not.toContain("Seen");
  });
});
