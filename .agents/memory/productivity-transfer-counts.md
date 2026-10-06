---
name: Productivity transfer counts
description: Counting and attribution rules for Total Transfers on Productivity.
---

Total Transfers counts cross-page outcome-transfer events, not distinct patients or completed cases. Credit the person who performs the outcome change, rather than the record's assignee. Repeated genuine transfers of the same record count separately.

**Why:** The user requested visibility into when a user transfers a record between pages using an outcome. Records can carry copied audit history from their previous trackers; those copied entries are not new work and would inflate counts. Completion metrics remain a separate measure.

**How to apply:** Report the actor, event time, source page and destination page. Apply staff, source-department and date filters to both the tile and its transfer log. Exclude ordinary outcomes, unchanged outcomes, same-page actions and copies of earlier transfer history.
