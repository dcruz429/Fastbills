import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  postings, denials, collections, arbitrations,
  insertPostingSchema, insertDenialSchema, insertCollectionSchema, insertArbitrationSchema,
} from "../shared/schema";
import { isPaidOnlyUpdate, validatePaidFlag } from "./paid-flag";
import { calculatePatientTotals } from "../shared/patient-overview";

const stages = [
  { path: "postings", name: "Posting" },
  { path: "denials", name: "Denial" },
  { path: "collections", name: "Collection" },
  { path: "arbitrations", name: "Arbitration" },
];

test("all four record types have a non-null boolean PAID field defaulting to unchecked", () => {
  for (const table of [postings, denials, collections, arbitrations]) {
    const column = getTableConfig(table).columns.find(column => column.name === "paid")!;
    assert.ok(column);
    assert.equal(column.notNull, true);
    assert.equal(column.default, false);
  }
  for (const schema of [insertPostingSchema, insertDenialSchema, insertCollectionSchema, insertArbitrationSchema]) {
    assert.ok(schema.safeParse({ patientName: "Test Patient", paid: true }).success);
    assert.ok(schema.safeParse({ patientName: "Test Patient", paid: false }).success);
    assert.ok(schema.safeParse({ patientName: "Test Patient" }).success);
    for (const paid of ["true", "false", 0, 1, null]) {
      assert.ok(!schema.safeParse({ patientName: "Test Patient", paid }).success);
    }
  }
});

test("PAID-only updates are distinguishable from ordinary edits", () => {
  assert.ok(isPaidOnlyUpdate({ paid: true }));
  assert.ok(isPaidOnlyUpdate({ paid: false }));
  assert.ok(!isPaidOnlyUpdate({ paid: "false" }));
  assert.ok(!isPaidOnlyUpdate({ paid: true, status: "Done" }));
  assert.ok(!isPaidOnlyUpdate({ notes: "updated" }));
});

function validate(body: unknown) {
  let nextCalled = false;
  let status = 200;
  const res = { status(code: number) { status = code; return this; }, json() { return this; } };
  validatePaidFlag({ body } as any, res as any, () => { nextCalled = true; });
  return { status, nextCalled };
}

test("API validation accepts both booleans and rejects misleading checkbox values", () => {
  for (const paid of [true, false]) assert.equal(validate({ paid }).nextCalled, true);
  for (const paid of ["true", "false", 1, 0, null, [], {}]) {
    assert.equal(validate({ paid }).status, 400);
    assert.equal(validate({ paid }).nextCalled, false);
  }
  assert.equal(validate({ notes: "another field" }).nextCalled, true);
});

// Isolate real route handlers and helpers from database/session setup. These
// tests never insert fixture patients into the application's database.
const source = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const handlers = new Map<string, ts.Node>();
const helperNames = new Set(["autoAssignStatus", "handleOutcomeTransfer"]);
const variableNames = new Set(["denialFieldLabels", "denialTrackFields", "arbFieldLabels", "arbTrackFields", "collectionFieldLabels", "collectionTrackFields"]);
const helpers: string[] = [];
const definitions: string[] = [];
function inspect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && helperNames.has(node.name.text)) helpers.push(node.getText(source));
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && variableNames.has(node.name.text)) {
    definitions.push(`const ${node.getText(source)};`);
  }
  if (ts.isCallExpression(node) && ["app.patch", "app.post"].includes(node.expression.getText(source))
    && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
    const path = node.arguments[0].text;
    if (stages.some(stage => [`/api/${stage.path}`, `/api/${stage.path}/:id`].includes(path))
      || path === "/api/denials/:id/send-to-arbitration") {
      assert.equal(node.arguments[1].getText(source), "requireAuth");
      if (path !== "/api/denials/:id/send-to-arbitration") assert.equal(node.arguments[2].getText(source), "validatePaidFlag");
      handlers.set(`${node.expression.getText(source)}:${path}`, node.arguments[node.arguments.length - 1]);
    }
  }
  ts.forEachChild(node, inspect);
}
inspect(source);
assert.equal(handlers.size, 9);
function compile(code: string) {
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
const commonCode = compile([...helpers, ...definitions].join("\n"));

function fixture(stage: typeof stages[number], initial: Record<string, unknown> = {}, role = "admin") {
  let record: any = {
    id: 12, patientName: "Test Patient", paid: false, amount: "125.50",
    assignedTo: "Test Assignee", status: "Unassigned", outcome: null, ...initial,
  };
  const activities: any[] = [];
  const created: any[] = [];
  const transfers: any[] = [];
  const storage: any = {
    getUser: async () => ({ id: 1, role, fullName: "Test Actor" }),
    getAllUsers: async () => [], getAllClinics: async () => [], getAllInsurances: async () => [],
  };
  for (const item of stages) {
    storage[`get${item.name}`] = async () => record;
    storage[`update${item.name}`] = async (_id: number, data: object) => (record = { ...record, ...data });
    storage[`create${item.name}`] = async (data: object) => {
      const result = { paid: false, ...data, id: 100 };
      created.push(result);
      return result;
    };
    storage[`get${item.name}Activity`] = async () => [];
    storage[`create${item.name}Activity`] = async (activity: object) => { activities.push(activity); };
  }
  const context = vm.createContext({
    storage, isPaidOnlyUpdate, getAssigneeUserId: async () => 99,
    ADMIN_ROLES: ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"],
    OUTCOME_OPTIONS: ["Send to Posting", "Send to Collections", "Send to Denials", "Send to Arbitration"],
    syncRTPRecord: async () => {},
  });
  vm.runInContext(commonCode, context);
  const realTransfer = vm.runInContext("handleOutcomeTransfer", context);
  context.handleOutcomeTransfer = async (...args: any[]) => {
    transfers.push(args);
    return realTransfer(...args);
  };
  async function request(method: "post" | "patch", body: any) {
    const validated = validate(body);
    if (!validated.nextCalled) return { status: validated.status, body: null };
    const path = `/api/${stage.path}${method === "patch" ? "/:id" : ""}`;
    const handler = handlers.get(`app.${method}:${path}`)!;
    vm.runInContext(compile(`const handler = ${handler.getText(source)};`).replace("const handler", `const handler_${method}`), context);
    let status = 200;
    let response: any;
    const res = { status(code: number) { status = code; return this; }, json(data: any) { response = data; return this; } };
    await vm.runInContext(`handler_${method}`, context)({ params: { id: "12" }, body, session: { userId: 1 } }, res);
    return { status, body: response };
  }
  return { request, activities, created, transfers, record: () => record, context };
}

for (const stage of stages) {
  test(`${stage.path}: a full form save changing PAID alone does not auto-change an existing Unassigned status`, async () => {
    const f = fixture(stage);
    const saved = await f.request("patch", { paid: true, status: "Unassigned", assignedTo: "Test Assignee", amount: "125.50" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.paid, true);
    assert.equal(saved.body.status, "Unassigned");
    assert.equal(saved.body.assignedTo, "Test Assignee");
    assert.equal(saved.body.amount, "125.50");
  });

  for (const status of ["Unassigned", "Done"]) {
    test(`${stage.path}: checking/unchecking PAID persists without changing ${status} status, amounts, or assignment`, async () => {
      const f = fixture(stage, { status });
      const checked = await f.request("patch", { paid: true });
      assert.equal(checked.status, 200);
      assert.equal(checked.body.paid, true);
      assert.equal(f.record().paid, true);
      assert.equal(f.record().status, status);
      assert.equal(f.record().amount, "125.50");
      assert.equal(f.record().assignedTo, "Test Assignee");
      assert.equal(f.record().outcome, null);
      assert.equal(f.transfers.length, 0);
      // A fresh handler invocation models saving after reopening the record.
      const handler = handlers.get(`app.patch:/api/${stage.path}/:id`)!;
      vm.runInContext(compile(`const uncheckHandler = ${handler.getText(source)};`), f.context);
      let returned: any;
      await vm.runInContext("uncheckHandler", f.context)(
        { params: { id: "12" }, body: { paid: false }, session: { userId: 1 } },
        { status() { return this; }, json(value: unknown) { returned = value; } },
      );
      assert.equal(returned.paid, false);
      assert.equal(f.record().status, status);
      assert.equal(f.activities.filter(activity => activity.field === "paid").length, 2);
      const last = f.activities[f.activities.length - 1];
      assert.equal(last.oldValue, "true");
      assert.equal(last.newValue, "false");
    });
  }

  test(`${stage.path}: creating a checked record and editing unrelated fields retains the marker`, async () => {
    const created = await fixture(stage).request("post", { patientName: "Test Patient", paid: true });
    assert.equal(created.status, 200);
    assert.equal(created.body.paid, true);
    const f = fixture(stage, { paid: true, status: "Assigned" });
    const edited = await f.request("patch", { amount: "200.00" });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.paid, true);
    assert.equal(edited.body.amount, "200.00");
  });

  test(`${stage.path}: same-save PAID changes survive an outcome transfer`, async () => {
    const target = stage.path === "denials" ? "Arbitration" : "Denials";
    const f = fixture(stage, { paid: true });
    const saved = await f.request("patch", { paid: false, outcome: `Send to ${target}` });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.paid, false);
    assert.equal(f.transfers.length, 1);
    assert.equal(f.created[0].paid, false);
    assert.equal(f.created[0].amount, "125.50");
  });
}

test("Posting edit permissions still reject a verifier", async () => {
  const f = fixture(stages[0], {}, "verifier");
  assert.equal((await f.request("patch", { paid: true })).status, 403);
  assert.equal(f.record().paid, false);
});

test("existing checked markers survive all four outcome-transfer destinations", async () => {
  const f = fixture(stages[0]);
  for (const target of ["Posting", "Collections", "Denials", "Arbitration"]) {
    await vm.runInContext("handleOutcomeTransfer", f.context)(`Send to ${target}`, "Collections",
      { patientName: "Test Patient", paid: true, amount: "125.50" }, 1);
    assert.equal(f.created[f.created.length - 1].paid, true);
  }
});

test("the direct Denial-to-Arbitration transfer retains PAID", async () => {
  const f = fixture(stages[1], { paid: true });
  const targetTable = {};
  let inserted: any;
  Object.assign(f.context, {
    arbitrations: targetTable, arbitrationActivity: {}, denials: {}, denialActivity: {},
    eq: () => true,
    db: { transaction: async (run: (tx: any) => unknown) => run({
      insert: (table: object) => ({ values: (value: object) => {
        if (table === targetTable) inserted = value;
        return { returning: async () => [{ id: 123, ...value }] };
      } }),
      delete: () => ({ where: async () => {} }),
    }) },
  });
  const handler = handlers.get("app.post:/api/denials/:id/send-to-arbitration")!;
  vm.runInContext(compile(`const directTransfer = ${handler.getText(source)};`), f.context);
  let response: any;
  await vm.runInContext("directTransfer", f.context)(
    { params: { id: "12" }, session: { userId: 1 } },
    { status() { return this; }, json(value: unknown) { response = value; } },
  );
  assert.equal(inserted.paid, true);
  assert.equal(response.paid, true);
});

test("PAID does not remove amounts from Open or Done tracker totals", () => {
  const records = [{ state: "open" as const, amount: "125.50", paid: true }, { state: "done" as const, amount: "25", paid: true }];
  assert.deepEqual(calculatePatientTotals(records), {
    open: { count: 1, amount: 125.5 }, done: { count: 1, amount: 25 }, grandTotal: { count: 2, amount: 150.5 },
  });
});
