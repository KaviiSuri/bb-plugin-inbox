# Verify and FYI items only cover work finished after the Inbox was installed

On first install, every old idle thread whose worktree still held a diff or a PR became a Verify item, a day-one backlog of work nobody ever meant to sign off (seen live with #12's build). The plugin records when it first ran, once, on the server; a thread becomes a Verify or FYI item only if its latest attention is after that time. Blocked on you and Broken are unaffected: a thread waiting on the human or stuck still shows, however old. Older work stays browsable in the Threads tab.

## Amendment: plain-text questions (#15)

A turn that ends with a plain-text question (the classifier's `question` verdict, ADRs 0008 and 0009) also follows the cutoff: it's Blocked on you only if the turn ended after the Inbox started. For a child, that means its latest `turn/completed`. Otherwise, on first install, every old thread whose last message happened to end with a question would arrive as `answer`. Pending question forms, plans and permissions are still exempt: a thread actually waiting on the human shows however old. Chosen by the user on #15 ("New questions only").

## Considered options

Skipping merged or closed PRs, a one-week staleness cutoff, and keeping the backlog to clear by hand were rejected by the user. For plain-text questions, exempting them like pending interactions was rejected by the user.
