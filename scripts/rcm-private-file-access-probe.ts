/**
 * Read-only synthetic-only file authorization regression.
 * Tests a known fictional private-message attachment. No patient data,
 * content, passwords, cookie values, or file bytes are logged.
 *
 * Exit 0: only sender and recipient can download.
 * Exit 2: nonparticipant can download (confirmed release blocker).
 * Exit 1: test setup/server/fixture mismatch.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const FILENAME="rcm-private-attachment-synthetic.txt";
const PAYLOAD="SYNTHETIC ONLY: private message file authorization regression test; no patient information.";
function assert(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
async function main(){
 const url=process.env.DATABASE_URL;
 assert(url && decodeURIComponent(new URL(url).pathname)==="/"+DB,
   "REFUSED: exact synthetic staging database required");
 const pool=new Pool({connectionString:url,max:1});
 let fileId:number;
 try{
   const db=await pool.query("SELECT current_database() AS name");
   assert(db.rows[0]?.name===DB,"REFUSED: unexpected database");
   const files=await pool.query(
     "SELECT id,original_name AS name,mime_type AS type,data FROM file_uploads WHERE original_name=$1",
     [FILENAME],
   );
   assert(files.rowCount===1,"Exactly one fictional attachment fixture is required");
   const file=files.rows[0];fileId=Number(file.id);
   assert(file.name===FILENAME && file.type==="text/plain" &&
     Buffer.from(file.data,"base64").toString("utf8")===PAYLOAD,"Unexpected attachment fixture contents");
   const users=await pool.query(
     "SELECT id,username FROM users WHERE username=ANY($1::text[]) AND active=true",
     [["rcm_demo_other","rcm_demo_verifier","rcm_demo_manager"]],
   );
   assert(users.rowCount===3,"Fictional test identities missing");
   const ids=new Map(users.rows.map(row=>[row.username,Number(row.id)]));
   const messages=await pool.query(
     "SELECT sender_id AS sender,recipient_id AS recipient,attachments FROM direct_messages WHERE $1 = ANY(attachments)",
     ["/api/files/"+fileId+"|"+FILENAME],
   );
   assert(messages.rowCount===1,"Exactly one fictional private message must reference the file");
   const msg=messages.rows[0];
   assert(Number(msg.sender)===ids.get("rcm_demo_other") &&
     Number(msg.recipient)===ids.get("rcm_demo_verifier") &&
     ids.get("rcm_demo_manager")!==Number(msg.sender) &&
     ids.get("rcm_demo_manager")!==Number(msg.recipient),
     "Fictional private message ownership is unexpected");
   console.log("PASS: synthetic attachment and private-message ownership verified");
 }finally{await pool.end();}
 const lines=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
 async function accessAs(username:string){
   const line=lines.find(x=>x.startsWith(username+" |"));
   assert(line,"Missing fictional test credentials");
   const [loginName,,password]=line.split("|").map(x=>x.trim());
   const login=await fetch(BASE+"/api/auth/login",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({username:loginName,password}),signal:AbortSignal.timeout(12000),
   });
   assert(login.status===200,"Synthetic login failed for "+username);
   const cookie=login.headers.get("set-cookie")?.split(";")[0];
   assert(cookie,"Synthetic session cookie missing for "+username);
   const response=await fetch(BASE+"/api/files/"+fileId,{
     headers:{Cookie:cookie},signal:AbortSignal.timeout(12000),
   });
   const bytes=Buffer.from(await response.arrayBuffer());
   const matches=response.status===200 && bytes.toString("utf8")===PAYLOAD;
   console.log(username+": HTTP "+response.status+", fictional fixture contents "+(matches?"returned":"not returned"));
   return {status:response.status,matches};
 }
 const sender=await accessAs("rcm_demo_other");
 const recipient=await accessAs("rcm_demo_verifier");
 const outsider=await accessAs("rcm_demo_manager");
 if(outsider.matches){
   console.log("CONFIRMED RELEASE BLOCKER: authenticated nonparticipant downloaded a private attachment");
   process.exitCode=2;
 }else if(![403,404].includes(outsider.status)){
   throw Error("Unexpected response for unrelated manager (neither authorized download nor explicit denial)");
 }else if(sender.matches && recipient.matches){
   console.log("PASS: private attachment readable only by the fictional sender and recipient");
 }else{
   throw Error("Authorized sender or recipient could not read the fictional attachment");
 }
}
main().catch(e=>{
 console.error("File authorization probe failed:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");
 process.exitCode=1;
});
