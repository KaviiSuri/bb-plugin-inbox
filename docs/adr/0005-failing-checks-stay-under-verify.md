# Failing PR checks keep work under Verify, not Broken

Finished work whose PR checks fail shows the grey "verify" word, with the failing checks in its reason line; it doesn't turn red as Broken. Broken is only for a thread that stopped on an error or got stuck. The LOGIC prototype had put failing checks under Broken; the user chose Verify, keeping red for agents that need restarting rather than work that needs judging.
