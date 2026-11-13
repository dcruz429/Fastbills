/**
 * SQL transaction integration probe for RCM assignments and two-person approvals.
 *
 * This is NOT a server/API endpoint test. It checks the original tables and
 * the SQL transaction shapes used by the new endpoints. Synthetic fixtures
 * are created inside one transaction which is unconditionally rolled back.
 *
 * Run: DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-assignment-integration.ts
 */
import { randomUUID } from "node:crypto";
import { pool } from "../server/db";
import { resolveRcmAccess } from "../server/rcm-access-service";
import { resourceAllowed } from "../shared/rcm-access-policy";
import { canReviewRiskApproval, requiresAssignmentApproval } from "../shared/rcm-risk-approval-policy";
import { canAssignTaskState, taskDepartment } from "../shared/rcm-task-assignment-policy";

const EXPECTED = "fastbills_rcm_restore_test";
function check(condition: unknown, title: string): asserts condition {
  if (!condition) throw new Error("FAIL: " + title);
  console.log("PASS: " + title);
}
async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw || decodeURIComponent(new URL(raw).pathname) !== "/" + EXPECTED) {
    throw new Error("Refusing to run outside the named restore-test database");
  }
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const current = await client.query("SELECT current_database() AS db");
    check(current.rows[0]?.db === EXPECTED, "connected only to restore-test database");
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '15000ms'");

    const tag = randomUUID().slice(0, 12);
    const clinic = await client.query(
      "INSERT INTO clinics(name) VALUES($1) RETURNING id",
      ["RCM Synthetic Clinic " + tag],
    );
    const clinicId = Number(clinic.rows[0].id);
    // Synthetic accounts do not have usable credentials. They exist only until ROLLBACK.
    const makeUser = async (role: "manager" | "biller", label: string) => {
      const result = await client.query(
        "INSERT INTO users(username,password,full_name,role,active) VALUES($1,$2,$3,$4,true) RETURNING id",
        ["rcm_fixture_" + label + "_" + tag, "DISABLED_SYNTHETIC_LOGIN", "RCM Synthetic " + label + " " + tag, role],
      );
      return Number(result.rows[0].id);
    };
    const manager = await makeUser("manager", "manager");
    const reviewer = await makeUser("manager", "reviewer");
    const employee = await makeUser("biller", "employee");
    const outOfScope = await makeUser("biller", "outsider");

    for (const userId of [manager, reviewer, employee]) {
      await client.query("INSERT INTO rcm_user_clinics(user_id,clinic_id) VALUES($1,$2)",[userId,clinicId]);
      await client.query("INSERT INTO rcm_user_departments(user_id,department_key) VALUES($1,'Billing')",[userId]);
    }
    for (const [id,permission] of [[manager,"tasks.assign"],[reviewer,"tasks.review"]] as const) {
      await client.query(
        "INSERT INTO rcm_user_permission_overrides(user_id,permission_key,effect) VALUES($1,$2,'allow')",
        [id,permission],
      );
    }
    const scope = { departmentId:"Billing", clinicId };
    const actor = await resolveRcmAccess(manager, client);
    const independent = await resolveRcmAccess(reviewer, client);
    const recipient = await resolveRcmAccess(employee, client);
    const outsider = await resolveRcmAccess(outOfScope, client);
    check(!!actor && resourceAllowed(actor.context,"tasks.assign",scope), "synthetic manager has scoped assignment permission");
    check(!!independent && resourceAllowed(independent.context,"tasks.review",scope), "independent reviewer has scoped review permission");
    check(!!recipient && resourceAllowed(recipient.context,"tasks.read",scope), "employee eligible for scoped assignment");
    check(!!outsider && !resourceAllowed(outsider.context,"tasks.read",scope), "outside-clinic employee cannot be assigned");

    const low = await client.query(
      "INSERT INTO tasks(patient_name,clinic_id,priority,bucket,status) VALUES($1,$2,'low','ready_for_billing','unassigned') RETURNING id",
      ["SYNTHETIC TEST RECORD " + tag, clinicId],
    );
    const taskId = Number(low.rows[0].id);
    const initial = await client.query(
      "SELECT id,bucket::text AS bucket,status::text AS status,assigned_user_id AS assignee FROM tasks WHERE id=$1 FOR UPDATE",
      [taskId],
    );
    check(taskDepartment(initial.rows[0].bucket)==="Billing" && canAssignTaskState(initial.rows[0].bucket,initial.rows[0].status), "synthetic Billing task is assignable");
    check(initial.rows[0].assignee===null && !requiresAssignmentApproval("low"), "low-risk task does not require approval");
    await client.query(
      "UPDATE tasks SET assigned_user_id=$2,status='assigned' WHERE id=$1",
      [taskId,employee],
    );
    await client.query(
      "INSERT INTO task_activity(task_id,user_id,action,field,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)",
      [taskId,manager,"RCM Task Board assignment changed","assignedUserId",null,String(employee)],
    );
    await client.query(
      "INSERT INTO notifications(user_id,task_id,message,read) VALUES($1,$2,$3,false)",
      [employee,taskId,"You have a new RCM task assignment."],
    );
    await client.query(
      "INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,'task.assignment',$3::jsonb)",
      [manager,employee,JSON.stringify({source:"tasks",recordId:taskId})],
    );
    const assigned = await client.query(
      "SELECT t.assigned_user_id AS assignee,t.status::text AS status, (SELECT count(*)::integer FROM task_activity WHERE task_id=t.id AND field='assignedUserId') AS history, (SELECT count(*)::integer FROM notifications WHERE task_id=t.id) AS notices, (SELECT count(*)::integer FROM rcm_access_audit WHERE event_type='task.assignment' AND payload->>'recordId'=$2) AS audits FROM tasks t WHERE t.id=$1",
      [taskId,String(taskId)],
    );
    check(assigned.rows[0].assignee===employee && assigned.rows[0].status==="assigned","assignment writes the original tasks record");
    check(assigned.rows[0].history===1 && assigned.rows[0].notices===1 && assigned.rows[0].audits===1,"activity, notification and audit entries were stored");
    check(initial.rows[0].assignee !== employee, "stale original assignee is detected by optimistic concurrency check");

    // Higher risk: a separate synthetic record, separate approval, and a single-use transition.
    const high = await client.query(
      "INSERT INTO tasks(patient_name,clinic_id,priority,bucket,status) VALUES($1,$2,'high','ready_for_billing','unassigned') RETURNING id",
      ["SYNTHETIC HIGH RISK TEST " + tag,clinicId],
    );
    const highId=Number(high.rows[0].id);
    check(requiresAssignmentApproval("high"),"high-risk assignment requires review");
    const approval=await client.query(
      "INSERT INTO rcm_task_approvals(task_id,requested_by,requested_assignee_id,expected_assignee_id,risk_level) VALUES($1,$2,$3,NULL,'high') RETURNING id,status",
      [highId,manager,employee],
    );
    const approvalId=approval.rows[0].id;
    check(approval.rows[0].status==="pending" && !canReviewRiskApproval(manager,manager) && canReviewRiskApproval(manager,reviewer),"independent reviewer requirement and pending state");
    await client.query(
      "UPDATE rcm_task_approvals SET status='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1",
      [approvalId,reviewer],
    );
    const authorized=await client.query(
      "SELECT id FROM rcm_task_approvals WHERE task_id=$1 AND requested_by=$2 AND requested_assignee_id IS NOT DISTINCT FROM $3::integer AND expected_assignee_id IS NOT DISTINCT FROM $4::integer AND status='approved' AND risk_level=$5 AND reviewed_at > now() - interval '48 hours' ORDER BY reviewed_at DESC LIMIT 1 FOR UPDATE",
      [highId,manager,employee,null,"high"],
    );
    check(authorized.rowCount===1,"approved exact assignment is consumable");
    const different=await client.query(
      "SELECT id FROM rcm_task_approvals WHERE task_id=$1 AND requested_by=$2 AND requested_assignee_id IS NOT DISTINCT FROM $3::integer AND status='approved'",
      [highId,manager,reviewer],
    );
    check(different.rowCount===0,"approved request cannot authorize another assignee");
    await client.query("UPDATE tasks SET assigned_user_id=$2,status='assigned' WHERE id=$1",[highId,employee]);
    await client.query(
      "UPDATE rcm_task_approvals SET status='consumed',consumed_at=now() WHERE id=$1 AND status='approved'",
      [approvalId],
    );
    const spent=await client.query("SELECT status FROM rcm_task_approvals WHERE id=$1",[approvalId]);
    check(spent.rows[0].status==="consumed","approval cannot be reused after consumption");

    await client.query("ROLLBACK");
    inTransaction=false;
    const residual=await client.query(
      "SELECT (SELECT count(*)::integer FROM tasks WHERE id=ANY($1::int[])) AS tasks, (SELECT count(*)::integer FROM clinics WHERE id=$2) AS clinics, (SELECT count(*)::integer FROM users WHERE id=ANY($3::int[])) AS users",
      [[taskId,highId],clinicId,[manager,reviewer,employee,outOfScope]],
    );
    check(residual.rows[0].tasks===0 && residual.rows[0].clinics===0 && residual.rows[0].users===0, "ROLLBACK removed synthetic tasks, clinic and users");
    console.log("PASS: PostgreSQL transaction integration probe complete; no persistent fixtures");
  } catch (e) {
    if (inTransaction) await client.query("ROLLBACK").catch(()=>{});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => {
  console.error("RCM assignment integration failed:", e instanceof Error ? e.message.split("\n")[0] : "unexpected error");
  process.exitCode=1;
});
