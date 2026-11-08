// PROTOTYPE — throwaway. The inbox model the UI variants draw from: a quick,
// deterministic classifier over live sidebar threads, fixtures for states that
// are hard to reproduce, and localStorage stubs for Verify and Later. The logic
// is not the question here (that's the LOGIC prototype, issue #4).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Tier = 1 | 2 | 3 | 4;

export const TIER_LABEL: Record<Tier, string> = {
  1: "Needs you",
  2: "Broken",
  3: "Verify",
  4: "FYI",
};

export type Audience = "human" | "parent";

export interface Diff {
  files: number;
  insertions: number;
  deletions: number;
  commits: number;
}

export interface PullRequest {
  number: number;
  state: string;
  checks: { state: string; total: number; passed: number; failed: number; pending: number };
}

export interface Tests {
  passed: number;
  failed: number;
}

export interface Evidence {
  diff: Diff | null;
  pr: PullRequest | null;
  /** Stubbed: there is no SDK signal for test results yet. */
  tests: Tests | null;
}

export interface InboxItem {
  id: string;
  thread: PluginSidebarThread;
  tier: Tier;
  /** What the item wants from you, in two or three words. */
  reason: string;
  /** One word for the quietest rows: answer, approve, failed, verify, fyi. */
  word: string;
  /** `parent`-audience children folded into this item. */
  children: PluginSidebarThread[];
  /** The item had been verified, and the thread did more work since. */
  reopened: boolean;
  /** You've opened the thread since its last turn (isUnread false). */
  seen: boolean;
  /** Sort key within a tier, newest first. */
  at: number;
}

export interface Verification {
  verifiedBy: string;
  verifiedAt: number;
}

export interface FixtureExtras {
  audience?: Audience;
  reason?: string;
  word?: string;
  evidence?: Partial<Evidence>;
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

function brokenReason(thread: PluginSidebarThread): string | null {
  if (thread.status === "error") return "Failed";
  if (thread.queuedWork === "failed") return "Send failed";
  if (thread.indicator === "unread-error") return "Ended in an error";
  if (thread.runtimeStatus === "waiting-for-host") return "Stuck on its machine";
  return null;
}

/**
 * `human` children get their own item; `parent` children fold into their
 * parent's. Inferred for now: a delegated worker or a child that wakes its
 * parent on every outcome is `parent` audience (*inferred*, sdk-surface.md §4).
 */
export function audienceOf(thread: PluginSidebarThread, extras: Map<string, FixtureExtras>): Audience | null {
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
  /** Live items, ranked; snoozed ones are not here. */
  items: InboxItem[];
  /** Snoozed with Later, until the thread has something new. */
  snoozed: InboxItem[];
  running: PluginSidebarThread[];
  verifiedToday: PluginSidebarThread[];
}

export function classify(
  threads: readonly PluginSidebarThread[],
  verifications: Record<string, Verification>,
  snoozes: Record<string, number>,
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

  const all: InboxItem[] = [];
  const running: PluginSidebarThread[] = [];
  const verifiedToday: PluginSidebarThread[] = [];
  const startOfDay = new Date().setHours(0, 0, 0, 0);

  for (const thread of visible) {
    const v = verifications[thread.id];
    const fx = extras.get(thread.id);
    const base = { id: thread.id, thread, at: thread.latestAttentionAt, seen: !thread.isUnread, children: [], reopened: false };

    if (thread.hasPendingInteraction) {
      all.push({ ...base, tier: 1, reason: fx?.reason ?? "Waiting for you", word: fx?.word ?? "answer" });
      continue;
    }
    if (isRunning(thread)) {
      running.push(thread);
      continue;
    }
    const broken = brokenReason(thread);
    if (broken) {
      all.push({ ...base, tier: 2, reason: fx?.reason ?? broken, word: "failed" });
      continue;
    }
    if (audienceOf(thread, extras) === "parent") continue;

    const folded = (childrenOf.get(thread.id) ?? []).filter(
      (c) =>
        audienceOf(c, extras) === "parent" &&
        !isRunning(c) &&
        !c.hasPendingInteraction &&
        !brokenReason(c) &&
        !isVerified(c, verifications[c.id]),
    );

    if (isVerified(thread, v) && folded.length === 0) {
      if (v!.verifiedAt >= startOfDay) verifiedToday.push(thread);
      continue;
    }
    const ev = evidence(thread);
    const hasEvidence = (ev.diff?.files ?? 0) > 0 || ev.pr !== null;
    const finished = !isVerified(thread, v) && (thread.isUnread || hasEvidence || fx?.evidence !== undefined);
    if (finished) {
      all.push({ ...base, tier: 3, reason: fx?.reason ?? verifyReason(ev), word: "verify", children: folded, reopened: v !== undefined });
    } else if (folded.length > 0) {
      all.push({
        ...base,
        tier: 4,
        reason: `${folded.length} report${folded.length === 1 ? "" : "s"} back`,
        word: "fyi",
        children: folded,
        reopened: v !== undefined,
      });
    }
  }

  all.sort((a, b) => a.tier - b.tier || b.at - a.at);
  const isSnoozed = (i: InboxItem) => (snoozes[i.id] ?? 0) >= i.thread.latestAttentionAt;
  return { items: all.filter((i) => !isSnoozed(i)), snoozed: all.filter(isSnoozed), running, verifiedToday };
}

function verifyReason(ev: Evidence): string {
  if (ev.pr?.checks.state === "failing") return `${ev.pr.checks.failed} check${ev.pr.checks.failed === 1 ? "" : "s"} failing`;
  if (ev.pr?.checks.state === "pending") return "Checks running";
  if (ev.pr) return `PR #${ev.pr.number} ready`;
  if (ev.diff && ev.diff.files > 0) return `${ev.diff.files} file${ev.diff.files === 1 ? "" : "s"} changed`;
  return "Finished";
}

/** Evidence as short lines of words, for the places that show it (E's card, D's selected row). */
export function evidenceLines(item: InboxItem, ev: Evidence): string[] {
  const lines: string[] = [];
  if (ev.diff && ev.diff.files > 0) {
    lines.push(`+${ev.diff.insertions} −${ev.diff.deletions} · ${ev.diff.files} file${ev.diff.files === 1 ? "" : "s"}`);
  }
  if (ev.pr) {
    const c = ev.pr.checks;
    lines.push(
      c.state === "failing"
        ? `PR #${ev.pr.number} · ${c.failed} of ${c.total} checks failing`
        : c.state === "passing"
          ? `PR #${ev.pr.number} · checks ✓`
          : c.state === "pending"
            ? `PR #${ev.pr.number} · checks running`
            : `PR #${ev.pr.number} · no checks`,
    );
  }
  if (ev.tests) lines.push(ev.tests.failed > 0 ? `tests: ${ev.tests.failed} failing` : `tests ✓ ${ev.tests.passed}`);
  if (item.children.length > 0) lines.push(`${item.children.length} sub-thread${item.children.length === 1 ? "" : "s"} done`);
  if (item.reopened) lines.push("new work since you verified");
  return lines;
}

export function diffstat(ev: Evidence): string | null {
  return ev.diff && ev.diff.files > 0 ? `+${ev.diff.insertions} −${ev.diff.deletions}` : null;
}

// ---------------------------------------------------------------------------
// localStorage stubs. Same-window writes don't fire `storage`, so every write
// also dispatches CHANGE_EVENT for the sidebar and the header Verify button.

export const VERIFY_KEY = "bb.inbox-prototype.verifications.v1";
const SNOOZE_KEY = "bb.inbox-prototype.snoozes.v1";
const CHANGE_EVENT = "inbox-prototype:change";

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function useStored<T>(key: string, fallback: T): T {
  const [value, setValue] = useState(() => readJson(key, fallback));
  useEffect(() => {
    const sync = () => setValue(readJson(key, fallback));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

export function verifyThreads(ids: string[]) {
  const next = { ...readJson<Record<string, Verification>>(VERIFY_KEY, {}) };
  for (const id of ids) next[id] = { verifiedBy: "you", verifiedAt: Date.now() };
  writeJson(VERIFY_KEY, next);
}

export function useVerifications() {
  const verifications = useStored<Record<string, Verification>>(VERIFY_KEY, {});
  const reset = useCallback(() => {
    writeJson(VERIFY_KEY, {});
    writeJson(SNOOZE_KEY, {});
  }, []);
  return { verifications, verify: verifyThreads, reset };
}

export function useSnoozes() {
  const snoozes = useStored<Record<string, number>>(SNOOZE_KEY, {});
  const snooze = useCallback((id: string) => {
    writeJson(SNOOZE_KEY, { ...readJson<Record<string, number>>(SNOOZE_KEY, {}), [id]: Date.now() });
  }, []);
  const wake = useCallback((id: string) => {
    const next = { ...readJson<Record<string, number>>(SNOOZE_KEY, {}) };
    delete next[id];
    writeJson(SNOOZE_KEY, next);
  }, []);
  return { snoozes, snooze, wake };
}

/** Whether an Inbox prototype list is mounted in this client. */
const MOUNTED_KEY = "bb.inbox-prototype.mounted";
export function setListMounted(mounted: boolean) {
  if (mounted) writeJson(MOUNTED_KEY, true);
  else {
    localStorage.removeItem(MOUNTED_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}
export function useListMounted() {
  return useStored<boolean>(MOUNTED_KEY, false);
}

// ---------------------------------------------------------------------------
// Small persisted UI state (variant, fixtures, open shelves).

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
// Rows never jump while you're touching the list. Pointer events cover mouse
// and touch; touch fires pointerleave right after the tap, so the freeze
// lingers a few seconds after the last touch.

export function useTouchFreeze() {
  const [frozen, setFrozen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useMemo(
    () => ({
      onPointerEnter: () => {
        if (timer.current) clearTimeout(timer.current);
        setFrozen(true);
      },
      onPointerDown: () => {
        if (timer.current) clearTimeout(timer.current);
        setFrozen(true);
      },
      onPointerLeave: (e: { pointerType: string }) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFrozen(false), e.pointerType === "mouse" ? 0 : 4000);
      },
    }),
    [],
  );
  return { frozen, handlers };
}

/**
 * While frozen, rows keep their order and their per-row state (like `seen`)
 * from the moment the freeze started; new rows append at the end.
 */
export function useFrozenItems<T extends { id: string }>(items: T[], frozen: boolean): T[] {
  const snapshot = useRef<Map<string, T> | null>(null);
  const order = useRef<string[]>(items.map((i) => i.id));
  if (!frozen) {
    snapshot.current = null;
    order.current = items.map((i) => i.id);
    return items;
  }
  if (snapshot.current === null) snapshot.current = new Map(items.map((i) => [i.id, i]));
  const live = new Map(items.map((i) => [i.id, i]));
  const kept = order.current.filter((id) => live.has(id));
  const keptSet = new Set(kept);
  order.current = [...kept, ...items.map((i) => i.id).filter((id) => !keptSet.has(id))];
  return order.current.map((id) => ({ ...live.get(id)!, ...pick(snapshot.current!.get(id)) }));
}

function pick<T>(frozen: T | undefined): Partial<T> {
  if (!frozen) return {};
  const f = frozen as unknown as { seen?: boolean; tier?: Tier };
  return { seen: f.seen, tier: f.tier } as unknown as Partial<T>;
}

// ---------------------------------------------------------------------------
// Fixtures: fake threads for states that are hard to reproduce live.

const MIN = 60_000;
export const FIXTURE_PROJECT_ID = "fx-project";

function fx(id: string, title: string, overrides: Partial<PluginSidebarThread>): PluginSidebarThread {
  const now = Date.now();
  return {
    id,
    projectId: FIXTURE_PROJECT_ID,
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

export function buildFixtures(): { threads: PluginSidebarThread[]; extras: Map<string, FixtureExtras> } {
  const now = Date.now();
  const extras = new Map<string, FixtureExtras>();
  const threads: PluginSidebarThread[] = [];
  const add = (t: PluginSidebarThread, e?: FixtureExtras) => {
    threads.push(t);
    if (e) extras.set(t.id, e);
  };
  const waiting = { hasPendingInteraction: true, indicator: "waiting-for-input" as const, isUnread: true };

  add(fx("fx-plan", "Migrate auth to session tokens", { ...waiting, latestAttentionAt: now - 2 * MIN }), {
    reason: "Plan to review",
    word: "approve",
  });
  add(fx("fx-pr", "Add rate limiting to public API", { indicator: "unread-success", isUnread: true, latestAttentionAt: now - 11 * MIN }), {
    reason: "2 checks failing",
    evidence: {
      diff: { files: 7, insertions: 312, deletions: 41, commits: 1 },
      pr: { number: 418, state: "open", checks: { state: "failing", total: 6, passed: 4, failed: 2, pending: 0 } },
      tests: { passed: 38, failed: 2 },
    },
  });
  add(fx("fx-broken", "Regenerate OpenAPI client", { status: "error", indicator: "unread-error", isUnread: true, latestAttentionAt: now - 25 * MIN }), {
    reason: "Rate limited (429)",
  });

  // A parent with a grilling child (`human`) and two research children (`parent`).
  add(fx("fx-parent", "Design: billing v2", { latestAttentionAt: now - 8 * MIN }), {
    reason: "Drafted ADR 0007",
    evidence: { diff: { files: 2, insertions: 140, deletions: 0, commits: 1 } },
  });
  add(fx("fx-grill", "Grill: billing edge cases", { ...waiting, parentThreadId: "fx-parent", parentNotifications: "off", latestAttentionAt: now - 1 * MIN }), {
    audience: "human",
    reason: "Asks a question",
  });
  add(fx("fx-research-1", "Research: Stripe metered billing", { parentThreadId: "fx-parent", lifecycleOwnerThreadId: "fx-parent", latestAttentionAt: now - 14 * MIN }), {
    audience: "parent",
  });
  add(fx("fx-research-2", "Research: competitor pricing", { parentThreadId: "fx-parent", lifecycleOwnerThreadId: "fx-parent", latestAttentionAt: now - 16 * MIN }), {
    audience: "parent",
  });

  // Already seen: finished work you've opened but not verified, and an FYI parent.
  add(fx("fx-seen", "Bump eslint to v10", { isUnread: false, latestAttentionAt: now - 95 * MIN }), {
    reason: "3 files changed",
    evidence: {
      diff: { files: 3, insertions: 22, deletions: 19, commits: 1 },
      pr: { number: 421, state: "open", checks: { state: "passing", total: 4, passed: 4, failed: 0, pending: 0 } },
    },
  });
  add(fx("fx-fyi", "Survey: flaky tests this week", { latestAttentionAt: now - 40 * MIN }));
  add(fx("fx-fyi-1", "Scan CI logs for flakes", { parentThreadId: "fx-fyi", lifecycleOwnerThreadId: "fx-fyi", latestAttentionAt: now - 41 * MIN }), {
    audience: "parent",
  });

  ["Index embeddings", "Refactor router", "Write e2e for signup", "Bump deps", "Profile cold start"].forEach((title, i) => {
    add(fx(`fx-run-${i + 1}`, title, { status: "active", runtimeStatus: "active", indicator: "runtime", latestAttentionAt: now - (i + 1) * MIN }));
  });

  return { threads, extras };
}
