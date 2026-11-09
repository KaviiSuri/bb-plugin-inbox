import { expect, it } from "vitest";
import { deriveInbox } from "./index.js";
import { makeSidebarThread, snapshot } from "./test-snapshot.js";

// Captured from real codex/gpt-6.1-sol parent/child lifecycles, 2026-11-09.
// Successful child idle leaves latestAttentionAt at creation. Only the server
// turn/completed event (events.list) authoritatively dates each report.
const CREATED = 1794217087050;
const START = 1794217155883;
const REPORT_ONE = 1794217158361;
const OPENED = 1794217245941;
const REPORT_TWO = 1794217250949;
const parent = makeSidebarThread({
  id: "owner", latestAttentionAt: 1794217088296, lastReadAt: 1794217077704,
});
const child = makeSidebarThread({
  id: "child", parentThreadId: "owner", latestAttentionAt: CREATED,
  createdAt: CREATED, lastReadAt: 1794217087057, updatedAt: 1794217158362,
});

it("folds a pre-install child that completes after install despite unchanged sidebar attention", () => {
  const view = deriveInbox(snapshot({
    threads: [parent, child], inboxStartedAt: START,
    childCompletions: { child: REPORT_ONE },
  }));
  expect(view.newForYou).toMatchObject([{
    threadId: "owner", tier: "fyi", attentionAt: REPORT_ONE,
    folded: [{ threadId: "child", attentionAt: REPORT_ONE }],
  }]);
});

it("holds a child's report back until its authoritative completion is loaded, not using updatedAt", () => {
  const view = deriveInbox(snapshot({
    threads: [parent, child], inboxStartedAt: START,
    childCompletions: { child: null },
  }));
  expect(view.newForYou).toEqual([]);
  expect(view.seen).toEqual([]);
});

it("opening the owner clears report one; report two brings it back New with unchanged sidebar attention", () => {
  const opened = { ...parent, lastReadAt: OPENED, isUnread: false };
  const base = { threads: [opened, child], inboxStartedAt: START };
  expect(deriveInbox(snapshot({ ...base, childCompletions: { child: REPORT_ONE } })).newForYou).toEqual([]);
  const reportTwo = REPORT_TWO;
  expect(deriveInbox(snapshot({
    ...base,
    threads: [opened, { ...child, updatedAt: reportTwo + 2 }],
    childCompletions: { child: reportTwo },
  })).newForYou).toMatchObject([{
    threadId: "owner", tier: "fyi", attentionAt: reportTwo, news: true,
  }]);
});

it("a rename/read edit after Inbox start does not make a pre-install completion new", () => {
  const view = deriveInbox(snapshot({
    threads: [parent, { ...child, updatedAt: REPORT_ONE + 20_000 }],
    inboxStartedAt: REPORT_ONE + 1000,
    childCompletions: { child: REPORT_ONE },
  }));
  expect(view.newForYou).toEqual([]);
});
