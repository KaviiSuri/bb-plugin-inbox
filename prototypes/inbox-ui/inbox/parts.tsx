// PROTOTYPE — small row atoms shared by the variants: bb's own status glyph,
// titles, evidence chips and the evidence panel. Variants own their layout.
import { createContext, useContext, type ReactNode, type MouseEvent } from "react";
import type * as React from "react";
import {
  ThreadTitle,
  experimental_ProviderIcon as ProviderIcon,
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
  experimental_resolveThreadStatus,
  experimental_useProviders,
  useBbNavigate,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { COARSE_POINTER_ROW_HEIGHT_CLASS } from "@/components/ui/coarse-pointer-sizing";
import {
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
  SIDEBAR_STATUS_GLYPH_BOX_CLASS,
  SIDEBAR_CONTROL_BUTTON_CLASS,
  getSidebarThreadRowPaddingLeft,
} from "@/components/ui/sidebar-row-classes";
import type { Evidence, InboxItem, Tier } from "./model";
import { TIER_ICON, TIER_LABEL } from "./model";

export interface InboxContextValue {
  activeThreadId: string | null;
  evidence: (thread: PluginSidebarThread) => Evidence;
  verify: (item: InboxItem) => void;
  onNavigate: () => void;
}

export const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox(): InboxContextValue {
  const value = useContext(InboxContext);
  if (!value) throw new Error("InboxContext missing");
  return value;
}

export function useOpenThread() {
  const navigate = useBbNavigate();
  const { onNavigate } = useInbox();
  return (thread: PluginSidebarThread, event?: MouseEvent) => {
    event?.preventDefault();
    if (thread.id.startsWith("fx-")) return; // fixtures have nowhere to go
    navigate.toThread(thread.id);
    onNavigate();
  };
}

export function rowClass(isActive: boolean, extra?: string) {
  return cn(
    "group/inbox-row relative cursor-pointer",
    SIDEBAR_ROW_BASE_CLASS,
    LIST_HOVER_TRANSITION,
    COARSE_POINTER_ROW_HEIGHT_CLASS,
    isActive ? SIDEBAR_ROW_SELECTED_STATE_CLASS : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
    extra,
  );
}

/** A row that opens its thread. A div, so buttons can sit inside it. */
export function RowLink({
  thread,
  className,
  style,
  onClick,
  children,
}: {
  thread: PluginSidebarThread;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  const open = useOpenThread();
  return (
    <div
      role="link"
      tabIndex={0}
      data-href={thread.href}
      className={className}
      style={style}
      onClick={(e) => (onClick ? onClick(e) : open(thread, e))}
      onKeyDown={(e) => {
        if (e.key === "Enter") open(thread);
      }}
    >
      {children}
    </div>
  );
}

export function rowPadding(depth = 0) {
  return { paddingLeft: getSidebarThreadRowPaddingLeft(depth), paddingRight: 4 };
}

/** bb's own status glyph, resolved the way its list resolves it. */
export function StatusGlyph({
  thread,
  hidden = [],
}: {
  thread: PluginSidebarThread;
  hidden?: readonly PluginSidebarThread[];
}) {
  const status = experimental_resolveThreadStatus({
    thread,
    hiddenThreads: hidden,
    hasUnsubmittedDraft: false,
    rowStatus: null,
  });
  if (status.indicator === "none" && status.rowStatus === null) return null;
  return (
    <span className={cn(SIDEBAR_ROW_GLYPH_SLOT_CLASS, SIDEBAR_STATUS_GLYPH_BOX_CLASS)}>
      <ThreadStatusGlyph indicator={status.indicator} rowStatus={status.rowStatus} />
    </span>
  );
}

export function Provider({ thread }: { thread: PluginSidebarThread }) {
  const { providers } = experimental_useProviders();
  const provider = providers.find((p) => p.id === thread.providerId) ?? { id: thread.providerId };
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground" title={"displayName" in provider ? provider.displayName : undefined}>
      <ProviderIcon providerKind="agent" provider={provider} className="size-3.5" />
    </span>
  );
}

/** Live threads render bb's ThreadTitle (mention chips); fixtures, plain text. */
export function Title({ thread, className }: { thread: PluginSidebarThread; className?: string }) {
  return (
    <span className={cn("bb-thread-title min-w-0 truncate", className)} title={thread.displayTitle}>
      {thread.id.startsWith("fx-") ? thread.displayTitle : <ThreadTitle threadId={thread.id} />}
      {thread.id.startsWith("fx-") ? <FixtureMark /> : null}
    </span>
  );
}

function FixtureMark() {
  return (
    <span title="Fixture: a fake thread" className="ml-1 align-middle font-mono text-[10px] text-subtle-foreground">
      fx
    </span>
  );
}

export function TierIcon({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <Icon
      name={TIER_ICON[tier]}
      aria-label={TIER_LABEL[tier]}
      className={cn("size-3.5 shrink-0", tierTone(tier), className)}
    />
  );
}

export function tierTone(tier: Tier) {
  switch (tier) {
    case 1:
      return "text-amber-500";
    case 2:
      return "text-destructive";
    case 3:
      return "text-success-foreground";
    case 4:
      return "text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// Evidence

function Chip({ icon, children, tone, title }: { icon: string; children: ReactNode; tone?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums leading-4", tone ?? "text-muted-foreground")}>
      <Icon name={icon} className="size-3" aria-hidden />
      {children}
    </span>
  );
}

export function checksTone(state: string) {
  if (state === "failing") return "text-destructive";
  if (state === "passing") return "text-success-foreground";
  if (state === "pending") return "text-amber-500";
  return "text-muted-foreground";
}

/** One line of compact evidence: diff stat, PR checks, tests, folded reports. */
export function EvidenceChips({ item, ev, className }: { item: InboxItem; ev: Evidence; className?: string }) {
  const parts: ReactNode[] = [];
  if (ev.diff && ev.diff.files > 0) {
    parts.push(
      <Chip key="diff" icon="FileDiff" title={`${ev.diff.files} files changed`}>
        <span className="text-success-foreground">+{ev.diff.insertions}</span>
        <span className="text-destructive">−{ev.diff.deletions}</span>
      </Chip>,
    );
  }
  if (ev.pr) {
    const c = ev.pr.checks;
    parts.push(
      <Chip key="pr" icon="GitPullRequest" tone={checksTone(c.state)} title={`PR #${ev.pr.number}: checks ${c.state}`}>
        #{ev.pr.number}
        {c.state === "failing" ? ` ✕${c.failed}` : c.state === "passing" ? " ✓" : c.state === "pending" ? " …" : ""}
      </Chip>,
    );
  }
  if (ev.tests) {
    parts.push(
      <Chip key="tests" icon="Beaker" tone={ev.tests.failed > 0 ? "text-destructive" : undefined} title="Tests (stubbed)">
        {ev.tests.failed > 0 ? `${ev.tests.failed} failed` : `${ev.tests.passed} passed`}
      </Chip>,
    );
  }
  if (item.children.length > 0) {
    parts.push(
      <Chip key="kids" icon="ChildThread" title="Sub-thread reports folded into this item">
        {item.children.length}
      </Chip>,
    );
  }
  if (parts.length === 0) return null;
  return <span className={cn("flex min-w-0 items-center gap-2 overflow-hidden", className)}>{parts}</span>;
}

/** The full evidence bundle: what you'd look at before signing off. */
export function EvidencePanel({ item, ev, compact }: { item: InboxItem; ev: Evidence; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2 text-xs", compact && "gap-1.5")}>
      {item.reopened ? (
        <div className="flex items-center gap-1 text-amber-500">
          <Icon name="RotateCcw" className="size-3" /> New work since you verified it
        </div>
      ) : null}
      <EvidenceBlock icon="FileDiff" label="Diff">
        {ev.diff && ev.diff.files > 0 ? (
          <>
            <div className="text-muted-foreground">
              {ev.diff.files} files · <span className="text-success-foreground">+{ev.diff.insertions}</span>{" "}
              <span className="text-destructive">−{ev.diff.deletions}</span>
              {ev.diff.commits.length > 0 ? ` · ${ev.diff.commits.length} commit${ev.diff.commits.length === 1 ? "" : "s"}` : ""}
            </div>
            <ul className="mt-0.5 flex flex-col">
              {ev.diff.fileList.slice(0, compact ? 3 : 5).map((f) => (
                <li key={f.path} className="flex items-center gap-1.5 font-mono text-[11px] leading-5">
                  <span className="w-3 text-subtle-foreground">{f.status}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground/90">{f.path}</span>
                  {f.insertions !== undefined ? (
                    <span className="tabular-nums text-subtle-foreground">
                      +{f.insertions} −{f.deletions ?? 0}
                    </span>
                  ) : null}
                </li>
              ))}
              {ev.diff.fileList.length > (compact ? 3 : 5) ? (
                <li className="text-[11px] text-subtle-foreground">+{ev.diff.fileList.length - (compact ? 3 : 5)} more</li>
              ) : null}
            </ul>
          </>
        ) : (
          <span className="text-subtle-foreground">No changes</span>
        )}
      </EvidenceBlock>
      <EvidenceBlock icon="GitPullRequest" label="PR">
        {ev.pr ? (
          <span className={checksTone(ev.pr.checks.state)}>
            #{ev.pr.number} {ev.pr.state} · checks {ev.pr.checks.state}
            {ev.pr.checks.total > 0 ? ` (${ev.pr.checks.passed}/${ev.pr.checks.total})` : ""}
            {ev.pr.review !== "none" ? ` · review ${ev.pr.review}` : ""}
          </span>
        ) : (
          <span className="text-subtle-foreground">No pull request</span>
        )}
      </EvidenceBlock>
      <EvidenceBlock icon="Beaker" label="Tests">
        {ev.tests ? (
          <span className={ev.tests.failed > 0 ? "text-destructive" : "text-success-foreground"}>
            {ev.tests.passed} passed, {ev.tests.failed} failed <span className="text-subtle-foreground">(stub)</span>
          </span>
        ) : (
          <span className="text-subtle-foreground">No test signal (stub)</span>
        )}
      </EvidenceBlock>
      {item.children.length > 0 ? (
        <EvidenceBlock icon="ChildThread" label="Reports">
          <ul className="flex flex-col gap-1">
            {item.children.map((c) => (
              <li key={c.thread.id} className="leading-4">
                <span className="text-foreground/90">{c.thread.displayTitle}</span>
                <span className="text-muted-foreground"> — {c.summary}</span>
              </li>
            ))}
          </ul>
        </EvidenceBlock>
      ) : null}
    </div>
  );
}

function EvidenceBlock({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="flex w-14 shrink-0 items-start gap-1 pt-px text-subtle-foreground">
        <Icon name={icon} className="mt-0.5 size-3" aria-hidden />
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function VerifyIconButton({ item, className }: { item: InboxItem; className?: string }) {
  const { verify } = useInbox();
  return (
    <button
      type="button"
      title="Verify — sign off on this work"
      aria-label={`Verify ${item.thread.displayTitle}`}
      className={cn(SIDEBAR_CONTROL_BUTTON_CLASS, "inline-flex items-center justify-center", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        verify(item);
      }}
    >
      <Icon name="Check" className="size-3.5" />
    </button>
  );
}

export function SectionHeader({
  children,
  right,
  onClick,
  collapsed,
}: {
  children: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/section flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-muted-foreground hover:text-sidebar-foreground"
    >
      {children}
      <span className="flex-1" />
      {right}
      {collapsed !== undefined ? (
        <Icon
          name="ChevronRight"
          className={cn("size-3 opacity-0 transition-transform group-hover/section:opacity-100", !collapsed && "rotate-90")}
        />
      ) : null}
    </button>
  );
}

export function relativeTime(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
