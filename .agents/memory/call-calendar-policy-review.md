---
name: Call-calendar product policy review
description: Security fixes must not silently decide the deferred call-calendar visibility and assignment policies.
---

Keep security fixes separate from decisions about manager-wide call visibility, calls without a recognized clinic, third-party assignment, task linking, and the call-calendar controls that offer restricted actions.

**Why:** The user explicitly requested that the high-severity authorization fixes leave medium-severity product decisions unchanged for later review. Restoring an old UI action by weakening authorization is not an acceptable compatibility fix.

**How to apply:** Preserve currently permitted, scoped self-service workflows. Obtain an explicit product decision before broadening visibility, restoring restricted mutations, or choosing how to handle missing-clinic records. Fail closed when record identity or authorization scope cannot be established.
