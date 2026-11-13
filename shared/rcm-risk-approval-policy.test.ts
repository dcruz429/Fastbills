import {test} from "node:test";
import {strict as assert} from "node:assert";
import {requiresAssignmentApproval,canReviewRiskApproval,decisionAllowed} from "./rcm-risk-approval-policy";
test("high and critical assignments need independent approval",()=>{
  assert.equal(requiresAssignmentApproval("critical"),true);
  assert.equal(requiresAssignmentApproval("high"),true);
  assert.equal(requiresAssignmentApproval("medium"),false);
});
test("requesters cannot approve their own changes",()=>{
  assert.equal(canReviewRiskApproval(1,1),false);
  assert.equal(canReviewRiskApproval(1,2),true);
});
test("only pending requests can be reviewed",()=>{
  assert.equal(decisionAllowed("pending","approved"),true);
  assert.equal(decisionAllowed("approved","rejected"),false);
  assert.equal(decisionAllowed("pending","consumed"),false);
});
