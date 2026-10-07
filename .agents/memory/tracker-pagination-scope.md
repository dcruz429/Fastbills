---
name: Tracker pagination scope
description: Preserve complete filtered-data semantics when limiting tracker rendering for performance.
---

Treat pagination as a display limit, not a limit on the underlying filtered dataset. Search must find records beyond the current page. Totals and record counts use all filtered records; existing select-all and export behavior must not silently become current-page-only.

**Why:** Tracker searches were slow because full result tables were rendered on each keystroke. Reducing visible rows fixes that bottleneck, but changing financial summaries or bulk-action scope would introduce unrelated reporting and workflow errors.

**How to apply:** Filter and sort the complete permitted dataset before choosing visible rows. Keep existing record permissions and search-field semantics, including Posting's formatted amount search. Label pagination clearly so users can reach every matching record.
