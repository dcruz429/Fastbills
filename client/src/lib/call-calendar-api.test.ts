import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarJson, calendarRequest, parseCalendarResponse } from "./call-calendar-api";
import { calendarCallsSchema, calendarSchedulesSchema, calendarAgentStatsSchema, calendarCallSchema, validNewCallScope } from "../../../shared/call-calendar-contract";

const call = { id: 1, patientName: "Synthetic Call", scheduledAt: "2026-11-13T14:00:00Z", callStatus: "Scheduled" };
for (const schema of [calendarCallsSchema, calendarSchedulesSchema, calendarAgentStatsSchema]) {
  for (const status of [401, 403, 404, 500]) test(`HTTP ${status} is an error, never an empty list`, async () => {
    await assert.rejects(parseCalendarResponse(new Response('{"message":"denied"}', { status }), schema),
      status === 403 ? /Access restricted/ : status === 404 ? /unavailable/ : /session|failed/);
  });
  for (const data of [{ message: "error" }, null, {}, [{ id: "wrong" }]]) {
    test("malformed collection rejected before rendering", async () => {
      await assert.rejects(parseCalendarResponse(new Response(JSON.stringify(data)), schema), /Invalid calendar response/);
    });
  }
  test("a genuinely empty collection remains valid", async () => {
    assert.deepEqual(await parseCalendarResponse(new Response("[]"), schema), []);
  });
}
test("invalid JSON rejected, valid call accepted", async () => {
  await assert.rejects(parseCalendarResponse(new Response("<html>"), calendarCallsSchema), /Invalid calendar response/);
  assert.equal((await parseCalendarResponse(new Response(JSON.stringify(call)), calendarCallSchema)).id, 1);
});
test("scopes cannot be guessed, omitted or broadened", () => {
  const caps = { userId: 1, canRead: true, canMutate: true, canManage: false,
    clinics: [{ id: 10, name: "demo clinic" }], departments: ["Verification" as const] };
  assert.equal(validNewCallScope(caps, "demo clinic", "Verification"), true);
  for (const pair of [["other clinic", "Verification"], ["", "Verification"], ["demo clinic", "Other"], ["demo clinic", ""]])
    assert.equal(validNewCallScope(caps, pair[0], pair[1]), false);
  assert.equal(validNewCallScope({ ...caps, canMutate: false }, "demo clinic", "Verification"), false);
});
test("request helpers use synthetic fetch and reject false mutation success", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(call));
    assert.equal((await calendarJson("/synthetic", calendarCallSchema)).id, 1);
    assert.equal((await (await calendarRequest("POST", "/api/calls", {})).json()).id, 1);
    globalThis.fetch = async () => new Response('{"message":"not a call"}');
    await assert.rejects(calendarRequest("POST", "/api/calls", {}), /Invalid calendar response/);
    globalThis.fetch = async () => new Response("{}", { status: 403 });
    await assert.rejects(calendarRequest("POST", "/api/calls/1/attempts", {}), /Access restricted/);
  } finally { globalThis.fetch = original; }
});
