// PROTOTYPE — C. Count tabs (dense). Bet: show one tier at a time; the counts
// are the overview. From Superhuman Split Inbox (words + counts), Linear
// Priority/Other and Copilot Active/Done; see docs/research/visual-prior-art.md,
// direction C.
// A text strip, then one-line rows: status glyph, title, diffstat on Verify
// rows, age. Running is a count in the strip, never rows.
import { cn } from "@/lib/utils";
import { diffstat, useFrozenItems, useLocalState, useTouchFreeze, type Classified, type InboxItem } from "../model";
import { Age, DENSE_ROW_HEIGHT, EmptyNote, RowLink, StatusGlyph, Title, rowClass, rowPadding, useInbox } from "../parts";

type Segment = "needs" | "verify" | "fyi";

const SEGMENTS: { key: Segment; label: string; match: (i: InboxItem) => boolean }[] = [
  { key: "needs", label: "Needs you", match: (i) => i.tier <= 2 },
  { key: "verify", label: "Verify", match: (i) => i.tier === 3 },
  { key: "fyi", label: "FYI", match: (i) => i.tier === 4 },
];

export function CountTabsVariant({ data }: { data: Classified }) {
  const [segment, setSegment] = useLocalState<Segment>("c.segment", "needs");
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);
  const current = SEGMENTS.find((s) => s.key === segment)!;
  const rows = items.filter(current.match);

  return (
    <div className="flex flex-col">
      <div className="flex items-center whitespace-nowrap px-0.5 pb-1 text-xs">
        {SEGMENTS.map((s) => {
          const count = items.filter(s.match).length;
          const active = s.key === segment;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 max-md:pointer-coarse:h-10",
                active ? "font-semibold text-sidebar-foreground" : "text-muted-foreground hover:text-sidebar-foreground",
              )}
            >
              {s.label}
              <span
                className={cn(
                  "tabular-nums",
                  s.key === "needs" && count > 0 ? "text-amber-600 dark:text-amber-400" : active ? "" : "text-subtle-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        <span className="ml-auto min-w-0 truncate pr-1.5 text-[11px] text-subtle-foreground tabular-nums">{data.running.length} running</span>
      </div>
      <div {...handlers}>
        {rows.map((item) => (
          <DenseRow key={item.id} item={item} />
        ))}
        {rows.length === 0 ? <EmptyNote>Nothing in {current.label}.</EmptyNote> : null}
      </div>
    </div>
  );
}

function DenseRow({ item }: { item: InboxItem }) {
  const { activeThreadId, evidence } = useInbox();
  const stat = item.tier === 3 ? diffstat(evidence(item.thread)) : null;
  return (
    <RowLink thread={item.thread} className={rowClass(activeThreadId === item.thread.id, DENSE_ROW_HEIGHT)} style={rowPadding(0)}>
      <span className="flex w-4 shrink-0 justify-center">
        <StatusGlyph thread={item.thread} />
      </span>
      <Title thread={item.thread} className={cn("flex-1", item.seen && "text-muted-foreground")} />
      {stat ? <span className="shrink-0 font-mono text-[11px] text-subtle-foreground">{stat}</span> : null}
      <Age ms={item.at} className="w-6 text-right" />
    </RowLink>
  );
}
