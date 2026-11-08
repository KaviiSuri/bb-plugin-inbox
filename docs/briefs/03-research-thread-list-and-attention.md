# Brief: research upstream thread-list internals and bb-plugin-attention (issue #3)

Read `docs/briefs/_common.md` and `docs/brief.md` first.

**Branch:** `research/thread-list-internals`. **Output:** `docs/research/thread-list-internals.md`. Covers research questions 3 and 4 from `docs/brief.md`.

## Goal

We will fork bb's built-in `thread-list` plugin (the whole Threads tab) and add an Inbox tab on top. The UI prototype also needs to know how the existing rows, glyphs and grouping are built, so its variants feel native. And `bb-plugin-attention` already computes "threads that need your attention": it's prior art for our classifier.

## Part A: upstream `thread-list`

Clone https://github.com/get-bb/bb into `/tmp/bb-upstream` (shallow is fine) and read `plugins/thread-list/`, starting with `PLUGIN_OVERVIEW.md`. Record the commit sha you read; that's the pin for the fork.

1. How it builds the tree: nested child threads, children sharing the parent's worktree vs. their own, cross-worktree references, pinned, sections, project / machine / chronological organization. Name the modules and the main functions, with paths.
2. Its state and storage: what it persists, where, and how.
3. Where an Inbox tab slots in: the top-level component that renders the scroll area, and the cleanest seam for "two tabs at the top: Threads | Inbox". Which row/glyph/status components an Inbox list could reuse directly.
4. What forking it standalone takes, concretely: every `@/components/ui/*` and `@/lib/utils` import (vendored UI; compare with what `bb plugin new` scaffolds), every `workspace:*` dependency (`@bb/shared-ui`, `@bb/plugin-build`, `@get-bb/plugin-sdk`) and its published or vendorable replacement, and the build. A checklist with file counts, not prose.

## Part B: `bb-plugin-attention`

Source is installed at `~/.bb/plugins/cache/npm/bb-plugin-attention/0.1.5/`. Read it.

1. Which signals it uses (errors, pending input, unread turns, anything else), the exact fields, and how it decides a thread "needs attention".
2. How it orders them and what clears them.
3. Where its logic matches or differs from our draft tiers (Blocked on you → Broken → Verify → FYI) and from "clear = verified".

## Axis of judgment

A fork author and a prototype author should both act on it without reopening the source. Paths and line numbers on every claim. Part A item 4 as a checklist. Keep the whole file to about two pages.

## Scope

Write only `docs/research/thread-list-internals.md` in this repo. Don't copy upstream code into this repo yet; the fork is a later ticket.
