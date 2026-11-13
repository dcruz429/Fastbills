/**
 * Launch via verify-call-supervision-postgres.sh ONLY.
 * Imports no server/db, app entry point, application pool or credentials.
 * Every connection is to a cluster freshly created by this process, over its
 * unique private Unix socket. All fixture identities/records are fabricated.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, rm, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { runInNewContext } from "node:vm";
import pg from "pg";
import express from "express";
import ts from "typescript";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, asc, desc } from "drizzle-orm";
import { users, scheduledCalls, callAttempts, callActivity, patientCallSchedule } from "../shared/schema";
import { createCallSupervisionStore } from "../server/rcm-call-supervision";
import { registerCallSupervisionRoutes } from "../server/rcm-call-supervision-routes";
import { createCallBoundary, positiveCallId } from "../server/rcm-call-boundary";
import { defaultRolePermissions, permissionAllowed, resourceAllowed } from "../shared/rcm-access-policy";

// Reject inherited credential-variable NAMES, without reading their values.
assert.equal(Object.keys(process.env).some(key => /^(PG|DATABASE)|SECRET|PASSWORD|TOKEN|CREDENTIAL/i.test(key)), false,
  "Use the env-empty isolated launcher, never an application environment");
const pgBin = process.argv[process.argv.indexOf("--pg-bin") + 1];
assert.match(pgBin, /^\/nix\/store\/[^/]*postgresql[^/]*\/bin$/);
assert.notEqual(process.getuid?.(), 0, "Do not run initdb as root");
const workspace = process.cwd();
const output = path.join(workspace, "generated-artifacts/calendar-postgres/results.json");
await mkdir(path.dirname(output), { recursive: true });
const root = await mkdtemp("/tmp/fb-call-pg-");
const data = path.join(root, "data"), socket = path.join(root, "socket");
const marker = randomUUID();
const role = "fabricated_test_owner", database = "fabricated_call_supervision", port = 65431;
const env = { PATH: `${pgBin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: root, LANG: "C", LC_ALL: "C", TZ: "UTC" };
let started = false, startAttempted = false, cleaned = false, migrationApplied = false;
let adminPool: pg.Pool | undefined, readPool: pg.Pool | undefined, controlPool: pg.Pool | undefined;
let failure: unknown, currentCheck = "cluster initialization";
const passed: string[] = [];
const isolation: Record<string, unknown> = {
  freshCluster: false, unixSocketOnly: false, emptyInheritedCredentials: true,
  applicationDatabaseContacted: false, applicationServerStarted: false,
};
const binary = (name: string, args: string[]) =>
  execFileSync(path.join(pgBin, name), args, { env, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
const connectConfig = (db: string) => ({
  host: socket, port, database: db, user: role, password: "", ssl: false as const,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000, max: 3,
  application_name: "fabricated-supervision-verification",
  statement_timeout: 5000, lock_timeout: 3000,
});
const check = async (name: string, action: () => Promise<void>) => {
  currentCheck = name;
  await action();
  passed.push(name);
  console.log("PASS: " + name);
};
function evaluate(code: string, globals: object) {
  return runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, globals);
}
function dispatch(router: any, method: string, url: string, body: unknown = {}, session: any = { userId: 1 }) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = Object.assign(Object.create(express.request), {
      app: express(), method, url, originalUrl: url, headers: {}, body, session,
    });
    let status = 200;
    const res = { locals: {}, status(value: number) { status = value; return this; },
      json(value: any) { resolve({ status, body: value }); return this; } };
    router.handle(req, res, (error: unknown) => error ? reject(error) : resolve({ status: 404, body: undefined }));
  });
}

try {
  assert.equal(await realpath(root), root);
  const stat = await lstat(root);
  assert.equal(stat.uid, process.getuid!());
  assert.equal(stat.mode & 0o777, 0o700);
  await mkdir(socket, { mode: 0o700 });
  await writeFile(path.join(root, "created-by-verification"), marker, { mode: 0o600 });
  await assert.rejects(access(data), "The cluster data directory must not already exist");
  binary("initdb", ["-D", data, "--username=" + role, "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8"]);
  assert.equal((await readFile(path.join(data, "PG_VERSION"), "utf8")).trim(), "16");
  startAttempted = true;
  binary("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-w", "start", "-o",
    `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c port=${port} -c max_connections=16 -c shared_buffers=16MB`]);
  started = true;
  // Establish process/path ownership BEFORE opening any database connection.
  const pid = (await readFile(path.join(data, "postmaster.pid"), "utf8")).split("\n");
  assert.equal(pid[1], data);
  assert.equal(Number(pid[3]), port);
  assert.equal(pid[4], socket);
  assert.equal(pid[5], "", "The new server must have no TCP listening address");
  assert.match(await readFile(`/proc/${pid[0]}/cmdline`, "utf8"), new RegExp(data));
  assert.equal(await realpath(`/proc/${pid[0]}/exe`), await realpath(path.join(pgBin, "postgres")));
  isolation.freshCluster = true;
  isolation.unixSocketOnly = true;
  isolation.postgresVersion = "16";
  controlPool = new pg.Pool(connectConfig("postgres"));
  const identity = await controlPool.query(`SELECT current_database() AS db,
    current_setting('data_directory') AS data, current_setting('listen_addresses') AS listen,
    current_setting('unix_socket_directories') AS socket, inet_server_addr() AS address`);
  assert.deepEqual(identity.rows[0], { db: "postgres", data, listen: "", socket, address: null });
  // This CREATE DATABASE is inside our new empty cluster, never an app cluster.
  await controlPool.query("CREATE DATABASE fabricated_call_supervision OWNER fabricated_test_owner TEMPLATE template0");
  adminPool = new pg.Pool(connectConfig(database));
  readPool = new pg.Pool({ ...connectConfig(database), options: "-c default_transaction_read_only=on" });
  const sql = (query: string, args?: any[]) => adminPool!.query(query, args);
  const dbIdentity = await sql("SELECT current_database() AS db, current_setting('data_directory') AS data");
  assert.deepEqual(dbIdentity.rows[0], { db: database, data });
  assert.equal((await sql("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
  await sql("CREATE TABLE verification_isolation_marker(value text NOT NULL)");
  await sql("INSERT INTO verification_isolation_marker VALUES($1)", [marker]);
  await check("fresh independent cluster, private socket, no TCP and no inherited credentials", async () => {
    assert.equal((await readPool!.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only, "on");
  });
  await sql(await readFile("scripts/fixtures/call-supervision-postgres.sql", "utf8"));
  await sql(await readFile("migrations/20261112_rcm_access_foundation.sql", "utf8"));
  await sql(`INSERT INTO rcm_user_clinics(user_id,clinic_id) VALUES (1,10),(4,10);
    INSERT INTO rcm_user_departments(user_id,department_key) VALUES (1,'Verification'),(4,'Verification')`);
  await check("actual supervision migration creates empty grant table and indexes", async () => {
    assert.equal((await sql("SELECT to_regclass('public.rcm_call_supervisors') AS name")).rows[0].name, null);
    await sql(await readFile("migrations/20261113_call_supervision.sql", "utf8"));
    migrationApplied = true;
    assert.equal((await sql("SELECT count(*)::int AS n FROM rcm_call_supervisors")).rows[0].n, 0);
    const indexes = (await sql("SELECT indexname,indexdef FROM pg_indexes WHERE tablename='rcm_call_supervisors'")).rows;
    assert.equal(indexes.length, 2);
    assert.ok(indexes.some(row => row.indexname === "rcm_call_supervisors_pkey" && /manager_user_id, team_id/.test(row.indexdef)));
    assert.ok(indexes.some(row => row.indexname === "rcm_call_supervisors_team_idx" && /\(team_id\)/.test(row.indexdef)));
    const columns = (await sql(`SELECT column_name,is_nullable FROM information_schema.columns
      WHERE table_name='rcm_call_supervisors'`)).rows;
    assert.equal(columns.length, 4);
    assert.ok(columns.every(row => row.is_nullable === "NO"));
  });
  await check("PostgreSQL enforces primary key, NOT NULL and all three foreign keys", async () => {
    await sql("INSERT INTO rcm_call_supervisors(manager_user_id,team_id,granted_by) VALUES(1,7,90)");
    for (const [values, code] of [
      [[1, 7, 90], "23505"], [[999, 7, 90], "23503"], [[1, 999, 90], "23503"],
      [[1, 8, 999], "23503"], [[null, 8, 90], "23502"],
    ] as const) await assert.rejects(sql("INSERT INTO rcm_call_supervisors(manager_user_id,team_id,granted_by) VALUES($1,$2,$3)", [...values]),
      (error: any) => error.code === code);
    const keys = (await sql(`SELECT confdeltype FROM pg_constraint WHERE conrelid='rcm_call_supervisors'::regclass AND contype='f'`)).rows;
    assert.deepEqual(keys.map(r => r.confdeltype).sort(), ["a", "c", "c"]);
    await sql("DELETE FROM rcm_call_supervisors");
  });
  const store = createCallSupervisionStore(adminPool);
  const readStore = createCallSupervisionStore(readPool);
  // Execute the real access resolver body with an explicit isolated executor.
  // Do NOT import rcm-access-service: that would import the app's default pool.
  const accessSource = ts.createSourceFile("access.ts", await readFile("server/rcm-access-service.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const resolver = accessSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "resolveRcmAccess");
  assert.ok(resolver);
  const resolveBody = evaluate(`(${resolver.getText(accessSource).replace(/^export\s+/, "")})`,
    { defaultRolePermissions, permissionAllowed, resourceAllowed });
  const resolveAccess = (userId: number) => resolveBody(userId, readPool);
  const clinicIds = async () => new Map<string, number>((await readPool!.query(
    "SELECT lower(btrim(name)) AS name,min(id)::int AS id FROM clinics GROUP BY lower(btrim(name)) HAVING count(*)=1"
  )).rows.map(row => [row.name, row.id]));
  const storage: any = {
    getUser: async (id: number) => (await readPool!.query('SELECT id,full_name AS "fullName",role,active FROM users WHERE id=$1', [id])).rows[0],
  };
  const storageSource = ts.createSourceFile("storage.ts", await readFile("server/storage.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const wanted = new Set(["getScheduledCall", "getScheduledCalls", "getCallAttempts", "getCallActivityLog",
    "getPatientScheduleEntry", "getPatientScheduleEntryByCallId", "getExistingPatientDailySchedule"]);
  const globals = { db: drizzle(readPool), users, scheduledCalls, callAttempts, callActivity, patientCallSchedule, eq, and, asc, desc };
  function methods(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && wanted.has(node.name.getText(storageSource))) {
      const name = node.name.getText(storageSource);
      storage[name] = evaluate(`({${node.getText(storageSource)}}).${name}`, globals);
      wanted.delete(name);
    }
    ts.forEachChild(node, methods);
  }
  methods(storageSource);
  assert.equal(wanted.size, 0);
  let forbiddenStorageCalls = 0;
  for (const name of ["getTask", "getCollection", "getDenial", "getArbitration", "getPosting", "getCheck", "getClosed",
    "createCallAttempt", "createScheduledCall", "createCallActivity", "updateScheduledCall", "updateTask",
    "updatePatientScheduleDailyStatus", "updatePatientScheduleNotes", "createNotification", "ensurePatientScheduleCall",
    "getPatientDailySchedule", "getPatientCallAudit"]) storage[name] = () => {
    forbiddenStorageCalls++; throw new Error("Forbidden task access, mutation or legacy schedule builder: " + name);
  };
  const router = express.Router();
  registerCallSupervisionRoutes(router as any, { store, resolveAccess });
  router.use("/api/calls", createCallBoundary({
    storage, resolveAccess, clinicIds, supervisedEmployees: userId => readStore.employees(userId),
  }));
  // Run actual calendar handlers without starting Express or an HTTP listener.
  const routeSource = ts.createSourceFile("routes.ts", await readFile("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
  let registered = 0;
  function routes(node: ts.Node) {
    if (ts.isCallExpression(node) && /^app\.(get|post|patch)$/.test(node.expression.getText(routeSource)) &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith("/api/calls")) {
      const handler = evaluate(`(${node.arguments.at(-1)!.getText(routeSource)})`, {
        storage, Date, console, positiveCallId, parsePositiveRouteId: positiveCallId,
      });
      (router as any)[node.expression.getText(routeSource).slice(4)](node.arguments[0].text,
        async (req: any, res: any, next: any) => handler(req, res, next));
      registered++;
    }
    ts.forEachChild(node, routes);
  }
  routes(routeSource); assert.equal(registered, 16);
  const request = (method: string, url: string, body: any = {}, session: any = { userId: 1 }) => dispatch(router, method, url, body, session);
  const config = (teamIds: number[], session: any = { userId: 90 }) =>
    request("PUT", "/api/rcm/access/call-supervision/1", { teamIds }, session);
  // Source-extracted methods may return cross-realm arrays; normalize their
  // prototype before strict assertions rather than weakening value checks.
  const ids = (rows: any[]) => Array.from(rows, row => row.id).sort((a, b) => a - b);
  const snapshot = async () => {
    const rows = [];
    for (const table of ["scheduled_calls", "call_attempts", "call_activity", "patient_call_schedule"])
      rows.push((await sql(`SELECT coalesce(jsonb_agg(t ORDER BY id),'[]'::jsonb) AS data FROM ${table} t`)).rows[0].data);
    return JSON.stringify(rows);
  };
  const before = await snapshot();
  await check("manager role, ordinary membership and Manager Team name grant no default access", async () => {
    assert.deepEqual(await readStore.employees(1), []);
    assert.equal((await request("GET", "/api/calls/124")).status, 404);
    assert.deepEqual(ids((await request("GET", "/api/calls")).body), [123]);
    assert.equal((await request("GET", "/api/calls/124", {}, { userId: 4 })).status, 404);
  });
  await check("actual administrator API persists explicit grants and audit records", async () => {
    assert.equal((await config([7])).status, 200);
    assert.deepEqual((await store.configuration(1)).teamIds, [7]);
    const grant = (await sql("SELECT manager_user_id,team_id,granted_by,granted_at FROM rcm_call_supervisors")).rows[0];
    assert.equal(grant.manager_user_id, 1); assert.equal(grant.team_id, 7); assert.equal(grant.granted_by, 90);
    assert.ok(grant.granted_at instanceof Date);
    assert.equal((await sql("SELECT count(*)::int AS n FROM rcm_access_audit")).rows[0].n, 1);
  });
  await check("same-team AND same-clinic AND same-department list/filter/detail/history reads succeed", async () => {
    assert.deepEqual(ids((await request("GET", "/api/calls")).body), [123, 124]);
    assert.deepEqual(ids((await request("GET", "/api/calls?assignedUserId=2")).body), [124]);
    for (const suffix of ["", "/attempts", "/activity", "/ATTEMPTS/", "/ACTIVITY/"])
      assert.equal((await request("GET", "/api/calls/124" + suffix)).status, 200);
    assert.deepEqual(ids((await request("GET", "/api/calls/124/attempts")).body), [124]);
    assert.deepEqual(ids((await request("GET", "/api/calls/124/activity")).body), [124]);
  });
  await check("capability roster comes from explicit grants, not supervisor role or ordinary membership", async () => {
    const caps = (await request("GET", "/api/calls/capabilities")).body;
    assert.equal(caps.canManage, false);
    assert.ok(caps.supervisedEmployees.some((employee: any) => employee.id === 2));
    assert.ok(caps.supervisedEmployees.every((employee: any) => ![3, 7, 8, 9].includes(employee.id)));
    await sql("UPDATE users SET role='verifier' WHERE id=1");
    await sql("DELETE FROM user_teams WHERE user_id=1");
    assert.equal((await request("GET", "/api/calls/124")).status, 200);
    await sql("UPDATE users SET role='manager' WHERE id=1");
    await sql("INSERT INTO user_teams(user_id,team_id) VALUES(1,7)");
  });
  await check("different team/clinic/department, unknown membership/scope and inactive employees fail closed", async () => {
    for (const id of [125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135])
      for (const suffix of ["", "/attempts", "/activity"])
        assert.equal((await request("GET", `/api/calls/${id}${suffix}`)).status, 404, `${id}${suffix}`);
    assert.equal((await request("GET", "/api/calls?assignedUserId=3&teamId=7&role=admin")).status, 403);
    assert.equal((await request("GET", "/api/calls?assignedUserId=7")).status, 403);
    assert.equal((await request("GET", "/api/calls?assignedUserId=2&assignedUserId=3")).status, 400);
  });
  await check("supervised schedules use real SELECT-only storage and reject out-of-scope linked calls", async () => {
    assert.equal((await request("GET", "/api/calls/daily-schedule?userId=2&date=2026-11-13")).status, 200);
    assert.deepEqual(ids((await request("GET", "/api/calls/daily-schedule?userId=2&date=2026-11-13")).body), [11, 17]);
    assert.equal((await request("GET", "/api/calls/daily-schedule?userId=3")).status, 403);
  });
  await check("no teammate call/schedule mutation, delegation, linked-task modification or aggregate rights are added", async () => {
    for (const [method, url, body] of [
      ["PATCH", "/124", { callStatus: "Resolved" }], ["POST", "/124/start", {}], ["POST", "/124/cancel", {}],
      ["POST", "/124/attempts", { outcome: "Resolved" }],
      ["PATCH", "/daily-schedule/11/status", { dailyStatus: "Done" }],
      ["PATCH", "/daily-schedule/11/notes", { notes: "Fabricated denied note" }],
      ["POST", "/daily-schedule/11/ensure-call", {}],
      ["POST", "", { assignedUserId: 2, clinic: "Fabricated Clinic A", department: "Verification" }],
      ["POST", "/123/attempts", { outcome: "Resolved", nextAssignedUserId: 2 }],
      ["POST", "/123/attempts", { outcome: "Resolved", newTaskStatus: "done" }],
    ] as const) assert.ok([403, 404].includes((await request(method, "/api/calls" + url, body)).status), url);
    for (const suffix of ["/stats", "/agent-stats", "/rollover-audit?userId=2"])
      assert.equal((await request("GET", "/api/calls" + suffix)).status, 403);
    assert.equal(forbiddenStorageCalls, 0);
    assert.equal(await snapshot(), before);
  });
  await check("explicit user and role read denies override supervisory grants", async () => {
    await sql("INSERT INTO rcm_user_permission_overrides(user_id,permission_key,effect) VALUES(1,'tasks.read','deny')");
    for (const url of ["/124", "", "/daily-schedule?userId=2", "/124/attempts", "/124/activity"])
      assert.equal((await request("GET", "/api/calls" + url)).status, 403);
    await sql("DELETE FROM rcm_user_permission_overrides WHERE user_id=1");
    await sql("INSERT INTO rcm_role_permissions(role_slug,permission_key,effect) VALUES('manager','tasks.read','deny')");
    assert.equal((await request("GET", "/api/calls/124")).status, 403);
    await sql("DELETE FROM rcm_role_permissions WHERE role_slug='manager'");
  });
  await check("impersonation suppresses supervision and configuration; mutation restrictions remain", async () => {
    const impersonated = { userId: 1, originalUserId: 90 };
    assert.equal((await request("GET", "/api/calls/124", {}, impersonated)).status, 404);
    assert.equal((await request("GET", "/api/calls/daily-schedule?userId=2", {}, impersonated)).status, 403);
    assert.equal((await request("POST", "/api/calls/123/start", {}, impersonated)).status, 403);
    assert.equal((await config([], { userId: 90, originalUserId: 91 })).status, 403);
    assert.deepEqual(ids((await request("GET", "/api/calls", {}, impersonated)).body), [123]);
  });
  await check("membership removal and explicit grant revocation remove access immediately on the next request", async () => {
    await sql("DELETE FROM user_teams WHERE user_id=2 AND team_id=7");
    assert.equal((await request("GET", "/api/calls/124")).status, 404);
    await sql("INSERT INTO user_teams(user_id,team_id) VALUES(2,7)");
    assert.equal((await request("GET", "/api/calls/124")).status, 200);
    assert.equal((await config([])).status, 200);
    assert.equal((await request("GET", "/api/calls/124")).status, 404);
    assert.equal((await request("GET", "/api/calls/daily-schedule?userId=2")).status, 403);
    assert.deepEqual((await store.configuration(1)).teamIds, []);
    assert.equal((await config([7])).status, 200);
  });
  await check("clinic/department revocation and ambiguous clinic names fail closed", async () => {
    for (const [remove, restore] of [
      ["DELETE FROM rcm_user_clinics WHERE user_id=1", "INSERT INTO rcm_user_clinics VALUES(1,10)"],
      ["DELETE FROM rcm_user_departments WHERE user_id=1", "INSERT INTO rcm_user_departments VALUES(1,'Verification')"],
    ]) {
      await sql(remove);
      assert.equal((await request("GET", "/api/calls/124")).status, 404);
      await sql(restore);
    }
    await sql("INSERT INTO clinics VALUES(11,'  FABRICATED CLINIC A  ')");
    assert.equal((await request("GET", "/api/calls/124")).status, 404);
    await sql("DELETE FROM clinics WHERE id=11");
    assert.equal((await request("GET", "/api/calls/124")).status, 200);
  });
  await check("only active system admins with both management permissions can create/update/revoke grants", async () => {
    assert.equal((await config([], { userId: 1 })).status, 403);
    assert.equal((await config([], {})).status, 401);
    for (const permission of ["roles.manage", "scopes.manage"]) {
      await sql("INSERT INTO rcm_user_permission_overrides(user_id,permission_key,effect) VALUES(90,$1,'deny')", [permission]);
      assert.equal((await config([])).status, 403);
      await sql("DELETE FROM rcm_user_permission_overrides WHERE user_id=90");
    }
    await sql("UPDATE users SET active=false WHERE id=90");
    assert.equal((await config([])).status, 403);
    assert.equal((await request("GET", "/api/calls/124")).status, 404);
    await sql("UPDATE users SET active=true WHERE id=90");
    await sql("UPDATE users SET role='manager' WHERE id=90");
    assert.equal((await request("GET", "/api/calls/124")).status, 404);
    await sql("UPDATE users SET role='admin' WHERE id=90");
    for (const body of [{ teamIds: [7, 7] }, { teamIds: ["7"] }, { teamIds: [7], role: "admin" }])
      assert.equal((await request("PUT", "/api/rcm/access/call-supervision/1", body, { userId: 90 })).status, 400);
  });
  await check("real transaction rollback preserves grants and audit on validation or late audit failure", async () => {
    const grants = JSON.stringify((await store.configuration(1)).teamIds);
    const audits = (await sql("SELECT count(*)::int AS n FROM rcm_access_audit")).rows[0].n;
    assert.equal((await config([999])).status, 400);
    assert.equal(JSON.stringify((await store.configuration(1)).teamIds), grants);
    // Force failure AFTER DELETE/INSERT, proving actual PostgreSQL rollback.
    await sql("ALTER TABLE rcm_access_audit ADD CONSTRAINT fabricated_reject_supervision CHECK(event_type <> 'call_supervision_replaced') NOT VALID");
    await assert.rejects(store.replace(1, [8], 90), (error: any) => error.code === "23514");
    assert.equal(JSON.stringify((await store.configuration(1)).teamIds), grants);
    assert.equal((await sql("SELECT count(*)::int AS n FROM rcm_access_audit")).rows[0].n, audits);
    await sql("ALTER TABLE rcm_access_audit DROP CONSTRAINT fabricated_reject_supervision");
  });
  await check("concurrent assignment replacements are serialized without duplicate or partial grants", async () => {
    await Promise.all([store.replace(1, [7], 90), store.replace(1, [8], 90)]);
    const teams = (await store.configuration(1)).teamIds;
    assert.ok(JSON.stringify(teams) === "[7]" || JSON.stringify(teams) === "[8]");
    await store.replace(1, [7], 90);
  });
  await check("grant foreign-key cascades remove deleted teams/supervisors without affecting other grants", async () => {
    await sql("INSERT INTO users VALUES(96,'fabricated_temporary','Fabricated Temporary','manager',true)");
    await sql("INSERT INTO teams VALUES(76,'Fabricated Temporary Team')");
    await sql("INSERT INTO rcm_call_supervisors(manager_user_id,team_id,granted_by) VALUES(96,76,90)");
    await sql("DELETE FROM teams WHERE id=76");
    assert.equal((await sql("SELECT count(*)::int AS n FROM rcm_call_supervisors WHERE manager_user_id=96")).rows[0].n, 0);
    await sql("INSERT INTO rcm_call_supervisors(manager_user_id,team_id,granted_by) VALUES(96,8,90)");
    await sql("DELETE FROM users WHERE id=96");
    assert.equal((await sql("SELECT count(*)::int AS n FROM rcm_call_supervisors WHERE manager_user_id=96")).rows[0].n, 0);
    assert.deepEqual((await store.configuration(1)).teamIds, [7]);
  });
  await check("all call/schedule data unchanged; no linked-task or mutation storage path reached", async () => {
    assert.equal(forbiddenStorageCalls, 0);
    assert.equal(await snapshot(), before);
    await store.replace(1, [], 90);
    assert.equal((await sql("SELECT count(*)::int AS n FROM rcm_call_supervisors")).rows[0].n, 0);
  });
} catch (error) {
  failure = error;
  console.error("FAIL: " + currentCheck + ": " + (error instanceof Error ? error.message : "verification error"));
} finally {
  // Dispose ONLY the cluster/database created here, even after a failed check.
  const cleanupErrors: unknown[] = [];
  for (const pool of [readPool, adminPool]) {
    try { await pool?.end(); } catch (error) { cleanupErrors.push(error); }
  }
  if (controlPool) {
    try {
      const identity = (await controlPool.query("SELECT current_setting('data_directory') AS data")).rows[0];
      assert.equal(identity.data, data);
      await controlPool.query("DROP DATABASE IF EXISTS fabricated_call_supervision WITH (FORCE)");
    } catch (error) { cleanupErrors.push(error); }
    finally {
      try { await controlPool.end(); } catch (error) { cleanupErrors.push(error); }
    }
  }
  try {
    assert.equal(await readFile(path.join(root, "created-by-verification"), "utf8"), marker);
    assert.equal(await realpath(root), root);
    assert.equal((await lstat(root)).uid, process.getuid!());
    if (startAttempted) {
      // pg_ctl -D is bound to the newly created directory; never use killall.
      try { binary("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]); }
      catch (error) {
        try { binary("pg_ctl", ["-D", data, "status"]); throw error; }
        catch (statusError: any) { if (statusError?.status !== 3) throw statusError; }
      }
      started = false;
      await assert.rejects(access(path.join(data, "postmaster.pid")));
    }
    await rm(root, { recursive: true, force: false });
    await assert.rejects(access(root));
    cleaned = true;
    console.log("PASS: dropped only the fabricated database, stopped only its new cluster, and removed its directory");
  } catch (error) {
    cleanupErrors.push(error);
    console.error("FAIL: disposable-cluster cleanup; directory retained for safe inspection: " + root);
  }
  if (!failure && cleanupErrors.length) failure = cleanupErrors[0];
  const report = {
    sourceCommit: "ca629dd5fc52f0a8682c79a12063ea03fb4a23c7",
    passed: passed.length, failed: failure ? 1 : 0, checks: passed,
    failedCheck: failure ? currentCheck : null,
    error: failure instanceof Error ? failure.message : failure ? "Verification error" : null,
    isolation, migrationAppliedOnlyToDisposableCluster: migrationApplied,
    disposableClusterRemoved: cleaned, clusterStillRunning: started,
    cleanupErrors: cleanupErrors.length,
    activationPerformed: false, existingDatabaseContacted: false,
  };
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(`RESULT: ${passed.length} checks passed, ${failure ? 1 : 0} failed; disposable cluster removed: ${cleaned}`);
  if (failure || !cleaned) process.exitCode = 1;
}
