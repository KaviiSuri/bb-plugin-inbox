// The Threads | Inbox switch at the top of the plugin's scroll area. The
// Threads tab is upstream's list, untouched; the Inbox tab is ours.
import type { ReactNode } from "react";
import { useAtom } from "jotai";
import { cn } from "@/lib/utils";
import { activeTabAtom } from "./atoms.js";
import { InboxTab } from "./InboxTab.js";
import type { InboxView } from "./model/index.js";
import { useInboxView } from "./useInboxView.js";
import type { SidebarTab } from "../../shared/inbox-preferences.js";

// Upstream's sticky headers (host CSS, `[data-sidebar-sticky-stack]`) stick
// at the top of the scroll area; move them below the tab bar. Unlayered, so
// it wins over the host's `@layer components` rules.
const THREADS_TAB_STICKY_OFFSET_CSS = `
[data-inbox-tabs] [data-sidebar-sticky-stack] {
  --bb-sidebar-sticky-label-top: calc(var(--inbox-tabs-height) + var(--bb-sidebar-sticky-stack-padding-top));
}
[data-inbox-tabs] [data-sidebar-sticky-stack] [data-sidebar-sticky-header=false] {
  --bb-sidebar-sticky-project-top: calc(var(--inbox-tabs-height) + var(--bb-sidebar-sticky-stack-padding-top));
}
[data-inbox-tabs] [data-sidebar-sticky-stack]::before {
  top: var(--inbox-tabs-height);
}
`;

export function InboxTabs({
  activeThreadId,
  onNavigate,
  threadsTab,
}: {
  activeThreadId: string | null;
  /** Closes the phone drawer; call after opening a thread. */
  onNavigate: () => void;
  threadsTab: ReactNode;
}) {
  const [tab, setTab] = useAtom(activeTabAtom);
  const inbox = useInboxView();
  return (
    <div
      data-inbox-tabs=""
      className="flex min-h-full flex-col [--inbox-tabs-height:2.5rem] max-md:[--inbox-tabs-height:3.25rem]"
    >
      <style>{THREADS_TAB_STICKY_OFFSET_CSS}</style>
      <TabBar tab={tab} onSelect={setTab} view={inbox.view} />
      {tab === "inbox" ? (
        <InboxTab
          state={inbox}
          activeThreadId={activeThreadId}
          onNavigate={onNavigate}
        />
      ) : (
        threadsTab
      )}
    </div>
  );
}

function TabBar({
  tab,
  onSelect,
  view,
}: {
  tab: SidebarTab;
  onSelect: (tab: SidebarTab) => void;
  view: InboxView;
}) {
  return (
    <div className="sticky top-0 z-[70] flex h-[var(--inbox-tabs-height)] shrink-0 items-center bg-sidebar px-2">
      <div
        role="tablist"
        aria-label="Sidebar"
        className="flex w-full gap-0.5 rounded-lg bg-state-hover p-0.5 text-xs max-md:text-sm"
      >
        <TabButton active={tab === "threads"} onClick={() => onSelect("threads")}>
          Threads
        </TabButton>
        <TabButton active={tab === "inbox"} onClick={() => onSelect("inbox")}>
          Inbox
          {view.tabCount > 0 ? (
            <span
              aria-label={`${view.tabCount} new`}
              className={cn("ml-1.5 tabular-nums", countTone(view))}
            >
              {view.tabCount}
            </span>
          ) : null}
        </TabButton>
      </div>
    </div>
  );
}

/** The count takes the colour of the most urgent New for you item. */
function countTone(view: InboxView): string {
  const first = view.newForYou[0];
  if (first?.tier === "blocked") return "text-amber-600 dark:text-amber-400";
  if (first?.tier === "broken") return "text-destructive";
  return "text-subtle-foreground";
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-7 flex-1 items-center justify-center rounded-md font-medium transition-colors max-md:h-10",
        active
          ? "bg-sidebar text-sidebar-foreground shadow-xs"
          : "text-muted-foreground hover:text-sidebar-foreground",
      )}
    >
      {children}
    </button>
  );
}
