---
name: Neon bulk writes
description: Performance guidance for large batches of varying records on the remote Neon database.
---

For hundreds of per-record upserts or updates, do not assume a Prisma transaction array will remove the network and statement overhead. Prefer a small number of set-based PostgreSQL operations, such as `createMany` plus updates sourced from `jsonb_to_recordset`.

**Why:** A 546-statement transaction against Neon still took roughly 110 seconds, while three set-based operations covering the same 273 records completed in about 2.7 seconds.

**How to apply:** Use this when a sync imports a large response and each record has different values. Keep the operations in one transaction when they must succeed or fail together.