# Inbox

A sidebar tab that queues the agent work needing the human, so they always know what agents are doing and can verify it. The Threads tab is for browsing; the Inbox is for triage.

## Language

**Item**:
The one inbox entry for a thread, kept current as the thread changes. A running thread is never an item.
_Avoid_: notification, card, task

**Running count**:
The single counted line that stands in for every running thread.
_Avoid_: working shelf, active list

**Tier**:
An item's priority: Blocked on you, Broken, Verify, FYI, in that order. Each row shows it as one word (answer / approve / failed / verify / fyi).

**Blocked on you**:
The tier for a thread that can't continue without the human: a question, a permission, a plan to review.

**Broken**:
The tier for a thread that stopped on an error or got stuck. Failing PR checks are not Broken; that work stays under Verify.

**Verify**:
The tier for finished work with evidence to check: a diff, a PR, tests. Includes work whose PR checks are failing; the reason line says so.

**FYI**:
The tier for a report with nothing to verify, including a parent's summary of its `parent`-audience children. Opening it clears it.

**Evidence**:
What an item carries for the human to check: diffstat, PR checks, tests, child reports.

**Verification**:
The sign-off that clears a Verify item: when it happened, on which client, and the diff base it covered. Stored by the plugin on the bb server, so it syncs across the human's devices. Clearing a Verify item always means it was verified, never dismissed.
_Avoid_: dismiss, done, archive, mark read

**Coming back**:
A verified thread that did more work re-enters the inbox when that work finishes, asks or fails, showing only what changed since the verification's diff base. It also comes back under Verify, with no new work, when its PR checks start failing after the verification.

**Audience**:
Who a child thread answers to, inferred from what the child does (never declared at spawn). A `human` child gets its own item; a `parent` child folds into its parent's FYI item.

**Later**:
Puts an item out of sight without verifying it, until its thread has something new (finishes, asks or fails). It is not a clear.
_Avoid_: snooze, dismiss

**New for you / Seen**:
The two bands of the Inbox tab. An item moves to Seen once its thread has been opened; it stays until it's verified (or, for FYI, cleared by that opening).
