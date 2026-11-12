# Brief: mid-turn asks land in Seen (#24)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/`, and GitHub issue #24 (the contract, with the QA reproduction). Load TDD and bb-plugin-authoring skills.

**Branch:** `fix/24-blocked-in-seen` off `main`.

## The bug

A thread that starts waiting on a question form, plan review or permission after the human last read it shows in Seen and isn't in the badge. bb doesn't advance `latestAttentionAt` when a pending interaction appears, only at turn end, so the New/Seen split (unread since latest attention) calls it read. bb's own home screen shows these as NEEDS INPUT at the same moment.

## What I want

Blocked on you items from a pending interaction are New for you, and counted, when the interaction arrived after the thread was last read. Find an authoritative arrival time from supported APIs (the pending interactions are already listed per waiting thread; check what timestamp they carry against the SDK types and a live run) and use it as the item's attention time. Don't use `updatedAt`. Once the human opens the thread after it, it moves to Seen as today. Cover top-level threads, a child with its own item (question form, plan), and a child's permission surfaced on the stopped parent as `approve`. Hold back rather than flash Seen→New while the interaction's time is loading, and never hide the item if the read fails.

## What I'll judge it on

Named tests for each case above, including "opened after the ask → Seen" and "read before the ask → New". I'll remove the new attention source and each call site in turn and expect failures.

## Running beside other work

#25 is being fixed in parallel on `fix/25-return-after-signoff`. Keep to your area; if you must touch `app/inbox/model/index.ts`, `types.ts` or `useInboxView.ts`, keep the change small and additive. Don't rename anything: a plugin rename to `agent-inbox` follows after both fixes.

## Human-owned resources

Never install over `inbox`, change the user's sidebar provider or any synced preference (including the Inbox's `activeTab`), or act on the user's real threads. For live checks use a scratch plugin copy under its own id and `QA:`/scratch threads, archived after. In a headless browser block **every** preference write (the previous QA run leaked `activeTab` through a route it didn't block), and check `bb settings ui get sidebar.threadListProvider` is `"thread-list/thread-list"` before and after.

## Done means

TDD: a failing named test reproducing the bug through the real route first, then the fix. Full suite, typecheck, focused lint, `bb plugin build .`, and a live reproduction of the issue's steps on the scratch copy showing it fixed. Commit, push, draft PR into `main` that says "Fixes #24", comment on the issue, report under 25 lines.
