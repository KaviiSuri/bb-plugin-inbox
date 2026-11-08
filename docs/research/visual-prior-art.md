# Visual prior art for the Inbox tab

Issue #8. The first prior-art pass (`origin/research/prior-art:docs/research/prior-art.md`) covered the rules: what counts as an item, ordering, clearing. This one covers what the screens look like. Contact sheet: [`visual/index.html`](visual/index.html) (opens offline, built for a 390px phone).

**Method.** Screenshots come from official sites, docs, changelogs, READMEs and launch videos, opened in a local headless browser (`bb browser-automation`). Where a page only had a video, I pulled one frame with ffmpeg and cite the video and the page that embeds it. Sidebar crops (`*-1.png` on agent tools) are cut from the full frame next to them so they stay legible at phone width. Marketing images are staged demos, so they show each product at its best, not at 40 threads.

**Densities** are rows visible in ~800px of list height, estimated from each screenshot's row pitch scaled to the app's native size. Treat them as *inferred*, ±20%.

**T3 Code** row anatomy comes from a sibling thread's source read (shallow clone of pingdotgg/t3code at `09a54f01`), not from me. T3 is one entry here, not the baseline.

**Coverage.** 27 products looked at, 21 with screenshots, 39 images. No public visual found for Zed's thread list, Gmail, Slack Activity, Notion inbox, Arc (site retired) or Height (shut down).


## Agent and coding tools


### T3 Code

- [`visual/t3code-1.png`](visual/t3code-1.png): sidebar crop. Source: https://t3.codes/_astro/app-desktop.BHuzLVLF_2cuoG0.webp
- [`visual/t3code-2.png`](visual/t3code-2.png): full app. Source: https://t3.codes

- **At rest:** Project tag + age on top, title, branch underneath; a status pill (Done, Waiting 18s) only when one applies. Source read by a sibling (t3code @ 09a54f01): the base row is one line, 36px, time on the right (`apps/web/src/components/sidebar/SidebarThreadRow.tsx:1218-1330`); the marketing shot shows a richer 3-line row.
- **On hover / open:** Hover swaps the time for row actions (same file). One pill per row, picked by priority (`apps/web/src/components/Sidebar.logic.ts:1091-1190`).
- **Quieting:** Running and settled threads drop to 32px muted shelves pinned at the bottom: `Working 1 ›`, `Settled 43 ›` (`SidebarListMarkers.tsx:113`).
- **Density (~800px):** ~14 rows of the 3-line variant; ~22 of the 36px row (*inferred*).
- **Worth stealing:** Bottom shelves that turn running and done work into one counted line each.
- **Falls short:** Rows are still a thread list, not a queue: nothing says what the thread wants from you beyond the pill.

### Conductor

- [`visual/conductor-1.png`](visual/conductor-1.png): sidebar crop. Source: https://www.conductor.build/conductor-app-hero-dark.webp
- [`visual/conductor-2.png`](visual/conductor-2.png): full app. Source: https://www.conductor.build

- **At rest:** One line: title, collaborator avatars, age right-aligned. Bold title = unread (*inferred*); a thin green left rule marks some rows (meaning not stated on the page).
- **On hover / open:** "Ready to merge" + Merge button and the changed-file list live in the open workspace's header, not the row.
- **Quieting:** No running shelf; quiet by being monochrome. `View all →` caps the list.
- **Density (~800px):** ~26 rows.
- **Worth stealing:** Evidence lives one click away in a right panel: PR state + Changes 74 + Checks tabs.
- **Falls short:** Row gives no hint of which workspace needs you; you have to open each.

### Plannotator Inbox

- [`visual/plannotator-1.png`](visual/plannotator-1.png): list crop (README). Source: https://github.com/backnotprop/plannotator/raw/main/.github/assets/inbox-dark.webp
- [`visual/plannotator-2.png`](visual/plannotator-2.png): full inbox. Source: https://github.com/backnotprop/plannotator

- **At rest:** Section header per need with count (Stopped on you 1, Holding up work 2, Waiting on you 1, New since you looked 3). Row: project + time, then a colored chip (red Stopped, amber Holds up 2) + agent icon + title.
- **On hover / open:** The question, options and attachment render in the reading pane; `Mark read E` in its toolbar.
- **Quieting:** "New since you looked" rows have no chip, so they read as lower priority without a separate tab.
- **Density (~800px):** ~15 rows.
- **Worth stealing:** Sections named by what the agent needs from you, in plain words, with a chip only on the urgent tiers.
- **Falls short:** Needs a reading pane; at 280px the chip + title row truncates fast.

### Vibe Kanban

- [`visual/vibekanban-1.png`](visual/vibekanban-1.png): board. Source: https://www.vibekanban.com/cdn-cgi/image/width=1920/images/cta-product-desktop.webp
- [`visual/vibekanban-2.png`](visual/vibekanban-2.png): workspace popover. Source: https://www.vibekanban.com/cdn-cgi/image/width=750/images/feature-parallel-agents.png

- **At rest:** Kanban cards (To do / In progress / In review / Done). The attached workspace shows as a mini-row: `••• just now · 5 files +3584 -16`.
- **On hover / open:** Workspace detail opens in a right panel with Active badge and "No PR created".
- **Quieting:** Columns separate states; older workspace rows fade (popover).
- **Density (~800px):** Board, not a list; ~4 cards per column.
- **Worth stealing:** The diffstat mini-row (`3 Files +300 -136`) as compact evidence under a title.
- **Falls short:** A board does not fit a 280px sidebar at all.

### Cursor (Agents view, 2.0)

- [`visual/cursor-1.png`](visual/cursor-1.png): sidebar, frame of the 2.0 launch video on cursor.com/blog/2-0. Source: https://image.mux.com/2W2j2u1tbSRruMvH2397JtYaL1bTPE1zC022EUELcrTU/thumbnail.png?time=40
- [`visual/cursor-2.png`](visual/cursor-2.png): agent + review pane. Source: https://cursor.com/blog/2-0

- **At rest:** Three groups: IN PROGRESS, OLDER, ARCHIVED. In-progress row is a raised card with a second line `1 of 3 Models completed` and spinner; older rows are one muted line with branch icon + `4d`.
- **On hover / open:** Per-model results (files, +/-), to-dos, and Review/Apply live in the open agent.
- **Quieting:** Older work is gray text; archived collapses to a header.
- **Density (~800px):** ~12 rows.
- **Worth stealing:** Only running work gets a card; everything else is one gray line.
- **Falls short:** Nothing marks "needs you"; finished vs. waiting are both just "Older".

### OpenAI Codex app

- [`visual/codex-1.png`](visual/codex-1.png): sidebar, frame at 26s of the video on learn.chatgpt.com/docs/app. Source: https://cdn.openai.com/devhub/videos-learn/proactive-teammate-v2-1080p-v1.mp4
- [`visual/codex-2.png`](visual/codex-2.png): full app. Source: https://learn.chatgpt.com/docs/app

- **At rest:** Nav (New chat, Search, Plugins, Pull requests, Automations 7), then Pinned threads with a schedule icon + age, then Threads: one line title + age.
- **On hover / open:** Thread body says "One thing needs attention" — the attention lives inside the thread, not on the row.
- **Quieting:** No color at all in the list. Ages are the only signal.
- **Density (~800px):** ~22 rows.
- **Worth stealing:** The calmest row in the field: title + age, nothing else.
- **Falls short:** Too calm for triage: no way to tell a blocked thread from a finished one without opening it.

### Devin

- [`visual/devin-1.png`](visual/devin-1.png): sidebar, frame at 20s of the intro video on docs.devin.ai/get-started/devin-intro. Source: https://mintcdn.com/cognitionai/iH03e_G1Q4XPL5Ez/images/get-started/devin-docs-new-intro.mp4
- [`visual/devin-2.png`](visual/devin-2.png): full app. Source: https://docs.devin.ai/get-started/devin-intro

- **At rest:** Session title, then one orange line `Approval required · ⎇1` (PR count).
- **On hover / open:** "Action required: Approve skill save" banner sits above the composer in the session.
- **Quieting:** The only color in the sidebar is the ask; everything else is gray.
- **Density (~800px):** ~20 rows (*inferred*: the demo has one session).
- **Worth stealing:** The reason line *is* the status: colored words instead of a chip or icon.
- **Falls short:** Demo shows one session; no public view of how it scales.

### Claude Code desktop

- [`visual/claude-code-1.png`](visual/claude-code-1.png): sidebar, frame at 2.5s of the video embedded in claude.com/resources/articles/claude-code-desktop-redesign. Source: https://www.youtube.com/watch?v=rWaQSQEm_aY
- [`visual/claude-code-2.png`](visual/claude-code-2.png): full app. Source: https://claude.com/resources/articles/claude-code-desktop-redesign

- **At rest:** Pinned and Recents, one line each, no time, a small glyph for the running one.
- **On hover / open:** Tasks, diff, terminal and plan open as panes on the right.
- **Quieting:** No status on idle rows at all.
- **Density (~800px):** ~28 rows.
- **Worth stealing:** Pinned on top of Recents, both one line; nothing else.
- **Falls short:** The public frame shows no needs-you state; whatever the sidebar does there is not visible in the launch video.

### Google Jules

- [`visual/jules-1.png`](visual/jules-1.png): task list, from jules.google/docs/tasks-repos/. Source: https://jules.google/docs/_astro/delete1.Bxt2fzxA_Z1mgDWM.webp

- **At rest:** Full-width task rows: prompt text, then a one-line status (`Jules is waiting for you to review`, orange `Needs clarification`, `This task is paused`, `Failed`). Right side: a pill (`Ready for review`, `Paused`), a progress bar, or a red ! icon.
- **On hover / open:** Delete/pause appear on hover (the red box in the doc).
- **Quieting:** Paused and failed rows stay in the list; no grouping.
- **Density (~800px):** ~10 rows.
- **Worth stealing:** Status as a sentence written to you ("waiting for you to review").
- **Falls short:** Unsorted: the one that needs clarification sits between running ones.

### GitHub Copilot coding agent

- [`visual/copilot-1.png`](visual/copilot-1.png): Agents tab list crop, from github.blog/changelog/2026-01-26-introducing-the-agents-tab-in-your-repository/. Source: https://github.com/user-attachments/assets/cbf6faf4-acab-4441-b3dd-2436b4af642b
- [`visual/copilot-2.png`](visual/copilot-2.png): Sessions list, same post. Source: https://github.blog/wp-content/uploads/2026/01/540637404-350e07e0-b78a-4760-8964-1f7901b681f5.jpg
- [`visual/copilot-3.png`](visual/copilot-3.png): agent sessions popover, github.blog/changelog/2025-10-28-a-mission-control-to-assign-steer-and-track-copilot-coding-agent-tasks/. Source: https://github.com/user-attachments/assets/1dffaa3b-ff6f-4c6e-a8aa-964841ea6725

- **At rest:** Two lines: status icon (green check / amber spinner) + title, then `2h · Ready for review`. Sessions list adds PR number and a +/- diffstat bar on the right.
- **On hover / open:** Log, diff and "View pull request" open in the main pane.
- **Quieting:** Sessions split into `Active 32` / `Done 12` tabs.
- **Density (~800px):** ~14 rows.
- **Worth stealing:** "Ready for review" as the default end state; diffstat bar as inline evidence.
- **Falls short:** Everything finished says "Ready for review"; nothing ranks them.

### Sculptor (Imbue)

- [`visual/sculptor-1.png`](visual/sculptor-1.png): sidebar crop, from imbue.com/sculptor/. Source: https://cdn.sanity.io/images/dg1xe82e/production/eebdf19df9bff932a91498bf286020da8bb3be96-1920x1080.gif
- [`visual/sculptor-2.png`](visual/sculptor-2.png): full app. Source: https://imbue.com/sculptor/

- **At rest:** Green dot + title, then `56 mins ago · sculptor/branch-name`.
- **On hover / open:** Merge / Pairing Mode buttons and the Changes diff on the right.
- **Quieting:** Every row looks the same; dot color is the only state.
- **Density (~800px):** ~22 rows.
- **Worth stealing:** Branch name in the muted second line — it is what you actually recognise work by.
- **Falls short:** Uniform rows; a dot alone carries all of the state.

### Amp

- [`visual/amp-1.png`](visual/amp-1.png): sidebar, frame at 10s of the video on ampcode.com. Source: https://static.ampcode.com/docs/day-to-day-in-amp-screen-1080-v2.mp4
- [`visual/amp-2.png`](visual/amp-2.png): full app. Source: https://ampcode.com

- **At rest:** One line per thread with an agent avatar; small right-side glyphs (pin, edit, a ! badge). Projects as one-line rows with counts.
- **On hover / open:** Actions on hover (*inferred* from the glyphs).
- **Quieting:** Bottom buckets: `Inactive Last 72h 0`, `Snoozed 5`, `Archived` — old and snoozed work becomes one counted line.
- **Density (~800px):** ~30 rows.
- **Worth stealing:** Snoozed and Inactive as counted buckets at the foot of the list.
- **Falls short:** Small, low-contrast glyphs; hard to see which thread needs you at a glance.

### Factory (desktop)

- [`visual/factory-1.png`](visual/factory-1.png): sidebar, frame at 15s of the video on factory.ai. Source: https://factory.com/videos/desktop-overview.mp4
- [`visual/factory-2.png`](visual/factory-2.png): full app. Source: https://factory.ai

- **At rest:** SESSIONS grouped by project (collapsible). One line: orange dot for live work + title + age (`Now`, `2m`, `1h`).
- **On hover / open:** Plan steps and diff in the session.
- **Quieting:** Collapsed projects (backend, local-demos) hide their rows entirely.
- **Density (~800px):** ~30 rows.
- **Worth stealing:** Dot only on live rows; idle rows have no glyph at all.
- **Falls short:** Dot means "active", not "needs you".

### Zed agent panel

No public visual of the thread-history list; zed.dev/agentic only shows the review panel. Skipped.


## Inboxes and triage


### Linear Inbox

- [`visual/linear-1.png`](visual/linear-1.png): official docs image. Source: https://linear.app/docs/inbox

- **At rest:** Avatar with a small action badge, title (blue dot if unread), then `Didier assigned the issue to you`; status icon + age on the right.
- **On hover / open:** Snooze/delete etc. on hover and keyboard (docs).
- **Quieting:** Read rows fade in steps; `Priority 4` / `Other 12` tabs keep low-value notifications out of the first view.
- **Density (~800px):** ~12 rows.
- **Worth stealing:** Fading read rows: the list ages visually instead of moving.
- **Falls short:** Avatar + badge + status icon is three glyphs per row; heavy at 280px.

### GitHub notifications

- [`visual/github-1.png`](visual/github-1.png): bulk triage, docs.github.com/…/managing-notifications-from-your-inbox. Source: https://raw.githubusercontent.com/github/docs/main/assets/images/help/notifications-v2/triage-multiple-notifications-together.png
- [`visual/github-2.png`](visual/github-2.png): row with hover actions, same docs. Source: https://raw.githubusercontent.com/github/docs/main/assets/images/help/notifications-v2/save-triaging-option.png

- **At rest:** Repo + number, title, type icon; a reason label (`mention`) on the right.
- **On hover / open:** Hover shows Done ✓, Unsubscribe, Save. Checkbox selects for bulk `Done`.
- **Quieting:** Done removes it; `is:done` keeps an audit trail.
- **Density (~800px):** ~16 rows.
- **Worth stealing:** The reason label (why this is in your inbox) as plain gray text at the row's end.
- **Falls short:** Hover-only actions; nothing works on touch without opening.

### Superhuman

- [`visual/superhuman-1.png`](visual/superhuman-1.png): Split Inbox image. Source: https://superhuman.com/products/mail

- **At rest:** One line: sender | colored label chip | subject + gray preview. Selected row has a left accent bar.
- **On hover / open:** Everything else via keyboard (E = done).
- **Quieting:** Split Inbox tabs with counts: `Important 7 · Calendar 3 · Docs 8 · Other 1`.
- **Density (~800px):** ~20 rows.
- **Worth stealing:** Tabs that are just words + counts; the count *is* the summary.
- **Falls short:** One-line row assumes a wide window; at 280px the preview disappears.

### HEY

- [`visual/hey-1.png`](visual/hey-1.png): Imbox, hey.com/how-it-works/. Source: https://www.hey.com/assets/images/how-it-works/imbox.webp
- [`visual/hey-2.png`](visual/hey-2.png): Paper Trail. Source: https://www.hey.com/assets/images/how-it-works/paper-trail.webp
- [`visual/hey-3.png`](visual/hey-3.png): Reply Later stack. Source: https://www.hey.com/assets/images/how-it-works/reply-crop.webp

- **At rest:** Imbox: `NEW FOR YOU` (orange dot rows on white) above `PREVIOUSLY SEEN` (on gray). Paper Trail is the same row with no dots.
- **On hover / open:** Reply Later and Set Aside are card piles pinned at the bottom; tapping fans them out into "Focus & Reply".
- **Quieting:** Receipts and newsletters go to separate places (Paper Trail, The Feed) and never hit the Imbox.
- **Density (~800px):** ~10 rows.
- **Worth stealing:** "New for you / Previously seen" with a background change, not a badge.
- **Falls short:** Big rows, built for email; wastes space at 280px.

### Front

- [`visual/front-1.png`](visual/front-1.png): homepage, "stay in control" image. Source: https://front.com

- **At rest:** AI-suggested actions as cards: title, quoted proposal, `Needs info / check first · 19 replies`, then `Approve / Discard / Edit manually`.
- **On hover / open:** Buttons are always visible on the card.
- **Quieting:** Done cards fade behind with a check.
- **Density (~800px):** ~3 cards.
- **Worth stealing:** Approve / Discard / Edit on the item itself: a sign-off is one tap.
- **Falls short:** Cards are tall; only the top item fits a sidebar.

### Missive

- [`visual/missive-1.png`](visual/missive-1.png): list crop, missiveapp.com. Source: https://cdn.prod.website-files.com/66c7823b4706f4a0a95d2d31/69c41cd3b235ee600732da9c_2603-img-sharedinbox.png
- [`visual/missive-2.png`](visual/missive-2.png): full app. Source: https://missiveapp.com

- **At rest:** Sender + time, subject, a third line with the open task (`[ ] Follow up with Sarah`) and a label; checklist progress `0/2`.
- **On hover / open:** Conversation + team chat in the reading pane.
- **Quieting:** Colored left border per team; `Today` / `Yesterday` headers.
- **Density (~800px):** ~10 rows.
- **Worth stealing:** A third line that shows the next to-do, not the preview.
- **Falls short:** Four kinds of metadata per row; busy.

### Gmail, Slack Activity, Notion inbox

No usable public image captured: Gmail not attempted for lack of time; Slack's help-center images did not load headless; Notion's inbox help page only has an illustration.


## Calm lists


### Things 3

- [`visual/things-1.png`](visual/things-1.png): Today, culturedcode.com/things/features/. Source: https://static.culturedcode.com/things/videos/2017-05-18-website-videos/2-today-mac.png
- [`visual/things-2.png`](visual/things-2.png): Headings. Source: https://static.culturedcode.com/things/videos/2017-05-18-website-videos/4-headings-mac.png

- **At rest:** Checkbox + title; project in tiny gray below; one red `today` flag where it matters.
- **On hover / open:** Notes/checklists open in place.
- **Quieting:** `This Evening` section lowers the rest of the day without hiding it.
- **Density (~800px):** ~16 rows.
- **Worth stealing:** A circle you tick: clearing is a physical gesture on the row.
- **Falls short:** No status beyond done/not done.

### Raycast

- [`visual/raycast-1.png`](visual/raycast-1.png): Reminders extension image on raycast.com. Source: https://www.raycast.com

- **At rest:** Section header + count (`Overdue 1 reminder`, `Today`, `Upcoming Oct 29`); one-line rows with a muted accessory on the right.
- **On hover / open:** Action panel on ⌘K.
- **Quieting:** Headers do the ranking; rows are identical.
- **Density (~800px):** ~24 rows.
- **Worth stealing:** Header + count inline in one line, tiny and gray.
- **Falls short:** Keyboard-first; no touch affordance.

### Arc, Height

Arc: arc.net is now a farewell page and its help center sits behind a Cloudflare check headless. Height: shut down, height.app unreachable. Skipped.


## Directions for a 280px Inbox

Each is concrete enough to build as one variant of the #5 rework. They differ in how loud they are, not only in layout.


### A. Paper (Quietest)

**Bet:** Quiet wins: an inbox you can glance at without it shouting.  
**From:** HEY Imbox + Linear fading + Codex. Screenshots: [`hey-1.png`](visual/hey-1.png), [`linear-1.png`](visual/linear-1.png), [`codex-1.png`](visual/codex-1.png)

Two sections by background, not badges: **New for you** (white, 6px accent dot) and **Seen** (gray band, text at 60%). Row = 2 lines at 13/12px: title, then a muted reason (`asked you a question`, `finished · +120 −8 · tests ✓`). Time right. No chips, no icons. Running work is one gray line at the very bottom: `4 running`. Verify lives in the opened thread.


### B. Ask chips (Medium)

**Bet:** Say what the thread wants in words, and color only that word.  
**From:** Plannotator + Jules + Devin. Screenshots: [`plannotator-1.png`](visual/plannotator-1.png), [`jules-1.png`](visual/jules-1.png), [`devin-1.png`](visual/devin-1.png)

Sections named by need with counts (`Needs your answer 2`, `Broken 1`, `Ready to verify 5`, `FYI 3`). Row = 2 lines: project · age, then a small chip (red Blocked, amber Approve plan, green Verify) + title. Only tiers 1–2 get saturated color; Verify chips are outlined, FYI rows have none.


### C. Count tabs (Dense)

**Bet:** Show one tier at a time; the counts are the overview.  
**From:** Superhuman Split Inbox + Linear Priority/Other + Copilot Active/Done. Screenshots: [`superhuman-1.png`](visual/superhuman-1.png), [`linear-1.png`](visual/linear-1.png), [`copilot-2.png`](visual/copilot-2.png)

Segmented text strip at the top: `Needs you 3 · Verify 5 · FYI 2` (current one bold). One-line 28px rows below: status glyph + title + age; diffstat (`+120 −8`) right-aligned on Verify rows. ~25 rows in 800px. Running = count in the strip (`· 4 running`), never rows.


### D. Shelves (Quiet)

**Bet:** Keep one flat queue; push everything that isn't for you into counted shelves at the foot.  
**From:** Amp buckets + T3 shelves + Cursor In progress/Older. Screenshots: [`amp-1.png`](visual/amp-1.png), [`t3code-1.png`](visual/t3code-1.png), [`cursor-1.png`](visual/cursor-1.png)

Flat list ranked by tier, one line each, a 6px tier dot. Pinned to the bottom: `Running 4 ›`, `Snoozed 2 ›`, `Verified today 6 ›` as 28px muted rows that expand in place. The queue scrolls; the shelves never do.


### E. Top card (Loudest)

**Bet:** Put the next sign-off in your hand; the rest wait as a stack.  
**From:** Front approve cards + HEY Reply Later stack + Conductor Ready to merge. Screenshots: [`front-1.png`](visual/front-1.png), [`hey-3.png`](visual/hey-3.png), [`conductor-2.png`](visual/conductor-2.png)

The top item renders as a card: title, reason, evidence lines (`+120 −8 · 3 files`, `checks ✓`, `2 children done`) and buttons `Verify` / `Later` / `Open`. Below it, the rest as one-line rows, slightly stacked. Verify advances to the next card; `Inbox zero` when empty.


### F. Just dots (control) (Quietest)

**Bet:** Maybe no new visual language is needed: the Threads row plus a dot is enough.  
**From:** Factory + Sculptor + Claude Code. Screenshots: [`factory-1.png`](visual/factory-1.png), [`sculptor-1.png`](visual/sculptor-1.png), [`claude-code-1.png`](visual/claude-code-1.png)

Inbox = the Threads row component, filtered to items, one line, with a colored 6px dot and a muted reason word at the end (`answer`, `failed`, `verify`). Nothing else changes. The cheapest build and the baseline the others must beat.


## What the field says, across products

- **Quiet comes from color discipline, not layout.** Codex, Claude Code, Sculptor and Factory are near-identical lists; Devin feels calmer than all of them because the *only* color in its sidebar is the ask (`Approval required`). Plannotator does the same with chips only on the top two sections.
- **Every product hides running/old work the same way: a counted line at the bottom.** T3 (`Working 1`, `Settled 43`), Amp (`Inactive Last 72h`, `Snoozed 5`, `Archived`), Cursor (`Older`, `Archived`), HEY (Reply Later stack). Nobody shows running work as rows in a triage view.
- **The status sentence beats the status icon.** Jules (`waiting for you to review`), Devin, Copilot (`2h · Ready for review`), Linear (`Didier assigned the issue to you`) all put a short line of words where others put a glyph. At 280px a muted second line reads better than three icons.
- **Evidence is almost never on the row.** Conductor, Cursor, Copilot and Front keep the diff, checks and approve buttons in the opened item. Only diffstat (`+300 −136`, Vibe Kanban, Copilot) is small enough to live on a row. Front is the one that puts Approve on the item itself.
- **Seen vs. new is done by fading, not by moving.** Linear fades read rows; HEY moves them under a gray "Previously seen" band. Both keep rows still under the cursor, which matters for "one item per thread, kept current".
- **Touch is an afterthought everywhere.** GitHub, Linear, T3 and Raycast put actions on hover or keyboard. The user reviews from a phone, so whichever direction wins needs visible tap targets (Front's buttons, Things' checkbox).

## Phone check

`visual/index.html` rendered headless at 390×844 (DPR 2, touch): single column, no horizontal page scroll (`scrollWidth` 390), 0 broken images. Screenshots: [`visual/_index-390x844-top.png`](visual/_index-390x844-top.png), [`visual/_index-390x844-directions.png`](visual/_index-390x844-directions.png).
