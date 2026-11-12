/**
 * Dry-run-first synthetic Guidelines attachment fixture for download security.
 * Existing private DM fixture is retained and never modified.
 * --apply creates one Guidelines module and one text file only.
 */
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const TITLE="TEST SECURITY GUIDELINES ATTACHMENT";
const FILE="rcm-guidelines-attachment-synthetic.txt";
const DATA="SYNTHETIC ONLY: Guidelines authorized download test. No patient information.";
function assert(v:unknown,msg:string):asserts v{if(!v)throw Error("REFUSED: "+msg);console.log("PASS: "+msg);}
async function main(){
 const url=process.env.DATABASE_URL;
 assert(url && decodeURIComponent(new URL(url).pathname)==="/"+DB,"synthetic-only URL");
 const apply=process.argv.includes("--apply");
 assert(process.argv.every(a=>!a.startsWith("--")||a==="--apply"),"known options");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();let started=false;
 try{
  const db=await client.query("SELECT current_database() AS name");
  assert(db.rows[0]?.name===DB,"synthetic staging verified");
  await client.query("BEGIN");started=true;
  await client.query("SET LOCAL statement_timeout='15000ms'");
  await client.query("SET LOCAL lock_timeout='4000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112,42)");
  const baseline=await client.query(
    "SELECT (SELECT count(*)::int FROM tasks) AS tasks,"+
    "(SELECT count(*)::int FROM file_uploads) AS files,"+
    "(SELECT count(*)::int FROM direct_messages) AS messages,"+
    "(SELECT count(*)::int FROM guideline_modules WHERE title=$1) AS guidelines",
    [TITLE],
  );
  const c=baseline.rows[0];
  assert(c.tasks===8 && c.files===1 && c.messages===1 && c.guidelines===0,
    "eight baseline tasks, one private attachment, no duplicate Guidelines fixture");
  const user=await client.query("SELECT id FROM users WHERE username='rcm_demo_admin' AND active=true");
  assert(user.rowCount===1,"fictional active administrator present");
  const author=Number(user.rows[0].id);
  const bytes=Buffer.from(DATA,"utf8");
  const file=await client.query(
    "INSERT INTO file_uploads(filename,original_name,mime_type,data,size) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [FILE,FILE,"text/plain",bytes.toString("base64"),bytes.length],
  );
  const attachment="/api/files/"+file.rows[0].id+"|"+FILE;
  await client.query(
    "INSERT INTO guideline_modules(title,body,module_type,attachments,author_id,updated_by_id) VALUES($1,$2,$3,$4::text[],$5,$5)",
    [TITLE,"Fictional Guidelines attachment access fixture","guideline",[attachment],author],
  );
  const count=await client.query("SELECT count(*)::int AS n FROM guideline_modules WHERE title=$1",[TITLE]);
  assert(count.rows[0].n===1,"one synthetic module attachment proposed");
  if(apply){
   await client.query("COMMIT");started=false;
   console.log("PASS: Guidelines attachment fixture COMMITTED");
  }else{
   await client.query("ROLLBACK");started=false;
   console.log("PASS: Guidelines attachment fixture dry-run ROLLED BACK; no changes");
  }
 }catch(e){if(started)await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message.split("\n")[0]:"Unexpected error");process.exitCode=1;});
