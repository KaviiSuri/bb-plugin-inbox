// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import {
  loadPluginApp,
  renderSlot,
  type RenderSlotOptions,
} from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  flushPreferenceWritesForTest,
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import {
  defaultPreferences,
  PREFERENCES_CHANGED_CHANNEL,
  type PreferenceValues,
} from "../../shared/preferences.js";

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

const THREADS = [
  makeSidebarThread({
    id: "thr_ask",
    projectId: "proj_app",
    title: "Grill: billing edge cases",
    hasPendingInteraction: true,
    latestAttentionAt: 30,
    lastReadAt: 0,
  }),
  makeSidebarThread({
    id: "thr_fail",
    projectId: "proj_app",
    title: "Regenerate OpenAPI client",
    status: "error",
    latestAttentionAt: 20,
    lastReadAt: 25,
  }),
  makeSidebarThread({
    id: "thr_run",
    projectId: "proj_app",
    title: "Bump eslint",
    status: "active",
    latestAttentionAt: 10,
  }),
  makeSidebarThread({
    id: "thr_quiet",
    projectId: "proj_app",
    title: "Quiet thread",
    latestAttentionAt: 5,
    lastReadAt: 5,
  }),
];

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

function renderList(
  preferences: Partial<PreferenceValues>,
  listProps = props(),
  options: RenderSlotOptions = {},
) {
  const setPreference = vi.fn((input: unknown) => input);
  const slot = renderSlot(registration, listProps, {
    sidebarThreads: {
      projects: [makePluginProject({ id: "proj_app", name: "App" })],
      sections: [],
      threads: THREADS,
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), ...preferences },
      }),
      setPreference,
    },
    sdk: {
      threads: {
        interactions: {
          list: async () => [
            {
              createdAt: 1,
              id: "int_1",
              providerId: "claude-code",
              providerRequestId: "req_1",
              providerThreadId: "pt_1",
              resolution: null,
              resolvedAt: null,
              status: "pending",
              statusReason: null,
              threadId: "thr_ask",
              turnId: "turn_1",
              payload: {
                kind: "user_question",
                questions: [
                  {
                    id: "q1",
                    prompt: "Charge on renewal or on signup?",
                    allowFreeText: true,
                    multiSelect: false,
                    required: true,
                  },
                ],
              },
            },
          ],
        },
      },
    },
    ...options,
  });
  return { slot, setPreference };
}

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("Threads | Inbox tabs", () => {
  it("shows the Threads tab with the thread list, and the Inbox count", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ organizationMode: "chronological" });

    expect(await screen.findByRole("tab", { name: "Threads" })).toHaveProperty(
      "ariaSelected",
      "true",
    );
    await screen.findByText("Quiet thread");
    // New for you counts only the unopened ask; the opened failure is Seen.
    expect(screen.getByRole("tab", { name: /Inbox/ }).textContent).toBe(
      "Inbox1",
    );
  });

  it("shows the Inbox tab: bands, words, and the running count", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ activeTab: "inbox" });

    const fresh = await screen.findByRole("region", { name: "New for you" });
    expect(
      within(fresh).getByRole("button", {
        name: "Grill: billing edge cases: answer",
      }),
    ).toBeTruthy();
    const seen = screen.getByRole("region", { name: "Seen" });
    expect(
      within(seen).getByRole("button", {
        name: "Regenerate OpenAPI client: failed",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Quiet thread")).toBeNull();
    expect(document.querySelector("[data-sidebar-thread-id]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /1\s*running/ }));
    expect(
      within(screen.getByRole("list", { name: "Running threads" })).getByText(
        "Bump eslint",
      ),
    ).toBeTruthy();
  });

  it("opens a row's reason line, and Answer goes to the thread and closes the drawer", async () => {
    setPreferencesMirrorStorageForTest(null);
    const listProps = props();
    const { slot } = renderList({ activeTab: "inbox" }, listProps);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Grill: billing edge cases: answer",
      }),
    );
    await screen.findByText("Asks: Charge on renewal or on signup?");
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));

    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_ask" },
    ]);
    expect(listProps.onNavigate).toHaveBeenCalledOnce();
  });

  it("opens a running thread from the running count", async () => {
    setPreferencesMirrorStorageForTest(null);
    const listProps = props();
    const { slot } = renderList({ activeTab: "inbox" }, listProps);

    fireEvent.click(await screen.findByRole("button", { name: /1\s*running/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bump eslint" }));

    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_run" },
    ]);
    expect(listProps.onNavigate).toHaveBeenCalledOnce();
  });

  it("stores the chosen tab as a synced preference", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { setPreference } = renderList({});

    fireEvent.click(await screen.findByRole("tab", { name: /Inbox/ }));
    await screen.findByRole("region", { name: "New for you" });
    await flushPreferenceWritesForTest();

    await waitFor(() =>
      expect(setPreference).toHaveBeenCalledWith(
        expect.objectContaining({ key: "activeTab", value: "inbox" }),
      ),
    );
  });

  it("follows a tab change made in another client", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { slot } = renderList({});
    await screen.findByText("Quiet thread");

    await slot.behavior.emitRealtime(PREFERENCES_CHANGED_CHANNEL, {
      key: "activeTab",
      value: "inbox",
      origin: "another-client",
    });

    await screen.findByRole("region", { name: "New for you" });
    expect(screen.queryByText("Quiet thread")).toBeNull();
  });
});
