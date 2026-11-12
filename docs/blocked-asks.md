# Asks that arrive mid-turn (#24)

## Contract

- A thread waiting on a question form, plan review or permission is New for you,
  and counted on the Inbox tab, when the ask arrived after the thread was last
  read. Once the human opens the thread after the ask, it moves to Seen.
- This covers top-level threads, a child's own item (question form, plan), and a
  child's permission surfaced on its stopped parent as `approve`.
- The item's attention time is the newest still-pending interaction's
  `createdAt`, from `sdk.threads.interactions.list`. `updatedAt` is never used.
- A thread already read holds back while that time loads, so it doesn't show in
  Seen and then jump to New. When the read fails or finds nothing pending, the
  item still shows, on its generic reason ("Waiting for you").

## Why

bb advances a thread's `latestAttentionAt` at turn end, not when a pending
interaction appears. A thread read after its turn started (watched, or created
from the CLI) therefore counted as read when it asked.

## Sources

- `PendingInteraction.createdAt: number` on both provider and plugin
  interactions: `@get-bb/plugin-sdk` 0.6.133,
  `bundled-types/bb-plugin-sdk-app.d.ts:3723-3724, 3953-3954`.
- Live run, bb 0.49.0: three CLI-spawned Claude Code threads had
  `lastReadAt` 6–7 ms after `latestAttentionAt`. Their interactions'
  `createdAt` (question form 1794492503181, permission 1794492503266, plan
  1794492507880) was after both, in ms on the server clock. `latestAttentionAt`
  didn't move when they asked.

## Live check

A scratch `inbox24` copy, running from this branch, and the installed `main`
build were checked side by side in one headless 390×844 browser. Only that
browser's preference GETs were rewritten to pick each provider and the Inbox
tab. Preference and read-state writes were blocked; none were attempted.

- `main`: question form, plan review and child question form in Seen, badge 2.
- This branch: all five asks (question form, plan, permission, child question
  form, parent `approve` for its child's permission) in New for you, badge 5.
- After marking the question form and the child's question form read: both
  moved to Seen, badge 3 ([screenshot](screenshots/inbox-phone-24-opened-seen.jpg)).
  `scrollWidth` was 390.

`sidebar.threadListProvider` was `"inbox/inbox"` before and after. The scratch
plugin was removed and the six `QA24:` threads were archived.

## Limitations

- The parent's `approve` for a child's permission was New live, but only because
  bb woke the parent when the child blocked, which moves the parent's attention.
  "Parent read before the child asked" is covered by tests only.
- If a thread answers one ask and gets another before the sidebar shows it
  stopped waiting, the old ask's time is kept until the new read lands. That
  could briefly show the new ask in Seen.
