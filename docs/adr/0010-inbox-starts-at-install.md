# Verify and FYI items only cover work finished after the Inbox was installed

On first install, every old idle thread whose worktree still held a diff or a PR became a Verify item, a day-one backlog of work nobody ever meant to sign off (seen live with #12's build). The plugin records when it first ran, once, on the server; a thread becomes a Verify or FYI item only if its latest attention is after that time. Blocked on you and Broken are unaffected: a thread waiting on the human or stuck still shows, however old. Older work stays browsable in the Threads tab.

## Considered options

Skipping merged or closed PRs, a one-week staleness cutoff, and keeping the backlog to clear by hand were rejected by the user.
