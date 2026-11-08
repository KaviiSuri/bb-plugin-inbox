# Brief: research the BB Plugin SDK surface for the inbox (issue #2)

Read `docs/briefs/_common.md` and `docs/brief.md` first.

**Branch:** `research/sdk-surface`. **Output:** `docs/research/sdk-surface.md`. Covers research questions 2 and 5 from `docs/brief.md`.

## Goal

The UI prototype runs **in the real sidebar** as a throwaway `experimental_threadList` provider reading live `experimental_useSidebarThreads()`. The logic prototype models inbox items from deterministic signals. Both need the exact, current SDK contract, confirmed against the installed SDK rather than remembered.

## Questions

1. **Thread list slot and hook.** Confirm `app.slots.experimental_threadList` registration and `PluginThreadListProps`, and every field of `PluginSidebarThread` (and `projects`, `sections`, `status`) that `experimental_useSidebarThreads()` returns, against the installed declarations. Scaffold a scratch plugin outside the repo (`cd /tmp && bb plugin new inbox-probe && cd bb-plugin-inbox-probe && bb plugin types`) and read the `@get-bb/plugin-sdk` `.d.ts` files. Quote the type with file + line. For each field, one line: what it means for the inbox (e.g. `hasPendingInteraction` → tier 1 "Blocked on you").
2. **Signals we can't get from that hook.** PR checks, a diff/changed files, test results, the last assistant message (for "did the turn end with a question or a report"), errors. Find which frontend hooks or `bb.sdk` calls give each (see the `frontend-pull-requests.md` and `git-reads.md` references of the `bb-plugin-authoring` skill).
3. **Persisting verification state.** "Clearing an item means the work is verified... record who verified it and when." What plugin storage, settings, thread metadata or RPC exists on server and frontend to store per-thread verification records, and to read them back in the list component? Which server-side events/hooks fire on thread status change or turn end, so items could be computed server-side?
4. **Spawn-time audience (question 5).** A child is `human` or `parent` audience, "set explicitly when the child is spawned". What thread metadata can a spawner set today (`bb thread spawn` flags, `bb.sdk.threads` create options, plugin metadata on a thread)? Can a plugin attach a key/value to a thread and read it in the sidebar? If nothing fits, say so and name the closest fallback (e.g. `parentNotifications`, a plugin-owned map keyed by thread id).

Use the `bb-plugin-authoring` skill (load its SKILL.md, then `frontend-registration.md`, `frontend-hooks-and-ui.md`, `backend-foundation.md`, `backend-sdk.md`, `backend-events.md` references). The installed SDK types win over the references when they disagree; note the disagreement.

## Axis of judgment

Precise and short. A prototype author should copy the type and the hook name straight out of it. A table of fields → inbox meaning, then one short section per question, each answer citing the `.d.ts` file/line or reference doc. End with "Gaps": signals the inbox needs that the SDK doesn't give.

## Scope

Write only `docs/research/sdk-surface.md` in this repo. The scratch plugin lives under `/tmp`; don't install it into bb.
