import assert from "node:assert/strict";
import { test } from "node:test";
import { staticCacheControl } from "./static-cache";

test("content-hashed build assets are reusable across visits", () => {
  for (const path of [
    "/dist/public/assets/index-Mu_t8OID.js", "/dist/public/assets/board-aBc_1234.js",
    "/dist/public/assets/index-B8rkr-Z8.css", "/dist/public/assets/logo-DC4GUYLF.jpg",
  ]) assert.equal(staticCacheControl(path), "public, max-age=31536000, immutable");
});

test("HTML and unversioned files revalidate rather than becoming stale after a publish", () => {
  for (const path of [
    "/dist/public/index.html", "/dist/public/assets/app.js",
    "/dist/public/assets/logo.jpg", "/dist/public/favicon.ico", "/dist/public/index-Mu_t8OID.js",
  ]) assert.equal(staticCacheControl(path), "no-cache");
});
