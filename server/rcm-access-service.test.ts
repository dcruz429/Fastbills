import { test } from "node:test";
import { strict as assert } from "node:assert";
import { defaultRolePermissions, permissionAllowed, resourceAllowed, type AccessContext, type RcmPermission } from "../shared/rcm-access-policy";

function ctx(role: string, departments: string[] = [], clinics: number[] = []): AccessContext {
  return {
    rolePermissions: defaultRolePermissions(role),
    userOverrides: new Map(),
    departmentIds: new Set(departments),
    clinicIds: new Set(clinics),
    isSystemAdmin: role === "admin",
  };
}
test("supervisor access requires department AND clinic", () => {
  const user = ctx("supervisor", ["Billing", "Verification"], [2, 3]);
  assert.equal(resourceAllowed(user, "tasks.read", { departmentId: "Billing", clinicId: 2 }), true);
  assert.equal(resourceAllowed(user, "tasks.read", { departmentId: "Posting", clinicId: 2 }), false);
  assert.equal(resourceAllowed(user, "tasks.read", { departmentId: "Billing", clinicId: 4 }), false);
});
test("role alone never grants tenant/clinic scope", () => {
  assert.equal(resourceAllowed(ctx("account_manager"),"tasks.read",{departmentId:"Billing",clinicId:2}),false);
});
test("deny override wins over default grant", () => {
  const basic = ctx("manager",["Billing"],[2]);
  const withDeny:AccessContext = {...basic,userOverrides:new Map<RcmPermission,"allow"|"deny">([["tasks.assign","deny"]])};
  assert.equal(permissionAllowed(withDeny, "tasks.assign"),false);
});
test("user allow does not bypass scope", () => {
  const basic=ctx("biller",["Billing"],[2]);
  const withAllow:AccessContext={...basic,userOverrides:new Map<RcmPermission,"allow"|"deny">([["tasks.assign","allow"]])};
  assert.equal(resourceAllowed(withAllow,"tasks.assign",{departmentId:"Billing",clinicId:2}),true);
  assert.equal(resourceAllowed(withAllow,"tasks.assign",{departmentId:"Billing",clinicId:5}),false);
});
test("system admin is the only scope exception",()=>{
  assert.equal(resourceAllowed(ctx("admin"),"tasks.read",{departmentId:"Other",clinicId:999}),true);
  assert.equal(resourceAllowed(ctx("supervisor"),"tasks.read",{departmentId:"Other",clinicId:999}),false);
});
