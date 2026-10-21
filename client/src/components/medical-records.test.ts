import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { emptyMedicalRecord, medicalRecordFields } from "../../../shared/medical-records";

const source = readFileSync(new URL("../pages/medical-records-request.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(`${source}\nexports.safeCsv = safeCsv;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

const records = Array.from({ length: 120 }, (_, index) => ({
  ...emptyMedicalRecord(index % 2 ? 2 : 1, "10/21/2026", "Synthetic Staff"),
  id: index + 1, patientName: `Synthetic Patient ${index + 1}`,
  notes: index === 99 ? "Far-page exact match" : "Synthetic note",
  contactDetails: index === 99 ? "=FORMULA" : "Synthetic office",
  status: index % 2 ? "sent" : "pending",
  sourceKey: `synthetic:${index + 1}`, sourceSheet: index % 2 ? "GC " : "HW", sourceRow: index + 3,
}));

function fixture({ role = "admin", states = {} as Record<number, unknown>, query = {} as Record<string, unknown> } = {}) {
  const exports: any = {};
  const requireReal = createRequire(import.meta.url);
  const mutations: any[] = [];
  const requests: any[] = [];
  const controls = new Map<string, any>();
  const editor: any[] = [];
  const downloads: any[] = [];
  const stateChanges: { index: number; value: any }[] = [];
  let stateIndex = 0;
  runInNewContext(code, {
    exports, Date,
    Blob: class { constructor(parts: unknown) { downloads.push(parts); } },
    URL: { createObjectURL: () => "blob:synthetic", revokeObjectURL: () => {} },
    document: { createElement: () => ({ click() {}, href: "", download: "" }) },
    require(name: string) {
      if (name === "react") return {
        ...requireReal("react"),
        useState(initial: unknown) {
          const index = stateIndex++;
          let current = Object.hasOwn(states, index) ? states[index] : initial;
          return [current, (update: any) => {
            current = typeof update === "function" ? update(current) : update;
            stateChanges.push({ index, value: current });
          }];
        },
      };
      if (name === "@/lib/auth") return { useAuth: () => ({ user: { id: 1, role, fullName: "Synthetic Staff" } }) };
      if (name === "@/components/medical-records/request-editor") return { MedicalRequestEditor: (props: any) => { editor.push(props); return null; } };
      if (name === "@/components/ui/button") return {
        Button: ({ children, variant: _variant, size: _size, ...props }: any) => {
          if (props["data-testid"]) controls.set(props["data-testid"], props);
          return createElement("button", props, children);
        },
      };
      if (name === "@/lib/queryClient") return {
        apiRequest: async (...args: unknown[]) => { requests.push(args); return { json: async () => ({ ok: true }) }; },
        queryClient: { invalidateQueries: () => {} },
      };
      if (name === "@tanstack/react-query") return {
        useQuery: () => ({
          data: { requests: records, contacts: [], tabs: [{ id: 1, name: "HW", sortOrder: 0 }, { id: 2, name: "GC", sortOrder: 1 }, { id: 3, name: "No Foud", sortOrder: 13 }], importSummary: { requestCount: 1180, importedAt: "2026-10-21T12:00:00Z" } },
          isLoading: false, isError: false, refetch: () => {}, ...query,
        }),
        useMutation: (options: any) => { mutations.push(options); return { isPending: false, reset: () => {}, mutate: () => {} }; },
      };
      return requireReal(name);
    },
  });
  const html = renderToStaticMarkup(createElement(exports.default));
  return { html, mutations, requests, controls, editor, downloads, stateChanges, safeCsv: exports.safeCsv };
}

test("medical tracker renders all workbook columns and matching cells in order while limiting display to 50 records", () => {
  const { html } = fixture();
  assert.ok(html.includes("Medical Records Request"));
  assert.equal((html.match(/data-testid="row-medical-\d+"/g) || []).length, 50);
  assert.ok(html.includes("50 of 120 matching requests"));
  assert.ok(html.includes("Workbook import: 1180 source rows"));
  const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
  const labels = medicalRecordFields.map(({ label }) => label.replace(/'/g, "&#x27;"));
  let previous = -1;
  for (const label of labels) {
    const position = header.indexOf(label);
    assert.ok(position > previous, `workbook header order: ${label}`);
    previous = position;
  }
  const row = html.slice(html.indexOf('data-testid="row-medical-1"'), html.indexOf('data-testid="row-medical-2"'));
  assert.ok(row.indexOf("10/21/2026") < row.indexOf("Synthetic Staff"));
  assert.ok(row.indexOf("Synthetic Staff") < row.indexOf("Synthetic Patient 1"));
  assert.ok(row.indexOf("Synthetic Patient 1") < row.indexOf("Synthetic office"));
});

test("Not Found replaces the legacy workbook tab label in tabs, the editor and exports without changing its ID", () => {
  const f = fixture({
    query: { data: {
      tabs: [{ id: 3, name: "No Foud", sortOrder: 13 }],
      requests: [{ ...records[0], tabId: 3, sourceSheet: "No Foud" }],
      contacts: [], importSummary: null,
    } },
  });
  assert.ok(f.html.includes('data-testid="tab-medical-not-found"'));
  assert.ok(!f.html.includes('data-testid="tab-medical-no-foud"'));
  assert.equal(f.editor[0].tabs[0].name, "Not Found");
  assert.equal(f.editor[0].tabs[0].id, 3);
  f.controls.get("button-export-medical-csv").onClick();
  const csv = f.downloads[0][0] as string;
  assert.ok(csv.includes('"Not Found","No Foud"'));
});

test("full-data search finds a record beyond the rendered first page and exports all filtered matches", () => {
  const f = fixture({ states: { 2: "Far-page exact match" } });
  assert.ok(f.html.includes('data-testid="row-medical-100"'));
  assert.equal((f.html.match(/data-testid="row-medical-\d+"/g) || []).length, 1);
  f.controls.get("button-export-medical-csv").onClick();
  const csv = f.downloads[0][0] as string;
  assert.ok(csv.includes("Synthetic Patient 100"));
  assert.ok(csv.includes("'=FORMULA"));
  const all = fixture();
  all.controls.get("button-export-medical-csv").onClick();
  assert.equal((all.downloads[0][0] as string).split("\r\n").length, 121);
});

test("tab/status filters apply together and pagination clamps when the result set shrinks", () => {
  const filtered = fixture({ states: { 0: "2", 1: "sent", 3: 99 } });
  assert.ok(filtered.html.includes("60 matching requests"));
  assert.equal((filtered.html.match(/data-testid="row-medical-\d+"/g) || []).length, 10);
  assert.ok(filtered.html.includes("Page 2 of 2"));
  assert.equal(filtered.editor[0].initialTabId, 2);
  const none = fixture({ states: { 0: "2", 1: "pending" } });
  assert.ok(none.html.includes("state-medical-no-results"));
});

test("staff can create/edit while delete controls remain admin-only", () => {
  const admin = fixture();
  assert.ok(admin.html.includes("button-delete-medical-1"));
  for (const role of ["manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"]) {
    const staff = fixture({ role });
    assert.ok(staff.html.includes("button-create-medical-request"));
    assert.ok(staff.html.includes("button-edit-medical-1"));
    assert.ok(!staff.html.includes("button-delete-medical"));
  }
});

test("loading/errors/empty results are distinct and creation waits for clinic tabs", () => {
  const loading = fixture({ query: { data: undefined, isLoading: true } });
  assert.ok(loading.html.includes("state-medical-loading"));
  assert.equal(loading.controls.get("button-create-medical-request").disabled, true);
  const failed = fixture({ query: { data: undefined, isError: true } });
  assert.ok(failed.html.includes("state-medical-error"));
  assert.ok(failed.html.includes("button-retry-medical"));
  const empty = fixture({ query: { data: { tabs: [], requests: [], contacts: [], importSummary: null } } });
  assert.ok(empty.html.includes("state-medical-empty"));
});

test("create/edit/delete handlers call the real API paths with editable data", async () => {
  const f = fixture();
  const draft = { ...emptyMedicalRecord(1, "10/21/2026", "Staff"), patientName: "Synthetic patient" };
  await f.mutations[0].mutationFn(draft);
  await f.mutations[1].mutationFn({ id: 10, data: draft });
  await f.mutations[2].mutationFn(10);
  assert.deepEqual(f.requests.map(request => request.slice(0, 2)), [
    ["POST", "/api/medical-records"], ["PATCH", "/api/medical-records/10"], ["DELETE", "/api/medical-records/10"],
  ]);
  assert.equal(f.requests[0][2], draft);
  assert.equal(f.requests[1][2], draft);
});

test("CSV escapes quotes, line breaks and spreadsheet formulas", () => {
  const { safeCsv } = fixture();
  assert.equal(safeCsv('A "quoted"\nvalue'), '"A ""quoted""\nvalue"');
  for (const value of ["=1+1", "+SUM(A1)", "-1+2", "@formula", " \t=unsafe"]) assert.ok(safeCsv(value).startsWith("\"'"));
});

test("every data column and status has a sort control that toggles direction and resets pagination", () => {
  const f = fixture({ states: { 3: 2 } });
  for (const key of [...medicalRecordFields.map(field => field.key), "status"]) {
    assert.ok(f.controls.has(`button-sort-medical-${key}`), key);
  }
  const button = f.controls.get("button-sort-medical-patientName");
  button.onClick();
  button.onClick();
  assert.deepEqual(f.stateChanges.filter(change => change.index === 7).map(change => `${change.value.key}:${change.value.direction}`),
    ["patientName:asc", "patientName:desc"]);
  assert.deepEqual(f.stateChanges.filter(change => change.index === 3).map(change => change.value), [0, 0]);
});

test("sorting applies to all filtered records before pagination and CSV keeps the selected sort order", () => {
  const f = fixture({ states: { 7: { key: "patientName", direction: "desc" } } });
  const ids = Array.from(f.html.matchAll(/data-testid="row-medical-(\d+)"/g), match => Number(match[1]));
  assert.equal(ids.length, 50);
  assert.equal(ids[0], 120);
  assert.equal(ids[49], 71);
  assert.ok(f.html.includes('aria-sort="descending"'));
  assert.equal(f.controls.get("button-sort-medical-patientName")["aria-label"], "Sort by Patient's Name, ascending");
  f.controls.get("button-export-medical-csv").onClick();
  const csv = f.downloads[0][0] as string;
  assert.equal(csv.split("\r\n").length, 121);
  assert.ok(csv.indexOf('"Synthetic Patient 120"') < csv.indexOf('"Synthetic Patient 119"'));
  assert.ok(csv.indexOf('"Synthetic Patient 119"') < csv.indexOf('"Synthetic Patient 1"'));
});
