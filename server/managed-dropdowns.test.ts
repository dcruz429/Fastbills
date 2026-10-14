import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DROPDOWN_CATEGORIES, MANAGED_TYPE_DROPDOWN_DEFAULTS, dropdownOptions, dropdownCategoryInitializations } from "../shared/schema";
import { dropdownValues, withStoredDropdownValues, moduleTypeLabel } from "../client/src/lib/managed-dropdowns";

const routes = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const handlers = new Map<string, ts.Node>();
function inspect(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(routes) === "app" && ts.isStringLiteral(node.arguments[0])) {
    const path = node.arguments[0].text;
    if (path.startsWith("/api/dropdown-options")) handlers.set(`${node.expression.name.text}:${path}`, node.arguments[node.arguments.length - 1]);
  }
  ts.forEachChild(node, inspect);
}
inspect(routes);

test("both categories support real settings add, rename, read and delete actions with existing role restrictions", async () => {
  const rows: any[] = [];
  let nextId = 1;
  const storage = {
    getUser: async (id: number) => ({ role: id === 1 ? "admin" : "verifier" }),
    getAllDropdownOptions: async () => rows,
    getDropdownOptionsByCategory: async (category: string) => rows.filter(row => row.category === category),
    createDropdownOption: async (row: any) => { const saved = { ...row, id: nextId++ }; rows.push(saved); return saved; },
    updateDropdownOption: async (id: number, data: any) => { const row = rows.find(row => row.id === id); Object.assign(row, data); return row; },
    deleteDropdownOption: async (id: number) => { rows.splice(rows.findIndex(row => row.id === id), 1); },
  };
  async function invoke(key: string, body = {}, params = {}, userId = 1) {
    const node = handlers.get(key);
    assert.ok(node, key);
    const code = ts.transpileModule(`(${node.getText(routes)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const handler = runInNewContext(code, { storage, DROPDOWN_CATEGORIES });
    const result = { status: 200, body: undefined as any };
    const res = { status(status: number) { result.status = status; return res; }, json(body: any) { result.body = body; return res; } };
    await handler({ body, params, session: { userId } }, res);
    return result;
  }
  for (const category of ["posting_document_type", "guideline_module_type"]) {
    assert.ok(DROPDOWN_CATEGORIES.some(option => option.key === category));
    const created = await invoke("post:/api/dropdown-options", { category, value: " Custom type " });
    assert.equal(created.status, 200);
    assert.equal(created.body.value, "Custom type");
    const id = String(created.body.id);
    assert.equal((await invoke("patch:/api/dropdown-options/:id", { value: "Renamed type" }, { id })).status, 200);
    const read = await invoke("get:/api/dropdown-options/:category", {}, { category });
    assert.equal(read.body[0].value, "Renamed type");
    assert.equal((await invoke("post:/api/dropdown-options", { category, value: "Unapproved" }, {}, 2)).status, 403);
    assert.equal((await invoke("patch:/api/dropdown-options/:id", { value: "Unapproved" }, { id }, 2)).status, 403);
    assert.equal((await invoke("delete:/api/dropdown-options/:id", {}, { id }, 2)).status, 403);
    for (const value of ["   ", "x".repeat(201)]) {
      assert.equal((await invoke("post:/api/dropdown-options", { category, value })).status, 400);
      assert.equal((await invoke("patch:/api/dropdown-options/:id", { value }, { id })).status, 400);
    }
    assert.equal((await invoke("delete:/api/dropdown-options/:id", {}, { id })).status, 200);
    assert.equal((await invoke("get:/api/dropdown-options/:category", {}, { category })).body.length, 0);
  }
});

test("managed defaults seed once, preserve configured lists, and never return after the last option is deleted", async () => {
  const source = ts.createSourceFile("seed.ts", readFileSync(new URL("./seed.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "seedManagedTypeDropdownOptions");
  assert.ok(declaration);
  const initialized = new Set<string>();
  const rows: any[] = [{ category: "guideline_module_type", value: "Previously configured" }];
  const tx = {
    insert(table: unknown) {
      return {
        values(values: any) {
          if (table === dropdownCategoryInitializations) return {
            onConflictDoNothing: () => ({
              returning: async () => {
                if (initialized.has(values.category)) return [];
                initialized.add(values.category);
                return [values];
              },
            }),
          };
          rows.push(...values);
          return Promise.resolve();
        },
      };
    },
    select: () => ({ from: () => ({ where: (category: string) => ({ limit: async () => rows.filter(row => row.category === category).slice(0, 1) }) }) }),
  };
  const code = ts.transpileModule(`(${declaration.getText(source).replace("export ", "")})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const seed = runInNewContext(code, {
    db: { transaction: async (callback: any) => callback(tx) },
    MANAGED_TYPE_DROPDOWN_DEFAULTS, dropdownOptions, dropdownCategoryInitializations,
    eq: (_column: unknown, category: string) => category,
  });
  await seed();
  assert.equal(rows.filter(row => row.category === "posting_document_type").length, 5);
  assert.equal(rows.filter(row => row.category === "guideline_module_type").length, 1);
  assert.equal(rows.find(row => row.category === "guideline_module_type").value, "Previously configured");
  rows.splice(0);
  await seed();
  assert.equal(rows.length, 0);
  assert.equal(initialized.size, 2);
});

test("historical and custom values remain readable without recreating retired options", () => {
  const values = dropdownValues([{ value: "Custom" }, { value: "Custom" }]);
  assert.deepEqual(values, ["Custom"]);
  assert.deepEqual(withStoredDropdownValues(values, ["Old type", null, "Custom"]), ["Custom", "Old type"]);
  assert.deepEqual(values, ["Custom"]);
  assert.equal(moduleTypeLabel("guideline"), "Guideline");
  assert.equal(moduleTypeLabel("training"), "Training");
  assert.equal(moduleTypeLabel("Billing policy"), "Billing policy");
});

test("posting filter, create/edit and bulk editing use managed options and settings share their cache keys", () => {
  const posting = readFileSync(new URL("../client/src/pages/posting.tsx", import.meta.url), "utf8");
  assert.ok(posting.includes('useManagedDropdown("posting_document_type")'));
  assert.ok(posting.includes('options: documentTypeOptions'));
  assert.ok(posting.includes("documentTypeFilterOptions.map"));
  assert.ok(posting.includes("documentTypeEditorOptions.map"));
  assert.ok(!posting.includes("POSTING_DOCUMENT_TYPES"));
  assert.ok(posting.includes('d.documentType !== filterDocumentType.slice(5)'));
  const hook = readFileSync(new URL("../client/src/hooks/use-managed-dropdown.ts", import.meta.url), "utf8");
  assert.ok(hook.includes('queryKey: ["/api/dropdown-options", category]'));
  assert.ok(hook.includes("refetchOnWindowFocus: true"));
  const settings = readFileSync(new URL("../client/src/pages/settings.tsx", import.meta.url), "utf8");
  assert.ok(settings.includes('invalidateQueries({ queryKey: ["/api/dropdown-options", selectedCategory] })'));
});

test("Manage Dropdown Options sorts categories by displayed label without changing the shared category list", () => {
  const settings = readFileSync(new URL("../client/src/pages/settings.tsx", import.meta.url), "utf8");
  const expression = settings.match(/DROPDOWN_CATEGORIES\.slice\(\)\.sort\(\(a, b\) => a\.label\.localeCompare\(b\.label\)\)/)?.[0];
  assert.ok(expression);
  const originalKeys = DROPDOWN_CATEGORIES.map(category => category.key);
  const sorted = runInNewContext(expression, { DROPDOWN_CATEGORIES }) as typeof DROPDOWN_CATEGORIES;
  const labels = Array.from(sorted, category => category.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(DROPDOWN_CATEGORIES.map(category => category.key), originalKeys);
});
