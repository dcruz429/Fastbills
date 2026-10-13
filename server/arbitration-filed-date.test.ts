import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { insertArbitrationSchema } from "../shared/schema";
import { isPaidOnlyUpdate } from "./paid-flag";

// Exercise the actual handlers without creating fixture patients in the database
// or changing the application's authentication.
const source = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const handlers = new Map<string, string>();
const definitions: string[] = [];
function inspect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "autoAssignStatus") definitions.push(node.getText(source));
  if (ts.isVariableDeclaration(node) && ["ADMIN_ROLES", "arbFieldLabels", "arbTrackFields"].includes(node.name.getText(source))) {
    definitions.push(`const ${node.getText(source)};`);
  }
  if (ts.isCallExpression(node) && ["app.post", "app.patch", "app.get"].includes(node.expression.getText(source))
    && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && ["/api/arbitrations", "/api/arbitrations/:id", "/api/arbitrations/bulk-update", "/api/arbitrations/import-csv"].includes(node.arguments[0].text)) {
    assert.equal(node.arguments[1].getText(source), "requireAuth");
    handlers.set(`${node.expression.getText(source)}:${node.arguments[0].text}`, node.arguments.at(-1)!.getText(source));
  }
  ts.forEachChild(node, inspect);
}
inspect(source);

function fixture(initial: Record<string, unknown> = {}, role = "admin") {
  let record: any = { id: 12, patientName: "Test Record", status: "Unassigned", filedDate: null, ...initial };
  const activity: any[] = [];
  let writes = 0;
  const storage = {
    getUser: async () => ({ role }),
    getArbitration: async () => record,
    getAllArbitrations: async () => [record],
    createArbitration: async (data: any) => { writes++; return record = { ...record, ...data }; },
    updateArbitration: async (_id: number, data: any) => { writes++; return record = { ...record, ...data }; },
    createArbitrationActivity: async (data: any) => { activity.push(data); },
  };
  const context = { storage, Date, isPaidOnlyUpdate, OUTCOME_OPTIONS: [], getAssigneeUserId: async () => null };
  const compile = (code: string) => ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return {
    get record() { return record; },
    get writes() { return writes; },
    activity,
    async call(method: string, path: string, body: any = {}) {
      const code = handlers.get(`app.${method}:${path}`);
      assert.ok(code, `${method} ${path} handler exists`);
      const handler = runInNewContext(`(() => { ${compile(definitions.join("\n"))}\nreturn (${compile(`const handler = ${code}`).replace(/^const handler = /, "").replace(/;\s*$/, "")}); })()`, context);
      let status = 200;
      let result: any;
      const response = { status(value: number) { status = value; return this; }, json(value: any) { result = value; return this; } };
      await handler({ body, params: { id: "12" }, query: {}, session: { userId: 1 } }, response);
      return { status, result };
    },
  };
}

test("Filed Date is an optional nullable stored Arbitration field", () => {
  assert.ok(insertArbitrationSchema.safeParse({ patientName: "Test Record" }).success);
  assert.ok(insertArbitrationSchema.safeParse({ patientName: "Test Record", filedDate: null }).success);
  assert.ok(insertArbitrationSchema.safeParse({ patientName: "Test Record", filedDate: new Date("2026-10-13") }).success);
});

test("create saves Filed Date at UTC midnight and GET returns the saved value", async () => {
  const f = fixture();
  const created = await f.call("post", "/api/arbitrations", { patientName: "Test Record", filedDate: "2026-10-13" });
  assert.equal(created.status, 200);
  assert.equal(f.record.filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
  const loaded = await f.call("get", "/api/arbitrations");
  assert.equal(loaded.result[0].filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
});

test("edits and clears save Filed Date and log calendar-date changes", async () => {
  const f = fixture({ filedDate: new Date("2026-10-12") });
  assert.equal((await f.call("patch", "/api/arbitrations/:id", { filedDate: "2026-10-13" })).status, 200);
  assert.equal(f.record.filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.deepEqual(f.activity.filter(a => a.field === "filedDate").map(a => [a.action, a.oldValue, a.newValue]),
    [["Updated Filed Date", "2026-10-12", "2026-10-13"]]);
  await f.call("patch", "/api/arbitrations/:id", { filedDate: "" });
  assert.equal(f.record.filedDate, null);
  assert.equal(f.activity.at(-1).newValue, null);
});

test("unrelated edits preserve Filed Date and unchanged dates do not create duplicate history", async () => {
  const f = fixture({ filedDate: new Date("2026-10-13") });
  await f.call("patch", "/api/arbitrations/:id", { comment: "Updated note" });
  await f.call("patch", "/api/arbitrations/:id", { filedDate: "2026-10-13" });
  assert.equal(f.record.filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.equal(f.activity.filter(a => a.field === "filedDate").length, 0);
});

for (const method of ["post", "patch"]) {
  test(`${method} rejects invalid Filed Date before writing`, async () => {
    const f = fixture();
    const response = await f.call(method, method === "post" ? "/api/arbitrations" : "/api/arbitrations/:id", { filedDate: "not-a-date" });
    assert.equal(response.status, 400);
    assert.equal(f.writes, 0);
  });
}

test("bulk edits save and clear Filed Date using the existing permissions and activity history", async () => {
  const f = fixture();
  const updated = await f.call("post", "/api/arbitrations/bulk-update", { ids: [12], data: { filedDate: "2026-10-13" } });
  assert.equal(updated.status, 200, JSON.stringify(updated.result));
  assert.equal(updated.result.updated, 1);
  assert.equal(f.record.filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.ok(f.activity.some(a => a.field === "filedDate" && a.newValue === "2026-10-13"));
  await f.call("post", "/api/arbitrations/bulk-update", { ids: [12], data: { filedDate: "" } });
  assert.equal(f.record.filedDate, null);
  const readonly = fixture({}, "verifier");
  assert.equal((await readonly.call("post", "/api/arbitrations/bulk-update", { ids: [12], data: { filedDate: "2026-10-13" } })).status, 403);
  assert.equal(readonly.writes, 0);
});

test("CSV imports save Filed Date, preserve it when omitted, and allow explicit clearing", async () => {
  const f = fixture();
  const imported = await f.call("post", "/api/arbitrations/import-csv", { rows: [{ patientName: "Test Record", filedDate: "2026-10-13" }] });
  assert.equal(imported.result.updated, 1);
  assert.equal(f.record.filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
  await f.call("post", "/api/arbitrations/import-csv", { rows: [{ patientName: "Test Record", amount: "100" }] });
  assert.equal(f.record.filedDate.toISOString(), "2026-10-13T00:00:00.000Z");
  await f.call("post", "/api/arbitrations/import-csv", { rows: [{ patientName: "Test Record", filedDate: "" }] });
  assert.equal(f.record.filedDate, null);
});
