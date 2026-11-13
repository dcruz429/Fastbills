import { test } from "node:test";
import { strict as assert } from "node:assert";
import { defaultRolePermissions, permissionAllowed, resourceAllowed, type AccessContext, type RcmPermission } from "./rcm-access-policy";

const mk = (role: string, departments: string[] = [], clinics: number[] = []): AccessContext => ({
  rolePermissions: defaultRolePermissions(role),
  userOverrides: new Map(),
  departmentIds: new Set(departments),
  clinicIds: new Set(clinics),
  isSystemAdmin: role === "admin",
});

test("manager requires BOTH department and clinic for task visibility", () => {
  const ctx = mk("manager", ["Billing"], [11]);
  assert.equal(resourceAllowed(ctx, "tasks.read", {departmentId:"Billing",clinicId:11}), true);
  assert.equal(resourceAllowed(ctx, "tasks.read", {departmentId:"Posting",clinicId:11}), false);
  assert.equal(resourceAllowed(ctx, "tasks.read", {departmentId:"Billing",clinicId:12}), false);
});
test("empty assignment denies access even with role grant", () => {
  assert.equal(resourceAllowed(mk("manager"),"tasks.read",{departmentId:"Billing",clinicId:11}),false);
});
test("individual deny takes precedence over role allow", () => {
  const ctx=mk("manager",["Billing"],[11]);
  const denied:AccessContext={...ctx,userOverrides:new Map<RcmPermission,"allow"|"deny">([["tasks.assign","deny"]])};
  assert.equal(permissionAllowed(denied,"tasks.assign"),false);
});
test("individual allow can grant within scope but not outside it", () => {
  const ctx={...mk("biller",["Billing"],[11]),userOverrides:new Map<RcmPermission,"allow"|"deny">([["tasks.assign","allow"]])};
  assert.equal(resourceAllowed(ctx,"tasks.assign",{departmentId:"Billing",clinicId:11}),true);
  assert.equal(resourceAllowed(ctx,"tasks.assign",{departmentId:"Billing",clinicId:99}),false);
});
test("unknown legacy role fails closed", () => {
  assert.equal(permissionAllowed(mk("unknown"),"tasks.read"),false);
});
test("system admin bypasses scope only with permission", () => {
  assert.equal(resourceAllowed(mk("admin"),"tasks.read",{departmentId:"Posting",clinicId:999}),true);
  const deny={...mk("admin"),userOverrides:new Map<RcmPermission,"allow"|"deny">([["tasks.read","deny"]])};
  assert.equal(resourceAllowed(deny,"tasks.read",{departmentId:"Posting",clinicId:999}),false);
});
