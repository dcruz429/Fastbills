import {test} from "node:test";
import {strict as assert} from "node:assert";
import {scoreCompletions,DEFAULT_RCM_WEIGHTS} from "./rcm-productivity-policy";
const a={source:"tasks",recordId:1,department:"Billing",employeeId:10,completedAt:"2026-11-10T10:00:00Z"};
test("one completion event adds configured weight",()=>{
 const s=scoreCompletions([a],DEFAULT_RCM_WEIGHTS);
 assert.equal(s.completions,1);assert.equal(s.units,1.25);
});
test("multiple status Done entries on same source record do not double-count",()=>{
 const s=scoreCompletions([a,{...a,completedAt:"2026-11-11T12:00:00Z"}],DEFAULT_RCM_WEIGHTS);
 assert.equal(s.completions,1);
});
test("identical IDs from different trackers count separately",()=>{
 const s=scoreCompletions([a,{...a,source:"denials",department:"Denials"}],DEFAULT_RCM_WEIGHTS);
 assert.equal(s.completions,2);assert.equal(s.units,3.25);
});
test("unknown departments and invalid weights earn no units",()=>{
 const s=scoreCompletions([{...a,department:"Unknown"}],DEFAULT_RCM_WEIGHTS);
 assert.equal(s.completions,0);
});
test("by-department weighted units sum without floating drift",()=>{
 const s=scoreCompletions([a,{...a,recordId:2},{...a,recordId:3}],{Billing:0.1});
 assert.equal(s.units,0.3);assert.equal(s.byDepartment.Billing.units,0.3);
});
