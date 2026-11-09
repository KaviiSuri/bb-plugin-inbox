---
name: inbox-classifier
description: Inspect or change the Inbox plugin's turn-end classifier, which decides whether a thread's turn ended with a question for the user or a report, and whether the thread used the grilling skill.
---

# Inbox turn-end classifier

On every `thread.idle`, the Inbox plugin decides whether the turn ended with a
question for the user (`question`) or a report (`report`), and records whether
the thread has ever used the grilling skill. The Inbox tab reads these to
decide a child thread's audience (ADR 0008).

## Choosing the model

The `turnEndClassifier` plugin setting holds the provider, model and reasoning
level, as JSON. Set it in Settings → Installed plugins → Inbox → Turn-end
classifier with bb's model picker, then Save.

- Empty (the default): a plain rule decides, does the last message end with a
  question to the user? No tokens are spent.
- Set: each turn end is read by a hidden helper thread on that provider, using
  its existing login. The helper runs in a fresh personal workspace, answers
  one word, and is archived and stopped. If it fails, times out (90s) or gives
  no clear answer, the plain rule decides.

Turn it off from the CLI with `bb plugin config inbox set turnEndClassifier ""`.

At startup the plugin catches up on turn ends it missed while unloaded. A first
install uses the plain rule for all of them; later, at most 10 missed turn ends
are read by the model and the rest by the plain rule.

## Reading verdicts

`bb plugin rpc call inbox turnEnds --input-file <file>` with
`{"keys": ["thr_…"]}` returns, per thread, `null` or
`{verdict, source, fallback, grilling, turnKey, classifiedAt}`. `source` is
`model` or `heuristic`; `fallback` says why the heuristic decided
(`no-provider`, `no-text`, `startup`, `failed`, `timeout`, `unparseable`).
Hidden threads, archived threads and the helpers themselves are never
classified.
