import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import { EXPECTED_RCM_TABLES, SQL_SOURCE_HASHES } from "./expected-schema";
import { compareCatalog, canonicalTable, fingerprint, normalizeSql, tableSchema, type CatalogTable } from "./catalog-compare";
import { syntheticIdentity, syntheticSnapshot } from "./synthetic-fixtures";
import * as draft from "./drizzle-schema.review";
import { blockUnapprovedSchemaTooling } from "./tooling-guard";
import { DEPARTMENT_REVIEW } from "./department-review";
import { resourceAllowed, type AccessContext } from "../../shared/rcm-access-policy";
import { CALL_SCOPE_DEPARTMENTS } from "../../shared/call-calendar-contract";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const target = (snapshot: ReturnType<typeof syntheticSnapshot>) => snapshot.tables.find(t => t.name === "rcm_call_supervisors")!;
test("exact synthetic inventory is structural review only, never activation", () => {
  const result = compareCatalog(syntheticIdentity(), syntheticSnapshot());
  assert.equal(result.status, "exact"); assert.equal(result.prerequisitesSatisfied, true);
  assert.equal(result.migrationAuthorized, false); assert.equal(result.supervisorAssignmentAuthorized, false);
  assert.equal(result.databaseContacted, false);
});
test("missing supervision table is distinguished from drift and does not authorize creation", () => {
  const snapshot = syntheticSnapshot();
  snapshot.tables = snapshot.tables.filter(t => t.name !== "rcm_call_supervisors");
  const result = compareCatalog(syntheticIdentity(), snapshot);
  assert.equal(result.status, "missing"); assert.equal(result.supervisionState, "missing");
  assert.equal(result.prerequisitesSatisfied, true); assert.equal(result.migrationAuthorized, false);
});
test("missing audit/foundation/base prerequisites cannot be mistaken for a supervision-only migration", () => {
  for (const name of ["rcm_access_audit", "rcm_user_roles", "rcm_user_departments", "users", "teams", "user_teams"]) {
    const snapshot = syntheticSnapshot();
    snapshot.tables = snapshot.tables.filter(t => t.name !== name);
    const result = compareCatalog(syntheticIdentity(), snapshot);
    assert.equal(result.status, "missing", name); assert.equal(result.prerequisitesSatisfied, false, name);
  }
});
const driftCases: [string, (table: CatalogTable) => void][] = [
  ["wrong type", t => { t.columns[0].type = "bigint"; }],
  ["nullable manager", t => { t.columns[0].notNull = false; }],
  ["unexpected default", t => { t.columns[0].default = "1"; }],
  ["identity mode", t => { t.columns[0].identity = "by default"; }],
  ["computed column", t => { t.columns[0].generated = "1"; }],
  ["explicit collation", t => { t.columns[0].collationPolicy = "explicit"; }],
  ["missing column", t => { t.columns.pop(); }],
  ["extra column", t => { t.columns.push({ ...t.columns[0], name: "unapproved" }); }],
  ["reversed composite primary key", t => { t.primaryKey.reverse(); }],
  ["invalid primary key", t => { t.primaryKeyValid = false; }],
  ["deferred primary key", t => { t.primaryKeyDeferrable = true; }],
  ["wrong referenced schema", t => { t.foreignKeys[0].referencedSchema = "unapproved"; }],
  ["wrong reference", t => { t.foreignKeys[0].table = "teams"; }],
  ["wrong delete action", t => { t.foreignKeys[0].onDelete = "no action"; }],
  ["wrong update action", t => { t.foreignKeys[0].onUpdate = "cascade"; }],
  ["missing foreign key", t => { t.foreignKeys.pop(); }],
  ["unvalidated foreign key", t => { t.foreignKeys[0].validated = false; }],
  ["deferrable foreign key", t => { t.foreignKeys[0].deferrable = true; }],
  ["missing index", t => { t.indexes = []; }],
  ["partial index", t => { t.indexes[0].predicate = "team_id > 0"; }],
  ["different index key", t => { t.indexes[0].keys[0].column = "granted_by"; }],
  ["different null ordering", t => { t.indexes[0].keys[0].nulls = "first"; }],
  ["unique index", t => { t.indexes[0].unique = true; }],
  ["invalid index", t => { t.indexes[0].valid = false; }],
  ["not-ready index", t => { t.indexes[0].ready = false; }],
  ["custom operator class", t => { t.indexes[0].defaultOperatorClasses = false; }],
  ["custom index collation", t => { t.indexes[0].defaultCollations = false; }],
  ["unexpected included column", t => { t.indexes[0].include.push("granted_by"); }],
  ["nulls-not-distinct index", t => { t.indexes[0].nullsNotDistinct = true; }],
  ["extra unique constraint", t => { t.uniqueConstraints.push(["manager_user_id"]); }],
  ["extra check", t => { t.checks.push({ expression: "team_id > 1", validated: true, noInherit: false }); }],
  ["trigger", t => { t.triggers.push("unapproved_trigger"); }],
  ["row-level security", t => { t.rowSecurity = true; }],
  ["forced row-level security", t => { t.forceRowSecurity = true; }],
  ["unlogged table", t => { t.persistence = "unlogged"; }],
  ["partitioned table", t => { t.kind = "partitioned"; }],
];
for (const [description, change] of driftCases) test(`drift stops review: ${description}`, () => {
  const snapshot = syntheticSnapshot(); change(target(snapshot));
  const result = compareCatalog(syntheticIdentity(), snapshot);
  assert.equal(result.status, "mismatched"); assert.equal(result.supervisionState, "mismatched");
  assert.equal(result.migrationAuthorized, false);
  assert.ok(result.tables.find(t => t.name === "rcm_call_supervisors")!.issues.length > 0);
});
test("column/table/FK ordering is immaterial but identifiers and quoted contents remain exact", () => {
  const snapshot = syntheticSnapshot();
  snapshot.tables.reverse();
  for (const t of snapshot.tables) { t.columns.reverse(); t.foreignKeys.reverse(); }
  assert.equal(compareCatalog(syntheticIdentity(), snapshot).status, "exact");
  assert.equal(normalizeSql("effect IN ('allow', 'deny')"), normalizeSql("EFFECT in ( 'allow' , 'deny' )"));
  assert.notEqual(normalizeSql("effect='allow'"), normalizeSql("effect='ALLOW'"));
  assert.notEqual(normalizeSql("effect='two spaces'"), normalizeSql("effect='two  spaces'"));
});
test("type aliases are limited; unknown SQL syntax stops rather than guessing equivalence", () => {
  const snapshot = syntheticSnapshot(); target(snapshot).columns[0].type = "int4";
  assert.equal(compareCatalog(syntheticIdentity(), snapshot).status, "exact");
  target(snapshot).columns[0].default = "$unknown$danger$unknown$";
  assert.equal(compareCatalog(syntheticIdentity(), snapshot).status, "incomplete");
});
test("partial snapshot, duplicate tables/columns, unknown fields and credential-like strings are rejected", () => {
  const partial: any = syntheticSnapshot(); delete partial.tables[0].rowSecurity;
  const duplicate = syntheticSnapshot(); duplicate.tables.push(duplicate.tables[0]);
  const duplicateColumn = syntheticSnapshot(); target(duplicateColumn).columns.push(target(duplicateColumn).columns[0]);
  const rows: any = syntheticSnapshot(); rows.rows = [{ forbidden: "synthetic" }];
  const secret: any = syntheticSnapshot(); secret.connectionString = "postgresql://fabricated.invalid/never-connect";
  for (const snapshot of [partial, duplicate, duplicateColumn, rows, secret])
    assert.equal(compareCatalog(syntheticIdentity(), snapshot).status, "incomplete");
});
test("unknown RCM ownership or wrong schema is a stop, not an ignored object", () => {
  for (const type of ["extra", "schema"]) {
    const snapshot = syntheticSnapshot();
    if (type === "extra") snapshot.tables.push({ ...structuredClone(target(snapshot)), name: "rcm_unapproved" });
    else target(snapshot).schema = "unapproved";
    assert.equal(compareCatalog(syntheticIdentity(), snapshot).status, "mismatched");
  }
});
test("non-secret identity requires matching bindings, separation, approval references and release provenance", () => {
  const cases = [
    (i: any) => { i.runtimeBindingResourceRef = "different"; },
    (i: any) => { i.toolingBindingResourceRef = "different"; },
    (i: any) => { i.canonicalDatabaseRef = "UNCONFIRMED"; },
    (i: any) => { i.environmentOwnerApprovalRef = null; },
    (i: any) => { i.metadataExportApprovalRef = null; },
    (i: any) => { i.otherEnvironments[0].status = "unknown"; },
    (i: any) => { i.otherEnvironments[1].canonicalDatabaseRef = i.canonicalDatabaseRef; },
    (i: any) => { i.otherEnvironments[0] = i.otherEnvironments[1]; },
    (i: any) => { i.releaseCommit = "0".repeat(40); },
    (i: any) => { i.targetEnvironment = "PRODUCTION"; },
  ];
  for (const change of cases) {
    const identity = syntheticIdentity(); change(identity);
    assert.equal(compareCatalog(identity, syntheticSnapshot()).status, "incomplete");
  }
  const template = JSON.parse(source("preflight/rcm/identity.template.json"));
  assert.equal(compareCatalog(template, syntheticSnapshot()).status, "incomplete");
});
test("a missing audit column or invalid membership FK fails dependency readiness", () => {
  for (const name of ["rcm_access_audit", "user_teams"]) {
    const snapshot = syntheticSnapshot(), t = snapshot.tables.find(t => t.name === name)!;
    if (name === "rcm_access_audit") t.columns = t.columns.filter(c => c.name !== "payload");
    else t.foreignKeys[0].onDelete = "cascade";
    const result = compareCatalog(syntheticIdentity(), snapshot);
    assert.equal(result.status, "mismatched"); assert.equal(result.prerequisitesSatisfied, false);
  }
});
test("SQL ownership manifest pins all four reviewed migration sources and all 11 tables", () => {
  const found: string[] = [];
  for (const [file, expectedHash] of Object.entries(SQL_SOURCE_HASHES)) {
    const sql = source(file);
    assert.equal(createHash("sha256").update(sql).digest("hex"), expectedHash, file);
    found.push(...[...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)].map(m => m[1]));
  }
  assert.deepEqual(found.sort(), EXPECTED_RCM_TABLES.map(t => t.name).sort());
});

/** Introspects Drizzle metadata in memory; never imports server/db or a driver. */
function reviewTableMetadata(value: any): CatalogTable {
  const config = getTableConfig(value), dialect = new PgDialect();
  const sql = (value: SQL) => dialect.sqlToQuery(value).sql;
  const columns = config.columns.map(c => ({
    name: c.name, type: c.getSQLType(), notNull: c.notNull,
    default: c.default === undefined ? null : c.default instanceof SQL ? sql(c.default)
      : typeof c.default === "string" ? `'${c.default.replace(/'/g, "''")}'::text` : String(c.default),
    identity: c.generatedIdentity?.type ?? null, generated: null, collationPolicy: "database-default",
  }));
  const base = structuredClone(EXPECTED_RCM_TABLES.find(t => t.name === config.name)!);
  return tableSchema.parse({
    ...base, columns,
    primaryKey: config.primaryKeys.length ? config.primaryKeys[0].columns.map(c => c.name) : config.columns.filter(c => c.primary).map(c => c.name),
    foreignKeys: config.foreignKeys.map(f => {
      const ref = f.reference();
      return { columns: ref.columns.map(c => c.name), table: getTableConfig(ref.foreignTable).name,
        referencedColumns: ref.foreignColumns.map(c => c.name), referencedSchema: "public",
        onDelete: f.onDelete, onUpdate: f.onUpdate, deferrable: false, initiallyDeferred: false, validated: true };
    }),
    checks: config.checks.map(c => ({ expression: sql(c.value), validated: true, noInherit: false })),
    indexes: config.indexes.map(i => ({
      name: i.config.name, method: i.config.method, unique: i.config.unique,
      keys: i.config.columns.map((c: any) => ({ column: c.name, order: c.indexConfig.order, nulls: c.indexConfig.nulls })),
      predicate: i.config.where ? sql(i.config.where) : null, include: [], valid: true, ready: true,
      defaultCollations: true, defaultOperatorClasses: true, nullsNotDistinct: false,
    })),
  });
}
for (const value of Object.values(draft)) {
  const name = getTableConfig(value).name;
  test(`review-only Drizzle declaration matches expected SQL metadata: ${name}`, () => {
    const actual = reviewTableMetadata(value), expected = tableSchema.parse(EXPECTED_RCM_TABLES.find(t => t.name === name));
    assert.deepEqual(canonicalTable(actual), canonicalTable(expected));
  });
}
test("schema tooling guard fails without loading credentials and has no flag bypass", () => {
  assert.throws(blockUnapprovedSchemaTooling, /SCHEMA TOOLING BLOCKED/);
  const config = source("drizzle.config.ts");
  assert.match(config, /export default blockUnapprovedSchemaTooling\(\)/);
  assert.doesNotMatch(config, /process\.env|dbCredentials|connectionString|defineConfig/);
  const result = spawnSync(process.execPath, ["scripts/block-rcm-schema-push.cjs"], { cwd: root, env: {}, encoding: "utf8" });
  assert.equal(result.status, 2); assert.match(result.stderr, /SCHEMA PUSH BLOCKED/);
  assert.equal(JSON.parse(source("package.json")).scripts["db:push"], "node scripts/block-rcm-schema-push.cjs");
  for (const file of ["server/db.ts", "shared/schema.ts", "server/index.ts", "script/build.ts", "scripts/post-merge.sh"]) {
    assert.doesNotMatch(source(file), /preflight\/rcm|drizzle-schema\.review|compare-offline|expected-schema/);
  }
});
test("existing scope policy remains exact: RTP label is not an alias and Other is not a wildcard", () => {
  const context = (department: string): AccessContext => ({
    rolePermissions: new Set(["tasks.read"]), userOverrides: new Map(), departmentIds: new Set([department]),
    clinicIds: new Set([10]), isSystemAdmin: false,
  });
  const allowed = (scope: string, row: string) => resourceAllowed(context(scope), "tasks.read", { clinicId: 10, departmentId: row });
  assert.equal(allowed("Verification", "Verification"), true);
  assert.equal(allowed("Case Management / RTP", "RTP"), false);
  assert.equal(allowed("RTP", "Case Management / RTP"), false);
  assert.equal(allowed("Other", "Verification"), false);
  assert.equal(allowed("Other", "RTP"), false);
  assert.equal(allowed("Closed", "RTP"), false);
  assert.equal(allowed("Verification", "verification"), false);
  assert.equal(allowed("Verification", " Verification "), false);
  assert.ok(CALL_SCOPE_DEPARTMENTS.includes("RTP")); assert.ok(CALL_SCOPE_DEPARTMENTS.includes("Other"));
  assert.match(source("server/rcm-access-routes.ts"), /"Case Management \/ RTP"/);
  assert.match(source("server/rcm-call-boundary.ts"), /context\.departmentIds\.has\(row\.department \?\? ""\)/);
  assert.ok(DEPARTMENT_REVIEW.some(r => r.proposal === "unapproved-alias-do-not-apply"));
});
test("CLI is inert by default and only compares explicitly supplied synthetic JSON", () => {
  const outputRoot = path.join(root, "generated-artifacts/rcm-preflight");
  mkdirSync(outputRoot, { recursive: true });
  const temp = mkdtempSync(path.join(outputRoot, "synthetic-"));
  const run = (...args: string[]) => spawnSync(process.execPath,
    ["--import", "tsx", "preflight/rcm/compare-offline.ts", ...args], { cwd: root, env: {}, encoding: "utf8" });
  try {
    const identityFile = path.join(temp, "synthetic.identity.json"), snapshotFile = path.join(temp, "synthetic.catalog.json");
    writeFileSync(identityFile, JSON.stringify(syntheticIdentity())); writeFileSync(snapshotFile, JSON.stringify(syntheticSnapshot()));
    assert.equal(run().status, 2); assert.equal(run("--execute").status, 2);
    let result = run("--offline-review", "--identity", identityFile, "--snapshot", snapshotFile);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).databaseContacted, false);
    const snapshot = syntheticSnapshot(); snapshot.tables = snapshot.tables.filter(t => t.name !== "rcm_call_supervisors");
    writeFileSync(snapshotFile, JSON.stringify(snapshot));
    result = run("--offline-review", "--identity", identityFile, "--snapshot", snapshotFile);
    assert.equal(result.status, 3); assert.equal(JSON.parse(result.stdout).supervisionState, "missing");
    assert.equal(run("--offline-review", "--identity", path.join(root, ".env"), "--snapshot", snapshotFile).status, 4);
    // A link to a synthetic file also fails; no private target is touched.
    const link = path.join(temp, "link.identity.json"); symlinkSync(identityFile, link);
    assert.equal(run("--offline-review", "--identity", link, "--snapshot", snapshotFile).status, 4);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
