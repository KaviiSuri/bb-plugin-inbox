# Brief: UI prototype, Inbox tab variants in the real sidebar (issue #5)

Read `docs/briefs/_common.md`, `docs/brief.md`, the `/prototype` skill's `SKILL.md` and `UI.md` (at `~/.agents/skills/prototype/`), and the `bb-plugin-authoring` skill (SKILL.md, then `references/frontend-registration.md` and `references/frontend-hooks-and-ui.md`) first. Follow UI.md sub-shape A: the host page is bb's own sidebar.

**Branch:** `prototype/inbox-ui`, never merged to `main`. **Output:** a throwaway plugin package at `prototypes/inbox-ui/` (scaffold with `bb plugin new inbox-prototype`, then move it there). **Inputs:** `docs/research/prior-art.md` (its "Ideas for our prototypes"), `docs/research/sdk-surface.md` (exact fields), `docs/research/thread-list-internals.md` (how native rows and glyphs look). If they aren't on `main` yet, read them from their branches: `git fetch && git show origin/research/<name>:docs/research/<file>`.

## The question

"What should the Inbox tab look like, felt against my own live threads?" Not "does the logic work": that's the sibling LOGIC prototype (#4).

## What to build

- Register a throwaway `app.slots.experimental_threadList` provider titled **"Inbox prototype"** that reads live `experimental_useSidebarThreads()`.
- Two tabs at the top of its scroll area: **Threads** | **Inbox**. Threads can be a plain, simple tree for the prototype (the real one will be the forked upstream list); don't spend effort there.
- **3 to 5 radically different Inbox designs** (structurally different layout, hierarchy and primary affordance, per UI.md). Draw from the prior-art ideas, for example: a tiered list grouped Blocked / Broken / Verify / FYI with running work as one count; a one-at-a-time focus card (Superhuman-style) with the evidence inline and a Verify button; a compact list plus an expanding evidence preview; something else the research suggests. Each row should show what the item is waiting on and its evidence affordance (diff, tests, PR checks, child summaries), even if the evidence is stubbed.
- Variants to start from (`docs/research/prior-art.md`, "Ideas for our prototypes"): collapsible lanes per tier with a "Running N" row at the bottom; one ranked list whose rows expand in place to show evidence; one item at a time, Superhuman-style, with Verify / Later / Open; the existing tree with an attention filter and urgency dots. Pick 3 to 5 that disagree about structure.
- Freeze the inbox's order while the pointer is over it, and re-sort when it leaves, so rows don't jump.
- For row parts use the SDK's `experimental_ThreadStatusGlyph` / `experimental_resolveThreadStatus` and the row-metadata components (`docs/research/sdk-surface.md`, `docs/research/thread-list-internals.md`). For the Threads tab tree, nest only by `parentThreadId`, like upstream.
- Evidence: PR checks come from the bundled `bb--github-pr-status` plugin and diffs from `bb--git`, both per environment id (`docs/research/sdk-surface.md`). Show live PR/diff counts where it's cheap; stub tests.
- Derive items with a quick, local, deterministic classifier from the live fields (pending interaction → tier 1, error/failed → tier 2, finished+unread → tier 3, a parent with finished `parent`-audience children → tier 4). Don't polish it; it's not the question.
- **Floating switcher bar** at the bottom of the sidebar: ← variant label →, plus ←/→ keys when no input is focused. The sidebar has no URL to put `?variant=` in, so keep the variant in `localStorage`.
- **Fixtures toggle** in the switcher: mixes in fake threads for states that are hard to reproduce live (a pending plan review, a broken PR check, a grilling child, five running threads).
- **Verify** is a stub: it records `{ verifiedBy, verifiedAt }` in `localStorage` and the item clears. No real mutations.

## Axis of judgment

It must feel native to bb's sidebar: same density, type and glyph language as the built-in list (use vendored UI from the scaffold and the SDK's host components; look at how upstream rows are built). And the variants must disagree about structure. Three colour swaps of one list is a failed prototype.

## Running it, and the resources

- You may build and install **your own** prototype plugin into the user's bb: `bb plugin build prototypes/inbox-ui && bb plugin install ./prototypes/inbox-ui` (or `bb plugin dev prototypes/inbox-ui` while iterating). That plugin is yours; leave it installed when you finish.
- Don't change the user's sidebar choice in their desktop app. To see and screenshot your work, open bb's web client in a **fresh** `agent_browser` session, pick "Inbox prototype" under Settings → Appearance → Sidebar there (the choice is per client), and take screenshots. Find the client URL from `bb status` / `bb guide`; check `--help` before concluding something is missing.
- If installing your plugin makes it the default list for the user (deterministic slot order), say so plainly in your report.

## Done means

Committed and pushed on `prototype/inbox-ui`, plugin installed. Your report gives: the steps to try it (one command if any, then the exact Settings path), one screenshot per variant saved under `prototypes/inbox-ui/screenshots/`, and one line per variant on what it's betting on.
