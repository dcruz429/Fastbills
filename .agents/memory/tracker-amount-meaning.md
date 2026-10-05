---
name: Tracker amount meaning
description: Financial meaning of the requested Open and Done tracker summaries.
---

Open/Done amount summaries represent the amounts attached to records in each status group, including Paid, Loss, and transfer outcomes. Do not interpret Done amounts as cash received or Open amounts as collectible debt.

**Why:** The user requested amounts for the Open and Done buckets, first in Collections and then in Posting, Denials, Arbitration, RTP, and Checks. Outcome exclusions from the older total would obscure completed records and make the new summaries inconsistent with Collections.

**How to apply:** Keep these summaries bucket-based and responsive to existing filters and role visibility. If outstanding balances or actual receipts are needed, present them as separate financial metrics rather than silently changing these summaries.

Only the exact admin role should see the Open and Grand Total summary cards. Done remains visible to other users who can access each tracker.

**Why:** The user explicitly requested that only admins see Open and Grand Total, not the broader manager or editing roles.

**How to apply:** Do not reuse broad admin/manager permission groups for these cards. This is a summary-display rule; it does not change access to individual record amounts.
