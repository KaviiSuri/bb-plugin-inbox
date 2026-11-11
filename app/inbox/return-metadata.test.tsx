// @vitest-environment jsdom
// Regressions found in review: equal text does not prove equal file state.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { defaultPreferences } from "../../shared/preferences.js";
import { makePluginProject } from "../model/fixtures.js";
import { resetPreferencesSyncForTest, setPreferencesMirrorStorageForTest } from "../preferences/preferences-sync.js";
import { environment, makeSidebarThread } from "./model/test-snapshot.js";

const app = await loadPluginApp(() => import("../../app"));
afterEach(() => { cleanup(); resetPreferencesSyncForTest(); setPreferencesMirrorStorageForTest(undefined); });

it.each([
  { name: "reverted executable bit", revision: "100644:aaaa:100755:aaaa", text: "echo ok\n" },
  { name: "restored empty file", revision: "100644:aaaa:000000:0000", text: "" },
])("shows $name as new work when it disappears from the HEAD diff", async ({ name, revision, text }) => {
  setPreferencesMirrorStorageForTest(null);
  renderReturn(name, revision, text, "100644");
  fireEvent.click(await screen.findByRole("button", { name: `${name}: verify` }));
  expect(await screen.findByText("1 file · +0 −0")).toBeTruthy();
  expect(screen.getByText("New changes since you verified")).toBeTruthy();
});

it.each([
  { name: "old chmod snapshot", revision: "100644:aaaa:100755:aaaa", text: "echo ok\n" },
  { name: "old deletion snapshot", revision: "100644:aaaa:000000:0000", text: "" },
])("labels $name unscoped rather than treating equal text as an unchanged report", async ({ name, revision, text }) => {
  setPreferencesMirrorStorageForTest(null);
  renderReturn(name, revision, text);
  fireEvent.click(await screen.findByRole("button", { name: `${name}: verify` }));
  expect(await screen.findByText("New work; couldn't tell what changed since you verified")).toBeTruthy();
  expect(screen.queryByText("1 file · +0 −0")).toBeNull();
});

it("labels a truncated HEAD comparison unscoped even when its merge base matches the verified head", async () => {
  setPreferencesMirrorStorageForTest(null);
  // Without the truncation guard, the omitted path would look unchanged:
  // its saved text and HEAD mode equal the current fileSide response.
  renderReturn("truncated return", "100644:aaaa:100644:bbbb", "same\n", "100644", true);
  fireEvent.click(await screen.findByRole("button", { name: "truncated return: verify" }));
  expect(await screen.findByText("New work; couldn't tell what changed since you verified")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy();
  expect(screen.queryByText("New changes since you verified")).toBeNull();
  expect(screen.queryByText("Reported back; nothing to verify")).toBeNull();
});

function renderReturn(title: string, revision: string, content: string, headMode?: string, truncated = false) {
  const verification = { threadId: "thr_r", verifiedAt: 100, client: "Laptop", prChecksState: null,
    diffBase: { headSha: "aabb1122", mergeBaseRef: "bbbb9999", files: [
      { path: "file", revision, content, ...(headMode ? { headMode } : {}) },
    ] } };
  return renderSlot(app.threadLists[0]!, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: true,
    searchQuery: "", onNavigate: vi.fn(),
  }, {
    sidebarThreads: { projects: [makePluginProject({ id: "proj_app" })], sections: [], threads: [
      makeSidebarThread({ id: "thr_r", projectId: "proj_app", title, environment: environment("env_r"), latestAttentionAt: 200, lastReadAt: 0 }),
    ] },
    rpc: {
      listPreferences: () => ({ preferences: { ...defaultPreferences(), activeTab: "inbox" } }),
      setPreference: (value: unknown) => value,
      inboxStart: () => ({ startedAt: 0 }),
      verifications: () => ({ thr_r: verification }), laters: () => ({ thr_r: null }),
      turnEnds: () => ({ thr_r: null }),
      status: () => ({ env_r: { outcome: "available", workspace: { allChanges: { fileCount: 0, insertions: 0, deletions: 0 } } } }),
      pullRequests: () => ({ env_r: { outcome: "absent" } }),
    },
    sdk: { plugins: { async callRpc<T>(args: { method: string; input?: unknown; outputSchema: { parse(value: unknown): T } }): Promise<T> {
      if (args.method === "files") {
        expect(args.input).toEqual({ environmentId: "env_r", target: { type: "all", mergeBaseBranch: "aabb1122" }, ignoreWhitespace: false });
        return args.outputSchema.parse({ outcome: "available", mergeBaseRef: "aabb1122", files: [], truncated });
      }
      expect(args.method).toBe("fileSide");
      expect(args.input).toEqual({ environmentId: "env_r", query: { target: "all", mergeBaseRef: "aabb1122", path: "file", side: "new" } });
      return args.outputSchema.parse({ outcome: "available", file: { content, contentEncoding: "utf8", sizeBytes: content.length } });
    } } },
  });
}
