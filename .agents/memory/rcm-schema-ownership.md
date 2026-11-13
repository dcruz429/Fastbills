---
name: RCM schema ownership
description: Why SQL-owned RCM schema must remain separate from unreviewed Drizzle schema pushes during preparation
---

Retain SQL migration authority for RCM until an explicitly reviewed ownership
transition is approved. Drizzle parity for review is not permission to promote
those definitions into an active schema-push graph.

**Why:** The existing environment's schema and migration history are intentionally
uninspected. A blanket schema push can omit SQL-owned objects or propose unwanted
reconciliation; successful disposable verification does not certify an existing
database or authorize activation.

**How to apply:** Keep preparation offline and fail closed on ambiguous metadata.
Before any active tooling change, confirm the proposed DEVELOPMENT resource by
non-secret control-plane evidence and obtain separate catalog-read and schema
execution approvals. Do not use startup/build DDL or infer approval from naming
DEVELOPMENT as the first target.
