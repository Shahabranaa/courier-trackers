---
name: GitHub publishing history
description: Safeguards for publishing this workspace through the GitHub API.
---

Before creating a GitHub commit through the API, verify that the local commit parent exactly matches the current remote branch head and inspect the outgoing file list for automatically committed uploads.

**Why:** Workspace automation can create local commits for newly uploaded reference files. Publishing from that local parent can unintentionally include those assets or create a history conflict even when the remote branch has not changed.

**How to apply:** Rebase only the intended staged changes onto the remote head, leave reference uploads untracked when they are not deliverables, and never force-push to resolve a parent mismatch.