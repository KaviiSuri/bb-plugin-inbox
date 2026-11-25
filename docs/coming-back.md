# Coming back, issue #13

A Verification covers a thread until it finishes new work, asks or fails.
`app/inbox/model/coming-back.ts` runs after Blocked on you, Broken and running,
and before the ordinary Verify/FYI rules. The pure `deriveInbox` tests in
`app/inbox/model/coming-back.test.ts` cover every acceptance case from #13.

## What the diff base covers

The sign-off still records the head SHA, merge base and per-file revisions.
It also records each path's HEAD mode from `bb--git files` with target
`uncommitted`, whose old side is HEAD. The old mode from the branch diff
is not sufficient because that old side is the merge base, not HEAD.
An absent path in a complete later HEAD diff has the stored HEAD mode.
This distinguishes reverted executable bits and restored empty files from
unchanged text. Older snapshots missing that metadata fall back rather
than declaring equal text unchanged.

It also captures text for up to 100 changed files, up to 100,000 characters
per file, through `bb--git fileSide`. This matters for uncommitted work:
verifying a three-line new file and then appending one line must show +1,
not +4. The optional `content` field is stored inside the existing diff-base
JSON, so older records need no migration.

On the next finish, the client reads `bb--git files` against the verified
head. New paths use that read's line counts. Verified paths compare their
saved text with their current text, using a bounded `diffLines` calculation.
Even a path absent from the new file list gets checked: reverting a verified
uncommitted change back to HEAD is new work, not an empty report.

The read is stamped with both the verification time and the thread's attention
time. An earlier result cannot stand in for a later sign-off or finish.
Re-verifying uses the existing server mutation, which captures a fresh base
and fresh text. The verifying client explicitly refetches after acknowledgement;
a live check found that its optimistic timestamp could otherwise outlive the
write and prevent any future return until reload.

#25 found that one refetch isn't enough. bb releases a prediction only for a
read that started after the write was acknowledged. The server invalidates
the sign-off tag before it answers, so the realtime refresh starts first, and
a refetch asked for while that read is in flight joins it rather than reading
again. Live, a Later's response headers arrived at 5 ms, the invalidation
and both reads at 6 ms, and the response body (the acknowledgement) at 7 ms;
no later read followed, and the far-future prediction hid all new work.

So the prediction is now dated at the attention the row showed (the item's,
or the thread's own if later), never in the future: it still clears the row
at once, and any newer finish, ask or failure exceeds it even if the server's
row never reaches this client. Verify and Later still read again, with
growing waits, until the server's row replaces the prediction, because only
that row carries the diff base that scopes a return.
`app/inbox/sign-off-return.test.tsx` drives both orders through the real SDK
cache, including reads that never succeed. Screenshot of the returned item on
the signing client:
`docs/screenshots/inbox-phone-return-after-signoff.jpg`.

## Conservative fallbacks

A null diff base, old base without the needed text, oversized or binary file,
unreadable git data, rewritten history, or a text comparison exceeding its
budget cannot produce an exact scope. Truncated file lists also cannot
establish that a path is absent. The opened row says it couldn't tell what
changed and shows all current evidence instead. It preserves that label even
when checks fail. It does not pretend the whole diff is new. If no prior files
or current evidence are available, it becomes FYI. If prior file state is
ambiguous, it stays Verify even with no HEAD diff, because empty-file and
mode changes can be invisible in the text.

With no new work, failing PR checks bring the item back only if a non-null
checks state at sign-off wasn't `failing`. Null means there is no known prior
state to compare. Already-failing checks never bring it back by themselves.
Checks that fail alongside new changes still appear in the reason line.

## Verification

- `coming-back.test.ts`: running and grace, finished scoped Verify, asks,
  errors, report-only FYI and opening it, failing-check transitions,
  already-failing sign-off, re-verifying, missing/stale reads and fallbacks.
- `useScopedChanges.test.ts`: selecting the latest base, skipping running,
  waiting, covered and baseless threads.
- `return-metadata.test.tsx`: realistic empty `files` and equal-text `fileSide`
  answers for reverted chmods and restored empty files, both with captured
  HEAD metadata and older snapshots that require a labelled fallback.
- `InboxTabs.test.tsx`: scoped diffstat, folded Already verified files,
  Verify action, and a fresh sign-off read after acknowledgement.
- `server/verification/verification.test.ts`: text survives the RPC/storage
  boundary and a second sign-off replaces it.
- Phone screenshots: `docs/screenshots/inbox-phone-coming-back*.jpg`, captured
  at 390×844 with bb's drawer open, from a separate `inbox13` installation.
  Measured page width was 390px; every visible Inbox control was 40px high,
  including the prior-file content toggles. The scratch plugin was removed
  and both scratch threads archived.

The live check verified an uncommitted file, committed it, added new work,
then signed off and returned again. No reload was needed after fixing the
optimistic timestamp. The final screenshots use the final build: a two-line
uncommitted file was verified, then a third line appended. The opened row
shows +1, and opening its prior snapshot shows only the two verified lines.
Tests additionally cover reverting the same file back to HEAD.

The headless client selected `inbox13` through Appearance during that check.
That unexpectedly affected the synced sidebar preference, despite the SDK
reference describing it as per-client. This was reported to the orchestrator;
no corrective preference write was made. A later read-only check found
`sidebar.threadListProvider = "thread-list/thread-list"`. The final screenshot
session overrides only its own GET `/api/v1/preferences/ui` response to select
`inbox13` and blocks preference writes. The database value was unchanged
before and after that session.

## Primary contracts

- `bb plugin rpc inspect bb--git files` and `fileSide`, checked against the
  installed bb 0.49.0. `files` accepts target `all` with a commit SHA as
  `mergeBaseBranch`; the response's `mergeBaseRef` must equal it for an exact
  comparison. `fileSide` returns `utf8` or `base64` content, or an unavailable
  outcome. No deprecated SDK git methods are used.
- `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts`,
  `ExperimentalRpcKeyedQueryState.refetchKeys` and the mutation acknowledgement
  contract, around lines 23954–24000 in SDK 0.6.133.
- `files` target `uncommitted` explicitly uses `git diff HEAD`, while target
  `all` uses the resolved merge base:
  https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/plugins/git/host/workspace-reads.ts#L2236-L2257
- bb's child-thread attention behavior is intentional upstream:
  https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/db/src/data/threads.ts#L699-L708
  does not advance attention when an ordinary child becomes idle. The live
  returning-work check therefore used a top-level scratch thread, lifecycle
  owned by this work thread, after archiving the initial child fixture.
