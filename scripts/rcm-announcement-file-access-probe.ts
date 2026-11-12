/**
 * Read-only synthetic Announcement audience and attachment authorization probe.
 * Verifies exact author/recipient access, manager exclusion, anonymous denial,
 * plus regression coverage for Guidelines, Ticket and private-message files.
 *
 * Only fictional staging records. Does not log secrets or file contents.
 * Exit 0: pass; 2: access policy violation; 1: fixture/setup error.
 */
import {readFileSync} from "node:fs";
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const TITLE="TEST SECURITY TARGETED ANNOUNCEMENT";
const FILE="rcm-announcement-attachment-synthetic.txt";
const TEXT="SYNTHETIC ONLY: targeted announcement attachment security test.";
const FILES=[
  {name:FILE,payload:TEXT},
  {name:"rcm-ticket-attachment-synthetic.txt",payload:"SYNTHETIC ONLY: Ticket file download authorization test."},
  {name:"rcm-guidelines-attachment-synthetic.txt",payload:"SYNTHETIC ONLY: Guidelines authorized download test. No patient information."},
  {name:"rcm-private-attachment-synthetic.txt",payload:"SYNTHETIC ONLY: private message file authorization regression test; no patient information."},
] as const;
function assert(ok:unknown,msg:string):asserts ok{if(!ok)throw Error("REFUSED: "+msg);}
async function main(){
 const url=process.env.DATABASE_URL;
 assert(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"synthetic staging database only");
 const pool=new Pool({connectionString:url,max:1});
 const ids=new Map<string,number>();
 let announcementId:number;
 try{
  const db=await pool.query("SELECT current_database() AS name");
  assert(db.rows[0]?.name===DB,"unexpected PostgreSQL target");
  const files=await pool.query(
   "SELECT id,original_name AS name,mime_type AS type,data FROM file_uploads WHERE original_name=ANY($1::text[])",
   [FILES.map(f=>f.name)]
  );
  assert(files.rowCount===4,"four fictional attachment fixtures required");
  for(const f of FILES){
   const matches=files.rows.filter(r=>r.name===f.name);
   assert(matches.length===1&&matches[0].type==="text/plain"&&
      Buffer.from(matches[0].data,"base64").toString("utf8")===f.payload,
      "synthetic fixture file mismatch");
   ids.set(f.name,Number(matches[0].id));
  }
  const users=await pool.query("SELECT id,username FROM users WHERE username=ANY($1::text[]) AND active=true",
    [["rcm_demo_admin","rcm_demo_verifier","rcm_demo_manager"]]);
  assert(users.rowCount===3,"fictional author, recipient and manager required");
  const uid=new Map(users.rows.map(r=>[r.username,Number(r.id)]));
  const announcements=await pool.query(
    "SELECT id,author_id AS author,target_type AS type,target_user_ids AS targets FROM announcements WHERE title=$1 AND $2=ANY(attachments)",
    [TITLE,"/api/files/"+ids.get(FILE)+"|"+FILE],
  );
  assert(announcements.rowCount===1,"exactly one targeted fictional Announcement required");
  const a=announcements.rows[0];announcementId=Number(a.id);
  assert(a.type==="users"&&Number(a.author)===uid.get("rcm_demo_admin")&&
    a.targets.length===1&&Number(a.targets[0])===uid.get("rcm_demo_verifier")&&
    !a.targets.includes(uid.get("rcm_demo_manager")),"fictional target audience mismatch");
  console.log("PASS: targeted Announcement, audience and four fictional attachments verified");
 }finally{await pool.end();}
 const logins=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
 async function cookieFor(username:string){
  const row=logins.find(s=>s.startsWith(username+" |"));
  assert(row,"missing fictional login "+username);
  const [name,,password]=row.split("|").map(x=>x.trim());
  const login=await fetch(BASE+"/api/auth/login",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({username:name,password}),signal:AbortSignal.timeout(12000),
  });
  assert(login.status===200,"synthetic login failed");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie,"synthetic session cookie not returned");
  return cookie;
 }
 const admin=await cookieFor("rcm_demo_admin");
 const verifier=await cookieFor("rcm_demo_verifier");
 const manager=await cookieFor("rcm_demo_manager");
 let failed=0;
 async function listCheck(label:string,cookie:string,shouldSee:boolean){
  const res=await fetch(BASE+"/api/announcements",{
   headers:{Cookie:cookie},signal:AbortSignal.timeout(12000),
  });
  const body=await res.json() as any;
  const visible=res.status===200&&Array.isArray(body)&&body.some((x:any)=>Number(x.id)===announcementId);
  const pass=res.status===200&&visible===shouldSee;
  console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+res.status+", targeted announcement "+(visible?"visible":"hidden")+")");
  if(!pass)failed++;
 }
 async function fileCheck(label:string,name:typeof FILES[number]["name"],cookie:string|undefined,allow:boolean){
  const f=FILES.find(f=>f.name===name)!;
  const res=await fetch(BASE+"/api/files/"+ids.get(name),{
   headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(12000),
  });
  const bytes=Buffer.from(await res.arrayBuffer());
  const returned=res.status===200&&bytes.toString("utf8")===f.payload;
  const denied=[401,403,404].includes(res.status)&&!returned;
  const pass=allow?returned:denied;
  console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+res.status+")");
  if(!pass)failed++;
 }
 await listCheck("author sees targeted Announcement",admin,true);
 await listCheck("recipient sees targeted Announcement",verifier,true);
 await listCheck("unrelated manager does not see targeted Announcement",manager,false);
 await fileCheck("author downloads targeted Announcement attachment",FILE,admin,true);
 await fileCheck("recipient downloads targeted Announcement attachment",FILE,verifier,true);
 await fileCheck("manager cannot download targeted Announcement attachment",FILE,manager,false);
 await fileCheck("anonymous cannot download targeted Announcement attachment",FILE,undefined,false);
 await fileCheck("manager cannot download Ticket attachment",FILES[1].name,manager,false);
 await fileCheck("admin retains Ticket download access",FILES[1].name,admin,true);
 await fileCheck("manager retains Guidelines download access",FILES[2].name,manager,true);
 await fileCheck("manager remains blocked from private message file",FILES[3].name,manager,false);
 await fileCheck("recipient retains private message file access",FILES[3].name,verifier,true);
 if(failed){
  console.error("CONFIRMED RELEASE BLOCKER: Announcement audience/file authorization regression");
  process.exitCode=2;
 }else{
  console.log("PASS: all 12 Announcement, Ticket, Guidelines and private-file access checks enforced");
 }
}
main().catch(err=>{
 console.error("Announcement file probe failed:",err instanceof Error?err.message.split("\n")[0]:"unexpected error");
 process.exitCode=1;
});
