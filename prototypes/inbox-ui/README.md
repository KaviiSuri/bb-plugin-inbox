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
- Bottom bar: `‹ A · Paper ›`, **fx** (fixtures on/off), `…` → reset Verify and Later.
  Everything is tappable; there are no keyboard shortcuts.
- Fixtures mix in fake threads: a plan review, a failing PR, a broken thread,
  a grilling child, a parent whose research children reported back, seen
  finished work, five running threads.
- **Verify** writes `{ verifiedBy, verifiedAt }` to localStorage. D and E have
  Verify on the item; every variant also gets a **Verify** button in the open
  thread's header (shown only in a client whose sidebar is this prototype). The
  item returns when the thread's `latestAttentionAt` passes `verifiedAt`.
- **Later** (D, E) snoozes until the thread has something new.
- Order and seen/new state freeze while you touch the list, and for 4 s after a tap.

## Variants

Rules held across all six: colour only on what needs you (amber request, red
broken); running work is one counted line at the bottom, never rows; words over
icons, at most a diffstat at rest; no hover-only actions; ≥40px rows on touch.

| Key | Name | Bet |
|---|---|---|
| A | Paper | Quietest. New for you / Seen band; two-line row: title, muted reason. Verify in the thread header. |
| B | Ask chips | Sections named by need; a chip says what it wants, filled only for tiers 1–2. |
| C | Count tabs | One tier at a time; `Needs you 3 · Verify 6 · FYI 2` is the overview; dense one-line rows. |
| D | Shelves | One flat queue with dots; tap a row for reason + Verify / Open / Later; Running / Snoozed / Verified today shelves pinned at the foot. |
| E | Top card | Loudest. The next item as a card with evidence and buttons; the rest a stack of one-line rows. |
| F | Just dots | Control. The Threads row filtered to items, a dot and one muted word. |

## Screenshots

`screenshots/<variant>-desktop.png` (sidebar crop at 1280×900) and
`screenshots/<variant>-phone.png` (390×844, touch, sidebar drawer open), all with
fixtures on, taken in a headless bb web client that rewrote only its own copy of
`GET /api/v1/preferences/ui` to pick this list and blocked writes to it, so the
user's server-synced sidebar choice never changed. D's shots have one row selected.
