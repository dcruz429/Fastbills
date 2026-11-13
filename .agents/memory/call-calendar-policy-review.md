---
name: Call-calendar product policy review
description: Security fixes must not silently decide the deferred call-calendar visibility and assignment policies.
---

Supervisory Call Calendar viewing is approved only through an explicit administrator-controlled manager-to-team assignment, combined with the viewer's clinic AND department scope. Default to no supervisory grants. Never infer management authority from ordinary membership, generic manager roles, or a team named "Manager Team".

**Why:** The user approved narrowly scoped, read-only team visibility after the existing model was found to lack explicit managerial authority. Shared membership is not proof of supervision. The user authorized preparatory schema/code/tests, but expressly prohibited executing migrations, accessing live data, or activating production changes.

**How to apply:** Preserve explicit denies and existing self-service workflows, including default self-assignment. Supervision must never imply mutation, delegation, assignment, linked-task, aggregate-report, cross-team, or impersonation privileges. Recheck grants/membership on each request so revocation takes effect. Existing schedule reads may write through lazy building/rollovers: teammate viewing must remain genuinely read-only. Separate approval is required to apply the new schema and configure real grants. Delegation/linking, unassigned queues and missing-clinic remediation remain unapproved.

DEVELOPMENT is the proposed first schema target, not authorization to identify it
through a database connection, inspect credentials, collect catalogs or migrate.
Non-secret resource identity/separation confirmation and any existing-database
metadata access require their own approval.

Department-key compatibility is deferred policy: do not silently alias
`Case Management / RTP`, `RTP` or `Closed`, or turn literal `Other` into a
wildcard/new scope assignment path. An implementation/storage label is not
evidence that two departments share permission scope.
