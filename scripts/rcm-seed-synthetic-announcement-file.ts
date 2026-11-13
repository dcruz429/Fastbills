/**
 * Dry-run-first fictional targeted-announcement file fixture.
 * --apply commits one private-to-verifier announcement and one text file.
 * Does not touch task, DM, Guidelines or Ticket fixtures.
 */
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const TITLE="TEST SECURITY TARGETED ANNOUNCEMENT";
const FILENAME="rcm-announcement-attachment-synthetic.txt";
const PAYLOAD="SYNTHETIC ONLY: targeted announcement attachment security test.";
function check(v:unknown,m:string):asserts v{if(!v)throw Error("REFUSED: "+m);console.log("PASS: "+m);}
async function main(){
 const url=process.env.DATABASE_URL;
 check(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic database URL");
 const apply=process.argv.includes("--apply");
 check(process.argv.every(a=>!a.startsWith("--")||a==="--apply"),"recognized options");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();let tx=false;
 try{
  const id=await client.query("SELECT current_database() AS name");
  check(id.rows[0]?.name===DB,"synthetic-only staging database");
  await client.query("BEGIN");tx=true;
  await client.query("SET LOCAL lock_timeout='4000ms'");
  await client.query("SET LOCAL statement_timeout='15000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112,44)");
  const b=await client.query(
   "SELECT (SELECT count(*)::int FROM tasks) AS tasks,(SELECT count(*)::int FROM file_uploads) AS files,"+
   "(SELECT count(*)::int FROM direct_messages) AS dm,(SELECT count(*)::int FROM tickets) AS tickets,"+
   "(SELECT count(*)::int FROM ticket_comments) AS comments,(SELECT count(*)::int FROM announcements) AS announcements");
  const row=b.rows[0];
  check(row.tasks===8&&row.files===4&&row.dm===1&&row.tickets===1&&row.comments===1&&row.announcements===0,
   "baseline fictional tasks, DM, Guidelines, Tickets, and no Announcements");
  const users=await client.query("SELECT username,id FROM users WHERE username=ANY($1::text[]) AND active=true",
   [["rcm_demo_admin","rcm_demo_verifier","rcm_demo_manager"]]);
  check(users.rowCount===3,"fictional author, recipient and excluded manager exist");
  const userIds=new Map(users.rows.map(r=>[r.username,Number(r.id)]));
  const bytes=Buffer.from(PAYLOAD,"utf8");
  const file=await client.query(
   "INSERT INTO file_uploads(filename,original_name,mime_type,data,size) VALUES($1,$2,'text/plain',$3,$4) RETURNING id",
   [FILENAME,FILENAME,bytes.toString("base64"),bytes.length]);
  const attachment="/api/files/"+file.rows[0].id+"|"+FILENAME;
  const message=await client.query(
   "INSERT INTO announcements(title,body,author_id,target_type,target_user_ids,attachments) VALUES($1,$2,$3,'users',$4::int[],$5::text[]) RETURNING id",
   [TITLE,"Fictional targeted announcement for security audit",
    userIds.get("rcm_demo_admin"),[userIds.get("rcm_demo_verifier")],[attachment]]);
  check(message.rowCount===1,"one targeted fictional announcement proposed");
  if(apply){
   await client.query("COMMIT");tx=false;
   console.log("PASS: targeted Announcement attachment fixture COMMITTED");
  }else{
   await client.query("ROLLBACK");tx=false;
   console.log("PASS: dry-run ROLLED BACK; no records added");
  }
 }catch(e){if(tx)await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message.split("\n")[0]:"unexpected error");process.exitCode=1;});
