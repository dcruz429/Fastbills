---
name: Guidelines Board scope
description: Authoring permissions and durable-reference semantics for guideline and training modules.
---

Guidelines Board is a shared staff reference for guideline and training modules that admins and explicitly authorized module editors create and edit over time, separate from Message Board announcements.

**Why:** The user initially asked for admin authoring, then requested a way to grant individual users permission to create and modify modules without changing their role. This is explicit per-user delegation, not blanket access for supervisory roles.

**How to apply:** Only active admins may grant/revoke module editor access. Active admins always retain authoring access; other active staff need an explicit grant. Enforce this in the UI and server rather than reusing broader announcement permissions. Delegation grants no other Settings privileges. All active staff may still read modules after revocation. Updates modify the existing module, preserving its creator and creation date. Do not introduce audience targeting, acknowledgements, or training-completion requirements without a new request.
