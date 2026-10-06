import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaidStatusBadge, PaidStatusCell } from "./paid-status-cell";

test("the visible record-name badge is present only for saved paid records", () => {
  const paid = renderToStaticMarkup(createElement(PaidStatusBadge, { paid: true }));
  assert.ok(paid.includes("PAID"));
  assert.ok(paid.includes("emerald"));
  assert.equal(renderToStaticMarkup(createElement(PaidStatusBadge, { paid: false })), "");
});

test("a saved paid record has both a checked checkbox and a textual PAID indicator", () => {
  const html = renderToStaticMarkup(createElement(PaidStatusCell, { paid: true, canEdit: true }));
  assert.ok(html.includes('aria-checked="true"'));
  assert.ok(html.includes('aria-label="PAID"'));
  assert.ok(html.includes(">PAID</span>"));
});

test("unchecked records do not show a false paid indicator", () => {
  const html = renderToStaticMarkup(createElement(PaidStatusCell, { paid: false, canEdit: true }));
  assert.ok(html.includes('aria-checked="false"'));
  assert.ok(!html.includes(">PAID</span>"));
});

test("read-only users see the PAID badge without an editing control", () => {
  const html = renderToStaticMarkup(createElement(PaidStatusCell, { paid: true, canEdit: false }));
  assert.ok(html.includes("PAID"));
  assert.ok(!html.includes('role="checkbox"'));
  const unpaid = renderToStaticMarkup(createElement(PaidStatusCell, { paid: false, canEdit: false }));
  assert.ok(!unpaid.includes("PAID"));
});

test("pending changes disable the checkbox and explain that the save is running", () => {
  const html = renderToStaticMarkup(createElement(PaidStatusCell, { paid: false, canEdit: true, pending: true }));
  assert.ok(html.includes('disabled=""'));
  assert.ok(html.includes("Saving"));
});

test("another pending Paid change prevents conflicting row edits", () => {
  const html = renderToStaticMarkup(createElement(PaidStatusCell, { paid: true, canEdit: true, busy: true }));
  assert.ok(html.includes('disabled=""'));
});

test("checkbox callbacks use real booleans and ignore the indeterminate state", () => {
  const changes: boolean[] = [];
  const cell = PaidStatusCell({ paid: false, canEdit: true, onChange: value => changes.push(value) });
  const checkbox = (cell.props.children as any[])[0];
  checkbox.props.onCheckedChange(true);
  checkbox.props.onCheckedChange(false);
  checkbox.props.onCheckedChange("indeterminate");
  assert.deepEqual(changes, [true, false]);
});

test("Paid control interactions do not open the surrounding record or bulk-select it", () => {
  const cell = PaidStatusCell({ paid: false, canEdit: true });
  let stopped = 0;
  const event = { stopPropagation() { stopped++; } };
  for (const handler of ["onClick", "onKeyDown", "onKeyUp", "onPointerDown"]) cell.props[handler](event);
  assert.equal(stopped, 4);
});
