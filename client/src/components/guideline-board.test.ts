import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const text = readFileSync(new URL("../pages/guideline-board.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = {
  id: 1, title: "Team reference", body: "Read these steps.\nKeep this note.",
  moduleType: "training", attachments: ["/api/files/1|reference.pdf"],
  authorName: "Module author", updatedByName: "Module editor",
  createdAt: "2026-10-13T12:00:00Z", updatedAt: "2026-10-14T12:00:00Z",
};
function render(role: string, query: object = {}, types = ["guideline", "training"], guidelineModuleAccess = false, active = true) {
  const exports: any = {};
  const requireReal = createRequire(import.meta.url);
  runInNewContext(code, {
    exports, Date, FormData, File,
    require(name: string) {
      if (name === "@/lib/auth") return { useAuth: () => ({ user: { id: 1, role, guidelineModuleAccess, active } }) };
      if (name === "@/hooks/use-managed-dropdown") return { useManagedDropdown: () => ({ values: types, isError: false, isLoading: false }) };
      if (name === "@tanstack/react-query") return {
        useQuery: () => ({ data: [module], isLoading: false, isError: false, ...query }),
        useMutation: () => ({ isPending: false, mutate: () => {} }),
      };
      if (name === "@/lib/queryClient") return { queryClient: { invalidateQueries: () => {} } };
      return requireReal(name);
    },
  });
  return renderToStaticMarkup(createElement(exports.default));
}

test("admin sees create/edit controls, readable content, attachments and update attribution", () => {
  const html = render("admin");
  for (const marker of ["button-create-guideline", "button-edit-guideline-1", "Read these steps.", "reference.pdf", "Module editor", "Guidelines Board"]) {
    assert.ok(html.includes(marker), marker);
  }
});

test("all other staff roles see module content without any authoring controls", () => {
  for (const role of ["manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"]) {
    const html = render(role);
    assert.ok(html.includes("Read these steps."));
    assert.ok(!html.includes("button-create-guideline"));
    assert.ok(!html.includes("button-edit-guideline"));
  }
});

test("delegated module editors see create/edit controls for every staff role, but revoked or inactive editors do not", () => {
  for (const role of ["manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"]) {
    const html = render(role, {}, undefined, true);
    assert.ok(html.includes("button-create-guideline"));
    assert.ok(html.includes("button-edit-guideline-1"));
    assert.ok(render(role, { data: [] }, undefined, true).includes("button-create-first-guideline"));
    assert.ok(!render(role, {}, undefined, false).includes("button-edit-guideline"));
    assert.ok(!render(role, {}, undefined, true, false).includes("button-create-guideline"));
  }
});

test("loading, empty and retryable errors are explicit, not misleading empty lists", () => {
  assert.ok(render("admin", { isLoading: true }).includes("state-guidelines-loading"));
  assert.ok(render("admin", { data: [] }).includes("state-guidelines-empty"));
  const error = render("verifier", { data: undefined, isError: true });
  assert.ok(error.includes("button-retry-guidelines"));
  assert.ok(!error.includes("state-guidelines-empty"));
});

test("Guidelines Board navigation is immediately above Message Board with the same staff visibility", () => {
  const sidebar = readFileSync(new URL("./app-sidebar.tsx", import.meta.url), "utf8");
  const guidelineLine = sidebar.split("\n").findIndex(line => line.includes('title: "Guidelines Board"'));
  assert.equal(sidebar.split("\n")[guidelineLine + 1].includes('title: "Message Board"'), true);
  const guidelineRoles = sidebar.split("\n")[guidelineLine].match(/roles: \[(.*?)\]/)?.[1];
  const messageRoles = sidebar.split("\n")[guidelineLine + 1].match(/roles: \[(.*?)\]/)?.[1];
  assert.equal(guidelineRoles, messageRoles);
  const routes = readFileSync(new URL("../lib/page-routes.ts", import.meta.url), "utf8");
  assert.ok(routes.includes('"/guideline-board": () => import("@/pages/guideline-board")'));
});

test("the editor loads existing modules, retains/removes attachments, saves real multipart changes and preserves failed drafts", () => {
  assert.ok(text.includes("moduleType: module.moduleType"));
  assert.ok(text.includes("id: module.id"));
  assert.ok(text.includes("title: module.title"));
  assert.ok(text.includes("body: module.body"));
  assert.ok(text.includes("retainedAttachments: [...(module.attachments || [])]"));
  assert.ok(text.includes('formData.append("retainedAttachments", JSON.stringify(current.retainedAttachments))'));
  assert.ok(text.includes('method: editing ? "PATCH" : "POST"'));
  assert.ok(text.includes('credentials: "include"'));
  assert.ok(text.includes("onError: (error: Error) => setFormError"));
  assert.ok(text.includes("if (!open && saveMutation.isPending) return"));
  assert.ok(!text.includes("dangerouslySetInnerHTML"));
});

test("custom module types render without being relabeled as Guideline and empty configuration is explicit", () => {
  const html = render("admin", { data: [{ ...module, moduleType: "Billing policy" }] }, ["Billing policy"]);
  assert.ok(html.includes("Billing policy"));
  const empty = render("admin", {}, []);
  assert.ok(empty.includes("Add module types in Admin Settings"));
  assert.match(empty, /disabled=""[^>]*data-testid="button-create-guideline"/);
});
