/**
 * Dry-run-first CEO Box security fixture, synthetic staging only.
 * --apply grants CEO Box access only to the fictional demo administrator,
 * creates a non-confidential and a confidential fictional record with one
 * harmless text attachment each. Other accounts remain unprivileged.
 *
 * Refuses to run outside exact synthetic database and expected baseline.
 */
import {Pool} from "pg";
const DB="fastbills_rcm_synthetic_staging";
const NONCONF="TEST SECURITY CEO BOX STANDARD";
const CONF="TEST SECURITY CEO BOX CONFIDENTIAL";
const FILES=[
 {name:"rcm-ceobox-standard-synthetic.txt",payload:"SYNTHETIC ONLY: CEO Box ordinary file access fixture.",confidential:false,title:NONCONF},
 {name:"rcm-ceobox-confidential-synthetic.txt",payload:"SYNTHETIC ONLY: CEO Box confidential access fixture.",confidential:true,title:CONF},
];
function check(value:unknown,message:string):asserts value{
 if(!value)throw Error("REFUSED: "+message);
 console.log("PASS: "+message);
}
async function main(){
 const url=process.env.DATABASE_URL;
 check(url&&decodeURIComponent(new URL(url).pathname)==="/"+DB,"exact synthetic staging URL required");
 const apply=process.argv.includes("--apply");
 check(process.argv.every(a=>!a.startsWith("--")||a==="--apply"),"known arguments only");
 const pool=new Pool({connectionString:url,max:1});
 const client=await pool.connect();let started=false;
 try{
  const db=await client.query("SELECT current_database() AS name");
  check(db.rows[0]?.name===DB,"connected only to synthetic staging");
  await client.query("BEGIN");started=true;
  await client.query("SET LOCAL lock_timeout='4000ms'");
  await client.query("SET LOCAL statement_timeout='15000ms'");
  await client.query("SELECT pg_advisory_xact_lock(20261112,45)");
  const counts=await client.query(
    "SELECT (SELECT count(*)::int FROM tasks) AS tasks,"+
    "(SELECT count(*)::int FROM file_uploads) AS files,"+
    "(SELECT count(*)::int FROM direct_messages) AS dm,"+
    "(SELECT count(*)::int FROM tickets) AS tickets,"+
    "(SELECT count(*)::int FROM ticket_comments) AS comments,"+
    "(SELECT count(*)::int FROM announcements) AS announcements,"+
    "(SELECT count(*)::int FROM ceo_box) AS ceo"
  );
  const c=counts.rows[0];
  check(c.tasks===8&&c.files===5&&c.dm===1&&c.tickets===1&&c.comments===1&&c.announcements===1&&c.ceo===0,
    "expected fictional tasks and 5 prior attachments; CEO Box empty");
  const users=await client.query(
    "SELECT id,username,full_name,ceo_box_access AS ceo,active FROM users WHERE username=ANY($1::text[])",
    [["rcm_demo_admin","rcm_demo_manager","rcm_demo_verifier","rcm_demo_other"]]
  );
  check(users.rowCount===4&&users.rows.every(r=>r.active===true&&r.ceo===false),
    "four fictional accounts active; none currently has CEO access");
  const admin=users.rows.find(r=>r.username==="rcm_demo_admin");
  check(admin&&admin.full_name==="Demo Administrator","expected fictional administrator");
  await client.query("UPDATE users SET ceo_box_access=true WHERE id=$1",[admin.id]);
  for(const f of FILES){
    const payload=Buffer.from(f.payload,"utf8");
    const file=await client.query(
      "INSERT INTO file_uploads(filename,original_name,mime_type,data,size) VALUES($1,$2,'text/plain',$3,$4) RETURNING id",
      [f.name,f.name,payload.toString("base64"),payload.length]
    );
    const ref="/api/files/"+file.rows[0].id+"|"+f.name;
    await client.query(
      "INSERT INTO ceo_box(work,notes,confidential,created_by_id,attachments) VALUES($1,$2,$3,$4,$5::text[])",
      [f.title,"Fictional security regression fixture only",f.confidential,admin.id,[ref]]
    );
  }
  const verify=await client.query("SELECT count(*)::int AS count FROM ceo_box WHERE work=ANY($1::text[])",[[NONCONF,CONF]]);
  check(verify.rows[0].count===2,"two fictional CEO Box attachment fixtures proposed");
  if(apply){
   await client.query("COMMIT");started=false;
   console.log("PASS: synthetic CEO Box fixture COMMITTED");
  }else{
   await client.query("ROLLBACK");started=false;
   console.log("PASS: synthetic CEO Box fixture dry-run ROLLED BACK; nothing changed");
  }
 }catch(error){
  if(started)await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();await pool.end();}
}
main().catch(e=>{
 console.error("CEO Box fixture setup:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");
 process.exitCode=1;
});
