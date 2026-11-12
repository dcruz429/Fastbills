import { pool } from "./db";
import {
  defaultRolePermissions, permissionAllowed, resourceAllowed,
  type AccessContext, type RcmPermission, type ResourceScope,
} from "../shared/rcm-access-policy";

export interface ResolvedAccess {
  userId: number;
  context: AccessContext;
}

/**
 * Load RCM permissions from existing account identity plus secondary roles.
 * Role grants are unioned, but explicit role-level denials take precedence.
 * User-specific allow/deny wins over role policy. No scopes => no access.
 * Only the original admin role bypasses department and clinic scoping.
 */
export async function resolveRcmAccess(userId: number): Promise<ResolvedAccess | null> {
  const [identity, extras, departmentRows, clinicRows, rolePolicy, userOverrides] = await Promise.all([
    pool.query("SELECT id, role, active FROM users WHERE id=$1", [userId]),
    pool.query("SELECT role_slug FROM rcm_user_roles WHERE user_id=$1", [userId]),
    pool.query("SELECT department_key FROM rcm_user_departments WHERE user_id=$1", [userId]),
    pool.query("SELECT clinic_id FROM rcm_user_clinics WHERE user_id=$1", [userId]),
    pool.query("SELECT role_slug, permission_key, effect FROM rcm_role_permissions WHERE role_slug IN (SELECT role::text AS role_slug FROM users WHERE id=$1 UNION SELECT role_slug FROM rcm_user_roles WHERE user_id=$1)", [userId]),
    pool.query("SELECT permission_key, effect FROM rcm_user_permission_overrides WHERE user_id=$1", [userId]),
  ]);
  const user = identity.rows[0];
  if (!user?.active) return null;
  const roles = [user.role, ...extras.rows.map(x=>x.role_slug)];
  const rolePermissions = new Set<RcmPermission>();
  for (const role of roles) for (const permission of defaultRolePermissions(role)) rolePermissions.add(permission);
  for (const row of rolePolicy.rows) {
    if (row.effect === "allow") rolePermissions.add(row.permission_key as RcmPermission);
  }
  for (const row of rolePolicy.rows) {
    if (row.effect === "deny") rolePermissions.delete(row.permission_key as RcmPermission);
  }
  const userMap = new Map<RcmPermission, "allow" | "deny">();
  for (const row of userOverrides.rows) userMap.set(row.permission_key as RcmPermission, row.effect);
  return {
    userId,
    context: {
      rolePermissions,
      userOverrides: userMap,
      departmentIds: new Set(departmentRows.rows.map(x=>x.department_key)),
      clinicIds: new Set(clinicRows.rows.map(x=>Number(x.clinic_id))),
      isSystemAdmin: user.role === "admin",
    },
  };
}

export async function canReadScopedRcmTask(userId: number, scope: ResourceScope) {
  const access = await resolveRcmAccess(userId);
  return !!access && resourceAllowed(access.context, "tasks.read", scope);
}

export async function hasRcmPermission(userId: number, permission: RcmPermission) {
  const access = await resolveRcmAccess(userId);
  return !!access && permissionAllowed(access.context, permission);
}
