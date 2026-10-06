import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import {
  buildProductivityTransfers, filterProductivityTransfers, TRANSFER_DESTINATIONS,
  type TransferActivity,
} from "../shared/productivity-transfers";

const activity = (overrides: Partial<TransferActivity> = {}): TransferActivity => ({
  id: 1, recordId: 10, userId: 7, userName: "Test Actor", patientName: "Test Case",
  department: "Denials", action: "Updated Outcome", field: "outcome",
  oldValue: null, newValue: "Send to Arbitration", timestamp: "2026-10-06T13:00:00.000Z",
  ...overrides,
});

test("outcome transfers show actor, source, destination, patient, and event time", () => {
  const [transfer] = buildProductivityTransfers([activity()]);
  assert.equal(transfer.userId, 7);
  assert.equal(transfer.userName, "Test Actor");
  assert.equal(transfer.patientName, "Test Case");
  assert.equal(transfer.department, "Denials");
  assert.equal(transfer.destination, "Arbitration");
  assert.equal(transfer.timestamp, "2026-10-06T13:00:00.000Z");
  assert.ok(!("oldValue" in transfer));
  assert.ok(!("newValue" in transfer));
});

test("all supported Send to outcomes are recognized from every source tracker", () => {
  for (const [outcome, destination] of Object.entries(TRANSFER_DESTINATIONS)) {
    const [transfer] = buildProductivityTransfers([activity({ department: "Checks", newValue: outcome })]);
    assert.equal(transfer.destination, destination);
  }
  for (const department of ["Verification", "Billing", "Posting", "Collections", "Denials", "Arbitration", "Checks", "RTP"]) {
    const destination = department === "Posting" ? "Billing" : "Posting";
    assert.equal(buildProductivityTransfers([activity({ department, newValue: `Send to ${destination}` })]).length, 1);
  }
});

test("ordinary outcomes, status changes, notes and transfer-header activities are not transfers", () => {
  for (const newValue of ["Paid", "Loss", "Billed", "Done", "Pending", "Send to Checks", "toString"]) {
    assert.equal(buildProductivityTransfers([activity({ newValue })]).length, 0);
  }
  for (const field of ["status", "paid", "notes", "source", null]) {
    assert.equal(buildProductivityTransfers([activity({ field })]).length, 0);
  }
});

test("copied audit history is excluded, including nested copies", () => {
  const records = buildProductivityTransfers([
    activity(),
    activity({ id: 2, department: "Collections", action: "[Denials] Updated Outcome" }),
    activity({ id: 3, department: "Posting", action: "[Collections] [Denials] Updated Outcome" }),
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].userId, 7);
});

test("unchanged outcomes and same-page outcomes do not inflate transfer counts", () => {
  assert.equal(buildProductivityTransfers([activity({ oldValue: "Send to Arbitration" })]).length, 0);
  assert.equal(buildProductivityTransfers([activity({ department: "Arbitration" })]).length, 0);
});

test("each genuine transfer counts, even repeated transfers of the same record", () => {
  const transfers = buildProductivityTransfers([
    activity({ id: 1, newValue: "Send to Posting", timestamp: "2026-10-06T13:00:00Z" }),
    activity({ id: 2, oldValue: "Send to Posting", newValue: "Send to Collections", timestamp: "2026-10-06T14:00:00Z" }),
    activity({ id: 3, oldValue: "Send to Collections", newValue: "Send to Posting", timestamp: "2026-10-06T15:00:00Z" }),
  ]);
  assert.equal(transfers.length, 3);
  assert.deepEqual(transfers.map(transfer => transfer.id), [3, 2, 1]);
});

test("database Date values are serialized to ISO timestamps", () => {
  const [transfer] = buildProductivityTransfers([activity({ timestamp: new Date("2026-10-06T13:00:00Z") })]);
  assert.equal(transfer.timestamp, "2026-10-06T13:00:00.000Z");
});

test("the transfer tile and log share staff, source-department, and inclusive date filters", () => {
  const transfers = buildProductivityTransfers([
    activity({ id: 1, timestamp: "2026-10-06T00:00:00.000Z" }),
    activity({ id: 2, timestamp: "2026-10-06T23:59:59.999Z" }),
    activity({ id: 3, userId: 8 }),
    activity({ id: 4, department: "Collections" }),
    activity({ id: 5, timestamp: "2026-10-07T00:00:00.000Z" }),
  ]);
  const filters = {
    selectedUser: "7", selectedDept: "Denials",
    dateStart: new Date("2026-10-06T00:00:00Z"), dateEnd: new Date("2026-10-06T23:59:59.999Z"),
  };
  assert.deepEqual(filterProductivityTransfers(transfers, filters).map(transfer => transfer.id), [2, 1]);
  assert.equal(filterProductivityTransfers(transfers, { selectedUser: "all", selectedDept: "all", dateStart: null, dateEnd: null }).length, 5);
  assert.equal(filterProductivityTransfers(transfers, { ...filters, selectedDept: "Arbitration" }).length, 0);
});

test("records with overlapping IDs in different activity tables remain distinct", () => {
  assert.equal(buildProductivityTransfers([activity(), activity({ department: "Collections" })]).length, 2);
});

function compile(code: string) {
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}

function findNode(path: string, predicate: (node: ts.Node) => boolean): { source: ts.SourceFile; node: ts.Node } {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (predicate(node)) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found);
  return { source, node: found };
}

test("the actual database query reads all original outcome ledgers and recovers historic task source buckets", async () => {
  const { source, node } = findNode("./productivity-transfers.ts", node => ts.isFunctionDeclaration(node) && node.name?.text === "getProductivityTransfers");
  let statement: any;
  const context = vm.createContext({
    ...schema, sql, TRANSFER_DESTINATIONS, buildProductivityTransfers,
    db: { execute: async (query: any) => { statement = query; return { rows: [activity()] }; } },
  });
  vm.runInContext(compile(node.getText(source).replace(/^export\s+/, "")), context);
  const rows = await vm.runInContext("getProductivityTransfers()", context);
  assert.equal(rows.length, 1);
  const query = new PgDialect().sqlToQuery(statement);
  assert.equal(query.sql.match(/ UNION ALL /g)?.length, 6);
  for (const table of ["task_activity", "denial_activity", "arbitration_activity", "collection_activity", "posting_activity", "check_activity", "closed_activity"]) {
    assert.ok(query.sql.includes(`FROM "${table}"`));
  }
  assert.ok(query.sql.includes("bucket_history.old_value"));
  assert.ok(query.sql.includes("bucket_history.timestamp"));
  assert.ok(query.sql.includes("bucket_history.action NOT LIKE '[%'"));
  assert.ok(query.sql.includes("'for_verification' THEN 'Verification'"));
  assert.ok(query.sql.includes("'ready_for_billing' THEN 'Billing'"));
  assert.ok(!query.sql.includes("assigned_user_id"));
  for (const outcome of Object.keys(TRANSFER_DESTINATIONS)) assert.ok(query.params.includes(outcome));
});

const transferRoute = findNode("./routes.ts", node => ts.isCallExpression(node)
  && node.expression.getText() === "app.get"
  && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/api/productivity/transfers");
const route = transferRoute.node as ts.CallExpression;
assert.equal(route.arguments[1].getText(transferRoute.source), "requireAuth");

async function callRoute(viewer: any, fail = false) {
  let called = 0;
  const context = vm.createContext({
    storage: { getUser: async () => viewer },
    getProductivityTransfers: async () => {
      called++;
      if (fail) throw new Error("Test query failure");
      return buildProductivityTransfers([activity()]);
    },
  });
  vm.runInContext(compile(`const handler = ${route.arguments[2].getText(transferRoute.source)};`), context);
  let status = 200;
  let body: any;
  const res = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
  await vm.runInContext("handler", context)({ session: { userId: 1 } }, res);
  return { status, body, called };
}

test("the transfer API uses the existing Productivity page's four-role access", async () => {
  for (const role of ["admin", "manager", "account_manager", "case_manager"]) {
    const response = await callRoute({ role, active: true });
    assert.equal(response.status, 200);
    assert.equal(response.body[0].destination, "Arbitration");
  }
  for (const viewer of [undefined, { role: "admin", active: false }, ...["verifier", "biller", "assigner", "payment_specialist"].map(role => ({ role, active: true }))]) {
    const response = await callRoute(viewer);
    assert.equal(response.status, 403);
    assert.equal(response.called, 0);
  }
});

test("query failures are explicit errors rather than a false zero-transfers response", async () => {
  const response = await callRoute({ role: "admin", active: true }, true);
  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Test query failure");
});
