/**
 * Read-only synthetic attachment policy regression:
 * Guidelines module: active logged-in employees can download.
 * Private direct message: only sender/recipient can download.
 * Anonymous clients cannot download either.
 *
 * No fixture content, passwords, cookies or patient information is printed.
 * Exit 0 = all rules enforced; 2 = security boundary violation; 1 = setup.
 */
import {readFileSync} from "node:fs";
import {Pool} from "pg";

const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const GUIDELINE_FILE="rcm-guidelines-attachment-synthetic.txt";
const PRIVATE_FILE="rcm-private-attachment-synthetic.txt";
const GUIDELINE_PAYLOAD="SYNTHETIC ONLY: Guidelines authorized download test. No patient information.";
const PRIVATE_PAYLOAD="SYNTHETIC ONLY: private message file authorization regression test; no patient information.";
function assert(value:unknown,message:string):asserts value{
 if(!value)throw Error("REFUSED: "+message);
}
async function main(){
 const url=process.env.DATABASE_URL;
 assert(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic staging database required");
 const pool=new Pool({connectionString:url,max:1});
 let guidelineId:number,privateId:number;
 try{
  const current=await pool.query("SELECT current_database() AS name");
  assert(current.rows[0]?.name===DB,"unexpected database target");
  const files=await pool.query(
   "SELECT id,original_name AS name,mime_type AS type,data FROM file_uploads WHERE original_name=ANY($1::text[])",
   [[GUIDELINE_FILE,PRIVATE_FILE]],
  );
  assert(files.rowCount===2,"exactly two known fictional file fixtures required");
  const get=(name:string,payload:string)=>{
   const matches=files.rows.filter(f=>f.name===name);
   assert(matches.length===1&&matches[0].type==="text/plain"&&
    Buffer.from(matches[0].data,"base64").toString("utf8")===payload,"fixture mismatch");
   return Number(matches[0].id);
  };
  guidelineId=get(GUIDELINE_FILE,GUIDELINE_PAYLOAD);
  privateId=get(PRIVATE_FILE,PRIVATE_PAYLOAD);
  const module=await pool.query(
   "SELECT id FROM guideline_modules WHERE title=$1 AND $2=ANY(attachments)",
   ["TEST SECURITY GUIDELINES ATTACHMENT","/api/files/"+guidelineId+"|"+GUIDELINE_FILE],
  );
  assert(module.rowCount===1,"exactly one fictional Guidelines module must own the file");
  const dm=await pool.query(
   "SELECT id FROM direct_messages WHERE $1=ANY(attachments)",
   ["/api/files/"+privateId+"|"+PRIVATE_FILE],
  );
  assert(dm.rowCount===1,"exactly one fictional private message must own the private file");
  console.log("PASS: synthetic-only Guidelines and private-message fixtures verified");
 }finally{await pool.end();}
 const lines=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
 const getCookie=async(username:string)=>{
  const line=lines.find(x=>x.startsWith(username+" |"));
  assert(line,"missing fictional account");
  const [name,,password]=line.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({username:name,password}),signal:AbortSignal.timeout(12000),
  });
  assert(login.status===200,"fictional login failed");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie,"login session cookie absent");
  return cookie;
 };
 const get=async(id:number,cookie?:string)=>{
  const response=await fetch(BASE+"/api/files/"+id,{
   headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(12000),
  });
  return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
 };
 let violations=0;
 const probe=async(label:string,id:number,payload:string,cookie:string|undefined,allowed:boolean)=>{
  const response=await get(id,cookie);
  const correct=response.status===200&&response.bytes.toString("utf8")===payload;
  const denied=[401,403,404].includes(response.status)&&!correct;
  const pass=allowed?correct:denied;
  console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+response.status+")");
  if(!pass)violations++;
 };
 const manager=await getCookie("rcm_demo_manager");
 const verifier=await getCookie("rcm_demo_verifier");
 const sender=await getCookie("rcm_demo_other");
 await probe("Billing Manager can download shared Guidelines attachment",guidelineId,GUIDELINE_PAYLOAD,manager,true);
 await probe("Verification employee can download shared Guidelines attachment",guidelineId,GUIDELINE_PAYLOAD,verifier,true);
 await probe("Harbor employee can download shared Guidelines attachment",guidelineId,GUIDELINE_PAYLOAD,sender,true);
 await probe("anonymous visitor cannot download Guidelines attachment",guidelineId,GUIDELINE_PAYLOAD,undefined,false);
 await probe("private attachment inaccessible to unrelated Billing Manager",privateId,PRIVATE_PAYLOAD,manager,false);
 await probe("private attachment accessible to message sender",privateId,PRIVATE_PAYLOAD,sender,true);
 await probe("private attachment accessible to message recipient",privateId,PRIVATE_PAYLOAD,verifier,true);
 await probe("anonymous visitor cannot download private attachment",privateId,PRIVATE_PAYLOAD,undefined,false);
 if(violations){
  console.error("CONFIRMED RELEASE BLOCKER: Guidelines/private attachment authorization regression");
  process.exitCode=2;
 }else{
  console.log("PASS: all eight Guidelines/private attachment access rules enforced");
 }
}
main().catch(error=>{
 console.error("Guidelines file probe failed:",error instanceof Error?error.message.split("\n")[0]:"Unexpected error");
 process.exitCode=1;
});
