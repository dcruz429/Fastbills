/**
 * PURE OFFLINE COMPARISON ONLY. No filesystem, environment, DB, HTTP or SQL
 * execution imports. An "exact" result is never migration authorization.
 */
import { z } from "zod";
import { BASE_PREREQUISITES, EXPECTED_RCM_TABLES, SUPERVISION_PREREQUISITES } from "./expected-schema";
const name = z.string().regex(/^[a-z_][a-z0-9_]*$/).max(100);
const expression = z.string().min(1).max(4000);
const strings = z.array(name).max(100);
const columnSchema = z.object({
  name, type: z.string().min(1).max(100), notNull: z.boolean(), default: expression.nullable(),
  identity: z.enum(["always", "by default"]).nullable(),
  collationPolicy: z.enum(["database-default", "explicit"]),
  generated: expression.nullable(),
}).strict();
const foreignKeySchema = z.object({
  columns: strings, referencedSchema: name, table: name, referencedColumns: strings,
  onDelete: z.enum(["no action", "cascade", "set null", "restrict", "set default"]),
  onUpdate: z.enum(["no action", "cascade", "set null", "restrict", "set default"]),
  deferrable: z.boolean(), initiallyDeferred: z.boolean(), validated: z.boolean(),
}).strict();
const indexSchema = z.object({
  name, unique: z.boolean(), method: name,
  keys: z.array(z.object({ column: name, order: z.enum(["asc", "desc"]), nulls: z.enum(["first", "last"]) }).strict()),
  predicate: expression.nullable(), include: strings, valid: z.boolean(), ready: z.boolean(),
  defaultCollations: z.boolean(), defaultOperatorClasses: z.boolean(), nullsNotDistinct: z.boolean(),
}).strict();
export const tableSchema = z.object({
  schema: name, name, columns: z.array(columnSchema).max(100),
  primaryKey: strings, primaryKeyValid: z.boolean(), foreignKeys: z.array(foreignKeySchema).max(100),
  checks: z.array(z.object({ expression, validated: z.boolean(), noInherit: z.boolean() }).strict()).max(100),
  indexes: z.array(indexSchema).max(100), uniqueConstraints: z.array(strings).max(100),
  triggers: z.array(expression).max(100), rowSecurity: z.boolean(), forceRowSecurity: z.boolean(),
  kind: z.enum(["ordinary", "partitioned", "view", "foreign", "materialized-view"]),
  persistence: z.enum(["permanent", "unlogged", "temporary"]), partitionKey: expression.nullable(),
  primaryKeyDeferrable: z.boolean(), primaryKeyInitiallyDeferred: z.boolean(),
}).strict().refine(t => new Set(t.columns.map(c => c.name)).size === t.columns.length, "Duplicate columns");
const reference = z.string().min(1).max(200).regex(/^[A-Za-z0-9_./:-]+$/);
export const identitySchema = z.object({
  format: z.literal("rcm-development-identity/v1"),
  targetEnvironment: z.literal("DEVELOPMENT"), projectRef: reference,
  providerAccountRef: reference, canonicalDatabaseRef: reference,
  runtimeBindingResourceRef: reference, toolingBindingResourceRef: reference,
  // Both staging and production must be accounted for, never merely omitted.
  otherEnvironments: z.array(z.object({
    environment: z.enum(["STAGING", "PRODUCTION"]),
    status: z.enum(["identified", "not-provisioned", "unknown"]),
    providerAccountRef: reference.nullable(), canonicalDatabaseRef: reference.nullable(),
  }).strict()).length(2),
  environmentOwnerApprovalRef: reference.nullable(), metadataExportApprovalRef: reference.nullable(),
  releaseCommit: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();
export const snapshotSchema = z.object({
  format: z.literal("rcm-development-catalog/v1"), targetEnvironment: z.literal("DEVELOPMENT"),
  providerAccountRef: reference, canonicalDatabaseRef: reference,
  metadataExportApprovalRef: reference, releaseCommit: z.string().regex(/^[a-f0-9]{40}$/),
  completeness: z.literal("all-owned-tables-and-required-base-metadata"),
  tables: z.array(tableSchema).max(100),
}).strict().refine(s => new Set(s.tables.map(t => `${t.schema}.${t.name}`)).size === s.tables.length, "Duplicate tables");
export type CatalogTable = z.infer<typeof tableSchema>;
export type CatalogSnapshot = z.infer<typeof snapshotSchema>;
export type Identity = z.infer<typeof identitySchema>;

/** Whitespace/case normalization OUTSIDE quotes only; no guessed SQL rewrites. */
export function normalizeSql(value: string): string {
  const tokens: string[] = [];
  const pattern = /'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|::|>=|<=|<>|!=|[(),.=<>+\-*/]/gy;
  let offset = 0;
  while (offset < value.length) {
    if (/\s/.test(value[offset])) { offset++; continue; }
    pattern.lastIndex = offset;
    const match = pattern.exec(value);
    if (!match) throw new Error("Unsupported SQL representation: manual catalog review required");
    tokens.push(/^[a-z_]/i.test(match[0]) ? match[0].toLowerCase() : match[0]);
    offset = pattern.lastIndex;
  }
  if (!tokens.length) throw new Error("Empty SQL representation");
  return tokens.join(" ");
}
export function normalizeType(type: string): string {
  const normalized = type.toLowerCase().replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim();
  return ({ int4: "integer", int8: "bigint", bool: "boolean", timestamptz: "timestamp with time zone" } as Record<string, string>)[normalized] ?? normalized;
}
export function fingerprint(input: unknown): string {
  const ordered = (value: any): any => Array.isArray(value) ? value.map(ordered) :
    value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return JSON.stringify(ordered(input));
}
const sort = <T,>(values: T[]) => [...values].sort((a, b) => fingerprint(a).localeCompare(fingerprint(b)));
export function canonicalTable(t: CatalogTable) {
  return {
    ...t, columns: sort(t.columns.map(c => ({
      ...c, type: normalizeType(c.type), default: c.default === null ? null : normalizeSql(c.default),
    }))), foreignKeys: sort(t.foreignKeys), checks: sort(t.checks.map(c => ({ ...c, expression: normalizeSql(c.expression) }))),
    indexes: sort(t.indexes.map(i => ({ ...i, predicate: i.predicate === null ? null : normalizeSql(i.predicate) }))),
    uniqueConstraints: sort(t.uniqueConstraints), triggers: sort(t.triggers),
  };
}
const secretLike = (input: unknown) => /postgres(?:ql)?:\/\/|:\/\/[^"\s]*@|password\s*=|PRIVATE KEY/i.test(JSON.stringify(input));
function identityIssues(identity: Identity, snapshot: CatalogSnapshot): string[] {
  const issues: string[] = [];
  const unknown = (value: string | null) => !value || /UNCONFIRMED|UNKNOWN|PLACEHOLDER/i.test(value);
  if ([identity.projectRef, identity.providerAccountRef, identity.canonicalDatabaseRef,
    identity.environmentOwnerApprovalRef, identity.metadataExportApprovalRef].some(unknown)) issues.push("Identity/approval evidence is unconfirmed");
  if (identity.runtimeBindingResourceRef !== identity.canonicalDatabaseRef ||
      identity.toolingBindingResourceRef !== identity.canonicalDatabaseRef) issues.push("Runtime/tooling resource bindings disagree");
  if (new Set(identity.otherEnvironments.map(e => e.environment)).size !== 2) issues.push("Staging/production inventory is incomplete");
  for (const other of identity.otherEnvironments) {
    if (other.status === "unknown") issues.push(`${other.environment} separation is unknown`);
    if (other.status === "identified" && (unknown(other.providerAccountRef) || unknown(other.canonicalDatabaseRef)))
      issues.push(`${other.environment} resource is unconfirmed`);
    if (other.status === "not-provisioned" && (other.canonicalDatabaseRef !== null || other.providerAccountRef !== null))
      issues.push(`${other.environment} has contradictory inventory`);
    if (other.status === "identified" && other.providerAccountRef === identity.providerAccountRef &&
        other.canonicalDatabaseRef === identity.canonicalDatabaseRef) issues.push(`${other.environment} aliases the development database`);
  }
  for (const key of ["providerAccountRef", "canonicalDatabaseRef", "metadataExportApprovalRef", "releaseCommit"] as const)
    if (snapshot[key] !== identity[key]) issues.push(`Snapshot ${key} does not match attestation`);
  return issues;
}
export function compareCatalog(identityInput: unknown, snapshotInput: unknown) {
  const base = { databaseContacted: false, migrationAuthorized: false, supervisorAssignmentAuthorized: false,
    evidenceBasis: "supplied-files-only", identityVerifiedAgainstProvider: false,
    nonStructuralChecks: ["object ownership/ACL/sequence privileges", "migration history", "release delivery", "department policy"] };
  if (secretLike(identityInput) || secretLike(snapshotInput))
    return { ...base, status: "incomplete" as const, issues: ["Credential-like material rejected; supply metadata only"], tables: [] };
  const identityResult = identitySchema.safeParse(identityInput), snapshotResult = snapshotSchema.safeParse(snapshotInput);
  if (!identityResult.success || !snapshotResult.success)
    return { ...base, status: "incomplete" as const, issues: ["Metadata/identity format is incomplete or contains unexpected fields"], tables: [] };
  const issues = identityIssues(identityResult.data, snapshotResult.data);
  if (issues.length) return { ...base, status: "incomplete" as const, issues, tables: [] };
  const actual = new Map(snapshotResult.data.tables.map(t => [t.name, t]));
  const expectedNames = new Set([...EXPECTED_RCM_TABLES, ...BASE_PREREQUISITES].map(t => t.name));
  for (const t of snapshotResult.data.tables) {
    if (t.schema !== "public" || !expectedNames.has(t.name)) issues.push(`Unexpected object ownership: ${t.schema}.${t.name}`);
  }
  const tables: { name: string; state: "missing" | "exact" | "mismatched"; issues: string[] }[] = [];
  try {
    for (const expected of EXPECTED_RCM_TABLES) {
      const found = actual.get(expected.name);
      const problems: string[] = [];
      if (found) {
        const intended = canonicalTable(tableSchema.parse(expected)), observed = canonicalTable(found);
        for (const key of Object.keys(intended) as (keyof typeof intended)[])
          if (fingerprint(intended[key]) !== fingerprint(observed[key])) problems.push(`Definition differs: ${key}`);
      }
      tables.push({ name: expected.name, state: !found ? "missing" : problems.length ? "mismatched" : "exact", issues: problems });
    }
    for (const expected of BASE_PREREQUISITES) {
      const found = actual.get(expected.name), problems: string[] = [];
      if (found) {
        if (found.schema !== "public" || found.kind !== "ordinary" || found.persistence !== "permanent" ||
            !found.primaryKeyValid || found.primaryKeyDeferrable || found.primaryKeyInitiallyDeferred ||
            found.rowSecurity || found.forceRowSecurity || found.triggers.length)
          problems.push("Unsupported base relation/primary key");
        if (JSON.stringify(found.primaryKey) !== JSON.stringify(expected.primaryKey)) problems.push("Primary key differs");
        for (const column of expected.columns) {
          const candidate = found.columns.find(c => c.name === column.name);
          if (!candidate || normalizeType(candidate.type) !== normalizeType(column.type) ||
              candidate.notNull !== column.notNull || candidate.collationPolicy !== "database-default" ||
              candidate.generated !== null) problems.push(`Required column differs: ${column.name}`);
        }
        for (const foreignKey of expected.foreignKeys)
          if (!found.foreignKeys.some(fk => fingerprint(fk) === fingerprint(foreignKey))) problems.push("Required base foreign key differs");
      }
      tables.push({ name: expected.name, state: !found ? "missing" : problems.length ? "mismatched" : "exact", issues: problems });
    }
  } catch {
    return { ...base, status: "incomplete" as const, issues: ["Unsupported catalog expression; manual normalization review required"], tables: [] };
  }
  const prerequisitesSatisfied = SUPERVISION_PREREQUISITES.every(name => tables.find(t => t.name === name)?.state === "exact");
  const status = issues.length || tables.some(t => t.state === "mismatched") ? "mismatched"
    : tables.some(t => t.state === "missing") ? "missing" : "exact";
  return { ...base, status, issues, tables, prerequisitesSatisfied,
    supervisionState: tables.find(t => t.name === "rcm_call_supervisors")!.state,
    nextStep: status === "mismatched" ? "STOP: review drift; do not apply or reconcile automatically"
      : status === "missing" ? "Review missing objects and approved migration order; no execution authorized"
      : "Structure matches reviewed manifest only; no replay or activation authorized" };
}
