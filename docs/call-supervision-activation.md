# Call Calendar supervision: prepared, not activated

## Activation status

The implementation requires the new `rcm_call_supervisors` table. The SQL in
`migrations/20261113_call_supervision.sql` is preparatory only. It has not been
executed by this work. Do not run a private-workbook build to activate this feature.

Until that table exists:

- Supervisory access defaults to none. Existing self/system-admin authorization
  remains unchanged.
- The administrator configuration endpoint returns a controlled 503 activation
  message. No assignment can be saved.
- There is no automatic grant, role backfill, team-name inference, or migration
  performed by this feature.

## Explicit approval needed

1. Approve review and execution of the single additive SQL migration, specifying
   the database/environment. It creates one empty grant table, foreign keys and
   an index; it does not seed assignments or change patient records.
2. Authorize synthetic-only database integration verification in an isolated test
   database before live activation. Current tests mock persistence and do not
   claim to have executed PostgreSQL transactions or the migration.
3. Separately approve the exact supervisor-to-team assignments. An authorized
   system administrator then selects an employee in **RCM Access Management**,
   uses **Call Calendar supervisory teams**, and explicitly saves teams.
   Assigning a manager role or ordinary membership is not a substitute.

Applying the migration alone grants nobody access. Deployment/publication,
production operations and actual grant changes require their own authorization.

## Policy and enforcement

- GET/PUT `/api/rcm/access/call-supervision/:userId` require an active, trusted
  system administrator with both `roles.manage` and `scopes.manage`, without
  impersonation. An empty `teamIds` array revokes all assignments.
- Replacements are transactional and audited through `rcm_access_audit`.
  Unknown teams and malformed/duplicate IDs are rejected.
- Calendar authorization reloads explicit grants and current team membership
  on each protected request. Inactive employees, deleted teams, absent grants,
  invalid membership responses, missing scopes and explicit read denies grant
  no supervisory access. The grantor must still be an active system admin.
- A teammate call must match BOTH the supervisor's authorized clinic and
  department. Unknown/ambiguous clinic names fail closed through the existing
  unique-name resolver. The new supervisory branch has no role-based or
  administrative scope bypass.
- Supervision extends call list/filter, detail, attempts/activity history, and
  existing read-only employee schedule access only. It grants no mutations,
  assignment/delegation, linked-task access or writes, rollover audit expansion,
  aggregate reports, or cross-team dashboards. Existing system-admin privileges
  are not redefined by this feature.
- Supervision is disabled during impersonation. Existing permitted self-record
  reads remain available; impersonation writes remain denied.
- Teammate schedule reads use a SELECT-only storage method. They do not run the
  legacy schedule builder, rollover, urgency enrichment or ensure-call actions.

## Revocation

Replacing/revoking grants or removing team membership removes supervisory
authorization on the next protected backend request. There is no server grant
cache. The calendar refreshes capability metadata every five seconds while
visible, and on focus; changed grants/scopes invalidate the visible query
identity, suppress revoked records and close revoked detail panels.
Already received information cannot be retroactively removed from a person's
knowledge; backend authorization, not browser polling, is the security boundary.

## Safe verification

These commands use source compilation or synthetic fixtures only:

```sh
npx tsx --test server/rcm-call-security.test.ts server/rcm-call-supervision.test.ts client/src/lib/call-calendar-api.test.ts
npx tsx scripts/call-calendar-browser-check.ts
npx tsc --noEmit --pretty false
NODE_ENV=production npx tsx script/compile-only.ts
```

The browser harness intercepts every request and starts no application listener.
Generated reports/screenshots and compile outputs are excluded from Git and
deployment. The compilation-only output is not a deployment package and does
not execute server code or copy private workbooks.
