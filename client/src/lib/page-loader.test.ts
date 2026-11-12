import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, statSync } from "node:fs";
import { createElement, lazy, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { canPreloadPages, createPageLoader } from "./page-loader";
import { pageRoutes } from "./page-routes";

test("page code is not imported until requested", async () => {
  let calls = 0;
  const load = createPageLoader(async () => { calls++; return "page"; });
  assert.equal(calls, 0);
  assert.equal(await load(), "page");
  assert.equal(calls, 1);
});

test("preloading and navigation share the same in-flight import and cached result", async () => {
  let calls = 0;
  const module = { default: () => null };
  let resolve!: (value: typeof module) => void;
  const load = createPageLoader(() => { calls++; return new Promise<typeof module>(done => { resolve = done; }); });
  const first = load();
  const second = load();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve(module);
  assert.equal(await first, module);
  assert.equal(await load(), module);
  assert.equal(calls, 1);
});

test("a failed preload can be retried without a full application reload", async () => {
  let calls = 0;
  const load = createPageLoader(async () => {
    calls++;
    if (calls === 1) throw new Error("temporary network failure");
    return "page";
  });
  await assert.rejects(load(), /network failure/);
  assert.equal(await load(), "page");
  assert.equal(calls, 2);
});

test("synchronous loader errors also clear the cache for a later retry", async () => {
  let calls = 0;
  const load = createPageLoader(() => {
    calls++;
    if (calls === 1) throw new Error("temporary failure");
    return Promise.resolve("page");
  });
  await assert.rejects(load(), /temporary failure/);
  assert.equal(await load(), "page");
});

test("temporary page-download failures retry before navigation's shared promise rejects", async () => {
  let calls = 0;
  const waits: number[] = [];
  const module = { default: () => null };
  const load = createPageLoader(async () => {
    calls++;
    if (calls < 3) throw new TypeError("Failed to fetch dynamically imported module: /src/pages/board.tsx");
    return module;
  }, { wait: async milliseconds => { waits.push(milliseconds); } });
  const navigation = load();
  assert.equal(load(), navigation);
  assert.equal(await navigation, module);
  assert.equal(await load(), module);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [250, 750]);
});

test("download retries are bounded, preserve the error, and allow a later manual retry", async () => {
  let calls = 0;
  const failure = new TypeError("error loading dynamically imported module");
  const load = createPageLoader(async () => {
    calls++;
    throw failure;
  }, { wait: async () => {} });
  await assert.rejects(load(), error => error === failure);
  assert.equal(calls, 3);
  await assert.rejects(load(), error => error === failure);
  assert.equal(calls, 6);
});

test("syntax and application errors are not automatically retried", async () => {
  for (const failure of [new SyntaxError("Unexpected token"), new Error("Invalid hook call")]) {
    let calls = 0;
    const load = createPageLoader(async () => {
      calls++;
      throw failure;
    }, { wait: async () => assert.fail("Application errors must not trigger a download retry") });
    await assert.rejects(load(), error => error === failure);
    assert.equal(calls, 1);
  }
});

test("React lazy renders the page after a transient download failure without triggering recovery", async () => {
  let calls = 0;
  const Page = lazy(createPageLoader(async () => {
    calls++;
    if (calls === 1) throw new TypeError("Failed to fetch dynamically imported module: /src/pages/board.tsx");
    return { default: () => createElement("div", null, "Board loaded") };
  }, { wait: async () => {} }));
  const html = await new Promise<string>((resolve, reject) => {
    const output = new PassThrough();
    let text = "";
    output.on("data", chunk => { text += chunk.toString(); });
    output.on("end", () => resolve(text));
    output.on("error", reject);
    const stream = renderToPipeableStream(createElement(Suspense, { fallback: "Loading" }, createElement(Page)), {
      onAllReady() { stream.pipe(output); },
      onError: reject,
    });
  });
  assert.ok(html.includes("Board loaded"));
  assert.equal(calls, 2);
});

test("speculative loading respects data-saving and slow connections", () => {
  assert.ok(canPreloadPages());
  assert.ok(canPreloadPages({ effectiveType: "4g" }));
  assert.ok(!canPreloadPages({ saveData: true }));
  assert.ok(!canPreloadPages({ effectiveType: "2g" }));
  assert.ok(!canPreloadPages({ effectiveType: "slow-2g" }));
});

test("all existing page paths remain registered as lazy components", () => {
  const expected = ["/", "/verification", "/my-tasks", "/dashboard", "/workload", "/billing-queue",
    "/notifications", "/settings", "/rcm-access", "/rcm-role-matrix", "/rcm-taskboard",
    "/rcm-approvals", "/rcm-productivity", "/rcm-sla", "/rcm-quality",
    "/reports", "/productivity", "/denials", "/arbitration",
    "/tickets", "/posting", "/collections", "/checks", "/closed", "/ceo-box", "/call-calendar",
    "/patient-overview", "/guideline-board", "/medical-records-request", "/message-board", "/messages"];
  assert.deepEqual(pageRoutes.map(route => route.path), expected);
  assert.equal(new Set(pageRoutes.map(route => route.path)).size, expected.length);
  assert.ok(pageRoutes.every(route => typeof route.Component === "object" && typeof route.load === "function"));
});

test("production startup stays within budget and does not eagerly import tracker pages", () => {
  type ManifestEntry = { file: string; imports?: string[]; src?: string; isDynamicEntry?: boolean };
  const manifest: Record<string, ManifestEntry> = JSON.parse(readFileSync("dist/public/.vite/manifest.json", "utf8"));
  const initialKeys = new Set<string>();
  function visit(key: string) {
    if (initialKeys.has(key)) return;
    initialKeys.add(key);
    for (const dependency of manifest[key].imports || []) visit(dependency);
  }
  visit("index.html");
  const files = Array.from(initialKeys).map(key => manifest[key].file).filter(file => file.endsWith(".js"));
  const bytes = files.reduce((sum, file) => sum + statSync(`dist/public/${file}`).size, 0);
  assert.ok(bytes < 600_000, `Initial JavaScript exceeds 600 KB budget (${bytes} bytes)`);
  assert.ok(Array.from(initialKeys).every(key => !key.startsWith("src/pages/")));
  assert.equal(Object.values(manifest).filter(entry => entry.isDynamicEntry && entry.src?.startsWith("src/pages/")).length, pageRoutes.length);
});
