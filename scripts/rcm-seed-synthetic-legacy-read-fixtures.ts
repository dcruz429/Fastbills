/**
 * Add four fictional Denials/Checks read-audit fixtures, never real data.
 * Default mode is DRY RUN (ROLLBACK). Explicit --apply commits.
 * Guard: exactly fastbills_rcm_synthetic_staging with empty Denials/Checks/files.
 * Does not touch baseline eight tasks.
 */
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const FIXTURES=[
 ["TEST SECURITY DENIAL EVERGREEN","Evergreen Demo Clinic"],
 ["TEST SECURITY DENIAL HARBOR","Harbor Demo Clinic"],
 ["TEST SECURITY CHECK EVERGREEN","Evergreen Demo Clinic"],
 ["TEST SECURITY CHECK HARBOR","Harbor Demo Clinic"],
] as const;
async function main(){
 const url=process.env.DATABASE_URL;
 if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+DB)throw Error("REFUSED: synthetic staging database required");
 const apply=process.argv.includes("--apply");
 if(process.argv.some(x=>x.startsWith("--")&&x!=="--apply"))throw Error("REFUSED: unknown option");
 const pool=new Pool({connectionString:url,max:1});const client=await pool.connect();
 let begun=false;
 try{
  const id=await client.query("SELECT current_database() AS name");
  if(id.rows[0]?.name!==DB)throw Error("REFUSED: unexpected database");
  console.log("PASS: synthetic-only database verified");
  await client.query("BEGIN");begun=true;
  await client.query("SET LOCAL statement_timeout='15000ms'");
  await client.query("SET LOCAL lock_timeout='4000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112,31)");
  const clinics=await client.query("SELECT name FROM clinics WHERE name=ANY($1::text[])",[["Evergreen Demo Clinic","Harbor Demo Clinic"]]);
  if(clinics.rowCount!==2)throw Error("REFUSED: expected fictional clinics absent");
  const counts=await client.query("SELECT (SELECT count(*)::int FROM tasks) AS tasks,(SELECT count(*)::int FROM denials) AS denials,(SELECT count(*)::int FROM checks) AS checks,(SELECT count(*)::int FROM file_uploads) AS files");
  const c=counts.rows[0];
  if(c.tasks!==8||c.denials!==0||c.checks!==0||c.files!==0)throw Error("REFUSED: synthetic baseline counts differ; no changes");
  console.log("PASS: baseline has 8 fictional tasks and empty Denials, Checks, files");
  const manager=await client.query("SELECT full_name FROM users WHERE username='rcm_demo_manager' AND active=true");
  if(manager.rowCount!==1)throw Error("REFUSED: manager fixture missing");
  const name=String(manager.rows[0].full_name);
  // Make both clinics' Denials records assign to the same fictional manager.
  // This isolates clinic-access failures from ordinary assignee filtering.
  for(const [patientName,clinic] of FIXTURES.slice(0,2)){
   await client.query("INSERT INTO denials(patient_name,clinic,assigned_to,denial_status,comments) VALUES($1,$2,$3,'Unassigned',$4)",
    [patientName,clinic,name,"Fictional security regression fixture only"]);
  }
  for(const [patientName,clinic] of FIXTURES.slice(2)){
   await client.query("INSERT INTO checks(check_patient_name,clinic,assigned_to,check_status,notes) VALUES($1,$2,$3,'Unassigned',$4)",
    [patientName,clinic,name,"Fictional security regression fixture only"]);
  }
  const after=await client.query("SELECT (SELECT count(*)::int FROM denials) AS denials,(SELECT count(*)::int FROM checks) AS checks");
  if(Number(after.rows[0].denials)!==2||Number(after.rows[0].checks)!==2)throw Error("REFUSED: fixture count mismatch");
  console.log("PASS: proposed two fictional Denials and two fictional Checks records");
  if(apply){
   await client.query("COMMIT");begun=false;
   console.log("PASS: synthetic Denials/Checks fixtures COMMITTED");
  }else{
   await client.query("ROLLBACK");begun=false;
   console.log("PASS: dry-run ROLLED BACK; zero records added");
  }
 }catch(error){
  if(begun)await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();await pool.end();}
}
main().catch(e=>{console.error("Fixture setup:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
