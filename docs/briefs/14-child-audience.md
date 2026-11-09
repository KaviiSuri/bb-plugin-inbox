# Brief: child audience (issue #14)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/` (0002, 0006, 0008, 0010), the spec (#9), `docs/fork.md`, and issue #14. Load `/implement`, `/tdd`, `/code-review` and `bb-plugin-authoring`. The issue's acceptance criteria are the contract.

**Branch:** `feat/14-child-audience` off `main`.

## Why it matters, in the user's words

Looking at the live inbox: "i get a lot of details in the inbox. and honestly they weren't that useful, cuz they were child threads that weren't supposed to be talking to me". This ticket is the fix. A child gets its own item only when it asks the human (question form, plan review; the classifier signals come in #15). Every other child folds into its parent, and the parent shows one FYI once it stops ("3 helpers reported", each child's report on the opened row). A child's permission prompt stays with the parent agent, surfacing on the parent's item as `approve` only if the parent's turn ends with the child still waiting.

## What I'll judge it on

1. Every case in the acceptance criteria owned by a named test, including grandchildren folding to the nearest item owner, and children of a still-running parent producing nothing but the running count. I'll break each and expect a failure.
2. A folded child never shows as its own row in any band, under any tier (Verify, FYI, Broken). Note: a folded child that is Broken — decide whether it folds or escalates, consistent with ADR 0008, and say which in the PR.
3. The opened row says why a child got its own item.

## Running beside other work

#13 runs in parallel (coming back, `feat/13-coming-back`). The inbox model is one module per rule (`app/inbox/model/`). Keep to your own rule modules and their tests; in `index.ts` add only your line(s) to the rule lists; in `types.ts` only add fields, never rename. Expect a small merge in those two files and keep both sides. Add every upstream file you touch to `docs/fork.md`.

## Human-owned resources

Don't install over the user's `inbox` plugin (it runs from `main`). Verify with tests, `bb plugin build .`, and if a live check is needed a scratch copy under its own id, removed after (see `_common.md`). Don't change the user's sidebar choice. `agent_browser` doesn't work here; use `bb browser-automation` headless for the 390×844 screenshot.

## Done means

Committed, pushed, draft PR into `main` with the phone screenshot and test summary, link in your report. Ask the user directly in your thread for any decision the ADRs don't settle.
