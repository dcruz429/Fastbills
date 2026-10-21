import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import XLSX from "xlsx";
import { registerMedicalRecordsRoutes } from "./medical-records-routes";
import { contactFingerprint, medicalCellText, MEDICAL_HISTORY_FILE, parseMedicalWorkbook, readMedicalWorkbook, reusableMedicalContact } from "./medical-records-import";
import { applyMedicalContact, contactFields, emptyMedicalRecord, medicalRecordDraft, medicalRecordFields, medicalRecordInputSchema } from "../shared/medical-records";

const history = readMedicalWorkbook(MEDICAL_HISTORY_FILE);

test("workbook import keeps all 18 tabs in order and every actual request, including the partial request", () => {
  assert.deepEqual(history.tabs.map(tab => tab.name), ["URGENT", "HW", "GC", "MV", "AN", "CA", "RH", "EL", "SB", "MA", "QB", "HA", "JA", "No Foud", "BX", "AA", "AKNY", "FM"]);
  assert.equal(history.requests.length, 1180);
  assert.equal(history.requests.filter(row => row.patientName.trim()).length, 1179);
  assert.equal(history.ignoredRows, 16);
  assert.equal(new Set(history.requests.map(row => row.sourceKey)).size, 1180);
  assert.deepEqual(history.tabs.map(tab => history.requests.filter(row => row.tabName === tab.name).length),
    [54, 318, 15, 6, 11, 116, 149, 62, 3, 1, 384, 4, 1, 2, 6, 27, 1, 20]);
});

test("No Foud's shorter column layout maps notes, invoice, payment and contact fields by header, not fixed positions", () => {
  const rows = history.requests.filter(row => row.tabName === "No Foud");
  const workbook = XLSX.readFile(MEDICAL_HISTORY_FILE);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["No Foud"], { header: 1, defval: null });
  for (const row of rows) {
    for (const [key, column] of [["notes", 6], ["invoice", 7], ["payment", 8], ["email", 9], ["faxNumber", 10]] as const) {
      assert.ok(row[key] === String(raw[row.sourceRow - 1][column] ?? ""), `short-layout field ${key} must match workbook`);
    }
    assert.equal(row.contactDetails, "");
    assert.equal(row.contactNumber, "");
  }
  assert.ok(history.requests.filter(row => row.tabName === "GC").every(row => row.sourceSheet === "GC "));
});

test("calendar dates do not depend on server timezone, and annotated, ranged or mistyped text dates remain exact", () => {
  assert.equal(medicalCellText(45000, "mm/dd/yyyy"), "03/15/2023");
  assert.equal(medicalCellText(0, "mm/dd/yyyy", true), "01/01/1904");
  assert.equal(medicalCellText(1234567890, "General"), "1234567890");
  for (const value of ["05/005/23", "4/29/2024 (mail)", "09/03/26-09/11/26", "6/17/0226", "09//28/26"]) {
    assert.ok(history.requests.some(row => [row.todayDate, row.requestReceived, row.requestSent].includes(value)));
    assert.equal(medicalCellText(value), value);
  }
  assert.ok(history.requests.every(row => row.status === (row.requestSent.trim() ? "completed" : "pending")));
});

test("unknown workbook columns with actual data fail instead of silently dropping information", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Patient's Name", "Unknown field"], ["Synthetic patient", "Keep me"],
  ]), "Clinic");
  assert.throws(() => parseMedicalWorkbook(workbook), /Unmapped workbook values/);
});

test("contacts deduplicate exact normalized variants but retain different phone/email/fax snapshots", () => {
  const base = { contactPerson: "Synthetic Person", contactDetails: "Example organization", contactNumber: "555-0100", email: "example@example.test", faxNumber: "" };
  assert.equal(contactFingerprint(base), contactFingerprint({ ...base, contactPerson: " synthetic PERSON " }));
  for (const key of contactFields) assert.notEqual(contactFingerprint(base), contactFingerprint({ ...base, [key]: `${base[key]} changed` }));
  assert.equal(reusableMedicalContact({ contactPerson: "", contactDetails: " ", contactNumber: "", email: "", faxNumber: "" }), null);
  const contacts = history.requests.map(reusableMedicalContact).filter(Boolean);
  assert.equal(new Set(contacts.map(contact => contact!.fingerprint)).size, 944);
});

test("contact selection replaces all five fields, clears missing values, and preserves patient/request info", () => {
  const draft = { ...emptyMedicalRecord(3, "10/21/2026", "Staff"), patientName: "Synthetic Patient", notes: "Keep", contactNumber: "Old", email: "old@example.test", faxNumber: "Old fax" };
  const contact = { contactPerson: "New", contactDetails: "Organization", contactNumber: "555-0123", email: "", faxNumber: "" };
  const result = applyMedicalContact(draft, contact);
  for (const key of contactFields) assert.equal(result[key], contact[key]);
  assert.equal(result.patientName, draft.patientName);
  assert.equal(result.notes, "Keep");
  assert.equal(result.tabId, 3);
  assert.equal(draft.email, "old@example.test");
});

test("editing strips read-only metadata and leaves every workbook field editable, including free-form contact info", () => {
  const record = { ...emptyMedicalRecord(3, "10/21/2026", "Staff"), id: 99, sourceKey: "source", sourceSheet: "GC ", sourceRow: 3, updatedById: 1 };
  const draft = medicalRecordDraft(record);
  assert.ok(medicalRecordInputSchema.safeParse(draft).success);
  assert.deepEqual(Object.keys(draft).sort(), [...medicalRecordFields.map(field => field.key), "tabId", "status"].sort());
  const custom = { ...draft, email: "first@example.test / second@example.test", faxNumber: "Extension 12", contactDetails: "Completely new organization" };
  assert.ok(medicalRecordInputSchema.safeParse(custom).success);
  assert.ok(!medicalRecordInputSchema.safeParse({ ...draft, sourceKey: "forged" }).success);
});

async function fixture(t: any) {
  const records = new Map<number, any>();
  const contacts = new Map<string, any>();
  let nextId = 1;
  let ensureCalls = 0;
  const roles = ["admin", "manager", "verifier", "biller", "assigner", "payment_specialist", "account_manager", "case_manager"];
  const users = new Map(roles.map((role, index) => [index + 1, { id: index + 1, role, active: true }]));
  const repository: any = {
    list: async () => ({ tabs: [{ id: 1, name: "HW", sortOrder: 0 }, { id: 2, name: "GC", sortOrder: 1 }], requests: Array.from(records.values()), contacts: Array.from(contacts.values()), importSummary: null }),
    get: async (id: number) => records.get(id),
    getTab: async (id: number) => [1, 2].includes(id) ? { id } : undefined,
    save: async (data: any, actor: number, id?: number) => {
      const current = id ? records.get(id) : undefined;
      if (id && !current) return undefined;
      const row = { ...current, ...data, id: id ?? nextId++, createdById: current ? current.createdById : actor, updatedById: actor };
      const contact = reusableMedicalContact(data);
      if (contact) contacts.set(contact.fingerprint, contact);
      records.set(row.id, row);
      return row;
    },
    delete: async (id: number) => records.delete(id),
  };
  const app = express();
  app.use(express.json());
  registerMedicalRecordsRoutes(app, {
    storage: { getUser: async (id: number) => users.get(id) as any }, repository,
    ensureHistory: async () => { ensureCalls++; },
    requireAuth(req, res, next) {
      const user = Number(req.headers["x-test-user"]);
      if (!user) { res.status(401).json({ message: "Not authenticated" }); return; }
      (req as any).session = { userId: user };
      next();
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/medical-records`;
  return {
    records, users, repository, contacts, get ensureCalls() { return ensureCalls; },
    async call(method = "GET", body?: unknown, id?: string | number, user = 1) {
      const response = await fetch(`${base}${id === undefined ? "" : `/${id}`}`, {
        method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

const input = { ...emptyMedicalRecord(1, "10/21/2026", "Synthetic Intake"), patientName: "Synthetic Patient", contactPerson: "Contact", contactDetails: "Example", email: "first@example.test / second@example.test", faxNumber: "555-0123" };

test("medical requests require authentication on all endpoints", async t => {
  const f = await fixture(t);
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await f.call(method, method === "POST" || method === "PATCH" ? input : undefined, method === "PATCH" || method === "DELETE" ? 1 : undefined, 0)).status, 401);
});

test("every active staff role can read, create and edit requests without changing their original creator", async t => {
  const f = await fixture(t);
  for (const user of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.equal((await f.call("GET", undefined, undefined, user)).status, 200);
    const created = await f.call("POST", input, undefined, user);
    assert.equal(created.status, 201);
    assert.equal(created.body.createdById, user);
    const edited = await f.call("PATCH", { ...input, tabId: 2, notes: "Changed", payment: "Received", status: "completed" }, created.body.id, 1);
    assert.equal(edited.status, 200);
    assert.equal(edited.body.createdById, user);
    assert.equal(edited.body.updatedById, 1);
    assert.equal(edited.body.tabId, 2);
    assert.equal(edited.body.status, "completed");
  }
  assert.equal(f.records.size, 8);
  assert.equal(f.ensureCalls, 8);
});

test("saving new contact info makes it reusable without changing previous request contact snapshots", async t => {
  const f = await fixture(t);
  const first = await f.call("POST", input);
  const second = await f.call("POST", { ...input, email: "new@example.test", contactNumber: "555-9999" });
  assert.equal(second.status, 201);
  assert.equal(f.contacts.size, 2);
  const loaded = await f.call();
  assert.equal(loaded.body.contacts.length, 2);
  assert.equal(f.records.get(first.body.id).email, input.email);
  assert.equal(f.records.get(first.body.id).contactNumber, "");
});

test("legacy Sent requests load, edit and save as Completed without rewriting history on read", async t => {
  const f = await fixture(t);
  f.records.set(20, { ...input, id: 20, status: "sent", sourceSheet: "HW", sourceRow: 3 });
  const loaded = await f.call();
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.requests[0].status, "completed");
  assert.equal(f.records.get(20).status, "sent");
  assert.equal(medicalRecordDraft(f.records.get(20)).status, "completed");
  const created = await f.call("POST", { ...input, status: "sent" });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "completed");
  assert.equal(f.records.get(created.body.id).status, "completed");
  const edited = await f.call("PATCH", { ...input, status: "sent" }, 20);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.status, "completed");
  assert.equal(edited.body.sourceSheet, "HW");
  assert.equal(edited.body.sourceRow, 3);
});

test("invalid inputs and forged provenance fail; imported incomplete requests can be corrected without losing history", async t => {
  const f = await fixture(t);
  for (const body of [
    { ...input, patientName: " " }, { ...input, tabId: 999 }, { ...input, tabId: "1" },
    { ...input, status: "unknown" }, { ...input, notes: "x".repeat(20_001) }, { ...input, createdById: 999 },
    { ...input, sourceKey: "forged" }, { ...input, email: {} },
  ]) assert.equal((await f.call("POST", body)).status, 400);
  f.records.set(20, { ...input, id: 20, patientName: "", sourceSheet: "URGENT", sourceRow: 33, createdById: null });
  const edited = await f.call("PATCH", { ...input, patientName: "", notes: "Preserved incomplete request" }, 20);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.sourceRow, 33);
  assert.equal(edited.body.createdById, null);
  assert.equal((await f.call("PATCH", { ...input, patientName: "Corrected" }, 20)).status, 200);
  assert.equal((await f.call("PATCH", { ...input, patientName: "" }, 20)).status, 400);
});

test("only admins can delete, invalid/missing IDs are explicit, and inactive users cannot access records", async t => {
  const f = await fixture(t);
  const created = await f.call("POST", input);
  for (const user of [2, 3, 4, 5, 6, 7, 8]) assert.equal((await f.call("DELETE", undefined, created.body.id, user)).status, 403);
  for (const id of ["abc", "-1", "1.5", "0", "99999999999999999999"]) {
    assert.equal((await f.call("PATCH", input, id)).status, 400);
    assert.equal((await f.call("DELETE", undefined, id)).status, 400);
  }
  assert.equal((await f.call("PATCH", input, 999)).status, 404);
  assert.equal((await f.call("DELETE", undefined, 999)).status, 404);
  f.users.get(3)!.active = false;
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await f.call(method, ["POST", "PATCH"].includes(method) ? input : undefined, ["PATCH", "DELETE"].includes(method) ? created.body.id : undefined, 3)).status, 403);
  assert.equal((await f.call("DELETE", undefined, created.body.id)).status, 200);
  assert.equal(f.records.size, 0);
});

test("storage and import errors return explicit safe errors without patient payloads or internals", async t => {
  const f = await fixture(t);
  f.repository.list = async () => { throw new Error("Private database detail"); };
  const loaded = await f.call();
  assert.equal(loaded.status, 500);
  assert.ok(!JSON.stringify(loaded.body).includes("Private"));
  f.repository.save = async () => { throw new Error("Private patient payload"); };
  const saved = await f.call("POST", input);
  assert.equal(saved.status, 500);
  assert.ok(!JSON.stringify(saved.body).includes("Private"));
  assert.equal(f.records.size, 0);
});
