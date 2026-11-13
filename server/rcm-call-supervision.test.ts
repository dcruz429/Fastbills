import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createCallSupervisionStore } from "./rcm-call-supervision";
import { registerCallSupervisionRoutes } from "./rcm-call-supervision-routes";
import type { AccessContext } from "../shared/rcm-access-policy";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// All persistence here is a synthetic query spy. No DB imports/connections.
function database() {
  const calls: { sql: string; values: any[] }[] = [];
  const grants = new Set<number>();
  let membershipKnown = true, active = true, actorAdmin = true;
  let failure: any = null;
  let released = 0;
  const query = async (sql: string, values: any[] = []) => {
    calls.push({ sql, values });
    if (failure && sql.includes("rcm_call_supervisors")) throw failure;
    if (sql.includes('member.full_name AS "fullName"')) {
      assert.match(sql, /JOIN teams/);
      assert.match(sql, /JOIN user_teams membership ON membership.team_id=t.id/);
      assert.match(sql, /grant_row.manager_user_id=\$1/);
      assert.match(sql, /member.active=true/);
      assert.doesNotMatch(sql, /supervisor.role='manager'/);
      return { rows: grants.has(7) && membershipKnown && active ? [{ id: 2, fullName: "Synthetic Teammate" }] : [] };
    }
    if (sql.includes("SELECT id, active FROM users")) return { rowCount: active ? 1 : 0, rows: [{ id: 1, active }] };
    if (sql.includes("role='admin'")) return { rowCount: actorAdmin ? 1 : 0, rows: actorAdmin ? [{ id: 90 }] : [] };
    if (sql.includes("SELECT id FROM teams")) return { rowCount: values[0].filter((id: number) => [7, 8].includes(id)).length, rows: [] };
    if (sql.includes("SELECT id, name FROM teams")) return { rows: [{ id: 7, name: "Synthetic Team" }] };
    if (sql.includes("SELECT team_id")) return { rows: [...grants].map(team_id => ({ team_id })) };
    if (sql.startsWith("DELETE FROM rcm_call_supervisors")) grants.clear();
    if (sql.startsWith("INSERT INTO rcm_call_supervisors")) grants.add(values[1]);
    return { rows: [], rowCount: 1 };
  };
  return {
    calls, grants, get released() { return released; },
    setMembership(value: boolean) { membershipKnown = value; },
    setActive(value: boolean) { active = value; },
    setActorAdmin(value: boolean) { actorAdmin = value; },
    fail(error: any) { failure = error; },
    db: { query, connect: async () => ({ query, release: () => { released++; } }) } as any,
  };
}

test("no default grant; explicit assignments, membership removal and revocation are uncached", async () => {
  const d = database(), store = createCallSupervisionStore(d.db);
  assert.deepEqual(await store.employees(1), []);
  await store.replace(1, [7], 90);
  assert.deepEqual(await store.employees(1), [{ id: 2, fullName: "Synthetic Teammate" }]);
  d.setMembership(false);
  assert.deepEqual(await store.employees(1), []);
  d.setMembership(true);
  assert.equal((await store.employees(1)).length, 1);
  await store.replace(1, [], 90);
  assert.deepEqual(await store.employees(1), []);
  assert.equal(d.released, 2);
  assert.equal(d.calls.filter(c => c.sql.includes("INSERT INTO rcm_access_audit")).length, 2);
  assert.equal(d.calls.filter(c => c.sql === "COMMIT").length, 2);
});

test("unknown teams and inactive supervisors fail before changing grants; transactions roll back", async () => {
  for (const scenario of ["unknown-team", "inactive-supervisor", "revoked-admin"]) {
    const d = database(), store = createCallSupervisionStore(d.db);
    d.grants.add(7);
    if (scenario === "inactive-supervisor") d.setActive(false);
    if (scenario === "revoked-admin") d.setActorAdmin(false);
    await assert.rejects(store.replace(1, scenario === "unknown-team" ? [999] : [], 90));
    assert.deepEqual([...d.grants], [7]);
    assert.ok(d.calls.some(c => c.sql === "ROLLBACK"));
    assert.ok(!d.calls.some(c => c.sql === "COMMIT"));
    assert.equal(d.released, 1);
  }
});

test("missing schema disables supervisory reads; unrelated persistence errors are not masked", async () => {
  const d = database(), store = createCallSupervisionStore(d.db);
  d.fail({ code: "42P01" });
  assert.deepEqual(await store.employees(1), []);
  await assert.rejects(store.configuration(1));
  d.fail({ code: "08006" });
  await assert.rejects(store.employees(1));
});

test("malformed or ambiguous membership responses fail closed", async () => {
  for (const rows of [[{ id: "2", fullName: "Synthetic" }], [{ id: 2, fullName: "" }],
    [{ id: 2, fullName: "Synthetic" }, { id: 2, fullName: "Ambiguous" }]]) {
    const store = createCallSupervisionStore({ query: async () => ({ rows }) } as any);
    await assert.rejects(store.employees(1));
  }
});

function dispatch(router: any, method: string, url: string, body: any, session: any) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = Object.assign(Object.create(express.request), {
      app: express(), method, url, originalUrl: url, headers: {}, body, session,
    });
    let status = 200;
    const res = { locals: {}, status(value: number) { status = value; return this; },
      json(value: any) { resolve({ status, body: value }); return this; } };
    router.handle(req, res, (error: any) => error ? reject(error) : resolve({ status: 404, body: undefined }));
  });
}
function routes(options: { admin?: boolean; denied?: string; inactive?: boolean; unavailable?: boolean } = {}) {
  const d = database(), store = createCallSupervisionStore(d.db);
  if (options.unavailable) d.fail({ code: "42P01" });
  const context: AccessContext = {
    isSystemAdmin: !!options.admin, clinicIds: new Set(), departmentIds: new Set(),
    rolePermissions: new Set(["scopes.manage", "roles.manage"]),
    userOverrides: new Map(options.denied ? [[options.denied as any, "deny"]] : []),
  };
  const router = express.Router();
  registerCallSupervisionRoutes(router as any, { store,
    resolveAccess: async userId => options.inactive ? null : { userId, context } });
  return { d, request: (method: string, body: any = {}, session: any = { userId: 90 }, id = "1") =>
    dispatch(router, method, "/api/rcm/access/call-supervision/" + id, body, session) };
}

test("only active system admins with both management permissions may read or change grants", async () => {
  for (const method of ["GET", "PUT"]) {
    for (const options of [{}, { admin: true, denied: "roles.manage" }, { admin: true, denied: "scopes.manage" },
      { admin: true, inactive: true }]) {
      const f = routes(options);
      assert.equal((await f.request(method, { teamIds: [7] })).status, 403);
      assert.equal(f.d.calls.length, 0);
    }
    const f = routes({ admin: true });
    assert.equal((await f.request(method, { teamIds: [7] }, {})).status, 401);
    assert.equal((await f.request(method, { teamIds: [7] }, { userId: 90, originalUserId: 91 })).status, 403);
    assert.equal(f.d.calls.length, 0);
  }
});

test("administrator configuration supports create, replace and revoke; validates all IDs and payloads", async () => {
  const f = routes({ admin: true });
  assert.equal((await f.request("GET")).status, 200);
  assert.equal((await f.request("PUT", { teamIds: [7] })).status, 200);
  assert.deepEqual([...f.d.grants], [7]);
  assert.equal((await f.request("PUT", { teamIds: [8] })).status, 200);
  assert.deepEqual([...f.d.grants], [8]);
  assert.equal((await f.request("PUT", { teamIds: [] })).status, 200);
  assert.equal(f.d.grants.size, 0);
  for (const body of [{}, { teamIds: [7, 7] }, { teamIds: ["7"] }, { teamIds: [0] },
    { teamIds: [7], role: "admin" }]) assert.equal((await f.request("PUT", body)).status, 400);
  for (const id of ["01", "1e0", "-1", "1.0"]) assert.equal((await f.request("PUT", { teamIds: [7] }, { userId: 90 }, id)).status, 400);
  assert.equal((await f.request("PUT", { teamIds: [999] })).status, 400);
});

test("unapplied schema returns controlled activation errors for administrators", async () => {
  for (const method of ["GET", "PUT"]) {
    const f = routes({ admin: true, unavailable: true });
    const response = await f.request(method, { teamIds: [7] });
    assert.equal(response.status, 503);
    assert.match(response.body.message, /authorized schema change/);
    assert.equal(f.d.grants.size, 0);
  }
});

test("the actual supervisory schedule storage method executes SELECT only, not the legacy builder", async () => {
  const source = ts.createSourceFile("storage.ts", readFileSync("server/storage.ts", "utf8"), ts.ScriptTarget.Latest, true);
  let method: ts.MethodDeclaration | undefined;
  function inspect(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === "getExistingPatientDailySchedule") method = node;
    ts.forEachChild(node, inspect);
  }
  inspect(source); assert.ok(method);
  const clauses: any[] = [];
  const table = { userId: "owner", scheduledDate: "date" };
  const db = { select: () => ({ from: (selected: unknown) => {
    assert.equal(selected, table);
    return { where: async (clause: unknown) => {
      clauses.push(clause);
      return [{ id: 12, userId: 2, originalDate: null }, { id: 13, userId: 2, originalDate: "2026-11-12" }];
    } };
  } }) };
  const compiled = ts.transpileModule(`({ ${method.getText(source)} }).getExistingPatientDailySchedule`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const readOnly = runInNewContext(compiled, {
    db, patientCallSchedule: table, eq: (column: any, value: any) => ({ column, value }),
    and: (...parts: any[]) => parts,
  });
  // Any insert/update/delete or legacy-builder call fails: none are provided.
  const rows = await readOnly(2, "2026-11-13");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].isRollover, false);
  assert.equal(rows[1].isRollover, true);
  assert.equal(JSON.stringify(clauses), JSON.stringify([[{ column: "owner", value: 2 }, { column: "date", value: "2026-11-13" }]]));
});
