/**
 * Seed a SCHEMA-ONLY synthetic staging database with fictional fixtures.
 * Never copies real patients or users. Refuses to run if any users, tasks or
 * clinics already exist. Generates unique login credentials in a local
 * owner-readable file; never prints passwords.
 *
 * DATABASE_URL="$RCM_SYNTHETIC_URL" npx tsx scripts/rcm-seed-synthetic.ts
 */
import { pool } from "../server/db";
import { scrypt as callbackScrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { writeFileSync, existsSync } from "node:fs";

const dbName="fastbills_rcm_synthetic_staging";
const credentialFile="/tmp/fastbills_rcm_synthetic_logins.txt";
const scrypt=promisify(callbackScrypt);
async function hashedPassword(password:string){
  const salt=randomBytes(16).toString("hex");
  const hash=await scrypt(password,salt,64) as Buffer;
  return hash.toString("hex")+"."+salt;
}
function check(ok:unknown,description:string):asserts ok{
  if(!ok)throw Error("FAIL: "+description);
  console.log("PASS: "+description);
}
async function main(){
  const url=process.env.DATABASE_URL;
  if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+dbName)throw Error("Synthetic database URL required");
  if(existsSync(credentialFile))throw Error("Credentials file already exists; inspect it before reseeding");
  const client=await pool.connect();
  let transaction=false;
  const accounts: Array<{username:string,password:string,role:string}>=[];
  try{
    const current=await client.query("SELECT current_database() AS db");
    check(current.rows[0]?.db===dbName,"connected to synthetic database only");
    await client.query("BEGIN");
    transaction=true;
    await client.query("SET LOCAL statement_timeout='15000ms'");
    await client.query("SELECT pg_advisory_xact_lock(20261112, 2)");
    const counts=await client.query(
      "SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM tasks) AS tasks,(SELECT count(*)::int FROM clinics) AS clinics,(SELECT count(*)::int FROM rcm_roles) AS roles,(SELECT count(*)::int FROM rcm_productivity_weights) AS weights"
    );
    const c=counts.rows[0];
    check(c.users===0 && c.tasks===0 && c.clinics===0,"no existing identities, tasks or clinics");
    check(c.roles===12 && c.weights===9,"RCM configuration seeded with 12 roles and 9 weights");
    const clinicA=Number((await client.query("INSERT INTO clinics(name) VALUES('Evergreen Demo Clinic') RETURNING id")).rows[0].id);
    const clinicB=Number((await client.query("INSERT INTO clinics(name) VALUES('Harbor Demo Clinic') RETURNING id")).rows[0].id);
    const identities=[
      {username:"rcm_demo_admin",name:"Demo Administrator",role:"admin",clinics:[] as number[],departments:[] as string[]},
      {username:"rcm_demo_manager",name:"Demo Billing Manager",role:"manager",clinics:[clinicA],departments:["Billing"]},
      {username:"rcm_demo_reviewer",name:"Demo Independent Reviewer",role:"manager",clinics:[clinicA],departments:["Billing"]},
      {username:"rcm_demo_biller",name:"Demo Billing Specialist",role:"biller",clinics:[clinicA],departments:["Billing"]},
      {username:"rcm_demo_verifier",name:"Demo Verification Specialist",role:"verifier",clinics:[clinicA],departments:["Verification"]},
      {username:"rcm_demo_other",name:"Demo Other Clinic Employee",role:"biller",clinics:[clinicB],departments:["Billing"]},
    ] as const;
    const ids=new Map<string,number>();
    for(const user of identities){
      const password=randomBytes(24).toString("base64url");
      const result=await client.query(
        "INSERT INTO users(username,password,full_name,role,active) VALUES($1,$2,$3,$4,true) RETURNING id",
        [user.username,await hashedPassword(password),user.name,user.role]
      );
      const userId=Number(result.rows[0].id);
      ids.set(user.username,userId);
      accounts.push({username:user.username,password,role:user.role});
      for(const clinicId of user.clinics){
        await client.query("INSERT INTO rcm_user_clinics(user_id,clinic_id) VALUES($1,$2)",[userId,clinicId]);
      }
      for(const department of user.departments){
        await client.query("INSERT INTO rcm_user_departments(user_id,department_key) VALUES($1,$2)",[userId,department]);
      }
    }
    const demoTasks=[
      {name:"TEST PATIENT 001",clinic:clinicA,bucket:"ready_for_billing",priority:"low",status:"unassigned",assignee:null,due:1},
      {name:"TEST PATIENT 002",clinic:clinicA,bucket:"ready_for_billing",priority:"medium",status:"assigned",assignee:ids.get("rcm_demo_biller"),due:3},
      {name:"TEST PATIENT 003",clinic:clinicA,bucket:"ready_for_billing",priority:"high",status:"unassigned",assignee:null,due:-1},
      {name:"TEST PATIENT 004",clinic:clinicA,bucket:"ready_for_billing",priority:"critical",status:"unassigned",assignee:null,due:0},
      {name:"TEST PATIENT 005",clinic:clinicA,bucket:"for_verification",priority:"low",status:"assigned",assignee:ids.get("rcm_demo_verifier"),due:2},
      {name:"TEST PATIENT 006",clinic:clinicA,bucket:"for_verification",priority:"medium",status:"unassigned",assignee:null,due:5},
      {name:"TEST PATIENT 007",clinic:clinicA,bucket:"done",priority:"low",status:"done",assignee:ids.get("rcm_demo_biller"),due:-5},
      {name:"TEST PATIENT 008",clinic:clinicB,bucket:"ready_for_billing",priority:"low",status:"assigned",assignee:ids.get("rcm_demo_other"),due:4},
    ];
    for(let i=0;i<demoTasks.length;i++){
      const t=demoTasks[i];
      await client.query(
        "INSERT INTO tasks(patient_name,chart_number,clinic_id,bucket,priority,status,assigned_user_id,due_date,notes,uploader_id) VALUES($1,$2,$3,$4,$5,$6,$7,now()+($8::integer * interval '1 day'),$9,$10)",
        [t.name,"DEMO-CHART-"+String(i+1).padStart(3,"0"),t.clinic,t.bucket,t.priority,t.status,t.assignee??null,t.due,"Fictional staging record; not for actual billing",ids.get("rcm_demo_admin")],
      );
    }
    await client.query("COMMIT");
    transaction=false;
    // Write sensitive synthetic login secrets locally, never to git or logs.
    writeFileSync(credentialFile,
      "FASTBILLSPH SYNTHETIC STAGING ONLY; DO NOT USE FOR REAL PATIENT DATA\n"+
      accounts.map(a=>a.username+" | "+a.role+" | "+a.password).join("\n")+"\n",
      {mode:0o600,flag:"wx"}
    );
    console.log("PASS: created 2 fictional clinics, 6 synthetic users and 8 fictional tasks");
    console.log("PASS: synthetic logins stored locally with owner-only permissions at "+credentialFile);
    console.log("NOTE: do not paste or upload the credential file; use only for staging");
  }catch(error){
    if(transaction)await client.query("ROLLBACK").catch(()=>{});
    throw error;
  }finally{
    client.release();
    await pool.end();
  }
}
main().catch(err=>{
  console.error("Synthetic seed failed:",err instanceof Error?err.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
