# Brief: research prior art for an agent "attention queue" (issue #1)

Read `docs/briefs/_common.md` and `docs/brief.md` first.

**Branch:** `research/prior-art`. **Output:** `docs/research/prior-art.md`. **Model judgment wanted:** taste and synthesis, not an exhaustive catalogue.

## Goal, in the human's words

"The human should always know what agents are doing and be able to verify it. Work shows up as a queue of inbox items to clear." This research feeds two prototypes that come right after it: a LOGIC state machine (item lifecycle, tiers, clearing) and a set of radically different UI variants for the Inbox tab. It is input, not decisions. Keep it short and get it back fast.

## Corrections already made (don't rebuild these)

- "T3 sidebar" means the sidebar in the **T3 Code app**, https://github.com/pingdotgg/t3code (MIT). Read its source. It is **not** the SawyerHood `t3sidebar` BB plugin; ignore that plugin entirely.

## What to cover

For each of: T3 Code's sidebar (from source), Plannotator's inbox, Conductor, Linear's inbox, GitHub notifications, Superhuman / inbox-zero triage, plus at most two other agent-orchestration attention-queue UIs you find worth it. Answer four things each:

1. What counts as an item (and is it one per thread/issue, or one per event)?
2. How are items ordered or grouped?
3. What clears an item, and can it come back? (Our model: clearing = the work is verified, a sign-off, not a dismissal.)
4. How is noise kept down (running work, low-value updates, batching)?

Then one section: **"Ideas for our prototypes"**. For the UI: 3 to 5 structurally different Inbox layouts the prior art suggests (e.g. Superhuman-style one-at-a-time focus, Linear-style list with a preview, grouped-by-tier lanes). For the logic: the concrete behaviours worth copying or rejecting for re-surfacing verified items with new work, and for collapsing running work to a count.

## Axis of judgment

I judge this on whether a prototype author can act on it in ten minutes: a comparison table up top (rows = products, columns = the four questions), short sections below, every claim cited. Two pages at most. Screenshots are welcome only as links to the source.

## Where authority ends

Prior art describes other products. It doesn't decide ours; the brief's decided list does. Flag where prior art argues against a decided point rather than quietly assuming it.
