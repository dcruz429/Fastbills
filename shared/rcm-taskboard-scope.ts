import { permissionAllowed, type AccessContext } from "./rcm-access-policy";

export const BOARD_DEPARTMENTS = [
  "Verification", "Billing", "Posting", "Collections", "Denials",
  "Arbitration", "Checks", "Closed", "Case Management / RTP",
] as const;

/**
 * Per-department guards for the unified preview.
 * A role grant alone never adds a clinic assignment.
 * Checks additionally requires checks.read, even for an admin.
 */
export function allowedBoardDepartments(ctx: AccessContext): string[] {
  if (!permissionAllowed(ctx, "tasks.read")) return [];
  const canReadChecks = permissionAllowed(ctx, "checks.read");
  return BOARD_DEPARTMENTS.filter(name =>
    (ctx.isSystemAdmin || ctx.departmentIds.has(name)) &&
    (name !== "Checks" || canReadChecks),
  );
}

export function hasBoardScope(ctx: AccessContext): boolean {
  return allowedBoardDepartments(ctx).length > 0 &&
    (ctx.isSystemAdmin || ctx.clinicIds.size > 0);
}
