# Inbox prototype (throwaway)

UI prototype for [bb-plugin-inbox issue #5](https://github.com/KaviiSuri/bb-plugin-inbox/issues/5).
Lives on branch `prototype/inbox-ui` only; never merge it to `main`.

Plan: the six directions from `docs/research/visual-prior-art.md` (issue #8,
branch `research/visual-prior-art`), switchable by a tappable bar at the bottom
of bb's real sidebar, reading live `experimental_useSidebarThreads()`.

## Run it

```sh
bb plugin build prototypes/inbox-ui && bb plugin install ./prototypes/inbox-ui
```

Then Settings → Appearance → Sidebar → **Inbox prototype**. That setting is
server-synced (`sidebar.threadListProvider`), so it changes the sidebar in every
bb client; switch back to "Threads" (`thread-list/thread-list`) the same way.

## Use it

- Tabs at the top: **Threads** (a plain tree) | **Inbox**.
- Bottom bar: `‹ A · Paper ›` (cycles A, F, G), **fx** (fixtures on/off), `…` → reset Verify and Later.
  Everything is tappable; there are no keyboard shortcuts.
- Fixtures mix in fake threads: a plan review, a failing PR, a broken thread,
  a grilling child, a parent whose research children reported back, seen
  finished work, five running threads.
- **Verify** writes `{ verifiedBy, verifiedAt }` to localStorage. G has Verify on
  the tapped row; every variant also gets a **Verify** button in the open
  thread's header (shown only in a client whose sidebar is this prototype). The
  item returns when the thread's `latestAttentionAt` passes `verifiedAt`.
- Order and seen/new state freeze while you touch the list, and for 4 s after a tap.

## Variants

Rules held across all six: colour only on what needs you (amber request, red
broken); running work is one counted line at the bottom, never rows; words over
icons, at most a diffstat at rest; no hover-only actions; ≥40px rows on touch.

After review the user kept A and F and asked for a blend, G. B–E (Ask chips,
Count tabs, Shelves, Top card) are at commit `82e9e1d` on this branch.

| Key | Name | Bet |
|---|---|---|
| A | Paper | Quietest. New for you / Seen band; two-line row: title, muted reason. Verify in the thread header. |
| F | Just dots | Control. The Threads row filtered to items, a dot and one muted word. |
| G | Paper dots | A's New / Seen structure with F's one-line row; tap a row for its reason line and Verify / Open. |

The running line and the switcher share one sticky footer, so the pill never covers it.

## Screenshots

`screenshots/{A,F,G}-phone.png` and `G-phone-open.png` (one row tapped open):
390×844, touch, sidebar drawer open, fixtures on. Taken in a headless bb web
client that rewrote only its own copy of `GET /api/v1/preferences/ui` to pick
this list and blocked writes to it, so the user's sidebar choice never changed.
