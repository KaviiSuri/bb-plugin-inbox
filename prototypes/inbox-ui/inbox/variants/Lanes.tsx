// PROTOTYPE — Variant A: tier lanes plus a pinned-bottom "Running" shelf.
// Bet: the tier is the first thing you need to know, so it's the structure.
// Lanes fold; a folded lane shows a bold count when something new lands in it.
import { useEffect, useRef, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { SIDEBAR_HOVER_ACTIONS_ROW_CLASS } from "@/components/ui/sidebar-hover-actions";
import { TIER_LABEL, useFrozenOrder, useLocalState, type Classified, type InboxItem, type Tier } from "../model";
import {
  EvidenceChips,
  Provider,
  SectionHeader,
  StatusGlyph,
  TierIcon,
  Title,
  VerifyIconButton,
  relativeTime,
  rowClass,
  rowPadding,
  useInbox,
  RowLink,
} from "../parts";

export function LanesVariant({ data }: { data: Classified }) {
  const [frozen, setFrozen] = useState(false);
  const items = useFrozenOrder(data.items, frozen);
  const [collapsed, setCollapsed] = useLocalState<Tier[]>("lanes.collapsed", [4]);
  const [runningOpen, setRunningOpen] = useLocalState("lanes.runningOpen", false);

  return (
    <div className="flex min-h-full flex-col">
      <div
        className="flex flex-col gap-1"
        onPointerEnter={() => setFrozen(true)}
        onPointerLeave={() => setFrozen(false)}
      >
        {([1, 2, 3, 4] as Tier[]).map((tier) => (
          <Lane
            key={tier}
            tier={tier}
            items={items.filter((i) => i.tier === tier)}
            collapsed={collapsed.includes(tier)}
            onToggle={() =>
              setCollapsed((prev) => (prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]))
            }
          />
        ))}
        {data.items.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            Nothing waiting on you.{data.verifiedCount > 0 ? ` ${data.verifiedCount} verified.` : ""}
          </div>
        ) : null}
      </div>
      <div className="mt-auto pt-3">
        <RunningShelf threads={data.running} open={runningOpen} onToggle={() => setRunningOpen((o) => !o)} />
      </div>
    </div>
  );
}

function Lane({
  tier,
  items,
  collapsed,
  onToggle,
}: {
  tier: Tier;
  items: InboxItem[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  // A folded lane's count turns bold when something new arrives (Plannotator).
  const seen = useRef(new Set(items.map((i) => i.id)));
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    if (!collapsed) {
      seen.current = new Set(items.map((i) => i.id));
      setHasNew(false);
      return;
    }
    if (items.some((i) => !seen.current.has(i.id))) setHasNew(true);
  }, [collapsed, items]);

  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeader
        onClick={onToggle}
        collapsed={collapsed}
        right={
          <span className={cn("tabular-nums", hasNew ? "font-semibold text-sidebar-foreground" : "text-subtle-foreground")}>
            {items.length}
          </span>
        }
      >
        <TierIcon tier={tier} />
        {TIER_LABEL[tier]}
      </SectionHeader>
      {collapsed ? null : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <LaneRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LaneRow({ item }: { item: InboxItem }) {
  const { activeThreadId, evidence } = useInbox();
  const ev = evidence(item.thread);
  const canVerify = item.tier >= 3;
  return (
    <li>
      <RowLink
        thread={item.thread}
        className={rowClass(
          activeThreadId === item.thread.id,
          cn(SIDEBAR_HOVER_ACTIONS_ROW_CLASS, "h-auto min-h-[var(--bb-sidebar-row-height)] items-start py-1.5"),
        )}
        style={rowPadding(0)}
      >
        <span className="mt-0.5">
          <Provider thread={item.thread} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Title thread={item.thread} className="flex-1" />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {item.reopened ? <Icon name="RotateCcw" className="size-3 shrink-0 text-amber-500" /> : null}
            <span className="min-w-0 truncate">{item.waitingOn}</span>
          </span>
          <EvidenceChips item={item} ev={ev} />
        </span>
        <span className="relative flex h-6 w-7 shrink-0 items-center justify-center">
          <span className={cn("text-[11px] tabular-nums text-subtle-foreground", canVerify && "group-hover/inbox-row:hidden")}>
            {relativeTime(item.at)}
          </span>
          {canVerify ? <VerifyIconButton item={item} className="absolute inset-0 m-auto hidden group-hover/inbox-row:inline-flex" /> : null}
        </span>
      </RowLink>
    </li>
  );
}

function RunningShelf({
  threads,
  open,
  onToggle,
}: {
  threads: PluginSidebarThread[];
  open: boolean;
  onToggle: () => void;
}) {
  const { activeThreadId } = useInbox();
  if (threads.length === 0) return null;
  return (
    <section className="border-t border-border-hairline pt-1">
      <SectionHeader
        onClick={onToggle}
        collapsed={!open}
        right={<span className="tabular-nums text-subtle-foreground">{threads.length}</span>}
      >
        <StatusGlyph thread={threads[0]!} hidden={threads.slice(1)} />
        Running
      </SectionHeader>
      {open ? (
        <ul className="flex flex-col opacity-80">
          {threads.map((t) => (
            <li key={t.id}>
              <RowLink thread={t} className={rowClass(activeThreadId === t.id)} style={rowPadding(0)}>
                <Provider thread={t} />
                <Title thread={t} className="flex-1" />
                <StatusGlyph thread={t} />
              </RowLink>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
