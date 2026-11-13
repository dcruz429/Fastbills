/**
 * Guarded, dry-run-first synthetic ticket and ticket-comment file fixtures.
 * --apply commits. Only exact synthetic database and known fictional baseline.
 * No actual uploaded files or real records are copied.
 */
import {Pool} from "pg";
const DATABASE="fastbills_rcm_synthetic_staging";
const MARK="TEST SECURITY TICKET ATTACHMENTS";
const FILES=[
 {name:"rcm-ticket-attachment-synthetic.txt",content:"SYNTHETIC ONLY: Ticket file download authorization test."},
 {name:"rcm-ticket-comment-attachment-synthetic.txt",content:"SYNTHETIC ONLY: Ticket comment file download authorization test."},
];
function ok(v:unknown,msg:string):asserts v{if(!v)throw Error("REFUSED: "+msg);console.log("PASS: "+msg);}
async function main(){
 const url=process.env.DATABASE_URL;
 ok(url&&decodeURIComponent(new URL(url).pathname)==="/"+DATABASE,"exact synthetic database URL required");
 const apply=process.argv.includes("--apply");
 ok(process.argv.every(a=>!a.startsWith("--")||a==="--apply"),"known options only");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();let tx=false;
 try {
  const current=await client.query("SELECT current_database() AS name");
  ok(current.rows[0]?.name===DATABASE,"synthetic staging selected");
  await client.query("BEGIN");tx=true;
  await client.query("SET LOCAL statement_timeout='15000ms'");
  await client.query("SET LOCAL lock_timeout='4000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112,43)");
  const baseline=await client.query(
   "SELECT (SELECT count(*)::int FROM tasks) AS tasks, "+
   "(SELECT count(*)::int FROM file_uploads) AS files, "+
   "(SELECT count(*)::int FROM direct_messages) AS messages, "+
   "(SELECT count(*)::int FROM guideline_modules WHERE title='TEST SECURITY GUIDELINES ATTACHMENT') AS guides, "+
   "(SELECT count(*)::int FROM tickets) AS tickets, "+
   "(SELECT count(*)::int FROM ticket_comments) AS comments"
  );
  const b=baseline.rows[0];
  ok(b.tasks===8&&b.files===2&&b.messages===1&&b.guides===1&&b.tickets===0&&b.comments===0,
   "known fictional task/private/Guidelines baseline and no prior tickets");
  const admin=await client.query("SELECT id FROM users WHERE username='rcm_demo_admin' AND active=true");
  ok(admin.rowCount===1,"fictional active admin exists");
  const adminId=Number(admin.rows[0].id);
  const ids:number[]=[];
  for(const f of FILES){
   const data=Buffer.from(f.content,"utf8");
   const result=await client.query(
    "INSERT INTO file_uploads(filename,original_name,mime_type,data,size) VALUES($1,$2,'text/plain',$3,$4) RETURNING id",
    [f.name,f.name,data.toString("base64"),data.length]
   );
   ids.push(Number(result.rows[0].id));
  }
  const attachment=(idx:number)=>"/api/files/"+ids[idx]+"|"+FILES[idx].name;
  const ticket=await client.query(
   "INSERT INTO tickets(title,description,created_by_id,attachments) VALUES($1,$2,$3,$4::text[]) RETURNING id",
   [MARK,"Fictional ticket download test only",adminId,[attachment(0)]]
  );
  await client.query(
   "INSERT INTO ticket_comments(ticket_id,user_id,content,attachments) VALUES($1,$2,$3,$4::text[])",
   [ticket.rows[0].id,adminId,"Fictional comment download test only",[attachment(1)]]
  );
  const count=await client.query(
   "SELECT (SELECT count(*)::int FROM tickets) AS tickets,(SELECT count(*)::int FROM ticket_comments) AS comments"
  );
  ok(count.rows[0].tickets===1&&count.rows[0].comments===1,
   "proposed one fictional ticket and one ticket-comment attachment");
  if(apply){
   await client.query("COMMIT");tx=false;
   console.log("PASS: synthetic Ticket file fixtures COMMITTED");
  }else{
   await client.query("ROLLBACK");tx=false;
   console.log("PASS: Ticket file fixtures dry-run ROLLED BACK; no records added");
  }
 }catch(e){if(tx)await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
