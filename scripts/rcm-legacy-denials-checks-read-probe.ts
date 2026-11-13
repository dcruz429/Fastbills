/**
 * Read-only regression probe for legacy Denials and Checks clinic isolation.
 * Uses synthetic-only database and localhost guarded staging server.
 * Does not print record bodies, patient names, cookies or secrets.
 *
 * Exit 0: scoped; exit 2: cross-clinic exposure; exit 1: setup or test error.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DATABASE = "fastbills_rcm_synthetic_staging";
const BASE = "http://127.0.0.1:5001";
function assert(ok:unknown,message:string):asserts ok {
  if(!ok) throw Error(message);
}
async function main(){
  const connectionString=process.env.DATABASE_URL;
  assert(connectionString && decodeURIComponent(new URL(connectionString).pathname)==="/"+DATABASE,
    "REFUSED: exact synthetic staging database URL required");
  const pool=new Pool({connectionString,max:1});
  let harborDenialId:number,harborCheckId:number,evergreenDenialId:number,evergreenCheckId:number;
  try {
    const current=await pool.query("SELECT current_database() AS name");
    assert(current.rows[0]?.name===DATABASE,"REFUSED: unexpected PostgreSQL target");
    const denials=await pool.query(
      "SELECT id,patient_name AS name,clinic FROM denials WHERE patient_name=ANY($1::text[])",
      [["TEST SECURITY DENIAL EVERGREEN","TEST SECURITY DENIAL HARBOR"]]
    );
    const checks=await pool.query(
      "SELECT id,check_patient_name AS name,clinic FROM checks WHERE check_patient_name=ANY($1::text[])",
      [["TEST SECURITY CHECK EVERGREEN","TEST SECURITY CHECK HARBOR"]]
    );
    assert(denials.rowCount===2 && checks.rowCount===2,"Expected four fictional fixture records");
    function idFor(rows:Array<{id:number,name:string,clinic:string}>,name:string,clinic:string){
      const matches=rows.filter(r=>r.name===name && r.clinic===clinic);
      assert(matches.length===1,"Fictional fixture missing or ambiguous");
      return Number(matches[0].id);
    }
    harborDenialId=idFor(denials.rows,"TEST SECURITY DENIAL HARBOR","Harbor Demo Clinic");
    evergreenDenialId=idFor(denials.rows,"TEST SECURITY DENIAL EVERGREEN","Evergreen Demo Clinic");
    harborCheckId=idFor(checks.rows,"TEST SECURITY CHECK HARBOR","Harbor Demo Clinic");
    evergreenCheckId=idFor(checks.rows,"TEST SECURITY CHECK EVERGREEN","Evergreen Demo Clinic");
    console.log("PASS: four fictional Denials/Checks fixtures verified in synthetic staging");
  } finally { await pool.end(); }

  const creds=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n")
    .find(x=>x.startsWith("rcm_demo_manager |"));
  assert(creds,"Missing fictional manager credentials");
  const [username,,password]=creds.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000),
  });
  assert(login.status===200,"Synthetic manager login failed");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie,"Synthetic session cookie missing");
  console.log("PASS: authenticated Evergreen synthetic manager");
  const get=async(endpoint:string)=>{
    const response=await fetch(BASE+endpoint,{
      headers:{"Cookie":cookie},signal:AbortSignal.timeout(12000),
    });
    const contentType=response.headers.get("content-type")??"";
    assert(contentType.includes("application/json"),"Unexpected response type from legacy API");
    return {status:response.status,data:await response.json() as any};
  };

  let exposure=false;
  async function checkList(label:string,endpoint:string,id:number,positiveId:number){
    const r=await get(endpoint);
    const rows=Array.isArray(r.data)?r.data:null;
    const harborVisible=r.status===200 && rows!==null && rows.some((item:any)=>Number(item.id)===id);
    const ownVisible=r.status===200 && rows!==null && rows.some((item:any)=>Number(item.id)===positiveId);
    console.log(label+": HTTP "+r.status+", other clinic "+(harborVisible?"EXPOSED":"hidden")+", own clinic "+(ownVisible?"visible":"not visible"));
    if(harborVisible)exposure=true;
    if(r.status!==200 && r.status!==403)throw Error("Unexpected response for "+label);
  }
  async function checkDetail(label:string,endpoint:string){
    const r=await get(endpoint);
    const exposed=r.status===200;
    console.log(label+": HTTP "+r.status+", other clinic "+(exposed?"EXPOSED":"blocked"));
    if(exposed)exposure=true;
    if(![200,403,404].includes(r.status))throw Error("Unexpected response for "+label);
  }

  await checkList("Denials normal list","/api/denials",harborDenialId,evergreenDenialId);
  await checkList("Denials workload list","/api/denials?workload=true",harborDenialId,evergreenDenialId);
  await checkDetail("Denials direct detail","/api/denials/"+harborDenialId);
  await checkDetail("Denials activity","/api/denials/"+harborDenialId+"/activity");
  await checkList("Checks normal list","/api/checks",harborCheckId,evergreenCheckId);
  await checkList("Checks workload list","/api/checks?workload=true",harborCheckId,evergreenCheckId);
  await checkDetail("Checks direct detail","/api/checks/"+harborCheckId);
  await checkDetail("Checks activity","/api/checks/"+harborCheckId+"/activity");

  if(exposure){
    console.log("CONFIRMED RELEASE BLOCKER: legacy Denials/Checks endpoints expose another clinic");
    process.exitCode=2;
  }else{
    console.log("PASS: sampled legacy Denials/Checks read routes did not expose another clinic");
  }
}
main().catch(error=>{
  console.error("Legacy read-security probe failed:",error instanceof Error?error.message.split("\n")[0]:"Unexpected error");
  process.exitCode=1;
});
