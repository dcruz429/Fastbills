import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import express from "express";
import ts from "typescript";
import { createCallBoundary, positiveCallId } from "./rcm-call-boundary";
import { permissionAllowed, resourceAllowed, type AccessContext } from "../shared/rcm-access-policy";

// No application/server/storage imports, HTTP listener, requests, or DB client.
// Execute the real route functions behind the real Express router in memory.
const routeSource = ts.createSourceFile("routes.ts",
  readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const routes: { method: string; path: string; code: string }[] = [];
function inspect(node: ts.Node) {
  if (ts.isCallExpression(node) && /^app\.(get|post|patch)$/.test(node.expression.getText(routeSource)) &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith("/api/calls")) {
    routes.push({ method: node.expression.getText(routeSource).slice(4), path: node.arguments[0].text,
      code: node.arguments.at(-1)!.getText(routeSource) });
  }
  ts.forEachChild(node, inspect);
}
inspect(routeSource);
assert.ok(routeSource.text.includes('app.use("/api/calls", createCallBoundary({'), "production boundary is wired");
assert.equal(routes.length, 16, "all existing call-calendar routes are exercised");

function evaluate(code: string, globals: object) {
  return runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, globals);
}

function fixture(options: {
  admin?: boolean; inactive?: boolean; role?: string; denies?: string[];
  owner?: number | null; clinic?: string | null; department?: string;
  linkedOwner?: number; linkedClinic?: string; linkedCallOwner?: number;
  employees?: number[]; unknownScope?: boolean;
} = {}) {
  const reads: string[] = [], writes: string[] = [];
  const context: AccessContext = {
    isSystemAdmin: !!options.admin,
    rolePermissions: new Set(["tasks.read", "tasks.update", "tasks.create"]),
    userOverrides: new Map((options.denies ?? []).map(p => [p as any, "deny"])),
    clinicIds: new Set([10]), departmentIds: new Set(["Verification"]),
  };
  if (options.unknownScope) context.clinicIds = new Set();
  const call = {
    id: 123, patientName: "Synthetic Call", assignedUserId: options.owner === undefined ? 1 : options.owner,
    clinic: options.clinic === undefined ? "Demo Clinic" : options.clinic,
    department: options.department ?? "Verification", relatedTaskId: 41, callStatus: "Scheduled",
  };
  const schedule = { id: 11, userId: 1, clinic: "Demo Clinic", department: "Verification", callId: 123 };
  const clinics = new Map([["demo clinic", 10], ["other clinic", 20]]);
  const access = async () => options.inactive ? null : { userId: 1, context };
  const storage: any = {
    getUser: async (id: number) => ({ id, fullName: "Synthetic Agent", role: options.admin ? "admin" : options.role ?? "verifier" }),
    getScheduledCall: async (id: number) => {
      reads.push("call:" + id);
      return id === 123 ? call : id === 124 ? { ...call, id: 124, assignedUserId: options.linkedCallOwner ?? 2 } : undefined;
    },
    getScheduledCalls: async (filters: any = {}) => {
      reads.push("list:" + (filters.assignedUserId ?? "all"));
      return [call, { ...call, id: 124, assignedUserId: 2 }, { ...call, id: 125, clinic: "Other Clinic" }]
        .filter(row => filters.assignedUserId === undefined || row.assignedUserId === filters.assignedUserId);
    },
    getPatientScheduleEntry: async (id: number) => id === 11 ? schedule :
      id === 12 ? { ...schedule, id, userId: 2 } :
      id === 13 ? { ...schedule, id, clinic: "Other Clinic" } :
      id === 14 ? { ...schedule, id, department: "Billing" } :
      id === 15 ? { ...schedule, id, callId: 124 } : null,
    getPatientScheduleEntryByCallId: async () => ({
      ...schedule, userId: options.linkedOwner ?? 1, clinic: options.linkedClinic ?? "Demo Clinic",
    }),
    getPatientDailySchedule: async (id: number) => {
      reads.push("daily:" + id);
      return [{ ...schedule, userId: id }, { ...schedule, id: 13, clinic: "Other Clinic" },
        { ...schedule, id: 14, department: "Billing" }];
    },
    getExistingPatientDailySchedule: async (id: number) => {
      reads.push("read-only-daily:" + id);
      return [{ ...schedule, userId: id, callId: id === 2 ? 124 : 123 },
        { ...schedule, userId: id, clinic: "Other Clinic" },
        { ...schedule, userId: id, department: "Billing" }];
    },
    getPatientCallAudit: async (id?: number) => {
      reads.push("audit:" + (id ?? "all"));
      return [{ id: 1, userId: 1, sourceId: 41, department: "Verification" },
        { id: 2, userId: 1, sourceId: 42, department: "Verification" },
        { id: 3, userId: 2, sourceId: 41, department: "Verification" },
        { id: 4, userId: 1, sourceId: 999, department: "Verification" }];
    },
    getTask: async (id: number) => id === 41 ? { id, clinicId: 10, bucket: "for_verification" } :
      id === 42 ? { id, clinicId: 20, bucket: "for_verification" } : undefined,
    getCallAttempts: async () => [{ id: 1, notes: "Synthetic attempt" }],
    getCallActivityLog: async () => [{ id: 1, eventType: "Synthetic activity" }],
    ensurePatientScheduleCall: async () => { writes.push("ensure-call"); return call; },
  };
  for (const method of ["getCollection", "getDenial", "getArbitration", "getPosting", "getCheck", "getClosed"])
    storage[method] = async () => undefined;
  for (const method of ["createCallAttempt", "createScheduledCall", "createCallActivity", "updateScheduledCall",
    "updateTask", "updatePatientScheduleDailyStatus", "updatePatientScheduleNotes", "createNotification"]) {
    storage[method] = async (...args: any[]) => { writes.push(method); return { ...call, id: 123, ...args[0] }; };
  }
  const globals = {
    storage, Date, console, ADMIN_ROLES: ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"],
    parsePositiveRouteId: positiveCallId, positiveCallId, resolveRcmAccess: access, legacyClinicNameIds: async () => clinics,
    scopedLegacyRecord: (ctx: AccessContext, ids: Map<string, number>, clinic: string, department: string, permission: any) => {
      const clinicId = typeof clinic === "string" ? ids.get(clinic.trim().toLowerCase()) : undefined;
      return clinicId !== undefined && resourceAllowed(ctx, permission, { clinicId, departmentId: department });
    },
  };
  const router = express.Router();
  router.use("/api/calls", createCallBoundary({ storage, resolveAccess: access, clinicIds: async () => clinics,
    supervisedEmployees: async () => (options.employees ?? []).map(id => ({ id, fullName: "Synthetic Team Employee" })),
  }));
  for (const route of routes) {
    const handler = evaluate(`(() => { const handler = ${route.code}; return handler; })()`, globals);
    (router as any)[route.method](route.path, async (req: any, res: any, next: any) => handler(req, res, next));
  }
  return { reads, writes, call, schedule, context,
    request(method: string, url: string, body: any = {}, session: any = { userId: 1 }) {
      return dispatch(router, method, url, body, session);
    },
  };
}

// Route dispatch only: no socket, fetch, supertest, server startup, or live data.
function dispatch(router: any, method: string, url: string, body: any = {}, session: any = { userId: 1 }) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = Object.assign(Object.create(express.request), {
      app: express(), method, url, originalUrl: url, headers: {}, body, session,
    });
    let status = 200;
    const res = {
      locals: {}, status(value: number) { status = value; return this; },
      json(value: any) { resolve({ status, body: value }); return this; },
    };
    router.handle(req, res, (error: any) => error ? reject(error) : resolve({ status: 404, body: undefined }));
  });
}

for (const path of ["/123", "/123/", "/123/attempts", "/123/ATTEMPTS/", "/123/activity", "/123/ACTIVITY/"]) {
  test("authorized call read " + path, async () => {
    assert.equal((await fixture().request("GET", "/api/calls" + path)).status, 200);
  });
  test("other owner's call denied " + path, async () => {
    const f = fixture({ owner: 2 });
    assert.equal((await f.request("GET", "/api/calls" + path)).status, 404);
    assert.equal(f.writes.length, 0);
  });
}

for (const id of ["+123", "1e2", "123.0", "0x7b", "0123", "0", "-1", "9007199254740992", "123junk",
  "%31%32%33", "%2531", "%2f123"]) {
  for (const endpoint of ["", "/ATTEMPTS/"]) {
    test("malformed ID fails before resource lookup: " + id + endpoint, async () => {
      const f = fixture();
      assert.equal((await f.request(endpoint ? "POST" : "GET", "/api/calls/" + id + endpoint,
        { outcome: "Resolved", updateTaskStatus: true, newTaskStatus: "done" })).status, 400);
      assert.equal(f.reads.length, 0);
      assert.equal(f.writes.length, 0);
    });
  }
}

for (const path of ["/123/start", "/123/START/", "/123/cancel", "/123/CANCEL/", "/123/attempts", "/123/ATTEMPTS/"]) {
  test("authorized existing call workflow " + path, async () => {
    const f = fixture();
    assert.equal((await f.request("POST", "/api/calls" + path, { outcome: "Resolved" })).status, 200);
    assert.ok(f.writes.length);
  });
  test("write owner, scope, and permission enforced " + path, async () => {
    for (const options of [{ owner: 2 }, { clinic: "Other Clinic" }, { department: "Billing" }, { denies: ["tasks.update"] }]) {
      const f = fixture(options);
      assert.ok([403, 404].includes((await f.request("POST", "/api/calls" + path, { outcome: "Resolved" })).status));
      assert.equal(f.writes.length, 0);
    }
  });
}

test("attempts cannot mutate linked tasks or reassign follow-ups on any casing", async () => {
  for (const path of ["/123/attempts", "/123/ATTEMPTS/"]) {
    for (const body of [{ updateTaskStatus: true, newTaskStatus: "done" }, { newTaskStatus: "done" },
      { followUpRequired: true, nextAssignedUserId: 2 }]) {
      const f = fixture();
      assert.equal((await f.request("POST", "/api/calls" + path, { outcome: "Resolved", ...body })).status, 403);
      assert.equal(f.writes.length, 0);
    }
  }
});

test("attempt synchronization rejects a linked schedule outside ownership or scope", async () => {
  for (const options of [{ linkedOwner: 2 }, { linkedClinic: "Other Clinic" }]) {
    const f = fixture(options);
    assert.equal((await f.request("POST", "/api/calls/123/attempts", { outcome: "Resolved" })).status, 404);
    assert.equal(f.writes.length, 0);
  }
});

test("canonical call PATCH preserves permitted edits but blocks linkage/scope changes", async () => {
  assert.equal((await fixture().request("PATCH", "/api/calls/123/", { notes: "Synthetic note" })).status, 200);
  for (const field of ["relatedTaskId", "assignedUserId", "clinic", "department"]) {
    const f = fixture();
    assert.equal((await f.request("PATCH", "/api/calls/123", { [field]: null })).status, 403);
    assert.equal(f.writes.length, 0);
  }
});

for (const path of ["/stats", "/STATS/", "/agent-stats", "/AGENT-STATS/"]) {
  test("aggregate restriction matches Express case/slash routing " + path, async () => {
    assert.equal((await fixture().request("GET", "/api/calls" + path)).status, 403);
    assert.equal((await fixture({ admin: true }).request("GET", "/api/calls" + path)).status, 200);
    assert.equal((await fixture({ admin: true, denies: ["tasks.read"] }).request("GET", "/api/calls" + path)).status, 403);
  });
}

test("list rejects unauthorized assignee filters rather than trusting role labels", async () => {
  for (const role of ["verifier", "manager"]) {
    const f = fixture({ role });
    const result = await f.request("GET", "/api/calls/?assignedUserId=2");
    assert.equal(result.status, 403);
    assert.equal(f.reads.length, 0);
  }
});

for (const [method, action, body] of [
  ["PATCH", "status", { dailyStatus: "Done" }], ["PATCH", "notes", { notes: "Synthetic note" }],
  ["POST", "ensure-call", {}],
] as const) {
  test("daily-schedule workflow authorizes owner, scope, and linked call: " + action, async () => {
    for (const suffix of [action, action.toUpperCase() + "/"]) {
      assert.equal((await fixture().request(method, "/api/calls/DAILY-SCHEDULE/11/" + suffix, body)).status, 200);
      for (const id of ["12", "13", "14", "15", "99"]) {
        const f = fixture({ role: "manager" });
        assert.equal((await f.request(method, `/api/calls/daily-schedule/${id}/${suffix}`, body)).status, 404);
        assert.equal(f.writes.length, 0);
      }
      for (const id of ["+11", "11.0", "%31%31", "011"]) {
        const f = fixture();
        assert.equal((await f.request(method, `/api/calls/daily-schedule/${id}/${suffix}`, body)).status, 400);
        assert.equal(f.writes.length, 0);
      }
      const denied = fixture({ denies: ["tasks.update"] });
      assert.equal((await denied.request(method, `/api/calls/daily-schedule/11/${suffix}`, body)).status, 403);
      assert.equal(denied.writes.length, 0);
    }
  });
}

test("daily list filters scopes and rejects arbitrary users before schedule generation", async () => {
  const f = fixture({ role: "manager" });
  const result = await f.request("GET", "/api/calls/DAILY-SCHEDULE/");
  assert.equal(result.status, 200);
  assert.deepEqual(Array.from(result.body, (r: any) => r.id), [11]);
  for (const query of ["userId=2", "userId=1&userId=2", "userId=1e0"]) {
    const denied = fixture({ role: "manager" });
    assert.ok([400, 403].includes((await denied.request("GET", "/api/calls/daily-schedule?" + query)).status));
    assert.equal(denied.reads.length, 0);
  }
  const admin = fixture({ admin: true });
  assert.equal((await admin.request("GET", "/api/calls/daily-schedule?userId=2")).status, 200);
  assert.ok(admin.reads.includes("read-only-daily:2"));
});

test("rollover audit filters row owner and current source scope, missing sources fail closed", async () => {
  const f = fixture({ role: "manager" });
  const result = await f.request("GET", "/api/calls/ROLLOVER-AUDIT/");
  assert.equal(result.status, 200);
  assert.deepEqual(Array.from(result.body, (r: any) => r.id), [1]);
  assert.ok(f.reads.includes("audit:1"));
  assert.equal((await f.request("GET", "/api/calls/rollover-audit?userId=2")).status, 403);
});

test("empty grants and unresolvable clinics fail closed without broadening admin policy", async () => {
  for (const key of ["clinicIds", "departmentIds"] as const) {
    const f = fixture();
    f.context[key].clear();
    assert.equal((await f.request("GET", "/api/calls/123")).status, 404);
    assert.equal((await f.request("PATCH", "/api/calls/daily-schedule/11/notes", { notes: "Synthetic" })).status, 404);
    assert.equal(f.writes.length, 0);
  }
  for (const clinic of [null, "Unknown Clinic"]) {
    const f = fixture({ admin: true, clinic });
    assert.equal((await f.request("GET", "/api/calls/123")).status, 404);
  }
});

test("daily lists and audit honor explicit read denies before loading any rows", async () => {
  for (const admin of [false, true]) {
    for (const path of ["/DAILY-SCHEDULE/", "/ROLLOVER-AUDIT/"]) {
      const f = fixture({ admin, denies: ["tasks.read"] });
      assert.equal((await f.request("GET", "/api/calls" + path)).status, 403);
      assert.equal(f.reads.length, 0);
    }
  }
});

test("ensure-call can create an authorized unlinked schedule call", async () => {
  const f = fixture();
  (f.schedule as any).callId = null;
  assert.equal((await f.request("POST", "/api/calls/daily-schedule/11/ensure-call")).status, 200);
  assert.ok(f.writes.includes("ensure-call"));
});

test("self-assigned follow-up scheduling and read-only impersonation remain usable", async () => {
  const f = fixture();
  assert.equal((await f.request("POST", "/api/calls/123/ATTEMPTS/", {
    outcome: "No Answer", followUpRequired: true, nextScheduledAt: "2026-11-14T14:00:00Z", nextAssignedUserId: 1,
  })).status, 200);
  assert.ok(f.writes.includes("createScheduledCall"));
  assert.ok(!f.writes.includes("updateTask"));
  assert.equal((await fixture().request("GET", "/api/calls/123", {}, { userId: 1, originalUserId: 2 })).status, 200);
});

test("auth, inactive account, impersonation, read/write differences and unknown routes fail closed", async () => {
  assert.equal((await fixture().request("GET", "/api/calls/123", {}, {})).status, 401);
  assert.equal((await fixture({ inactive: true }).request("GET", "/api/calls/123")).status, 403);
  assert.equal((await fixture().request("POST", "/api/calls/123/start", {}, { userId: 1, originalUserId: 2 })).status, 403);
  assert.equal((await fixture({ denies: ["tasks.read"] }).request("GET", "/api/calls/123")).status, 403);
  assert.equal((await fixture({ denies: ["tasks.update"] }).request("GET", "/api/calls/123")).status, 200);
  for (const path of ["/123/unknown", "/123//attempts", "/daily-schedule/11/unknown"])
    assert.equal((await fixture().request("POST", "/api/calls" + path)).status, 403);
  for (const path of ["/%73tats", "/daily-schedule/%31%31/status", "/%2531/attempts"])
    assert.equal((await fixture().request("POST", "/api/calls" + path)).status, 400);
});

test("creation policy unchanged: self-assigned scoped calls allowed, arbitrary links and assignees denied", async () => {
  const body = { patientName: "Synthetic Call", scheduledAt: "2026-11-13T14:00:00Z",
    callReason: "Synthetic follow-up", clinic: "Demo Clinic", department: "Verification", assignedUserId: 1 };
  assert.equal((await fixture().request("POST", "/api/calls/", body)).status, 200);
  for (const extra of [{ relatedTaskId: 41 }, { assignedUserId: 2 }, { clinic: "Other Clinic" }, { department: "Billing" }]) {
    const f = fixture();
    assert.equal((await f.request("POST", "/api/calls", { ...body, ...extra })).status, 403);
    assert.equal(f.writes.length, 0);
  }
});

test("capabilities project effective self access, recognized scopes, and explicit denies", async () => {
  const f = fixture({ role: "manager" });
  const caps = await f.request("GET", "/api/calls/CAPABILITIES/?userId=2");
  assert.equal(caps.status, 200);
  assert.equal(caps.body.userId, 1);
  assert.equal(caps.body.canManage, false);
  assert.equal(caps.body.canMutate, true);
  assert.deepEqual(Array.from(caps.body.clinics, (c: any) => c.id), [10]);
  assert.deepEqual(Array.from(caps.body.departments), ["Verification"]);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});

test("capabilities never grant writes during impersonation or override permission denies", async () => {
  for (const admin of [false, true]) {
    const denied = await fixture({ admin, denies: ["tasks.update"] }).request("GET", "/api/calls/capabilities");
    assert.equal(denied.body.canMutate, false);
    const readDenied = await fixture({ admin, denies: ["tasks.read"] }).request("GET", "/api/calls/capabilities");
    assert.equal(readDenied.body.canRead, false);
    assert.equal(readDenied.body.canMutate, false);
    assert.equal(readDenied.body.canManage, false);
    assert.equal(readDenied.body.clinics.length, 0);
    const impersonated = await fixture({ admin }).request("GET", "/api/calls/capabilities", {}, { userId: 1, originalUserId: 2 });
    assert.equal(impersonated.body.canMutate, false);
  }
  assert.equal((await fixture({ inactive: true }).request("GET", "/api/calls/capabilities")).status, 403);
  assert.equal((await fixture().request("GET", "/api/calls/capabilities", {}, {})).status, 401);
  assert.equal((await fixture().request("GET", "/api/calls/%63apabilities")).status, 400);
});

for (const path of ["", "/attempts", "/activity", "/ATTEMPTS/", "/ACTIVITY/"]) {
  test("explicit supervision permits only same-scope team call reads " + path, async () => {
    const f = fixture({ owner: 2, employees: [2] });
    assert.equal((await f.request("GET", "/api/calls/123" + path)).status, 200);
    assert.equal(f.writes.length, 0);
    for (const options of [
      { employees: [] }, { employees: [3] }, { clinic: "Other Clinic" }, { clinic: null },
      { department: "Billing" }, { department: "" }, { unknownScope: true }, { denies: ["tasks.read"] },
    ]) {
      const denied = fixture({ owner: 2, employees: [2], ...options });
      assert.ok([403, 404].includes((await denied.request("GET", "/api/calls/123" + path)).status));
      assert.equal(denied.writes.length, 0);
    }
    assert.equal((await f.request("GET", "/api/calls/123" + path, {}, { userId: 1, originalUserId: 90 })).status, 404);
  });
}

test("explicit supervision authorizes list filters but no cross-team filters or aggregate reports", async () => {
  const f = fixture({ employees: [2] });
  assert.deepEqual(Array.from((await f.request("GET", "/api/calls")).body, (row: any) => row.id), [123, 124]);
  assert.deepEqual(Array.from((await f.request("GET", "/api/calls?assignedUserId=2")).body, (row: any) => row.id), [124]);
  assert.equal((await f.request("GET", "/api/calls?assignedUserId=3&teamId=7&role=admin")).status, 403);
  assert.equal((await f.request("GET", "/api/calls?assignedUserId=2&assignedUserId=3")).status, 400);
  for (const path of ["/stats", "/agent-stats", "/rollover-audit?userId=2"])
    assert.equal((await f.request("GET", "/api/calls" + path)).status, 403);
  assert.deepEqual(Array.from((await f.request("GET", "/api/calls", {}, { userId: 1, originalUserId: 90 })).body, (row: any) => row.id), [123]);
});

test("supervised schedules are scoped read-only and never invoke schedule building", async () => {
  const f = fixture({ employees: [2] });
  const result = await f.request("GET", "/api/calls/daily-schedule?userId=2");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].userId, 2);
  assert.ok(f.reads.includes("read-only-daily:2"));
  assert.ok(!f.reads.includes("daily:2"));
  assert.equal(f.writes.length, 0);
  for (const options of [{ employees: [] }, { employees: [3] }, { denies: ["tasks.read"] }, { unknownScope: true }])
    assert.equal((await fixture(options).request("GET", "/api/calls/daily-schedule?userId=2")).status, 403);
  assert.equal((await f.request("GET", "/api/calls/daily-schedule?userId=2", {}, { userId: 1, originalUserId: 90 })).status, 403);
});

test("revocation, missing membership and permission/scope removal take effect on the next request", async () => {
  const options = { employees: [2] };
  const f = fixture(options);
  assert.equal((await f.request("GET", "/api/calls/124")).status, 200);
  assert.equal((await f.request("GET", "/api/calls/capabilities")).body.supervisedEmployees.length, 1);
  options.employees = [];
  assert.equal((await f.request("GET", "/api/calls/124")).status, 404);
  assert.equal((await f.request("GET", "/api/calls/daily-schedule?userId=2")).status, 403);
  assert.equal((await f.request("GET", "/api/calls/capabilities")).body.supervisedEmployees.length, 0);
  options.employees = [2];
  f.context.departmentIds = new Set();
  assert.equal((await f.request("GET", "/api/calls/124")).status, 404);
  f.context.departmentIds = new Set(["Verification"]);
  f.context.userOverrides = new Map([["tasks.read", "deny"]]);
  assert.equal((await f.request("GET", "/api/calls/124")).status, 403);
});

test("explicit supervision never adds mutations, delegation, assignment or linked task rights", async () => {
  for (const [method, path, body] of [
    ["PATCH", "/124", { callStatus: "Resolved" }],
    ["POST", "/124/start", {}], ["POST", "/124/cancel", {}],
    ["POST", "/124/attempts", { outcome: "Resolved" }],
    ["PATCH", "/daily-schedule/12/status", { dailyStatus: "Done" }],
    ["PATCH", "/daily-schedule/12/notes", { notes: "Synthetic" }],
    ["POST", "/daily-schedule/12/ensure-call", {}],
    ["POST", "/", { assignedUserId: 2, clinic: "Demo Clinic", department: "Verification" }],
    ["POST", "/123/attempts", { outcome: "Resolved", nextAssignedUserId: 2 }],
    ["POST", "/123/attempts", { outcome: "Resolved", newTaskStatus: "done" }],
  ] as const) {
    const f = fixture({ employees: [2] });
    assert.ok([403, 404].includes((await f.request(method, "/api/calls" + path, body)).status), path);
    assert.equal(f.writes.length, 0);
  }
});

// Evaluate only production declarations, with all runtime imports replaced by
// stubs. In particular, the financial boundary's DB module is never imported.
const financialSource = ts.createSourceFile("financial.ts",
  readFileSync(new URL("./rcm-legacy-financial-write-boundary.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const financialDeclarations = financialSource.statements.filter(node => !ts.isImportDeclaration(node))
  .map(node => node.getText(financialSource).replace(/^export /, "")).join("\n");

function registerFinancial(router: ReturnType<typeof express.Router>, register: any) {
  // Promise wrappers keep VM-compiled middleware in the host Promise realm.
  register({ use(path: string, handler: any) {
    router.use(path, async (req, res, next) => handler(req, res, next));
  } });
}

for (const family of ["denials", "checks", "arbitrations", "collections", "postings", "closed"]) {
  for (const path of ["import-csv", "import-csv/", "IMPORT-CSV", "ImPoRt-CsV/"]) {
    test(`financial ${family}/${path} cannot substitute update for create permission`, async () => {
      for (const denyCreate of [true, false]) {
        const ctx: AccessContext = { isSystemAdmin: true,
          rolePermissions: new Set(["tasks.read", "tasks.create", "tasks.update", "checks.read"]),
          userOverrides: new Map([[denyCreate ? "tasks.create" : "tasks.update", "deny"]]),
          clinicIds: new Set(), departmentIds: new Set() };
        const register = evaluate(financialDeclarations + "\nregisterLegacyFinancialWriteBoundary;", {
          permissionAllowed, resourceAllowed, resolveRcmAccess: async () => ({ context: ctx }),
          pool: { query() { throw new Error("Unexpected DB access"); } },
        });
        const router = express.Router();
        registerFinancial(router, register);
        (router as any).post(`/api/${family}/import-csv`, (_req: any, res: any) => res.json({ synthetic: true }));
        assert.equal((await dispatch(router, "POST", `/api/${family}/${path}`)).status, denyCreate ? 403 : 200);
      }
    });
  }
  test(`financial ${family} rejects encoded import variants`, async () => {
    const register = evaluate(financialDeclarations + "\nregisterLegacyFinancialWriteBoundary;", {
      permissionAllowed, resourceAllowed,
      resolveRcmAccess: async () => ({ context: {
        isSystemAdmin: true, rolePermissions: new Set(["tasks.create", "tasks.update", "checks.read"]),
        userOverrides: new Map(), clinicIds: new Set(), departmentIds: new Set(),
      } }),
      pool: { query() { throw new Error("Unexpected DB access"); } },
    });
    const router = express.Router(); registerFinancial(router, register);
    for (const path of ["%69mport-csv", "%2569mport-csv", "import-csv%2f"])
      assert.equal((await dispatch(router, "POST", `/api/${family}/${path}`)).status, 400);
  });
}

test("financial imports reject delegated users, inactive users, impersonation, and checks.read denial", async () => {
  for (const scenario of ["delegated", "inactive", "impersonated", "checks.read"]) {
    const register = evaluate(financialDeclarations + "\nregisterLegacyFinancialWriteBoundary;", {
      permissionAllowed, resourceAllowed,
      resolveRcmAccess: async () => scenario === "inactive" ? null : { context: {
        isSystemAdmin: scenario !== "delegated",
        rolePermissions: new Set(["tasks.create", "tasks.update", "checks.read"]),
        userOverrides: new Map(scenario === "checks.read" ? [["checks.read", "deny"]] : []),
        clinicIds: new Set([10]), departmentIds: new Set(["Checks"]),
      } },
      pool: { query() { throw new Error("Unexpected DB access"); } },
    });
    const router = express.Router(); registerFinancial(router, register);
    router.post("/api/checks/import-csv", (_req, res) => res.json({ synthetic: true }));
    for (const path of ["import-csv", "IMPORT-CSV/"]) {
      const session = scenario === "impersonated" ? { userId: 1, originalUserId: 2 } : { userId: 1 };
      assert.equal((await dispatch(router, "POST", "/api/checks/" + path, {}, session)).status, 403);
    }
  }
});
