# Upstream `thread-list` internals and `bb-plugin-attention`

Research for issue #3 (questions 3 and 4 in `docs/brief.md`). Input, not decisions.

**Fork pin:** get-bb/bb `55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00` (2026-11-07). Paths in Part A are relative to `https://github.com/get-bb/bb/blob/55135d1e/plugins/thread-list/`. Line numbers are at that commit. The plugin is about 15.8k lines of non-test TS/TSX. The two largest files are `app/list/ProjectRow.tsx` (2402 lines) and `app/list/ProjectList.tsx` (1850).

## Part A: upstream `thread-list`

### A1. How the tree is built

Data enters through one hook. `useSidebarData()` (`app/model/use-sidebar-data.ts:194`) calls `experimental_useSidebarThreads({ experimental_lifecycles })`, then `buildSidebarData` (`:71`) buckets threads by `projectId` and keeps object identity stable across renders (`:92-131`). `SidebarThread` is just `PluginSidebarThread` (`app/model/sidebar-thread.ts:3`). Everything below is pure functions over that array.

| Concern | Where | How |
|---|---|---|
| Nested children | `app/model/project-thread-groups.ts` `buildThreadTreeItems` `:349`, `buildThreadNode` `:237` | `childrenByParentId` is built from `parentThreadId` alone. A thread is a root if it has no parent or its parent isn't in the set (`isRootThread` `:285`). Cycles are guarded with `ancestorThreadIds`/`visitedThreadIds`. Every node carries `stats.hiddenThreads` (all descendants), which collapsed-row status rollups use. |
| Item model | same file `:44` | `ProjectThreadItem = thread \| environment \| section`. |
| Worktree grouping | `bucketEnvironmentThreadGroups` `:440` | Sibling nodes are grouped under an environment header only when the env is a worktree (`environment.isWorktree === true`), it differs from the parent's env (`parentEnvironmentId`), and **at least two** siblings share it (`hasAtLeastTwoThreadNodes` `:487`). A child sharing its parent's worktree stays a plain nested row. A lone child in its own worktree also stays a plain row. The `environmentGrouping` pref is `"auto" \| boolean` (`shared/preferences.ts:31`). |
| Cross-project "references" | `createSidebarProjectIdResolver` `:295` | Walks the `parentThreadId` chain and files a thread under its **root's** project. `ThreadTreeNodeRow` then passes `crossProjectId` when `thread.projectId` differs (`app/list/ProjectRow.tsx:1544`), and `ThreadRow` labels it "In project X" (`app/rows/ThreadRow.tsx:367-372`). `sourceThreadId` and `lifecycleOwnerThreadId` are **not read anywhere** in the tree; they appear only in `app/model/fixtures.ts:63-64`. |
| Pinned | `app/model/pinned-sidebar-threads.ts` `buildPinnedSidebarState` `:102` | `pinnedAt !== null` pins the thread **and all its descendants** (`addDescendantThreadIds`). Roots sort by `pinSortKey`, then `pinnedAt`. Pinned threads are removed from the project buckets (`ProjectList.tsx:569`). |
| Custom sections | `buildSectionThreadList` `:415` → `bucketIntoSections` `:592` | Root items are bucketed by `thread.sectionId`. An unknown id gets a fallback "Section" group. Used in chronological mode. |
| Modes | `ActiveSidebarModeSections` (`app/list/ProjectList.tsx:400`) dispatches to `ProjectModeSections` `:520`, `SectionModeSections` (chronological) `:857`, `MachineModeSections` `:1003` | Machine mode buckets by `thread.host?.id` (`app/model/machine-thread-groups.ts:16`), with "Unknown machine" and "No machine" groups at the end. |
| Sort | `getSidebarThreadComparator` (`ProjectList.tsx:298`), `compareStandardThreads` (`project-thread-groups.ts:105`) | Active threads go first (newest created). The rest sort by `latestAttentionAt` desc. "By read status" wraps the comparator (`app/model/read-status-grouping.ts:59`). "Unread" there means `parentThreadId === null && isUnread && status ∈ {idle, error}` (`:11`). |

### A2. State and storage

- **Server:** `server.ts`. The only storage is plugin KV, one key per preference: `preference:<key>` (`:24`, `createPreferenceStore` `:64`). Writes are zod-validated against `shared/preferences.ts:92` (`preferenceDefinitions`, about 20 keys: organization, sort, section order, `hiddenGroups`, `rowActions`, the `collapsed*` id lists). Every write publishes realtime on channel `"preferences"` (`shared/preferences.ts:295`, `server.ts:98`). It exposes the RPCs `listPreferences`/`setPreference`/`resetPreference` (`:39`) and the CLI `bb <pluginId> prefs list|get|set|reset` (`:210`). There's a one-time migration from bb's legacy `uiPreferences` (`:132`, guarded by `migration:ui-preferences:v1`).
- **Client:** `app/preferences/`. Jotai atoms (`atoms.ts`) are built by `createSyncedPreferenceAtom` (`synced-preference-atom.ts:17`). `PreferencesSync` (`PreferencesSync.tsx:24`) hydrates first from a `localStorage` mirror `bb.<pluginId>.preferences.v1` (`preferences-sync.ts:18,160`) and then from RPC (`:189`). Writes are debounced at 150 ms (`:15,260`), and other windows' changes are applied through `useRealtime` (`:215`).
- **Not stored by the plugin:** sections, pins, pin order, and thread moves. These go through `sdk.threads.*` (e.g. `reorderPinned`, `ProjectList.tsx:1338`) so `bb thread section` agrees. Selection, rename, and drag state are in-memory React/Jotai.
- **Relevance for us:** there is no per-thread plugin state today. Verification records (who and when) need new KV keys or plugin SQL. The `preference:` + realtime pattern above is the template.

### A3. Where an Inbox tab slots in

- **Root:** `app.tsx:13-32`. `ThreadList` (props `activeThreadId`, `isCompactViewport`, `onNavigate`) wraps `CompactViewportOverrideProvider` → `TooltipProvider` → `PreferencesSync` → `ThreadSelectionProvider` → `ProjectList`. It is registered at `app.tsx:35` as `app.slots.experimental_threadList({ id: "thread-list", … })`, along with the `move` thread action.
- **Scroll area is host-owned.** The plugin renders into bb's `[data-sidebar="content"]` element and finds it from inside (`app/ui/sidebar.tsx:5,10,30`). `ProjectListShell` (`ProjectList.tsx:375`) = `ThreadRowNavigationProvider` → `SidebarContentElementProvider` → `SidebarStickyStack` → `SidebarGroupContent`. Windowing (`app/list/SidebarWindowedItems.tsx`) and sticky headers depend on that element.
- **Cleanest seam** (*inferred*): in `app.tsx`'s `ThreadList`, put a sticky `Threads | Inbox` switch above the content and render `<ProjectList>` or `<InboxList>` inside the same provider stack. A new tab preference (`activeTab`) goes into `preferenceDefinitions` so it syncs like the rest. A lighter alternative is to branch inside `ProjectListComponent` at `ProjectList.tsx:1711`, swapping `<ActiveSidebarModeSections>` for the inbox inside the existing `ProjectListShell`. That keeps the loading state (`:1696`), sticky stack, and contexts (`SidebarProjectsContext`, `SidebarProvidersContext`, `:1836`) for free. `useSidebarThreadReveal()` (`app.tsx:18`) scrolls to the active thread and should be skipped while the Inbox is showing.
- **Reusable as-is:**
  - SDK, with no fork code: `experimental_resolveThreadStatus` + `experimental_ThreadStatusGlyph` (status glyph, rollups via `hiddenThreads`), `ThreadTitle`, `experimental_ThreadRowMetadata` (PR number etc.), `experimental_ThreadActionsMenu`/`ContextMenu`, `experimental_ProviderIcon`, `useSidebarThreadRowStatus`.
  - Fork components: `ThreadRow` (`app/rows/ThreadRow.tsx:333`, props `{thread, crossProjectId, isActive, options: {kind:"default", depth:0, isCompact}}`) gives a native row with hover actions, rename, and split drag. It needs `SidebarRenameProvider`, `ThreadSelectionProvider`, `ThreadRowNavigationProvider`, and `SidebarProvidersContext`, so it must render inside the shell. `useHiddenThreadsStatus` (`app/list/groupRollups.ts:64`) gives "status of a collapsed group", which suits a count row like "3 running".
  - Row classes: `@/components/ui/sidebar-row-classes`, `sidebar-hover-actions`.

### A4. Forking standalone: checklist

Upstream already supports this. `thread-list` is on bb's **forkable** list (`scripts/forkable-plugins.json:41`, rules in `docs/forkable-plugins.md`), and CI builds a standalone copy with `scripts/lib/plugin-fork.mjs` (`pnpm check:plugin-forks --keep plugins/thread-list` leaves the generated copy on disk). Repeat its rewrite:

- [ ] **`@/` alias → vendored registry items.** 32 distinct modules imported from 27 non-test files (plus 12 test files). **All 32 exist in the registry** (`packages/plugin-registry/r/*.json`, checked one by one). `bb plugin new` only pre-vendors button, card, input, checkbox, dialog, `lib/utils`, `lib/portal-scope`, icon, responsive-overlay, drawer, and hooks (bb-plugin-authoring `frontend-hooks-and-ui.md:249`). Add the rest: `npx shadcn add @bb/<item>` with `components.json` pinned to the bb release tag.
  - `lib/utils` ×12, `sidebar-row-classes` ×12, `icon` ×11 (host-backed flavor), `coarse-pointer-sizing` ×10, `button` ×9, `sortable-motion` ×8, `use-drag-click-suppression` ×7, `dropdown-menu` ×7, `hooks/use-compact-viewport` ×6, `sidebar-hover-actions` ×5, `tooltip` ×4, `motion` ×4, `use-sidebar-reorder-dnd` ×3, `split-pane-mini-map` ×3, `context-menu` ×3, `use-reorder-dnd`, `skeleton`, `sidebar-visibility-customize`, `confirm-delete-dialog`, `chrome-style-tokens`, `action-menu-items` ×2 each, and ×1 each: `use-dialog-state`, `thread-list-empty-state`, `shortcut-pill`, `rename-session-dialog`, `rename-dialog`, `input`, `inline-rename-editor`, `inline-rename`, `dialog`, `context-selection`, `compact-long-press-menu`.
- [ ] **`tsconfig.json`:** replace `paths` (now pointing at `../../packages/shared-ui/src` and the registry icon flavor) with `{"@/*": ["./*"]}` (`plugin-fork.mjs:150`). Keep `include` listing every file that imports `@/`. `vitest.config.ts` already uses `tsconfigPaths: true` and is standalone.
- [ ] **`@bb/shared-ui` (`workspace:*`, dep):** delete it. Nothing imports it by name; it only backs the `@/` alias. Add the registry items' npm deps instead (`plugin-fork.mjs:101,116`).
- [ ] **`@get-bb/plugin-sdk` (`workspace:*`, devDep):** pin the published version, `0.6.133` (npm `latest`, same as the pinned commit's `packages/plugin-sdk/package.json`). Used from 24 non-test files: `/app` ×32 imports, root ×1 (`server.ts`), `/testing` and `/testing/app` in tests. `engines.bbPluginSdk` is `>=0.6.112`.
- [ ] **`@bb/plugin-build` (`workspace:*`, devDep):** delete it along with the `prepare:bundled` script, which only matters for bb's bundled builtins (`plugin-fork.mjs:110,131-143`). Build with `bb plugin build .`.
- [ ] **Other deps** are already public: `@dnd-kit/{core,sortable,utilities}`, `@radix-ui/react-compose-refs`, `@radix-ui/react-slot`, `jotai`, `zod`. `react`, `react-dom`, and `sonner` are runtime-shimmed (devDeps only). Tests need `better-sqlite3`, `hono`, `cron-parser`, `@testing-library/*`, and `jsdom`, which are all already in devDeps. Install with `--legacy-peer-deps`, as CI does.
- [ ] **Scripts:** `typecheck` uses `tsrs` (a TS7 dev build) and `lint` uses `oxlint`. Either keep them or swap in `tsc --noEmit`.
- [ ] **Rename to coexist** (`docs/forkable-plugins.md`, "Names unchanged"): change the package name (this changes `pluginId` → CLI name, KV namespace, localStorage mirror key, and the `<pluginId>/move` row-action key in `rowActions`, `shared/preferences.ts:184`), the slot id `"thread-list"` (`app.tsx:36`), and the hard-coded `"thread-list/customizeRowActions"` (`app/rows/ThreadRow.tsx:290`). The `uiPreferences` migration reruns once for the new id, which is harmless.

## Part B: `bb-plugin-attention` 0.1.5

Source: `~/.bb/plugins/cache/npm/bb-plugin-attention/0.1.5/node_modules/bb-plugin-attention/{server.ts,app.tsx}` (MIT, slogsdon). It is a **homepage section** (`app.tsx:135`), not a sidebar, and it runs on the old SDK 0.4.6.

### B1. Signals and decision (`server.ts:81-141`)

The server snapshots `bb.sdk.threads.list({archived:false, limit:500})` on every RPC call (`:85`). It skips `visibility !== "visible"`, archived, and deleted threads (`:93-94`). Then the first match wins:

1. **error:** `status === "error" || runtime.displayStatus === "error"` (`:100`).
2. **interaction:** if `hasPendingInteraction || status === "active"`, it fetches `threads.interactions.list` and takes the first `status === "pending"` (`:103-113`). That is one extra RPC per busy thread. `interactionMeta` (`:49-79`) labels it from `payload.kind`: `user_question` → "Question for you" plus the first prompt. `plugin` → form title. Approval `subject.kind`: `plan` → "Plan ready for review", plus `command` / `file_change` / tool.
3. **unread:** `status === "idle" && latestAttentionAt > (lastReadAt ?? 0)` (`:121-123`), labeled "Turn finished — reply needed".

A running thread with no pending interaction is excluded. There is no parent/child awareness: every visible child is its own candidate.

### B2. Order and clearing

- Ranked error (0) → interaction (1) → unread (2), then `latestAttentionAt` desc, capped at 10 with a total (`:42,143-151`).
- **Nothing is persisted, so there's nothing to clear.** An item disappears when its source state changes: the error is resolved, the interaction answered, or the thread read (`lastReadAt` catches up).
- Freshness: realtime `attention-changed` fires on `thread.idle`, `thread.failed` (`:164-175`), and SDK `thread:changed` with `interactions-changed` (`:177-205`). The client refetches the whole snapshot (`app.tsx:86-98`). Reading a thread publishes nothing, so an "unread" item can linger until the next event or remount (*inferred* from the code).

### B3. Against our draft tiers and "clear = verified"

| Ours | attention | Gap |
|---|---|---|
| 1 Blocked on you | `interaction` (rank 1) | Same signals. We rank it **above** errors; they rank it below. The sidebar hook already gives `hasPendingInteraction` without an RPC. The interaction *kind* (question vs plan vs approval) still needs `threads.interactions.list`. A "grilling child" isn't detected. |
| 2 Broken | `error` (rank 0) | They only use `error`. We also want stuck: `queuedWork === "failed"`, `indicator` `"queued-failed"`/`"unread-error"`, and `parentNotifications` "stuck" outcomes. |
| 3 Verify | `unread` (partly) | They use "idle + unread" and the label assumes a reply is needed. That's the exact question/report ambiguity we hand to the cheap model. There's no diff/PR/test evidence. |
| 4 FYI | none | No child folding. We'd fold `audience=parent` children into the parent item. |
| Clear = verified | Clear = state changed / read | Opening a thread clears it, so there's no sign-off record. Ours must not be cleared by reading; it needs a stored `{threadId, verifiedAt, verifiedBy, scope}` that's reopened when `latestAttentionAt` passes `verifiedAt`. |

Worth borrowing: `interactionMeta`'s label mapping, and the event set (`thread.idle`, `thread.failed`, `interactions-changed`) for server-side recompute.
