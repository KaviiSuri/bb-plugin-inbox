// PROTOTYPE — Variant C: one item at a time (Superhuman / Plannotator Decision
// mode). Bet: triage is a session, not a glance. The card holds still until you
// act on it; Later items come back after everything else; zero is a place.
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { TIER_LABEL, type Classified, type InboxItem } from "../model";
import { EvidencePanel, Provider, TierIcon, Title, relativeTime, tierTone, useInbox, useOpenThread } from "../parts";
import { useScopedKeys } from "../keys";

export function FocusVariant({ data }: { data: Classified }) {
  const { evidence, verify } = useInbox();
  const open = useOpenThread();
  const [later, setLater] = useState<string[]>([]);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // Queue: everything not deferred, in rank order; then the Later set, in the
  // order you deferred it.
  const queue = useMemo(() => {
    const byId = new Map(data.items.map((i) => [i.id, i]));
    const now = data.items.filter((i) => !later.includes(i.id));
    const deferred = later.map((id) => byId.get(id)).filter((i): i is InboxItem => !!i);
    return [...now, ...deferred];
  }, [data.items, later]);

  // The current card doesn't change under you while it's still an item.
  const current = queue.find((i) => i.id === pinnedId) ?? queue[0] ?? null;
  useEffect(() => {
    if (current && current.id !== pinnedId) setPinnedId(current.id);
  }, [current, pinnedId]);

  const position = current ? queue.indexOf(current) + 1 : 0;
  const upNext = queue.filter((i) => i !== current).slice(0, 4);

  const advance = () => setPinnedId(null);
  const doVerify = () => {
    if (!current || current.tier < 3) return;
    verify(current);
    advance();
  };
  const doLater = () => {
    if (!current) return;
    setLater((prev) => [...prev.filter((id) => id !== current.id), current.id]);
    advance();
  };
  const doOpen = () => current && open(current.thread);

  useScopedKeys({
    v: doVerify,
    l: doLater,
    o: doOpen,
    Enter: doOpen,
  });

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Icon name="CircleCheck" className="size-8 text-success-foreground" />
        <div className="text-sm font-medium text-sidebar-foreground">Inbox zero</div>
        <div className="text-xs text-muted-foreground">
          {data.verifiedCount > 0 ? `${data.verifiedCount} verified. ` : ""}
          {data.running.length > 0 ? `${data.running.length} still running; they'll land here when they finish.` : "Nothing running."}
        </div>
      </div>
    );
  }

  const ev = evidence(current.thread);
  const isDeferred = later.includes(current.id);
  return (
    <div className="flex flex-col gap-2 px-1 pt-1">
      <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {position} of {queue.length}
        </span>
        <ProgressDots queue={queue} current={current} />
        <span className="flex-1" />
        {data.running.length > 0 ? <span className="tabular-nums">{data.running.length} running</span> : null}
      </div>

      <article className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xs">
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", tierTone(current.tier))}>
          <TierIcon tier={current.tier} />
          {TIER_LABEL[current.tier]}
          {isDeferred ? <span className="font-normal text-subtle-foreground">· from Later</span> : null}
          <span className="flex-1" />
          <span className="font-normal tabular-nums text-subtle-foreground">{relativeTime(current.at)}</span>
        </div>
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5">
            <Provider thread={current.thread} />
          </span>
          <Title thread={current.thread} className="whitespace-normal text-sm font-medium leading-5" />
        </div>
        <div className="text-sm leading-5 text-sidebar-foreground">{current.waitingOn}</div>
        <div className="border-t border-border-hairline pt-2">
          <EvidencePanel item={current} ev={ev} />
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          {current.tier >= 3 ? (
            <Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={doVerify}>
              <Icon name="Check" className="size-3.5" /> Verify <Kbd>V</Kbd>
            </Button>
          ) : (
            <Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={doOpen}>
              <Icon name="ArrowUpRight" className="size-3.5" /> {current.tier === 1 ? "Answer" : "Fix"} <Kbd>O</Kbd>
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={doLater}>
            Later <Kbd>L</Kbd>
          </Button>
          {current.tier >= 3 ? (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={doOpen}>
              Open <Kbd>O</Kbd>
            </Button>
          ) : null}
        </div>
      </article>

      {upNext.length > 0 ? (
        <div className="flex flex-col px-1 pt-1">
          <div className="pb-0.5 text-[11px] text-subtle-foreground">Up next</div>
          {upNext.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPinnedId(item.id)}
              className="flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-xs text-muted-foreground hover:bg-sidebar-accent"
            >
              <TierIcon tier={item.tier} className="size-3" />
              <span className="min-w-0 flex-1 truncate">{item.thread.displayTitle}</span>
              {later.includes(item.id) ? <span className="text-[10px] text-subtle-foreground">later</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProgressDots({ queue, current }: { queue: InboxItem[]; current: InboxItem }) {
  return (
    <span className="flex items-center gap-0.5 overflow-hidden">
      {queue.slice(0, 16).map((item) => (
        <span
          key={item.id}
          className={cn(
            "size-1.5 rounded-full",
            item === current ? "bg-sidebar-foreground" : item.tier <= 2 ? "bg-amber-500/60" : "bg-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="ml-0.5 rounded border border-current/25 px-1 text-[10px] leading-3 opacity-70">{children}</kbd>;
}
