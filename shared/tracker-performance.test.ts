import assert from "node:assert/strict";
import { test } from "node:test";
import { createDebouncedSearch, trackerPage, TRACKER_PAGE_SIZE } from "./tracker-performance";

test("large trackers render only 50 rows without altering the complete record set", () => {
  const records = Array.from({ length: 10_000 }, (_, id) => ({ id }));
  const first = trackerPage(records, 1);
  assert.equal(first.rows.length, TRACKER_PAGE_SIZE);
  assert.equal(first.pageCount, 200);
  assert.equal(first.rows[0].id, 0);
  assert.equal(first.rows.at(-1)?.id, 49);
  assert.equal(records.length, 10_000);
  const last = trackerPage(records, 200);
  assert.equal(last.rows[0].id, 9950);
  assert.equal(last.rows.at(-1)?.id, 9999);
});

test("every record is reachable and there are no gaps or duplicate rows between pages", () => {
  const records = Array.from({ length: 123 }, (_, id) => ({ id }));
  const pages = [1, 2, 3].flatMap(page => trackerPage(records, page).rows);
  assert.deepEqual(pages, records);
  assert.equal(trackerPage(records, 3).rows.length, 23);
});

test("empty results and stale page numbers are safely clamped", () => {
  assert.deepEqual(trackerPage([], 20), { page: 1, pageCount: 1, start: 0, end: 0, rows: [] });
  assert.equal(trackerPage([1, 2, 3], 20).page, 1);
  assert.equal(trackerPage([1, 2, 3], -5).page, 1);
});

test("search and sorting precede pagination, so matches beyond the first page remain searchable", () => {
  const records = Array.from({ length: 10_000 }, (_, id) => ({ id, name: `Record ${id}` }));
  const filtered = records.filter(record => record.name === "Record 9999");
  assert.equal(trackerPage(filtered, 1).rows[0].id, 9999);
  const reversed = [...records].sort((a, b) => b.id - a.id);
  assert.equal(trackerPage(reversed, 1).rows[0].id, 9999);
});

test("typing rapidly emits only the latest search after the short pause", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const values: string[] = [];
  const search = createDebouncedSearch(value => values.push(value));
  for (const value of ["s", "sm", "smi", "smit", "smith"]) {
    search.schedule(value);
    t.mock.timers.tick(25);
  }
  assert.deepEqual(values, []);
  t.mock.timers.tick(150);
  assert.deepEqual(values, ["smith"]);
});

test("Enter, blur, or clearing can immediately flush the latest search without duplicate callbacks", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const values: string[] = [];
  const search = createDebouncedSearch(value => values.push(value));
  search.schedule("Smith");
  search.flush();
  search.schedule("");
  search.flush();
  search.flush();
  t.mock.timers.tick(500);
  assert.deepEqual(values, ["Smith", ""]);
});

test("unmount, external reset and composition cancel pending searches", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const values: string[] = [];
  const search = createDebouncedSearch(value => values.push(value));
  search.schedule("obsolete draft");
  search.cancel();
  t.mock.timers.tick(500);
  assert.deepEqual(values, []);
  search.schedule("finished composition");
  t.mock.timers.tick(150);
  assert.deepEqual(values, ["finished composition"]);
});
