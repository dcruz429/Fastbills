import {test} from "node:test";
import {strict as assert} from "node:assert";
import {canQualityReview,isQaScore,taskQaDepartment} from "./rcm-quality-policy";
test("independent reviewer cannot review their own assigned task",()=>{
 assert.equal(canQualityReview(3,3,true),false);
 assert.equal(canQualityReview(4,3,true),true);
 assert.equal(canQualityReview(3,null,true),false);
});
test("QA only on completed records with a meaningful score",()=>{
 assert.equal(canQualityReview(4,3,false),false);
 assert.equal(isQaScore(0),true);
 assert.equal(isQaScore(100),true);
 assert.equal(isQaScore(101),false);
 assert.equal(isQaScore(12.5),false);
});
test("QA safely classifies done and verified task states",()=>{
 assert.equal(taskQaDepartment("done","billed"),"Billing");
 assert.equal(taskQaDepartment("ready_for_billing","verified"),"Verification");
 assert.equal(taskQaDepartment("for_verification","assigned"),null);
});
