# Turn-end verdicts in the Inbox (#15)

#18 stores one verdict per thread: did its turn end with a question for the
human or a report, and has it used the grilling skill. #15 reads those
verdicts in the Inbox.

- A finished thread whose turn ended with a question is **Blocked on you**,
  word `answer`, reason "Ended its turn with a question for you"
  (`app/inbox/model/turn-end.ts`, rule `asks`). It runs after the
  pending-interaction, Broken and running rules. A question form, plan or
  permission keeps its own word, and a new running turn goes to the Running
  count.
- A child that asks in plain text, or has used the grilling skill, gets its
  own item. The item names its parent and why: "Its own item: it asks you in
  plain text" or "…it grills you with the grilling skill"
  (`audience.ts`, `classifiedReason`). Report children still fold into their
  parent. A pending interaction decides on its own, so a child waiting on a
  permission stays with its parent whatever an earlier verdict said.
- A child's own item is dated by its latest `turn/completed`
  (`child-attention.ts`). Without that, a grilling child's later reports would
  never show, because its attention never moves.

## Matching a verdict to its turn

A verdict counts only for the turn it was made for:

| Thread | Turn identity | Source |
|---|---|---|
| top-level | `turnKey` (the `latestAttentionAt` in the `thread.idle` payload) equals the sidebar's `latestAttentionAt` | `thread.idle` carries the row returned by the transition that sets `latestAttentionAt = now` ([`plugin-thread-events.ts#L99-L110`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/apps/server/src/services/plugins/plugin-thread-events.ts#L99-L110), [`threads.ts#L2343-L2366`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/db/src/data/threads.ts#L2343-L2366)) |
| child | `completedAt` equals the `turn/completed` time that `useChildCompletions` read | a child's attention doesn't move on idle ([`threads.ts#L699-L708`](https://github.com/get-bb/bb/blob/55135d1e5045d6c5d3c24f5a4d5556ed3e11cb00/packages/db/src/data/threads.ts#L699-L708)) |

`completedAt` is the smallest change made to #18. On `thread.idle` the server
reads `threads.events.list({types:["turn/completed"], order:"desc",
limit:"1"})` before queueing the classification, and stores the event's
`createdAt` with the verdict. Records stored before #15 read back with
`completedAt: null`. At startup, a child whose latest completion is newer than
its stored one is classified again. The contract moved to
`shared/inbox-turn-end.ts` with `keyTags`, and every stored verdict calls
`bb.rpc.experimental_invalidate([turnEndTag(id)])`. The app reads verdicts
with `experimental_useRpcKeyedQuery`.

While no verdict for the current turn exists, a turn that ended under 30s ago
(`CLASSIFY_GRACE_MS`) waits in the Running count. After that it counts as a
report, so a missing or failed read never hides work. While a read hasn't
answered, finished turns hold back (no item) rather than flash as FYI, for
the same 30s counted from when this client began waiting (so a reload long
after the turn still gets its grace), then the work shows. A read that never
resolves is bounded this way; a row the server omits fails the whole read in
the host (`Keyed read omitted key`, SDK 0.6.133
`dist/internal/rpc-query-host.js`) and counts as no verdict. Turns
that ended before the Inbox started are never asked about. The user chose
this on #15 ("New questions only"), and it is recorded as an amendment to
ADR 0010. Pending forms, plans and permissions are still exempt.

## Live evidence (2026-11-11)

- Child lifecycle, claude-code haiku child `thr_jytmedct3z`: attention stayed
  at 1794385648259 through two turns, which completed at 1794385658337 and
  1794385720248. The installed `inbox` (#18, without `completedAt`) stored
  question then report with the same `turnKey` for both turns, so the turns
  can't be told apart without the completion stamp.
- Scratch `inbox15` build on the user's server: top-level `turnKey`
  1794386902385, `completedAt` 1794386902383. Child `turnKey` 1794386932837
  (creation), `completedAt` 1794386936180.
- Grilling event shapes through `bb thread log --json`:
  - pi `fileRead` of `.../grilling/SKILL.md`, completed (thr_fry4mv3eju seq 209).
  - Codex `commandExecution` running `cat .../grilling/SKILL.md`, completed
    (thr_32kzj24hjb seq 26).
  - Claude Code `toolCall` `tool: "Skill"`, `arguments: {skill: "grilling"}`
    (thr_jytmedct3z seq 25–26). This load failed ("Unknown skill") but
    `item/started` had already fired, so #18 counted it. Detection now reads
    `item/completed` with `status: "completed"` only.
  - Not seen live: a successful Claude Code skill load (no Claude Code
    install here has the grilling skill), and a user turn invoking
    `/grilling`. Both are matched by shape only.
- Phone: [screenshot](screenshots/inbox-phone-turn-end-question.jpg) at
  390×844, drawer open, from a scratch `inbox15` install:
  - a child's plain-text question as its own `answer` item naming its parent,
  - the parent's FYI with its folded report child,
  - a top-level question under Seen.

  `scrollWidth` was 390. All 8 visible Inbox controls measured 40px. Preference
  writes were blocked in that browser; only its own GET
  `/api/v1/preferences/ui` was rewritten to select `inbox15/inbox`. The
  server value stayed `thread-list/thread-list`, revision 4. The scratch
  plugin was removed, its six scratch threads archived, and the browser
  session closed.

## Limitations

- The `answer` row says the turn ended with a question but doesn't quote it.
  Open goes to the thread.
- A thread that read the grilling skill file for another reason (for example
  to review it) still counts as grilling. That is #18's sticky rule.
- The grace compares server timestamps with the client clock, so clock skew
  stretches or shortens it.
