# Child reports need completion time, not attention time (#14)

## Contract

At upstream pin `55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00`:

- [`packages/db/src/data/threads.ts:699–708`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/db/src/data/threads.ts#L699-L708): `active → idle` advances `latestAttentionAt` **only for top-level threads**. A child reporting successfully leaves it unchanged.
- [`threads.ts:2343–2359`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/db/src/data/threads.ts#L2343-L2359): status transitions update `statusChangedAt` and `updatedAt`, but attention follows the rule above. The sidebar SDK exposes `updatedAt`, not `statusChangedAt`. `updatedAt` is not completion time: renaming and reading also change it.
- [`packages/sdk/src/areas/threads.ts:427–435`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/sdk/src/areas/threads.ts#L427-L435): supported `threads.events.list` accepts `types`, descending order and limit. Read `{types:["turn/completed"], order:"desc", limit:"1"}`; its event `createdAt` is the completion timestamp. [`packages/db/src/data/events.ts:881–923`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/db/src/data/events.ts#L881-L923) stamps daemon events with server `now`.

## Real lifecycle reproduction (2026-11-09)

Scratch top-level owner `thr_uu5c92bqve`, child `thr_ty66ztnbc4`, both `codex / gpt-6.1-sol`, notifications from the child off. No files changed by either thread. The owner was already idle before the cutoff.

| Fact | Server timestamp (ms) |
|---|---:|
| Child creation and `latestAttentionAt` | 1794217087050 |
| Owner's latest attention | 1794217088296 |
| Captured cutoff for this client-only Inbox-start simulation | 1794217155883 |
| Post-cutoff `report-one`, `turn/completed` event | 1794217158361 |
| Child `updatedAt` after report one | 1794217158362 |
| Owner opened from its FYI item (`lastReadAt`) | 1794217245941 |
| `report-two`, next `turn/completed` event | 1794217250949 |
| Child `updatedAt` after report two | 1794217250951 |

Child `latestAttentionAt` remained **1794217087050** through both reports.

A scratch plugin `inbox14-lifecycle` ran in a 390×844 headless client. That client alone substituted the scratch sidebar provider, the Inbox tab preference, and the captured cutoff in responses. UI/preference writes and `verify`/`later` writes were blocked. Thread bootstrap, events, output, reads, and realtime updates were **real**, not fixtures. No sidebar/provider selection was written to the server.

1. Parent appeared under New for you as FYI, `1 helper reported`, with `report-one`. Child had no own row.
2. Open navigated to the real parent, marking it read; FYI disappeared.
3. Child completed `report-two`. Without reloading, the parent reappeared under New for you. Opening its row fetched and displayed `report-two`.
4. After marking the scratch owner read, renaming the child changed its sidebar version but did not bring the owner back. No completion event was invented from `updatedAt`.

Screenshots: [first report](../screenshots/inbox-phone-child-lifecycle-first.jpg), [report two returns](../screenshots/inbox-phone-child-lifecycle-return.jpg). Both measured `scrollWidth=390`, no Inbox button below 40px, and no own child row.

An adjacent case exposed by this test: navigating to an **already-active** owner does not remount its chat and does not reliably advance read time. The Inbox now explicitly calls the supported `threads.markRead` when **Open** is used on FYI. It does not do this for Verify or pending permissions, nor simply when an item is expanded. A subsequent live report-four check confirmed that Open cleared FYI while the browser URL stayed on the same parent route.

## Fix and regression coverage

`useChildCompletions` reads the latest completion event for stopped visible children, with at most four concurrent requests. Sidebar `updatedAt` is only the cache/invalidation key. Unknown, loading, empty or failed reads remain unknown; they never become “finished now”. Responses from older versions or a previous turn are ignored after abort. No classifier/provider is needed, and completions survive plugin restarts through the host's persisted event log.

`audience.newsOf` uses completion time for report cutoff, clearing, Later, New/Seen, and the report-cache version. Failure signals still use attention (or the newer completion). Pending permissions still bypass report freshness and still wait for the parent to stop.

Tests:
- `model/child-lifecycle.test.ts`: captured timestamps above; install cutoff; opening report one and returning on report two; unknown reads; metadata-only changes. Replacing `audience.ts` with its pre-fix version fails the two real lifecycle cases.
- `useChildCompletions.test.ts`: repeat turns with fixed attention; loading/empty/error reads; metadata refetch without new completion; stale responses; a new running turn aborting an old read; no reads for top-level/running/hidden/archived threads.
- `ChildAudience.test.tsx`: SDK query arguments; old metadata edits do not become reports; already-active FYI Open marks the owner read; permission Open does not invoke the FYI shortcut.
- `InboxTabs.test.tsx`: Verify Open neither calls the FYI mark-read shortcut nor signs off work.

Additional mutations caught: removing the stale-response guard fails the hook tests; replacing completion with `updatedAt` fails three hook tests; removing explicit FYI mark-read fails the already-active-owner UI regression. Full suite: 59 files, 662 tests; typecheck, Inbox lint and `bb plugin build .` pass.
