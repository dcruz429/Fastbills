# Manager supervision: DEVELOPMENT preparation only

**No activation, connection, catalog query, migration or real assignment is
authorized by this package.** DEVELOPMENT is the proposed first target. No
specific database resource has yet been identified or verified. Never use this
package for production operations.

## What changed—and what did not

- `expected-schema.ts`: reviewable expected metadata for all **11 SQL-owned RCM
  tables**, their constraints/indexes, partial base prerequisites, and SHA-256
  fingerprints of the four authoritative migration files. Hashes cover public
  source SQL only, never credentials.
- `drizzle-schema.review.ts`: equivalent Drizzle declarations, **not imported by
  the active schema, application, startup, build or migration configuration**.
- `catalog-compare.ts` / `compare-offline.ts`: offline JSON comparison, no driver,
  environment access, connection configuration, SQL execution or HTTP support.
- `department-review.ts`: proposed compatibility review data, not runtime policy.
- Synthetic tests use in-memory metadata and disposable local JSON files only.

The active `shared/schema.ts`, server authorization, department dropdowns,
migration SQL and application database module are unchanged.

### Explicit schema-tooling maintenance hold

`npm run db:push` now exits through `scripts/block-rcm-schema-push.cjs` before
Drizzle runs. The default `drizzle.config.ts` independently throws before reading
connection configuration. **All default Drizzle tooling is intentionally held**,
not just supervision. There is no environment-variable/flag bypass.

This is not an operating-system security boundary: someone deliberately using
another configuration, a connection argument or a database client can bypass
repository controls. Such actions are not authorized. No hook applies the SQL;
post-merge still installs dependencies only. Do not execute package installation,
the normal build, a server, or schema tooling as a verification shortcut.

The hold may be removed only in a separately approved code change after
ownership, drift, target identity and the actual migration path are reviewed.
Do not promote the review schema into the active schema during this preparation.

## Exact non-secret identity confirmation—BEFORE any connection

The app uses `DATABASE_URL`; `NODE_ENV=development` is not a database selector.
The old Drizzle configuration used the same variable. The held configuration
now reads no connection information. PostgreSQL tooling in `.replit` proves
neither resource identity nor isolation.

An authorized environment owner must perform the following **control-plane
metadata review**, separately authorized from this code preparation:

1. Identify this project/workspace by its non-secret immutable resource handle.
2. Identify the intended DEVELOPMENT database in its provider's administrative
   resource inventory. Record the provider-qualified canonical account handle and **canonical
   underlying database or branch ID**, not a display label, hostname, pooler
   alias, username, URL or secret fingerprint.
3. Account for STAGING and PRODUCTION: record their canonical database identities,
   or have the owner explicitly attest that each is not provisioned. Unknown
   environments block confirmation.
4. From resource-binding metadata, independently confirm that the workspace's
   runtime `DATABASE_URL` binding resolves to the DEVELOPMENT resource and that
   the separately proposed metadata-tool binding would resolve to the **same**
   resource within that same canonical provider/account. Do not retrieve, parse,
   hash, print, copy or compare secret values.
   Do not change any environment binding in this step.
5. Resolve aliases to canonical identities. DEVELOPMENT must not be the same
   underlying database/branch as STAGING or PRODUCTION. Equal labels or different
   hostnames are not evidence; pooler/direct endpoints can refer to one database.
6. Record a non-secret evidence/approval reference for the project identity,
   bindings and separation. The owner must inspect the underlying evidence;
   writing matching strings into JSON does not prove identity.
7. Only after the owner approves this exact target may a **new, separate approval**
   permit a bounded metadata-only catalog export.

If the provider exposes no safe binding-to-resource metadata, **STOP**. A secret
value, guessed hostname or `SELECT current_database()` is not a permitted
substitute for pre-connection identity confirmation. Ask for an approved
non-secret infrastructure inventory/owner attestation method; do not connect to
discover where a credential leads.

`identity.template.json` is deliberately UNCONFIRMED. Copy it only into ignored
`review-inputs/*.identity.json` after authorization. Both other environments and
both bindings must be accounted for. `releaseCommit` must identify the eventual
approved complete release, not merely this preparation's baseline commit.
Approval references are human-reviewed evidence, not cryptographic proof or
permission tokens. Never put personal names, credentials or private records here.

## Ownership inventory and application order

| Authoritative SQL | SQL-owned tables | Relationship to supervision |
|---|---|---|
| `20261112_rcm_access_foundation.sql` | `rcm_roles`, `rcm_role_permissions`, `rcm_user_roles`, `rcm_user_permission_overrides`, `rcm_user_departments`, `rcm_user_clinics`, `rcm_access_audit` | Permission/scope/audit runtime prerequisites |
| `20261112_rcm_approvals_productivity.sql` | `rcm_task_approvals`, `rcm_productivity_weights` | Separate features; not supervision prerequisites |
| `20261112_rcm_quality_reviews.sql` | `rcm_quality_reviews` | Separate feature; not a supervision prerequisite |
| `20261113_call_supervision.sql` | `rcm_call_supervisors` | Proposed additive grant table, initially empty |

The existing Drizzle application schema owns base tables such as `users`,
`teams`, `user_teams`, `clinics` and `tasks`. Its previous schema-push entry point
did not declare these 11 RCM tables. It must not be used to infer their absence
or apply/reconcile them. An unreviewed diff could propose unwanted changes to
existing SQL-owned objects.

**Ownership decision for this preparation:** retain SQL as authoritative for
all 11 RCM tables and stage equivalent Drizzle definitions outside active paths.
No migration file is rewritten; no seed, grant, type, default or policy changes.
Future unification requires a reviewed catalog baseline and an explicit decision
about the supported migration strategy for the identified hosting environment.
Do not mix an ad-hoc SQL run with an unreviewed schema push.

Confirm, rather than blindly execute, this order:

1. Existing public base tables and compatible integer primary keys. Grant-table
   DDL directly references `users(id)` and `teams(id)`. Runtime additionally uses
   team membership, clinic metadata and scope tables. `tasks(id)` is needed for
   the separately inventoried approval/quality features, not the new grant DDL.
2. Existing RCM foundation, including audit. Its `IF NOT EXISTS` clauses do not
   establish compatibility with pre-existing definitions.
3. Only the separately approved supervision migration if the target table is
   conclusively absent and prerequisites match. Do not apply the other feature
   migrations just because their objects are missing from an inventory.

The supervision table must have four non-null columns: three integers
(`manager_user_id`, `team_id`, `granted_by`) and `granted_at TIMESTAMPTZ DEFAULT
now()`. Its ordered primary key is `(manager_user_id, team_id)`. Manager/team
foreign keys cascade on delete; grantor deletion uses NO ACTION. Updates use NO
ACTION; FKs must be validated and non-deferrable. The separate team B-tree index
is non-unique, non-partial and valid/ready. No initial grants.

Grant replacement deletes/inserts grants and writes `rcm_access_audit` in one
transaction. Missing/incompatible audit columns or permissions cause rollback;
creating the grant table alone does not establish runtime readiness. Deleting a
grantor with referenced grants can be blocked: review that operational policy,
never change the FK silently.

## Metadata comparison design and limits

See [catalog-contract.md](catalog-contract.md). No collector or executable
catalog SQL is included. Collection remains blocked pending target approval and
specific metadata-read authorization. The comparator consumes **only** explicit
metadata JSON; it neither discovers databases nor authenticates attestations.

It distinguishes `missing`, `exact`, `mismatched`, and `incomplete`; reports
each object and whether structural prerequisites match. All results retain
`databaseContacted: false`, `identityVerifiedAgainstProvider: false`,
`migrationAuthorized: false`, and `supervisorAssignmentAuthorized: false`.
“Exact” means supplied structure matches this manifest—not environment readiness.

Unexpected objects, incomplete metadata, ambiguous identity, provenance mismatch,
unsupported expressions and drift all stop review. The tool never emits
reconciliation SQL, creates an execution plan, grants authority or exits into a
migration. Ownership/ACL/sequence privileges, migration history, origin delivery
and department policy remain separately reviewed even for an exact snapshot.

## Privileges and bounded execution procedure—FUTURE APPROVAL REQUIRED

No role privileges have been inspected. The eventual approved operator must:

1. Confirm the deployment/provider's supported DEVELOPMENT migration mechanism.
   Do not invent production migration scripts or startup/build DDL.
2. Verify migration-role access to the intended schema, CREATE permission and
   REFERENCES rights on the exact public `users`/`teams` keys. Review object
   ownership and effective search path so no unqualified name resolves elsewhere.
3. Verify runtime schema USAGE, SELECT on permission/scope/membership/clinic/grant
   sources, SELECT/INSERT/DELETE on the grant table, INSERT on audit, required
   audit identity-sequence permissions, and SELECT/row-lock privileges used by
   grant replacement's user/team locking. Use permission metadata, not write
   probes. Do not grant any additional rights as part of preflight.
4. Establish a reviewed recovery point and restoration procedure through the
   environment's supported mechanism; do not dump real data into this repository.
5. Obtain an approval naming the **canonical DEVELOPMENT identity**, exact SQL
   checksum, release commit, executor, allowed window, lock timeout, statement
   timeout and recovery plan. Set bounded limits through the approved mechanism;
   do not leave transactions open while awaiting approval.
6. Reconfirm identity/metadata immediately before execution under that approval.
   Execute the approved transactional file on one connection, with stop-on-error
   semantics and reviewed schema resolution. No unapproved preceding migrations,
   role seeds or grant changes.
7. On failure before COMMIT: roll back/close that transaction. PostgreSQL DDL in
   this file is transactional; do not continue commands in an aborted transaction.
8. On uncertain commit outcome: stop, obtain/renew permission for catalog-only
   confirmation, and classify absence/exactness/drift before considering retry.
9. After success: separately authorized metadata review verifies structure and
   permissions. Any emptiness/grant-row count check is a distinct data query,
   **not authorized by a metadata-only approval**.

**Idempotency:** unconditional CREATE statements are not safely rerunnable.
Absent means review a create-only plan; exact means do not replay; mismatch means
stop. Do not add `IF NOT EXISTS` to hide drift, drop/recreate objects, truncate
grants, infer an applied migration from a filename, or mark a migration ledger
entry complete without verified evidence.

**Recovery after COMMIT:** prefer leaving an empty, unassigned additive table in
place. If any grants could exist, preserve audit/history and request separate
revocation/recovery approval. A DROP, FK change, permission grant or data restore
is a new operation requiring specific consent, not an automatic rollback step.

## Department keys: review only, no policy expansion

Seven exact keys already overlap: Verification, Billing, Posting, Collections,
Denials, Arbitration, Checks. Preserve exact matching and all existing denies.

- `Case Management / RTP` (access UI/productivity seed) versus `RTP` (calendar):
  **candidate alias only**, not approved. Do not normalize either direction,
  copy grants, backfill rows, change dropdowns or case-fold scopes.
- `Other` is a literal calendar department, not a wildcard. Access configuration
  currently offers no such key. Do not create a new scope choice or map it to all
  departments. Calendar department `Other` is unrelated to call outcome `Other`.
- `Closed` and `Document Center` have no same-named calendar scope. In particular,
  the boundary's RTP storage lookup uses `getClosed`; this implementation detail
  does not prove `Closed`, RTP and Case Management are one permission domain.

Safe future choices require a product decision: preserve exact keys and current
denials; introduce a shared canonical key with an explicitly reviewed conversion;
or retain independent scopes with an explicit new assignment path. Any conversion
needs a separately approved affected-scope review and tests proving no unintended
clinic/department/team expansion. No such policy is selected or applied here.

## Origin delivery / immutable release verification (LOCAL REFS ONLY)

At preparation baseline: branch `feature/rcm-task-management`, HEAD
`eb734d0452acf9da246df4182b3a6b9583ad2366`; recorded origin branch
`777e86163e5edd7edccf2141205b6c775521d678`; nine ahead, zero behind; no upstream.
The recorded backup ref contains baseline HEAD, which is not proof of origin
delivery. New preparation files are not identified by that old commit.

Read-only, no-network checks (remote URLs are deliberately not displayed):

```sh
git branch --show-current
git rev-parse HEAD
GIT_OPTIONAL_LOCKS=0 git status --short
git for-each-ref --format='%(refname) %(objectname) upstream=%(upstream)' refs/heads/feature/rcm-task-management refs/remotes/origin/feature/rcm-task-management
git rev-list --left-right --count refs/remotes/origin/feature/rcm-task-management...refs/heads/feature/rcm-task-management
git log --format='%h %s' refs/remotes/origin/feature/rcm-task-management..refs/heads/feature/rcm-task-management
```

These prove recorded ancestry only, not current remote state. Missing tracking
refs stop delivery verification. A complete release needs its final immutable
commit, a clean worktree and independently confirmed origin delivery. A remote
refresh, push, upstream change or merge requires separate authorization; none is
part of these commands or this package.

## Offline verification only

Use already installed binaries; no package fetch/install:

```sh
./node_modules/.bin/tsx --test preflight/rcm/preflight.test.ts
./node_modules/.bin/tsc --project preflight/rcm/tsconfig.json --pretty false
```

Tests cover missing/exact/mismatched schema, incomplete evidence, structural
drift, all 11 Drizzle review declarations, pinned SQL, tooling guards and unchanged
exact department authorization. They construct fabricated metadata and ephemeral
JSON only. No PostgreSQL cluster, migration or application listener is started.
Drizzle DESC index declarations explicitly use NULLS FIRST to match PostgreSQL's
bare DESC SQL semantics; default Drizzle DESC metadata otherwise uses NULLS LAST.

Only after **separate approval to review supplied metadata files**, the explicit
offline CLI is:

```sh
./node_modules/.bin/tsx preflight/rcm/compare-offline.ts --offline-review --identity preflight/rcm/review-inputs/review.identity.json --snapshot preflight/rcm/review-inputs/review.catalog.json
```

There are no such real input files now. No flags prints INERT and reads no
inputs. Files must be named appropriately, remain within dedicated metadata
directories, be ordinary files with no symlink escape and be at most 2 MB.
Exit codes: 0 = supplied structure exact; 2 = inert/invalid invocation;
3 = objects missing; 4 = mismatch/incomplete/unsafe input. **None authorizes SQL.**

## Approval gates still open

1. Non-secret provider/workspace identity and separation confirmation.
2. Bounded metadata-only DEVELOPMENT export and offline review of those files.
3. Review of any raw-catalog adapter/normalization differences using synthetic
   or separately approved disposable-only fixtures.
4. Final schema-ownership strategy, tooling-hold removal and migration path.
5. Exact DEVELOPMENT schema execution, with release/checksum/limits/recovery.
6. Any department-key policy or data conversion.
7. Exact real supervisor/team assignments and operational validation.
8. Any fetch, push, merge, deployment/publication or non-DEVELOPMENT operation.
