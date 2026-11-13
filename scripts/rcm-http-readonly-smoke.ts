/**
 * Loopback-only RCM HTTP GET smoke test. No application bootstrap, no sessions
 * or login credentials, no public preview, no mutation endpoints.
 *
 * Tests real read-only RCM route handlers with explicitly injected synthetic
 * session identity under a local-only test harness, NOT authentication itself.
 * Run: DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-http-readonly-smoke.ts
 */
import express from "express";
import { createServer } from "node:http";
import { pool } from "../server/db";
import { registerRcmTaskboardRoutes } from "../server/rcm-taskboard-routes";
import { registerRcmSlaRoutes } from "../server/rcm-sla-routes";
import { registerRcmProductivityRoutes } from "../server/rcm-productivity-routes";

const EXPECTED = "fastbills_rcm_restore_test";
const paths = [
  "/api/rcm/taskboard",
  "/api/rcm/sla/summary",
  "/api/rcm/productivity/summary",
  "/api/rcm/productivity/weights",
];
function verify(condition: unknown, title: string): asserts condition {
  if (!condition) throw new Error("FAIL: " + title);
  console.log("PASS: " + title);
}
async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw || decodeURIComponent(new URL(raw).pathname) !== "/" + EXPECTED) {
    throw new Error("Refusing to run against any database other than " + EXPECTED);
  }
  const identity = await pool.query("SELECT current_database() AS name");
  verify(identity.rows[0]?.name === EXPECTED, "restore-test PostgreSQL database confirmed");
  const employees = await pool.query(
    "SELECT id FROM users WHERE active=true AND role::text IN ('manager','account_manager') ORDER BY id LIMIT 1",
  );
  if (!employees.rowCount) throw new Error("No active non-admin manager identity for no-scope test");
  const employeeId = Number(employees.rows[0].id);
  const existingAssignments = await pool.query(
    "SELECT (SELECT count(*)::integer FROM rcm_user_clinics WHERE user_id=$1) AS clinics, (SELECT count(*)::integer FROM rcm_user_departments WHERE user_id=$1) AS departments",
    [employeeId],
  );
  verify(existingAssignments.rows[0].clinics===0 && existingAssignments.rows[0].departments===0,
    "selected manager has no clinic or department assignments");

  // Never import server/index.ts or register all FastbillsPH routes.
  // Synthetic session is an internal harness-only identity, not a login bypass
  // in the deployed application. Local test callers choose anonymous/employee.
  const app = express();
  app.disable("x-powered-by");
  app.use((req,res,next) => {
    const role = req.get("x-local-smoke-identity");
    (req as any).session = { userId: role === "employee" ? employeeId : undefined };
    next();
  });
  registerRcmTaskboardRoutes(app);
  registerRcmSlaRoutes(app);
  registerRcmProductivityRoutes(app);
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: "Internal query failure" });
  });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once("error",reject);
      server.listen(0,"127.0.0.1",()=>resolve());
    });
    const address=server.address();
    if (!address || typeof address==="string") throw new Error("Local socket did not bind correctly");
    const base="http://127.0.0.1:"+address.port;
    const check = async (path:string,identity:"anonymous"|"employee")=>{
      const response=await fetch(base+path,{
        headers:{"x-local-smoke-identity":identity},
        redirect:"error",
        signal:AbortSignal.timeout(15000),
      });
      const body=await response.json() as any;
      if(identity==="anonymous"){
        verify(response.status===401,"unauthenticated "+path+" returns 401");
        return;
      }
      verify(response.status===200,"scopeless non-admin "+path+" returns 200");
      if(path==="/api/rcm/taskboard"){
        verify(Array.isArray(body.tasks)&&body.tasks.length===0,"scopeless employee cannot retrieve patient tasks");
      }else if(path==="/api/rcm/sla/summary"){
        verify(Array.isArray(body.departments)&&body.departments.length===0,"scopeless employee cannot retrieve SLA activity");
      }else if(path==="/api/rcm/productivity/summary"){
        verify(body.completions===0 && body.units===0 && Array.isArray(body.leaderboard) && body.leaderboard.length===0,
          "scopeless employee cannot retrieve productivity data");
      }else if(path==="/api/rcm/productivity/weights"){
        verify(!!body.weights && Object.keys(body.weights).length===9,
          "non-admin productivity weight catalog has nine configured values");
      }
    };
    for (const path of paths) await check(path,"anonymous");
    for (const path of paths) await check(path,"employee");
    console.log("PASS: localhost-only HTTP GET smoke tests complete; no database writes or patient data printed");
  } finally {
    if (server.listening) await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    await pool.end();
  }
}
main().catch(error=>{
  console.error("RCM HTTP smoke test failed:",error instanceof Error ? error.message.split("\n")[0] : "unexpected error");
  process.exitCode=1;
});
