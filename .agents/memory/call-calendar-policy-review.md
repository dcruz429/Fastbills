---
name: Call-calendar product policy review
description: Security fixes must not silently decide the deferred call-calendar visibility and assignment policies.
---

Keep security fixes separate from decisions about manager-wide call visibility, calls without a recognized clinic, third-party assignment, and task linking.

**Why:** The user explicitly requested that the high-severity authorization fixes leave medium-severity product decisions unchanged for later review. Restoring an old UI action by weakening authorization is not an acceptable compatibility fix.

**How to apply:** Preserve currently permitted, scoped self-service workflows. The user authorized technical UI alignment with existing backend restrictions and default self-assignment so successful new calls do not disappear. That is not approval for delegation, linking, an unassigned queue, missing-clinic remediation, or supervisory visibility. Obtain an explicit product decision before broadening these policies. Fail closed when record identity or authorization scope cannot be established.
