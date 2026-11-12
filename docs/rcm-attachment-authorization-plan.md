# RCM attachment download authorization review (module-by-module)

**Release status: BLOCKED.** The current `GET /api/files/:id` middleware deliberately permits only a single private direct-message reference where the signed-in user is the sender or recipient. Every other module is currently denied. This prevents the confirmed ID-enumeration vulnerability, but breaks legitimate downloads in other modules.

## Source-level authorization inventory

| Owner module | Parent table | Read rule currently used by the module | Download-policy recommendation |
| --- | --- | --- | --- |
| Direct messages | `direct_messages.attachments` | Sender or recipient only | **Implemented** as exact single-message attachment ownership, deny impersonation |
| Guidelines | `guideline_modules.attachments` | All **active signed-in users** can list guideline modules (`server/guideline-board.ts`); editor rights are for mutation only | Permit matching, uniquely referenced file to active logged-in users, provided no other module references it |
| Announcements | `announcements.attachments` | Recipient targeting is `all`, matching `role`, or matching explicit `users`. For explicit user targeting the author is also included; `server/routes.ts` lets manager-like roles view all announcements, irrespective of target | Preserve exactly the module's intended recipient policy; **resolve whether manager read-all is intended** before enabling downloads, so attachment access doesn't inherit accidental disclosure |
| Tickets | `tickets.attachments`, `ticket_comments.attachments` | Ticket list and comments are **admin-only**; ticket update has separate admin/creator permissions | Start with original **active admins only**, aligned with existing list/comments. Ticket creators' view access must be independently confirmed before expansion |
| CEO Box | `ceo_box.attachments` | `requireCeoAccess` plus record-level filtering via `getCeoBoxRecords`; confidential records have special handling | Implement using the **same exact record-level visibility predicate**, including confidentiality and explicit user grants, not just CEO role |
| Unreferenced or multiply referenced files | `file_uploads` without `owner_id` or `parent_id` | No parent authorization can be established | **Deny** and log only metadata-safe audit events; introduce durable attachment-parent associations in a future migration |

## Staged plan

1. Keep private-message regression green.
2. Start with Guidelines, whose read policy is explicit and simplest: single unique module attachment, active account only, no cross-parent references. Build synthetic attachment and tests for active allowed, inactive denied, unrelated account if applicable.
3. Then Tickets with an admin-only fixture and tests.
4. Clarify the announcement manager read-all policy before exposing announcement files.
5. CEO Box last, matching confidential record visibility exactly.
6. Add regression coverage for duplicate parent references, orphaned files, inactive accounts, impersonation, and URL tampering.

Do not change production or broaden downloads based solely on a user role without exact parent-level authorization.
