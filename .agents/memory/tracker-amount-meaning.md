---
name: Tracker amount meaning
description: Financial meaning of the requested Open and Done tracker summaries.
---

Open/Done amount summaries represent tracked amounts in each status group. Include Paid and Loss outcomes, but exclude transferred-out records' amounts from the source's Open, Done and Grand Total dollar summaries. Keep the amounts visible on source records and retain their record counts.

**Why:** The user requested Open/Done summaries across trackers, then explicitly revised the rule to prevent double-counting when an outcome transfer copies a record to another tracker. Source histories remain useful, but their dollars must not be counted again alongside the destination.

**How to apply:** Apply the transferred-out exclusion consistently to tracker cards, Patient Overview and dashboard calculations. Keep existing filters and role visibility. Ordinary completion and the PAID checkbox do not trigger this exclusion. These are tracked amounts, not cash receipts or collectible debt.

Only the exact admin role should see the Done and Grand Total summary cards. Other users who can access each tracker see only Open.

**Why:** The user revised the visibility rule: admins keep all three summaries, while all other roles see only Open, not Done or Grand Total.

**How to apply:** Do not reuse broad admin/manager permission groups for these cards. This is a summary-display rule; it does not change access to individual record amounts.
