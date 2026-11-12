/**
 * Read-only release-blocker probe for legacy tasks API clinic isolation.
 * Runs against the guarded synthetic staging server on 127.0.0.1:5001.
 * Requires synthetic database and credentials; prints only HTTP status/counts,
 * never patient names, passwords, or cookies.
 *
 * DATABASE_URL="$RCM_SYNTHETIC_URL" npx tsx scripts/rcm-legacy-scope-probe.ts
 *
 * Fail code 2 = confirmed privacy isolation blocker, not a test harness error.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
const EXPECTED="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
async function main(){
 const url=process.env.DATABASE_URL;
 if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+EXPECTED){
   throw Error("Refusing to run outside the synthetic staging database");
 }
 const pool=new Pool({connectionString:url});
 let otherClinicId:number;
 let otherTaskId:number;
 try {
  const db=await pool.query("SELECT current_database() AS name");
  if(db.rows[0]?.name!==EXPECTED)throw Error("Unexpected PostgreSQL target");
  const clinic=await pool.query("SELECT id FROM clinics WHERE name='Harbor Demo Clinic'");
  if(clinic.rowCount!==1)throw Error("Synthetic other clinic missing");
  otherClinicId=Number(clinic.rows[0].id);
  const task=await pool.query("SELECT id FROM tasks WHERE clinic_id=$1 ORDER BY id LIMIT 1",[otherClinicId]);
  if(task.rowCount!==1)throw Error("Synthetic other-clinic task missing");
  otherTaskId=Number(task.rows[0].id);
 }finally{await pool.end();}
 const line=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n")
   .find(x=>x.startsWith("rcm_demo_manager |"));
 if(!line)throw Error("Synthetic Billing Manager account missing");
 const [username,,password]=line.split("|").map(x=>x.trim());
 const login=await fetch(BASE+"/api/auth/login",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({username,password}),signal:AbortSignal.timeout(15000),
 });
 if(login.status!==200)throw Error("Could not authenticate synthetic Billing Manager");
 const cookie=login.headers.get("set-cookie")?.split(";")[0];
 if(!cookie)throw Error("Session cookie missing");
 const get=async(path:string)=>{
   const response=await fetch(BASE+path,{
     headers:{Cookie:cookie},signal:AbortSignal.timeout(15000),
   });
   const body=await response.json() as any;
   return {status:response.status,body};
 };
 const board=await get("/api/rcm/taskboard");
 if(board.status!==200 || !Array.isArray(board.body.tasks))throw Error("Scoped board test failed");
 const boardOther=board.body.tasks.filter((t:any)=>Number(t.clinicId)===otherClinicId).length;
 console.log("Scoped RCM board sees other-clinic tasks:",boardOther);
 if(boardOther!==0)throw Error("RCM board itself is leaking cross-clinic records");
 const detail=await get("/api/tasks/"+otherTaskId);
 // Count only; never print retrieved records or identifiable fields.
 const detailExposed=detail.status===200 && Number(detail.body?.clinicId)===otherClinicId;
 console.log("Legacy GET /api/tasks/:taskId HTTP status:",detail.status);
 console.log("Legacy task detail returned another clinic:",detailExposed?"YES":"NO");
 const activity=await get("/api/tasks/"+otherTaskId+"/activity");
 console.log("Legacy other-clinic task activity HTTP status:",activity.status);
 const activityExposed=activity.status===200;
 const list=await get("/api/tasks?workload=true");
 const listExposure=list.status===200 && Array.isArray(list.body) &&
   list.body.some((t:any)=>Number(t.clinicId)===otherClinicId);
 console.log("Legacy GET /api/tasks?workload=true HTTP status:",list.status);
 console.log("Legacy workload list contains another clinic:",listExposure?"YES":"NO");
 if(detailExposed || listExposure || activityExposed){
   console.log("CONFIRMED RELEASE BLOCKER: authenticated legacy routes bypass new clinic scoping");
   process.exitCode=2;
 }else{
   console.log("PASS: sampled legacy task routes did not expose the other clinic");
 }
}
main().catch(e=>{
 console.error("Legacy scope probe error:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");
 process.exitCode=1;
});
