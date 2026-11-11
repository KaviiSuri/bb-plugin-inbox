import { describe, expect, it } from "vitest";
import {
  deriveInbox,
  nextChangeAt,
  type InboxSnapshot,
  type InboxView,
} from "./index.js";
import type { PendingInteractionSummary } from "./blocked.js";
import { CLASSIFY_GRACE_MS } from "./turn-end.js";
import {
  DIFF,
  environment,
  makeSidebarThread,
  NOW,
  QUESTION,
  snapshot,
  turnEnd,
} from "./test-snapshot.js";

const PERMISSION: PendingInteractionSummary = {
  kind: "approval",
  reason: "Wants to run rm -rf dist",
  subject: "command",
};

type Overrides = Parameters<typeof makeSidebarThread>[0];

const rows = (view: InboxView) => [...view.newForYou, ...view.seen];
const rowIds = (view: InboxView) => rows(view).map((item) => item.threadId);
const runningIds = (view: InboxView) => view.running.map((r) => r.threadId);

/** A top-level thread that finished a turn at NOW - 1000, never opened. */
const finished = (overrides: Overrides = {}) =>
  makeSidebarThread({
    id: "thr_top",
    title: "Pick a database",
    latestAttentionAt: NOW - 1_000,
    lastReadAt: 0,
    isUnread: true,
    ...overrides,
  });

/** The verdict the server stored for a top-level thread's turn. */
const verdictFor = (
  thread: { latestAttentionAt: number },
  verdict: "question" | "report",
  overrides = {},
) => turnEnd({ verdict, turnKey: thread.latestAttentionAt, ...overrides });

describe("deriveInbox: a turn that ends with a plain-text question (#15)", () => {
  it("makes a finished top-level thread Blocked on you, word answer", () => {
    const thread = finished();
    const view = deriveInbox(
      snapshot({ threads: [thread], turnEnds: { thr_top: verdictFor(thread, "question") } }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_top",
        tier: "blocked",
        word: "answer",
        reason: "Ended its turn with a question for you",
      },
    ]);
    expect(view.tabCount).toBe(1);
  });

  it("puts a question ahead of finished work with a diff, which it would otherwise be Verify", () => {
    const thread = finished({ environment: environment("env_1") });
    const view = deriveInbox(
      snapshot({
        threads: [thread],
        evidence: { env_1: DIFF },
        turnEnds: { thr_top: verdictFor(thread, "question") },
      }),
    );
    expect(rows(view)).toMatchObject([{ tier: "blocked", word: "answer", evidence: null }]);
  });

  it("leaves an ordinary report as it was: FYI, or Verify with evidence", () => {
    const plain = finished({ id: "thr_plain" });
    const withDiff = finished({ id: "thr_diff", environment: environment("env_1") });
    const view = deriveInbox(
      snapshot({
        threads: [plain, withDiff],
        evidence: { env_1: DIFF },
        turnEnds: {
          thr_plain: verdictFor(plain, "report"),
          thr_diff: verdictFor(withDiff, "report"),
        },
      }),
    );
    expect(rows(view)).toMatchObject([
      { threadId: "thr_diff", tier: "verify", word: "verify" },
      { threadId: "thr_plain", tier: "fyi", word: "fyi" },
    ]);
  });

  it("lets a pending question form, plan or permission keep its own word over the verdict", () => {
    const form = finished({ id: "thr_form", hasPendingInteraction: true });
    const permission = finished({ id: "thr_perm", hasPendingInteraction: true });
    const view = deriveInbox(
      snapshot({
        threads: [form, permission],
        interactions: { thr_form: QUESTION, thr_perm: PERMISSION },
        turnEnds: {
          thr_form: verdictFor(form, "question"),
          thr_perm: verdictFor(permission, "question"),
        },
      }),
    );
    expect(rows(view)).toMatchObject([
      { threadId: "thr_form", word: "answer", reason: "Asks: which database?" },
      { threadId: "thr_perm", word: "approve", reason: "Wants to run rm -rf dist" },
    ]);
  });

  it("counts the thread as running once the human answers and a new turn starts", () => {
    const asked = finished();
    const answering = { ...asked, status: "active" as const, lastReadAt: NOW, isUnread: false };
    const view = deriveInbox(
      snapshot({ threads: [answering], turnEnds: { thr_top: verdictFor(asked, "question") } }),
    );
    expect(rows(view)).toEqual([]);
    expect(runningIds(view)).toEqual(["thr_top"]);
  });

  it("never carries the old question onto the next finished turn: it waits for that turn's verdict", () => {
    const asked = finished({ latestAttentionAt: NOW - 60_000 });
    const nextTurn = finished({ latestAttentionAt: NOW - 1_000 });
    const pending = deriveInbox(
      snapshot({ threads: [nextTurn], turnEnds: { thr_top: verdictFor(asked, "question") } }),
    );
    expect(rows(pending)).toEqual([]);
    expect(pending.running).toEqual([
      { threadId: "thr_top", title: "Pick a database", settling: true },
    ]);

    const answered = deriveInbox(
      snapshot({ threads: [nextTurn], turnEnds: { thr_top: verdictFor(nextTurn, "report") } }),
    );
    expect(rows(answered)).toMatchObject([{ tier: "fyi" }]);
  });

  it("holds every finished turn back while the verdicts load, so nothing flashes up as FYI", () => {
    const view = deriveInbox(snapshot({ threads: [finished()], turnEnds: {} }));
    expect(rows(view)).toEqual([]);
    expect(view.running).toEqual([]);
  });

  it("waits in the Running count for a verdict the server hasn't stored yet, then reports", () => {
    const thread = finished();
    const waiting = snapshot({ threads: [thread], turnEnds: { thr_top: null } });
    expect(rows(deriveInbox(waiting))).toEqual([]);
    expect(runningIds(deriveInbox(waiting))).toEqual(["thr_top"]);
    expect(nextChangeAt(waiting)).toBe(thread.latestAttentionAt + CLASSIFY_GRACE_MS);

    const late = deriveInbox(
      snapshot({
        threads: [thread],
        turnEnds: { thr_top: null },
        now: thread.latestAttentionAt + CLASSIFY_GRACE_MS,
      }),
    );
    expect(rows(late)).toMatchObject([{ threadId: "thr_top", tier: "fyi" }]);
  });

  it("treats a failed verdict read (no verdict) on an older turn as a report at once", () => {
    const thread = finished({ latestAttentionAt: NOW - CLASSIFY_GRACE_MS - 1 });
    const view = deriveInbox(snapshot({ threads: [thread], turnEnds: { thr_top: null } }));
    expect(rows(view)).toMatchObject([{ tier: "fyi" }]);
    expect(view.running).toEqual([]);
  });

  it("covers only turns that ended after the Inbox started (ADR 0010)", () => {
    const old = finished({ latestAttentionAt: 500 });
    const before = deriveInbox(
      snapshot({
        threads: [old],
        inboxStartedAt: 600,
        turnEnds: { thr_top: verdictFor(old, "question") },
      }),
    );
    expect(rows(before)).toEqual([]);
    expect(before.running).toEqual([]);

    const loadingStart = deriveInbox(
      snapshot({
        threads: [finished()],
        inboxStartedAt: null,
        turnEnds: { thr_top: verdictFor(finished(), "question") },
      }),
    );
    expect(rows(loadingStart)).toEqual([]);
  });

  it("doesn't ask again about a turn the human already verified", () => {
    const thread = finished();
    const view = deriveInbox(
      snapshot({
        threads: [thread],
        turnEnds: { thr_top: verdictFor(thread, "question") },
        verifications: {
          thr_top: {
            threadId: "thr_top",
            verifiedAt: thread.latestAttentionAt + 1,
            client: "phone",
            diffBase: null,
            prChecksState: null,
          },
        },
      }),
    );
    expect(rows(view)).toEqual([]);
  });

  it("never shows a hidden or archived thread, such as a classifier helper", () => {
    const helper = finished({ id: "thr_helper", isHidden: true });
    const archived = finished({ id: "thr_archived", isArchived: true });
    const view = deriveInbox(
      snapshot({
        threads: [helper, archived],
        turnEnds: { thr_helper: null, thr_archived: verdictFor(archived, "question") },
      }),
    );
    expect(rows(view)).toEqual([]);
    expect(view.running).toEqual([]);
    expect(nextChangeAt(snapshot({ threads: [helper], turnEnds: { thr_helper: null } }))).toBeNull();
  });
});

// A live child (claude-code / claude-haiku-5-5, thr_jytmedct3z, 2026-11-11)
// under this thread's parent: its sidebar attention stayed at its creation
// through two turns. The server stamped each verdict with the turn's
// `turn/completed` time. Turn one ended asking which name to use; turn two
// reported. The grilling skill load is assumed to have worked here.
const CREATED = 1794385648259;
const START = 1794385600000;
const TURN_ONE = 1794385658337;
const TURN_TWO = 1794385720248;
const owner = makeSidebarThread({
  id: "thr_x9gczbpym2",
  title: "Build: classifier into Inbox (#15)",
  status: "active",
  latestAttentionAt: 1794385500000,
  lastReadAt: 1794385500000,
});
const liveChild = (overrides: Overrides = {}) =>
  makeSidebarThread({
    id: "thr_jytmedct3z",
    title: "Scratch #15 grilling probe (claude-code)",
    parentThreadId: "thr_x9gczbpym2",
    latestAttentionAt: CREATED,
    createdAt: CREATED,
    lastReadAt: 1794385648273,
    isUnread: false,
    updatedAt: TURN_ONE + 2,
    ...overrides,
  });
const childVerdict = (verdict: "question" | "report", completedAt: number, grilling = false) =>
  turnEnd({ verdict, grilling, turnKey: CREATED, completedAt, classifiedAt: completedAt + 11 });

describe("deriveInbox: a child the classifier says answers to the human (ADR 0008)", () => {
  it("gives a child that ends its turn with a plain-text question its own item naming its parent", () => {
    const view = deriveInbox(
      snapshot({
        threads: [owner, liveChild()],
        inboxStartedAt: START,
        now: TURN_ONE + 1_000,
        childCompletions: { thr_jytmedct3z: TURN_ONE },
        turnEnds: { thr_jytmedct3z: childVerdict("question", TURN_ONE) },
      }),
    );
    expect(view.newForYou).toMatchObject([
      {
        threadId: "thr_jytmedct3z",
        tier: "blocked",
        word: "answer",
        attentionAt: TURN_ONE,
        parentThreadId: "thr_x9gczbpym2",
        audienceReason: "Its own item: it ended its turn with a question for you",
      },
    ]);
  });

  it("keeps folding a report child's turn into its parent (no own row)", () => {
    const stopped = { ...owner, status: "idle" as const };
    const view = deriveInbox(
      snapshot({
        threads: [stopped, liveChild()],
        inboxStartedAt: START,
        now: TURN_TWO + 1_000,
        childCompletions: { thr_jytmedct3z: TURN_TWO },
        turnEnds: { thr_jytmedct3z: childVerdict("report", TURN_TWO) },
      }),
    );
    expect(rowIds(view)).toEqual(["thr_x9gczbpym2"]);
    expect(rows(view)[0]).toMatchObject({
      tier: "fyi",
      folded: [{ threadId: "thr_jytmedct3z", state: "reported", attentionAt: TURN_TWO }],
    });
  });

  it("never applies turn one's question to turn two, though the child's attention didn't move", () => {
    const base = {
      threads: [owner, liveChild({ updatedAt: TURN_TWO + 1 })],
      inboxStartedAt: START,
      childCompletions: { thr_jytmedct3z: TURN_TWO },
      turnEnds: { thr_jytmedct3z: childVerdict("question", TURN_ONE) },
    };
    const pending = deriveInbox(snapshot({ ...base, now: TURN_TWO + 1_000 }));
    expect(rows(pending)).toEqual([]);
    expect(runningIds(pending)).toContain("thr_jytmedct3z");

    // The grace ran out with no verdict: a report, which folds.
    const late = deriveInbox(
      snapshot({ ...base, threads: [{ ...owner, status: "idle" }, base.threads[1]!], now: TURN_TWO + CLASSIFY_GRACE_MS }),
    );
    expect(rowIds(late)).toEqual(["thr_x9gczbpym2"]);
    expect(rows(late)[0]!.folded).toMatchObject([{ threadId: "thr_jytmedct3z" }]);
  });

  it("holds a child's report back while its turn end or verdict loads, rather than fold it and move it", () => {
    const stopped = { ...owner, status: "idle" as const };
    const cases: Partial<InboxSnapshot>[] = [
      { childCompletions: { thr_jytmedct3z: null }, turnEnds: {} },
      { childCompletions: { thr_jytmedct3z: TURN_TWO }, turnEnds: {} },
      { childCompletions: { thr_jytmedct3z: TURN_TWO }, turnEnds: { thr_jytmedct3z: null } },
    ];
    for (const overrides of cases) {
      const view = deriveInbox(
        snapshot({
          threads: [stopped, liveChild()],
          inboxStartedAt: START,
          now: TURN_TWO + 1_000,
          ...overrides,
        }),
      );
      expect(rows(view)).toEqual([]);
    }
  });

  it("gives a child that used the grilling skill its own item, its question as answer and its report as FYI", () => {
    const asking = deriveInbox(
      snapshot({
        threads: [owner, liveChild()],
        inboxStartedAt: START,
        now: TURN_ONE + 1_000,
        childCompletions: { thr_jytmedct3z: TURN_ONE },
        turnEnds: { thr_jytmedct3z: childVerdict("question", TURN_ONE, true) },
      }),
    );
    expect(asking.newForYou).toMatchObject([
      {
        threadId: "thr_jytmedct3z",
        word: "answer",
        parentThreadId: "thr_x9gczbpym2",
        audienceReason: "Its own item: it grills you with the grilling skill",
      },
    ]);

    // Opened and answered; turn two reports. Attention is still CREATED.
    const reporting = deriveInbox(
      snapshot({
        threads: [owner, liveChild({ lastReadAt: TURN_ONE + 30_000, updatedAt: TURN_TWO + 1 })],
        inboxStartedAt: START,
        now: TURN_TWO + 1_000,
        childCompletions: { thr_jytmedct3z: TURN_TWO },
        turnEnds: { thr_jytmedct3z: childVerdict("report", TURN_TWO, true) },
      }),
    );
    expect(reporting.newForYou).toMatchObject([
      {
        threadId: "thr_jytmedct3z",
        tier: "fyi",
        attentionAt: TURN_TWO,
        parentThreadId: "thr_x9gczbpym2",
        audienceReason: "Its own item: it grills you with the grilling skill",
      },
    ]);

    // Opening the child clears its FYI (ADR 0004).
    const opened = deriveInbox(
      snapshot({
        threads: [owner, liveChild({ lastReadAt: TURN_TWO + 5_000, updatedAt: TURN_TWO + 5_000 })],
        inboxStartedAt: START,
        now: TURN_TWO + 6_000,
        childCompletions: { thr_jytmedct3z: TURN_TWO },
        turnEnds: { thr_jytmedct3z: childVerdict("report", TURN_TWO, true) },
      }),
    );
    expect(rows(opened)).toEqual([]);
  });

  it("keeps a child waiting on a permission with its parent, whatever an earlier verdict said", () => {
    const stopped = { ...owner, status: "idle" as const };
    const view = deriveInbox(
      snapshot({
        threads: [stopped, liveChild({ hasPendingInteraction: true })],
        inboxStartedAt: START,
        now: TURN_ONE + 1_000,
        interactions: { thr_jytmedct3z: PERMISSION },
        childCompletions: { thr_jytmedct3z: TURN_ONE },
        turnEnds: { thr_jytmedct3z: childVerdict("question", TURN_ONE) },
      }),
    );
    expect(rowIds(view)).toEqual(["thr_x9gczbpym2"]);
    expect(rows(view)[0]).toMatchObject({
      word: "approve",
      childPermission: { childThreadId: "thr_jytmedct3z" },
    });
  });

  it("ignores a child's question from before the Inbox started", () => {
    const view = deriveInbox(
      snapshot({
        threads: [{ ...owner, status: "idle" }, liveChild()],
        inboxStartedAt: TURN_ONE + 1,
        now: TURN_ONE + 1_000,
        childCompletions: { thr_jytmedct3z: TURN_ONE },
        turnEnds: { thr_jytmedct3z: childVerdict("question", TURN_ONE) },
      }),
    );
    expect(rows(view)).toEqual([]);
  });
});
