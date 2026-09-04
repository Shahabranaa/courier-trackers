---
name: GitHub repository imports
description: Reliable transfer behavior for importing repositories through the connected GitHub API.
---

When importing a repository through the connected GitHub API, prefer a staged contents transfer with bounded concurrency and retries over a tarball download.

**Why:** The connector may reject archive downloads and GitHub can apply secondary throttling to a large burst of contents requests, even when the connection is healthy.

**How to apply:** Stage files outside the project, transfer missing files sequentially or in small batches with a short delay, verify completion, then replace the generated scaffold.