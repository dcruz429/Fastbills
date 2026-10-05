import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sumTrackerAmounts, TrackerAmountSummary } from "./tracker-amount-summary";

test("totals currency-formatted, negative, missing, and invalid amounts", () => {
  assert.equal(sumTrackerAmounts([
    { amount: "$1,234.50" },
    { amount: "100.25" },
    { amount: "-$20.00" },
    { amount: null },
    { amount: undefined },
    { amount: "" },
    { amount: "N/A" },
    { amount: "9".repeat(400) },
  ]), 1314.75);
  assert.equal(sumTrackerAmounts([]), 0);
});

for (const label of ["Collections", "Posting", "Denials", "Arbitration", "RTP", "Checks"]) {
  test(`${label} renders separate amounts and counts, including completed outcomes`, () => {
    const openRecords = [{ amount: "100.00", outcome: "Follow-Up" }];
    const doneRecords = [
      { amount: "$1,000.00", outcome: "Paid" },
      { amount: "50", outcome: "Loss" },
      { amount: "25", outcome: "Send to RTP" },
    ];
    const html = renderToStaticMarkup(createElement(TrackerAmountSummary, { label, userRole: "admin", openRecords, doneRecords }));
    assert.ok(html.includes(`Open ${label}:`));
    assert.ok(html.includes(`Done ${label}:`));
    assert.ok(html.includes("$100.00"));
    assert.ok(html.includes("$1,075.00"));
    assert.ok(html.includes("(1 record)"));
    assert.ok(html.includes("(3 records)"));
    assert.ok(html.includes("Grand Total:"));
    assert.ok(html.includes("$1,175.00"));
    assert.ok(html.includes("(4 records)"));
    assert.ok(!html.includes("Total Amount:"));
  });
}

test("empty buckets remain visible with zero amounts and zero records", () => {
  const html = renderToStaticMarkup(createElement(TrackerAmountSummary, {
    label: "Checks", userRole: "admin", openRecords: [], doneRecords: [],
  }));
  assert.equal(html.match(/\$0\.00/g)?.length, 3);
  assert.equal(html.match(/\(0 records\)/g)?.length, 3);
});

test("grand total updates with filtered groups and handles a single record", () => {
  const html = renderToStaticMarkup(createElement(TrackerAmountSummary, {
    label: "Collections", userRole: "admin", openRecords: [], doneRecords: [{ amount: "-$12.50" }],
  }));
  const grandTotal = html.split('data-testid="sum-grand-total-amount-box"')[1];
  assert.ok(grandTotal.includes("$-12.50"));
  assert.ok(grandTotal.includes("(1 record)"));
});

for (const label of ["Collections", "Posting", "Denials", "Arbitration", "RTP", "Checks"]) {
  for (const userRole of ["verifier", "biller", "assigner", "manager", "payment_specialist", "account_manager", "case_manager", undefined]) {
    test(`${label} hides Open and Grand Total for ${userRole ?? "missing role"}, retaining Done`, () => {
      const html = renderToStaticMarkup(createElement(TrackerAmountSummary, {
        label,
        userRole,
        openRecords: [{ amount: "100" }],
        doneRecords: [{ amount: "50" }, { amount: "25" }],
      }));
      assert.ok(!html.includes("sum-open-amount"));
      assert.ok(!html.includes("sum-grand-total-amount"));
      assert.ok(!html.includes(`Open ${label}:`));
      assert.ok(!html.includes("Grand Total:"));
      assert.ok(!html.includes("$100.00"));
      assert.ok(!html.includes("$175.00"));
      assert.ok(html.includes(`Done ${label}:`));
      assert.ok(html.includes("$75.00"));
      assert.ok(html.includes("(2 records)"));
    });
  }
}

test("non-admins still see an empty Done summary", () => {
  const html = renderToStaticMarkup(createElement(TrackerAmountSummary, {
    label: "Posting", userRole: "manager", openRecords: [], doneRecords: [],
  }));
  assert.equal(html.match(/\$0\.00/g)?.length, 1);
  assert.equal(html.match(/\(0 records\)/g)?.length, 1);
  assert.ok(html.includes("Done Posting:"));
});
