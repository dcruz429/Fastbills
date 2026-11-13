/**
 * Read-only CEO Box file-download authorization regression on localhost,
 * against the synthetic-only database. No content or credentials logged.
 */
import {readFileSync} from "node:fs";
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const FILES=[
 {title:"TEST SECURITY CEO BOX STANDARD",filename:"rcm-ceobox-standard-synthetic.txt",text:"SYNTHETIC ONLY: CEO Box ordinary file access fixture.",secret:false},
 {title:"TEST SECURITY CEO BOX CONFIDENTIAL",filename:"rcm-ceobox-confidential-synthetic.txt",text:"SYNTHETIC ONLY: CEO Box confidential access fixture.",secret:true},
] as const;
function guard(ok:unknown,msg:string):asserts ok{if(!ok)throw Error("REFUSED: "+msg);}
async function main(){
 const url=process.env.DATABASE_URL;
 guard(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic database required");
 const pool=new Pool({connectionString:url,max:1});
 const ids=new Map<string,number>();
 try{
  const db=await pool.query("SELECT current_database() AS name");
  guard(db.rows[0]?.name===DB,"unexpected database");
  const files=await pool.query("SELECT id,original_name AS filename,data FROM file_uploads WHERE original_name=ANY($1::text[])",[FILES.map(f=>f.filename)]);
  guard(files.rowCount===2,"exactly two fictional CEO Box attachments");
  for(const f of FILES){
   const matches=files.rows.filter(r=>r.filename===f.filename);
   guard(matches.length===1&&Buffer.from(matches[0].data,"base64").toString("utf8")===f.text,"CEO Box file fixture mismatch");
   ids.set(f.filename,Number(matches[0].id));
  }
  const records=await pool.query("SELECT work,confidential,attachments FROM ceo_box WHERE work=ANY($1::text[])",[FILES.map(f=>f.title)]);
  guard(records.rowCount===2,"exactly two CEO Box records");
  for(const f of FILES){
   const match=records.rows.filter(r=>r.work===f.title);
   guard(match.length===1&&match[0].confidential===f.secret&&match[0].attachments.length===1&&
    match[0].attachments[0]==="/api/files/"+ids.get(f.filename)+"|"+f.filename,"CEO Box parent mismatch");
  }
  const users=await pool.query("SELECT username,active,ceo_box_access AS ceo FROM users WHERE username=ANY($1::text[])",[["rcm_demo_admin","rcm_demo_manager"]]);
  guard(users.rowCount===2&&users.rows.find(r=>r.username==="rcm_demo_admin")?.ceo===true&&
    users.rows.find(r=>r.username==="rcm_demo_manager")?.ceo===false,"CEO Box grant fixture mismatch");
  console.log("PASS: fictional CEO Box parent/attachment and account grants verified");
 }finally{await pool.end();}
 const lines=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
 async function cookieFor(username:string){
  const line=lines.find(x=>x.startsWith(username+" |"));
  guard(line,"missing synthetic login");
  const [name,,password]=line.split("|").map(x=>x.trim());
  const res=await fetch(BASE+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:name,password}),signal:AbortSignal.timeout(12000)});
  guard(res.status===200,"synthetic login failed");
  const cookie=res.headers.get("set-cookie")?.split(";")[0];
  guard(cookie,"missing session cookie");return cookie;
 }
 const admin=await cookieFor("rcm_demo_admin");
 const manager=await cookieFor("rcm_demo_manager");
 let fails=0;
 async function probe(label:string,filename:string,expectedText:string,cookie:string|undefined,shouldAllow:boolean){
  const res=await fetch(BASE+"/api/files/"+ids.get(filename),{
   headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(12000)});
  const body=Buffer.from(await res.arrayBuffer());
  const correct=res.status===200&&body.toString("utf8")===expectedText;
  const blocked=[401,403,404].includes(res.status)&&!correct;
  const passed=shouldAllow?correct:blocked;
  console.log((passed?"PASS":"FAIL")+": "+label+" (HTTP "+res.status+")");
  if(!passed)fails++;
 }
 await probe("CEO-authorized admin can download ordinary CEO Box file",FILES[0].filename,FILES[0].text,admin,true);
 await probe("CEO-authorized admin cannot download confidential CEO Box file",FILES[1].filename,FILES[1].text,admin,false);
 await probe("manager without CEO Box grant cannot download ordinary file",FILES[0].filename,FILES[0].text,manager,false);
 await probe("manager without CEO Box grant cannot download confidential file",FILES[1].filename,FILES[1].text,manager,false);
 await probe("anonymous visitor cannot download ordinary CEO Box file",FILES[0].filename,FILES[0].text,undefined,false);
 await probe("anonymous visitor cannot download confidential CEO Box file",FILES[1].filename,FILES[1].text,undefined,false);
 if(fails){console.error("CONFIRMED RELEASE BLOCKER: CEO Box attachment access policy violation");process.exitCode=2;}
 else console.log("PASS: all six CEO Box attachment authorization checks enforced");
}
main().catch(error=>{console.error("CEO Box file probe failed:",error instanceof Error?error.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
