/**
 * OFFLINE expected metadata. No database/config/environment imports.
 * SQL migrations remain authoritative; this manifest does not apply them.
 */
export interface ColumnSpec {
  name: string; type: string; notNull: boolean; default: string | null;
  identity: "always" | null;
  collationPolicy: "database-default";
  generated: null;
}
export interface ForeignKeySpec {
  columns: string[]; table: string; referencedColumns: string[];
  onDelete: "no action" | "cascade" | "set null";
  onUpdate: "no action"; deferrable: false; initiallyDeferred: false; validated: true;
  referencedSchema: "public";
}
export interface IndexSpec {
  name: string; unique: boolean; method: "btree"; keys: { column: string; order: "asc" | "desc"; nulls: "first" | "last" }[];
  predicate: string | null; include: string[]; valid: true; ready: true;
  defaultCollations: true; defaultOperatorClasses: true; nullsNotDistinct: false;
}
export interface TableSpec {
  schema: "public"; name: string; columns: ColumnSpec[]; primaryKey: string[];
  primaryKeyValid: true; foreignKeys: ForeignKeySpec[];
  checks: { expression: string; validated: true; noInherit: false }[]; indexes: IndexSpec[];
  uniqueConstraints: string[][]; triggers: string[]; rowSecurity: false; forceRowSecurity: false;
  kind: "ordinary"; persistence: "permanent"; partitionKey: null;
  primaryKeyDeferrable: false; primaryKeyInitiallyDeferred: false;
}
const column = (name: string, type: string, notNull = true, fallback: string | null = null): ColumnSpec =>
  ({ name, type, notNull, default: fallback, identity: null, collationPolicy: "database-default", generated: null });
const id = (): ColumnSpec => ({ ...column("id", "bigint"), identity: "always" });
const text = (name: string, notNull = true, fallback: string | null = null) => column(name, "text", notNull, fallback);
const integer = (name: string, notNull = true) => column(name, "integer", notNull);
const time = (name: string, notNull = true, fallback: string | null = "now()") => column(name, "timestamp with time zone", notNull, fallback);
const fk = (name: string, table: string, referenced = "id", onDelete: ForeignKeySpec["onDelete"] = "no action"): ForeignKeySpec =>
  ({ columns: [name], table, referencedColumns: [referenced], onDelete, onUpdate: "no action",
    deferrable: false, initiallyDeferred: false, validated: true, referencedSchema: "public" });
const ix = (name: string, columns: string[], unique = false, predicate: string | null = null): IndexSpec => ({
  name, unique, method: "btree", keys: columns.map(value => ({
    column: value.replace(/ DESC$/, ""), order: value.endsWith(" DESC") ? "desc" : "asc",
    nulls: value.endsWith(" DESC") ? "first" : "last",
  })), predicate, include: [], valid: true, ready: true,
  defaultCollations: true, defaultOperatorClasses: true, nullsNotDistinct: false,
});
const table = (name: string, columns: ColumnSpec[], primaryKey: string[], foreignKeys: ForeignKeySpec[] = [],
  checks: string[] = [], indexes: IndexSpec[] = []): TableSpec =>
  ({ schema: "public", name, columns, primaryKey, primaryKeyValid: true, foreignKeys,
    checks: checks.map(expression => ({ expression, validated: true, noInherit: false })), indexes,
    uniqueConstraints: [], triggers: [], rowSecurity: false, forceRowSecurity: false,
    kind: "ordinary", persistence: "permanent", partitionKey: null,
    primaryKeyDeferrable: false, primaryKeyInitiallyDeferred: false });

export const EXPECTED_RCM_TABLES: TableSpec[] = [
  table("rcm_roles", [text("slug"), text("label"), column("is_system", "boolean", true, "false"), time("created_at")], ["slug"]),
  table("rcm_role_permissions", [text("role_slug"), text("permission_key"), text("effect")],
    ["role_slug", "permission_key"], [fk("role_slug", "rcm_roles", "slug", "cascade")], ["effect IN ('allow','deny')"]),
  table("rcm_user_roles", [integer("user_id"), text("role_slug")], ["user_id", "role_slug"],
    [fk("user_id", "users", "id", "cascade"), fk("role_slug", "rcm_roles", "slug", "cascade")]),
  table("rcm_user_permission_overrides",
    [integer("user_id"), text("permission_key"), text("effect"), integer("updated_by", false), time("updated_at")],
    ["user_id", "permission_key"], [fk("user_id", "users", "id", "cascade"), fk("updated_by", "users", "id", "set null")],
    ["effect IN ('allow','deny')"]),
  table("rcm_user_departments", [integer("user_id"), text("department_key")], ["user_id", "department_key"],
    [fk("user_id", "users", "id", "cascade")], [], [ix("rcm_user_departments_key_idx", ["department_key", "user_id"])]),
  table("rcm_user_clinics", [integer("user_id"), integer("clinic_id")], ["user_id", "clinic_id"],
    [fk("user_id", "users", "id", "cascade"), fk("clinic_id", "clinics", "id", "cascade")], [],
    [ix("rcm_user_clinics_id_idx", ["clinic_id", "user_id"])]),
  table("rcm_access_audit",
    [id(), integer("actor_user_id", false), integer("subject_user_id", false), text("event_type"),
      column("payload", "jsonb", true, "'{}'::jsonb"), time("created_at")],
    ["id"], [fk("actor_user_id", "users", "id", "set null"), fk("subject_user_id", "users", "id", "set null")], [],
    [ix("rcm_access_audit_subject_idx", ["subject_user_id", "created_at DESC"])]),
  table("rcm_task_approvals",
    [id(), integer("task_id"), integer("requested_by"), integer("requested_assignee_id", false),
      integer("expected_assignee_id", false), text("risk_level"), text("status", true, "'pending'::text"),
      integer("reviewed_by", false), text("review_note", false), time("requested_at"),
      time("reviewed_at", false, null), time("consumed_at", false, null)],
    ["id"], [fk("task_id", "tasks", "id", "cascade"), fk("requested_by", "users"),
      fk("requested_assignee_id", "users"), fk("expected_assignee_id", "users"), fk("reviewed_by", "users")],
    ["risk_level IN ('high','critical')", "status IN ('pending','approved','rejected','consumed')"],
    [ix("rcm_task_approvals_one_pending_idx", ["task_id"], true, "status='pending'"),
      ix("rcm_task_approvals_task_status_idx", ["task_id", "status", "requested_at DESC"])]),
  table("rcm_productivity_weights",
    [text("department_key"), column("weight", "numeric(8,2)"), integer("updated_by", false), time("updated_at")],
    ["department_key"], [fk("updated_by", "users", "id", "set null")], ["weight >= 0 AND weight <= 100"]),
  table("rcm_quality_reviews",
    [id(), text("source"), integer("record_id"), integer("reviewer_id"), integer("reviewed_assignee_id", false),
      text("department_key"), integer("clinic_id", false), text("verdict"), integer("score"),
      text("note", false), time("created_at")],
    ["id"], [fk("record_id", "tasks", "id", "cascade"), fk("reviewer_id", "users"),
      fk("reviewed_assignee_id", "users"), fk("clinic_id", "clinics")],
    ["source IN ('tasks')", "verdict IN ('passed','needs_correction')", "score BETWEEN 0 AND 100"],
    [ix("rcm_quality_review_lookup_idx", ["source", "record_id", "created_at DESC"]),
      ix("rcm_quality_review_reviewer_idx", ["reviewer_id", "created_at DESC"])]),
  table("rcm_call_supervisors",
    [integer("manager_user_id"), integer("team_id"), integer("granted_by"), time("granted_at")],
    ["manager_user_id", "team_id"],
    [fk("manager_user_id", "users", "id", "cascade"), fk("team_id", "teams", "id", "cascade"), fk("granted_by", "users")],
    [], [ix("rcm_call_supervisors_team_idx", ["team_id"])]),
];
// These are deliberately PARTIAL prerequisites, not definitions to recreate.
export const BASE_PREREQUISITES = [
  { name: "users", columns: [integer("id"), text("full_name"), column("role", "public.role"), column("active", "boolean")], primaryKey: ["id"], foreignKeys: [] },
  { name: "teams", columns: [integer("id"), text("name")], primaryKey: ["id"], foreignKeys: [] },
  { name: "clinics", columns: [integer("id"), text("name")], primaryKey: ["id"], foreignKeys: [] },
  { name: "tasks", columns: [integer("id")], primaryKey: ["id"], foreignKeys: [] },
  { name: "user_teams", columns: [integer("id"), integer("team_id"), integer("user_id")], primaryKey: ["id"],
    foreignKeys: [fk("team_id", "teams"), fk("user_id", "users")] },
];
export const SUPERVISION_PREREQUISITES = [
  "users", "teams", "clinics", "user_teams", "rcm_roles", "rcm_role_permissions", "rcm_user_roles",
  "rcm_user_permission_overrides", "rcm_user_departments", "rcm_user_clinics", "rcm_access_audit",
];
export const SQL_SOURCE_HASHES: Record<string, string> = {
  "migrations/20261112_rcm_access_foundation.sql": "25513559e0104ee654ff459857517960b278f30ceef2c50cbd1acf342a177f25",
  "migrations/20261112_rcm_approvals_productivity.sql": "a547729af0cc71be8cb293e561678e80fc65e3e19bcae2a3908272618f57ecb1",
  "migrations/20261112_rcm_quality_reviews.sql": "958fd5cca0117fcdb4fff7cf20273e3de3536aa5ceb96720f719c9ea0d456a03",
  "migrations/20261113_call_supervision.sql": "78042d25c6f1eb1c6a375351b7a5becd6cfb627ff9e5abf34f40af1ff887f445",
};
