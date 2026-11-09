# How a child's audience is inferred

Following ADR 0006, a child counts as `human`-audience, and gets its own item, when it:
- asks a question through a question form (a pending user-question interaction),
- has a plan for the human to review (a pending plan interaction),
- uses the grilling skill, or
- ends its turn with a plain-text question to the user.

The last two need the cheap classifier model to read the turn. Everything else stays on the parent's item.

A permission prompt deliberately does **not** make a child human-audience. Parent agents can resolve a child's permission themselves (`bb thread interactions grant|deny`), and bb wakes the parent when a child is blocked on one, so it's the parent's job, not the human's.

If the parent's turn ends and a child is still waiting on a permission, the prompt surfaces on the parent's item as `approve`, naming the child's prompt with a way to open it. Until then it stays with the parent agent.
