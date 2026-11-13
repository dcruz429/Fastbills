# Offline catalog contract—not a collector

No SQL is executed or included as an automatic collector. This document designs
the metadata export for a later separately authorized operator. Do not import
the application's database module, read a URL to discover identity, or launch an
application endpoint to obtain metadata.

## Binding and evidence

`identitySchema`, `snapshotSchema` and `tableSchema` in `catalog-compare.ts` are
strict, machine-readable input contracts. `expected-schema.ts` is the expected
manifest. Extra keys (including rows, samples or connection strings) are rejected;
credential-like material is rejected without printing it. This is not a DLP
guarantee: the operator must ensure files contain metadata only before submission.

The snapshot requires:

- `format: "rcm-development-catalog/v1"`;
- `targetEnvironment: "DEVELOPMENT"`;
- matching `providerAccountRef`, `canonicalDatabaseRef`,
  `metadataExportApprovalRef`, and full `releaseCommit`;
- `completeness: "all-owned-tables-and-required-base-metadata"`;
- `tables`, with closed definitions for every present owned RCM object and the
  required partial base metadata.

An absent table must be an **observed absence within the authorized namespace**,
not a permissions-hidden/omitted object. An exporter cannot mark completeness
unless it has verified catalog visibility for the full allowed inventory.
There is no row scan or count requirement.

The two files only claim shared provenance; the comparator does not contact the
provider, validate a signature or authenticate an approval reference. A fabricated
test snapshot must never become an environment attestation. A human reviewer must
check evidence before accepting a real snapshot.

## Allowlisted catalog scope and collection plan

After identity confirmation and a metadata-only approval, the operator would use
the environment's approved read-only mechanism, a bounded read-only transaction,
and system catalogs only. Catalog privileges/visibility must be confirmed first;
access failures/unknown values are not equivalent to absent tables.

| Catalog metadata | Required facts |
|---|---|
| Namespaces/classes | public relation identity, kind, persistence, partitioning, RLS/forced-RLS |
| Attributes/types/default definitions | column name, qualified type/typmod, nullability, identity ALWAYS/BY DEFAULT, generated expression, default expression, default/explicit collation |
| Constraints | ordered PK, backing index validity/readiness, deferrability; ordered FK/reference columns and schema, actions, validation/defer flags; all checks and validation/NO INHERIT |
| Indexes/access methods | secondary index name, method, ordered keys, ASC/DESC/NULLS, uniqueness, predicate, INCLUDE columns, validity/readiness, default collation/operator classes, NULLS NOT DISTINCT |
| Triggers and policies | any trigger definition/name; RLS flags. Any RLS on an owned table is drift, so policy contents are not needed to authorize anything |

Primary-key backing indexes are represented by the PK fields, not duplicated in
the secondary index list. Their validity flag must reflect both validity and
readiness. Do not omit an unready or invalid secondary index. Expression indexes
cannot be represented as simple column keys: stop for a contract extension,
never pretend the expression is a column. Any unexpected unique constraint,
trigger, RLS setting, extra owned column or extra RCM relation stops review.

All FK reference schemas are explicit; do not resolve a similarly named table
through search_path. Built-in type aliases int4/int8/bool/timestamptz normalize
only to their documented equivalent types. The base users enum is `public.role`;
this partial check does not certify all enum labels or permission configuration.

Full closed comparison applies to the 11 manifest-owned tables. For base
`users`, `teams`, `clinics`, `tasks`, `user_teams`, collect only required column
metadata and required PK/FK information; do not export user row values. Base
column defaults/identity and unrelated columns/indexes are outside this partial
prerequisite check. Unexpected base RLS/triggers, incompatible key types,
nullability, generated required columns and membership FK differences stop review.
Do not interpret this as ownership of or permission to rewrite a base table.

Permissions and ownership require separate review: migration/schema owner, ACLs,
effective runtime role and schema resolution, audit sequence access and row-lock
rights. The comparator deliberately leaves these unverified rather than deriving
them from a successful structural match. It also does not inspect migration
ledger rows, grant contents, user status, clinic-name uniqueness or real scopes.

## Expression normalization: deliberately conservative

Expected expressions mirror reviewed SQL, e.g. `now()`, `'pending'::text`,
`'{}'::jsonb`, `effect IN ('allow','deny')`, and `status='pending'`.

The comparator only normalizes whitespace/case **outside quoted literals and
quoted identifiers**. It preserves composite-key order, FK column order, index
key order and all string-literal content. Ordering of column lists in a supplied
metadata document and ordering of independent constraints/indexes are immaterial.
Index names remain part of the expected identity.

It does **not** guess equivalence for casts, parentheses, IN versus PostgreSQL
ANY/ARRAY deparsing, NOW versus CURRENT_TIMESTAMP, rewritten range checks or
different collations/operator classes. A raw catalog export can therefore report
representation-only mismatches or unsupported expressions. This is an intentional
stop, not permission to overwrite the schema or hand-edit facts until they pass.

Before accepting a different catalog representation, propose a narrow versioned
normalizer/manifest update, preserve reviewed raw metadata evidence outside Git,
and test both equivalence and semantic drift using static or separately approved
disposable-only fixtures. No existing database should be used to discover/test
that adapter without separate authorization. This package is not a certified
live PostgreSQL exporter.

## Outcomes

- `missing`: one or more expected objects were observed absent; review each table
  and `supervisionState`. Missing optional feature objects are not instructions
  to apply their migrations. `prerequisitesSatisfied` concerns supplied structural
  supervision prerequisites only.
- `exact`: all supplied required structure matches the manifest; no replay,
  migration authorization, policy approval or environment certification.
- `mismatched`: definitions/ownership differ; stop for reviewed diagnosis.
- `incomplete`: missing/invalid evidence, unsafe input, ambiguous binding, wrong
  provenance, duplicate metadata or unsupported representation; collect/clarify
  under a new approval, never infer the missing fact.

Any result has `databaseContacted: false`,
`identityVerifiedAgainstProvider: false`, `migrationAuthorized: false` and
`supervisorAssignmentAuthorized: false`. The only executable operation is a
file-to-file comparison explicitly requested with `--offline-review`; the
package has no connection/apply mode or automatic runner.
