// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import {
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "../preferences/preferences-sync.js";
import { defaultPreferences } from "../../shared/preferences.js";

const app = await loadPluginApp(() => import("../../app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread list slot not registered");

const PARENT = makeSidebarThread({
  id: "thr_parent",
  projectId: "proj_app",
  title: "Build billing",
  latestAttentionAt: 50,
  lastReadAt: 50,
});
const child = (id: string, title: string, overrides = {}) =>
  makeSidebarThread({
    id,
    projectId: "proj_app",
    title,
    parentThreadId: "thr_parent",
    latestAttentionAt: 100,
    lastReadAt: 0,
    ...overrides,
  });

const interaction = (threadId: string, payload: Record<string, unknown>) => ({
  createdAt: 1,
  id: `int_${threadId}`,
  providerId: "claude-code",
  providerRequestId: "req_1",
  providerThreadId: "pt_1",
  resolution: null,
  resolvedAt: null,
  status: "pending",
  statusReason: null,
  threadId,
  turnId: "turn_1",
  payload,
});
const QUESTION_PAYLOAD = {
  kind: "user_question",
  questions: [
    {
      id: "q1",
      prompt: "Monthly or yearly?",
      allowFreeText: true,
      multiSelect: false,
      required: true,
    },
  ],
};
const PERMISSION_PAYLOAD = {
  kind: "approval",
  availableDecisions: ["allow_once", "deny"],
  reason: null,
  subject: { itemId: "i1", kind: "command", command: "npm run migrate", cwd: null, sessionGrant: null },
};

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: true,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

function renderInbox(
  threads: PluginSidebarThread[],
  payloads: Record<string, Record<string, unknown>> = {},
  completions?: Record<string, number | null>,
  activeThreadId: string | null = null,
) {
  const markRead = vi.fn(async () => undefined as never);
  const output = vi.fn(async ({ threadId }: { threadId: string }) => ({
    output: `Report from ${threadId}`,
  }));
  const listEvents = vi.fn(async ({ threadId }: { threadId: string }) => {
    const at = completions ? completions[threadId] : threads.find((t) => t.id === threadId)!.latestAttentionAt;
    return (at == null ? [] : [{ type: "turn/completed", createdAt: at }]) as never;
  });
  const keysOf = (input: unknown) => (input as { keys: string[] }).keys;
  const statusKeys: string[] = [];
  const none = (input: unknown) =>
    Object.fromEntries(keysOf(input).map((key) => [key, null]));
  const slot = renderSlot(registration, { ...props(), activeThreadId }, {
    sidebarThreads: {
      projects: [makePluginProject({ id: "proj_app", name: "App" })],
      sections: [],
      threads,
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), activeTab: "inbox" },
      }),
      setPreference: (input: unknown) => input,
      inboxStart: () => ({ startedAt: 0 }),
      verifications: none,
      laters: none,
      // No turn-end verdicts stored: every finished turn is a report.
      turnEnds: none,
      status: (input: unknown) => (
        statusKeys.push(...keysOf(input)),
        Object.fromEntries(
          keysOf(input).map((key) => [key, { outcome: "not_applicable" }]),
        )),
      pullRequests: (input: unknown) =>
        Object.fromEntries(keysOf(input).map((key) => [key, { outcome: "absent" }])),
    },
    sdk: {
      threads: {
        output,
        markRead,
        events: { list: listEvents },
        interactions: {
          list: async ({ threadId }: { threadId: string }) =>
            (payloads[threadId]
              ? [interaction(threadId, payloads[threadId])]
              : []) as never,
        },
      },
    },
  });
  return { slot, output, statusKeys, listEvents, markRead };
}

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("Inbox: child Audience on the opened row", () => {
  it("says which parent a child's own item belongs to, and why it got one", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderInbox(
      [
        { ...PARENT, status: "active" },
        child("thr_q", "Grill: pricing", { hasPendingInteraction: true }),
      ],
      { thr_q: QUESTION_PAYLOAD },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Grill: pricing: answer" }));
    await screen.findByText("Asks: Monthly or yearly?");
    expect(document.querySelector("[data-inbox-parent]")?.textContent).toBe(
      "FromBuild billing",
    );
    expect(
      screen.getByText("Its own item: it asks you through a question form"),
    ).toBeTruthy();
  });

  it("lists folded children on the parent's item with each report, never as their own rows", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { slot, output } = renderInbox([
      PARENT,
      child("thr_r1", "Research: Stripe"),
      child("thr_r2", "Research: Paddle"),
    ]);

    const row = await screen.findByRole("button", { name: "Build billing: fyi" });
    expect(screen.queryByRole("button", { name: /^Research/ })).toBeNull();
    expect(output).not.toHaveBeenCalled();

    fireEvent.click(row);
    await screen.findByText("2 helpers reported");
    const helpers = screen.getByRole("list", { name: "Helpers" });
    await within(helpers).findByText("Report from thr_r1");
    expect(within(helpers).getByText("Report from thr_r2")).toBeTruthy();

    fireEvent.click(
      within(helpers).getByRole("button", { name: "Research: Paddle: reported" }),
    );
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_r2" },
    ]);
  });

  it("opening report two explicitly marks an already-active parent read, even though navigation stays on the same thread", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { markRead, slot } = renderInbox([
      { ...PARENT, lastReadAt: 70 }, // Opened after report one at 60.
      child("thr_r1", "Research: Stripe", { latestAttentionAt: 1, updatedAt: 101 }),
    ], {}, { thr_r1: 100 }, "thr_parent");
    fireEvent.click(await screen.findByRole("button", { name: "Build billing: fyi" }));
    await screen.findByText("Report from thr_r1");
    expect(markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(markRead).toHaveBeenCalledWith({ threadId: "thr_parent" });
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_parent" }]);
  });

  it("reads authoritative completion events for child reports, never treating a newer sidebar updatedAt as a finish", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { listEvents } = renderInbox([
      PARENT,
      child("thr_r1", "Research: Stripe", { latestAttentionAt: 1, updatedAt: 150 }),
      child("thr_r2", "Renamed old research", { latestAttentionAt: 1, updatedAt: 200 }),
    ], {}, { thr_r1: 100, thr_r2: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "Build billing: fyi" }));
    await screen.findByText("Report from thr_r1");
    expect(screen.queryByRole("button", { name: "Renamed old research: reported" })).toBeNull();
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thr_r1", types: ["turn/completed"], order: "desc", limit: "1",
    }));
    expect(listEvents).not.toHaveBeenCalledWith(expect.objectContaining({ threadId: "thr_parent" }));
  });

  it("reads evidence for the parent's environment, never for a folded child's own", async () => {
    setPreferencesMirrorStorageForTest(null);
    const env = (id: string) => ({
      id,
      name: id,
      branchName: id,
      path: `/work/${id}`,
      isWorktree: true,
      providerId: null,
      workspaceDisplayKind: null,
    });
    const { statusKeys } = renderInbox([
      { ...PARENT, environment: env("env_parent"), lastReadAt: 0 },
      child("thr_r1", "Research: Stripe", { environment: env("env_child") }),
    ]);

    await screen.findByRole("button", { name: "Build billing: fyi" });
    expect(statusKeys).toContain("env_parent");
    expect(statusKeys).not.toContain("env_child");
  });

  it("asks to approve on the parent once it stopped, with Open helper going to the waiting child", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { slot, markRead } = renderInbox(
      [PARENT, child("thr_perm", "Run migrations", { hasPendingInteraction: true })],
      { thr_perm: PERMISSION_PAYLOAD },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Build billing: approve" }));
    await screen.findByText("A helper waits on you: Wants to run npm run migrate");
    expect(screen.getAllByText(/npm run migrate/)).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Run migrations: approve" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Answer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open helper" }));
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_perm" },
    ]);
    expect(markRead).not.toHaveBeenCalled();
  });
});
