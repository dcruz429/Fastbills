/**
 * Synthetic browser contract checks. No listener or app server is started.
 * EVERY browser request is fulfilled/aborted locally; nothing is continued to
 * the network. Auth is a synthetic /api/auth/me response, never a real session.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.resolve(root, "generated-artifacts/calendar-browser");
await mkdir(out, { recursive: true });
const result = await build({
  stdin: { contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {QueryClientProvider} from "@tanstack/react-query";
    import {queryClient} from "./client/src/lib/queryClient";
    import {AuthProvider} from "./client/src/lib/auth";
    import Calendar from "./client/src/pages/call-calendar";
    import {Toaster} from "./client/src/components/ui/toaster";
    window.__calendarTestClient = queryClient;
    createRoot(document.getElementById("root")).render(
      <QueryClientProvider client={queryClient}><AuthProvider><Calendar/><Toaster/></AuthProvider></QueryClientProvider>);
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": path.join(root, "client/src"), "@shared": path.join(root, "shared") },
});
const bundle = result.outputFiles[0].text;
// Reuse only generated, public CSS. This path never points at attachments.
let css = "button{cursor:pointer} [role=dialog]{background:white;padding:16px} body{font-family:Arial}";
const cssDir = path.join(root, "generated-artifacts/compile-only/client/assets");
try {
  const name = (await readdir(cssDir)).find(n => /^index-.*\.css$/.test(n));
  if (name) css += await readFile(path.join(cssDir, name), "utf8");
} catch { /* Styling is optional; behavioral checks still run. */ }
const html = `<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
const nixBrowser = (await readdir("/nix/store")).find(n => n.includes("playwright-chromium") && n.includes("1248"));
const browser = await chromium.launch({
  executablePath: nixBrowser ? `/nix/store/${nixBrowser}/chrome-linux/chrome` : undefined,
  headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync"],
});
const results: string[] = [];
const call = {
  id: 123, patientName: "Synthetic Calendar Patient", assignedUserId: 1, assignedUserName: "Synthetic Agent",
  scheduledAt: new Date().toISOString(), callStatus: "Scheduled", clinic: "demo clinic",
  department: "Verification", callReason: "Synthetic follow-up", relatedTaskId: 41, priority: "medium",
};
type Options = {
  admin?: boolean; role?: string; readOnly?: boolean; impersonating?: boolean; noScope?: boolean;
  badCalls?: number | "shape" | "json"; badSchedule?: boolean; badStats?: boolean;
  badMutation?: boolean; badDetail?: number; badAttempts?: boolean;
};
async function scenario(name: string, options: Options, run: (page: Page, writes: any[], urls: string[]) => Promise<void>) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [], unexpected: string[] = [], urls: string[] = [], writes: any[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== "https://calendar.synthetic.invalid") {
      unexpected.push("External request blocked");
      return route.abort("blockedbyclient");
    }
    const respond = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
    urls.push(url.pathname);
    if (url.pathname === "/api/auth/me") return respond({
      id: 1, fullName: "Synthetic Agent", username: "synthetic", role: options.admin ? "admin" : options.role ?? "verifier",
      active: true, isImpersonating: !!options.impersonating,
    });
    if (url.pathname === "/api/calls/capabilities") return respond({
      userId: 1, canRead: true, canMutate: !options.readOnly && !options.impersonating, canManage: !!options.admin,
      clinics: options.noScope ? [] : [{ id: 10, name: "demo clinic" }],
      departments: options.noScope ? [] : ["Verification"],
    });
    if (url.pathname === "/api/users") return respond([
      { id: 1, fullName: "Synthetic Agent", role: "verifier", active: true },
      { id: 2, fullName: "Synthetic Other Agent", role: "verifier", active: true },
    ]);
    if (url.pathname === "/api/teams") return respond([
      { id: 1, name: "VC Team", members: [{ id: 1 }, { id: 2 }] },
      { id: 2, name: "Manager Team", members: [{ id: 1 }] },
    ]);
    if (url.pathname === "/api/calls/stats") return respond({
      scheduledToday: 1, resolvedToday: 0, overdueToday: 0, followUpRequired: 0, unassigned: 0,
    });
    if (url.pathname === "/api/calls/agent-stats") return options.badStats
      ? respond({ message: "denied" }, 403)
      : respond([{ userId: 1, userName: "Synthetic Agent", assigned: 1, done: 0, pending: 1, rescheduled: 0, successRate: 0 }]);
    if (url.pathname === "/api/calls/daily-schedule") return respond(options.badSchedule ? { message: "malformed" } : []);
    if (request.method() !== "GET" && url.pathname.startsWith("/api/calls")) {
      const body = request.postDataJSON(); writes.push({ path: url.pathname, body });
      if (options.badMutation) return respond({ message: "not a successful call" });
      if (url.pathname.endsWith("/attempts")) return respond({ attempt: { id: 1 }, nextCall: null });
      return respond({ ...call, ...body, id: url.pathname === "/api/calls" ? 124 : 123 });
    }
    if (url.pathname === "/api/calls") {
      if (typeof options.badCalls === "number") return respond({ message: "denied" }, options.badCalls);
      if (options.badCalls === "shape") return respond({ message: "not an array" });
      if (options.badCalls === "json") return route.fulfill({ contentType: "application/json", body: "not JSON" });
      return respond([call]);
    }
    if (url.pathname === "/api/calls/123") return options.badDetail ? respond({}, options.badDetail) : respond(call);
    if (url.pathname === "/api/calls/123/attempts") return respond(options.badAttempts ? {} : []);
    if (url.pathname === "/api/calls/123/activity") return respond([]);
    unexpected.push("Unhandled synthetic path: " + url.pathname);
    return respond({ message: "Unhandled synthetic request" }, 500);
  });
  try {
    await page.goto("https://calendar.synthetic.invalid/");
    await run(page, writes, urls);
    assert.deepEqual(errors, [], "No browser render exceptions");
    assert.deepEqual(unexpected, [], "No live/unhandled requests");
    assert.deepEqual(await context.cookies(), [], "No sessions or cookies");
    results.push(name); console.log("PASS: " + name);
    if (name === "authorized self-assigned creation") await page.screenshot({ path: path.join(out, "synthetic-calendar.jpg"), fullPage: true });
  } finally { await context.close(); }
}
async function ready(page: Page) {
  await page.getByTestId("button-new-call").waitFor();
}
async function settled(page: Page) {
  await page.waitForFunction(() => (window as any).__calendarTestClient.isFetching() === 0);
}
async function fillNewCall(page: Page) {
  await ready(page);
  await page.getByTestId("button-new-call").click();
  await page.getByTestId("input-call-patient-name").fill("Synthetic New Call");
  await page.getByTestId("input-call-date").fill("2026-12-01");
  await page.getByTestId("input-call-reason").fill("Synthetic follow-up");
  assert.equal(await page.getByTestId("button-save-call").isDisabled(), true, "Scope is required");
  assert.equal(await page.getByTestId("select-related-task").count(), 0);
  assert.equal(await page.getByTestId("select-call-assigned").count(), 0);
  await page.getByTestId("select-call-department").click();
  await page.getByRole("option", { name: "Verification", exact: true }).click();
  await page.getByTestId("select-call-clinic").click();
  await page.getByRole("option", { name: "demo clinic", exact: true }).click();
}
try {
  for (const badCalls of [403, 404, "shape", "json"] as const) {
    await scenario("controlled call-list failure: " + badCalls, { badCalls }, async page => {
      await page.getByTestId("calendar-query-error").waitFor();
      assert.equal(await page.getByTestId("button-new-call").count(), 0);
    });
  }
  await scenario("controlled schedule malformed response", { badSchedule: true }, async page => {
    await page.getByTestId("calendar-query-error").waitFor();
  });
  for (const options of [{ readOnly: true }, { impersonating: true }, { role: "manager" }]) {
    await scenario("effective authorization controls: " + JSON.stringify(options), options, async (page, _writes, urls) => {
      await ready(page);
      assert.equal(await page.getByTestId("button-new-call").isDisabled(), !!(options as any).readOnly || !!(options as any).impersonating);
      assert.equal(await page.getByTestId("tab-view-manager").count(), 0);
      assert.equal(await page.getByTestId("select-filter-assigned").count(), 0);
      assert.ok(!urls.includes("/api/calls/stats"));
      if ((options as any).readOnly || (options as any).impersonating) {
        await page.getByText("Synthetic Calendar Patient", { exact: true }).first().click();
        await page.getByTestId("call-detail-panel").waitFor();
        assert.equal(await page.getByTestId("button-record-attempt").count(), 0);
      }
    });
  }
  await scenario("authorized self-assigned creation", {}, async (page, writes) => {
    await fillNewCall(page);
    await page.getByTestId("button-save-call").click();
    await page.getByTestId("dialog-new-call").waitFor({ state: "hidden" });
    const write = writes.find(w => w.path === "/api/calls");
    assert.equal(write.body.assignedUserId, 1);
    assert.equal(write.body.clinic, "demo clinic");
    assert.equal(write.body.department, "Verification");
    assert.ok(!("relatedTaskId" in write.body));
  });
  await scenario("malformed mutation never reports success", { badMutation: true }, async page => {
    await fillNewCall(page);
    await page.getByTestId("button-save-call").click();
    await page.getByText("Invalid calendar response. Please retry.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("dialog-new-call").isVisible(), true);
  });
  await scenario("missing-clinic scope cannot be submitted", { noScope: true }, async page => {
    await ready(page); await page.getByTestId("button-new-call").click();
    await page.getByText(/No recognized clinic/).waitFor();
    assert.equal(await page.getByTestId("button-save-call").isDisabled(), true);
  });
  await scenario("admin-only dashboard exposes stats failure safely", { admin: true, badStats: true }, async page => {
    await ready(page); await page.getByTestId("tab-view-manager").click();
    await page.getByTestId("calendar-query-error").waitFor();
  });
  await scenario("all-agent malformed schedule never becomes partial success", { admin: true, badSchedule: true }, async page => {
    await ready(page); await page.getByTestId("tab-view-manager").click();
    await page.getByTestId("calendar-query-error").waitFor();
  });
  const weekOptions: Options = { admin: true };
  await scenario("week schedules reject malformed response safely", weekOptions, async page => {
    await ready(page); await page.getByTestId("tab-view-manager").click();
    await page.getByTestId("agent-stats-table").waitFor();
    await settled(page);
    weekOptions.badSchedule = true;
    await page.getByRole("button", { name: "Week View", exact: true }).click();
    await page.getByTestId("calendar-query-error").waitFor();
  });
  const selectedOptions: Options = { admin: true };
  await scenario("selected-agent schedules reject malformed response safely", selectedOptions, async page => {
    await ready(page); await page.getByTestId("tab-view-manager").click();
    await page.getByTestId("agent-stats-table").waitFor();
    await settled(page);
    selectedOptions.badSchedule = true;
    await page.getByTestId("select-mgr-agent").click();
    await page.getByRole("option", { name: "Synthetic Other Agent", exact: true }).click();
    await page.getByTestId("calendar-query-error").waitFor();
  });
  await scenario("detail 404 is controlled and hides mutations", { badDetail: 404 }, async page => {
    await ready(page); await page.getByText("Synthetic Calendar Patient", { exact: true }).first().click();
    await page.getByTestId("calendar-query-error").waitFor();
    assert.equal(await page.getByTestId("button-record-attempt").count(), 0);
  });
  await scenario("attempt response shape error cannot crash history", { badAttempts: true }, async page => {
    await ready(page); await page.getByText("Synthetic Calendar Patient", { exact: true }).first().click();
    await page.getByTestId("calendar-query-error").waitFor();
  });
  await scenario("authorized attempt keeps task updates and delegation absent", {}, async (page, writes) => {
    await ready(page); await page.getByText("Synthetic Calendar Patient", { exact: true }).first().click();
    await page.getByTestId("button-record-attempt").click();
    assert.equal(await page.getByLabel("Update related task status", { exact: false }).count(), 0);
    assert.equal(await page.getByText("Assign Follow-Up To", { exact: true }).count(), 0);
    await page.getByTestId("select-attempt-outcome").click();
    await page.getByRole("option", { name: "Resolved", exact: true }).click();
    await page.getByTestId("button-save-attempt").click();
    await page.getByTestId("dialog-record-attempt").waitFor({ state: "hidden" });
    const attempt = writes.find(w => w.path.endsWith("/attempts"));
    for (const key of ["nextAssignedUserId", "relatedTaskId", "updateTaskStatus", "newTaskStatus"])
      assert.ok(!(key in attempt.body));
  });
  await writeFile(path.join(out, "results.json"), JSON.stringify({ passed: results.length, failed: 0, results, network: "all requests intercepted" }, null, 2));
  console.log(`PASS: ${results.length} synthetic browser scenarios; no live requests, sessions, or server.`);
} finally { await browser.close(); }
