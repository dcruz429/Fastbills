import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = readFileSync(new URL("../pages/settings.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(`${source}\nexports.UserSettings = UserSettings;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(role = "admin") {
  const exports: any = {};
  const mutations: any[] = [];
  const requests: any[] = [];
  const invalidations: any[] = [];
  const requireReal = createRequire(import.meta.url);
  runInNewContext(code, {
    exports,
    require(name: string) {
      if (name === "@/lib/auth") return { useAuth: () => ({ user: { id: 1, role }, impersonate: () => {} }) };
      if (name === "@/hooks/use-toast") return { useToast: () => ({ toast: () => {} }) };
      if (name === "@/lib/queryClient") return {
        apiRequest: async (...args: any[]) => { requests.push(args); },
        queryClient: { invalidateQueries: (args: any) => { invalidations.push(args); } },
      };
      if (name === "@tanstack/react-query") return {
        useQuery: () => ({
          data: [
            { id: 1, fullName: "Admin", role: "admin", active: true, guidelineModuleAccess: false },
            { id: 2, fullName: "Editor", role: "biller", active: true, guidelineModuleAccess: true },
            { id: 3, fullName: "Reader", role: "verifier", active: true, guidelineModuleAccess: false },
          ],
          isLoading: false,
        }),
        useMutation: (options: any) => { mutations.push(options); return { isPending: false }; },
      };
      return requireReal(name);
    },
  });
  const html = renderToStaticMarkup(createElement(exports.UserSettings));
  return { html, mutations, requests, invalidations };
}

test("admin user management renders labeled grant/revoke switches and fixed admin access", () => {
  const { html } = fixture();
  for (const [id, checked, disabled] of [[1, true, true], [2, true, false], [3, false, false]]) {
    const control = html.match(new RegExp(`<button[^>]*data-testid="switch-module-editor-${id}"[^>]*>`))?.[0];
    assert.ok(control, `switch ${id}`);
    assert.ok(control.includes(`aria-checked="${checked}"`));
    assert.equal(control.includes("disabled="), disabled);
  }
  assert.ok(html.includes("Module editor access for Editor"));
});

test("non-admin settings users cannot see module permission switches", () => {
  for (const role of ["manager", "account_manager", "case_manager"]) {
    assert.ok(!fixture(role).html.includes("switch-module-editor"));
  }
});

test("grant/revoke sends an explicit boolean and refreshes users and current permissions", async () => {
  const f = fixture();
  const mutation = f.mutations[4];
  for (const guidelineModuleAccess of [true, false]) {
    await mutation.mutationFn({ id: 3, guidelineModuleAccess });
    const request = f.requests.at(-1);
    assert.equal(request[0], "PATCH");
    assert.equal(request[1], "/api/users/3/guideline-module-access");
    assert.equal(request[2].guidelineModuleAccess, guidelineModuleAccess);
    assert.deepEqual(Object.keys(request[2]), ["guidelineModuleAccess"]);
  }
  mutation.onSuccess();
  assert.deepEqual(f.invalidations.map(args => args.queryKey[0]), ["/api/users", "/api/auth/me"]);
});

test("generic user updates cannot bypass the dedicated permission control", () => {
  const routes = readFileSync(new URL("../../../server/routes.ts", import.meta.url), "utf8");
  const route = routes.slice(routes.indexOf('app.patch("/api/users/:id",'), routes.indexOf('app.delete("/api/users/:id",'));
  assert.ok(route.indexOf('Object.hasOwn(updateData, "guidelineModuleAccess")') < route.indexOf("storage.updateUser("));
  assert.match(route, /Object.hasOwn\(updateData, "guidelineModuleAccess"\)[\s\S]*?return res.status\(403\)/);
});
