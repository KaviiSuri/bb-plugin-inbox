# Brief: turn-end classifier, server half (issue #18)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/` (especially 0008, 0009), the spec (#9), `docs/fork.md`, and issue #18. Load `/implement`, `/tdd`, `/code-review` and `bb-plugin-authoring` (`backend-events.md`, `backend-sdk.md`, `backend-cli-agents.md`, `testing.md`). The issue's acceptance criteria are the contract.

**Branch:** `feat/18-classifier-server` off `main`. Open a draft PR into `main`; don't merge it.

## Running beside other work

Another thread is on #11 (`feat/11-inbox-tabs`, app side: `app/inbox/`, `app.tsx`, `shared/preferences.ts`) and #12 will follow it, adding server-stored Verifications. Keep out of their way:
- Put all your code in a new `server/classifier/` directory. Touch `server.ts` with registration lines only, and `package.json` only for the setting. Don't touch `app/` or `shared/preferences.ts`.
- Add every upstream file you touch to `docs/fork.md`'s list.

## What I'll judge it on

1. The heuristic and the server flow are owned by tests: I'll break each path (helper spawned hidden on the configured provider/model, its answer stored, fallback with no provider, on failure, on timeout, grilling detection, startup reconcile, helpers excluded, RPC by id) and expect a named test to fail.
2. Helper threads never leak: hidden, archived after use, never classified themselves, never in the sidebar.
3. Never spends the user's tokens by surprise: no provider set means heuristic only. Don't configure a provider in the user's bb; test the live path with your own scratch setting value only if you need to, then unset it.

## Human-owned resources

The `inbox` plugin installed in the user's bb is #11's build; don't reinstall over it. Verify yours with `bb plugin build .` and the fake host. The provider-picker screenshot comes from a headless `bb browser-automation` session; change nothing in the user's settings.

## Done means

Committed, pushed, draft PR open with test summary and screenshot, link in your report. Ask the user directly in your thread for any decision the ADRs don't settle.
