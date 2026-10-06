---
name: PAID marker meaning
description: Scope and semantics of the payment marker in Posting, Denials, Collections, and Arbitrations.
---

PAID is an independently saved, reversible record marker, not a workflow status, outcome, or instruction to exclude amounts from summaries. Do not infer it from existing status or outcome labels.

**Why:** The request was for a checkbox and visible paid indicator on the four trackers, not a change to workflow buckets or financial reporting. Tracker summaries represent tracked record amounts rather than unpaid receivables.

**How to apply:** Retain existing edit permissions. Checking or unchecking PAID alone must not move a record between Open and Done, trigger transfers, or change status, assignment, outcome, or totals. Transfers among the four trackers retain the marker, including a checkbox change made in the same save.
