---
name: Patient Overview scope
description: Cross-tracker viewing permissions and identity expectations for patient lookup.
---

Patient Overview is available to every signed-in role and gives a read-only view of matching patient records across Verification, Billing, Posting, Collections, Denials, Arbitration, and Checks, including Done records and records assigned to other users.

**Why:** The user described it as the place to search for a patient and see where their records live in all seven pages, available to everyone. Restricting the search to the user's usual tracker assignment would hide parts of that overview.

**How to apply:** Treat this as an intentional cross-tracker viewing exception, not permission to broaden editing or existing tracker access. Provide original-tracker links only where the user's normal access allows them. The user explicitly confirmed that Done and Grand Total summaries remain admin-only; other roles see Open summaries.

Name matching does not establish a unique patient identity.

**Why:** The trackers lack a shared patient identifier, so similar names can belong to different people or clinics.

**How to apply:** Keep the actual name and clinic visible on every record. Do not automatically consolidate matching names into a unique patient or describe summed tracker amounts as patient debt.
