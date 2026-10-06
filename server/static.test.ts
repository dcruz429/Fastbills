import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { get } from "node:http";
import path from "node:path";
import express from "express";
import ts from "typescript";

test("production static middleware serves cached chunks, fresh HTML, and explicit missing-asset errors", async () => {
  // Run the real production middleware with the build directory supplied as
  // its runtime __dirname; no app authentication or data is modified.
  const js = ts.transpileModule(readFileSync(new URL("./static.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as { serveStatic: (app: ReturnType<typeof express>) => void } };
  new Function("require", "module", "exports", "__dirname", js)(
    createRequire(new URL("./static.ts", import.meta.url)), module, module.exports, path.resolve("dist"),
  );
  const app = express();
  module.exports.serveStatic(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const asset = readdirSync("dist/public/assets").find(name => name.endsWith(".js"))!;
    const response = await fetch(`${base}/assets/${asset}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("cache-control")?.includes("immutable"));
    await response.arrayBuffer();
    // Native HTTP avoids fetch's automatic no-cache header on conditional
    // requests, which would intentionally force Express to return a full body.
    const cachedStatus = await new Promise<number>((resolve, reject) => {
      get(`${base}/assets/${asset}`, { headers: { "If-None-Match": response.headers.get("etag")! } }, res => {
        res.resume();
        resolve(res.statusCode!);
      }).on("error", reject);
    });
    assert.equal(cachedStatus, 304);
    for (const route of ["/", "/verification?edit=123", "/patient-overview"]) {
      const html = await fetch(`${base}${route}`);
      assert.equal(html.status, 200);
      assert.equal(html.headers.get("cache-control"), "no-cache");
      assert.ok(html.headers.get("content-type")?.includes("text/html"));
      await html.text();
    }
    const missing = await fetch(`${base}/assets/deleted-chunk.js`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-cache");
    assert.equal(await missing.text(), "");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
