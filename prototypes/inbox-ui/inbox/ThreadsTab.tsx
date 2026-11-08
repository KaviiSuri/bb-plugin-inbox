// PROTOTYPE — a plain Threads tab: pinned, then projects, children nested by
// parentThreadId only (like upstream). The real tab will be the forked
// thread-list; don't spend effort here.
import { useMemo } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useLocalState } from "./model";
import { Provider, RowLink, SectionHeader, StatusGlyph, Title, rowClass, rowPadding, useInbox } from "./parts";
import { useSidebarData } from "./sidebar-data";

export function ThreadsTab() {
  const { threads, projects } = useSidebarData();
  const [collapsed, setCollapsed] = useLocalState<string[]>("threads.collapsed", []);
  const toggle = (id: string) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const { roots, kids } = useMemo(() => {
    const visible = threads.filter((t) => !t.isHidden && !t.isArchived);
    const ids = new Set(visible.map((t) => t.id));
    const kids = new Map<string, PluginSidebarThread[]>();
    for (const t of visible) {
      if (t.parentThreadId && ids.has(t.parentThreadId)) {
        const list = kids.get(t.parentThreadId) ?? [];
        list.push(t);
        kids.set(t.parentThreadId, list);
      }
    }
    const cmp = (a: PluginSidebarThread, b: PluginSidebarThread) => b.latestAttentionAt - a.latestAttentionAt;
    for (const list of kids.values()) list.sort(cmp);
    const roots = visible.filter((t) => !t.parentThreadId || !ids.has(t.parentThreadId)).sort(cmp);
    return { roots, kids };
  }, [threads]);

  const pinned = roots.filter((t) => t.isPinned);
  const groups = new Map<string, PluginSidebarThread[]>();
  for (const t of roots) {
    if (t.isPinned) continue;
    const list = groups.get(t.projectId) ?? [];
    list.push(t);
    groups.set(t.projectId, list);
  }

  const renderNode = (t: PluginSidebarThread, depth: number): React.ReactNode => {
    const children = kids.get(t.id) ?? [];
    const isCollapsed = collapsed.includes(t.id);
    return (
      <div key={t.id}>
        <Row thread={t} depth={depth} hasChildren={children.length > 0} isCollapsed={isCollapsed} onToggle={() => toggle(t.id)} hidden={isCollapsed ? children : []} />
        {!isCollapsed ? children.map((c) => renderNode(c, depth + 1)) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {pinned.length > 0 ? (
        <section>
          <SectionHeader onClick={() => toggle("pinned")} collapsed={collapsed.includes("pinned")}>
            Pinned
          </SectionHeader>
          {collapsed.includes("pinned") ? null : pinned.map((t) => renderNode(t, 0))}
        </section>
      ) : null}
      {[...groups.entries()].map(([projectId, list]) => {
        const key = `project:${projectId}`;
        const project = projects.find((p) => p.id === projectId);
        return (
          <section key={projectId}>
            <SectionHeader onClick={() => toggle(key)} collapsed={collapsed.includes(key)}>
              <Icon name="Folder" className="size-3.5" />
              <span className="truncate">{project?.name ?? "Fixtures"}</span>
            </SectionHeader>
            {collapsed.includes(key) ? null : list.map((t) => renderNode(t, 0))}
          </section>
        );
      })}
    </div>
  );
}

function Row({
  thread,
  depth,
  hasChildren,
  isCollapsed,
  onToggle,
  hidden,
}: {
  thread: PluginSidebarThread;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  hidden: PluginSidebarThread[];
}) {
  const { activeThreadId } = useInbox();
  return (
    <RowLink thread={thread} className={rowClass(activeThreadId === thread.id)} style={rowPadding(depth)}>
      <Provider thread={thread} />
      <Title thread={thread} className="flex-1" />
      {hasChildren ? (
        <button
          type="button"
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          className="flex size-5 shrink-0 items-center justify-center rounded text-subtle-foreground hover:bg-state-hover"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <Icon name="ChevronRight" className={cn("size-3 transition-transform", !isCollapsed && "rotate-90")} />
        </button>
      ) : null}
      <span className="flex size-6 shrink-0 items-center justify-center">
        <StatusGlyph thread={thread} hidden={hidden} />
      </span>
    </RowLink>
  );
}
