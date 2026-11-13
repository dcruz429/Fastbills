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

## Rollback-only transactional assignment/approval SQL probe
Run only after the restored test database has passed the 10-table schema and role seed checks:
```bash
DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-assignment-integration.ts
```
The script requires the exact `fastbills_rcm_restore_test` database name. It creates synthetic users, a clinic, and task records inside a single transaction, verifies RCM scoped permission resolution, original task assignment SQL, task activity, notifications, audit ledger, high-risk approval and single-use consumption, and rolls back everything. No HTTP server or external integrations are launched. **This does not yet prove that the actual HTTP endpoints, login sessions, browser UI or cross-process concurrency are correct.** Continue with isolated E2E tests before deployment.

## Loopback-only assignment and high-risk approval HTTP integration
Run this only against the restored test database, with a clean working tree:
```bash
DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-http-write-integration.ts
```
The test mounts only the existing assignment and approval handlers, uses synthetic identities rather than real authentication, and binds to 127.0.0.1 on an ephemeral port. A dedicated PostgreSQL transaction contains synthetic users, a clinic, and tasks; intercepted route-level BEGIN/COMMIT operations use SAVEPOINTs so the outer transaction is **always rolled back**, including on errors. Tests include anonymous 401, out-of-scope 403, eligible assignment, stale 409, high-risk 428, independent approval, single-use consumption, and activity/notification/audit writes. This deliberately tests **route semantics, not production login/session, the full server lifecycle, or browser UI**. Do not run the full server against the restored database yet.

## Guarded staging startup (development branch only)
The Express entrypoint now recognizes `RCM_STAGING_SAFE=1` and rejects use of any database except `fastbills_rcm_restore_test`. It also requires `NODE_ENV=production` (so no Vite development middleware), a configured non-default `SESSION_SECRET`, and binds only to `127.0.0.1`. In this mode it skips automatic seeding, completion activity backfills, due-date backfills, and schedule cleanup. The normal app startup behavior is unchanged when the flag is absent.

Before launching any second process, run the **read-only preflight**:
```bash
DATABASE_URL="$RCM_TEST_URL" NODE_ENV=production RCM_STAGING_SAFE=1 npx tsx scripts/rcm-staging-preflight.ts
```
This command only verifies identity, schema and required environment flags. It does not start Express or modify the database.

**Caution:** Guarded startup does not make the entire legacy app read-only: registering its existing routes initializes session infrastructure, and authorized HTTP routes can still modify records. Session handling, background jobs registered by other modules, and outward-facing integrations have not been fully audited. Restored production-like healthcare data is not an appropriate user acceptance fixture; create a separate sanitized/synthetic staging dataset before opening a browser session. Do not expose the restored test app through a public Replit preview or deploy it.

## Synthetic-only database for browser acceptance
The full guarded application startup now accepts **only** `fastbills_rcm_synthetic_staging` when `RCM_STAGING_SAFE=1`. Full startup against `fastbills_rcm_restore_test` is explicitly rejected; the synthetic database also refuses ordinary startup with the safe flag omitted.

After schema-only restore and running the three migrations to seed roles and weights, seed controlled fictional records:
```bash
DATABASE_URL="$RCM_SYNTHETIC_URL" npx tsx scripts/rcm-seed-synthetic.ts
```
The script requires zero users, tasks, and clinics and verifies 12 roles/9 weights. It inserts 2 fictional clinics, 6 fictional users, and 8 tasks (including high/critical risk), and creates `/tmp/fastbills_rcm_synthetic_logins.txt` (mode 0600) with random per-user credentials. Do not upload or commit this file; it is ephemeral. The script deliberately fails on rerun to prevent duplicates.

Then run the read-only preflight using `RCM_SYNTHETIC_URL`, with `RCM_STAGING_SAFE=1` and `NODE_ENV=production`. Browser/app tests still require a security review of legacy routes and session exposure. Never enable public Replit preview with synthetic fixtures or copied patient data.
