import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { TRANSFER_DESTINATIONS } from "./productivity-transfers";
import { countedTrackerAmount, isTransferredOutcome, sumTrackerAmounts } from "./tracker-amounts";
import { calculatePatientTotals } from "./patient-overview";

for (const outcome of [...Object.keys(TRANSFER_DESTINATIONS), "Send to Closed"]) {
  test(`${outcome} retains source amounts but does not count them twice`, () => {
    const source = { amount: "$1,000.00", outcome };
    const destination = { amount: "$1,000.00", outcome: null };
    assert.ok(isTransferredOutcome(outcome));
    assert.equal(countedTrackerAmount(source), 0);
    assert.equal(countedTrackerAmount(destination), 1000);
    assert.equal(sumTrackerAmounts([source, destination]), 1000);
    assert.equal(source.amount, "$1,000.00");
  });
}

test("a multi-step transfer chain counts dollars only at the final destination", () => {
  assert.equal(sumTrackerAmounts([
    { amount: "1000", outcome: "Send to Collections" },
    { amount: "1000", outcome: "Send to Denials" },
    { amount: "1000", outcome: "Send to Arbitration" },
    { amount: "1000", outcome: null },
  ]), 1000);
});

test("ordinary completion, Paid, Loss and the independent PAID marker do not exclude dollars", () => {
  const records = ["Paid", "Loss", "Billed", "Done", "Pending", "", null].map(outcome => ({
    amount: "100", outcome, paid: true,
  }));
  assert.equal(sumTrackerAmounts(records), 700);
  assert.ok(!isTransferredOutcome("toString"));
  assert.ok(!isTransferredOutcome("Send to Unknown"));
});

test("formatted and negative transferred amounts are excluded without changing other amount parsing", () => {
  assert.equal(sumTrackerAmounts([
    { amount: "-$500.00", outcome: "Send to Posting" },
    { amount: "$1,234.50" },
    { amount: "-$20.00" },
    { amount: "N/A" },
    { amount: "9".repeat(400) },
    { amount: null },
  ]), 1214.5);
});

test("Patient Overview excludes transferred dollars in both Open and Done without hiding records", () => {
  const totals = calculatePatientTotals([
    { state: "done", amount: "1000", outcome: "Send to Collections" },
    { state: "open", amount: "1000", outcome: "Send to Denials" },
    { state: "open", amount: "1000", outcome: null },
    { state: "done", amount: "250", outcome: "Paid" },
  ]);
  assert.deepEqual(totals, {
    open: { count: 2, amount: 1000 },
    done: { count: 2, amount: 250 },
    grandTotal: { count: 4, amount: 1250 },
  });
});

test("the actual dashboard totals exclude a transferred source and retain its destination", () => {
  const source = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const amountByTracker:");
  const end = source.indexOf(";", source.indexOf("const totalAmount =", start)) + 1;
  assert.ok(start > 0 && end > start);
  const code = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({
    sumTrackerAmounts,
    allDenials: [{ amount: "1000", outcome: "Send to Collections" }, { amount: "100", outcome: "Paid" }],
    allCollections: [{ amount: "1000", outcome: null }],
    allArbitrations: [], allChecks: [], canSeeChecks: true,
  });
  vm.runInContext(code, context);
  assert.equal(vm.runInContext("totalAmount", context), 1000);
  assert.equal(vm.runInContext("amountByTracker.length", context), 1);
  assert.equal(vm.runInContext("amountByTracker[0].name", context), "Collections");
});

test("all six money-tracker transfer handlers carry an amount edited in the same save", () => {
  const path = new URL("../server/routes.ts", import.meta.url);
  const source = ts.createSourceFile("routes.ts", readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const calls = new Map<string, ts.Expression>();
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "handleOutcomeTransfer"
      && ts.isStringLiteral(node.arguments[1]) && node.arguments[1].text !== "Verification/Billing") {
      calls.set(node.arguments[1].text, node.arguments[2]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual([...calls.keys()].sort(), ["Arbitration", "Checks", "Collections", "Denials", "Posting", "RTP"]);
  for (const [tracker, expression] of calls) {
    const code = ts.transpileModule(`const transferred = ${expression.getText(source)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const data of [{ amount: "1250" }, { amount: "0" }, { amount: null }, { amount: "" }, {}]) {
      const context = vm.createContext({
        existing: { amount: "1000", paid: true }, data,
        denialActivityHistory: [], arbActivityHistory: [], collActivityHistory: [],
        postingActivityHistory: [], checkActivityHistory: [], closedActivityHistory: [],
      });
      vm.runInContext(code, context);
      assert.equal(vm.runInContext("transferred.amount", context), "amount" in data ? data.amount : "1000", tracker);
    }
  }
});
