/**
 * Read-only baseline probe for CEO Box record visibility and file downloads.
 * No database modifications. Only synthetic fixtures and localhost staging.
 * Before implementing CEO Box file authorization, ordinary and confidential
 * attachments should both remain blocked by existing fail-closed middleware.
 *
 * Exit 0: all expected pre-patch behavior confirmed.
 * Exit 2: access policy/visibility violation.
 * Exit 1: setup or unexpected fixture state.
 */
import {readFileSync} from "node:fs";
import {Pool} from "pg";

const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const ORDINARY="TEST SECURITY CEO BOX STANDARD";
const SECRET="TEST SECURITY CEO BOX CONFIDENTIAL";
const FILES=[
 {work:ORDINARY,name:"rcm-ceobox-standard-synthetic.txt",payload:"SYNTHETIC ONLY: CEO Box ordinary file access fixture."},
 {work:SECRET,name:"rcm-ceobox-confidential-synthetic.txt",payload:"SYNTHETIC ONLY: CEO Box confidential access fixture."},
] as const;
function assert(v:unknown,message:string):asserts v {if(!v)throw Error("REFUSED: "+message);}
async function main(){
 const url=process.env.DATABASE_URL;
 assert(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic database required");
 const pool=new Pool({connectionString:url,max:1});
 const ids=new Map<string,number>();
 try {
  const d=await pool.query("SELECT current_database() AS name");
  assert(d.rows[0]?.name===DB,"not synthetic staging");
  const files=await pool.query(
   "SELECT id,original_name AS name,data FROM file_uploads WHERE original_name=ANY($1::text[])",
   [FILES.map(f=>f.name)],
  );
  assert(files.rowCount===2,"exactly two CEO Box fictional attachments required");
  for(const f of FILES){
   const matched=files.rows.filter(row=>row.name===f.name);
   assert(matched.length===1&&Buffer.from(matched[0].data,"base64").toString("utf8")===f.payload,
    "CEO Box fictional attachment payload mismatch");
   ids.set(f.name,Number(matched[0].id));
  }
  const records=await pool.query(
   "SELECT work,confidential,attachments FROM ceo_box WHERE work=ANY($1::text[])",
   [FILES.map(f=>f.work)],
  );
  assert(records.rowCount===2,"two fictional CEO Box records required");
  for(const f of FILES){
   const row=records.rows.find(r=>r.work===f.work);
   assert(row&&row.confidential===(f.work===SECRET)&&
     row.attachments.length===1&&row.attachments[0]==="/api/files/"+ids.get(f.name)+"|"+f.name,
    "fictional CEO Box owner or confidentiality mismatch");
  }
  const users=await pool.query(
   "SELECT username,full_name,active,ceo_box_access AS access FROM users WHERE username=ANY($1::text[])",
   [["rcm_demo_admin","rcm_demo_manager","rcm_demo_verifier"]],
  );
  assert(users.rowCount===3,"expected three fictional users");
  const usersByName=new Map(users.rows.map(row=>[row.username,row]));
  assert(usersByName.get("rcm_demo_admin")?.active===true&&
    usersByName.get("rcm_demo_admin")?.access===true&&
    usersByName.get("rcm_demo_manager")?.access===false&&
    usersByName.get("rcm_demo_verifier")?.access===false,
    "synthetic CEO Box grants unexpected");
  console.log("PASS: synthetic CEO Box fixtures, ownership and access grants verified");
 }finally{await pool.end();}
 const logins=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
 async function cookieFor(username:string){
  const line=logins.find(row=>row.startsWith(username+" |"));
  assert(line,"missing fictional credentials");
  const [name,,password]=line.split("|").map(x=>x.trim());
  const response=await fetch(BASE+"/api/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:name,password}),
   signal:AbortSignal.timeout(12000),
  });
  assert(response.status===200,"synthetic login failed");
  const cookie=response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie,"synthetic session cookie missing");
  return cookie;
 }
 const admin=await cookieFor("rcm_demo_admin");
 const manager=await cookieFor("rcm_demo_manager");
 const verifier=await cookieFor("rcm_demo_verifier");
 let failures=0;
 async function listCheck(label:string,cookie:string,expectedStatus:number,ordinary:boolean,confidential:boolean){
  const res=await fetch(BASE+"/api/ceo-box",{headers:{Cookie:cookie},signal:AbortSignal.timeout(12000)});
  const data=await res.json() as any;
  const rows=Array.isArray(data)?data:[];
  const hasOrdinary=rows.some((r:any)=>r.work===ORDINARY);
  const hasConfidential=rows.some((r:any)=>r.work===SECRET);
  const pass=res.status===expectedStatus&&hasOrdinary===ordinary&&hasConfidential===confidential;
  console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+res.status+", ordinary "+(hasOrdinary?"visible":"hidden")+", confidential "+(hasConfidential?"visible":"hidden")+")");
  if(!pass)failures++;
 }
 async function fileCheck(label:string,name:typeof FILES[number]["name"],cookie:string|undefined){
  const res=await fetch(BASE+"/api/files/"+ids.get(name),{
   headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(12000),
  });
  const bytes=Buffer.from(await res.arrayBuffer());
  const fixture=FILES.find(f=>f.name===name)!;
  const leaked=res.status===200&&bytes.toString("utf8")===fixture.payload;
  const pass=[401,403,404].includes(res.status)&&!leaked;
  console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+res.status+")");
  if(!pass)failures++;
 }
 await listCheck("administrator can see ordinary but not confidential CEO record",admin,200,true,false);
 await listCheck("Billing Manager lacks CEO Box access",manager,403,false,false);
 await listCheck("Verification employee lacks CEO Box access",verifier,403,false,false);
 await fileCheck("ordinary CEO Box attachment remains blocked until authorized",FILES[0].name,admin);
 await fileCheck("confidential CEO Box attachment remains blocked for admin",FILES[1].name,admin);
 await fileCheck("Billing Manager cannot download ordinary CEO Box file",FILES[0].name,manager);
 await fileCheck("anonymous visitor cannot download CEO Box file",FILES[0].name,undefined);
 if(failures){
  console.error("CONFIRMED RELEASE BLOCKER: CEO Box baseline access rules violated");
  process.exitCode=2;
 }else{
  console.log("PASS: all seven CEO Box pre-patch record and attachment access checks enforced");
 }
}
main().catch(error=>{
 console.error("CEO Box baseline probe failed:",error instanceof Error?error.message.split("\n")[0]:"unexpected error");
 process.exitCode=1;
});
