// PROTOTYPE — A. Paper (quietest). Bet: an inbox you can glance at without it
// shouting. From HEY Imbox (New for you / Previously seen by background),
// Linear (read rows fade) and Codex (title + age, no glyphs); see
// docs/research/visual-prior-art.md, direction A.
// Row: two lines, title then a muted reason; age right. No chips, no icons.
// Verify lives in the opened thread (the header's Verify button).
import { cn } from "@/lib/utils";
import { diffstat, useFrozenItems, useTouchFreeze, type Classified, type InboxItem } from "../model";
import { Age, CountedLine, EmptyNote, RowLink, Title, askTone, rowClass, rowPadding, useInbox } from "../parts";

export function PaperVariant({ data }: { data: Classified }) {
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);
  const fresh = items.filter((i) => !i.seen);
  const seen = items.filter((i) => i.seen);

  return (
    <div className="flex min-h-full flex-col">
      <div {...handlers}>
        {fresh.length > 0 ? (
          <section>
            <Label>New for you</Label>
            {fresh.map((item) => (
              <PaperRow key={item.id} item={item} />
            ))}
          </section>
        ) : null}
        {seen.length > 0 ? (
          <section className="mt-2 rounded-md bg-state-hover/60 pb-1">
            <Label>Seen</Label>
            {seen.map((item) => (
              <PaperRow key={item.id} item={item} faded />
            ))}
          </section>
        ) : null}
        {items.length === 0 ? <EmptyNote>Nothing for you.</EmptyNote> : null}
      </div>
      <CountedLine label="running" threads={data.running} className="mt-auto pt-3" />
    </div>
  );
}

function Label({ children }: { children: string }) {
  return <div className="px-2 pt-1.5 pb-0.5 text-[11px] text-subtle-foreground">{children}</div>;
}

function PaperRow({ item, faded }: { item: InboxItem; faded?: boolean }) {
  const { activeThreadId, evidence } = useInbox();
  const stat = item.tier === 3 ? diffstat(evidence(item.thread)) : null;
  return (
    <RowLink
      thread={item.thread}
      className={rowClass(activeThreadId === item.thread.id, cn("items-start py-1.5", faded && "opacity-60"))}
      style={rowPadding(0)}
    >
      <span className="flex w-2 shrink-0 justify-center pt-[7px]">
        {faded ? null : <span className="size-1.5 rounded-full bg-sidebar-foreground/70" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Title thread={item.thread} className="flex-1 text-[13px] leading-5" />
          <Age ms={item.at} />
        </span>
        <span className={cn("truncate text-xs leading-4", askTone(item.tier))}>
          {item.reason.charAt(0).toLowerCase() + item.reason.slice(1)}
          {stat ? <span className="text-subtle-foreground"> · {stat}</span> : null}
        </span>
      </span>
    </RowLink>
  );
}
