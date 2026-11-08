// PROTOTYPE — G. Paper dots: the blend of A (Paper) and F (Just dots) the user
// picked. A's structure (New for you, then a grey Seen band with faded rows);
// F's resting row (dot, title, one muted word). Tapping a row opens it in place:
// A's reason line under the title, plus Verify / Open as visible buttons. One
// row open at a time. Running work is the counted line in the footer (app.tsx).
import { useState } from "react";
import { cn } from "@/lib/utils";
import { diffstat, useFrozenItems, useTouchFreeze, type Classified, type InboxItem } from "../model";
import { ActionButton, Dot, EmptyNote, ROW_HEIGHT, RowLink, Title, askTone, rowClass, rowPadding, useInbox, useOpenThread } from "../parts";

export function PaperDotsVariant({ data }: { data: Classified }) {
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);
  const [openId, setOpenId] = useState<string | null>(null);
  const fresh = items.filter((i) => !i.seen);
  const seen = items.filter((i) => i.seen);
  const row = (item: InboxItem, faded: boolean) => (
    <DotRow
      key={item.id}
      item={item}
      faded={faded}
      open={openId === item.id}
      onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
    />
  );

  return (
    <div {...handlers} className="flex flex-col">
      {fresh.length > 0 ? (
        <section>
          <Label>New for you</Label>
          {fresh.map((i) => row(i, false))}
        </section>
      ) : null}
      {seen.length > 0 ? (
        <section className="mt-2 rounded-md bg-state-hover/60 pb-1">
          <Label>Seen</Label>
          {seen.map((i) => row(i, true))}
        </section>
      ) : null}
      {items.length === 0 ? <EmptyNote>Nothing for you.</EmptyNote> : null}
    </div>
  );
}

function Label({ children }: { children: string }) {
  return <div className="px-2 pt-1.5 pb-0.5 text-[11px] text-subtle-foreground">{children}</div>;
}

function DotRow({ item, faded, open, onToggle }: { item: InboxItem; faded: boolean; open: boolean; onToggle: () => void }) {
  const { activeThreadId, evidence, verify } = useInbox();
  const openThread = useOpenThread();
  const stat = item.tier === 3 ? diffstat(evidence(item.thread)) : null;
  const reason = item.reason.charAt(0).toLowerCase() + item.reason.slice(1);
  return (
    <div className={cn("rounded-md", open && "bg-sidebar-accent", faded && !open && "opacity-60")}>
      <RowLink
        thread={item.thread}
        onClick={onToggle}
        className={rowClass(activeThreadId === item.thread.id && !open, cn(ROW_HEIGHT, open && "hover:bg-transparent"))}
        style={rowPadding(0)}
      >
        <span className="flex w-2 shrink-0 justify-center">
          <Dot tier={item.tier} />
        </span>
        <Title thread={item.thread} className="flex-1" />
        <span className={cn("shrink-0 text-xs", item.tier <= 2 ? askTone(item.tier) : "text-subtle-foreground")}>{item.word}</span>
      </RowLink>
      {open ? (
        <div className="flex flex-col gap-1 pb-1.5" style={{ paddingLeft: (rowPadding(0).paddingLeft as number) + 16, paddingRight: 8 }}>
          <span className={cn("truncate text-xs", askTone(item.tier))}>
            {reason}
            {stat ? <span className="text-subtle-foreground"> · {stat}</span> : null}
          </span>
          <span className="-ml-2.5 flex items-center gap-0.5">
            {item.tier >= 3 ? (
              <ActionButton primary onClick={() => verify(item)}>
                Verify
              </ActionButton>
            ) : null}
            <ActionButton primary={item.tier < 3} onClick={() => openThread(item.thread)}>
              {item.tier === 1 ? "Answer" : "Open"}
            </ActionButton>
          </span>
        </div>
      ) : null}
    </div>
  );
}
