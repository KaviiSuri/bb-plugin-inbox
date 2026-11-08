# Brief: BB inbox sidebar

Carried over from the kickoff discussion (Personal project, thread thr_t9baseiidf). Nothing here is built yet.

## Goal

The human should always know what agents are doing and be able to verify it. Work shows up as a queue of inbox items to clear. The thread tree is still there for browsing; the inbox is for triage.

## Decided

- **Surface:** a sidebar tab first. Two tabs at the top: **Threads** (today's tree) and **Inbox**. No file tree or diff tabs. A full-page "cockpit" may come later as a second view of the same data model.
- **Threads tab must keep everything the built-in list does:** nested child threads, children that share the parent's worktree vs. ones in their own worktree, references across worktrees, pinned threads, sections, projects, and machines. All of it stays visible.
- **One item per thread, kept current.** A running thread is not an item; it shows as a count. Loading work must not crowd the UI.
- **Priority tiers (draft):** 1 Blocked on you (question, permission, plan review, a grilling child) → 2 Broken (error, stuck) → 3 Verify (finished with a diff, PR or tests) → 4 FYI (a parent's summary of its children).
- **Clearing an item means the work is verified.** It's a sign-off, not a dismissal. Each item needs to carry its evidence (diff, tests, PR checks, child summaries) and record who verified it and when. Open question: when a verified thread does more work, does it come back scoped to only the new changes?
- **Child audience:** each child is `human` (it grills or asks the user directly, so it gets its own item) or `parent` (research and similar: the parent handles it, and it folds into the parent's item). Set explicitly when the child is spawned, and inferred as a fallback (AskUserQuestion, use of the grilling skill).
- **Classifying items:** deterministic signals first (status, pending tool calls, PR checks, errors). Use a cheap model only for "did the turn end with a question for me or a report?"

## Findings from the kickoff

- **Fork the built-in `thread-list` plugin. bb is open source:** https://github.com/get-bb/bb, `plugins/thread-list/` (about 29k lines of TS/TSX including tests; read `PLUGIN_OVERVIEW.md` first). It already does pinned and custom sections, project/machine/chronological organization, nested child threads, worktree grouping, drag to reorder, nesting, status glyphs, and row metadata. That is the whole Threads tab. Our work is adding the Inbox tab on top of it, not rebuilding the tree.
  - The fork has to be made standalone. Its imports of `@/components/ui/*` and `@/lib/utils` are bb's vendored UI (see the "vendored components" section of the bb-plugin-authoring frontend-hooks-and-ui reference, and what `bb plugin new` scaffolds). Its `workspace:*` dependencies (`@bb/shared-ui`, `@bb/plugin-build`, `@get-bb/plugin-sdk`) need to be swapped for published or vendored equivalents.
  - Pin the upstream commit you fork from, so upstream changes can be merged in later.
- **Follow `/bb-plugin-authoring`** (the BB skill) for the SDK contract, starting with the `frontend-registration.md` reference. The slot is `app.slots.experimental_threadList`, the one exclusive slot; users pick a provider under Settings → Appearance → Sidebar. `experimental_useSidebarThreads()` returns threads with `parentThreadId`, `parentNotifications`, `lifecycleOwnerThreadId`, `sourceThreadId`, `status`/`runtimeStatus`, `queuedWork`, `hasPendingInteraction`, `isUnread`, `lastReadAt`, `latestAttentionAt`, `indicator`, `environment { isWorktree, branchName, path }` and more. Most of the inbox's deterministic signals are already there.
- **Secondary prior art only:** T3 Sidebar (SawyerHood, MIT; `~/.bb/plugins/cache/git/github.com/SawyerHood/sawyer-plugins/8b535729dd2251ceb293c7caf74e43e477f942a3/plugins/t3sidebar/`) is an inbox-style replacement for the same slot. Borrow ideas from it (stable order, status inside the card), not code.
- **`bb-plugin-attention`** (npm, installed, v0.1.5) already computes "threads that need your attention" (errors, pending input, unread turns). Source: `~/.bb/plugins/cache/npm/bb-plugin-attention/0.1.5/`. It's prior art for the classifier.
- The user's `~/code/KaviiSuri/bb-plugin-goal` shows the house layout for a plugin repo.

## How this project runs: /bb-orchestrate-threads

- The thread working in this project is the **orchestrator**, running on the **pi** harness. It writes briefs, tickets and records, reviews by mutation, and relays to the human. It doesn't author research docs or code itself.
- All work goes to **bb child threads** (`bb thread spawn --parent-self`), never the in-process subagent tool. Children run on pi with model `claude-bridge/claude-opus-5-5` (judgment, design, taste) or `openai/gpt-5.5` (mechanical sweeps, cross-checking). Pick per ticket.
- Default concurrency is up to 3 in flight, unless the human says otherwise. The human reviews before anything lands on `main`.
- Put tickets on the bb task board (`bb tasks`, see the tasks skill). Write each brief to a file under `docs/briefs/` and point the spawn prompt at it.

## Process (from /ask-matt): prototype-driven

The user wants the exploration to be **visual and prototype-driven**. They judge an idea by using it, not by answering questions about it. So prototypes lead, and grilling happens against something they can click.

Load these skills before acting: `/ask-matt` (routing), `/bb-orchestrate-threads` (how work runs), `/bb-plugin-authoring` (the SDK contract), and `/prototype` (how to build throwaways). Also `/grill-with-docs` when it's time to record decisions.

| Phase | Skill | What it looks like here |
|---|---|---|
| 1. Research | `/research`, run as bb child threads | Cited docs in `docs/research/`. It's input, not decisions. Keep it short, and get to prototypes fast. |
| 2. Logic prototype | `/prototype` → LOGIC.md | One HTML file the user can double-click: the inbox state machine with fake threads. It covers tier ordering, child audience routing (`human` vs. `parent`), clear = verified, a verified thread doing new work and coming back, and running threads collapsing to a count. Free-play buttons plus guided walkthroughs, with the state always visible. |
| 3. UI prototype | `/prototype` → UI.md | Several radically different Inbox tab designs, switchable by a floating bar. Run them **in the real sidebar** by registering a throwaway `experimental_threadList` provider that reads live `experimental_useSidebarThreads()`, so the user feels it against their own threads. Fixtures are a fallback for states that are hard to reproduce. |
| 4. Grill against the prototypes | `/grill-with-docs` | Only questions the prototypes raised, each one asked as "variant A vs. B, here's the link". Decisions go into `CONTEXT.md` and `docs/adr/`. |
| 5. Spec and tickets | `/to-spec` → `/to-tickets` | The fork of `plugins/thread-list` plus the Inbox tab, as tracer-bullet tickets on the bb task board with blocking edges. |
| 6. Build | `/implement` per ticket, in child threads | TDD inside, `/code-review` before each commit, mutation review by the orchestrator, human review before merge. |

Rules:
- Every prototype is a bb child thread in its own worktree, on a `prototype/<name>` branch, kept as a primary source and never merged to `main`. The worktree takes the place of `/handoff`.
- Every prototype comes back with one command to run it, or the steps to switch the sidebar provider to it, plus a screenshot. The orchestrator hands the user a link and a sentence, not a list of questions.
- Ask the user something only after they've seen the thing it's about.

## Research questions

1. **Prior art:** the T3 Code app's sidebar (the real T3 Code, not the BB plugin), Plannotator's inbox, Conductor, Linear's inbox, GitHub notifications, Superhuman / inbox-zero triage, and any other agent-orchestration "attention queue" UIs. For each: what counts as an item, how items are ordered, what clears an item, and how noise is kept down.
2. **The BB Plugin SDK, via /bb-plugin-authoring:** confirm the `experimental_threadList` and `experimental_useSidebarThreads` fields against the installed SDK types (`bb plugin types`), and find what server-side hooks, events and storage exist to persist verification state and compute inbox items.
3. **Upstream `thread-list` internals** (get-bb/bb `plugins/thread-list`): how it builds the tree (children, worktree grouping, sections), its state and storage, where an Inbox tab can slot in, and exactly what forking it standalone takes (vendored UI, workspace deps, build). Skim T3 Sidebar for inbox ideas only.
4. **bb-plugin-attention:** its signals and its logic.
5. **What thread metadata a spawner can set**, so a child's audience can be declared at spawn time.
