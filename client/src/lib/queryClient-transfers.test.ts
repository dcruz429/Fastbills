import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, queryClient } from "./queryClient";

const destinations = [
  ["Send to Verification", "/api/tasks"], ["Send to Billing", "/api/tasks"],
  ["Send to Posting", "/api/postings"], ["Send to Collections", "/api/collections"],
  ["Send to Denials", "/api/denials"], ["Send to Arbitration", "/api/arbitrations"],
  ["Send to RTP", "/api/closed"], ["Send to Closed", "/api/closed"],
];

test("successful outcome transfers refresh cached destination and combined totals", async () => {
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    for (const [outcome, endpoint] of destinations) {
      queryClient.clear();
      queryClient.setQueryData([endpoint], []);
      queryClient.setQueryData(["patient-overview", "Test"], {});
      queryClient.setQueryData(["/api/users"], []);
      await apiRequest("PATCH", "/api/checks/10", { outcome });
      assert.equal(queryClient.getQueryState([endpoint])?.isInvalidated, true, outcome);
      assert.equal(queryClient.getQueryState(["patient-overview", "Test"])?.isInvalidated, true);
      assert.equal(queryClient.getQueryState(["/api/users"])?.isInvalidated, false);
    }
  } finally {
    globalThis.fetch = fetch;
    queryClient.clear();
  }
});

test("failed transfers do not invalidate totals as if a destination record had been created", async () => {
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Transfer failed", { status: 400 });
    queryClient.setQueryData(["/api/denials"], []);
    await assert.rejects(apiRequest("PATCH", "/api/collections/10", { outcome: "Send to Denials" }));
    assert.equal(queryClient.getQueryState(["/api/denials"])?.isInvalidated, false);
  } finally {
    globalThis.fetch = fetch;
    queryClient.clear();
  }
});

test("ordinary edits and non-tracker actions do not refresh unrelated destination data", async () => {
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    queryClient.setQueryData(["/api/denials"], []);
    for (const [method, url, data] of [
      ["PATCH", "/api/collections/10", { outcome: "Paid" }],
      ["PATCH", "/api/collections/10", { paid: true }],
      ["POST", "/api/collections/10/notes", { outcome: "Send to Denials" }],
      ["PATCH", "/api/tickets/10", { outcome: "Send to Denials" }],
    ] as const) {
      await apiRequest(method, url, data);
      assert.equal(queryClient.getQueryState(["/api/denials"])?.isInvalidated, false);
    }
  } finally {
    globalThis.fetch = fetch;
    queryClient.clear();
  }
});
