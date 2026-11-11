# Brief: live QA pass of the merged Inbox (QA round 1)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, every ADR in `docs/adr/`, the spec (GitHub #9), and `docs/fork.md`. Load the `qa` skill for how to file issues, and `browser-automation` / `bb-plugin-authoring` for driving bb.

## Goal, in the user's words

"no u QA it." The user wants the Inbox exercised for real and the problems found and filed, rather than finding them by living with it. Their earlier complaint about the first live build is the bar: "i get a lot of details in the inbox. and honestly they weren't that useful, cuz they were child threads that weren't supposed to be talking to me." Judge whether each row earns its place.

## What's under test

`main` at `68df0cd` or later. The installed `inbox` plugin already runs from the main checkout, so test that build. Don't build or install anything.

## How

1. **Scenarios with real threads.** Spawn cheap scratch threads (any provider/model that works here; try a fast one, fall back as needed) in a scratch project or this project with titles prefixed `QA:`. Drive each through a lifecycle and watch the Inbox. At minimum:
   - finished with a diff → Verify; Verify clears it; more work → returns scoped to only the new changes; "Already verified" reachable
   - report with nothing to verify → FYI; opening clears it
   - Later hides until a new finish/question/failure
   - question form, plan review, permission → Blocked on you with the right word
   - plain-text question at turn end → `answer`; a report → nothing
   - parent with research children → children fold, parent's FYI lists their reports once it stops, nothing while it runs
   - child asking in plain text, child grilling, child with a question form → own row naming parent and why
   - child permission with parent stopped → parent shows `approve` + Open helper
   - error → Broken; running threads only in the footer count
   - New for you vs Seen, badge counts only New for you
2. **The user's own live inbox, read-only.** Look at what the Inbox shows for the user's real threads right now. Note every row you think is noise or missing, with the thread and why. Don't open, mark read, verify, Later or otherwise change the user's real threads.
3. **Phone.** 390×844 headless with the sidebar drawer open: one column, no horizontal scroll, Inbox tap targets ≥40px, nothing needs hover or keyboard. Also check light and dark if cheap.
4. **Threads tab parity spot-check:** nesting, pinned, sections, worktree grouping still behave like the built-in list.

## Human-owned resources (strict)

- Never change the user's synced sidebar preference. Selecting a provider in a headless browser writes it server-side. Block every preference write in that browser and override only that client's GET preference response to select `inbox`. Check `bb settings ui get sidebar.threadListProvider` is `"thread-list/thread-list"` before and after.
- Don't install, uninstall, reload or reconfigure plugins, including the classifier setting. Don't touch the user's Chrome.
- Don't act on the user's real threads (see 2).
- Archive every `QA:` thread when done.

## Output

- File each real problem as its own GitHub issue per the `qa` skill template, label `needs-triage`, title prefixed `QA:`. User-facing behavior and domain terms, no file paths. Attach a screenshot when it shows the problem. Don't file things that match an ADR decision; list those separately as "works as decided, but questionable" if you think the decision is wrong in practice.
- Don't fix anything. No branch, no PR.
- Comment a summary on #9.
- Final report under 25 lines: issues filed (number, one line each, severity), scenarios that passed, anything you couldn't test and why.
