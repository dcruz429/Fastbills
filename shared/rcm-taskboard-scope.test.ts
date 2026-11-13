import { test } from "node:test";
import { strict as assert } from "node:assert";
import { allowedBoardDepartments, hasBoardScope } from "./rcm-taskboard-scope";
import { defaultRolePermissions, type AccessContext, type RcmPermission } from "./rcm-access-policy";

function ctx(role: string, departments: string[], clinics: number[], overrides: [RcmPermission, "allow"|"deny"][] = []): AccessContext {
  return {
    rolePermissions: defaultRolePermissions(role),
    userOverrides: new Map(overrides),
    departmentIds: new Set(departments),
    clinicIds: new Set(clinics),
    isSystemAdmin: role === "admin",
  };
}
test("only specifically assigned departments appear for staff", () => {
  const d = allowedBoardDepartments(ctx("manager", ["Posting","Billing"],[4]));
  assert.deepEqual(d, ["Billing","Posting"]);
});
test("checks never visible under broad task-read permission alone", () => {
  assert.deepEqual(allowedBoardDepartments(ctx("manager",["Checks","Collections"],[4])), ["Collections"]);
});
test("payment specialist requires explicit clinic and department", () => {
  const allowed = ctx("payment_specialist",["Checks"],[4]);
  assert.deepEqual(allowedBoardDepartments(allowed),["Checks"]);
  assert.equal(hasBoardScope(allowed),true);
  assert.equal(hasBoardScope(ctx("payment_specialist",["Checks"],[])),false);
});
test("individual denies block even administrator Checks", () => {
  const allowed = allowedBoardDepartments(ctx("admin",[],[],[["checks.read","deny"]]));
  assert.equal(allowed.includes("Checks"),false);
  assert.equal(allowed.includes("Billing"),true);
});
test("read-denied users have no board scope", () => {
  assert.equal(hasBoardScope(ctx("manager",["Billing"],[4],[["tasks.read","deny"]])),false);
});
