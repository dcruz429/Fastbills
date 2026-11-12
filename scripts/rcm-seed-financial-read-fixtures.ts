/**
 * One-time fictional cross-clinic financial-read fixtures.
 * Dry run by default. --apply writes eight unmistakably synthetic records
 * ONLY to the exact pre-existing synthetic staging database.
 * Never creates tables, migrates, updates, deletes, or copies patient records.
 */
import { Pool } from "pg";
const DB="fastbills_rcm_synthetic_staging";
const CLINICS=["Evergreen Demo Clinic","Harbor Demo Clinic"] as const;
const TABLES=["arbitrations","collections","postings","closed"] as const;
function check(ok:unknown,message:string):asserts ok{if(!ok)throw Error("REFUSED: "+message);}
async function main(){
 const apply=process.argv.slice(2).includes("--apply");
 check(process.argv.slice(2).every(v=>v==="--apply"),"unknown argument");
 const url=process.env.DATABASE_URL;
 check(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic staging database required");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const db=await client.query("SELECT current_database() AS name");
  check(db.rows[0]?.name===DB,"database identity mismatch");
  const clinicRows=await client.query(
   "SELECT id,name FROM clinics WHERE name=ANY($1::text[])",
   [CLINICS]
  );
  check(clinicRows.rowCount===2 && CLINICS.every(name=>clinicRows.rows.filter(r=>r.name===name).length===1),
   "unique fictional clinics required");
  const user=await client.query("SELECT id,active,role FROM users WHERE username=$1",["rcm_demo_manager"]);
  check(user.rowCount===1 && user.rows[0].active===true && user.rows[0].role==="manager",
   "fictional manager must exist and be active");
  const scopes=await client.query("SELECT clinic_id FROM rcm_user_clinics WHERE user_id=$1",[user.rows[0].id]);
  const evergreenId=Number(clinicRows.rows.find(r=>r.name===CLINICS[0]).id);
  const harborId=Number(clinicRows.rows.find(r=>r.name===CLINICS[1]).id);
  check(scopes.rows.some(row=>Number(row.clinic_id)===evergreenId) &&
    !scopes.rows.some(row=>Number(row.clinic_id)===harborId),
    "manager must have Evergreen scope and no Harbor scope");
  for(const table of TABLES){
   const count=await client.query(`SELECT count(*)::int AS n FROM ${table}`);
   check(count.rows[0].n===0,table+" must be empty before fixture creation");
  }
  if(!apply){
   console.log("PASS: exact synthetic DB, empty four tables, fictional clinics and scoped manager verified");
   console.log("DRY RUN: eight synthetic financial records can be inserted with --apply");
   await client.query("ROLLBACK");
   return;
  }
  for(const table of TABLES){
   for(const clinic of CLINICS){
    const patient=`TEST SECURITY ${table.toUpperCase()} ${clinic.startsWith("Evergreen")?"EVERGREEN":"HARBOR"}`;
    const patientColumn=table==="postings"?"posting_patient_name":"patient_name";
    await client.query(
      `INSERT INTO ${table} (${patientColumn},clinic) VALUES ($1,$2)`,
      [patient,clinic]
    );
   }
  }
  await client.query("COMMIT");
  console.log("PASS: 8 fictional records inserted into exact synthetic staging DB, 2 per financial table");
 }catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();await pool.end();}
}
main().catch(error=>{
 console.error("Synthetic financial fixture setup failed:",error instanceof Error?error.message.split("\n")[0]:"Unexpected error");
 process.exitCode=1;
});
