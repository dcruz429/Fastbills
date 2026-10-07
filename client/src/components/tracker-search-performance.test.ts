import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PaginatedTrackerTable } from "./paginated-tracker-table";
import { DebouncedSearchInput } from "./debounced-search-input";

test("the real table component renders a bounded table and accessible navigation for 10,000 records", () => {
  const rows = Array.from({ length: 10_000 }, (_, id) => ({ id }));
  let rendered = 0;
  const html = renderToStaticMarkup(createElement(PaginatedTrackerTable<{ id: number }>, {
    rows, label: "Open Collections",
    children: visible => createElement("table", null, createElement("tbody", null, visible.map(row => {
      rendered++;
      return createElement("tr", { key: row.id }, createElement("td", null, row.id));
    }))),
  }));
  assert.equal(rendered, 50);
  assert.equal(html.match(/<tr>/g)?.length, 50);
  assert.ok(html.includes("Showing 1–50 of 10,000 records"));
  assert.ok(html.includes('aria-label="Open Collections pagination"'));
  assert.ok(html.includes("Page 1 of 200"));
  assert.ok(html.includes("Next"));
});

test("short result sets retain their rows without unnecessary pagination controls", () => {
  const html = renderToStaticMarkup(createElement(PaginatedTrackerTable<{ id: number }>, {
    rows: [{ id: 1 }], label: "Done",
    children: visible => createElement("span", null, visible[0].id),
  }));
  assert.ok(html.includes("<span>1</span>"));
  assert.ok(!html.includes("Next"));
});

test("the real search field retains its accessible label, starting value and test identifier", () => {
  const html = renderToStaticMarkup(createElement(DebouncedSearchInput, {
    value: "Smith", onValueChange: () => {}, placeholder: "Search patients",
    "data-testid": "input-search",
  } as Parameters<typeof DebouncedSearchInput>[0]));
  assert.ok(html.includes('value="Smith"'));
  assert.ok(html.includes('aria-label="Search patients"'));
  assert.ok(html.includes('data-testid="input-search"'));
});

for (const page of ["collections", "denials", "arbitration", "posting", "checks", "closed", "verification", "board"]) {
  test(`${page} isolates typing and paginates every primary record table without slicing its filters or totals`, () => {
    const text = readFileSync(new URL(`../pages/${page}.tsx`, import.meta.url), "utf8");
    const source = ts.createSourceFile(`${page}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.equal(source.parseDiagnostics.length, 0);
    let searchInputs = 0;
    let primaryMaps = 0;
    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "DebouncedSearchInput") {
        searchInputs++;
        assert.ok(node.attributes.getText(source).includes("onValueChange="));
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "map"
        && ["visibleRows", "activeRecords", "doneSorted", "activeSorted", "bucketTasks", "sectionItems"].includes(node.expression.expression.getText(source))) {
        let ancestor: ts.Node | undefined = node;
        let body = false;
        while (ancestor) {
          if (ts.isJsxElement(ancestor) && ["TableBody", "tbody"].includes(ancestor.openingElement.tagName.getText(source))) body = true;
          if (ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === "PaginatedTrackerTable") break;
          ancestor = ancestor.parent;
        }
        if (body) {
          primaryMaps++;
          assert.equal(node.expression.expression.getText(source), "visibleRows");
          assert.ok(ancestor, "each rendered record map must be bounded by the shared paginator");
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(searchInputs, 1);
    assert.equal(primaryMaps, ["board", "closed"].includes(page) ? 1 : 2);
    if (!["board", "verification"].includes(page)) {
      assert.ok(text.includes("<TrackerAmountSummary"));
      assert.ok(!text.includes("openRecords={visibleRows}"));
    }
  });
}
