/**
 * Read-only, synthetic-only Ticket attachment authorization regression.
 * Admin should access Ticket and comment attachments, non-admins should not.
 * Also checks Guidelines and private-message protections remain intact.
 *
 * No credentials, cookie values, or file contents are logged.
 * Exit 0 = pass; 2 = policy violation; 1 = fixture/setup error.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DB="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const FIXTURES=[
  { name:"rcm-ticket-attachment-synthetic.txt", payload:"SYNTHETIC ONLY: Ticket file download authorization test." },
  { name:"rcm-ticket-comment-attachment-synthetic.txt", payload:"SYNTHETIC ONLY: Ticket comment file download authorization test." },
  { name:"rcm-guidelines-attachment-synthetic.txt", payload:"SYNTHETIC ONLY: Guidelines authorized download test. No patient information." },
  { name:"rcm-private-attachment-synthetic.txt", payload:"SYNTHETIC ONLY: private message file authorization regression test; no patient information." },
] as const;
function assert(ok:unknown,message:string):asserts ok {
  if(!ok)throw Error("REFUSED: "+message);
}
async function main(){
  const url=process.env.DATABASE_URL;
  assert(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,
    "exact synthetic staging database URL required");
  const pool=new Pool({connectionString:url,max:1});
  const ids=new Map<string,number>();
  try{
    const current=await pool.query("SELECT current_database() AS name");
    assert(current.rows[0]?.name===DB,"unexpected database");
    const records=await pool.query(
      "SELECT id,original_name AS name,mime_type AS type,data FROM file_uploads WHERE original_name=ANY($1::text[])",
      [FIXTURES.map(f=>f.name)],
    );
    assert(records.rowCount===FIXTURES.length,"exactly four fictional file fixtures expected");
    for(const fixture of FIXTURES){
      const matches=records.rows.filter(r=>r.name===fixture.name);
      assert(matches.length===1&&matches[0].type==="text/plain"&&
        Buffer.from(matches[0].data,"base64").toString("utf8")===fixture.payload,
        "fictional file fixture mismatch");
      ids.set(fixture.name,Number(matches[0].id));
    }
    const ticketId=ids.get(FIXTURES[0].name)!;
    const commentId=ids.get(FIXTURES[1].name)!;
    const ticket=await pool.query(
      "SELECT id FROM tickets WHERE title='TEST SECURITY TICKET ATTACHMENTS' AND $1=ANY(attachments)",
      ["/api/files/"+ticketId+"|"+FIXTURES[0].name],
    );
    assert(ticket.rowCount===1,"single fictional Ticket parent required");
    const comment=await pool.query(
      "SELECT id FROM ticket_comments WHERE ticket_id=$1 AND $2=ANY(attachments)",
      [ticket.rows[0].id,"/api/files/"+commentId+"|"+FIXTURES[1].name],
    );
    assert(comment.rowCount===1,"single fictional Ticket-comment parent required");
    const guide=await pool.query(
      "SELECT id FROM guideline_modules WHERE title=$1 AND $2=ANY(attachments)",
      ["TEST SECURITY GUIDELINES ATTACHMENT","/api/files/"+ids.get(FIXTURES[2].name)+"|"+FIXTURES[2].name],
    );
    assert(guide.rowCount===1,"single fictional Guidelines parent required");
    const dm=await pool.query(
      "SELECT id FROM direct_messages WHERE $1=ANY(attachments)",
      ["/api/files/"+ids.get(FIXTURES[3].name)+"|"+FIXTURES[3].name],
    );
    assert(dm.rowCount===1,"single fictional private-message parent required");
    console.log("PASS: synthetic-only Ticket, comment, Guidelines and DM ownership verified");
  }finally{await pool.end();}

  const credentials=readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
  async function cookieFor(username:string){
    const entry=credentials.find(line=>line.startsWith(username+" |"));
    assert(entry,"missing fictional login");
    const [name,,password]=entry.split("|").map(x=>x.trim());
    const response=await fetch(BASE+"/api/auth/login",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:name,password}),signal:AbortSignal.timeout(12000),
    });
    assert(response.status===200,"fictional login failed");
    const cookie=response.headers.get("set-cookie")?.split(";")[0];
    assert(cookie,"missing fictional session cookie");
    return cookie;
  }
  const admin=await cookieFor("rcm_demo_admin");
  const manager=await cookieFor("rcm_demo_manager");
  const verifier=await cookieFor("rcm_demo_verifier");
  const sender=await cookieFor("rcm_demo_other");
  let failures=0;
  async function probe(label:string,file:typeof FIXTURES[number],cookie:string|undefined,expectedAllowed:boolean){
    const response=await fetch(BASE+"/api/files/"+ids.get(file.name),{
      headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(12000),
    });
    const bytes=Buffer.from(await response.arrayBuffer());
    const allowed=response.status===200&&bytes.toString("utf8")===file.payload;
    const denied=[401,403,404].includes(response.status)&&!allowed;
    const pass=expectedAllowed?allowed:denied;
    console.log((pass?"PASS":"FAIL")+": "+label+" (HTTP "+response.status+")");
    if(!pass)failures++;
  }
  await probe("administrator downloads Ticket file",FIXTURES[0],admin,true);
  await probe("administrator downloads Ticket comment file",FIXTURES[1],admin,true);
  await probe("manager denied Ticket file",FIXTURES[0],manager,false);
  await probe("manager denied Ticket comment file",FIXTURES[1],manager,false);
  await probe("Verification employee denied Ticket file",FIXTURES[0],verifier,false);
  await probe("anonymous visitor denied Ticket file",FIXTURES[0],undefined,false);
  await probe("manager retains Guidelines access",FIXTURES[2],manager,true);
  await probe("Verification employee retains Guidelines access",FIXTURES[2],verifier,true);
  await probe("unrelated manager denied private attachment",FIXTURES[3],manager,false);
  await probe("private sender retains file access",FIXTURES[3],sender,true);
  await probe("private recipient retains file access",FIXTURES[3],verifier,true);
  if(failures){
    console.error("CONFIRMED RELEASE BLOCKER: Ticket attachment ownership regression");
    process.exitCode=2;
  }else{
    console.log("PASS: all 11 Ticket, Guidelines, and private-message file access checks enforced");
  }
}
main().catch(error=>{
  console.error("Ticket file authorization probe failed:",error instanceof Error?error.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
