import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientOverviewTotals } from "./patient-overview-totals";

const totals = {
  open: { count: 1, amount: 100 },
  done: { count: 2, amount: 75 },
  grandTotal: { count: 3, amount: 175 },
};

test("admins see all three summaries with amounts and record counts", () => {
  const html = renderToStaticMarkup(createElement(PatientOverviewTotals, { totals, userRole: "admin" }));
  for (const id of ["open", "done", "grand"]) assert.ok(html.includes(`patient-total-${id}`));
  for (const amount of ["$100.00", "$75.00", "$175.00"]) assert.ok(html.includes(amount));
  assert.ok(html.includes("1 tracked record"));
  assert.ok(html.includes("3 tracked records"));
});

for (const userRole of ["verifier", "biller", "assigner", "manager", "payment_specialist", "account_manager", "case_manager", undefined]) {
  test(`${userRole ?? "missing role"} sees only Open summaries`, () => {
    const html = renderToStaticMarkup(createElement(PatientOverviewTotals, { totals, userRole }));
    assert.ok(html.includes("patient-total-open"));
    assert.ok(!html.includes("patient-total-done"));
    assert.ok(!html.includes("patient-total-grand"));
    assert.ok(html.includes("$100.00"));
    assert.ok(!html.includes("$75.00"));
    assert.ok(!html.includes("$175.00"));
  });
}

test("task sections display counts with unavailable amounts, not zero balances", () => {
  const html = renderToStaticMarkup(createElement(PatientOverviewTotals, { totals, userRole: "admin", hasAmounts: false }));
  assert.ok(!html.includes("$"));
  assert.ok(html.includes("3 tracked records"));
  assert.equal(html.match(/—/g)?.length, 3);
});

test("empty search summaries show all three zero values for admins", () => {
  const empty = { open: { count: 0, amount: 0 }, done: { count: 0, amount: 0 }, grandTotal: { count: 0, amount: 0 } };
  const html = renderToStaticMarkup(createElement(PatientOverviewTotals, { totals: empty, userRole: "admin" }));
  assert.equal(html.match(/\$0\.00/g)?.length, 3);
  assert.equal(html.match(/0 tracked records/g)?.length, 3);
});
