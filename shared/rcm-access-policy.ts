/**
 * FastBills RCM authorization policy.
 * Phase 1 foundation: use through backend middleware before enabling scoped RCM endpoints.
 * Existing users.role values remain valid; do not migrate the existing enum in-place.
 */
export const RCM_PERMISSIONS = [
  "tasks.read", "tasks.create", "tasks.assign", "tasks.update",
  "tasks.review", "tasks.close", "productivity.read",
  "sla.read", "reports.read", "users.manage",
  "roles.manage", "scopes.manage", "settings.manage",
] as const;
export type RcmPermission = typeof RCM_PERMISSIONS[number];

export type RcmRole =
  | "admin" | "manager" | "verifier" | "biller" | "assigner"
  | "payment_specialist" | "account_manager" | "case_manager"
  | "supervisor" | "department_head" | "case_coordinator"
  | "quality_reviewer";

export const RCM_ROLE_DEFAULTS: Record<RcmRole, readonly RcmPermission[]> = {
  admin: RCM_PERMISSIONS,
  manager: ["tasks.read", "tasks.create", "tasks.assign", "tasks.update", "tasks.review", "tasks.close", "productivity.read", "sla.read", "reports.read"],
  verifier: ["tasks.read", "tasks.update", "sla.read"],
  biller: ["tasks.read", "tasks.update", "sla.read"],
  assigner: ["tasks.read", "tasks.create", "tasks.assign", "tasks.update"],
  payment_specialist: ["tasks.read", "tasks.update", "sla.read"],
  account_manager: ["tasks.read", "tasks.create", "tasks.assign", "tasks.update", "tasks.review", "productivity.read", "sla.read", "reports.read"],
  case_manager: ["tasks.read", "tasks.create", "tasks.update", "sla.read", "reports.read"],
  supervisor: ["tasks.read", "tasks.create", "tasks.assign", "tasks.update", "tasks.review", "productivity.read", "sla.read", "reports.read"],
  department_head: ["tasks.read", "tasks.create", "tasks.assign", "tasks.update", "tasks.review", "productivity.read", "sla.read", "reports.read"],
  case_coordinator: ["tasks.read", "tasks.create", "tasks.assign", "tasks.update", "sla.read"],
  quality_reviewer: ["tasks.read", "tasks.review", "sla.read"],
};

export type Override = "allow" | "deny";
export interface AccessContext {
  rolePermissions: ReadonlySet<RcmPermission>;
  userOverrides: ReadonlyMap<RcmPermission, Override>;
  departmentIds: ReadonlySet<string>;
  clinicIds: ReadonlySet<number>;
  /** Only explicit system-wide admin authority may bypass clinic/department scope. */
  isSystemAdmin: boolean;
}
export interface ResourceScope {
  departmentId: string;
  clinicId: number;
}

export function permissionAllowed(ctx: AccessContext, permission: RcmPermission): boolean {
  const override = ctx.userOverrides.get(permission);
  if (override === "deny") return false;
  if (override === "allow") return true;
  return ctx.rolePermissions.has(permission);
}

export function resourceAllowed(
  ctx: AccessContext,
  permission: RcmPermission,
  scope: ResourceScope,
): boolean {
  if (!permissionAllowed(ctx, permission)) return false;
  if (ctx.isSystemAdmin) return true;
  // Empty assignments fail closed. A selected department alone is insufficient.
  return ctx.departmentIds.has(scope.departmentId) && ctx.clinicIds.has(scope.clinicId);
}

export function defaultRolePermissions(role: string): Set<RcmPermission> {
  return new Set(RCM_ROLE_DEFAULTS[role as RcmRole] ?? []);
}
