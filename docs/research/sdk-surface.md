# BB Plugin SDK surface for the inbox

Research for issue #2 (questions 2 and 5 of `docs/brief.md`). Input, not decisions.

**Source.** bb 0.49.0, `@get-bb/plugin-sdk` 0.6.132, scaffolded with
`cd /tmp && bb plugin new inbox-probe && cd bb-plugin-inbox-probe && bb plugin types`.
Line numbers below refer to two files under
`/tmp/bb-plugin-inbox-probe/node_modules/@get-bb/plugin-sdk/bundled-types/`:

- **app** = `bb-plugin-sdk-app.d.ts` (the `@get-bb/plugin-sdk/app` frontend entry)
- **sdk** = `bb-plugin-sdk.d.ts` (the `@get-bb/plugin-sdk` backend entry)

`/tmp` doesn't last, so re-run the scaffold command to get the files back. **ref** means the
`bb-plugin-authoring` skill's `references/` directory. Live RPC schemas come from
`bb plugin rpc inspect <plugin> <method>`.

## 1. Thread list slot and hook

```ts
// app:22602  (in PluginAppSlots)
experimental_threadList(registration: PluginThreadListRegistration): void;

// app:21480
interface PluginThreadListRegistration {
  id: string;            // letters, digits, -, _
  title: string;         // shown in Settings → Appearance → Sidebar
  description?: string;
  component: ComponentType<PluginThreadListProps>;
}

// app:19600
interface PluginThreadListProps {
  activeThreadId: string | null;
  activeProjectId: string | null;
  isCompactViewport: boolean;
  onNavigate: () => void;   // call after opening a thread (closes mobile drawer)
  searchQuery: string;      // @deprecated, always ""
}

// app:24737
declare const experimental_useSidebarThreads: (options?: {
  experimental_lifecycles: readonly ("active" | "archived")[];  // default active
}) => PluginSidebarThreadsState;
```

Only one list can be active (the slot is exclusive). With no pin, the first registered list
that isn't bb's own wins. The user can pin a provider per client under Settings → Appearance →
Sidebar. If the component crashes, bb shows a placeholder instead (app:21465–21479). The
component owns only the scroll area. The New-thread button, the nav and the footer stay with
the host, so the Threads/Inbox tab bar has to go at the top of our scroll area. Thread objects
keep their identity across updates, but the array is new each time. Window the rows
(app:24180–24189).

### `PluginSidebarThreadsState` (app:20475)

| Field | Type | Inbox meaning |
|---|---|---|
| `status` | `"error" \| "loading" \| "ready"` | Gate the first render |
| `threads` | `readonly PluginSidebarThread[]` | Everything the inbox runs over |
| `projects` | `PluginSidebarProject[]` `{id, name, isPersonal, href, settingsHref}` (app:20451) | Project label on an item |
| `sections` | `PluginSidebarSection[]` `{id, name, createdAt, updatedAt}` (app:20468) | Threads tab only |
| `experimental_hosts?` | `{id, name}[]` | Machine label |
| `experimental_archived` | paging handle, or `null` unless `"archived"` was requested | A verified-then-archived view, if wanted |

### `PluginSidebarThread` (app:20326–20449)

| Field | Type | Inbox meaning |
|---|---|---|
| `id`, `projectId`, `href` | string | Item key; put `href` on the row anchor so the host handles routing |
| `title`, `titleFallback`, `displayTitle` | string \| null, string | Item title (`displayTitle` has mentions resolved) |
| `parentThreadId` | string \| null | Child→parent fold for `parent`-audience children |
| `lifecycleOwnerThreadId` | string \| null | Delegated child that stops with its owner. Hints that it's a worker, not a human-facing thread |
| `parentNotifications` | `"auto" \| "stuck" \| "off"` | Closest built-in hint of who watches a child (see §4) |
| `sourceThreadId`, `originKind` | string \| null, `"fork" \| null` | Forks. Not a child-audience signal |
| `originPluginId` | string \| null | Plugin that spawned it. Seeding `pluginMetadata` stamps *our* id here (§4) |
| `sectionId` | string \| null | Threads tab only |
| `providerId` | string | Provider icon |
| `status` | `active \| error \| idle \| pending \| starting \| stopping` (app:4299) | `active/starting/stopping/pending` → not an item, add to the **running count**. `error` → tier 2 **Broken**. `idle` → a candidate for tier 3/4 |
| `runtimeStatus` | `status` plus `provisioning \| waiting-for-host` (app:4331) | `waiting-for-host` for a long time → tier 2 "stuck" (*inferred*) |
| `queuedWork` | `"none" \| "waiting" \| "failed"` (app:4579) | `failed` → tier 2 **Broken** |
| `hasPendingInteraction` | boolean | **Tier 1 Blocked on you** (approval, question, plan review). The kind needs `threads.interactions.list` (§2) |
| `activity` | `{workflows, backgroundAgents, backgroundCommands, planMode}` (app:20313) | Non-zero → still working. Keep it out of tier 3 even when `status` is idle |
| `indicator` | `background-agent \| background-command \| plan-mode \| queued-failed \| queued-waiting \| runtime \| unread-error \| unread-success \| waiting-for-input \| workflow \| none` (app:20311) | bb's own precedence, already resolved. `waiting-for-input` → T1, `unread-error`/`queued-failed` → T2, `unread-success` → a T3 candidate. Treat unknown values as `none` |
| `indicatorLabel` | string \| null | `aria-label` |
| `isUnread`, `lastReadAt`, `latestAttentionAt` | boolean, ms \| null, ms | "Something new since you last looked". **Read is not verified**: `lastReadAt` moves when the thread is merely opened |
| `isPinned`, `pinnedAt`, `pinSortKey` | | Threads tab |
| `isArchived`, `archivedAt` | | Drop the item, or keep it as verified history |
| `isHidden` | boolean | Plugin helper threads. bb's list filters them out, and so should the inbox |
| `environment` | `{id, name, branchName, path, isWorktree, providerId} \| null` | `environment.id` is the **key for PR and git reads** (§2) |
| `host` | `{id, name} \| null` | Machine label |
| `createdAt`, `updatedAt` | ms | Ordering within a tier |

The hook gives **no** plugin metadata, PR, diff, last message or error text. Those are in §2.

Rendering helpers the prototype can reuse: `experimental_resolveThreadStatus(input)` and
`experimental_ThreadStatusGlyph` draw bb's own status glyph (app:24364, 24357, 20644). They also
fold a collapsed parent's children into one glyph through `hiddenThreads`, which suits a
parent item that absorbs `parent`-audience children. `experimental_ThreadRowMetadata`
(app:24763) draws bb's PR badge and other plugins' row metadata. `ThreadTitle` and
`useBbNavigate().toThread(id, {split})` handle titles and opening a thread.

**Ref disagreement:** ref `frontend-registration.md` says "the SDK ships no status
component". The installed types export `experimental_ThreadStatusGlyph` and
`experimental_resolveThreadStatus`, and the types win. The ref's field list also leaves out
`displayTitle` and `experimental_hosts`.

**Fixtures fallback:** `renderSlot(..., { sidebarThreads: Partial<PluginSidebarThreadsState> })`
in `bb-plugin-sdk-testing-app.d.ts:361` feeds fake threads to the same hook.

## 2. Signals the hook doesn't give

| Signal | Where (frontend / server) | Notes |
|---|---|---|
| **PR + checks** | `experimental_useRpcKeyedQuery({ pluginId: "bb--github-pr-status", method: "pullRequests", keys: [envId] })` / `bb.sdk.plugins.callRpc` | Keyed by `environment.id`, at most 200 keys. Each row is `available{pullRequest}`, `absent` or `unavailable`. `pullRequest` has `state` (draft/open/merged/closed), `checks{state: passing\|failing\|pending\|no_checks\|unknown, total/passed/failed/pendingCount}`, `review{state}`, `mergeability`, and `attention` (checks_failed, checks_pending, changes_requested, review_requested, conflicts, blocked, draft, queued, ready_to_merge, merged, closed, none). It re-polls pending PRs about every 30 s while a key is mounted. Ref `frontend-pull-requests.md`, plus `bb plugin rpc inspect bb--github-pr-status pullRequests` |
| **Diff / changed files** | `experimental_useRpcKeyedQuery({ pluginId: "bb--git", method: "status", keys: [envId] })` / `callRpc` | `available.workspace` has `workingTree{fileCount, insertions, deletions, files[{path,status}], state}`, `mergeBase{aheadCount, commits[], files…}` and `allChanges`. Other outcomes are `not_applicable`, `unavailable` and `failed`. For full detail: `diff({environmentId,target})`, `files(...)`. Ref `git-reads.md`, plus `bb plugin rpc inspect bb--git status` |
| **"Viewed" marks** | `bb--git` `viewed` / `markViewed` / `clearViewed` per `{path, revision}` | A file counts as Viewed while its revision is unchanged. That is a ready-made "verify only the new changes" mechanism at file level (ref `git-reads.md`) |
| **Last assistant message** | Server: `thread.idle` event payload `lastAssistantText` (sdk:19974). Server or frontend: `threads.output({threadId}) → {output: string \| null}` (sdk:19302, 18897), via `useSdk()` in the app | Input for the cheap "question or report?" classifier |
| **Pending interaction kind** | `threads.interactions.list({threadId})` (sdk:19147, 15061). Server event `interaction.pending {thread, interaction}` (sdk:20003) | `payload.kind` is `approval` (subject `command\|file_change\|permission_grant\|plan\|tool_use`), `user_question`, or an extension kind `"<plugin>/<name>"` (e.g. a plan-review renderer). Lets tier 1 say *what* is blocking |
| **Errors** | Server: `thread.failed {thread, error: string\|null}` (sdk:19980), `turn.failed` (`errorInfo`, `attemptNumber`, `rateLimits`) (sdk:20040) | No frontend hook for error text. Fetch it through our own RPC, or `threads.events.list` |
| **Child counts** | `threads.childSummary` → `{nonDeletedChildCount, unarchivedDescendantCount}` (sdk:15288) | Counts only, no summaries. Children are already in the hook through `parentThreadId` |
| **Full transcript / events** | `threads.timeline`, `threads.events.list`, `threads.conversationOutline` (sdk:19336, ThreadsArea) | Too heavy for every row. Use on demand for the evidence panel |
| **Test results** | **none** | No SDK signal (see Gaps) |

## 3. Persisting verification state

Three stores, plus a way to push changes.

1. **Plugin-owned storage (recommended source of truth).** `bb.storage.database()` is a
   better-sqlite3 DB at `<dataDir>/plugins/<id>/data.db`, with migrations through
   `bb.storage.migrate`. `bb.storage.kv` is for small values (≤256 KB each) (sdk:19824–19850;
   ref `backend-foundation.md` §bb.storage). It's server-only. To expose it, define a **keyed
   RPC method** (`input: {keys: string[]}` → `Record<threadId, Verification>`, the shape
   `ExperimentalRpcKeyedMethod` requires at app:121). Read it in the list with
   `experimental_useRpcKeyedQuery({ pluginId: <ours>, contract, method, keys: threadIds })`,
   and write with `experimental_useRpcMutation` or `useRpc().call` (app:24692, 24700, 24705).
   After a write, `bb.realtime.publish("verifications", {...})`, and the frontend refetches on
   `useRealtime(channel, cb)` (app:24706; ref `backend-events.md` §bb.realtime).
2. **Thread plugin metadata.** Each plugin gets a JSON-object namespace per thread, up to
   256 KiB. Server: `bb.sdk.threads.getPluginMetadata / updatePluginMetadata({threadId, set,
   remove}) / experimental_listPluginMetadata({threadIds ≤200})` (sdk:19248–19290, 21646). In
   the frontend the same calls are on `useSdk().threads` (app:20587). It is **not** in
   `PluginSidebarThread` or `ThreadResponse` (sdk:14511), and nothing pushes it, so it would
   need polling or a realtime nudge. Any client, plugin or the thread's own agent can write any
   namespace (ref `backend-sdk.md` §Thread plugin metadata). It fits a declaration made at
   spawn time (§4). It's weak for a sign-off record.
3. **Settings** (`bb.settings.define`, `useSettings`) are for configuration, not per-thread
   records.

**Who verified.** RPC handler context gives only `experimental_caller: {kind: "plugin",
pluginId} | {kind: "client"}` (sdk:167). No user identity reaches a plugin (`BbContext` is
`{projectId, threadId}`, app:23860). The record can hold `verifiedAt`, `via:
"app"|"cli"|"agent"`, and the evidence snapshot (head sha, PR checks state, file revisions).
"Who" can only be "the human at this bb" (*inferred*: bb is single-user).

**Server-side computation.** `bb.events.on(...)` (sdk:21403, payloads sdk:19922–20054):
`thread.created`, `thread.active`, `thread.idle {lastAssistantText}`, `thread.failed {error}`,
`thread.archived/unarchived/deleted`, `interaction.pending`, `turn.failed`,
`message.queued/dispatched/cancelled`, `experimental_thread.events` (at most once a second
per thread), `experimental_thread.read`, and `experimental_thread.parentChanged`. Events are
fire-and-forget and **not replayed while the plugin is unloaded**. Reconcile at startup with
`bb.sdk.threads.list` (ref `backend-events.md`). Add `bb.background.schedule` (cron) to
re-poll PR checks or catch threads that look stuck. So items *can* be computed on the server:
on `thread.active` after a verification, mark the record "reopened since sha X". On
`thread.idle`, classify `lastAssistantText`.

## 4. Spawn-time audience (question 5)

What a spawner can set today:

- **`bb thread spawn` CLI flags** (`bb thread spawn --help`): `--parent-thread`/`--parent-self`,
  `--lifecycle-owner-thread`, `--parent-notifications auto|stuck|off`, `--visibility`,
  `--title`, `--section`, `--pinned`, and execution flags. **There is no metadata or label flag.**
  `bb thread update` can't set one either.
- **`bb.sdk.threads.spawn(args)`** takes everything in `CreateThreadRequest` (sdk:12900–12956,
  18967–18978), including **`pluginMetadata: JsonObject`**. Seeding it always stamps
  `originPluginId` with the calling plugin's id. `threads.fork` also takes `pluginMetadata`.
  Forks never inherit it.
- **After creation:** `updatePluginMetadata` from server or frontend. Agents see their own
  namespace through `bb.agents.configure(ctx => ctx.pluginMetadata)` (sdk:20759).

**Can a plugin attach a key/value to a thread and read it in the sidebar?** Yes, but not
through the hook. Write `pluginMetadata: { audience: "human" | "parent" }` under our plugin's
namespace, then read it in the list with `useSdk().threads.experimental_listPluginMetadata({
threadIds })` in batches of 200, or through our own keyed RPC. Nothing pushes changes, so
refetch on a realtime nudge or on `threads` changing.

**The gap is the spawner.** The orchestrator spawns children with the `bb thread spawn` CLI,
which can't seed metadata. Ways around it, best first:

1. **Our plugin's own CLI** (`bb.cli.register`, ref `backend-cli-agents.md`): `bb inbox
   audience <thread-id> human|parent`, run right after `bb thread spawn --json`. Or a wrapper,
   `bb inbox spawn --audience human -- <spawn flags>`, that calls `bb.sdk.threads.spawn({…,
   pluginMetadata})`. `ctx.threadId` gives the caller. Either way it ends up in our metadata
   namespace.
2. **An agent tool** from our plugin (`bb.agents`) that lets a child declare itself
   (`inbox_set_audience`). Weaker, because the child decides.
3. **Fallback inference** (already in the brief): `hasPendingInteraction` with
   `user_question` → `human`. `parentNotifications`: `auto` means the parent reacts to every
   outcome, which points to `parent` audience; `off`/`stuck` point less clearly to `human`
   (*inferred*, and the semantics differ: it controls waking the parent, not routing).
   `lifecycleOwnerThreadId` set → a delegated worker → `parent` (*inferred*).

## Gaps

- **Test results:** no SDK signal. Choices: parse the transcript or the last message (cheap
  model), read PR checks as a proxy, or let agents report through our CLI or agent tool into
  metadata.
- **"Stuck":** no first-class signal. Infer it from `status: active` with no
  `experimental_thread.events` for N minutes, `runtimeStatus: waiting-for-host`, or
  `queuedWork: failed`.
- **No event for an interaction being resolved:** only `interaction.pending` exists. Clearing
  a tier 1 item relies on the hook's `hasPendingInteraction` going false, or on
  `thread.active`.
- **Plugin metadata isn't in the live sidebar data**, and nothing pushes it. We have to
  realtime-nudge and refetch ourselves.
- **The `bb thread spawn` CLI can't set metadata.** Our plugin has to supply a CLI command.
- **No user identity** for "who verified".
- **No child summaries** beyond counts. A tier 4 FYI item needs each child's `threads.output`.
- **Read state isn't verification.** `isUnread`/`lastReadAt` move when a thread is opened, so
  the verified state must live in our own store.
