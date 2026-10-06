import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type { Task, User } from "../shared/schema";
import {
  calculatePatientTotals, matchesPatientName, patientSearchTokens,
  PATIENT_OVERVIEW_SECTIONS,
} from "../shared/patient-overview";
import { buildPatientOverview, type PatientOverviewData, type PatientTaskRow, type PatientTrackerRow } from "./patient-overview";

function task(id: number, bucket: Task["bucket"], status: Task["status"]): PatientTaskRow {
  return {
    task: {
      id, patientName: "Example, Patient", bucket, status, assignedUserId: 99,
      inputDate: new Date("2026-10-05T16:00:00Z"), ieDate: new Date("2026-09-05T16:00:00Z"),
      dueDate: new Date("2026-10-05T16:00:00Z"), insuranceId: 3, clinicId: 1,
      notes: "Test-only notes", outcome: null,
    } as Task,
    clinic: "Test Clinic", insurance: "Test Insurance", assignedTo: "Another User",
  };
}
function tracker(id: number, status: string, amount: string): PatientTrackerRow {
  return {
    id, patientName: "Example, Patient", clinic: "Test Clinic", insurance: "Test Insurance",
    assignedTo: "Another User", status, amount, outcome: status === "Done" ? "Paid" : null,
    createdAt: new Date("2026-10-05T16:00:00Z"),
  };
}
function fixture(): PatientOverviewData {
  return {
    tasks: [task(1, "for_verification", "assigned"), task(2, "for_verification", "done"),
      task(3, "ready_for_billing", "assigned"), task(4, "ready_for_billing", "done"),
      task(5, "done", "billed"), task(6, "done", "dropped")],
    posting: [tracker(1, "Assigned", "$100.00"), tracker(2, "Done", "$200.00")],
    collections: [tracker(1, "Assigned", "100"), tracker(2, "Done", "200")],
    denials: [tracker(1, "Assigned", "100"), tracker(2, "Done", "200")],
    arbitration: [tracker(1, "Assigned", "100"), tracker(2, "Done", "200")],
    checks: [tracker(1, "Assigned", "100"), tracker(2, "Done", "200")],
  };
}
function viewer(role: User["role"]) {
  return { id: 7, role, fullName: "Test Viewer" };
}

test("case, punctuation, spacing, and name order do not prevent a patient match", () => {
  for (const query of ["patient example", "EXAMPLE, PATIENT", "  example    patient ", "Pat Ex"]) {
    assert.ok(matchesPatientName("Example, Patient", query));
  }
  assert.ok(matchesPatientName("O'Neil, Anne-Marie", "anne marie o neil"));
  assert.ok(matchesPatientName("García, José", "JOSÉ GARCÍA"));
  assert.ok(!matchesPatientName("Other, Patient", "Example Patient"));
  assert.ok(!matchesPatientName(null, "Example"));
  assert.ok(!matchesPatientName("Example", "%___"));
  assert.equal(patientSearchTokens("Example % _ example").join(","), "example");
});

test("seven ordered sections contain both active and Done buckets without double-counting tasks", () => {
  const result = buildPatientOverview("Example", fixture(), viewer("admin"));
  assert.deepEqual(result.sections.map(section => section.id), PATIENT_OVERVIEW_SECTIONS.map(section => section.id));
  const verification = result.sections[0];
  const billing = result.sections[1];
  assert.equal(verification.records.length, 2);
  assert.equal(verification.records[1].state, "done");
  assert.equal(billing.records.length, 3);
  assert.equal(billing.totals.done.count, 2);
  assert.ok(!billing.records.some(record => record.id === 6));
  assert.equal(result.totals.open.count, 7);
  assert.equal(result.totals.done.count, 8);
  assert.equal(result.totals.grandTotal.count, 15);
  assert.equal(result.totals.open.amount, 500);
  assert.equal(result.totals.done.amount, 1000);
  assert.equal(result.totals.grandTotal.amount, 1500);
  assert.ok(result.sections.slice(2).every(section => section.totals.done.count === 1));
});

test("Verification/Billing retain joined insurance, due dates, and no fictitious amounts", () => {
  const result = buildPatientOverview("Example", fixture(), viewer("admin"));
  for (const section of result.sections.slice(0, 2)) {
    assert.equal(section.hasAmounts, false);
    for (const record of section.records) {
      assert.equal(record.insurance, "Test Insurance");
      assert.equal(record.amount, null);
      assert.ok(record.details.some(detail => detail.label === "Due Date" && detail.value === "2026-10-05"));
    }
  }
});

for (const role of ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] as const) {
  test(`${role} can view all matching records regardless of assignment`, () => {
    const result = buildPatientOverview("Example", fixture(), viewer(role));
    assert.equal(result.totals.grandTotal.count, 15);
    assert.equal(result.sections[6].records.length, 2);
    assert.ok(result.sections.every(section => section.records.some(record => record.state === "done")));
  });
}

test("source links keep existing tracker permissions without restricting read-only results", () => {
  const result = buildPatientOverview("Example", fixture(), viewer("verifier"));
  assert.ok(result.sections.every(section => section.records.every(record => record.sourceUrl === null)));
  const admin = buildPatientOverview("Example", fixture(), viewer("admin"));
  assert.equal(admin.sections[0].records[0].sourceUrl, "/verification?edit=1");
  assert.equal(admin.sections[1].records[2].sourceUrl, "/?edit=5");
  assert.equal(admin.sections[6].records[0].sourceUrl, "/checks?edit=1");
});

test("payment-document source links and Checks links follow their distinct role rules", () => {
  const data = fixture();
  data.posting = [Object.assign(tracker(7, "Assigned", "100"), { documentType: "Payment" })];
  for (const role of ["admin", "payment_specialist", "account_manager", "case_manager", "manager"] as const) {
    const result = buildPatientOverview("Example", data, viewer(role));
    assert.equal(result.sections[2].records[0].sourceUrl, "/posting?edit=7");
    if (role === "case_manager" || role === "manager") {
      assert.equal(result.sections[6].records[0].sourceUrl, null);
    }
  }
  for (const role of ["verifier", "biller", "assigner"] as const) {
    const result = buildPatientOverview("Example", data, viewer(role));
    assert.equal(result.sections[2].records[0].sourceUrl, null);
    assert.equal(result.sections[2].records.length, 1);
  }
});

test("dropped tasks do not appear in trackers, and searching does not mutate their buckets", () => {
  const data = fixture();
  data.tasks.push(task(7, "for_verification", "dropped"), task(8, "ready_for_billing", "dropped"));
  const result = buildPatientOverview("Example", data, viewer("admin"));
  assert.equal(result.totals.grandTotal.count, 15);
  assert.equal(data.tasks.find(row => row.task.id === 7)?.task.bucket, "for_verification");
  assert.equal(data.tasks.find(row => row.task.id === 8)?.task.bucket, "ready_for_billing");
});

test("empty results keep all seven sections with zero counts", () => {
  const data: PatientOverviewData = { tasks: [], posting: [], collections: [], denials: [], arbitration: [], checks: [] };
  const result = buildPatientOverview("Nonexistent", data, viewer("admin"));
  assert.equal(result.sections.length, 7);
  assert.equal(result.totals.grandTotal.count, 0);
  assert.ok(result.sections.every(section => section.records.length === 0));
});

test("Done classification is case-insensitive and totals retain negative/missing amounts", () => {
  const data = fixture();
  data.checks = [tracker(3, " done ", "-$20.50"), tracker(4, "Assigned", "N/A")];
  const result = buildPatientOverview("Example", data, viewer("admin")).sections[6];
  assert.equal(result.totals.done.amount, -20.5);
  assert.equal(result.totals.open.count, 1);
  const totals = calculatePatientTotals([{ state: "open", amount: null }, { state: "done", amount: "$1,000.99" }]);
  assert.equal(totals.grandTotal.amount, 1000.99);
});

// Exercise the real Express handler with isolated reads, without auth bypasses
// or fixture inserts into the app's database.
const source = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
let handlerNode: ts.Node | undefined;
function findHandler(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "app.get"
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/api/patient-overview") {
    assert.equal(node.arguments[1].getText(source), "requireAuth");
    handlerNode = node.arguments[node.arguments.length - 1];
  }
  ts.forEachChild(node, findHandler);
}
findHandler(source);
assert.ok(handlerNode);
const handlerCode = ts.transpileModule(`const handler = ${handlerNode.getText(source)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function request(search: unknown, user: object | undefined = viewer("admin"), failure = false) {
  let searches = 0;
  const context = vm.createContext({
    storage: { getUser: async () => user }, patientSearchTokens, buildPatientOverview,
    searchPatientRecords: async () => { searches++; if (failure) throw new Error("database failure"); return fixture(); },
    console: { error: () => {} },
  });
  vm.runInContext(handlerCode, context);
  let status = 200;
  let body: any;
  const res = { status(code: number) { status = code; return this; }, json(data: unknown) { body = data; return this; } };
  await vm.runInContext("handler", context)({ session: { userId: 7 }, query: { search } }, res);
  return { status, body, searches };
}

test("route validates blank, wildcard-only, short, oversized, and non-string searches without querying", async () => {
  for (const query of ["", "A", "  %___  ", "X".repeat(101), ["Example", "Patient"]]) {
    const result = await request(query);
    assert.equal(result.status, 400);
    assert.equal(result.searches, 0);
  }
});

test("route works for all eight roles and returns full patient matches", async () => {
  for (const role of ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"] as const) {
    const result = await request("Example Patient", viewer(role));
    assert.equal(result.status, 200);
    assert.equal(result.body.totals.grandTotal.count, 15);
  }
});

test("deleted/inactive users cannot search, and failed queries surface an explicit error", async () => {
  const missing = await request("Example", null as unknown as undefined);
  assert.equal(missing.status, 401);
  assert.equal(missing.searches, 0);
  const inactive = await request("Example", { ...viewer("admin"), active: false });
  assert.equal(inactive.status, 401);
  assert.equal(inactive.searches, 0);
  const failed = await request("Example", viewer("admin"), true);
  assert.equal(failed.status, 500);
  assert.ok(failed.body.message.includes("Unable to search"));
});
