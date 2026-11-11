---
name: inbox-classifier
description: Inspect or change the Inbox plugin's turn-end classifier, which decides whether a thread's turn ended with a question for the user or a report, and whether the thread used the grilling skill.
---

# Inbox turn-end classifier

On every `thread.idle`, the Inbox plugin decides whether the turn ended with a
question for the user (`question`) or a report (`report`), and records whether
the thread has ever used the grilling skill. The Inbox tab reads these: a
finished thread whose turn ended with a question is Blocked on you (word
`answer`), and a child that asked a question or used the grilling skill gets
its own item naming its parent (ADR 0008).

## Choosing the model

The plugin keeps the provider, model and reasoning level in its own storage
(not a bb setting, so no raw JSON field shows). Set it in Settings → Installed
plugins → Inbox → Turn-end classifier with bb's model picker, then Save.

- Empty (the default): a plain rule decides, does the last message end with a
  question to the user? No tokens are spent.
- Set: each turn end is read by a hidden helper thread on that provider, using
  its existing login. The helper runs in a fresh personal workspace, answers
  one word, and is archived and stopped. If it fails, times out (90s) or gives
  no clear answer, the plain rule decides.

From the CLI, read it with `bb plugin rpc call inbox getTurnEndClassifier`
and turn it off with `bb plugin rpc call inbox setTurnEndClassifier
--input-file <file>` where the file holds `{"selection": null}`.

At startup the plugin catches up on turn ends it missed while unloaded. A first
install uses the plain rule for all of them; later, at most 10 missed turn ends
are read by the model and the rest by the plain rule.

## Reading verdicts

`bb plugin rpc call inbox turnEnds --input-file <file>` with
`{"keys": ["thr_…"]}` returns, per thread, `null` or
`{verdict, source, fallback, grilling, turnKey, completedAt, classifiedAt}`.
`turnKey` is the thread's `latestAttentionAt` at that turn end; `completedAt`
is the server time of its latest `turn/completed` event. bb doesn't move a
child's attention when it finishes, so the Inbox matches a child's verdict to
its turn by `completedAt` and a top-level thread's by `turnKey`; a verdict for
an earlier turn is never applied to a later one. Grilling counts once a load
of the skill completed (a failed skill load doesn't). `source` is
`model` or `heuristic`; `fallback` says why the heuristic decided
(`no-provider`, `no-text`, `startup`, `failed`, `timeout`, `unparseable`).
Hidden threads, archived threads and the helpers themselves are never
classified.
