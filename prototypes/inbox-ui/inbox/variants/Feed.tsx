// PROTOTYPE — Variant B: one ranked list; a row expands in place to show its
// evidence. Bet: density first. No section chrome, tier is a glyph, and the
// primary affordance is "look at the evidence here" rather than "open the thread".
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { TIER_LABEL, useFrozenOrder, type Classified, type InboxItem } from "../model";
import {
  EvidenceChips,
  EvidencePanel,
  RowLink,
  TierIcon,
  Title,
  relativeTime,
  rowClass,
  rowPadding,
  useInbox,
  useOpenThread,
} from "../parts";

export function FeedVariant({ data }: { data: Classified }) {
  const [frozen, setFrozen] = useState(false);
  const items = useFrozenOrder(data.items, frozen);
  const [expanded, setExpanded] = useState<string | null>(null);
  const blocked = data.items.filter((i) => i.tier <= 2).length;

  return (
    <div className="flex flex-col">
      <div className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-medium text-sidebar-foreground">{data.items.length}</span> to clear
        </span>
        {blocked > 0 ? <span className="tabular-nums text-amber-500">{blocked} need you</span> : null}
        <span className="flex-1" />
        {data.running.length > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums" title={data.running.map((t) => t.displayTitle).join("\n")}>
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-muted-foreground/50" />
              <span className="relative inline-flex size-1.5 rounded-full bg-muted-foreground/60" />
            </span>
            {data.running.length} running
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col" onPointerEnter={() => setFrozen(true)} onPointerLeave={() => setFrozen(false)}>
        {items.map((item, index) => (
          <FeedRow
            key={item.id}
            item={item}
            tierBreak={index > 0 && items[index - 1]!.tier !== item.tier}
            expanded={expanded === item.id}
            onToggle={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
          />
        ))}
      </ul>
      {data.items.length === 0 ? (
        <div className="px-2 py-6 text-center text-xs text-muted-foreground">Inbox clear.</div>
      ) : null}
    </div>
  );
}

function FeedRow({
  item,
  expanded,
  onToggle,
  tierBreak,
}: {
  item: InboxItem;
  expanded: boolean;
  onToggle: () => void;
  tierBreak: boolean;
}) {
  const { activeThreadId, evidence, verify } = useInbox();
  const open = useOpenThread();
  const ev = evidence(item.thread);
  return (
    <li className={cn(tierBreak && "mt-1 border-t border-border-hairline pt-1", expanded && "rounded-md bg-sidebar-accent/50")}>
      <RowLink
        thread={item.thread}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className={rowClass(activeThreadId === item.thread.id && !expanded, "pr-1")}
        style={rowPadding(0)}
      >
        <TierIcon tier={item.tier} />
        <Title thread={item.thread} className="flex-1" />
        {expanded ? null : <EvidenceChips item={item} ev={ev} className="max-w-[45%] shrink" />}
        <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-subtle-foreground">{relativeTime(item.at)}</span>
      </RowLink>
      {expanded ? (
        <div className="flex flex-col gap-2 px-2 pt-0.5 pb-2" style={{ paddingLeft: rowPadding(0).paddingLeft + 22 }}>
          <div className="text-xs">
            <span className="text-subtle-foreground">{TIER_LABEL[item.tier]} · </span>
            <span className="text-sidebar-foreground">{item.waitingOn}</span>
          </div>
          <EvidencePanel item={item} ev={ev} compact />
          <div className="flex items-center gap-1.5">
            {item.tier >= 3 ? (
              <Button size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => verify(item)}>
                <Icon name="Check" className="size-3" /> Verify
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={item.tier >= 3 ? "ghost" : "default"}
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => open(item.thread)}
            >
              <Icon name="ArrowUpRight" className="size-3" />
              {item.tier === 1 ? "Answer" : item.tier === 2 ? "Fix" : "Open"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
