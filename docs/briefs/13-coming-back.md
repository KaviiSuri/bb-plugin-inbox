# Brief: coming back scoped to new work, and failing checks after a Verification (issue #13)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/` (0003, 0005, 0007, 0010), the spec (#9), `docs/fork.md`, and issue #13. Load `/implement`, `/tdd`, `/code-review` and `bb-plugin-authoring` (`git-reads.md`, `frontend-pull-requests.md`). The issue's acceptance criteria are the contract.

**Branch:** `feat/13-coming-back` off `main`.

## Where it starts

#12 is merged: a Verification stores `diffBase` (head commit, merge-base ref, per-file revisions from `bb--git files`) and `prChecksState`. `diffBase` can be null when git couldn't be read; decide and test what a null base does (say so in the PR). Today a Verification simply expires when `latestAttentionAt` passes it (`isVerified` in `app/inbox/model/verify.ts`); this ticket narrows that to scoped evidence. ADR 0010's install cutoff already runs before `verify`.

## What I'll judge it on

Every case in the acceptance criteria owned by a named test; I'll break each and expect a failure. Variant G's calm: the scoped diffstat on the opened row, "already verified" reachable but not shouting, ≥40px.

## Running beside other work

#14 runs in parallel (child audience, `feat/14-child-audience`). The inbox model is one module per rule (`app/inbox/model/`). Keep to your own rule modules and their tests; in `index.ts` add only your line(s) to the rule lists; in `types.ts` only add fields, never rename. Expect a small merge in those two files and keep both sides. Add every upstream file you touch to `docs/fork.md`.

## Human-owned resources

Don't install over the user's `inbox` plugin (it runs from `main`). Verify with tests, `bb plugin build .`, and if a live check is needed a scratch copy under its own id, removed after (see `_common.md`). Don't change the user's sidebar choice. `agent_browser` doesn't work here; use `bb browser-automation` headless for the 390×844 screenshot.

## Done means

Committed, pushed, draft PR into `main` with the phone screenshot and test summary, link in your report. Ask the user directly in your thread for any decision the ADRs don't settle.
