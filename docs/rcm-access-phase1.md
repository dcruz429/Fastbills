# FastbillsPH RCM Access Integration — Phase 1

> **Development-only.** No production database migrations or deployment have been performed. Do not merge to `main` until schema, authorization, and deployment reviews pass.

## Scope of this phase
- Retains existing `users`, `clinics`, `tasks`, password/session handling and the existing `role` enum.
- Adds additive PostgreSQL tables for RCM role policies, per-user allow/deny overrides, multiple assigned departments/clinics, and access-change audit events.
- Adds system-administrator-only APIs under `/api/rcm/access/*`.
- Adds admin UI pages: `/rcm-access` and `/rcm-role-matrix`.
- Adds backend access-service helpers and policy tests.
- Adds a **read-only** `/api/rcm/taskboard` endpoint against existing task records, filtered by both clinic and department for non-admins, with 100-row pagination.
- Adds `/rcm-taskboard`, a synchronized Kanban/Table preview of the same results. No record edits, approvals or assignments are enabled.

**Important limitation:** The current Billing, Verification, Posting, Collections, Denials, Arbitration, Checks, and RTP routes have **not** been switched to this new access policy. Their existing role checks remain in effect. Scope restrictions are enforced by the new policy helpers, not yet by every legacy tracker endpoint. Do not treat Phase 1 as completed tenant isolation.

## Preconditions
1. Review tracked repository files for tokens, PHI and usable sample passwords. The repository was public at review time.
2. Rotate any exposed credentials and confirm secure session-secret configuration.
3. Back up the staging database and test restore.
4. Review `migrations/20261112_rcm_access_foundation.sql`, then apply **to staging only** using an authorized migration process.
5. Do not apply raw SQL against the production database without change approval.

## Smoke test plan (staging)
1. Run `npm ci`, `npm run check`, and `npx tsx --test shared/rcm-access-policy.test.ts server/rcm-access-service.test.ts`.
2. Log in as a real test **admin** using the existing FastbillsPH session auth. Visit `/rcm-access` and `/rcm-role-matrix`.
3. Choose a non-admin synthetic user. Assign two departments and two existing clinics. Reload and verify the selected assignments persist.
4. Add a custom role, grant and deny a permission, and verify role matrix persistence.
5. Add a per-user Deny for a normally allowed permission and confirm the effective policy denies it; remove the override and confirm the role default returns.
6. Call the admin-only API as an employee and while impersonating; both must return 403. Without login it must return 401.
7. Confirm a user without clinic/department assignments cannot access new scoped resource routes once wired.
8. Verify the existing login, tasks, tracker pages, reports, and other RCM modules still operate as before.
9. Verify `rcm_access_audit` receives a record when scopes, roles, or overrides change.
10. Visit `/rcm-taskboard` as an assigned user. Confirm the same task list appears in Kanban and Table; confirm out-of-scope clinic and department records do not appear in either view or the API response. Test with synthetic records only.
11. Verify unassigned users see no task records, and a role with `tasks.read` denied receives 403.
12. Verify pagination, status filtering, browser navigation, and session expiry. The client-side filters apply only to the currently loaded page.

## Rollout plan
- **Phase 1A (this PR):** Additive tables, backend policy, admin UI, tests, and scoped read-only Task Board preview. No legacy route behavior change.
- **Phase 1B:** Implement resolved policy checks on each existing server tracker endpoint, including list and item reads, exports, bulk updates, transfers, notifications, and financial dashboards. Filter at SQL query boundaries and verify each clinic/department pair.
- **Phase 1C:** Extend the page navigation to use effective permissions; retain backend checks as the authority. Review module exceptions, CEO Box privileges, messages, and impersonation carefully.
- **Phase 2:** Extend the synchronized Kanban/Table preview into a validated editing workflow (manual assignment, approvals, existing tracker adapters), weighted productivity, TAT, risk approvals, and audit ledger.

## Rollback
Before migration: revert this development branch or close the PR. Existing production is unaffected.

After a staging migration: revert the application commits; leave the additive RCM tables intact until data retention and backups are reviewed. Dropping tables destroys permissions and audit records, so requires a separate authorized retention/rollback plan. No automatic destructive rollback is provided.

## Known security/deployment gaps
- Current app-wide role checks are not yet scoped; new role settings must not be represented as effective across legacy modules.
- Session configuration, rate limiting, CSRF safeguards, and access revocation should be reviewed before production.
- No real patient/claim data should be used in development fixtures.
- SQL migration has not been executed through this integration.
- A CI pass is not a substitute for a live staging authorization test.

## Current CI note
The first dedicated RCM policy test run passed all 10 tests. The whole-project `npm run check` is currently failing on pre-existing TypeScript errors in unrelated files; a clean baseline comparison and full staging test are required before merging. New file errors reported by the first run were corrected in the development branch.
