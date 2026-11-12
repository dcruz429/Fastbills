/**
 * Pure authorization tests. No server connections or HTTP requests;
 * never invokes maintenance handlers, modifies permissions, or writes data.
 */
import assert from "node:assert/strict";
import { legacyMaintenanceAllowed, type AccessContext, type RcmPermission } from "../shared/rcm-access-policy";

function context(admin: boolean, grants: RcmPermission[], denies: RcmPermission[] = []): AccessContext {
  return {
    isSystemAdmin: admin,
    rolePermissions: new Set(grants),
    userOverrides: new Map(denies.map(permission => [permission, "deny" as const])),
    departmentIds: new Set(),
    clinicIds: new Set(),
  };
}
let tested = 0;
function verify(label: string, ok: boolean) {
  assert.ok(ok, label);
  console.log("PASS: " + label);
  tested++;
}
for (const permission of ["tasks.update", "tasks.close"] as const) {
  verify(`system admin permitted ${permission}`,
    legacyMaintenanceAllowed(context(true, [permission]), permission));
  verify(`explicit admin deny blocks ${permission}`,
    !legacyMaintenanceAllowed(context(true, [permission], [permission]), permission));
  verify(`missing admin permission blocks ${permission}`,
    !legacyMaintenanceAllowed(context(true, []), permission));
  verify(`non-admin grant does not authorize ${permission}`,
    !legacyMaintenanceAllowed(context(false, [permission]), permission));
}
verify("update grant cannot authorize close",
  !legacyMaintenanceAllowed(context(true, ["tasks.update"]), "tasks.close"));
verify("close grant cannot authorize update",
  !legacyMaintenanceAllowed(context(true, ["tasks.close"]), "tasks.update"));
console.log(`PASS: ${tested} isolated legacy maintenance authorization checks; no database or HTTP calls`);
