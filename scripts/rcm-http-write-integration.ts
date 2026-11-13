/**
 * Real RCM assignment + approval HTTP route integration against the restore-test DB.
 *
 * A single PostgreSQL transaction contains all synthetic fixtures and HTTP writes.
 * The test replaces the shared pool's connect/query methods IN THIS TEST PROCESS ONLY
 * so route-level BEGIN/COMMIT/ROLLBACK become SAVEPOINT operations; the enclosing
 * transaction is always rolled back. No real FastbillsPH server/startup or external
 * integration runs. Test identity is header-injected on loopback only, not authentication.
 *
 * DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-http-write-integration.ts
 */
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pool } from "../server/db";
import { registerRcmTaskAssignmentRoutes } from "../server/rcm-task-assignment-routes";
import { registerRcmApprovalRoutes } from "../server/rcm-approval-routes";

const expected = "fastbills_rcm_restore_test";
function assert(value:unknown,label:string):asserts value {
  if(!value)throw Error("FAIL: "+label);
  console.log("PASS: "+label);
}
async function main() {
  const url=process.env.DATABASE_URL;
  if(!url || decodeURIComponent(new URL(url).pathname)!=="/"+expected)
    throw Error("Refusing to run outside the restore-test database");

  const client=await pool.connect();
  const originalQuery=pool.query.bind(pool);
  const originalConnect=pool.connect.bind(pool);
  let tx=false;
  let patched=false;
  let sequence=0;
  const savepoints:string[]=[];
  let server:ReturnType<typeof createServer>|null=null;
  try{
    const identity=await client.query("SELECT current_database() AS db");
    assert(identity.rows[0]?.db===expected,"connected to restore-test database");
    await client.query("BEGIN");
    tx=true;
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const tag=randomUUID().slice(0,12);
    const clinic=await client.query(
      "INSERT INTO clinics(name) VALUES($1) RETURNING id",["RCM HTTP Synthetic Clinic "+tag]);
    const clinicId=Number(clinic.rows[0].id);
    async function makeUser(role:"manager"|"biller",label:string):Promise<number>{
      const r=await client.query(
        "INSERT INTO users(username,password,full_name,role,active) VALUES($1,$2,$3,$4,true) RETURNING id",
        ["rcm_http_"+label+"_"+tag,"DISABLED_SYNTHETIC_LOGIN","RCM HTTP Synthetic "+label+" "+tag,role]);
      return Number(r.rows[0].id);
    }
    const manager=await makeUser("manager","manager");
    const reviewer=await makeUser("manager","reviewer");
    const employee=await makeUser("biller","employee");
    const outsider=await makeUser("biller","outsider");
    for(const userId of [manager,reviewer,employee]){
      await client.query("INSERT INTO rcm_user_clinics(user_id,clinic_id) VALUES($1,$2)",[userId,clinicId]);
      await client.query("INSERT INTO rcm_user_departments(user_id,department_key) VALUES($1,'Billing')",[userId]);
    }
    const normal=await client.query(
      "INSERT INTO tasks(patient_name,clinic_id,priority,bucket,status) VALUES($1,$2,'low','ready_for_billing','unassigned') RETURNING id",
      ["SYNTHETIC HTTP LOW "+tag,clinicId]);
    const high=await client.query(
      "INSERT INTO tasks(patient_name,clinic_id,priority,bucket,status) VALUES($1,$2,'high','ready_for_billing','unassigned') RETURNING id",
      ["SYNTHETIC HTTP HIGH "+tag,clinicId]);
    const normalId=Number(normal.rows[0].id);
    const highId=Number(high.rows[0].id);

    // All route reads/writes share this ONE connection. Nested route transactions
    // use savepoints and can never commit the outer test transaction.
    const queryViaClient=((...args:any[]) => (client.query as any)(...args)) as any;
    const fakeClient={
      query: async (...args:any[])=>{
        const sql=typeof args[0]==="string"?args[0].trim().toUpperCase():"";
        if(sql==="BEGIN"){
          const name="rcm_http_sp_"+(++sequence);
          savepoints.push(name);
          return client.query("SAVEPOINT "+name);
        }
        if(sql==="COMMIT"){
          const name=savepoints.pop();
          if(!name)throw Error("Route COMMIT without savepoint");
          return client.query("RELEASE SAVEPOINT "+name);
        }
        if(sql==="ROLLBACK"){
          const name=savepoints.pop();
          if(!name)throw Error("Route ROLLBACK without savepoint");
          return client.query("ROLLBACK TO SAVEPOINT "+name);
        }
        return (client.query as any)(...args);
      },
      release:()=>{},
    };
    (pool as any).query=queryViaClient;
    (pool as any).connect=async()=>fakeClient;
    patched=true;

    const app=express();
    app.disable("x-powered-by");
    app.use(express.json());
    app.use((req,_res,next)=>{
      const id=req.get("x-smoke-identity");
      (req as any).session={userId:
        id==="manager"?manager:id==="reviewer"?reviewer:
        id==="employee"?employee:id==="outsider"?outsider:undefined,
      };
      next();
    });
    registerRcmTaskAssignmentRoutes(app);
    registerRcmApprovalRoutes(app);
    app.use((_e:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
      res.status(500).json({message:"Internal HTTP route error"});
    });
    server=createServer(app);
    await new Promise<void>((resolve,reject)=>{
      server!.once("error",reject);
      server!.listen(0,"127.0.0.1",resolve);
    });
    const address=server.address();
    if(!address || typeof address==="string")throw Error("Invalid test address");
    const base="http://127.0.0.1:"+address.port;
    async function request(path:string,actor:string,method:"GET"|"PATCH"|"POST"="GET",body?:object){
      const r=await fetch(base+path,{
        method,
        headers:{"x-smoke-identity":actor,...(body?{"content-type":"application/json"}:{})},
        body:body?JSON.stringify(body):undefined,
        signal:AbortSignal.timeout(12000),
        redirect:"error",
      });
      return {status:r.status,data:await r.json() as any};
    }
    const standardPath="/api/rcm/taskboard/tasks/"+normalId;
    let res=await request(standardPath+"/assignee","anonymous","PATCH",{assignedUserId:employee,expectedAssignedUserId:null});
    assert(res.status===401,"unauthenticated assignment rejected");

    res=await request(standardPath+"/assignee","outsider","PATCH",{assignedUserId:employee,expectedAssignedUserId:null});
    assert(res.status===403,"out-of-scope assignment rejected");

    res=await request(standardPath+"/assignee","manager","PATCH",{assignedUserId:outsider,expectedAssignedUserId:null});
    assert(res.status===403,"out-of-scope recipient rejected");

    res=await request(standardPath+"/assignee","manager","PATCH",{assignedUserId:employee,expectedAssignedUserId:null});
    assert(res.status===200 && res.data.ok===true,"manager assigns eligible employee through real route");

    res=await request(standardPath+"/assignee","manager","PATCH",{assignedUserId:null,expectedAssignedUserId:null});
    assert(res.status===409,"stale assignment rejected by real route");

    const record=await client.query("SELECT assigned_user_id FROM tasks WHERE id=$1",[normalId]);
    assert(record.rows[0].assigned_user_id===employee,"route updated original task record");
    const history=await client.query(
      "SELECT (SELECT count(*)::int FROM task_activity WHERE task_id=$1) AS activities, (SELECT count(*)::int FROM notifications WHERE task_id=$1) AS notifications",
      [normalId]);
    assert(history.rows[0].activities>=1 && history.rows[0].notifications===1,"task history and assignment notification saved");

    const risky="/api/rcm/taskboard/tasks/"+highId;
    res=await request(risky+"/assignee","manager","PATCH",{assignedUserId:employee,expectedAssignedUserId:null});
    assert(res.status===428,"high-risk assignment requires prior approval");

    res=await request(risky+"/approval-request","manager","POST",{requestedAssigneeId:employee,expectedAssigneeId:null});
    assert(res.status===201,"manager submits high-risk review request");
    const approvalId=res.data.id;

    res=await request("/api/rcm/taskboard/approvals/"+approvalId+"/decision","manager","POST",{decision:"approved"});
    assert(res.status===409,"self-approval is rejected");

    res=await request("/api/rcm/taskboard/approvals/"+approvalId+"/decision","reviewer","POST",{decision:"approved"});
    assert(res.status===200 && res.data.status==="approved","independent reviewer approves through real route");

    res=await request(risky+"/assignee","manager","PATCH",{assignedUserId:employee,expectedAssignedUserId:null});
    assert(res.status===200,"approved high-risk assignment succeeds");
    const consumed=await client.query("SELECT status FROM rcm_task_approvals WHERE id=$1",[approvalId]);
    assert(consumed.rows[0].status==="consumed","approval consumed only once");

    res=await request(risky+"/assignee","manager","PATCH",{assignedUserId:null,expectedAssignedUserId:employee});
    assert(res.status===428,"new high-risk change needs a new approval");

    const audits=await client.query(
      "SELECT count(*)::integer AS n FROM rcm_access_audit WHERE actor_user_id=ANY($1::int[])",
      [[manager,reviewer]]);
    assert(audits.rows[0].n>=4,"HTTP writes recorded in audit ledger");

    console.log("PASS: real route handler write tests complete inside outer rollback transaction");
  } finally {
    if(server?.listening)await new Promise<void>((resolve,reject)=>server!.close(err=>err?reject(err):resolve()));
    if(patched){
      (pool as any).query=originalQuery;
      (pool as any).connect=originalConnect;
    }
    if(tx)await client.query("ROLLBACK").catch(()=>{});
    client.release();
    await pool.end();
  }
}
main().catch(e=>{
  console.error("RCM HTTP write integration failed:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
