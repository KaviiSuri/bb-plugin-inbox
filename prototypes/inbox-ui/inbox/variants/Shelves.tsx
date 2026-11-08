// PROTOTYPE — D. Shelves (quiet). Bet: keep one flat queue; push everything
// that isn't for you into counted shelves at the foot. From Amp's buckets
// (Inactive, Snoozed, Archived), T3's Working/Settled shelves and Cursor's
// In progress/Older; see docs/research/visual-prior-art.md, direction D.
// One-line rows with a 6px dot (coloured only for tiers 1–2). Tap a row to
// select it: its reason and Verify / Later / Open show under it. The shelves
// stay pinned to the bottom; the queue scrolls.
import { useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { evidenceLines, useFrozenItems, useLocalState, useTouchFreeze, type Classified, type InboxItem } from "../model";
import {
  ActionButton,
  Age,
  CountedLine,
  DENSE_ROW_HEIGHT,
  Dot,
  EmptyNote,
  ROW_HEIGHT,
  RowLink,
  Title,
  askTone,
  rowClass,
  rowPadding,
  useInbox,
  useOpenThread,
} from "../parts";

export function ShelvesVariant({ data }: { data: Classified }) {
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);
  const [selected, setSelected] = useState<string | null>(null);
  const { wake, activeThreadId } = useInbox();
  const open = useOpenThread();
  const shelfOpen = {
    running: useLocalState("d.running", false),
    snoozed: useLocalState("d.snoozed", false),
    verified: useLocalState("d.verified", false),
  };

  const shelfRow = (action?: (t: PluginSidebarThread) => void, actionLabel?: string) => (t: PluginSidebarThread) => (
    <RowLink key={t.id} thread={t} className={rowClass(activeThreadId === t.id, cn(DENSE_ROW_HEIGHT, "text-muted-foreground"))} style={rowPadding(0)}>
      <Title thread={t} className="flex-1" />
      {action ? (
        <ActionButton onClick={() => action(t)} className="-my-1 h-6">
          {actionLabel}
        </ActionButton>
      ) : null}
    </RowLink>
  );

  return (
    <div className="flex min-h-full flex-col">
      <div {...handlers} className="flex-1">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            selected={selected === item.id}
            onSelect={() => setSelected((cur) => (cur === item.id ? null : item.id))}
            onOpen={() => open(item.thread)}
          />
        ))}
        {items.length === 0 ? <EmptyNote>Queue empty.</EmptyNote> : null}
      </div>
      <div className="sticky bottom-9 z-10 mt-2 max-h-[45vh] overflow-y-auto border-t border-border-hairline bg-sidebar pt-1 max-md:pointer-coarse:bottom-12">
        <CountedLine label="running" threads={data.running} storageOpen={toOpen(shelfOpen.running)} />
        <CountedLine
          label="snoozed"
          threads={data.snoozed.map((i) => i.thread)}
          storageOpen={toOpen(shelfOpen.snoozed)}
          renderRow={shelfRow((t) => wake(t.id), "Wake")}
        />
        <CountedLine label="verified today" threads={data.verifiedToday} storageOpen={toOpen(shelfOpen.verified)} renderRow={shelfRow()} />
      </div>
    </div>
  );
}

function toOpen([open, set]: readonly [boolean, (fn: (o: boolean) => boolean) => void]): [boolean, (fn: (o: boolean) => boolean) => void] {
  return [open, set];
}

function QueueRow({
  item,
  selected,
  onSelect,
  onOpen,
}: {
  item: InboxItem;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { activeThreadId, evidence, verify, snooze } = useInbox();
  const lines = selected ? evidenceLines(item, evidence(item.thread)) : [];
  return (
    <div className={cn("rounded-md", selected && "bg-sidebar-accent")}>
      <RowLink
        thread={item.thread}
        onClick={onSelect}
        className={rowClass(activeThreadId === item.thread.id && !selected, cn(ROW_HEIGHT, selected && "hover:bg-transparent"))}
        style={rowPadding(0)}
      >
        <span className="flex w-2 shrink-0 justify-center">
          <Dot tier={item.tier} />
        </span>
        <Title thread={item.thread} className={cn("flex-1", item.seen && !selected && "text-muted-foreground")} />
        <Age ms={item.at} />
      </RowLink>
      {selected ? (
        <div className="flex flex-col gap-1 pb-1.5" style={{ paddingLeft: (rowPadding(0).paddingLeft as number) + 16, paddingRight: 8 }}>
          <span className={cn("text-xs", askTone(item.tier))}>{item.reason}</span>
          {lines.length > 0 ? <span className="truncate text-xs text-subtle-foreground">{lines.join(" · ")}</span> : null}
          <span className="-ml-2.5 flex items-center gap-0.5 pt-0.5">
            {item.tier >= 3 ? (
              <ActionButton primary onClick={() => verify(item)}>
                Verify
              </ActionButton>
            ) : null}
            <ActionButton primary={item.tier < 3} onClick={onOpen}>
              {item.tier === 1 ? "Answer" : item.tier === 2 ? "Look" : "Open"}
            </ActionButton>
            <ActionButton onClick={() => snooze(item)}>Later</ActionButton>
          </span>
        </div>
      ) : null}
    </div>
  );
}
