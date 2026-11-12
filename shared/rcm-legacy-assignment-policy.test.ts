import {test} from "node:test";
import {strict as assert} from "node:assert";
import {LEGACY_ASSIGNMENT_SOURCES,legacyAssignmentDepartment,canAssignLegacyStatus,nextLegacyStatus,mustBlockLegacyHighRisk} from "./rcm-legacy-assignment-policy";
test("legacy sources are fixed and mapped to original tracker activity",()=>{
 assert.deepEqual(Object.keys(LEGACY_ASSIGNMENT_SOURCES).sort(),["arbitrations","checks","closed","collections","denials","postings"].sort());
 assert.equal(LEGACY_ASSIGNMENT_SOURCES.arbitrations.activityId,"arbitration_id");
});
test("RTP routes remain classified under Case Management",()=>{
 assert.equal(legacyAssignmentDepartment("closed","RTP - Collections"),"Case Management / RTP");
 assert.equal(legacyAssignmentDepartment("closed","Closed"),"Closed");
});
test("never assign a Done, Dropped or Closed legacy record",()=>{
 assert.equal(canAssignLegacyStatus("Done"),false);
 assert.equal(canAssignLegacyStatus("Dropped"),false);
 assert.equal(canAssignLegacyStatus("Working on it"),true);
});
test("existing in-progress status is preserved when assigning",()=>{
 assert.equal(nextLegacyStatus("Working on it",true),"Working on it");
 assert.equal(nextLegacyStatus("Unassigned",true),"Assigned");
 assert.equal(nextLegacyStatus("Assigned",false),"Unassigned");
});
test("high-risk legacy assignments await independent approval integration",()=>{
 assert.equal(mustBlockLegacyHighRisk("high"),true);
 assert.equal(mustBlockLegacyHighRisk("critical"),true);
 assert.equal(mustBlockLegacyHighRisk("medium"),false);
});
