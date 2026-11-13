import {test} from "node:test";
import {strict as assert} from "node:assert";
import {taskDepartment,canAssignTaskState,assignmentChanged} from "./rcm-task-assignment-policy";

test("only active verification and billing buckets map to safe departments",()=>{
  assert.equal(taskDepartment("for_verification"),"Verification");
  assert.equal(taskDepartment("ready_for_billing"),"Billing");
  assert.equal(taskDepartment("done"),null);
  assert.equal(taskDepartment("unexpected"),null);
});
test("completed or transferred tasks are locked for assignment",()=>{
  assert.equal(canAssignTaskState("done","unassigned"),false);
  assert.equal(canAssignTaskState("for_verification","done"),false);
  assert.equal(canAssignTaskState("ready_for_billing","billed"),false);
  assert.equal(canAssignTaskState("ready_for_billing","dropped"),false);
  assert.equal(canAssignTaskState("for_verification","verified"),false);
});
test("non-complete stages remain assignable without touching patient data",()=>{
  assert.equal(canAssignTaskState("for_verification","unassigned"),true);
  assert.equal(canAssignTaskState("ready_for_billing","assigned"),true);
  assert.equal(canAssignTaskState("ready_for_billing","working_on_it"),true);
});
test("assignment concurrency distinguishes null from changed IDs",()=>{
  assert.equal(assignmentChanged(null,null),false);
  assert.equal(assignmentChanged(2,2),false);
  assert.equal(assignmentChanged(null,2),true);
  assert.equal(assignmentChanged(2,null),true);
});
