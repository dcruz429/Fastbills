import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageLoadBoundary, PageLoading } from "./page-load-boundary";

test("loading a route has an accessible loading state", () => {
  const html = renderToStaticMarkup(createElement(PageLoading));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes("Loading page"));
});

test("loaded pages render through the boundary unchanged", () => {
  const boundary = new PageLoadBoundary({ children: "existing page" });
  assert.equal(boundary.render(), "existing page");
});

test("page load failures show recovery instead of a blank application", () => {
  const boundary = new PageLoadBoundary({ children: "existing page" });
  boundary.state = PageLoadBoundary.getDerivedStateFromError();
  const html = renderToStaticMarkup(boundary.render());
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes("Refresh page"));
  assert.ok(!html.includes("existing page"));
});
