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

- **The built-in `thread-list` plugin can't really be forked.** Only a minified build ships, at `~/.local/share/mise/installs/npm-bb-app/latest/lib/node_modules/bb-app/server/dist/builtin-plugins/thread-list/`. Its source depends on private `@bb/shared-ui` workspace packages. Use it as behavioural reference only.
- **The extension point is `app.slots.experimental_threadList`.** It replaces the scrolling list only; the New-thread button, search, nav and footer stay. Users switch to it under Settings → Appearance → Sidebar.
- **T3 Sidebar (SawyerHood, MIT) is the reference implementation of that slot**, and it's already inbox-shaped: stable order, status kept inside each card, shelves. Source: `~/.bb/plugins/cache/git/github.com/SawyerHood/sawyer-plugins/8b535729dd2251ceb293c7caf74e43e477f942a3/plugins/t3sidebar/` and https://github.com/SawyerHood/bb-plugin-t3sidebar. It's the most likely base for the fork.
- **`bb-plugin-attention` (npm, installed, v0.1.5) already computes "threads that need your attention"** (errors, pending input, unread turns). Source: `~/.bb/plugins/cache/npm/bb-plugin-attention/0.1.5/`. It's prior art for the classifier and may even be reusable.
- The user's own `~/code/KaviiSuri/bb-plugin-goal` shows the house layout for a plugin repo (AGENTS.md, CONTEXT.md, app.tsx, server.ts, vitest).

## Process (from /ask-matt)

Main flow, multi-session branch:

1. **/research first** (user's choice: research, then grill).
2. /grill-with-docs, writing CONTEXT.md and ADRs here.
3. A /prototype detour for the inbox UI.
4. /to-spec, then /to-tickets.
5. /implement per ticket.

## Research questions

1. **Prior art:** the T3 Code app's sidebar (the real T3 Code, not the BB plugin), Plannotator's inbox, Conductor, Linear's inbox, GitHub notifications, Superhuman / inbox-zero triage, and any other agent-orchestration "attention queue" UIs. For each: what counts as an item, how items are ordered, what clears an item, and how noise is kept down.
2. **The BB Plugin SDK:** what `experimental_threadList` gets (props, thread fields, child/parent links, environment and worktree info, statuses, pending interactions, unread state), and what server-side hooks or storage exist to persist verification state. Check the plugin-api-docs plugin and the bb-plugin-authoring skill.
3. **T3 Sidebar internals:** how it builds its list, and whether it can render a nested tree with worktree grouping.
4. **bb-plugin-attention:** its signals and its logic.
5. **What thread metadata a spawner can set**, so a child's audience can be declared at spawn time.
