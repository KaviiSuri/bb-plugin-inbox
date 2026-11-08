# Inbox prototype (throwaway)

UI prototype for [bb-plugin-inbox issue #5](https://github.com/KaviiSuri/bb-plugin-inbox/issues/5).
Lives on branch `prototype/inbox-ui` only; never merge it to `main`.

Plan: four structurally different Inbox tab designs, switchable by a floating
bar at the bottom of bb's real sidebar, reading live `experimental_useSidebarThreads()`.

## Run it

```sh
bb plugin build prototypes/inbox-ui && bb plugin install ./prototypes/inbox-ui
```

Then Settings → Appearance → Sidebar → **Inbox prototype**. That setting is
server-synced (`sidebar.threadListProvider`), so it changes the sidebar in every
bb client; switch back to "Threads" (`thread-list/thread-list`) the same way.

## Use it

- Tabs at the top: **Threads** (a plain tree) | **Inbox**.
- Bottom bar: `←  A — Tier lanes  →`, **Fixtures on/off**, `…` → reset verifications.
  `←`/`→` cycle variants once the list has focus: click an empty spot in it
  first, because bb's composer usually holds focus and keys never fire in a
  text field. Variant C adds `V` / `L` / `O`.
- Fixtures mix in fake threads: a pending plan review, a failing PR, a grilling
  child, a parent whose research children reported back, five running threads.
- **Verify** stores `{ verifiedBy, verifiedAt }` in localStorage
  (`bb.inbox-prototype.verifications.v1`) and the item clears. It returns when
  the thread's `latestAttentionAt` passes `verifiedAt`.
- Order freezes while the pointer is over the list and re-sorts when it leaves.

## Variants

| Key | Name | Bet |
|---|---|---|
| A | Tier lanes | The tier is the structure. Folding lanes, bold count on new arrivals, Running shelf pinned to the bottom. |
| B | Ranked feed | Density. One list, tier as a glyph, a row expands in place with its evidence and Verify / Open. |
| C | One at a time | Triage is a session. One card with full evidence, Verify (V) / Later (L) / Open (O), then Inbox zero. |
| D | Attention tree | Context beats a queue. The thread tree filtered to what needs you, urgency dots rolling up through parents. |

Classifier (`inbox/model.ts`) is deliberately rough: pending interaction → 1,
error / failed queue / waiting-for-host → 2, idle and (unread or has a diff/PR)
→ 3, a parent with finished `parent`-audience children → 4. Audience is
inferred: `lifecycleOwnerThreadId` or `parentNotifications: "auto"` → `parent`.

## Screenshots

`screenshots/variant-{A,B,C,D}.png` and `screenshots/threads-tab.png`, taken
with fixtures on in a headless bb web client. That session rewrote only its own
copy of `GET /api/v1/preferences/ui` to pick this list and blocked every write
to it, so the user's server-synced sidebar choice never changed.
