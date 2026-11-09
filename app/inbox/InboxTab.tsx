// The Inbox tab in "Paper dots" (ADR 0001): one-line rows (dot, title, one
// word) under New for you, then a faded Seen band. Tapping a row opens its
// reason line and a visible Answer / Open button, one row at a time. Running
// threads are one counted line in a sticky footer, never rows.
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ThreadTitle,
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
  experimental_resolveThreadStatus as resolveThreadStatus,
  useBbNavigate,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { holdStill, layoutOf, type HeldLayout } from "./hold-still.js";
import type { InboxItem, RunningThread, Tier } from "./model.js";
import type { InboxViewState } from "./useInboxView.js";

/** Phone (drawer) widths get 40px tap targets; desktop keeps bb's row height. */
const ROW_HEIGHT_CLASS = "min-h-[var(--bb-sidebar-row-height)] max-md:min-h-10";
const BUTTON_HEIGHT_CLASS = "h-7 max-md:h-10";

/** After a touch ends, rows hold still this long before they may move. */
const TOUCH_HOLD_MS = 4_000;

export function InboxTab({
  state,
  activeThreadId,
  onNavigate,
}: {
  state: InboxViewState;
  activeThreadId: string | null;
  onNavigate: () => void;
}) {
  const navigate = useBbNavigate();
  const openThread = (threadId: string) => {
    navigate.toThread(threadId);
    onNavigate();
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const { view, handlers } = useHeldView(state);

  if (!state.ready) return null;
  const empty = view.newForYou.length === 0 && view.seen.length === 0;
  const row = (item: InboxItem, faded: boolean) => (
    <ItemRow
      key={item.threadId}
      item={item}
      faded={faded}
      active={item.threadId === activeThreadId}
      open={openId === item.threadId}
      onToggle={() =>
        setOpenId((current) => (current === item.threadId ? null : item.threadId))
      }
      onOpenThread={() => openThread(item.threadId)}
    />
  );

  return (
    <>
      <div
        data-testid="inbox-list"
        className="flex flex-1 flex-col px-2 pb-2"
        {...handlers}
      >
        {view.newForYou.length > 0 ? (
          <section aria-label="New for you">
            <BandLabel>New for you</BandLabel>
            {view.newForYou.map((item) => row(item, false))}
          </section>
        ) : null}
        {view.seen.length > 0 ? (
          <section
            aria-label="Seen"
            className="mt-2 rounded-md bg-state-hover/60 pb-1"
          >
            <BandLabel>Seen</BandLabel>
            {view.seen.map((item) => row(item, true))}
          </section>
        ) : null}
        {empty ? (
          <p className="px-2 py-6 text-center text-xs text-subtle-foreground">
            Nothing needs you.
          </p>
        ) : null}
      </div>
      <RunningFooter
        running={view.running}
        threadsById={state.threadsById}
        onOpenThread={openThread}
      />
    </>
  );
}

/** Rows keep their band and place while a pointer or finger is on the list. */
function useHeldView(state: InboxViewState) {
  const [held, setHeld] = useState<HeldLayout | null>(null);
  const live = useRef(state.view);
  live.current = state.view;
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useMemo(() => {
    const hold = () => {
      if (release.current) clearTimeout(release.current);
      setHeld((current) => current ?? layoutOf(live.current));
    };
    return {
      onPointerEnter: hold,
      onPointerDown: hold,
      onPointerLeave: (event: { pointerType: string }) => {
        if (release.current) clearTimeout(release.current);
        release.current = setTimeout(
          () => setHeld(null),
          event.pointerType === "mouse" ? 0 : TOUCH_HOLD_MS,
        );
      },
    };
  }, []);
  const view = useMemo(
    () => (held ? holdStill(held, state.view) : state.view),
    [held, state.view],
  );
  return { view, handlers };
}

function BandLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-0.5 text-[11px] text-subtle-foreground max-md:text-xs">
      {children}
    </div>
  );
}

/** Only what needs the human is coloured: amber asks, red is broken. */
function wordTone(tier: Tier): string {
  return tier === "blocked"
    ? "text-amber-600 dark:text-amber-400"
    : "text-destructive";
}

function dotTone(tier: Tier): string {
  return tier === "blocked"
    ? "bg-amber-500 dark:bg-amber-400"
    : "bg-destructive";
}

function ItemRow({
  item,
  faded,
  active,
  open,
  onToggle,
  onOpenThread,
}: {
  item: InboxItem;
  faded: boolean;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenThread: () => void;
}) {
  return (
    <div
      data-inbox-item={item.threadId}
      className={cn(
        "rounded-md",
        open && "bg-sidebar-accent",
        faded && !open && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${item.title}: ${item.word}`}
        onClick={onToggle}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground",
          ROW_HEIGHT_CLASS,
          !open && "hover:bg-sidebar-accent",
          active && !open && "bg-state-active",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-1.5 shrink-0 rounded-full",
            dotTone(item.tier),
          )}
        />
        <span className="bb-thread-title min-w-0 flex-1 truncate">
          <ThreadTitle threadId={item.threadId} />
        </span>
        <span className={cn("shrink-0 text-xs", wordTone(item.tier))}>
          {item.word}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-1 pr-2 pb-1.5 pl-[1.375rem]">
          <span className={cn("text-xs break-words", wordTone(item.tier))}>
            {item.reason}
          </span>
          <span className="-ml-2.5 flex items-center">
            <button
              type="button"
              onClick={onOpenThread}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 max-md:px-4 max-md:text-sm",
                BUTTON_HEIGHT_CLASS,
              )}
            >
              {item.tier === "blocked" ? "Answer" : "Open"}
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RunningFooter({
  running,
  threadsById,
  onOpenThread,
}: {
  running: readonly RunningThread[];
  threadsById: ReadonlyMap<string, PluginSidebarThread>;
  onOpenThread: (threadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (running.length === 0) return null;
  return (
    <div className="sticky bottom-0 z-[70] border-t border-border-hairline bg-sidebar px-2 py-1">
      {expanded ? (
        <ul
          aria-label="Running threads"
          className="flex max-h-[40vh] flex-col overflow-y-auto"
        >
          {running.map((entry) => (
            <li key={entry.threadId}>
              <button
                type="button"
                onClick={() => onOpenThread(entry.threadId)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  ROW_HEIGHT_CLASS,
                )}
              >
                <span className="bb-thread-title min-w-0 flex-1 truncate">
                  <ThreadTitle threadId={entry.threadId} />
                </span>
                <RunningGlyph thread={threadsById.get(entry.threadId)} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-subtle-foreground hover:text-muted-foreground max-md:text-sm",
          BUTTON_HEIGHT_CLASS,
        )}
      >
        <span className="tabular-nums">{running.length}</span>
        <span>running</span>
        <Icon
          name="ChevronRight"
          className={cn(
            "size-3 transition-transform",
            expanded && "-rotate-90",
          )}
        />
      </button>
    </div>
  );
}

/** bb's own status glyph, resolved the way its list resolves it. */
function RunningGlyph({ thread }: { thread: PluginSidebarThread | undefined }) {
  if (!thread) return null;
  const status = resolveThreadStatus({
    thread,
    hiddenThreads: [],
    hasUnsubmittedDraft: false,
    rowStatus: null,
  });
  if (status.indicator === "none" && status.rowStatus === null) return null;
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <ThreadStatusGlyph indicator={status.indicator} rowStatus={status.rowStatus} />
    </span>
  );
}
