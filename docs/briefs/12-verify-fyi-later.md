# Brief: Verify and FYI items, server-stored Verification, and Later (issue #12)

Read `docs/briefs/_common.md`, `docs/brief.md`, `CONTEXT.md`, `docs/adr/` (0004, 0005, 0007), the spec (#9), `docs/fork.md`, and issue #12. Load `/implement`, `/tdd`, `/code-review` and `bb-plugin-authoring` (`git-reads.md`, `frontend-pull-requests.md`, `backend-foundation.md`, `backend-events.md`, `testing.md`). The issue's acceptance criteria are the contract.

**Branch:** `feat/12-verify-fyi-later` off `main` (#11 is merged: `app/inbox/model.ts` is the seam). Open a draft PR into `main`; don't merge it.

## One structural change, first commit

After this ticket, #13 (coming back) and #14 (child audience) will run **in parallel**, both adding rules to the inbox model. So before adding your rules, split `app/inbox/model.ts` into one module per concern behind the same `deriveInbox(snapshot) → view` entry, with tests split the same way, e.g. `app/inbox/model/{index,running,blocked,broken,verify,fyi,later}.ts` plus their `*.test.ts`. The composition in `index.ts` should be the only file both later tickets need to touch, and only by a line each. A pure move with all tests green, as its own commit. Your shape; that's the property.

## Running beside other work

Thread for #18 (classifier server half, `feat/18-classifier-server`) is working in `server/classifier/` and adds registration lines to `server.ts`. Put your server code in `server/verification/` and touch `server.ts` with registration lines only, so the two merge cleanly. Add every upstream file you touch to `docs/fork.md`'s list.

## What I'll judge it on

1. Every rule owned by a named test: I'll break Verify vs FYI by evidence, failing checks staying under Verify (ADR 0005), a Verification clearing the item, FYI cleared by opening, opening a Verify item moving it to Seen without clearing, Later until the next attention, the RPC round trip over JSON, and the realtime publish, and expect a failure each time.
2. Clear always means verified (ADR 0004 is the one exception). Verify is offered only on Verify items.
3. Variant G's calm: evidence never on a resting row; the opened row shows the diffstat, PR checks and visible Verify / Later / Open buttons, ≥40px.

## Running it, and the human-owned resources

Install your build over the current `inbox` plugin (`bb plugin build . && bb plugin install .`); it's yours to replace. For "verifying in one client clears it in another", use two headless `bb browser-automation` sessions; don't touch the user's sidebar choice or their real threads' state beyond what a Verify on a scratch thread you spawn yourself writes (archive that scratch thread after). `agent_browser` doesn't work here.

## Done means

Committed, pushed, draft PR open with the phone screenshot and test summary, link in your report. Ask the user directly in your thread for any decision the ADRs don't settle.
