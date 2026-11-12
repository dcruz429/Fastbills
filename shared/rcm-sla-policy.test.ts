import {test} from "node:test";
import {strict as assert} from "node:assert";
import {taskSla} from "./rcm-sla-policy";
const now=new Date("2026-11-12T12:00:00Z");
test("missing or invalid due date never labels patient record overdue",()=>{
  assert.equal(taskSla(null,now).state,"missing_due_date");
  assert.equal(taskSla("garbage",now).state,"missing_due_date");
});
test("SLA warning begins at the configured time threshold",()=>{
  assert.equal(taskSla("2026-11-13T12:00:00Z",now).state,"due_soon");
  assert.equal(taskSla("2026-11-13T12:01:00Z",now).state,"on_track");
});
test("past due is overdue and boundary is due soon",()=>{
  assert.equal(taskSla("2026-11-12T11:59:00Z",now).state,"overdue");
  assert.equal(taskSla("2026-11-12T12:00:00Z",now).state,"due_soon");
});
