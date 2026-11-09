# Brief: standalone fork of thread-list (issue #10)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/`, the spec (#9, also `origin/spec/inbox:docs/spec/inbox.md`) and issue #10 itself. Load `/implement`, `/tdd`, `/code-review` and `bb-plugin-authoring`. The issue's acceptance criteria are the contract.

**Branch:** `feat/10-fork-thread-list`. Open a draft PR into `main` when done; don't merge it.

## What I'll judge it on

1. **Upstream stays untouched.** Every change to the forked upstream files is a rename the issue lists, or a recorded vendoring/import rewrite. Keep a list of them (e.g. `docs/fork.md`) next to the pin and the merge-upstream steps. A later upstream merge should be mechanical.
2. **Upstream's test suite passes in the fork, unchanged.** Updating an import path in a test is fine; deleting or weakening a test is a defect.
3. **It runs beside the built-in list.** Install your build into the user's bb (`bb plugin build . && bb plugin install .`, or `bb plugin dev .`). That plugin is yours; leave it installed.

## Human-owned resources

Don't change the user's sidebar choice (it's synced across all their clients, `sidebar.threadListProvider`). For the 390×844 phone screenshot, use a headless `bb browser-automation` session and switch only that client's copy, blocking any write back, as the `prototype/inbox-ui` thread did (ask it: @thread:thr_fw4tw8mib2 holds the recipe in its transcript; or read its commits on `prototype/inbox-ui`). The `agent_browser` tool doesn't work here (agent-browser 0.26 < 0.35).

## Done means

Committed and pushed, draft PR open with the phone screenshot, the test run output summarised, and the PR link in your report.
