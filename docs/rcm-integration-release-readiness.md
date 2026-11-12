# FastbillsPH Integrated RCM Task Management: Release Readiness

**Status: Draft development only. Do not merge or deploy until staging approval.**

## Implemented
- Additive PostgreSQL role/permission/clinic/department/audit tables; existing accounts and session login remain unchanged.
- Admin Role Matrix and RCM Access screens with custom roles and per-user inherit/allow/deny.
- Unified Kanban/Table across Verification/Billing, Posting, Collections, Denials, Arbitration, Checks, Closed and RTP with original composite record IDs.
- Transactional scope-checked assignment across existing task and legacy tracker records; original activity histories updated.
- High/critical task assignments require a distinct reviewer and consume a matching approved request. Legacy high-risk records remain assignment-blocked.
- SLA due-date urgency and department summary for Verification and Billing.
- Weighted productivity based on existing Done activity, configurable by department.
- Independent quality-review queue for completed Verification/Billing tasks.
- Policy tests, CI workflow, and production build verification.

## Migrations: STAGING ONLY
1. Back up staging PostgreSQL, and prove restoration works.
2. Apply migrations/20261112_rcm_access_foundation.sql.
3. Apply migrations/20261112_rcm_approvals_productivity.sql.
4. Apply migrations/20261112_rcm_quality_reviews.sql.
5. Verify new role catalog and tables; assign synthetic employees to two clinics and two departments.
6. Test the new screens with existing FastbillsPH login and test accounts.
7. Never run destructive schema sync on production to install this feature.

## Acceptance tests required before deployment
- Verify authentication, impersonation restrictions, active-user checks and administrator-only writes.
- Test all role grants, user denies, department scopes, clinic scopes, empty scope, and Checks permission independently.
- Verify unknown/ambiguous clinic names fail closed and duplicate employee names cannot be assigned through legacy routes.
- Test all source trackers with overlapping numeric IDs and confirm original records update exactly once.
- Test concurrent assignee changes, unassigning, assignment notifications, activity history and audit records.
- Test high-risk requests: self-review denial, rejected or expired approval, changed assignee, approved single-use consumption.
- Test QA two-person restriction, reviewer scope, duplicated submissions and no change to patient workflow status.
- Test productivity weights, duplicate completion activities, reopened records, event caps, and scope.
- Test SLA due-date states, date boundaries, missing dates, and timezone handling.
- Run npm ci, npm run check, unit tests, npm run build, and integrated test fixtures against staging PostgreSQL.
- Verify existing legacy list, detail, search, edit, export, bulk, transfer, messaging and reporting routes cannot bypass new clinic scope.

## Known limitations
- The full-project TypeScript check still reports existing code errors. Latest result must be checked before merge.
- SQL migration has not been executed in staging or production through this integration.
- All legacy tracker endpoints have NOT been migrated to centralized scope checking. Complete tenant isolation is not yet guaranteed.
- The unified board may classify historical Done Verification/Billing records as Billing because source department is not retained.
- Legacy trackers store names as text. Name normalization is a release prerequisite.
- Approval and QA are currently task-only, with high-risk legacy assignment blocked.
- SLA deadlines exist reliably only on Verification/Billing tasks.
- Document Center and NF/WC/Lien/Dropped case mapping remain for a later integration slice.
- Public repository exposure and credential/PHI audit require immediate attention.

## Security and rollout
- Review historical GitHub commits and tracked uploads for patient data, active default passwords or API tokens. Make the repository private and rotate exposed credentials. Private visibility does not undo previous exposure.
- Validate hosting, encryption, PHI retention, audit logs, session security, vendor agreements, backups and incident response through a qualified healthcare compliance/security review.
- Keep the PR Draft until staging migration, regression and access-control review are complete. Do not alter production database or deployment from GitHub changes alone.

## Rollback
Before deployment, close the draft PR. If new tables are added in staging, revert application code but preserve permission and audit tables until an authorized retention decision.

## Read-only restored-database smoke test (Replit)
The staging SQL smoke test does not boot the FastbillsPH server, seed users, backfill data, open a listening port, or run mutations. It executes the real unified board, SLA and productivity SELECT queries using an explicit PostgreSQL READ ONLY transaction with empty clinic scope, prints only PASS/FAIL, and requires the exact database name fastbills_rcm_restore_test.

1. Verify RCM_TEST_URL remains set in the current Shell.
2. Fetch the latest feature branch to Replit, with a clean worktree and fast-forward merge.
3. Run: DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-staging-smoke.ts
4. Stop and report any SQL error. Do not change the regular DATABASE_URL or launch npm run dev/start against the restored database.

This is not an authentication/UI/e2e test. Separate startup protections, data-minimized staging fixtures and database access control are still necessary before starting an HTTP server with restored data.
