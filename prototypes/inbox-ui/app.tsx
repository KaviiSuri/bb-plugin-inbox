// PROTOTYPE — throwaway, never merge to main (branch prototype/inbox-ui, issue #5).
//
// Four structurally different Inbox tab designs in bb's real sidebar, reading
// live experimental_useSidebarThreads(). Switch with the floating bar at the
// bottom of the list (or ←/→ while the pointer is over it). The variant lives in
// localStorage because the sidebar has no URL to carry ?variant=.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreads,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { buildFixtures, classify, useLocalState, useVerifications, type InboxItem } from "./inbox/model";
import { useEvidence } from "./inbox/evidence";
import { InboxContext, type InboxContextValue } from "./inbox/parts";
import { SidebarDataContext } from "./inbox/sidebar-data";
import { sidebarScope, useScopedKeys } from "./inbox/keys";
import { ThreadsTab } from "./inbox/ThreadsTab";
import { LanesVariant } from "./inbox/variants/Lanes";
import { FeedVariant } from "./inbox/variants/Feed";
import { FocusVariant } from "./inbox/variants/Focus";
import { TreeVariant } from "./inbox/variants/Tree";

const VARIANTS = [
  { key: "A", name: "Tier lanes" },
  { key: "B", name: "Ranked feed" },
  { key: "C", name: "One at a time" },
  { key: "D", name: "Attention tree" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

function InboxPrototypeList({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const live = experimental_useSidebarThreads();
  const [tab, setTab] = useLocalState<"threads" | "inbox">("tab", "inbox");
  const [variant, setVariant] = useLocalState<VariantKey>("variant", "A");
  const [fixturesOn, setFixturesOn] = useLocalState("fixtures", false);
  const { verifications, verify, reset } = useVerifications();

  const fixtures = useMemo(() => buildFixtures("fx-project"), []);
  const threads = useMemo(
    () => (fixturesOn ? [...fixtures.threads, ...live.threads] : live.threads),
    [fixturesOn, fixtures, live.threads],
  );
  const extras = fixturesOn ? fixtures.extras : EMPTY_EXTRAS;
  const evidence = useEvidence(threads, extras);
  const data = useMemo(() => classify(threads, verifications, evidence, extras), [threads, verifications, evidence, extras]);

  const ctx = useMemo<InboxContextValue>(
    () => ({
      activeThreadId,
      evidence,
      onNavigate,
      verify: (item: InboxItem) => {
        verify([item.id, ...item.children.map((c) => c.thread.id)]);
        toast.success(`Verified “${item.thread.displayTitle}”`, {
          description: `by you at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (prototype: stored in localStorage)`,
        });
      },
    }),
    [activeThreadId, evidence, onNavigate, verify],
  );

  const cycle = (dir: 1 | -1) => {
    const i = VARIANTS.findIndex((v) => v.key === variant);
    setVariant(VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length]!.key);
    setTab("inbox");
  };
  useScopedKeys({ ArrowLeft: () => cycle(-1), ArrowRight: () => cycle(1) });

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sidebarScope.root = rootRef.current;
    return () => {
      sidebarScope.root = null;
    };
  }, []);

  if (live.status === "loading") {
    return <div className="px-3 py-4 text-xs text-muted-foreground">Loading threads…</div>;
  }

  const attention = data.items.filter((i) => i.tier <= 2).length;

  return (
    <SidebarDataContext.Provider value={{ threads, projects: live.projects }}>
      <InboxContext.Provider value={ctx}>
        <div
          ref={rootRef}
          className="flex min-h-full flex-col outline-none"
          data-inbox-prototype-root=""
          tabIndex={-1}
          // Keys act only when focus is in the list (the composer usually holds
          // it), so clicking the list takes focus.
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest("input, textarea, [contenteditable]")) rootRef.current?.focus({ preventScroll: true });
          }}
          onPointerEnter={() => (sidebarScope.hovered = true)}
          onPointerLeave={() => (sidebarScope.hovered = false)}
        >
          <div className="sticky top-0 z-20 bg-sidebar px-1 pt-1 pb-1.5">
            <div role="tablist" className="flex gap-0.5 rounded-lg bg-state-hover p-0.5 text-xs">
              <TabButton active={tab === "threads"} onClick={() => setTab("threads")}>
                Threads
              </TabButton>
              <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")}>
                Inbox
                {data.items.length > 0 ? (
                  <span
                    className={cn(
                      "ml-1 rounded-full px-1.5 text-[10px] leading-4 tabular-nums",
                      attention > 0 ? "bg-amber-500/20 text-amber-500" : "bg-muted-foreground/15 text-muted-foreground",
                    )}
                  >
                    {data.items.length}
                  </span>
                ) : null}
              </TabButton>
            </div>
          </div>

          <div className="flex-1 px-1 pb-2">
            {tab === "threads" ? (
              <ThreadsTab />
            ) : variant === "A" ? (
              <LanesVariant data={data} />
            ) : variant === "B" ? (
              <FeedVariant data={data} />
            ) : variant === "C" ? (
              <FocusVariant data={data} />
            ) : (
              <TreeVariant data={data} threads={threads} />
            )}
          </div>

          <Switcher
            variant={variant}
            onCycle={cycle}
            fixturesOn={fixturesOn}
            onFixtures={() => setFixturesOn((on) => !on)}
            verifiedCount={Object.keys(verifications).length}
            onReset={reset}
          />
        </div>
      </InboxContext.Provider>
    </SidebarDataContext.Provider>
  );
}

const EMPTY_EXTRAS = new Map();

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-6 flex-1 items-center justify-center rounded-md font-medium transition-colors",
        active ? "bg-sidebar text-sidebar-foreground shadow-xs" : "text-muted-foreground hover:text-sidebar-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The prototype's own chrome: obviously not part of the design under test. */
function Switcher({
  variant,
  onCycle,
  fixturesOn,
  onFixtures,
  verifiedCount,
  onReset,
}: {
  variant: VariantKey;
  onCycle: (dir: 1 | -1) => void;
  fixturesOn: boolean;
  onFixtures: () => void;
  verifiedCount: number;
  onReset: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const current = VARIANTS.find((v) => v.key === variant)!;
  return (
    <div className="sticky bottom-0 z-30 flex justify-center px-2 pt-2 pb-2">
      <div className="flex items-center gap-0.5 whitespace-nowrap rounded-full bg-foreground px-1 py-0.5 text-[11px] text-background shadow-lg ring-1 ring-black/10">
        <SwitchButton label="Previous variant" onClick={() => onCycle(-1)} icon="ChevronLeft" />
        <span className="min-w-[6.5rem] px-0.5 text-center font-medium tabular-nums">
          {current.key} — {current.name}
        </span>
        <SwitchButton label="Next variant" onClick={() => onCycle(1)} icon="ChevronRight" />
        <span className="mx-0.5 h-3 w-px bg-background/25" />
        <button
          type="button"
          onClick={onFixtures}
          title="Mix in fake threads: plan review, failing PR, grilling child, 5 running"
          className={cn("rounded-full px-1.5 py-0.5", fixturesOn ? "bg-background/20" : "opacity-60 hover:opacity-100")}
        >
          Fixtures {fixturesOn ? "on" : "off"}
        </button>
        <div className="relative">
          <SwitchButton label="Prototype options" onClick={() => setMenu((m) => !m)} icon="MoreHorizontal" />
          {menu ? (
            <div className="absolute right-0 bottom-7 w-44 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md">
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-state-hover"
                onClick={() => {
                  onReset();
                  setMenu(false);
                }}
              >
                Reset verifications ({verifiedCount})
              </button>
              <div className="px-2 py-1 text-subtle-foreground">←/→ cycle while hovering the list</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SwitchButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-5 items-center justify-center rounded-full hover:bg-background/20">
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "inbox-prototype",
    title: "Inbox prototype",
    description: "PROTOTYPE (issue #5): Threads | Inbox tabs with four switchable Inbox designs.",
    component: InboxPrototypeList,
  });
});
