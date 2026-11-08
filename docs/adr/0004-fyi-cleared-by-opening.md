# FYI items clear when opened, the one exception to clear = verified

Clearing an item means the work was verified, but a report with no diff, PR or tests has nothing to verify; under verify-only it could never leave the inbox (LOGIC prototype, story 6). The user chose that opening an FYI item clears it. Anything under Verify still needs an explicit sign-off; this exception doesn't extend to "mark seen" for work with evidence.

## Considered options

A Verify with no evidence (a sign-off on the report itself) and keeping evidence-free reports out of the inbox entirely were both rejected.
