# Brief: feed classifier verdicts into the Inbox (#15)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, ADRs 0002, 0006, 0008, 0009, 0010, `docs/fork.md`, GitHub issues #15 and #18, and `docs/research/child-completion-lifecycle.md`. Use available TDD and bb-plugin-authoring skills. The GitHub #15 acceptance criteria are the contract; its server-half requirements already landed in #18, so reuse rather than rebuild them.

Branch `feat/15-classifier-inbox` from latest main. #13/#14/#18 are merged.

## Goal

A plain-text question to the human makes a finished thread Blocked on you, word `answer`. A child asking the human in plain text or using the grilling skill has its own item naming its parent and why; reports continue to fold into the parent. Deterministic pending question/plan/permission signals retain precedence. Keep Variant G Paper dots presentation.

## Existing work

- `server/classifier/`, `app/classifier/`, shared contracts and provider picker exist from #18. Read them and consume stored verdicts through their keyed RPC/realtime mechanism. Do not duplicate classifier threads, model selection, helper management or heuristic logic.
- `app/inbox/model/` has one module per rule. Add the new concerns there with named tests and composition lines; preserve coming-back scope and audience routing.
- Child success does NOT advance `latestAttentionAt`. #14 uses supported `threads.events.list` reads of `turn/completed` createdAt, never updatedAt, for folded completion timestamps. Classifier verdicts also need to match the actual turn; test real API-shaped fixtures with unchanged child attention. Reuse authoritative stamps and prevent stale verdicts from applying to a new running/finished turn. Consult #14's lifecycle research for exact evidence.
- FYI Open explicitly marks the owner read, including when already active. Verify still requires explicit sign-off. Do not erase either behavior.

## Review axis

Named tests for top-level plain-text question, child plain-text question, grilling child, ordinary report unchanged, deterministic interaction precedence, question answered/new turn running, loading/failure/stale verdicts, install cutoff, and classifier hidden helpers excluded from both tabs. Exercise the real consumption route, not only pure model fixtures. I will remove each guard and each wiring argument in turn and expect named failures.

Prove the actual grilling event signal against supported APIs and real event shapes; don't assume a tool name or skill basename. If #18's stored verdict lacks a needed signal or lifecycle stamp, make the smallest compatible change with server regression coverage. Record source contracts and any unavailable signal honestly.

## Human-owned resources

Never install over `inbox`, change the user's sidebar provider, or operate the user's browser. For phone evidence use a separate scratch plugin ID and headless browser. Explicitly block all synced preference writes in that browser; selecting a sidebar provider can be server-synced despite localStorage. Override only the scratch client's GET preference response if needed. Remove scratch plugins and archive your probes afterwards.

## Delivery

Full tests, typecheck, focused lint, `bb plugin build .`, and a 390x844 screenshot showing the final build with visible >=40px Inbox controls and no horizontal scroll. Commit and push clean, draft PR into main, comment on #15, then report commit/files/evidence/limitations. Don't merge or close the issue. Ask genuinely human-owned decisions directly in your thread.
