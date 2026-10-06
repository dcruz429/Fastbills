import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRightLeft } from "lucide-react";

const source = ts.createSourceFile("productivity.tsx", readFileSync(new URL("./productivity.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let tile: ts.JsxElement | undefined;
function inspect(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "data-testid"
    && attribute.initializer && ts.isStringLiteral(attribute.initializer)
    && attribute.initializer.text === "tile-total-transfers")) tile = node;
  ts.forEachChild(node, inspect);
}
inspect(source);
assert.ok(tile);
const compiled = ts.transpileModule(`const tile = ${tile.getText(source)};`, {
  fileName: "tile.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function renderTile(count: number, loading = false, error = false) {
  let selectedTab: string | undefined;
  const context = vm.createContext({
    require: createRequire(import.meta.url), exports: {}, ArrowRightLeft,
    filteredTransfers: Array.from({ length: count }),
    transfersLoading: loading, transfersError: error,
    setActiveTab: (value: string) => { selectedTab = value; },
  });
  vm.runInContext(compiled, context);
  const element = vm.runInContext("tile", context);
  return { html: renderToStaticMarkup(element), click: () => element.props.onClick(), selectedTab: () => selectedTab };
}

test("the actual Total Transfers tile renders the filtered count and opens the transfer log", () => {
  const tile = renderTile(7);
  assert.ok(tile.html.includes("Total Transfers"));
  assert.ok(tile.html.includes('data-testid="text-total-transfers">7</p>'));
  assert.ok(tile.html.includes('type="button"'));
  assert.ok(tile.html.includes("Open transfer log"));
  tile.click();
  assert.equal(tile.selectedTab(), "transfers");
});

test("zero transfers is displayed only after a successful empty result", () => {
  assert.ok(renderTile(0).html.includes('data-testid="text-total-transfers">0</p>'));
});

test("the tile does not present an unloaded query as zero transfers", () => {
  const { html } = renderTile(0, true);
  assert.ok(html.includes("loading"));
  assert.ok(!html.includes('data-testid="text-total-transfers">0</p>'));
});

test("a failed query presents an unavailable count rather than cached or false totals", () => {
  const { html } = renderTile(7, false, true);
  assert.ok(html.includes("unavailable"));
  assert.ok(html.includes("Unable to load"));
  assert.ok(!html.includes('data-testid="text-total-transfers">7</p>'));
});
