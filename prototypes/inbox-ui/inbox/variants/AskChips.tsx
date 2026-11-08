// PROTOTYPE — B. Ask chips (medium). Bet: say what the thread wants in words,
// and colour only that word. From Plannotator (sections named by need, chips
// only on the urgent tiers), Jules and Devin (status as words); see
// docs/research/visual-prior-art.md, direction B.
// Row: project · age, then a chip + title. Tiers 1–2 get a filled chip;
// Verify is an outlined grey chip; FYI has none.
import { cn } from "@/lib/utils";
import { FIXTURE_PROJECT_ID, useFrozenItems, useTouchFreeze, type Classified, type InboxItem, type Tier } from "../model";
import { Age, CountedLine, EmptyNote, RowLink, Title, rowClass, rowPadding, useInbox } from "../parts";
import { useSidebarData } from "../sidebar-data";

const SECTION: Record<Tier, string> = {
  1: "Needs your answer",
  2: "Broken",
  3: "Ready to verify",
  4: "FYI",
};

export function AskChipsVariant({ data }: { data: Classified }) {
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);

  return (
    <div className="flex min-h-full flex-col">
      <div {...handlers} className="flex flex-col gap-1.5">
        {([1, 2, 3, 4] as Tier[]).map((tier) => {
          const rows = items.filter((i) => i.tier === tier);
          if (rows.length === 0) return null;
          return (
            <section key={tier}>
              <div className="flex items-baseline gap-1.5 px-2 pt-1 pb-0.5 text-[11px] text-subtle-foreground">
                <span className="font-medium text-muted-foreground">{SECTION[tier]}</span>
                <span className="tabular-nums">{rows.length}</span>
              </div>
              {rows.map((item) => (
                <ChipRow key={item.id} item={item} />
              ))}
            </section>
          );
        })}
        {items.length === 0 ? <EmptyNote>Nothing for you.</EmptyNote> : null}
      </div>
      <CountedLine label="running" threads={data.running} className="mt-auto pt-3" />
    </div>
  );
}

function ChipRow({ item }: { item: InboxItem }) {
  const { activeThreadId } = useInbox();
  const { projects } = useSidebarData();
  const project =
    item.thread.projectId === FIXTURE_PROJECT_ID ? "demo-app" : (projects.find((p) => p.id === item.thread.projectId)?.name ?? "");
  return (
    <RowLink thread={item.thread} className={rowClass(activeThreadId === item.thread.id, "flex-col items-stretch gap-0 py-1.5")} style={rowPadding(0)}>
      <span className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-subtle-foreground">
        <span className="min-w-0 flex-1 truncate">{project}</span>
        <Age ms={item.at} className="text-[11px]" />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 leading-5">
        <Chip item={item} />
        <Title thread={item.thread} className={cn("flex-1", item.seen && "text-muted-foreground")} />
      </span>
    </RowLink>
  );
}

function Chip({ item }: { item: InboxItem }) {
  if (item.tier === 4) return null;
  const label = item.tier === 1 ? (item.word === "approve" ? "Approve plan" : "Answer") : item.tier === 2 ? "Failed" : "Verify";
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-[11px] font-medium",
        item.tier === 1 && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        item.tier === 2 && "bg-destructive/15 text-destructive",
        item.tier === 3 && "border border-border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
