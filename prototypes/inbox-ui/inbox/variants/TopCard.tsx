// PROTOTYPE — E. Top card (loudest). Bet: put the next sign-off in your hand;
// the rest wait as a stack. From Front's approve cards (buttons on the item),
// HEY's Reply Later pile and Conductor's Ready to merge; see
// docs/research/visual-prior-art.md, direction E.
// The top item is a card with its reason, evidence lines and Verify / Later /
// Open. The rest are one-line rows under it. Verify advances; zero is a place.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { evidenceLines, useFrozenItems, useTouchFreeze, type Classified, type InboxItem } from "../model";
import { ActionButton, Age, CountedLine, Dot, ROW_HEIGHT, RowLink, Title, askTone, rowClass, rowPadding, useInbox, useOpenThread } from "../parts";

export function TopCardVariant({ data }: { data: Classified }) {
  const { evidence, verify, snooze, activeThreadId } = useInbox();
  const open = useOpenThread();
  const { frozen, handlers } = useTouchFreeze();
  const items = useFrozenItems(data.items, frozen);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // The card doesn't change under you while it's still an item.
  const current = items.find((i) => i.id === pinnedId) ?? items[0] ?? null;
  useEffect(() => {
    if (current && current.id !== pinnedId) setPinnedId(current.id);
  }, [current, pinnedId]);
  const rest = items.filter((i) => i !== current);

  if (!current) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
          <div className="text-sm font-medium text-sidebar-foreground">Inbox zero</div>
          <div className="text-xs text-subtle-foreground">Finished work lands here.</div>
        </div>
        <CountedLine label="running" threads={data.running} className="mt-auto pt-3" />
      </div>
    );
  }

  const lines = evidenceLines(current, evidence(current.thread));
  const next = () => setPinnedId(null);
  return (
    <div className="flex min-h-full flex-col" {...handlers}>
      <div className="relative px-1 pt-1">
        {/* The pile behind the card. */}
        {rest.length > 0 ? <div aria-hidden className="absolute inset-x-3 -bottom-1 h-3 rounded-b-lg border border-t-0 border-border bg-card/60" /> : null}
        <article className="relative flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xs">
          <div className="flex min-w-0 items-center gap-2">
            <Title thread={current.thread} className="flex-1 text-sm font-medium leading-5" />
            <Age ms={current.at} />
          </div>
          <div className={cn("text-xs", askTone(current.tier))}>{current.reason}</div>
          {lines.length > 0 ? (
            <ul className="flex flex-col text-xs leading-5 text-muted-foreground">
              {lines.map((l) => (
                <li key={l} className="truncate">
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="-mx-1 flex items-center gap-1 pt-1">
            {current.tier >= 3 ? (
              <ActionButton
                primary
                className="flex-1"
                onClick={() => {
                  verify(current);
                  next();
                }}
              >
                Verify
              </ActionButton>
            ) : (
              <ActionButton primary className="flex-1" onClick={() => open(current.thread)}>
                {current.tier === 1 ? "Answer" : "Look"}
              </ActionButton>
            )}
            <ActionButton
              onClick={() => {
                snooze(current);
                next();
              }}
            >
              Later
            </ActionButton>
            {current.tier >= 3 ? <ActionButton onClick={() => open(current.thread)}>Open</ActionButton> : null}
          </div>
        </article>
      </div>
      <div className="mt-3 flex flex-col">
        {rest.map((item) => (
          <StackRow key={item.id} item={item} active={activeThreadId === item.thread.id} onPick={() => setPinnedId(item.id)} />
        ))}
      </div>
      <CountedLine label="running" threads={data.running} className="mt-auto pt-3" />
    </div>
  );
}

function StackRow({ item, active, onPick }: { item: InboxItem; active: boolean; onPick: () => void }) {
  return (
    <RowLink thread={item.thread} onClick={onPick} className={rowClass(active, cn(ROW_HEIGHT, "text-muted-foreground"))} style={rowPadding(0)}>
      <span className="flex w-2 shrink-0 justify-center">
        <Dot tier={item.tier} />
      </span>
      <Title thread={item.thread} className="flex-1" />
      <Age ms={item.at} />
    </RowLink>
  );
}
