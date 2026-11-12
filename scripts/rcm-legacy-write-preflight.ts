/**
 * No-op write-security preflight for guarded, synthetic localhost staging.
 *
 * Intentionally submits only same-value PATCH payloads against two existing
 * fictional task records, so an out-of-date server cannot be used to change
 * their value. Fails if the legacy PATCH endpoint accepts either request.
 *
 * DOES NOT replace the comprehensive write security regression.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
async function main(){
 const url=process.env.DATABASE_URL;
 if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+DB)throw Error("REFUSED: exact synthetic staging database URL required");
 const pool=new Pool({connectionString:url,max:1});
 try{
  const db=await pool.query("SELECT current_database() AS name");
  if(db.rows[0]?.name!==DB)throw Error("REFUSED: wrong database");
  const fixtures=await pool.query(
    "SELECT id,patient_name AS name,clinic_id AS clinic,bucket::text AS bucket,assigned_user_id AS assignee,notes FROM tasks WHERE patient_name=ANY($1::text[])",
    [["TEST PATIENT 003","TEST PATIENT 008"]],
  );
  const one=(name:string)=>{
    const rows=fixtures.rows.filter(r=>r.name===name);
    if(rows.length!==1)throw Error("REFUSED: unexpected fixture "+name);
    return rows[0];
  };
  const high=one("TEST PATIENT 003"),other=one("TEST PATIENT 008");
  if(high.assignee!==null || high.bucket!=="ready_for_billing" ||
     high.notes!=="Fictional staging record; not for actual billing" ||
     other.notes!=="Fictional staging record; not for actual billing")
     throw Error("REFUSED: synthetic baseline is not restored");
  const clinics=await pool.query("SELECT name,id FROM clinics WHERE id=ANY($1::int[])",[[high.clinic,other.clinic]]);
  const names=new Map(clinics.rows.map(r=>[r.name,Number(r.id)]));
  if(names.get("Evergreen Demo Clinic")!==high.clinic ||
     names.get("Harbor Demo Clinic")!==other.clinic)
     throw Error("REFUSED: synthetic clinic scope mismatch");
  const creds=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n")
    .find(x=>x.startsWith("rcm_demo_manager |"));
  if(!creds)throw Error("Synthetic manager credential missing");
  const [username,,password]=creds.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password}),signal:AbortSignal.timeout(10000),
  });
  if(login.status!==200)throw Error("Synthetic login failed");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  if(!cookie)throw Error("Session cookie not returned");
  let failures=0;
  const attempt=async(label:string,id:number,data:object)=>{
    const response=await fetch(BASE+"/api/tasks/"+id,{
      method:"PATCH",headers:{Cookie:cookie,"Content-Type":"application/json"},
      body:JSON.stringify(data),signal:AbortSignal.timeout(10000),
    });
    console.log(label+": HTTP "+response.status);
    if(![403,404].includes(response.status))failures++;
  };
  // Existing values are sent deliberately. Old servers would accept them;
  // patched servers must reject even unchanged direct assignment or other-clinic edits.
  await attempt("Cross-clinic unchanged notes",other.id,{notes:other.notes});
  await attempt("Direct assignment endpoint unchanged assignee",high.id,{assignedUserId:null});
  await attempt("Legacy clinic move endpoint unchanged clinic",high.id,{clinicId:high.clinic});
  const after=await pool.query("SELECT id,clinic_id AS clinic,assigned_user_id AS assignee,notes FROM tasks WHERE id=ANY($1::int[])",[[high.id,other.id]]);
  for(const t of after.rows){
    const before=Number(t.id)===Number(high.id)?high:other;
    if(t.clinic!==before.clinic || t.assignee!==before.assignee || t.notes!==before.notes) failures++;
  }
  if(failures){console.error("FAIL: running server is not enforcing required legacy write protections; DO NOT run the comprehensive write test");process.exitCode=2;}
  else console.log("PASS: running server denies three no-op unauthorized writes; synthetic task values unchanged");
 }finally{await pool.end();}
}
main().catch(e=>{console.error("Preflight failed:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
