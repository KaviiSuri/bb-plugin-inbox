# A verified thread comes back showing only what's new

When a verified thread does more work, its item comes back once that work finishes, asks or fails (not while it runs), showing only the changes since the verification's diff base; what was already verified stays hidden but reachable. So every verification stores its diff base, not just a timestamp. If nothing changed since the base (only a report), the item comes back as FYI. Chosen by the user in the LOGIC prototype's story 3 over re-verifying the whole thread.
