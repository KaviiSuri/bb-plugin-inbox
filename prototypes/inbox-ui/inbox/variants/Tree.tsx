// PROTOTYPE — Variant D: no separate list. The thread tree you already know,
// filtered to what needs you, with urgency dots that roll up through collapsed
// parents (T3 folder dot). Bet: context (who spawned what, which project) beats
// a flat queue, and a second mental model costs more than it buys. The control.
import { useMemo, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useFrozenOrder, useLocalState, TIER_LABEL, type Classified, type InboxItem, type Tier } from "../model";
import {
  EvidenceChips,
  Provider,
  RowLink,
  SectionHeader,
  StatusGlyph,
  Title,
  VerifyIconButton,
  rowClass,
  rowPadding,
  useInbox,
} from "../parts";
import { useSidebarData } from "../sidebar-data";

interface Node {
  thread: PluginSidebarThread;
  item: InboxItem | null;
  /** Folded into its parent's item. */
  folded: boolean;
  children: Node[];
  /** Most urgent tier in this subtree. */
  urgency: Tier | null;
  running: boolean;
  at: number;
}

const DOT: Record<Tier, string> = {
  1: "bg-amber-500",
  2: "bg-destructive",
  3: "bg-success-foreground",
  4: "bg-muted-foreground/60",
};

export function TreeVariant({ data, threads }: { data: Classified; threads: readonly PluginSidebarThread[] }) {
  const { projects } = useSidebarData();
  const [attentionOnly, setAttentionOnly] = useLocalState("tree.attentionOnly", true);
  const [collapsed, setCollapsed] = useLocalState<string[]>("tree.collapsed", []);
  const [frozen, setFrozen] = useState(false);

  const roots = useMemo(() => buildTree(threads, data, attentionOnly), [threads, data, attentionOnly]);
  const ordered = useFrozenOrder(
    roots.map((n) => ({ ...n, id: n.thread.id })),
    frozen,
  );
  const byProject = new Map<string, typeof ordered>();
  for (const n of ordered) {
    const list = byProject.get(n.thread.projectId) ?? [];
    list.push(n);
    byProject.set(n.thread.projectId, list);
  }
  const toggle = (id: string) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setAttentionOnly(true)}
          className={cn("rounded px-1.5 py-0.5", attentionOnly ? "bg-state-active text-sidebar-foreground" : "hover:text-sidebar-foreground")}
        >
          Needs attention <span className="tabular-nums">{data.items.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setAttentionOnly(false)}
          className={cn("rounded px-1.5 py-0.5", !attentionOnly ? "bg-state-active text-sidebar-foreground" : "hover:text-sidebar-foreground")}
        >
          All
        </button>
        <span className="flex-1" />
        {attentionOnly && data.running.length > 0 ? (
          <span className="tabular-nums" title="Hidden while filtering">
            {data.running.length} running
          </span>
        ) : null}
      </div>
      <div onPointerEnter={() => setFrozen(true)} onPointerLeave={() => setFrozen(false)}>
        {[...byProject.entries()].map(([projectId, nodes]) => {
          const project = projects.find((p) => p.id === projectId);
          const key = `project:${projectId}`;
          const isCollapsed = collapsed.includes(key);
          const urgency = minTier(nodes.map((n) => n.urgency));
          return (
            <section key={projectId} className="pb-1">
              <SectionHeader onClick={() => toggle(key)} collapsed={isCollapsed} right={isCollapsed && urgency ? <Dot tier={urgency} /> : null}>
                <Icon name="Folder" className="size-3.5" />
                <span className="truncate">{project?.name ?? (projectId.startsWith("fx") ? "Fixtures" : "Project")}</span>
              </SectionHeader>
              {isCollapsed ? null : nodes.map((n) => <TreeRow key={n.thread.id} node={n} depth={0} collapsed={collapsed} onToggle={toggle} />)}
            </section>
          );
        })}
        {ordered.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing needs your attention.</div>
        ) : null}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: Node;
  depth: number;
  collapsed: string[];
  onToggle: (id: string) => void;
}) {
  const { activeThreadId, evidence } = useInbox();
  const isCollapsed = collapsed.includes(node.thread.id);
  const hasChildren = node.children.length > 0;
  const item = node.item;
  const rollup = isCollapsed && hasChildren ? node.urgency : item?.tier ?? null;
  const hidden = isCollapsed ? flatten(node.children).map((n) => n.thread) : [];
  return (
    <>
      <RowLink
        thread={node.thread}
        className={rowClass(
          activeThreadId === node.thread.id,
          cn((item || node.folded) && "h-auto min-h-[var(--bb-sidebar-row-height)] py-1", !item && !node.running && "opacity-60", node.folded && "opacity-70"),
        )}
        style={rowPadding(depth)}
      >
        <span className="flex w-2 shrink-0 justify-center">{rollup ? <Dot tier={rollup} /> : null}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <Provider thread={node.thread} />
            <Title thread={node.thread} className="flex-1" />
            {hasChildren ? (
              <button
                type="button"
                aria-label={isCollapsed ? "Expand" : "Collapse"}
                className="flex size-5 shrink-0 items-center justify-center rounded text-subtle-foreground hover:bg-state-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.thread.id);
                }}
              >
                <Icon name="ChevronRight" className={cn("size-3 transition-transform", !isCollapsed && "rotate-90")} />
              </button>
            ) : null}
          </span>
          {item ? (
            <span className="flex min-w-0 items-center gap-2 pl-5.5 text-[11px] leading-4 text-muted-foreground">
              <span className="min-w-0 truncate" title={`${TIER_LABEL[item.tier]}: ${item.waitingOn}`}>
                {item.waitingOn}
              </span>
              <EvidenceChips item={item} ev={evidence(item.thread)} className="shrink-0" />
            </span>
          ) : node.folded ? (
            <span className="pl-5.5 text-[11px] leading-4 text-subtle-foreground">↳ reported to parent</span>
          ) : null}
        </span>
        <span className="relative flex size-6 shrink-0 items-center justify-center">
          <span className={cn(item && item.tier >= 3 && "group-hover/inbox-row:hidden")}>
            <StatusGlyph thread={node.thread} hidden={hidden} />
          </span>
          {item && item.tier >= 3 ? (
            <VerifyIconButton item={item} className="absolute inset-0 m-auto hidden group-hover/inbox-row:inline-flex" />
          ) : null}
        </span>
      </RowLink>
      {hasChildren && !isCollapsed
        ? node.children.map((c) => <TreeRow key={c.thread.id} node={c} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} />)
        : null}
    </>
  );
}

function Dot({ tier }: { tier: Tier }) {
  return <span title={TIER_LABEL[tier]} className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT[tier])} />;
}

function minTier(tiers: (Tier | null)[]): Tier | null {
  const present = tiers.filter((t): t is Tier => t !== null);
  return present.length ? (Math.min(...present) as Tier) : null;
}

function flatten(nodes: Node[]): Node[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

function buildTree(threads: readonly PluginSidebarThread[], data: Classified, attentionOnly: boolean): Node[] {
  const visible = threads.filter((t) => !t.isHidden && !t.isArchived);
  const ids = new Set(visible.map((t) => t.id));
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const foldedIds = new Set(data.items.flatMap((i) => i.children.map((c) => c.thread.id)));
  const runningIds = new Set(data.running.map((t) => t.id));
  const kids = new Map<string, PluginSidebarThread[]>();
  for (const t of visible) {
    if (t.parentThreadId && ids.has(t.parentThreadId)) {
      const list = kids.get(t.parentThreadId) ?? [];
      list.push(t);
      kids.set(t.parentThreadId, list);
    }
  }
  const build = (t: PluginSidebarThread, seen: Set<string>): Node | null => {
    if (seen.has(t.id)) return null;
    const nextSeen = new Set(seen).add(t.id);
    const children = (kids.get(t.id) ?? [])
      .map((c) => build(c, nextSeen))
      .filter((n): n is Node => n !== null)
      .sort(compareNodes);
    const item = itemById.get(t.id) ?? null;
    const folded = foldedIds.has(t.id);
    const urgency = minTier([item?.tier ?? null, ...children.map((c) => c.urgency)]);
    const node: Node = {
      thread: t,
      item,
      folded,
      children,
      urgency,
      running: runningIds.has(t.id),
      at: Math.max(t.latestAttentionAt, ...children.map((c) => c.at)),
    };
    if (attentionOnly && urgency === null && !folded) return null;
    return node;
  };
  return visible
    .filter((t) => !t.parentThreadId || !ids.has(t.parentThreadId))
    .map((t) => build(t, new Set()))
    .filter((n): n is Node => n !== null)
    .sort(compareNodes);
}

function compareNodes(a: Node, b: Node) {
  return (a.urgency ?? 9) - (b.urgency ?? 9) || b.at - a.at;
}
