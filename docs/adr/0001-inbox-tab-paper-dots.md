# The Inbox tab uses "Paper dots": one-line rows under a New / Seen split

The user tried six visual directions in the real sidebar on their phone (prototype `prototype/inbox-ui`, B–E at `82e9e1d`, A/F/G at `80c1bad`) and picked G, "Paper dots". Each resting row is one line: a dot, the title, and one muted word for what it wants (answer / approve / failed / verify / fyi). Only answer and approve (amber) and failed (red) are coloured. Rows sit under "New for you", then a faded "Seen" band. Tapping a row opens its reason line and the evidence summary with visible Verify / Open buttons, one row at a time. Running work is one counted line at the bottom, never rows.

## Considered options

Tier lanes, chip-labelled sections, count tabs, a ranked feed with shelves, and a top focus card were all built and rejected as too crowded at sidebar width. The visual research (`origin/research/visual-prior-art:docs/research/visual-prior-art.md`) found colour, more than layout, decides how calm a list feels, and that evidence rarely belongs on a resting row. Hover- and keyboard-only actions are out: the user reviews on a phone.
