## Problem Statement

The human runs many agent threads at once in bb: top-level threads, their child threads, children in their own worktrees. bb's sidebar shows them as a tree. That's good for browsing but bad for triage. To find out which threads need them (a question, a plan to approve, a failure, finished work to check) they have to scan every row and open threads one by one. Running work and finished work look alike at a glance, and nothing records that a piece of finished work was checked. Reading a thread is not the same as verifying it, and bb only tracks reading.

The goal, in the user's words: "The human should always know what agents are doing and be able to verify it."

## Solution

A standalone fork of bb's built-in `thread-list` sidebar plugin with two tabs at the top: **Threads** and **Inbox**.

- **Threads** is the built-in list, unchanged: nested child threads, children that share the parent's worktree and children in their own, cross-project references, pinned threads, sections, projects and machines. The fork runs next to the built-in list (its own plugin id, slot id and storage keys), and the user picks it under Settings → Appearance → Sidebar.
- **Inbox** is a queue of **Items**, one per thread, kept current as the thread changes. Each item has a **Tier**: Blocked on you, Broken, Verify, FYI, in that order. A running thread is never an item; all running threads collapse into one **Running count** line at the bottom.
- The presentation is "Paper dots" (ADR 0001). Each resting row is one line: a dot, the title, and one muted word for what the item wants (answer / approve / failed / verify / fyi). Only answer and approve (amber) and failed (red) are coloured. Rows sit under **New for you**, then a faded **Seen** band. Tapping a row opens its reason line and evidence summary, with visible Verify / Open buttons, one row at a time.
- Clearing a Verify item is a **Verification**: a sign-off stored on the bb server, so it syncs across the human's devices (ADR 0007). It records when it happened, on which client, and the diff base it covered. FYI items, which carry no evidence, clear when opened (ADR 0004).
- A verified thread that does more work is **Coming back**: it re-enters the inbox when that work finishes, asks or fails, showing only what changed since the verification's diff base (ADR 0003). It also comes back under Verify if its PR checks start failing after the verification.
- A child thread's **Audience** is inferred from what it does (ADRs 0006, 0008). A `human`-audience child gets its own item that names its parent (ADR 0002). A `parent`-audience child folds into its parent's FYI item.
- **Later** puts an item out of sight, without verifying it, until its thread has something new.

## User Stories

### The fork

1. As the human, I want the fork to appear as its own choice under Settings → Appearance → Sidebar, so that I can switch between it and bb's built-in list at any time.
2. As the human, I want the fork's Threads tab to show exactly what bb's built-in list shows (nested children, worktree grouping, cross-project references, pinned threads, sections, projects, machines), so that nothing I rely on today is lost.
3. As the human, I want the fork's preferences (organization, sort, collapsed groups, row actions) kept apart from the built-in list's, so that trying the fork doesn't disturb my built-in list.
4. As a maintainer, I want the fork pinned to a known upstream commit, so that I can merge upstream changes later.
5. As a maintainer, I want upstream's thread-list test suite to keep passing in the fork, so that I know the Threads tab still behaves like upstream.

### Tabs

6. As the human, I want two tabs, Threads and Inbox, at the top of the sidebar, so that I can switch between browsing and triage with one tap.
7. As the human, I want my choice of tab remembered and synced like my other sidebar preferences, so that the sidebar opens where I left it.
8. As the human, I want the Inbox tab to show a number counting only the items in New for you, so that I know at a glance whether anything new needs me.
9. As the human on my phone, I want the tabs and every inbox control to be at least 40px tall and work without hover or a keyboard, so that I can triage from bb's sidebar drawer.

### Items and tiers

10. As the human, I want one item per thread, kept current, so that a busy thread doesn't flood the inbox.
11. As the human, I want items ordered by tier (Blocked on you, Broken, Verify, FYI) and, within a tier, newest first, so that the most urgent thing is at the top.
12. As the human, I want a thread waiting on a question form to show `answer`, so that I know it needs my answer.
13. As the human, I want a thread waiting on a permission or a plan review to show `approve`, so that I know it needs my approval.
14. As the human, I want a thread that stopped on an error or got stuck to show `failed` in red, so that I can restart or fix it.
15. As the human, I want finished work with a diff or a PR to show `verify`, so that I know there's work to check.
16. As the human, I want finished work whose PR checks fail to stay under `verify` with the failing checks in its reason line, not turn red, so that red means an agent needs restarting rather than work that needs judging (ADR 0005).
17. As the human, I want a report with nothing to verify to show `fyi`, so that I can read it and move on.
18. As the human, I want a running thread never to appear as a row, so that loading work doesn't crowd the inbox.
19. As the human, I want every running thread counted on one line at the bottom ("7 running"), so that I know how much is in flight.
20. As the human, I want to tap the running count to see which threads are running, so that I can jump into one if I want.
21. As the human, I want hidden helper threads and archived threads kept out of the inbox, so that only real work shows.
22. As the human, I want the list to hold still while I'm touching it, so that a row doesn't move from under my finger.

### Rows and evidence

23. As the human, I want a resting row to be a single line (dot, title, one word), so that the list stays calm at sidebar width.
24. As the human, I want to tap a row to open its reason line and evidence summary in place, so that I can decide without leaving the list.
25. As the human, I want only one row open at a time, so that the list stays readable.
26. As the human, I want an open Verify row to show its diffstat and PR checks state, so that I know what I'm signing off on.
27. As the human, I want an open row to have visible Verify and Open buttons (Answer instead of Open for Blocked on you), so that I can act without hover.
28. As the human, I want Open to take me to the thread the way the Threads tab does (and close the drawer on my phone), so that the inbox feels native.

### New for you and Seen

29. As the human, I want items I haven't opened since their latest change under New for you, so that new things stand out.
30. As the human, I want an item to move to the faded Seen band once I've opened its thread, so that I can tell new from already-looked-at.
31. As the human, I want a Seen item to stay until I verify it, so that opening a thread never counts as checking it.

### Verification

32. As the human, I want tapping Verify to clear the item, so that the inbox reflects what I've checked.
33. As the human, I want a Verification stored on the bb server, so that verifying on my phone clears the item on my laptop (ADR 0007).
34. As the human, I want each Verification to record when it happened, on which client, and the diff base it covered, so that there's a record of what I signed off on.
35. As the human, I want Verify offered only on Verify items, so that I can't sign off on a question or a failure.
36. As the human, I want opening an FYI item to clear it, so that reports with nothing to verify don't pile up (ADR 0004).

### Coming back

37. As the human, I want a verified thread that does more work to come back once that work finishes, asks or fails, and not while it runs, so that I verify settled work.
38. As the human, I want a thread that's coming back to show only what changed since my verification's diff base, so that I don't re-check work I already verified (ADR 0003).
39. As the human, I want the already-verified part to stay reachable from the item, so that I can look at it again if I need to.
40. As the human, I want a verified thread that only reported (no new changes) to come back as FYI, so that I'm not asked to verify nothing.
41. As the human, I want a verified thread whose PR checks start failing to come back under Verify with the failing checks in its reason line, so that a regression after my sign-off isn't missed.

### Child threads

42. As the human, I want a child that asks me a question through a question form to get its own item that names its parent, so that the question reaches me even while the parent is still running (ADR 0002).
43. As the human, I want a child with a plan for me to review to get its own item, so that plan reviews reach me.
44. As the human, I want a child that ends its turn with a plain-text question to me, or that uses the grilling skill, to get its own item, so that grilling children reach me (ADR 0008).
45. As the human, I want research-type children that report to their parent folded into the parent's item, so that they don't flood the inbox.
46. As the human, I want a parent's FYI item to list its folded children's reports, so that I can see what they found without opening each one.
47. As the human, I want a child's permission prompt left to its parent agent, so that I'm not asked about permissions the parent can grant itself (ADR 0008).
48. As the human, I want a child permission prompt still pending when the parent's turn ends to surface on the parent's item as `approve`, naming the child's prompt and with a way to open it, so that a stuck child doesn't go unnoticed.
49. As a spawning agent, I want nothing to declare when I spawn a child, so that audience works with plain `bb thread spawn` (ADR 0006).
50. As the human, I want to pick which bb provider and model reads turn endings, with no API key, so that the classifier uses a provider I already have logged in.
51. As the human, I want the inbox to keep working when no classifier provider is set or it fails, so that a missing model never hides a question.

### Later

52. As the human, I want to put an item in Later, so that it's out of sight without being verified.
53. As the human, I want a Later item to come back when its thread has something new (finishes, asks or fails), so that putting it off never hides new work.
54. As the human, I want Later to sync across my devices like Verifications, so that it behaves the same everywhere.

## Implementation Decisions

### The fork

- Fork get-bb/bb `plugins/thread-list` at `55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00`, following upstream's own fork tooling and checklist (`scripts/lib/plugin-fork.mjs`, `scripts/forkable-plugins.json`, `docs/forkable-plugins.md`). Record the pin in the repo so upstream can be merged later.
- Make it standalone: vendor every `@/` import from bb's component registry (`npx shadcn add @bb/<item>` with `components.json` pinned to the bb release); point the `@/*` path alias at the plugin; drop `@bb/shared-ui` and `@bb/plugin-build`; pin `@get-bb/plugin-sdk` to the published version; build with `bb plugin build`.
- Rename everything that would collide with the built-in list: package name (which sets the plugin id, CLI name, KV namespace and localStorage mirror key), the `experimental_threadList` slot id, the hard-coded `thread-list/customizeRowActions` key, and the `<pluginId>/move` row-action key.
- Upstream code stays as untouched as possible so later merges are cheap. Inbox code lives in its own modules and touches the fork at a few seams: the root component (tab switch), the preference definitions (new keys), and the server (new storage and RPCs).

### Tabs

- A sticky `Threads | Inbox` switch at the top of the plugin's scroll area. The scroll area is host-owned; the New-thread button, nav and footer stay with bb.
- The Inbox renders inside the fork's existing provider stack (thread selection, navigation, sidebar content element, providers context), so rows can reuse the fork's row primitives and bb's status glyph.
- The active tab is a new synced preference, added to the fork's `preferenceDefinitions` so it uses the same server KV + realtime + localStorage mirror as the other preferences. Scrolling to reveal the active thread is skipped while the Inbox is showing.

### The inbox model (the one seam)

A pure module, no React and no SDK calls, carries all inbox logic:

```ts
// Shape only; derived from the LOGIC prototype's deriveInbox (prototype/inbox-logic).
deriveInbox(snapshot: InboxSnapshot): InboxView

interface InboxSnapshot {
  threads: readonly PluginSidebarThread[];            // live, from experimental_useSidebarThreads
  verifications: Record<threadId, Verification>;      // server storage
  laters: Record<threadId, Later>;                    // server storage
  evidence: Record<environmentId, EnvironmentEvidence>; // bb--git status + bb--github-pr-status
  interactions: Record<threadId, PendingInteractionKind>; // for threads with hasPendingInteraction
  turnEnds: Record<threadId, TurnEnd>;                // classifier results, server storage
  childReports: Record<threadId, string>;             // last output of folded children, on demand
  now: number;
}

interface InboxView {
  newForYou: Item[];        // ordered: tier, then attention time desc
  seen: Item[];
  running: RunningThread[]; // the Running count
  tabCount: number;         // newForYou.length
}

interface Item {
  threadId: string;
  tier: "blocked" | "broken" | "verify" | "fyi";
  word: "answer" | "approve" | "failed" | "verify" | "fyi";
  reason: string;            // the reason line
  evidence: Evidence;        // scoped to new work when coming back
  parentThreadId?: string;   // human-audience child: names its parent
  folded: FoldedChild[];     // parent-audience children
  childPermission?: { childThreadId: string; prompt: string }; // ADR 0008
  comingBack?: { verifiedAt: number; diffBase: DiffBase };
  attentionAt: number;
}
```

Rules the model encodes, changed from the LOGIC prototype by ADRs 0002–0008:

- **Running** (`status` active/starting/stopping/pending, or non-zero `activity`, and no pending interaction): never an item, always in `running`. A 2-second grace after a thread stops avoids flicker; the grace is skipped when the thread needs the human.
- **Blocked on you:** a pending interaction. Its kind gives the word: `user_question` → `answer`; approval of a permission, command, file change, tool or plan → `approve`. Also a turn that ended with a question to the human (`answer`).
- **Broken:** `status` error, `queuedWork` failed, `indicator` unread-error, or `runtimeStatus` waiting-for-host for too long. Failing PR checks are **not** Broken (ADR 0005; the prototype put them there).
- **Verify:** finished (idle, not Blocked or Broken) with evidence: a non-empty diff or a PR. Failing checks go in the reason line.
- **FYI:** finished with no evidence, including a parent whose only news is its folded children's reports. Opening the thread clears it (ADR 0004; the prototype had no such exception): an FYI item is cleared once the thread's `lastReadAt` reaches its attention time.
- **New for you / Seen:** an item is Seen once its thread has been read since its latest attention (`isUnread` false). Seen does not clear a Verify item.
- **Verified:** a Verify item is cleared while its Verification covers the thread's latest work. It comes back when new work has finished, asked or failed after the Verification, scoped to the changes since the Verification's diff base, or as FYI if nothing changed (ADR 0003). It also comes back under Verify when PR checks are failing now but weren't when it was verified.
- **Audience** (ADR 0008; the prototype's declared audience is removed by ADR 0006): a top-level thread always answers to the human. A child is `human`-audience if it has a pending `user_question` interaction, a pending plan interaction, used the grilling skill, or ended its turn with a plain-text question to the user. Otherwise it's `parent`-audience. A `human` child is its own item, with `parentThreadId` set (ADR 0002; the prototype could put it on the parent). A `parent` child folds into its parent's item.
- **Child permission** (ADR 0008): a child waiting on a permission prompt stays with its parent agent while the parent runs. Once the parent's turn ends with the child still waiting, the parent's item becomes Blocked on you with `approve`, and `childPermission` names the child's prompt.
- **Later:** an item with a Later newer than its thread's latest attention is left out of the view. When the thread has something new, the Later no longer applies.

### Server: storage, RPCs, events

- **Verifications and Laters** live in the plugin's own server storage (SQLite through `bb.storage.database()` with migrations, or KV). A Verification records `{threadId, verifiedAt, client, diffBase, prChecksState}`. No user identity reaches a plugin, so it names the client, not a person (ADR 0007).
- **Diff base:** enough to scope a later diff to the new work: the environment's head commit and the per-file revisions that `bb--git files` returns (*inferred* from the `git-reads` reference: `files` gives each file's revision, and `diff` targets are uncommitted, branch or single commit, not a commit range). Confirm the exact shape with `bb plugin rpc inspect bb--git files` when building.
- **Exposed** as keyed RPC methods (`{keys: threadId[]}` → record per thread), read in the list with `experimental_useRpcKeyedQuery`. Writes go through mutations (`verify`, `later`). Every write publishes on a realtime channel, and the list refetches on it, so all clients update.
- **Turn-end classification** runs on the server: on `thread.idle`, classify `lastAssistantText` as question or report and store the result per thread. Also on startup, through `bb.sdk.threads.list`, because events aren't replayed while the plugin is unloaded. Results are exposed through the same keyed-RPC + realtime pattern. The classifier sits behind an interface (`classifyTurnEnd(text) → "question" | "report"`), so its implementation can change without touching the model.
- **The classifier runs on a bb provider the user picks, with no API key.** A plugin setting holds a provider, model and reasoning level, chosen with the host's `experimental_ProviderModelPicker`. To classify, the server spawns a hidden thread (`bb.sdk.threads.spawn` with `providerId`, `model`, `reasoningLevel`, `visibility: "hidden"`) whose prompt holds the turn's last message, reads the one-word answer from that thread's `thread.idle` `lastAssistantText`, then archives the helper thread. It uses whatever login the provider already has. bb can't do this for us: its AI services run only the fixed `thread-title`, `commit-message` and `voice` tasks with bb-written prompts, and plugins can't send their own prompt through them (get-bb/bb `55135d1e` `apps/server/src/services/ai/ai-tasks.ts`; `@get-bb/plugin-sdk` 0.6.133 `bb-plugin-sdk.d.ts:10286`, `:18689`). When no provider is set, or the helper thread fails or times out, a deterministic heuristic stands in: the last message ends with a question addressed to the user. Hidden threads never show in either tab (`isHidden`).
- **Evidence** is read in the client with keyed queries on the environment id: `bb--git` `status` for the diffstat, `bb--github-pr-status` `pullRequests` for PR state and checks. Children's reports (`threads.output`) and pending interaction kinds (`threads.interactions.list`) are fetched only for the threads that need them.

### Presentation (ADR 0001)

- Paper dots, as in the UI prototype's variant G screenshots (`prototype/inbox-ui`, `prototypes/inbox-ui/screenshots/G-phone*.png`). The prototype's code is throwaway; rewrite it, don't lift it.
- Colour only on answer, approve (amber) and failed (red). Evidence is never on a resting row, only in the opened row.
- The running count and its expanded list sit in a sticky footer inside the scroll area.

## Testing Decisions

- **A good test checks external behaviour:** what the human would see in the inbox given a set of threads and stored records. It doesn't check how the model computes it. Tests name things with `CONTEXT.md` terms.
- **The main seam is `deriveInbox`.** Most tickets add fixture-based tests there: build a snapshot of fake sidebar threads (complete `PluginSidebarThread` fixtures with partial overrides), Verifications, evidence and classifications, and assert the view. The LOGIC prototype's stories are the first test cases: tier ordering, child audience routing, clear = verified, coming back scoped to new work, running threads collapsing to a count, FYI cleared by opening, failing checks under Verify, child permission surfacing on the parent.
- **Server tests** use the SDK's fake plugin host (`createFakePluginHost` from `@get-bb/plugin-sdk/testing`): real SQLite storage, RPCs called over the JSON boundary, `thread.idle` emitted through the harness, realtime signals inspected.
- **UI tests** are thin: a `renderSlot` smoke test per UI ticket with `sidebarThreads` fixtures (from `@get-bb/plugin-sdk/testing/app`), plus a screenshot at 390×844 in a headless session, checking for one column, no horizontal scroll, and tap targets of at least 40px.
- **Prior art:** upstream thread-list's own vitest suite (kept passing in the fork, under the same `vitest.config.ts`), and its model-level tests over pure functions (e.g. the project-thread-groups and pinned-threads tests).

## Out of Scope

- **Test results as evidence.** The SDK has no signal for them. PR checks stand in for now.
- **A full-page "cockpit" view.** It may come later as a second view of the same model.
- **Declaring a child's audience at spawn** (ADR 0006).
- **Who verified, as a person.** No user identity reaches a plugin; a Verification names the client.
- **Upstream changes to bb.**
- **Bulk actions, keyboard shortcuts and hover-only actions.**

## Further Notes

- Decisions: `CONTEXT.md` and `docs/adr/0001`–`0008` on `main`.
- Primary sources: `research/thread-list-internals` (fork checklist), `research/sdk-surface` (fields, signals, storage, events), `prototype/inbox-logic` (`deriveInbox` / `reduce`), `prototype/inbox-ui` (variant G), `research/prior-art`, `research/visual-prior-art`.
- The SDK gives plugins no way to call bb's AI services with a custom prompt: `bb.experimental_aiServices` only registers services, and `system.testAiService` only takes the `thread-title` or `commit-message` tasks (`@get-bb/plugin-sdk` 0.6.133, `bundled-types/bb-plugin-sdk.d.ts:10286`, `:18689`). The user chose a hidden helper thread on a provider they pick, with no API key, over calling a local CLI or reusing the Codex login. A helper thread per turn end costs a few seconds and a provider turn; that's accepted.
- Prior art for interaction labels: `bb-plugin-attention`'s `interactionMeta`, and its event set (`thread.idle`, `thread.failed`, `interactions-changed`) for server-side recompute.
