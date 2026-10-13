import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";

for (const page of ["collections", "denials", "arbitration"]) {
  test(`${page} places PAID immediately after Amount in both headers and record rows`, () => {
    const text = readFileSync(new URL(`../pages/${page}.tsx`, import.meta.url), "utf8");
    const source = ts.createSourceFile(`${page}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let headers = 0;
    let recordRows = 0;
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "TableHeader"
        && node.getText(source).includes("PAID")) {
        headers++;
        // Render the actual header JSX in isolation; no sign-in or tracker data
        // is required to verify its generated column order for either role.
        const code = ts.transpileModule(`export default function Header() { return (${node.getText(source)}); }`, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
        }).outputText;
        for (const editable of [false, true]) {
          const exports: { default?: () => ReturnType<typeof createElement> } = {};
          runInNewContext(code, {
            exports, require: createRequire(import.meta.url), Fragment, TableHead, TableHeader, TableRow,
            SortIcon: () => null, DoneSortIcon: () => null, renderSortIcon: () => null, Checkbox: () => null,
            handleSort: () => {}, toggleDoneSort: () => {},
            canBulkEdit: editable, canDelete: editable,
            activeRecords: [], selectedIds: new Set(), setSelectedIds: () => {},
          });
          const html = renderToStaticMarkup(createElement(exports.default!));
          const labels = [...html.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/gs)]
            .map(match => match[1].replace(/<[^>]+>/g, "").trim());
          assert.equal(labels.filter(label => label === "PAID").length, 1);
          assert.equal(labels[labels.indexOf("Amount") + 1], "PAID");
          if (page === "arbitration") {
            assert.equal(labels.filter(label => label === "Filed Date").length, 1);
            assert.equal(labels[labels.indexOf("Filed To") + 1], "Filed Date");
          }
        }
      }
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "TableRow") {
        const cells = node.children.filter((child): child is ts.JsxElement =>
          ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === "TableCell");
        const paidIndex = cells.findIndex(cell => cell.getText(source).includes("<PaidStatusCell "));
        if (paidIndex >= 0) {
          recordRows++;
          assert.ok(paidIndex > 0);
          assert.ok(cells[paidIndex - 1].getText(source).includes("d.amount ?"));
          if (page === "arbitration") {
            const filedIndex = cells.findIndex(cell => cell.getText(source).includes("formatDate(d.filedDate)"));
            assert.ok(filedIndex > 0);
            assert.ok(cells[filedIndex - 1].getText(source).includes("d.filedTo"));
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(headers, 2);
    assert.equal(recordRows, 2);
  });
}

test("Posting has no PAID controls, indicators or form writes, while retaining Amount and bulk selection", () => {
  const text = readFileSync(new URL("../pages/posting.tsx", import.meta.url), "utf8");
  assert.ok(!/\bpaid\b|\bPAID\b|PaidStatus|paidMutation/.test(text));
  assert.ok(text.includes('handleSort("amount")'));
  assert.ok(text.includes('checkbox-select-all-postings'));
  assert.ok(text.includes('input-posting-amount'));
  assert.ok(text.includes('colSpan={(canDelete ? 13 : 12) + (canBulkEdit ? 1 : 0)}'));
});

test("Arbitration Filed Date is editable, clearable, reloadable, sortable, filterable and CSV-importable", () => {
  const text = readFileSync(new URL("../pages/arbitration.tsx", import.meta.url), "utf8");
  assert.ok(text.includes('filedDate: ""'));
  assert.ok(text.includes('filedDate: toInputDate(arb.filedDate)'));
  assert.ok(text.includes('type="date" value={form.filedDate}'));
  assert.ok(text.includes('filedDate: e.target.value'));
  assert.ok(text.includes('data-testid="input-arb-filed-date"'));
  assert.ok(text.includes('value="filedDate">Filed Date'));
  assert.ok(text.includes('"filed date": "filedDate"'));
  assert.ok(text.includes('{ value: "filedDate", label: "Filed Date", type: "date" }'));
  assert.match(text, /const dateColumns = new Set\([^\n]*"filedDate"/);
  assert.match(text, /const _doneDateCols = new Set\([^\n]*"filedDate"/);
});
