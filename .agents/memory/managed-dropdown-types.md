---
name: Managed dropdown types
description: Compatibility and initialization rules for Posting document types and Guidelines Board module types.
---

Treat these type lists as admin-managed configuration, not fixed enums. Keep the original choices as initial defaults, but allow custom types and intentionally empty lists.

**Why:** The user asked to manage both lists from Admin Settings → Dropdowns. Restoring deleted defaults on restart would undo those settings. Automatically rewriting saved types when an option is renamed or deleted would change historical records without authorization.

**How to apply:** Initialize each list only once, even if the final option is later deleted. New records use configured choices; existing records retain their saved type and remain readable, filterable, and editable after a type is retired. Unknown custom module types must display their actual name rather than being labeled “Guideline.” Follow the existing dropdown-settings management permissions; authoring Guidelines Board modules remains admin-only.
