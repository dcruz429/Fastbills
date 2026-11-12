/**
 * Safe synthetic-only negative preflight for legacy Denials/Checks bulk
 * and CSV import routes. Only invalid empty operations are submitted.
 * Never attempts DELETE, real bulk edits, transfers or non-empty imports.
 *
 * A patched server should reject all requests with 403/404. Old code returns
 * 400 on invalid empty payloads, which distinguishes a stale build. The script
 * verifies existing fictional record values and activity counts afterward.
 */
import {readFileSync} from "node:fs";
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
function check(value:unknown,message:string):asserts value{if(!value)throw Error("REFUSED: "+message);}
async function main(){
 const url=process.env.DATABASE_URL;
 check(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"synthetic-only database required");
 const pool=new Pool({connectionString:url,max:1});
 try{
  const current=await pool.query("SELECT current_database() AS name");
  check(current.rows[0]?.name===DB,"unexpected database");
  const denial=await pool.query("SELECT id,clinic,comments FROM denials WHERE patient_name=$1",["TEST SECURITY DENIAL HARBOR"]);
  const checkRecord=await pool.query("SELECT id,clinic,notes FROM checks WHERE check_patient_name=$1",["TEST SECURITY CHECK HARBOR"]);
  check(denial.rowCount===1&&checkRecord.rowCount===1,"both Harbor fictional records exist");
  const d=denial.rows[0],c=checkRecord.rows[0];
  check(d.clinic==="Harbor Demo Clinic"&&c.clinic==="Harbor Demo Clinic"&&
        d.comments==="Fictional security regression fixture only"&&c.notes==="Fictional security regression fixture only",
        "fictional fixture baseline intact");
  const before=await pool.query(
    "SELECT (SELECT count(*)::int FROM denial_activity WHERE denial_id=$1) AS da,"+
    "(SELECT count(*)::int FROM check_activity WHERE check_id=$2) AS ca,"+
    "(SELECT count(*)::int FROM denials) AS dn,(SELECT count(*)::int FROM checks) AS cn,"+
    "(SELECT count(*)::int FROM arbitrations) AS an",
    [d.id,c.id]
  );
  const creds=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n")
    .find(x=>x.startsWith("rcm_demo_manager |"));
  check(creds,"fictional manager account missing");
  const [username,,password]=creds.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{method:"POST",
   headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password}),
   signal:AbortSignal.timeout(12000)});
  check(login.status===200,"fictional manager login failed");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  check(cookie,"session cookie absent");
  console.log("PASS: synthetic staging database and real manager session verified");
  let failures=0;
  async function attempt(label:string,route:string,data:unknown){
   const response=await fetch(BASE+route,{
    method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},
    body:JSON.stringify(data),signal:AbortSignal.timeout(12000),
   });
   const ok=[403,404].includes(response.status);
   console.log((ok?"PASS":"FAIL")+": "+label+" (HTTP "+response.status+")");
   if(!ok)failures++;
  }
  // Invalid empty operations cannot mutate records even on an older build.
  // The boundary must reject them with 403; a legacy handler returns 400.
  await attempt("Denials bulk update rejected before handler","/api/denials/bulk-update",
    {ids:[],data:{comments:d.comments}});
  await attempt("Checks bulk update rejected before handler","/api/checks/bulk-update",
    {ids:[],data:{notes:c.notes}});
  await attempt("Denials bulk delete rejected before handler","/api/denials/bulk-delete",{ids:[]});
  await attempt("Checks bulk delete rejected before handler","/api/checks/bulk-delete",{ids:[]});
  await attempt("Denials CSV importer rejected before handler","/api/denials/import-csv",{rows:[]});
  await attempt("Checks CSV importer rejected before handler","/api/checks/import-csv",{rows:[]});
  const after=await pool.query(
    "SELECT (SELECT count(*)::int FROM denial_activity WHERE denial_id=$1) AS da,"+
    "(SELECT count(*)::int FROM check_activity WHERE check_id=$2) AS ca,"+
    "(SELECT count(*)::int FROM denials) AS dn,(SELECT count(*)::int FROM checks) AS cn,"+
    "(SELECT count(*)::int FROM arbitrations) AS an",
    [d.id,c.id]
  );
  const unchanged=Object.keys(before.rows[0]).every(key=>after.rows[0][key]===before.rows[0][key]);
  const latest=await pool.query("SELECT (SELECT comments FROM denials WHERE id=$1) AS dn,(SELECT notes FROM checks WHERE id=$2) AS cn",[d.id,c.id]);
  if(!unchanged || latest.rows[0]?.dn!==d.comments ||latest.rows[0]?.cn!==c.notes){
   failures++;
   console.error("FAIL: fictional record data/counts/activity changed; STOP testing");
  }else console.log("PASS: fictional Denials/Checks data and activity counts unchanged");
  if(failures){
   console.error("CONFIRMED RELEASE BLOCKER: sampled legacy financial bulk/import guards are not active");
   process.exitCode=2;
  }else console.log("PASS: all sampled legacy financial empty bulk/import requests rejected before handler");
 }finally{await pool.end();}
}
main().catch(error=>{
 console.error("Financial bulk preflight failed:",error instanceof Error?error.message.split("\n")[0]:"Unexpected error");
 process.exitCode=1;
});
