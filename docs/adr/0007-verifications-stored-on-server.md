# Verifications are stored by the plugin on the bb server

A verification (time, client, diff base) is written to plugin-owned storage on the bb server and pushed to every client, so verifying on the phone clears the item on the laptop. The prototype kept them in browser storage, which the user rejected because they review from more than one device. No user identity reaches a plugin (`docs/research/sdk-surface.md`), so a verification names the client, not a person.
