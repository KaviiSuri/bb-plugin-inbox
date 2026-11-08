# Brief: LOGIC prototype, the inbox state machine (issue #4)

Read `docs/briefs/_common.md`, `docs/brief.md`, and the `/prototype` skill's `SKILL.md` and `LOGIC.md` (at `~/.agents/skills/prototype/`) first. Follow LOGIC.md.

**Branch:** `prototype/inbox-logic`, never merged to `main`. **Output:** one file, `prototypes/inbox-logic.html`, that opens by double-click. **Inputs:** `docs/research/prior-art.md`, `docs/research/sdk-surface.md`, `docs/research/thread-list-internals.md` (merge or read them from their `research/*` branches if they aren't on `main` yet: `git fetch && git show origin/research/<name>:docs/research/<file>`).

## The question

"Does this inbox model feel right when you push real cases through it?" The user judges an idea by using it, not by answering questions about it. Put the question at the top of the page in plain words.

## The model to make clickable (from `docs/brief.md`, decided unless marked open)

- **One item per thread, kept current.** A running thread is not an item; running work shows as a count.
- **Priority tiers (draft):** 1 Blocked on you (question, permission, plan review, a grilling child) → 2 Broken (error, stuck) → 3 Verify (finished with a diff, PR or tests) → 4 FYI (a parent's summary of its children).
- **Clear = verified.** A sign-off, not a dismissal. Each item carries its evidence (diff, tests, PR checks, child summaries) and records who verified it and when.
- **Child audience:** `human` (gets its own item) or `parent` (folds into the parent's item). Set at spawn, with inference as a fallback (asked a question, used the grilling skill).
- **Deterministic signals first** (status, pending interaction, PR checks, errors); only "did the turn end with a question or a report?" needs a model. In the prototype that's just a fake field on the turn.
- **Open question, make it a toggle:** when a verified thread does more work, does its item come back scoped to only the new changes, or whole? Let the user flip it and watch both.

Use the real field names from `docs/research/sdk-surface.md` for the fake threads' signals (e.g. `status`, `hasPendingInteraction`, `parentThreadId`), shown in plain language on the page.

## Required shape

- A pure module in its own `<script>` block, liftable: `deriveInbox(threads, verifications, settings) → items` plus a reducer for events (thread starts, turn ends with a question, turn ends with a report and a diff, error, child spawned with audience X, human verifies item, verified thread does new work, PR check fails). No DOM inside it.
- State always visible: the fake threads (as a small tree, parents and children), the derived inbox in tier order, the running count, and the verification log (who, when, what evidence). Highlight what changed after each click.
- Free-play buttons for every event, on any thread.
- Guided walkthrough tabs, each resetting to a known state, at least: (1) happy path: a thread finishes with a diff, you verify it, it clears; (2) a `parent`-audience research child finishing folds into its parent's FYI, while a `human`-audience grilling child gets its own tier-1 item; (3) a verified thread does more work and comes back (the scoped/whole toggle visible); (4) five threads running at once collapse to a count; (5) something that should be illegal, e.g. verifying a thread that's still running, or clearing without evidence. Show what the model does.

## Axis of judgment

Feel, not completeness. Domain language on every label, clean type, one accent colour, no animation. A non-developer understands each walkthrough without help.

## Done means

Committed and pushed on `prototype/inbox-logic`. Your report includes the one command to open it (`open prototypes/inbox-logic.html` from a checkout of that branch, or the absolute path of your worktree file) and a screenshot saved at `prototypes/inbox-logic.png` (render it with the `agent_browser` tool, a fresh session, on the `file://` URL; don't touch the user's Chrome). Also list any place where the model felt wrong to you while building it: those are the findings.
