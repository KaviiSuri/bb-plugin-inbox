# Brief: visual prior art for the Inbox tab (issue #8)

Read `docs/briefs/_common.md` and `docs/brief.md` first.

**Branch:** `research/visual-prior-art`. **Output:** `docs/research/visual-prior-art.md`, images under `docs/research/visual/`, and a contact sheet `docs/research/visual/index.html` (one page, opens offline, relative image paths).

## Why this exists, in the user's words

The UI prototype (#5) came back and the user said "ui options are quite crowded tbh". I then anchored the rework on T3 Code, and the user corrected: "don't assume t3code is the best option. plz actually research for more options even visually". The first prior-art pass (`origin/research/prior-art:docs/research/prior-art.md`) covered rules: items, ordering, clearing. It never looked at what the screens look like. This one is about the pixels.

## What to collect

At least 15 products, chosen for range, not just agent tools. Look widely, for example:
- Agent and coding tools: T3 Code, Conductor, Plannotator, Vibe Kanban, Cursor background agents, OpenAI Codex (web task list), Devin, Claude Code (desktop / web session list), Google Jules, GitHub Copilot coding agent, Sculptor, Amp, Zed's agent panel, Factory.
- Inboxes and triage: Linear inbox, GitHub notifications, Superhuman, HEY (Imbox / Feed / Paper Trail), Gmail, Front, Missive, Slack Activity and Later.
- Calm lists generally: Things 3, Arc's sidebar, Raycast, Height, Notion inbox.

For each: one or two screenshots of the list or queue (official site, docs, changelog, launch post, GitHub README, or a public demo you can open), saved to `docs/research/visual/<product>-<n>.png` with the source URL recorded. Then, per product, a few lines: what a row shows at rest, what appears only on hover/selection/open, how running or low-value work is quieted, density (rows visible in ~800px), and one thing worth stealing.

Capture screenshots with `bb browser-automation` in a local headless session (the `agent_browser` tool is broken here: installed agent-browser 0.26 is below its 0.35 minimum). Don't use the user's Chrome. Where you can only find an image on a page, save that image and cite the page. If a product has no public visual, say so in one line and move on.

## Then: directions

End with 4 to 6 **visual directions** for a narrow (~280px) bb sidebar Inbox, each drawn from two or three named products, each with a one-line bet and the screenshots it comes from. They must differ in how they look and how quiet they are, not only in layout. These feed the rework of #5, so make each one concrete enough to build.

## Axis of judgment

Range and honesty. The user should open `index.html` and see the field at a glance: a grid of screenshots grouped by product, each captioned with the source and the "worth stealing" line, the directions at the bottom. No product is the default answer; say where each falls short too.

## Scope

Only `docs/research/visual-prior-art.md` and `docs/research/visual/`.
