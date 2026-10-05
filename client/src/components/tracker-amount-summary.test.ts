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

for (const label of ["Posting", "Denials", "Arbitration", "RTP", "Checks"]) {
  test(`${label} renders separate amounts and counts, including completed outcomes`, () => {
    const openRecords = [{ amount: "100.00", outcome: "Follow-Up" }];
    const doneRecords = [
      { amount: "$1,000.00", outcome: "Paid" },
      { amount: "50", outcome: "Loss" },
      { amount: "25", outcome: "Send to RTP" },
    ];
    const html = renderToStaticMarkup(createElement(TrackerAmountSummary, { label, openRecords, doneRecords }));
    assert.ok(html.includes(`Open ${label}:`));
    assert.ok(html.includes(`Done ${label}:`));
    assert.ok(html.includes("$100.00"));
    assert.ok(html.includes("$1,075.00"));
    assert.ok(html.includes("(1 record)"));
    assert.ok(html.includes("(3 records)"));
    assert.ok(!html.includes("Total Amount:"));
  });
}

test("empty buckets remain visible with zero amounts and zero records", () => {
  const html = renderToStaticMarkup(createElement(TrackerAmountSummary, {
    label: "Checks", openRecords: [], doneRecords: [],
  }));
  assert.equal(html.match(/\$0\.00/g)?.length, 2);
  assert.equal(html.match(/\(0 records\)/g)?.length, 2);
});
