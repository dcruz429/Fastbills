---
name: Guidelines Board scope
description: Authoring permissions and durable-reference semantics for guideline and training modules.
---

Guidelines Board is a shared staff reference for guideline and training modules that admins create and edit over time, separate from Message Board announcements.

**Why:** The user specifically asked for an Admin to create modules and update them when instructions change. Unlike Message Board, whose authoring permissions include several other roles, this board deliberately restricts authoring to the actual admin role while allowing signed-in staff to read.

**How to apply:** Enforce admin-only create/edit in both the UI and server, rather than reusing the broader announcement permissions. Updates modify the existing module, preserving its creator and creation date. Do not introduce audience targeting, acknowledgements, or training-completion requirements without a new request.
