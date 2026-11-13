/**
 * Surgical recovery for the ONE failed synthetic legacy write-security probe.
 * Refuses any database other than fastbills_rcm_synthetic_staging.
 * Default mode is a dry run (transaction rolled back); --apply commits.
 *
 * This expects exactly the known, fictional 2026-11-12 probe footprint.
 * Do NOT run after further test writes or against any other database.
 */
import {Pool, type PoolClient} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE_NOTE="Fictional staging record; not for actual billing";
const UNAUTH="TEST WRITE NEGATIVE DO NOT CREATE";
function check(ok:unknown,description:string):asserts ok {
 if(!ok)throw Error("REFUSED: "+description);
 console.log("PASS: "+description);
}
async function main(){
 const url=process.env.DATABASE_URL;
 if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+DB)
  throw Error("REFUSED: exact synthetic staging database required");
 const apply=process.argv.includes("--apply");
 if(process.argv.some(arg=>arg.startsWith("--") && arg!=="--apply"))
  throw Error("REFUSED: unknown flag");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();
 let begun=false;
 try {
  const current=await client.query("SELECT current_database() AS name");
  check(current.rows[0]?.name===DB,"connected only to synthetic staging");
  await client.query("BEGIN");begun=true;
  await client.query("SET LOCAL lock_timeout = '4s'");
  await client.query("SET LOCAL statement_timeout = '20000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112, 12)");
  const clinics=await client.query("SELECT id,name FROM clinics WHERE name=ANY($1::text[])",[["Evergreen Demo Clinic","Harbor Demo Clinic"]]);
  check(clinics.rowCount===2,"both fictional clinics present");
  const ids=new Map(clinics.rows.map(r=>[r.name,Number(r.id)]));
  const evergreen=ids.get("Evergreen Demo Clinic"),harbor=ids.get("Harbor Demo Clinic");
  const users=await client.query("SELECT id,username FROM users WHERE username=ANY($1::text[])",[["rcm_demo_biller","rcm_demo_other"]]);
  check(users.rowCount===2,"both fictional assignee accounts present");
  const u=new Map(users.rows.map(r=>[r.username,Number(r.id)]));
  const tracked=await client.query(
   "SELECT id,patient_name AS name,clinic_id AS clinic,bucket::text AS bucket,status::text AS status,priority::text AS priority,assigned_user_id AS assignee,task_outcome AS outcome,notes FROM tasks WHERE patient_name=ANY($1::text[]) FOR UPDATE",
   [["TEST PATIENT 001","TEST PATIENT 003","TEST PATIENT 008",UNAUTH]],
  );
  const only=(name:string)=>{
   const matches=tracked.rows.filter(t=>t.name===name);
   check(matches.length===1,"exactly one "+name+" fixture");
   return matches[0];
  };
  const t1=only("TEST PATIENT 001"),t3=only("TEST PATIENT 003"),t8=only("TEST PATIENT 008"),extra=only(UNAUTH);
  check(Number(t1.clinic)===harbor && t1.bucket==="for_verification" && t1.status==="done" &&
    t1.assignee===null && t1.priority==="low" && t1.outcome==="Send to Collections" && t1.notes===BASE_NOTE,
    "fixture 001 matches known transfer damage");
  check(Number(t3.clinic)===evergreen && t3.bucket==="ready_for_billing" && t3.status==="assigned" &&
    t3.priority==="high" && Number(t3.assignee)===u.get("rcm_demo_biller") && t3.outcome===null && t3.notes===BASE_NOTE,
    "fixture 003 matches known unauthorized assignment damage");
  check(Number(t8.clinic)===harbor && t8.bucket==="ready_for_billing" && t8.status==="assigned" &&
    t8.priority==="low" && Number(t8.assignee)===u.get("rcm_demo_other") && t8.outcome===null &&
    typeof t8.notes==="string" &&
    /^SHOULD NEVER BE SAVED\n\n\[Demo Billing Manager - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]\nSHOULD NEVER BE SAVED$/.test(t8.notes) &&
    t8.notes.length===94,
    "fixture 008 matches known unauthorized note damage");
  check(Number(extra.clinic)===evergreen && extra.bucket==="ready_for_billing" &&
    Number(extra.assignee)===u.get("rcm_demo_biller"),
    "unauthorized new task matches probe fixture");
  const details=await client.query(
   "SELECT task_id,field,action,count(*)::int AS count FROM task_activity WHERE task_id=ANY($1::int[]) GROUP BY task_id,field,action",
   [[t1.id,t3.id,t8.id,extra.id]],
  );
  const act=(taskId:number,field:string|null,action:string)=>
   details.rows.find(r=>Number(r.task_id)===taskId && r.field===field && r.action===action)?.count ?? 0;
  check(details.rows.length===8 && act(extra.id,null,"Task created")===1 && act(t1.id,"clinicId","Updated Clinic")===1 &&
   act(t1.id,"bucket","Updated Bucket")===1 && act(t1.id,"outcome","Updated Outcome")===1 &&
   act(t1.id,"status","Updated Status")===1 &&
   act(t3.id,"assignedUserId","Updated Assigned To")===1 &&
   act(t3.id,"status","Updated Status")===1 &&
   act(t8.id,"notes","Added note")===1,
   "baseline task activity matches exact six update events and one note");
  const extraAct=await client.query("SELECT count(*)::int AS n FROM task_activity WHERE task_id=$1",[extra.id]);
  check(extraAct.rows[0].n===1,"new unauthorized task has exactly one creation activity");
  const notices=await client.query("SELECT task_id,count(*)::int AS n FROM notifications WHERE task_id=ANY($1::int[]) GROUP BY task_id",[[t1.id,t3.id,t8.id,extra.id]]);
  const countsByTask = new Map(notices.rows.map(row=>[Number(row.task_id),Number(row.n)]));
  check(notices.rows.length===2 && countsByTask.get(Number(t3.id))===1 &&
    countsByTask.get(Number(extra.id))===1,
   "exactly one unauthorized assignment notification and one created-task notification exist");
  const collections=await client.query(
   "SELECT id,clinic,notes,collection_status AS status FROM collections WHERE patient_name='TEST PATIENT 001' AND notes LIKE '[Transferred from Verification/Billing - %' FOR UPDATE",
  );
  check(collections.rowCount===1 &&
   collections.rows[0].clinic==="Harbor Demo Clinic" &&
   collections.rows[0].status==="Unassigned" &&
   collections.rows[0].notes.includes(BASE_NOTE),
   "exactly one known fictional transfer-created collection");
  const collectionId=Number(collections.rows[0].id);
  const collectionActivity=await client.query(
   "SELECT field,action,count(*)::int AS n FROM collection_activity WHERE collection_id=$1 GROUP BY field,action",
   [collectionId],
  );
  // At transfer time the source task had exactly two prior edits: clinic and
  // bucket. Fastbills copies those two events plus one transfer-source event.
  const copied=new Map(collectionActivity.rows.map(r=>[String(r.field)+"|"+r.action,Number(r.n)]));
  check(collectionActivity.rows.length===3 &&
    copied.get("source|Transferred from Verification/Billing")===1 &&
    copied.get("clinicId|[Verification/Billing] Updated Clinic")===1 &&
    copied.get("bucket|[Verification/Billing] Updated Bucket")===1,
    "collection activity consists of exactly one transfer and two copied fictional events");
  const potentialDependencies=await client.query(
   "SELECT (SELECT count(*)::int FROM rcm_task_approvals WHERE task_id=ANY($1::int[])) AS approvals,(SELECT count(*)::int FROM rcm_quality_reviews WHERE source='tasks' AND record_id=ANY($1::int[])) AS qa",
   [[t1.id,t3.id,t8.id,extra.id]],
  );
  check(potentialDependencies.rows[0].approvals===0 && potentialDependencies.rows[0].qa===0,
   "no approval or QA records depend on affected fixtures");
  // All checks above must pass before a single restoration statement runs.
  await client.query("DELETE FROM notifications WHERE task_id=ANY($1::int[])",[[t3.id,extra.id]]);
  await client.query("DELETE FROM task_activity WHERE task_id=ANY($1::int[])",[[t1.id,t3.id,t8.id,extra.id]]);
  await client.query(
   "UPDATE tasks SET clinic_id=$2,bucket='ready_for_billing',status='unassigned',task_outcome=NULL WHERE id=$1",
   [t1.id,evergreen],
  );
  await client.query("UPDATE tasks SET assigned_user_id=NULL,status='unassigned' WHERE id=$1",[t3.id]);
  await client.query("UPDATE tasks SET notes=$2 WHERE id=$1",[t8.id,BASE_NOTE]);
  await client.query("DELETE FROM collection_activity WHERE collection_id=$1",[collectionId]);
  await client.query("DELETE FROM collections WHERE id=$1",[collectionId]);
  await client.query("DELETE FROM tasks WHERE id=$1",[extra.id]);
  const counts=await client.query(
   "SELECT (SELECT count(*)::int FROM tasks) AS tasks,(SELECT count(*)::int FROM collections) AS collections,(SELECT count(*)::int FROM task_activity) AS activity,(SELECT count(*)::int FROM notifications) AS notifications",
  );
  check(counts.rows[0].tasks===8 && counts.rows[0].collections===0 && counts.rows[0].activity===0 && counts.rows[0].notifications===0,
   "restored baseline counts: eight tasks, no collections, activity or notifications");
  if(apply){
   await client.query("COMMIT");begun=false;
   console.log("PASS: synthetic fixture recovery COMMITTED");
  }else{
   await client.query("ROLLBACK");begun=false;
   console.log("PASS: dry-run checks succeeded; all proposed changes ROLLED BACK (nothing modified)");
   console.log("To commit verified synthetic restoration, rerun with --apply");
  }
 }catch(e){
  if(begun)await client.query("ROLLBACK").catch(()=>{});
  throw e;
 }finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message.split("\n")[0]:"Unexpected recovery error");process.exitCode=1;});
