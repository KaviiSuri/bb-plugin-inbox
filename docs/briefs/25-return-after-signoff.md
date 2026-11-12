# Brief: no return after Verify or Later until reload (#25)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/` (0003, 0007), `docs/coming-back.md`, and GitHub issue #25 (the contract, with the QA reproduction). Load TDD and bb-plugin-authoring skills.

**Branch:** `fix/25-return-after-signoff` off `main`.

## The bug

On the client that tapped Verify or Later, the item never comes back when its thread finishes new work, until a reload. Other live updates keep arriving, and the server's Verification/Later times are correct (before the new attention). After a reload it returns correctly, scoped.

## Known history

#13 found the optimistic sign-off is stored with a far-future time (MAX_SAFE_INTEGER) so the row clears instantly, and added an explicit refetch after the server acknowledges, verified live then. The QA run says the symptom is back, for both Verify and Later, on `68df0cd`. Find out why with a live reproduction before changing code: whether the refetch runs, whether its result replaces the optimistic entry, whether Later has the same path, whether a keyed-query cache or a later realtime refresh puts the optimistic value back. Write down the cause in the PR.

## What I want

After Verify or Later, the next finish, question or failure brings the item back on the same client without a reload, scoped as #13 does. The row still clears instantly when tapped. A failed write still rolls back. Another client verifying still clears it here.

## What I'll judge it on

A named test that drives the real hook route (tap, acknowledgement, thread finishes again) and fails today, for Verify and for Later. I'll remove the fix at each call site and expect failures.

## Running beside other work

#24 is being fixed in parallel on `fix/24-blocked-in-seen`. Keep to your area; if you must touch `app/inbox/model/index.ts`, `types.ts` or `useInboxView.ts`, keep the change small and additive. Don't rename anything: a plugin rename to `agent-inbox` follows after both fixes.

## Human-owned resources

Never install over `inbox`, change the user's sidebar provider or any synced preference (including the Inbox's `activeTab`), or act on the user's real threads. For live checks use a scratch plugin copy under its own id and `QA:`/scratch threads, archived after. In a headless browser block **every** preference write (the previous QA run leaked `activeTab` through a route it didn't block), and check `bb settings ui get sidebar.threadListProvider` is `"thread-list/thread-list"` before and after.

## Done means

TDD: a failing named test reproducing the bug through the real route first, then the fix. Full suite, typecheck, focused lint, `bb plugin build .`, and a live reproduction of the issue's steps on the scratch copy showing it fixed. Commit, push, draft PR into `main` that says "Fixes #25", comment on the issue, report under 25 lines.
