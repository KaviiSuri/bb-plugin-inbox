// PROTOTYPE — small atoms shared by the variants. Variants own their layout.
// Colour rule for every variant (docs/research/visual-prior-art.md, "What the
// field says"): only what needs you is coloured, amber for a request, red for
// broken. Everything else is the sidebar's neutral greys.
import { createContext, useContext, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
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
import {
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
  SIDEBAR_STATUS_GLYPH_BOX_CLASS,
  getSidebarThreadRowPaddingLeft,
} from "@/components/ui/sidebar-row-classes";
import type { Evidence, InboxItem, Tier } from "./model";

export interface InboxContextValue {
  activeThreadId: string | null;
  evidence: (thread: PluginSidebarThread) => Evidence;
  verify: (item: InboxItem) => void;
  snooze: (item: InboxItem) => void;
  wake: (id: string) => void;
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

/** Desktop keeps bb's row height; a touch screen gets at least 40px. */
export const ROW_HEIGHT = "min-h-[var(--bb-sidebar-row-height)] max-md:pointer-coarse:min-h-10";
export const DENSE_ROW_HEIGHT = "h-7 max-md:pointer-coarse:h-10";

export function rowClass(isActive: boolean, extra?: string) {
  return cn(
    "group/inbox-row relative cursor-pointer select-none",
    SIDEBAR_ROW_BASE_CLASS,
    LIST_HOVER_TRANSITION,
    isActive ? SIDEBAR_ROW_SELECTED_STATE_CLASS : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
    extra,
  );
}

export function rowPadding(depth = 0): CSSProperties {
  return { paddingLeft: getSidebarThreadRowPaddingLeft(depth), paddingRight: 8 };
}

/** A row that opens its thread (or does `onClick`). A div, so buttons can sit inside. */
export function RowLink({
  thread,
  className,
  style,
  onClick,
  children,
}: {
  thread: PluginSidebarThread;
  className?: string;
  style?: CSSProperties;
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

/** bb's own status glyph, resolved the way its list resolves it. */
export function StatusGlyph({ thread, hidden = [] }: { thread: PluginSidebarThread; hidden?: readonly PluginSidebarThread[] }) {
  const status = experimental_resolveThreadStatus({ thread, hiddenThreads: hidden, hasUnsubmittedDraft: false, rowStatus: null });
  if (status.indicator === "none" && status.rowStatus === null) return null;
  return (
    <span className={cn(SIDEBAR_ROW_GLYPH_SLOT_CLASS, SIDEBAR_STATUS_GLYPH_BOX_CLASS)}>
      <ThreadStatusGlyph indicator={status.indicator} rowStatus={status.rowStatus} />
    </span>
  );
}

export function Provider({ thread, className }: { thread: PluginSidebarThread; className?: string }) {
  const { providers } = experimental_useProviders();
  const provider = providers.find((p) => p.id === thread.providerId) ?? { id: thread.providerId };
  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center text-muted-foreground", className)}>
      <ProviderIcon providerKind="agent" provider={provider} className="size-3.5" />
    </span>
  );
}

/** Live threads render bb's ThreadTitle (mention chips); fixtures, plain text. */
export function Title({ thread, className }: { thread: PluginSidebarThread; className?: string }) {
  return (
    // The inner block truncates, so plain-text fixture titles end in "…" too
    // instead of clipping against the next element.
    <span className={cn("bb-thread-title min-w-0 overflow-hidden", className)} title={thread.displayTitle}>
      <span className="block truncate">
        {thread.id.startsWith("fx-") ? thread.displayTitle : <ThreadTitle threadId={thread.id} />}
      </span>
    </span>
  );
}

/** Text colour for words about an item: only tiers 1–2 are coloured. */
export function askTone(tier: Tier) {
  if (tier === 1) return "text-amber-600 dark:text-amber-400";
  if (tier === 2) return "text-destructive";
  return "text-muted-foreground";
}

export function dotTone(tier: Tier) {
  if (tier === 1) return "bg-amber-500 dark:bg-amber-400";
  if (tier === 2) return "bg-destructive";
  return "bg-muted-foreground/45";
}

export function Dot({ tier, className }: { tier: Tier; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", dotTone(tier), className)} />;
}

export function Age({ ms, className }: { ms: number; className?: string }) {
  return <span className={cn("shrink-0 text-xs tabular-nums text-subtle-foreground", className)}>{relativeTime(ms)}</span>;
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

/** A small text action with a ≥40px touch target. Visible, never hover-only. */
export function ActionButton({
  children,
  onClick,
  primary,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-medium max-md:pointer-coarse:h-10 max-md:pointer-coarse:px-4 max-md:pointer-coarse:text-sm",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "text-muted-foreground hover:bg-state-hover hover:text-sidebar-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Running work is never rows in the inbox: one counted line at the bottom of
 * the list (T3 `Working N`, Amp buckets). Tapping it opens the list in place.
 */
export function CountedLine({
  label,
  threads,
  storageOpen,
  className,
  renderRow,
}: {
  label: string;
  threads: readonly PluginSidebarThread[];
  storageOpen?: [boolean, (fn: (open: boolean) => boolean) => void];
  className?: string;
  renderRow?: (t: PluginSidebarThread) => ReactNode;
}) {
  const local = useState(false);
  const [open, setOpen] = storageOpen ?? [local[0], (fn: (o: boolean) => boolean) => local[1](fn)];
  const { activeThreadId } = useInbox();
  if (threads.length === 0) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-subtle-foreground hover:text-muted-foreground",
          DENSE_ROW_HEIGHT,
        )}
      >
        <span className="tabular-nums">{threads.length}</span>
        <span>{label}</span>
        <Icon name="ChevronRight" className={cn("size-3 transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="flex flex-col">
          {threads.map((t) =>
            renderRow ? (
              renderRow(t)
            ) : (
              <RowLink key={t.id} thread={t} className={rowClass(activeThreadId === t.id, cn(DENSE_ROW_HEIGHT, "text-muted-foreground"))} style={rowPadding(0)}>
                <Title thread={t} className="flex-1" />
                <StatusGlyph thread={t} />
              </RowLink>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="px-2 py-6 text-center text-xs text-subtle-foreground">{children}</div>;
}
