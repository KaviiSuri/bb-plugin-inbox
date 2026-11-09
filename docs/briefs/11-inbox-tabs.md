# Brief: Threads | Inbox tabs with Blocked on you, Broken and the running count (issue #11)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/`, the spec (#9), `docs/fork.md`, and issue #11 itself. Load `/implement`, `/tdd`, `/code-review` and `bb-plugin-authoring`. The issue's acceptance criteria are the contract.

**Branch:** `feat/11-inbox-tabs` off `main` (the fork merged in #16). Open a draft PR into `main` when done; don't merge it.

## What I'll judge it on

1. **The seam.** `deriveInbox(snapshot) → view` is pure, lives in its own module, and owns every rule in the issue. I'll mutate each rule (tier order, answer vs approve, each Broken signal, running exclusion, the grace, hidden/archived, New vs Seen, the tab count) and expect a named fixture test to fail each time. Lift what fits from the LOGIC prototype's model block (`origin/prototype/inbox-logic:prototypes/inbox-logic.html`), adjusted to the ADRs.
2. **Upstream stays merge-friendly.** The Inbox connects at the root component, the preference definitions and the server only (the spec says where). Inbox code lives in its own directory. Every upstream file you touch is added to `docs/fork.md`'s list. Upstream tests stay green and unchanged.
3. **It looks like variant G and works in the phone drawer.** Calm, one-line rows, colour only on answer/approve (amber) and failed (red), ≥40px tap targets on the Inbox tab (the Threads tab keeps upstream sizes, per `docs/fork.md`), nothing hover- or keyboard-only.

## Running it, and the human-owned resources

The `inbox` plugin installed in the user's bb was built from the #10 thread's worktree, now archived. Install yours over it from your worktree (`bb plugin build . && bb plugin install .`, or `bb plugin dev .`). Don't change the user's sidebar choice (`sidebar.threadListProvider`, synced across clients). For the 390×844 screenshot use a headless `bb browser-automation` session and switch only that client's copy, blocking writes back (the recipe is in `prototype/inbox-ui`'s history). `agent_browser` doesn't work here.

## Done means

Committed and pushed, draft PR open with the phone screenshot and the test summary, PR link in your report. Ask the user directly in your thread if you hit a decision the ADRs don't settle.
