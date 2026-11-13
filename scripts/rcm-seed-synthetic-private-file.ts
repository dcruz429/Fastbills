/**
 * One synthetic private-message file-download authorization fixture.
 * DRY RUN default; --apply commits. Never use production or real accounts.
 * Creates one 100%-fictional text attachment in a direct message from the
 * Harbor demo employee to the Evergreen Verification demo employee.
 * The Evergreen Billing manager is neither sender nor recipient.
 *
 * Explicitly refuses staging if any existing files/direct messages are present.
 */
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const FILENAME="rcm-private-attachment-synthetic.txt";
const PAYLOAD="SYNTHETIC ONLY: private message file authorization regression test; no patient information.";
function expect(ok:unknown,what:string):asserts ok {if(!ok)throw Error("REFUSED: "+what);console.log("PASS: "+what);}
async function main(){
 const url=process.env.DATABASE_URL;
 expect(url && decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic database URL");
 const apply=process.argv.includes("--apply");
 expect(process.argv.every(arg=>!arg.startsWith("--")||arg==="--apply"),"known arguments only");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();let tx=false;
 try{
  const db=await client.query("SELECT current_database() AS name");
  expect(db.rows[0]?.name===DB,"connected to synthetic-only staging");
  await client.query("BEGIN");tx=true;
  await client.query("SET LOCAL statement_timeout='15000ms'");
  await client.query("SET LOCAL lock_timeout='4000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112,41)");
  const baseline=await client.query("SELECT (SELECT count(*)::int FROM file_uploads) AS files,(SELECT count(*)::int FROM direct_messages) AS messages,(SELECT count(*)::int FROM tasks) AS tasks");
  expect(baseline.rows[0].files===0 && baseline.rows[0].messages===0 && baseline.rows[0].tasks===8,
    "empty file/message baseline and eight fictional tasks");
  const users=await client.query("SELECT id,username FROM users WHERE username=ANY($1::text[]) AND active=true",
    [["rcm_demo_other","rcm_demo_verifier","rcm_demo_manager"]]);
  expect(users.rowCount===3,"fictional sender, recipient, and nonparticipant accounts");
  const ids=new Map(users.rows.map(r=>[r.username,Number(r.id)]));
  const data=Buffer.from(PAYLOAD,"utf8");
  const file=await client.query(
    "INSERT INTO file_uploads(filename,original_name,mime_type,data,size) VALUES($1,$2,'text/plain',$3,$4) RETURNING id",
    [FILENAME,FILENAME,data.toString("base64"),data.length],
  );
  const attachment="/api/files/"+file.rows[0].id+"|"+FILENAME;
  const message=await client.query(
    "INSERT INTO direct_messages(sender_id,recipient_id,content,attachments) VALUES($1,$2,$3,$4::text[]) RETURNING id",
    [ids.get("rcm_demo_other"),ids.get("rcm_demo_verifier"),"Private fictional security fixture",[attachment]],
  );
  expect(message.rowCount===1,"fictional private-message attachment created in transaction");
  if(apply){
   await client.query("COMMIT");tx=false;
   console.log("PASS: synthetic private-message file fixture COMMITTED");
  }else{
   await client.query("ROLLBACK");tx=false;
   console.log("PASS: fixture dry-run ROLLED BACK; no data changed");
  }
 }catch(e){if(tx)await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message.split("\n")[0]:"Unexpected error");process.exitCode=1;});
