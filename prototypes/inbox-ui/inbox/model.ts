// PROTOTYPE — throwaway. The inbox model the UI variants draw from: a quick,
// deterministic classifier over live sidebar threads, fixtures for states that
// are hard to reproduce, and a localStorage "verify" stub. The logic is not the
// question here (that's the LOGIC prototype, issue #4); don't polish it.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Tier = 1 | 2 | 3 | 4;

export const TIER_LABEL: Record<Tier, string> = {
  1: "Blocked on you",
  2: "Broken",
  3: "Verify",
  4: "FYI",
};

export const TIER_ICON: Record<Tier, string> = {
  1: "MessageQuestion",
  2: "AlertTriangle",
  3: "SecurityCheck",
  4: "Info",
};

export type Audience = "human" | "parent";

export interface Diff {
  files: number;
  insertions: number;
  deletions: number;
  fileList: { path: string; status: string; insertions?: number; deletions?: number }[];
  commits: { shortSha: string; subject: string }[];
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  checks: { state: string; total: number; passed: number; failed: number; pending: number };
  review: string;
}

export interface Tests {
  passed: number;
  failed: number;
  /** Stubbed: there is no SDK signal for test results yet. */
  stub: true;
}

export interface Evidence {
  diff: Diff | null;
  pr: PullRequest | null;
  tests: Tests | null;
}

export interface ChildSummary {
  thread: PluginSidebarThread;
  summary: string;
}

export interface InboxItem {
  id: string;
  thread: PluginSidebarThread;
  tier: Tier;
  /** What the item is waiting on, in a few words. */
  waitingOn: string;
  /** `parent`-audience children folded into this item. */
  children: ChildSummary[];
  /** The item had been verified, and the thread did more work since. */
  reopened: boolean;
  /** Sort key within a tier, newest first. */
  at: number;
  isFixture: boolean;
}

export interface Verification {
  verifiedBy: string;
  verifiedAt: number;
}

export interface FixtureExtras {
  audience?: Audience;
  waitingOn?: string;
  evidence?: Partial<Evidence>;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Classifier

const RUNNING_STATUSES = new Set(["active", "starting", "stopping", "pending"]);

export function isRunning(thread: PluginSidebarThread): boolean {
  if (thread.hasPendingInteraction) return false;
  if (RUNNING_STATUSES.has(thread.status)) return true;
  const a = thread.activity;
  return a.workflows + a.backgroundAgents + a.backgroundCommands > 0;
}

function isBroken(thread: PluginSidebarThread): string | null {
  if (thread.status === "error") return "Turn failed";
  if (thread.queuedWork === "failed") return "Queued message failed to send";
  if (thread.indicator === "unread-error") return "Ended with an error";
  if (thread.runtimeStatus === "waiting-for-host") return "Stuck waiting for its machine";
  return null;
}

/**
 * `human` children ask the user directly and get their own item; `parent`
 * children fold into their parent's item. Declared at spawn time later; for
 * now, inferred: a delegated worker or a child that wakes its parent on every
 * outcome is `parent` audience (*inferred*, see docs/research/sdk-surface.md §4).
 */
export function audienceOf(
  thread: PluginSidebarThread,
  extras: Map<string, FixtureExtras>,
): Audience | null {
  if (thread.parentThreadId === null) return null;
  const declared = extras.get(thread.id)?.audience;
  if (declared) return declared;
  if (thread.hasPendingInteraction) return "human";
  if (thread.lifecycleOwnerThreadId !== null) return "parent";
  if (thread.parentNotifications === "auto") return "parent";
  return "human";
}

function isVerified(thread: PluginSidebarThread, v: Verification | undefined): boolean {
  return v !== undefined && v.verifiedAt >= thread.latestAttentionAt;
}

export interface Classified {
  items: InboxItem[];
  running: PluginSidebarThread[];
  verifiedCount: number;
}

export function classify(
  threads: readonly PluginSidebarThread[],
  verifications: Record<string, Verification>,
  evidence: (thread: PluginSidebarThread) => Evidence,
  extras: Map<string, FixtureExtras>,
): Classified {
  const visible = threads.filter((t) => !t.isHidden && !t.isArchived);
  const byId = new Map(visible.map((t) => [t.id, t]));
  const childrenOf = new Map<string, PluginSidebarThread[]>();
  for (const t of visible) {
    if (t.parentThreadId && byId.has(t.parentThreadId)) {
      const list = childrenOf.get(t.parentThreadId) ?? [];
      list.push(t);
      childrenOf.set(t.parentThreadId, list);
    }
  }

  const items: InboxItem[] = [];
  const running: PluginSidebarThread[] = [];
  let verifiedCount = 0;

  for (const thread of visible) {
    const v = verifications[thread.id];
    const fx = extras.get(thread.id);
    const isFixture = thread.id.startsWith("fx-");
    const base = { id: thread.id, thread, at: thread.latestAttentionAt, isFixture };

    if (thread.hasPendingInteraction) {
      items.push({
        ...base,
        tier: 1,
        waitingOn: fx?.waitingOn ?? "Waiting for your input",
        children: [],
        reopened: false,
      });
      continue;
    }
    if (isRunning(thread)) {
      running.push(thread);
      continue;
    }
    const broken = isBroken(thread);
    if (broken) {
      items.push({ ...base, tier: 2, waitingOn: fx?.waitingOn ?? broken, children: [], reopened: false });
      continue;
    }

    const audience = audienceOf(thread, extras);
    // `parent` children never get their own item; their parent carries them.
    if (audience === "parent") continue;

    const folded: ChildSummary[] = (childrenOf.get(thread.id) ?? [])
      .filter(
        (c) =>
          audienceOf(c, extras) === "parent" &&
          !isRunning(c) &&
          !c.hasPendingInteraction &&
          !isBroken(c) &&
          !isVerified(c, verifications[c.id]),
      )
      .map((c) => ({
        thread: c,
        summary: extras.get(c.id)?.summary ?? childSummaryStub(c, evidence(c)),
      }));

    if (isVerified(thread, v) && folded.length === 0) {
      verifiedCount += 1;
      continue;
    }
    const ev = evidence(thread);
    const hasEvidence = (ev.diff?.files ?? 0) > 0 || ev.pr !== null;
    const finishedForYou =
      !isVerified(thread, v) && (thread.isUnread || hasEvidence || fx?.evidence !== undefined);

    if (finishedForYou) {
      items.push({
        ...base,
        tier: 3,
        waitingOn: fx?.waitingOn ?? verifyReason(thread, ev),
        children: folded,
        reopened: v !== undefined,
      });
    } else if (folded.length > 0) {
      items.push({
        ...base,
        tier: 4,
        waitingOn: `${folded.length} sub-thread${folded.length === 1 ? "" : "s"} reported back`,
        children: folded,
        reopened: v !== undefined,
      });
    }
  }

  items.sort((a, b) => a.tier - b.tier || b.at - a.at);
  return { items, running, verifiedCount };
}

function verifyReason(thread: PluginSidebarThread, ev: Evidence): string {
  if (ev.pr) {
    if (ev.pr.checks.state === "failing") return `PR #${ev.pr.number}: checks failing`;
    if (ev.pr.checks.state === "pending") return `PR #${ev.pr.number}: checks running`;
    return `PR #${ev.pr.number} ready to review`;
  }
  if (ev.diff && ev.diff.files > 0) return `Finished with ${ev.diff.files} changed file${ev.diff.files === 1 ? "" : "s"}`;
  return thread.isUnread ? "Finished, unread report" : "Finished";
}

function childSummaryStub(thread: PluginSidebarThread, ev: Evidence): string {
  if (ev.diff && ev.diff.files > 0) return `Changed ${ev.diff.files} file${ev.diff.files === 1 ? "" : "s"}`;
  return "Finished (summary needs threads.output)";
}

// ---------------------------------------------------------------------------
// Verification stub: localStorage only, no real mutation.

const VERIFY_KEY = "bb.inbox-prototype.verifications.v1";

function readVerifications(): Record<string, Verification> {
  try {
    return JSON.parse(localStorage.getItem(VERIFY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function useVerifications() {
  const [verifications, setVerifications] = useState(readVerifications);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === VERIFY_KEY) setVerifications(readVerifications());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const write = useCallback((next: Record<string, Verification>) => {
    localStorage.setItem(VERIFY_KEY, JSON.stringify(next));
    setVerifications(next);
  }, []);
  const verify = useCallback(
    (ids: string[]) => {
      const next = { ...readVerifications() };
      for (const id of ids) next[id] = { verifiedBy: "you", verifiedAt: Date.now() };
      write(next);
    },
    [write],
  );
  const reset = useCallback(() => write({}), [write]);
  return { verifications, verify, reset };
}

// ---------------------------------------------------------------------------
// Small persisted UI state (variant, fixtures, collapsed lanes).

export function useLocalState<T>(key: string, initial: T) {
  const fullKey = `bb.inbox-prototype.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        localStorage.setItem(fullKey, JSON.stringify(resolved));
        return resolved;
      });
    },
    [fullKey],
  );
  return [value, set] as const;
}

// ---------------------------------------------------------------------------
// Freeze the order while the pointer is over the list; re-sort on leave.

export function useFrozenOrder<T extends { id: string }>(items: T[], frozen: boolean): T[] {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const liveIds = items.map((i) => i.id).join("|");
  useEffect(() => {
    if (!frozen) {
      setOrder(items.map((i) => i.id));
      return;
    }
    // While frozen, keep known rows where they are; append new ones at the end.
    setOrder((prev) => {
      const live = new Set(items.map((i) => i.id));
      const kept = prev.filter((id) => live.has(id));
      const keptSet = new Set(kept);
      return [...kept, ...items.map((i) => i.id).filter((id) => !keptSet.has(id))];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, liveIds]);
  return useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return order.map((id) => byId.get(id)).filter((i): i is T => i !== undefined);
  }, [items, order]);
}

// ---------------------------------------------------------------------------
// Fixtures: fake threads for states that are hard to reproduce live.

const MIN = 60_000;

function fx(
  id: string,
  title: string,
  overrides: Partial<PluginSidebarThread>,
  projectId: string,
): PluginSidebarThread {
  const now = Date.now();
  return {
    id,
    projectId,
    href: "#",
    title,
    titleFallback: title,
    displayTitle: title,
    parentThreadId: null,
    parentNotifications: "auto",
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "pi",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    isHidden: false,
    environment: null,
    host: null,
    createdAt: now - 60 * MIN,
    updatedAt: now - 5 * MIN,
    lastReadAt: null,
    latestAttentionAt: now - 5 * MIN,
    ...overrides,
  } as PluginSidebarThread;
}

export function buildFixtures(projectId: string): {
  threads: PluginSidebarThread[];
  extras: Map<string, FixtureExtras>;
} {
  const now = Date.now();
  const extras = new Map<string, FixtureExtras>();
  const threads: PluginSidebarThread[] = [];
  const add = (t: PluginSidebarThread, e?: FixtureExtras) => {
    threads.push(t);
    if (e) extras.set(t.id, e);
  };

  add(
    fx("fx-plan", "Migrate auth to session tokens", {
      hasPendingInteraction: true,
      indicator: "waiting-for-input",
      status: "idle",
      isUnread: true,
      latestAttentionAt: now - 2 * MIN,
    }, projectId),
    { waitingOn: "Plan ready for review", evidence: { diff: null } },
  );

  add(
    fx("fx-pr", "Add rate limiting to public API", {
      indicator: "unread-success",
      isUnread: true,
      latestAttentionAt: now - 11 * MIN,
    }, projectId),
    {
      evidence: {
        diff: {
          files: 7, insertions: 312, deletions: 41,
          fileList: [
            { path: "server/ratelimit.ts", status: "A", insertions: 188, deletions: 0 },
            { path: "server/routes/public.ts", status: "M", insertions: 64, deletions: 22 },
            { path: "server/ratelimit.test.ts", status: "A", insertions: 51, deletions: 0 },
          ],
          commits: [{ shortSha: "9f3c1a2", subject: "Token-bucket limiter on public routes" }],
        },
        pr: {
          number: 418, title: "Add rate limiting to public API", url: "#", state: "open",
          checks: { state: "failing", total: 6, passed: 4, failed: 2, pending: 0 },
          review: "none",
        },
        tests: { passed: 38, failed: 2, stub: true },
      },
      waitingOn: "PR #418: 2 of 6 checks failing",
    },
  );

  add(
    fx("fx-broken", "Regenerate OpenAPI client", {
      status: "error",
      indicator: "unread-error",
      isUnread: true,
      latestAttentionAt: now - 25 * MIN,
    }, projectId),
    { waitingOn: "Provider error: rate limited (429)" },
  );

  // A parent with a grilling child (`human`) and two research children (`parent`).
  add(
    fx("fx-parent", "Design: billing v2", {
      latestAttentionAt: now - 8 * MIN,
      indicator: "none",
    }, projectId),
    {
      evidence: {
        diff: {
          files: 2, insertions: 140, deletions: 0,
          fileList: [
            { path: "docs/adr/0007-billing-v2.md", status: "A", insertions: 96, deletions: 0 },
            { path: "CONTEXT.md", status: "M", insertions: 44, deletions: 0 },
          ],
          commits: [{ shortSha: "c0ffee1", subject: "ADR 0007: usage-based billing" }],
        },
      },
      waitingOn: "Drafted ADR 0007 from its research",
    },
  );
  add(
    fx("fx-grill", "Grill: billing edge cases", {
      parentThreadId: "fx-parent",
      parentNotifications: "off",
      hasPendingInteraction: true,
      indicator: "waiting-for-input",
      isUnread: true,
      latestAttentionAt: now - 1 * MIN,
    }, projectId),
    { audience: "human", waitingOn: "Question 3 of ~8: proration on downgrade?" },
  );
  add(
    fx("fx-research-1", "Research: Stripe metered billing", {
      parentThreadId: "fx-parent",
      lifecycleOwnerThreadId: "fx-parent",
      latestAttentionAt: now - 14 * MIN,
    }, projectId),
    { audience: "parent", summary: "Metered prices bill in arrears; usage records are idempotent per timestamp." },
  );
  add(
    fx("fx-research-2", "Research: competitor pricing pages", {
      parentThreadId: "fx-parent",
      lifecycleOwnerThreadId: "fx-parent",
      latestAttentionAt: now - 16 * MIN,
    }, projectId),
    { audience: "parent", summary: "4 of 6 show a usage slider; 2 hide prices behind sales." },
  );

  // An FYI-only parent: its research children reported back, nothing else to verify.
  add(
    fx("fx-fyi", "Survey: flaky tests this week", {
      latestAttentionAt: now - 40 * MIN,
    }, projectId),
  );
  add(
    fx("fx-fyi-1", "Scan CI logs for flakes", {
      parentThreadId: "fx-fyi",
      lifecycleOwnerThreadId: "fx-fyi",
      latestAttentionAt: now - 41 * MIN,
    }, projectId),
    { audience: "parent", summary: "3 flaky specs, all in checkout.e2e; 2 share a fixture." },
  );

  for (let i = 1; i <= 5; i++) {
    add(
      fx(`fx-run-${i}`, ["Index embeddings", "Refactor router", "Write e2e for signup", "Bump deps", "Profile cold start"][i - 1], {
        status: "active",
        runtimeStatus: "active",
        indicator: "runtime",
        latestAttentionAt: now - i * MIN,
      }, projectId),
    );
  }

  return { threads, extras };
}
