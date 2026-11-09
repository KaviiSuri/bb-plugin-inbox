# A child's audience is inferred, never declared at spawn

The kickoff brief said a child's audience (`human` or `parent`) is set explicitly when it's spawned, with inference as a fallback. Research found `bb thread spawn` has no metadata flag (`origin/research/sdk-surface:docs/research/sdk-surface.md`), so declaring it would need our own command run after every spawn or an upstream bb change. The user chose inference only: the inbox decides a child's audience from what the child does, and spawners don't tag anything.

## Consequences

The inference rules carry the whole decision, so they must be explicit and visible (a wrong guess either buries a question for the human or floods the inbox with research children).
