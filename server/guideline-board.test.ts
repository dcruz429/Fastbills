import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import multer from "multer";
import { registerGuidelineBoardRoutes } from "./guideline-board";

async function fixture(t: any) {
  const records = new Map<number, any>();
  let uploaded = 0;
  let nextId = 1;
  const roles = ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"];
  const users = new Map(roles.map((role, i) => [i + 1, { id: i + 1, role, active: true, guidelineModuleAccess: false, password: "private-hash" }]));
  const storage: any = {
    getDropdownOptionsByCategory: async () => [{ value: "guideline" }, { value: "training" }],
    getUser: async (id: number) => users.get(id),
    updateUser: async (id: number, data: any) => {
      const user = users.get(id);
      if (!user) return undefined;
      Object.assign(user, data);
      return user;
    },
    getAllGuidelineModules: async () => [...records.values()].map(record => ({ ...record, authorName: "Module author", updatedByName: "Module editor" })),
    getGuidelineModule: async (id: number) => records.get(id),
    createGuidelineModule: async (data: any) => {
      const record = { ...data, id: nextId++, createdAt: new Date("2026-10-13T12:00:00Z"), updatedAt: new Date("2026-10-13T12:00:00Z") };
      records.set(record.id, record);
      return record;
    },
    updateGuidelineModule: async (id: number, data: any) => {
      if (!records.has(id)) return undefined;
      const record = { ...records.get(id), ...data, updatedAt: new Date("2026-10-14T12:00:00Z") };
      records.set(id, record);
      return record;
    },
  };
  const app = express();
  app.use(express.json());
  registerGuidelineBoardRoutes(app, {
    storage,
    requireAuth(req, res, next) {
      const id = Number(req.headers["x-test-user"]);
      if (!Number.isInteger(id) || id <= 0) { res.status(401).json({ message: "Not authenticated" }); return; }
      // Test-only session on this isolated ephemeral server, never the application.
      (req as any).session = { userId: id };
      next();
    },
    upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }),
    saveUploadedFiles: async files => files.map(file => `/api/files/${++uploaded}|${file.originalname}`),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/guideline-modules`;
  return {
    records, storage, users, get uploaded() { return uploaded; },
    async access(id: string | number, guidelineModuleAccess: unknown, user = 1) {
      const response = await fetch(`${base.replace("/api/guideline-modules", "/api/users")}/${id}/guideline-module-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) },
        body: JSON.stringify({ guidelineModuleAccess, role: "admin", active: false }),
      });
      return { status: response.status, body: await response.json() };
    },
    async call(method: string, body?: any, id?: string | number, user = 1) {
      const headers: Record<string, string> = user ? { "x-test-user": String(user) } : {};
      if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
      const response = await fetch(`${base}${id !== undefined ? `/${id}` : ""}`, {
        method, headers, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

const content = { title: "Verification steps", body: "Follow these instructions.\nSecond step.", moduleType: "guideline" };
function form(data = content) {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.append(key, value);
  return result;
}

test("Guideline Board requires authentication for reads and writes", async t => {
  const f = await fixture(t);
  for (const method of ["GET", "POST", "PATCH"]) {
    const result = await f.call(method, method === "GET" ? undefined : content, method === "PATCH" ? 1 : undefined, 0);
    assert.equal(result.status, 401);
  }
  assert.equal(f.records.size, 0);
});

test("admin creates and edits the same module, preserving its author and original creation date", async t => {
  const f = await fixture(t);
  const created = await f.call("POST", { ...content, title: "  Verification steps  ", authorId: 999, updatedById: 999 });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, content.title);
  assert.equal(created.body.authorId, 1);
  assert.equal(created.body.updatedById, 1);
  const updated = await f.call("PATCH", { ...content, body: "Updated guidance", moduleType: "training", createdAt: "2099-01-01" }, created.body.id);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.id, created.body.id);
  assert.equal(updated.body.body, "Updated guidance");
  assert.equal(updated.body.moduleType, "training");
  assert.equal(updated.body.createdAt, created.body.createdAt);
  assert.notEqual(updated.body.updatedAt, created.body.updatedAt);
  const loaded = await f.call("GET", undefined, undefined, 3);
  assert.equal(loaded.body[0].body, "Updated guidance");
  assert.equal(loaded.body[0].moduleType, "training");
  assert.equal(f.records.size, 1);
});

test("every other staff role can read modules but cannot create or edit, even with a forged admin payload", async t => {
  const f = await fixture(t);
  await f.call("POST", content);
  for (const user of [2, 3, 4, 5, 6, 7, 8]) {
    assert.equal((await f.call("GET", undefined, undefined, user)).status, 200);
    assert.equal((await f.call("POST", { ...content, role: "admin", guidelineModuleAccess: true }, undefined, user)).status, 403);
    assert.equal((await f.call("PATCH", { ...content, body: "Unauthorized edit" }, 1, user)).status, 403);
  }
  assert.equal(f.records.get(1).body, content.body);
  assert.equal(f.records.size, 1);
});

test("admin can grant and revoke authoring for every staff role without changing roles or exposing passwords", async t => {
  const f = await fixture(t);
  const original = await f.call("POST", content);
  for (const user of [2, 3, 4, 5, 6, 7, 8]) {
    const role = f.users.get(user)!.role;
    const granted = await f.access(user, true);
    assert.equal(granted.status, 200);
    assert.equal(granted.body.guidelineModuleAccess, true);
    assert.equal(granted.body.password, undefined);
    assert.equal(granted.body.role, role);
    assert.equal(granted.body.active, true);
    const created = await f.call("POST", content, undefined, user);
    assert.equal(created.status, 201);
    assert.equal(created.body.authorId, user);
    const edited = await f.call("PATCH", { ...content, body: "Delegated edit" }, original.body.id, user);
    assert.equal(edited.status, 200);
    assert.equal(edited.body.authorId, 1);
    assert.equal(edited.body.updatedById, user);
    assert.equal((await f.access(user, false)).status, 200);
    assert.equal((await f.call("POST", content, undefined, user)).status, 403);
    assert.equal((await f.call("PATCH", content, original.body.id, user)).status, 403);
    assert.equal((await f.call("GET", undefined, undefined, user)).status, 200);
  }
});

test("only active admins may change module editor access, including for themselves", async t => {
  const f = await fixture(t);
  assert.equal((await f.access(3, true, 0)).status, 401);
  for (const user of [2, 3, 4, 5, 6, 7, 8]) {
    await f.access(user, true);
    assert.equal((await f.access(user, true, user)).status, 403);
    assert.equal((await f.access(3, false, user)).status, 403);
  }
  f.users.get(1)!.active = false;
  assert.equal((await f.access(3, true)).status, 403);
});

test("access changes validate users and boolean values and cannot revoke automatic admin access", async t => {
  const f = await fixture(t);
  for (const id of ["abc", "1.5", "-1"]) assert.equal((await f.access(id, true)).status, 400);
  assert.equal((await f.access(999, true)).status, 404);
  assert.equal((await f.access(1, false)).status, 400);
  for (const value of ["false", 1, null, undefined, {}]) assert.equal((await f.access(3, value)).status, 400);
  assert.equal(f.users.get(3)!.guidelineModuleAccess, false);
  await f.access(3, true);
  f.users.get(3)!.active = false;
  assert.equal((await f.call("POST", content, undefined, 3)).status, 403);
  assert.equal((await f.call("PATCH", content, 1, 3)).status, 403);
});

test("missing, whitespace, overlong and invalid module fields cannot be saved", async t => {
  const f = await fixture(t);
  for (const bad of [
    { ...content, title: "" }, { ...content, title: "   " }, { ...content, title: "x".repeat(201) },
    { ...content, body: "   " }, { ...content, body: "x".repeat(100_001) },
    { ...content, moduleType: "announcement" }, { title: content.title },
  ]) assert.equal((await f.call("POST", bad)).status, 400);
  assert.equal(f.records.size, 0);
});

test("editing rejects invalid or missing module IDs and never creates a replacement record", async t => {
  const f = await fixture(t);
  for (const id of ["abc", "-1", "1.5"]) assert.equal((await f.call("PATCH", content, id)).status, 400);
  assert.equal((await f.call("PATCH", content, 999)).status, 404);
  assert.equal(f.records.size, 0);
});

test("real multipart uploads survive edits, can be replaced or removed, and do not erase content", async t => {
  const f = await fixture(t);
  const original = form();
  original.append("attachments", new Blob(["Reference file"], { type: "text/plain" }), "steps.txt");
  const created = await f.call("POST", original);
  assert.equal(created.status, 201);
  const attachment = created.body.attachments[0];
  assert.equal(attachment, "/api/files/1|steps.txt");
  const textOnly = await f.call("PATCH", { ...content, body: "Changed text" }, created.body.id);
  assert.deepEqual(textOnly.body.attachments, [attachment]);
  const replacement = form();
  replacement.append("retainedAttachments", "[]");
  replacement.append("attachments", new Blob(["Replacement"], { type: "text/plain" }), "new-steps.txt");
  const updated = await f.call("PATCH", replacement, created.body.id);
  assert.deepEqual(updated.body.attachments, ["/api/files/2|new-steps.txt"]);
  const cleared = await f.call("PATCH", { ...content, retainedAttachments: [] }, created.body.id);
  assert.deepEqual(cleared.body.attachments, []);
  assert.equal(f.records.size, 1);
});

test("retained attachments must belong to the module and malformed values do not erase saved files", async t => {
  const f = await fixture(t);
  f.records.set(1, { ...content, id: 1, attachments: ["/api/files/1|safe.txt"], authorId: 1 });
  for (const retainedAttachments of ["not-json", ["/api/files/2|other.txt"], ["javascript:alert(1)"], [123], {}]) {
    assert.equal((await f.call("PATCH", { ...content, retainedAttachments }, 1)).status, 400);
  }
  assert.deepEqual(f.records.get(1).attachments, ["/api/files/1|safe.txt"]);
});

test("unsafe attachment types and excessive attachment counts fail before storing files", async t => {
  const f = await fixture(t);
  const unsafe = form();
  unsafe.append("attachments", new Blob(["<script>bad</script>"], { type: "text/html" }), "bad.txt");
  assert.equal((await f.call("POST", unsafe)).status, 400);
  const excessive = form();
  for (let i = 0; i < 11; i++) excessive.append("attachments", new Blob(["file"], { type: "text/plain" }), `file${i}.txt`);
  assert.equal((await f.call("POST", excessive)).status, 400);
  assert.equal(f.uploaded, 0);
  assert.equal(f.records.size, 0);
});

test("storage errors are reported and deactivated users cannot author modules", async t => {
  const f = await fixture(t);
  f.storage.createGuidelineModule = async () => { throw new Error("Internal database detail"); };
  const failed = await f.call("POST", content);
  assert.equal(failed.status, 500);
  assert.ok(!JSON.stringify(failed.body).includes("Internal database detail"));
  f.storage.getUser = async () => ({ id: 1, role: "admin", active: false });
  assert.equal((await f.call("POST", content)).status, 403);
  assert.equal((await f.call("GET")).status, 403);
});

test("configured custom module types are accepted and historical types survive retirement without becoming new choices", async t => {
  const f = await fixture(t);
  f.storage.getDropdownOptionsByCategory = async () => [{ value: "Billing policy" }, { value: "all" }];
  const created = await f.call("POST", { ...content, moduleType: "Billing policy" });
  assert.equal(created.status, 201);
  assert.equal(created.body.moduleType, "Billing policy");
  assert.equal((await f.call("POST", { ...content, moduleType: "all" })).status, 201);
  f.storage.getDropdownOptionsByCategory = async () => [];
  const edited = await f.call("PATCH", { ...content, moduleType: "Billing policy", body: "Revised policy" }, created.body.id);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.moduleType, "Billing policy");
  assert.equal((await f.call("POST", { ...content, moduleType: "Billing policy" })).status, 400);
  assert.equal((await f.call("PATCH", { ...content, moduleType: "Retired other type" }, created.body.id)).status, 400);
  assert.equal(f.records.get(created.body.id).body, "Revised policy");
});
