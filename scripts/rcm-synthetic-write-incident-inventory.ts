/**
 * READ-ONLY incident inventory for failed synthetic staging negative write probe.
 * Does not fetch or print patient names, notes, session secrets, or PHI.
 * Use before any cleanup because a transfer may have created a collection record.
 */
import {Pool} from "pg";
const NAME="fastbills_rcm_synthetic_staging";
async function main(){
 const url=process.env.DATABASE_URL;
 if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+NAME)throw Error("Refusing non-synthetic database");
 const pool=new Pool({connectionString:url,max:1});
 try{
  const db=await pool.query("SELECT current_database() AS name");
  if(db.rows[0]?.name!==NAME)throw Error("Unexpected target database");
  console.log("PASS: synthetic-only database verified");
  const clinics=await pool.query("SELECT name,id FROM clinics WHERE name=ANY($1::text[])",[["Evergreen Demo Clinic","Harbor Demo Clinic"]]);
  if(clinics.rowCount!==2)throw Error("Fictional clinics missing");
  const id=new Map(clinics.rows.map(r=>[r.name,Number(r.id)]));
  const tasks=await pool.query(
    "SELECT patient_name AS name,clinic_id AS clinic,bucket::text AS bucket,status::text AS status,assigned_user_id AS assignee,task_outcome AS outcome,notes AS notes,id FROM tasks WHERE patient_name=ANY($1::text[]) ORDER BY id",
    [["TEST PATIENT 001","TEST PATIENT 003","TEST PATIENT 008","TEST WRITE NEGATIVE DO NOT CREATE"]],
  );
  const expected=["TEST PATIENT 001","TEST PATIENT 003","TEST PATIENT 008"];
  for(const name of expected){
   const rows=tasks.rows.filter(r=>r.name===name);
   if(rows.length!==1)throw Error("Fixture count mismatch: "+name);
   const t=rows[0];
   const clinic=t.clinic===id.get("Evergreen Demo Clinic")?"Evergreen":t.clinic===id.get("Harbor Demo Clinic")?"Harbor":"unexpected";
   const notesModified=typeof t.notes==="string" && t.notes!=="Fictional staging record; not for actual billing";
   console.log(name.replace("TEST PATIENT ","Fixture "),JSON.stringify({id:t.id,clinic,bucket:t.bucket,status:t.status,hasAssignee:t.assignee!=null,hasOutcome:t.outcome!=null,notesModified}));
   const activity=await pool.query("SELECT field,action,count(*)::int AS n FROM task_activity WHERE task_id=$1 GROUP BY field,action ORDER BY field,action",[t.id]);
   console.log("  activity categories:",JSON.stringify(activity.rows));
   const notifications=await pool.query("SELECT count(*)::int AS n FROM notifications WHERE task_id=$1",[t.id]);
   console.log("  notifications count:",notifications.rows[0].n);
  }
  console.log("Unauthorized synthetic new tasks:",tasks.rows.filter(r=>r.name==="TEST WRITE NEGATIVE DO NOT CREATE").length);
  const transferred=await pool.query(
    "SELECT id,collection_status AS status,clinic,notes FROM collections WHERE patient_name='TEST PATIENT 001' AND notes LIKE '[Transferred from Verification/Billing - %' ORDER BY id",
  );
  console.log("Possible synthetic transfer-created Collections records:",transferred.rowCount);
  for(const t of transferred.rows)console.log("  transfer candidate:",JSON.stringify({id:t.id,clinicIsFictional:[...id.keys()].includes(t.clinic),status:t.status}));
 }finally{await pool.end();}
}
main().catch(e=>{console.error("Inventory failed:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
