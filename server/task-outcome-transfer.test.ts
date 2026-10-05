import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { OUTCOME_OPTIONS, type Task } from "../shared/schema";

// Run the real route and transfer helper with isolated storage, without opening
// a database connection or changing records in the running app.
const source = ts.createSourceFile(
  "routes.ts",
  readFileSync(new URL("./routes.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const transfer = source.statements.find(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === "handleOutcomeTransfer",
);
let patchHandler: ts.Node | undefined;
function findHandler(node: ts.Node) {
  if (ts.isCallExpression(node)
    && node.expression.getText(source) === "app.patch"
    && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === "/api/tasks/:id") {
    patchHandler = node.arguments[node.arguments.length - 1];
  }
  ts.forEachChild(node, findHandler);
}
findHandler(source);
assert.ok(transfer && patchHandler, "task route and transfer helper must exist");
const handlerCode = ts.transpileModule(
  `${transfer.getText(source)}\nconst patchTask = ${patchHandler.getText(source)};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

async function saveTask(updates: Record<string, unknown>, existingOverrides: Record<string, unknown> = {}) {
  const existing = {
    id: 10, patientName: "Test Patient", chartNumber: "TEST-1",
    clinicId: 1, insuranceId: 2, assignedUserId: null,
    status: "assigned", bucket: "for_verification", priority: "low",
    ieDate: new Date("2026-09-01T16:00:00Z"),
    dueDate: new Date("2026-10-01T16:00:00Z"),
    notes: "Original notes", doa: null, resolutionDate: null,
    outcome: null, rtp: false,
    ...existingOverrides,
  };
  const created: Partial<Task>[] = [];
  const activity: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];
  const history = [{ field: "status", oldValue: "unassigned", newValue: "assigned", action: "Task updated", timestamp: new Date() }];
  const storage = {
    getTask: async () => existing,
    getUser: async () => ({ id: 7, role: "admin", fullName: "Test Admin" }),
    getAllClinics: async () => [{ id: 1, name: "Original Clinic" }, { id: 3, name: "New Clinic" }],
    getAllInsurances: async () => [{ id: 2, name: "Original Insurance" }, { id: 4, name: "New Insurance" }],
    getAllUsers: async () => [{ id: 7, role: "admin", fullName: "Test Admin", active: true }],
    getTaskActivity: async () => history,
    createTask: async (data: Partial<Task>) => {
      const task = { ...data, id: 20 };
      created.push(task);
      return task;
    },
    createTaskActivity: async (data: Record<string, unknown>) => { activity.push(data); },
    createNotification: async (data: Record<string, unknown>) => { notifications.push(data); },
    updateTask: async (_id: number, data: Record<string, unknown>) => ({ ...existing, ...data }),
  };
  const context = vm.createContext({
    storage, OUTCOME_OPTIONS,
    ADMIN_ROLES: ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"],
  });
  vm.runInContext(handlerCode, context);
  const handler = vm.runInContext("patchTask", context);
  let status = 200;
  let response: any;
  const res = {
    status(code: number) { status = code; return this; },
    json(body: unknown) { response = body; return this; },
  };
  await handler({ params: { id: "10" }, body: updates, session: { userId: 7 } }, res);
  assert.equal(status, 200, response?.message);
  return { created, activity, notifications, response, existing };
}

test("Send to Billing preserves already-saved insurance and exact due date", async () => {
  const { created, existing, response, activity, notifications } = await saveTask({ outcome: "Send to Billing" });
  assert.equal(created.length, 1);
  assert.equal(created[0].insuranceId, 2);
  assert.equal(created[0].dueDate?.getTime(), existing.dueDate.getTime());
  assert.equal(created[0].bucket, "ready_for_billing");
  assert.equal(created[0].status, "unassigned");
  assert.equal(response.status, "done");
  assert.ok(activity.some(entry => entry.taskId === 20 && entry.field === "source"));
  assert.ok(activity.some(entry => entry.taskId === 20 && entry.oldValue === "unassigned"));
  assert.ok(notifications.some(entry => entry.taskId === 20));
});

test("insurance edited together with Send to Billing is transferred", async () => {
  const { created, response } = await saveTask({ insuranceId: 4, outcome: "Send to Billing" });
  assert.equal(created[0].insuranceId, 4);
  assert.equal(response.insuranceId, 4);
});

test("IE date edited in the same save transfers the new calculated due date", async () => {
  const { created, response } = await saveTask({ ieDate: "2026-10-05", outcome: "Send to Billing" });
  assert.equal(created[0].ieDate?.getTime(), response.ieDate.getTime());
  assert.equal(created[0].dueDate?.getTime(), response.dueDate.getTime());
  const expected = new Date("2026-10-05T12:00:00");
  expected.setDate(expected.getDate() + 30);
  assert.equal(created[0].dueDate?.getTime(), expected.getTime());
});

test("clearing insurance and IE date does not restore stale values during transfer", async () => {
  const { created, response } = await saveTask({ insuranceId: null, ieDate: null, outcome: "Send to Billing" });
  assert.equal(created[0].insuranceId, null);
  assert.equal(created[0].ieDate, null);
  assert.equal(created[0].dueDate, null);
  assert.equal(response.insuranceId, null);
  assert.equal(response.dueDate, null);
});

test("other same-save edits use the effective task instead of the old snapshot", async () => {
  const { created } = await saveTask({
    patientName: "Updated Test Patient", chartNumber: "TEST-2",
    clinicId: 3, notes: "Updated notes", outcome: "Send to Billing",
  });
  assert.equal(created[0].patientName, "Updated Test Patient");
  assert.equal(created[0].chartNumber, "TEST-2");
  assert.equal(created[0].clinicId, 3);
  assert.ok(created[0].notes?.endsWith("Updated notes"));
});

test("missing insurance and due date transfer as null", async () => {
  const { created } = await saveTask({ outcome: "Send to Billing" }, { insuranceId: null, ieDate: null, dueDate: null });
  assert.equal(created[0].insuranceId, null);
  assert.equal(created[0].dueDate, null);
});

test("saving an unchanged outcome does not create a duplicate billing task", async () => {
  const { created } = await saveTask({ insuranceId: 4, outcome: "Send to Billing" }, { outcome: "Send to Billing" });
  assert.equal(created.length, 0);
});

test("saving without a transfer outcome does not create a billing task", async () => {
  const { created, response } = await saveTask({ insuranceId: 4 });
  assert.equal(created.length, 0);
  assert.equal(response.insuranceId, 4);
  assert.equal(response.status, "assigned");
});
