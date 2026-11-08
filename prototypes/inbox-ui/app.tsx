// PROTOTYPE — throwaway, never merge to main (branch prototype/inbox-ui, issue #5).
//
// Six Inbox tab directions from docs/research/visual-prior-art.md (issue #8),
// in bb's real sidebar over live experimental_useSidebarThreads(). Switch with
// the tappable bar at the bottom of the list. The variant lives in localStorage
// because the sidebar has no URL to carry ?variant=.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreads,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import {
  buildFixtures,
  classify,
  setListMounted,
  useListMounted,
  useLocalState,
  useSnoozes,
  useVerifications,
  verifyThreads,
  type InboxItem,
  type Verification,
} from "./inbox/model";
import { useEvidence } from "./inbox/evidence";
import { InboxContext, type InboxContextValue } from "./inbox/parts";
import { SidebarDataContext } from "./inbox/sidebar-data";
import { ThreadsTab } from "./inbox/ThreadsTab";
import { PaperVariant } from "./inbox/variants/Paper";
import { AskChipsVariant } from "./inbox/variants/AskChips";
import { CountTabsVariant } from "./inbox/variants/CountTabs";
import { ShelvesVariant } from "./inbox/variants/Shelves";
import { TopCardVariant } from "./inbox/variants/TopCard";
import { JustDotsVariant } from "./inbox/variants/JustDots";

const VARIANTS = [
  { key: "A", name: "Paper" },
  { key: "B", name: "Ask chips" },
  { key: "C", name: "Count tabs" },
  { key: "D", name: "Shelves" },
  { key: "E", name: "Top card" },
  { key: "F", name: "Just dots" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

const EMPTY_EXTRAS = new Map();

function InboxPrototypeList({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const live = experimental_useSidebarThreads();
  const [tab, setTab] = useLocalState<"threads" | "inbox">("tab", "inbox");
  const [storedVariant, setVariant] = useLocalState<VariantKey>("variant", "A");
  const variant = VARIANTS.some((v) => v.key === storedVariant) ? storedVariant : "A";
  const [fixturesOn, setFixturesOn] = useLocalState("fixtures", false);
  const { verifications, reset } = useVerifications();
  const { snoozes, snooze, wake } = useSnoozes();

  useEffect(() => {
    setListMounted(true);
    return () => setListMounted(false);
  }, []);

  const fixtures = useMemo(() => buildFixtures(), []);
  const threads = useMemo(() => (fixturesOn ? [...fixtures.threads, ...live.threads] : live.threads), [fixturesOn, fixtures, live.threads]);
  const extras = fixturesOn ? fixtures.extras : EMPTY_EXTRAS;
  const evidence = useEvidence(threads, extras);
  const data = useMemo(
    () => classify(threads, verifications, snoozes, evidence, extras),
    [threads, verifications, snoozes, evidence, extras],
  );

  const ctx = useMemo<InboxContextValue>(
    () => ({
      activeThreadId,
      evidence,
      onNavigate,
      snooze: (item: InboxItem) => snooze(item.id),
      wake,
      verify: (item: InboxItem) => {
        verifyThreads([item.id, ...item.children.map((c) => c.id)]);
        toast.success(`Verified “${item.thread.displayTitle}”`, { description: "Prototype: stored in this browser only." });
      },
    }),
    [activeThreadId, evidence, onNavigate, snooze, wake],
  );

  const cycle = (dir: 1 | -1) => {
    const i = VARIANTS.findIndex((v) => v.key === variant);
    setVariant(VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length]!.key);
    setTab("inbox");
  };

  if (live.status === "loading") {
    return <div className="px-3 py-4 text-xs text-muted-foreground">Loading threads…</div>;
  }

  const needsYou = data.items.filter((i) => i.tier <= 2).length;

  return (
    <SidebarDataContext.Provider value={{ threads, projects: live.projects }}>
      <InboxContext.Provider value={ctx}>
        <div className="flex min-h-full flex-col">
          <div className="sticky top-0 z-20 bg-sidebar px-1 pt-1 pb-1.5">
            <div role="tablist" className="flex gap-0.5 rounded-lg bg-state-hover p-0.5 text-xs">
              <TabButton active={tab === "threads"} onClick={() => setTab("threads")}>
                Threads
              </TabButton>
              <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")}>
                Inbox
                {data.items.length > 0 ? (
                  <span className={cn("ml-1 tabular-nums", needsYou > 0 ? "text-amber-600 dark:text-amber-400" : "text-subtle-foreground")}>
                    {data.items.length}
                  </span>
                ) : null}
              </TabButton>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-1 pb-1">
            {tab === "threads" ? (
              <ThreadsTab />
            ) : variant === "A" ? (
              <PaperVariant data={data} />
            ) : variant === "B" ? (
              <AskChipsVariant data={data} />
            ) : variant === "C" ? (
              <CountTabsVariant data={data} />
            ) : variant === "D" ? (
              <ShelvesVariant data={data} />
            ) : variant === "E" ? (
              <TopCardVariant data={data} />
            ) : (
              <JustDotsVariant data={data} />
            )}
          </div>

          <Switcher variant={variant} onCycle={cycle} fixturesOn={fixturesOn} onFixtures={() => setFixturesOn((on) => !on)} onReset={reset} />
        </div>
      </InboxContext.Provider>
    </SidebarDataContext.Provider>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-6 flex-1 items-center justify-center rounded-md font-medium transition-colors max-md:pointer-coarse:h-9",
        active ? "bg-sidebar text-sidebar-foreground shadow-xs" : "text-muted-foreground hover:text-sidebar-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The prototype's own chrome: a slim bar, obviously not part of the design. */
function Switcher({
  variant,
  onCycle,
  fixturesOn,
  onFixtures,
  onReset,
}: {
  variant: VariantKey;
  onCycle: (dir: 1 | -1) => void;
  fixturesOn: boolean;
  onFixtures: () => void;
  onReset: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const current = VARIANTS.find((v) => v.key === variant)!;
  const btn = "flex h-6 items-center justify-center rounded-full max-md:pointer-coarse:h-10";
  return (
    <div className="sticky bottom-0 z-30 flex justify-center bg-gradient-to-t from-sidebar via-sidebar/90 to-transparent px-2 pt-1 pb-1.5">
      <div className="relative flex items-center whitespace-nowrap rounded-full bg-foreground/90 px-0.5 text-[11px] text-background shadow-md">
        <button type="button" aria-label="Previous variant" onClick={() => onCycle(-1)} className={cn(btn, "w-6 hover:bg-background/20 max-md:pointer-coarse:w-10")}>
          <Icon name="ChevronLeft" className="size-3.5" />
        </button>
        <span className="min-w-[5.5rem] text-center font-medium">
          {current.key} · {current.name}
        </span>
        <button type="button" aria-label="Next variant" onClick={() => onCycle(1)} className={cn(btn, "w-6 hover:bg-background/20 max-md:pointer-coarse:w-10")}>
          <Icon name="ChevronRight" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onFixtures}
          title="Mix in fake threads: plan review, failing PR, grilling child, 5 running"
          className={cn(btn, "px-2", fixturesOn ? "bg-background/20" : "opacity-60 hover:opacity-100")}
        >
          fx
        </button>
        <button type="button" aria-label="Prototype options" onClick={() => setMenu((m) => !m)} className={cn(btn, "w-6 hover:bg-background/20 max-md:pointer-coarse:w-10")}>
          <Icon name="MoreHorizontal" className="size-3.5" />
        </button>
        {menu ? (
          <div className="absolute right-0 bottom-8 w-48 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md max-md:pointer-coarse:bottom-12">
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left hover:bg-state-hover max-md:pointer-coarse:py-3"
              onClick={() => {
                onReset();
                setMenu(false);
              }}
            >
              Reset Verify and Later
            </button>
            <div className="px-2 py-1 text-subtle-foreground">fx = fixtures {fixturesOn ? "on" : "off"}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "inbox-prototype",
    title: "Inbox prototype",
    description: "PROTOTYPE (issue #5): Threads | Inbox tabs with six switchable Inbox directions.",
    component: InboxPrototypeList,
  });
  // "Verify lives in the opened thread": a header button, shown only in a
  // client whose sidebar is the Inbox prototype, so it never appears for
  // someone using bb's own list.
  app.slots.experimental_threadAction<{ mounted: boolean; verifications: Record<string, Verification>; attention: Map<string, number> }>({
    id: "verify",
    title: "Verify",
    icon: "Check",
    group: "inbox-prototype",
    placement: "header",
    useData: () => {
      const { threads } = experimental_useSidebarThreads();
      const attention = useMemo(() => new Map(threads.map((t) => [t.id, t.latestAttentionAt])), [threads]);
      return { mounted: useListMounted(), verifications: useVerifications().verifications, attention };
    },
    item: ({ thread, data }) => {
      if (!data?.mounted) return null;
      const v = data.verifications[thread.id];
      const done = v !== undefined && v.verifiedAt >= (data.attention.get(thread.id) ?? 0);
      return {
        label: done ? "Verified" : "Verify",
        icon: "Check",
        disabled: done,
        run: () => {
          verifyThreads([thread.id]);
          toast.success("Verified", { description: "Prototype: stored in this browser only." });
        },
      };
    },
  });
});
