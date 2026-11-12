/**
 * Negative write authorization regression on synthetic-only localhost staging.
 * Sends requests that MUST be rejected; never intentionally modifies any data.
 * Compares task rows + task activity/notifications before and after.
 */
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
function assert(ok:unknown,label:string):asserts ok { if(!ok)throw Error("FAIL: "+label);console.log("PASS: "+label); }
const hash=(obj:unknown)=>createHash("sha256").update(JSON.stringify(obj)).digest("hex");
async function main(){
 const url=process.env.DATABASE_URL;
 if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+DB)throw Error("Refusing non-synthetic database");
 const pool=new Pool({connectionString:url});
 try{
  const db=await pool.query("SELECT current_database() AS db");
  assert(db.rows[0]?.db===DB,"synthetic staging database confirmed");
  const rows=await pool.query(
    "SELECT id,patient_name AS name,clinic_id AS clinic,assigned_user_id AS assignee FROM tasks WHERE patient_name = ANY($1::text[])",
    [["TEST PATIENT 001","TEST PATIENT 003","TEST PATIENT 008"]],
  );
  if(rows.rowCount!==3)throw Error("Three baseline synthetic records required");
  const task=new Map(rows.rows.map(r=>[r.name,r]));
  const a=task.get("TEST PATIENT 001"),high=task.get("TEST PATIENT 003"),other=task.get("TEST PATIENT 008");
  if(a.clinic===other.clinic || a.clinic!==high.clinic || high.assignee!==null)
   throw Error("Unexpected fictional clinic/assignee fixture");
  const account=await pool.query(
    "SELECT id,username FROM users WHERE username = ANY($1::text[])",
    [["rcm_demo_manager","rcm_demo_biller"]],
  );
  const ids=new Map(account.rows.map(r=>[r.username,Number(r.id)]));
  const snapshot=async()=>{
    const tasks=await pool.query("SELECT * FROM tasks WHERE id=ANY($1::int[]) ORDER BY id",[[a.id,high.id,other.id]]);
    const activity=await pool.query("SELECT * FROM task_activity WHERE task_id=ANY($1::int[]) ORDER BY id",[[a.id,high.id,other.id]]);
    const notifications=await pool.query("SELECT * FROM notifications WHERE task_id=ANY($1::int[]) ORDER BY id",[[a.id,high.id,other.id]]);
    return hash({tasks:tasks.rows,activity:activity.rows,notifications:notifications.rows});
  };
  const initial=await snapshot();
  const credentials=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
  const loginLine=credentials.find(line=>line.startsWith("rcm_demo_manager |"));
  if(!loginLine)throw Error("Missing synthetic manager account");
  const [username,,password]=loginLine.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password}),signal:AbortSignal.timeout(15000),
  });
  assert(login.status===200,"real synthetic manager login");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  if(!cookie)throw Error("Missing login session cookie");
  let failures=0;
  const negative=async(label:string,method:string,path:string,data:unknown,allowed:number[])=>{
    const response=await fetch(BASE+path,{
      method,headers:{Cookie:cookie,"Content-Type":"application/json"},
      body:JSON.stringify(data),signal:AbortSignal.timeout(15000),
    });
    const ok=allowed.includes(response.status);
    if(ok)console.log("PASS: "+label+" (HTTP "+response.status+")");
    else {console.error("FAIL: "+label+" (HTTP "+response.status+", expected "+allowed.join("/")+ ")");failures++;}
  };
  await negative("other-clinic legacy task PATCH denied","PATCH","/api/tasks/"+other.id,
    {notes:"SHOULD NEVER BE SAVED"},[403,404]);
  await negative("other-clinic legacy task DELETE denied","DELETE","/api/tasks/"+other.id,
    {},[403,404]);
  await negative("other-clinic legacy task notes POST denied","POST","/api/tasks/"+other.id+"/notes",
    {note:"SHOULD NEVER BE SAVED"},[403,404]);
  await negative("same-clinic legacy high-risk direct assignee bypass denied","PATCH","/api/tasks/"+high.id,
    {assignedUserId:ids.get("rcm_demo_biller")},[403,404]);
  await negative("same-clinic legacy task clinic move denied","PATCH","/api/tasks/"+a.id,
    {clinicId:other.clinic},[403,404]);
  await negative("same-clinic legacy task bucket move denied","PATCH","/api/tasks/"+a.id,
    {bucket:"for_verification"},[403,404]);
  await negative("same-clinic legacy task outcome transfer denied","PATCH","/api/tasks/"+a.id,
    {outcome:"Send to Collections"},[403,404]);
  await negative("legacy task creation with direct assignee denied","POST","/api/tasks",
    {patientName:"TEST WRITE NEGATIVE DO NOT CREATE",clinicId:a.clinic,
     bucket:"ready_for_billing",assignedUserId:ids.get("rcm_demo_biller")},[403,404]);
  const current=await snapshot();
  if(initial!==current){
    console.error("FAIL: synthetic fixture rows/activity/notifications changed during negative tests");
    failures++;
  }else console.log("PASS: task rows, activity and notifications unchanged");
  const created=await pool.query("SELECT count(*)::int AS count FROM tasks WHERE patient_name=$1",["TEST WRITE NEGATIVE DO NOT CREATE"]);
  if(created.rows[0].count!==0){console.error("FAIL: unauthorized task was created");failures++;}
  else console.log("PASS: no unauthorized task created");
  if(failures){process.exitCode=2;console.error("CONFIRMED RELEASE BLOCKER: legacy task write protection incomplete");}
  else console.log("PASS: all sampled legacy write/assignment bypass requests denied on synthetic staging");
 }finally{await pool.end();}
}
main().catch(e=>{console.error("Write security probe failed:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
