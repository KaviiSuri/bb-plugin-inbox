# Brief: spec and tickets for the fork plus the Inbox tab (issue #7)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md` and every ADR in `docs/adr/` first. Then load the `/to-spec` and `/to-tickets` skills (`~/.agents/skills/`) and the `bb-plugin-authoring` skill, and follow them.

**Branch:** `spec/inbox` for anything you write to the repo (notes, a draft). The spec and tickets themselves are GitHub issues on KaviiSuri/bb-plugin-inbox (`docs/agents/issue-tracker.md`).

## Goal, in the user's words

"The human should always know what agents are doing and be able to verify it." Build a standalone fork of bb's built-in `thread-list` (the Threads tab, everything it does today) and add the Inbox tab as decided in `CONTEXT.md` and ADRs 0001–0008. The decisions are made; the spec synthesizes them, it doesn't reopen them. If you hit a genuine gap the ADRs don't settle, ask the user in your own thread.

## Inputs (primary sources, read them)

- Fork: `origin/research/thread-list-internals:docs/research/thread-list-internals.md`. Pin get-bb/bb `55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00`; upstream's own fork tooling (`scripts/lib/plugin-fork.mjs`, `scripts/forkable-plugins.json`) and its checklist. The fork must run next to the built-in list (renamed plugin id, slot id, storage keys).
- SDK: `origin/research/sdk-surface:docs/research/sdk-surface.md` (sidebar thread fields, PR/diff sources per environment, plugin storage + server push, server events and catch-up at startup, the classifier's last-message source).
- Logic: `origin/prototype/inbox-logic:prototypes/inbox-logic.html`. Its `deriveInbox` / `reduce` script block is meant to lift into the real module; note where ADRs 0002–0008 changed it (failing checks under Verify, FYI cleared by opening, audience inferred, child permission surfacing on the parent).
- UI: `origin/prototype/inbox-ui:prototypes/inbox-ui/`, variant G "Paper dots" (ADR 0001). Its screenshots are the presentation target; its code is prototype-grade and gets rewritten.
- Prior art: `origin/research/prior-art:docs/research/prior-art.md`, `origin/research/visual-prior-art:docs/research/visual-prior-art.md`.

## What I'll judge it on

1. Tracer-bullet slices, each demoable in the real sidebar. The first slice is the standalone fork running beside the built-in list with nothing added; the second puts Threads | Inbox tabs on it with the simplest live Inbox.
2. One seam for the inbox logic, as high as possible: a pure `deriveInbox`-style module tested with fixtures, so most tickets test there rather than through the UI.
3. Every ticket names its ADRs and uses `CONTEXT.md` terms.
4. Phone review is a requirement on every UI ticket (the user reviews in bb's sidebar drawer: ≥40px tap targets, no hover-only actions).
5. Blocking edges as native GitHub dependencies (see `docs/agents/issue-tracker.md`), labels `ready-for-agent`.

## Process

- Publish the spec as one issue. Then show the user the proposed ticket breakdown in your thread and get their approval before publishing tickets (as `/to-tickets` says). Ask them directly; don't route through the orchestrator.
- When the tickets are published, comment the spec issue number and ticket list on #7 and report.
