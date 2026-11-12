/**
 * Authorized administrator HTTP read smoke test for restored RCM staging.
 *
 * Uses actual RCM Express GET handlers, but an INJECTED test session instead
 * of FastbillsPH's login/session middleware. Does not test real authentication.
 * Never imports server/index.ts, never seeds/backfills/schedules, and binds an
 * ephemeral port on 127.0.0.1 only.
 *
 * Run: DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-http-authorized-smoke.ts
 */
import express from "express";
import { createServer } from "node:http";
import { pool } from "../server/db";
import { registerRcmTaskboardRoutes } from "../server/rcm-taskboard-routes";
import { registerRcmSlaRoutes } from "../server/rcm-sla-routes";
import { registerRcmProductivityRoutes } from "../server/rcm-productivity-routes";

const TARGET = "fastbills_rcm_restore_test";
function passIf(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error("FAIL: " + label);
  console.log("PASS: " + label);
}
async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw || decodeURIComponent(new URL(raw).pathname) !== "/" + TARGET) {
    throw new Error("Refusing to access an unexpected database");
  }
  const connected = await pool.query("SELECT current_database() AS db");
  passIf(connected.rows[0]?.db === TARGET, "connected to restored staging database");

  const admins = await pool.query(
    "SELECT id FROM users WHERE role::text='admin' AND active=true ORDER BY id LIMIT 1",
  );
  if (!admins.rowCount) throw new Error("No existing active administrator in test copy");
  const adminId=Number(admins.rows[0].id);

  const app=express();
  app.disable("x-powered-by");
  // This injected identity exists ONLY in a throwaway loopback test app. It
  // is never registered on the real server or exposed on Replit previews.
  app.use((req,_res,next)=>{
    (req as any).session={userId:req.get("x-smoke-role")==="admin"?adminId:undefined};
    next();
  });
  registerRcmTaskboardRoutes(app);
  registerRcmSlaRoutes(app);
  registerRcmProductivityRoutes(app);
  app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    res.status(500).json({message:"Internal endpoint test failure"});
  });
  const server=createServer(app);
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once("error",reject);
      server.listen(0,"127.0.0.1",resolve);
    });
    const address=server.address();
    if(!address || typeof address==="string")throw new Error("Unexpected listener address");
    const base="http://127.0.0.1:"+address.port;
    async function get(path:string, role:"admin"|"anonymous"){
      const res=await fetch(base+path,{
        headers:{"x-smoke-role":role},
        redirect:"error",
        signal:AbortSignal.timeout(15000),
      });
      const body=await res.json() as any;
      return {status:res.status,body,cache:res.headers.get("cache-control")};
    }

    const urls=[
      "/api/rcm/taskboard",
      "/api/rcm/sla/summary",
      "/api/rcm/productivity/summary",
      "/api/rcm/productivity/weights",
    ];
    for(const url of urls){
      const result=await get(url,"anonymous");
      passIf(result.status===401,"anonymous "+url+" denied (401)");
    }

    const board=await get("/api/rcm/taskboard","admin");
    passIf(board.status===200 && board.cache?.includes("no-store"),"authorized Task Board GET succeeds with private, no-store response");
    passIf(Array.isArray(board.body.tasks),"Task Board returns an array");
    const validBilling=board.body.tasks.filter((t:any)=>t.source==="tasks" && t.clinicId===6 && t.department==="Billing");
    passIf(validBilling.length===2,"administrator sees both existing Billing tasks from clinic 6");
    passIf(board.body.tasks.every((t:any)=>typeof t.itemKey==="string" && typeof t.source==="string"),"all board rows preserve source-qualified item keys");

    const sla=await get("/api/rcm/sla/summary","admin");
    passIf(sla.status===200 && Array.isArray(sla.body.departments),"administrator SLA summary GET succeeds");
    const billing=sla.body.departments.find((r:any)=>r.department==="Billing");
    passIf(billing && Number(billing.openTasks)>=2,"Billing SLA summary includes at least two eligible open tasks");

    const weights=await get("/api/rcm/productivity/weights","admin");
    passIf(weights.status===200 && Object.keys(weights.body.weights||{}).length===9,"administrator receives nine productivity weights");

    const productivity=await get("/api/rcm/productivity/summary","admin");
    passIf(productivity.status===200 && typeof productivity.body.completions==="number" && Array.isArray(productivity.body.leaderboard),"administrator productivity summary GET succeeds");
    console.log("PASS: authorized RCM HTTP GET smoke complete; no patient or employee details printed");
  } finally {
    if(server.listening)await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    await pool.end();
  }
}
main().catch(err=>{
  console.error("RCM authorized HTTP smoke failed:",err instanceof Error?err.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
