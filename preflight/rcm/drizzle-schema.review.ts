/**
 * REVIEW ONLY. Not imported by shared/schema.ts, server/db.ts or Drizzle config.
 * Mirrors all 11 SQL-owned RCM tables without making them eligible for db:push.
 * Promotion requires a separate ownership/drift review; there is no activation
 * flag, connection, migration runner or seed data here.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, numeric, primaryKey, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users, teams, clinics, tasks } from "../../shared/schema";
const instant = (name: string) => timestamp(name, { withTimezone: true });
export const roles = pgTable("rcm_roles", {
  slug: text("slug").primaryKey(), label: text("label").notNull(),
  isSystem: boolean("is_system").notNull().default(false), createdAt: instant("created_at").notNull().defaultNow(),
});
export const rolePermissions = pgTable("rcm_role_permissions", {
  roleSlug: text("role_slug").notNull().references(() => roles.slug, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull(), effect: text("effect").notNull(),
}, t => [primaryKey({ columns: [t.roleSlug, t.permissionKey] }),
  check("rcm_role_permissions_effect_check", sql.raw("effect IN ('allow','deny')"))]);
export const userRoles = pgTable("rcm_user_roles", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleSlug: text("role_slug").notNull().references(() => roles.slug, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.userId, t.roleSlug] })]);
export const overrides = pgTable("rcm_user_permission_overrides", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull(), effect: text("effect").notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.permissionKey] }),
  check("rcm_user_permission_overrides_effect_check", sql.raw("effect IN ('allow','deny')"))]);
export const departments = pgTable("rcm_user_departments", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  departmentKey: text("department_key").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.departmentKey] }), index("rcm_user_departments_key_idx").on(t.departmentKey, t.userId)]);
export const userClinics = pgTable("rcm_user_clinics", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.userId, t.clinicId] }), index("rcm_user_clinics_id_idx").on(t.clinicId, t.userId)]);
export const accessAudit = pgTable("rcm_access_audit", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  subjectUserId: integer("subject_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  createdAt: instant("created_at").notNull().defaultNow(),
}, t => [index("rcm_access_audit_subject_idx").on(t.subjectUserId, t.createdAt.desc().nullsFirst())]);
export const approvals = pgTable("rcm_task_approvals", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  requestedAssigneeId: integer("requested_assignee_id").references(() => users.id),
  expectedAssigneeId: integer("expected_assignee_id").references(() => users.id),
  riskLevel: text("risk_level").notNull(), status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => users.id), reviewNote: text("review_note"),
  requestedAt: instant("requested_at").notNull().defaultNow(), reviewedAt: instant("reviewed_at"), consumedAt: instant("consumed_at"),
}, t => [check("rcm_task_approvals_risk_level_check", sql.raw("risk_level IN ('high','critical')")),
  check("rcm_task_approvals_status_check", sql.raw("status IN ('pending','approved','rejected','consumed')")),
  uniqueIndex("rcm_task_approvals_one_pending_idx").on(t.taskId).where(sql.raw("status='pending'")),
  index("rcm_task_approvals_task_status_idx").on(t.taskId, t.status, t.requestedAt.desc().nullsFirst())]);
export const weights = pgTable("rcm_productivity_weights", {
  departmentKey: text("department_key").primaryKey(), weight: numeric("weight", { precision: 8, scale: 2 }).notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, () => [check("rcm_productivity_weights_weight_check", sql.raw("weight >= 0 AND weight <= 100"))]);
export const quality = pgTable("rcm_quality_reviews", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  source: text("source").notNull(), recordId: integer("record_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  reviewerId: integer("reviewer_id").notNull().references(() => users.id),
  reviewedAssigneeId: integer("reviewed_assignee_id").references(() => users.id), departmentKey: text("department_key").notNull(),
  clinicId: integer("clinic_id").references(() => clinics.id), verdict: text("verdict").notNull(), score: integer("score").notNull(),
  note: text("note"), createdAt: instant("created_at").notNull().defaultNow(),
}, t => [check("rcm_quality_reviews_source_check", sql.raw("source IN ('tasks')")),
  check("rcm_quality_reviews_verdict_check", sql.raw("verdict IN ('passed','needs_correction')")),
  check("rcm_quality_reviews_score_check", sql.raw("score BETWEEN 0 AND 100")),
  index("rcm_quality_review_lookup_idx").on(t.source, t.recordId, t.createdAt.desc().nullsFirst()),
  index("rcm_quality_review_reviewer_idx").on(t.reviewerId, t.createdAt.desc().nullsFirst())]);
export const supervision = pgTable("rcm_call_supervisors", {
  managerUserId: integer("manager_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  grantedBy: integer("granted_by").notNull().references(() => users.id), grantedAt: instant("granted_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.managerUserId, t.teamId] }), index("rcm_call_supervisors_team_idx").on(t.teamId)]);
