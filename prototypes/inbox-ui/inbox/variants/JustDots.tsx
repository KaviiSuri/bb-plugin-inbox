// PROTOTYPE — F. Just dots (control). Bet: no new visual language is needed;
// the Threads row plus a dot is enough. From Factory (dot only on live rows),
// Sculptor and Claude Code (one line, nothing else); see
// docs/research/visual-prior-art.md, direction F. The baseline the others must beat.
// The Threads tab's row, filtered to items: dot, provider, title, a muted
// reason word at the end.
import { cn } from "@/lib/utils";
import { useFrozenItems, useTouchFreeze, type Classified, type InboxItem } from "../model";
import { Dot, EmptyNote, Provider, ROW_HEIGHT, RowLink, Title, askTone, rowClass, rowPadding, useInbox } from "../parts";

export function JustDotsVariant({ data }: { data: Classified }) {
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);
  return (
    <div className="flex flex-col">
      <div {...handlers}>
        {items.map((item) => (
          <DotRow key={item.id} item={item} />
        ))}
        {items.length === 0 ? <EmptyNote>Nothing for you.</EmptyNote> : null}
      </div>
    </div>
  );
}

function DotRow({ item }: { item: InboxItem }) {
  const { activeThreadId } = useInbox();
  return (
    <RowLink thread={item.thread} className={rowClass(activeThreadId === item.thread.id, ROW_HEIGHT)} style={rowPadding(0)}>
      <span className="flex w-2 shrink-0 justify-center">
        <Dot tier={item.tier} />
      </span>
      <Provider thread={item.thread} />
      <Title thread={item.thread} className="flex-1" />
      <span className={cn("shrink-0 text-xs", item.tier <= 2 ? askTone(item.tier) : "text-subtle-foreground")}>{item.word}</span>
    </RowLink>
  );
}
