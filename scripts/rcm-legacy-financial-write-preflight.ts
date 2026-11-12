/**
 * Non-mutating-value preflight for legacy Denials/Checks write guard.
 * Synthetic staging + localhost only. All submitted values equal existing
 * fictional values; do not use this script against real patient data.
 *
 * This does not prove all mutation paths safe: it verifies the running
 * server's new guard rejects representative unauthorized methods.
 */
import {readFileSync} from "node:fs";
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
function check(ok:unknown,message:string):asserts ok{if(!ok)throw Error("REFUSED: "+message);}
async function main(){
 const url=process.env.DATABASE_URL;
 check(url && decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic staging database required");
 const pool=new Pool({connectionString:url,max:1});
 try{
  const name=await pool.query("SELECT current_database() AS name");
  check(name.rows[0]?.name===DB,"wrong database");
  const records=await pool.query(
    "SELECT 'denials' AS source,id,patient_name AS name,clinic,comments AS notes FROM denials WHERE patient_name=ANY($1::text[]) UNION ALL SELECT 'checks',id,check_patient_name,clinic,notes FROM checks WHERE check_patient_name=ANY($2::text[])",
    [["TEST SECURITY DENIAL EVERGREEN","TEST SECURITY DENIAL HARBOR"],["TEST SECURITY CHECK EVERGREEN","TEST SECURITY CHECK HARBOR"]]
  );
  check(records.rows.length===4,"four fictional Denials/Checks fixtures expected");
  const get=(source:string,clinic:string)=>{
   const rows=records.rows.filter(row=>row.source===source && row.clinic===clinic);
   check(rows.length===1,"expected unique fictional "+source+" "+clinic+" fixture");
   return rows[0];
  };
  const harborDenial=get("denials","Harbor Demo Clinic");
  const evergreenDenial=get("denials","Evergreen Demo Clinic");
  const harborCheck=get("checks","Harbor Demo Clinic");
  const evergreenCheck=get("checks","Evergreen Demo Clinic");
  check(records.rows.every(row=>row.notes==="Fictional security regression fixture only"),
    "unexpected fictional fixture state");
  const credentials=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
  const match=credentials.find(line=>line.startsWith("rcm_demo_manager |"));
  check(match,"synthetic manager credentials missing");
  const [username,,password]=match.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({username,password}),signal:AbortSignal.timeout(15000),
  });
  check(login.status===200,"synthetic manager login failed");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  check(cookie,"synthetic login session missing");
  console.log("PASS: synthetic-only fixtures and manager login verified");
  let failed=0;
  async function attempt(label:string,method:string,route:string,body:unknown){
   const response=await fetch(BASE+route,{method,headers:{"Cookie":cookie,"Content-Type":"application/json"},
     body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   const pass=[403,404].includes(response.status);
   console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+response.status+")");
   if(!pass)failed++;
  }
  // Same-value PATCHes do not intentionally change underlying fields even
  // if an outdated server accepts them. Check that new guard rejects both.
  await attempt("other-clinic Denial no-op edit denied","PATCH","/api/denials/"+harborDenial.id,
    {comments:harborDenial.notes});
  await attempt("own-clinic Denial lacking department authorization denied","PATCH","/api/denials/"+evergreenDenial.id,
    {comments:evergreenDenial.notes});
  await attempt("other-clinic Check no-op edit denied","PATCH","/api/checks/"+harborCheck.id,
    {notes:harborCheck.notes});
  await attempt("own-clinic Check without checks.read denied","PATCH","/api/checks/"+evergreenCheck.id,
    {notes:evergreenCheck.notes});
  const after=await pool.query(
    "SELECT 'denials' AS source,id,patient_name AS name,clinic,comments AS notes FROM denials WHERE patient_name=ANY($1::text[]) UNION ALL SELECT 'checks',id,check_patient_name,clinic,notes FROM checks WHERE check_patient_name=ANY($2::text[])",
    [["TEST SECURITY DENIAL EVERGREEN","TEST SECURITY DENIAL HARBOR"],["TEST SECURITY CHECK EVERGREEN","TEST SECURITY CHECK HARBOR"]]
  );
  for(const original of records.rows){
   const now=after.rows.find(row=>row.source===original.source && Number(row.id)===Number(original.id));
   if(!now||now.clinic!==original.clinic||now.notes!==original.notes)failed++;
  }
  if(failed){
   console.log("FAIL: financial write preflight detected unexpected server behavior; STOP and do not run additional write probes");
   process.exitCode=2;
  }else{
   console.log("PASS: four representative legacy financial no-op writes denied; fictional record values unchanged");
  }
 }finally{await pool.end();}
}
main().catch(error=>{
 console.error("Financial write preflight failed:",error instanceof Error?error.message.split("\n")[0]:"Unexpected error");
 process.exitCode=1;
});
