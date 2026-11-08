# Rules every child follows

Read these before your own brief.

- **Source of truth:** `docs/brief.md`. Read it fully first. Where your brief and it disagree, it wins; say so in your report.
- **You work in your own worktree, on the branch your brief names.** Commit there and push the branch (`git push -u origin <branch>`). Never commit to, merge into, or push `main`. The human reviews before anything lands.
- **Commit before you report.** A clean `git status` is part of done.
- **Human-owned resources, don't spend them:** the `main` branch; the user's running bb app and its plugin set (don't disable, enable, update or uninstall plugins you didn't install; don't change Settings → Appearance → Sidebar); the user's Chrome session; other threads' worktrees.
- **No bb task board.** Work is tracked in GitHub Issues on KaviiSuri/bb-plugin-inbox (`docs/agents/issue-tracker.md`). Comment your result on your issue with `gh issue comment <n>`; don't close it, the orchestrator does that after review.
- **Cite primary sources.** Source code (repo URL + path + line, or a local absolute path + line), official docs, installed SDK types. Mark anything you infer instead of read as *inferred*.
- **Report** in your final message: the branch, the commit sha, the files you wrote, and the 3 to 6 findings that matter most for the prototypes. Keep it under 25 lines.
- **Reviewable on a phone.** The user often reviews from their phone over Tailscale, inside bb. Every page you hand back must read and work at 390px wide: one column, no horizontal scroll, tap targets at least 40px, nothing that needs hover or a keyboard. Check it at 390x844 in a headless session and include that screenshot.
- **Ask the human directly.** If your work needs a decision from the user, ask them in your own thread and wait. The orchestrator doesn't relay questions for you.
