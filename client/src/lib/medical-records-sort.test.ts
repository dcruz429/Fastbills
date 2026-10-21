import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyMedicalRecord } from "../../../shared/medical-records";
import { sortMedicalRecords, type MedicalRecordSortKey } from "./medical-records-sort";

function row(id: number, values: object = {}) {
  return { ...emptyMedicalRecord(1, "", ""), id, ...values };
}

test("text sorting is case-insensitive and natural, preserves matching ties, and never changes source records", () => {
  const rows = [row(1, { patientName: "Patient 10" }), row(2, { patientName: "patient 2" }), row(3, { patientName: "Patient 2" })];
  assert.deepEqual(sortMedicalRecords(rows, { key: "patientName", direction: "asc" }).map(r => r.id), [2, 3, 1]);
  assert.deepEqual(sortMedicalRecords(rows, { key: "patientName", direction: "desc" }).map(r => r.id), [1, 2, 3]);
  assert.deepEqual(rows.map(r => r.id), [1, 2, 3]);
  assert.equal(sortMedicalRecords(rows, null), rows);
});

test("date columns sort chronologically across years, including annotated dates and date ranges", () => {
  for (const key of ["todayDate", "requestReceived", "requestSent"] as MedicalRecordSortKey[]) {
    const rows = [
      row(1, { [key]: "01/01/2025" }), row(2, { [key]: "12/31/2023" }),
      row(3, { [key]: "2/1/24 (letter)" }), row(4, { [key]: "03/01/2024-03/10/2024" }),
    ];
    assert.deepEqual(sortMedicalRecords(rows, { key, direction: "asc" }).map(r => r.id), [2, 3, 4, 1]);
    assert.deepEqual(sortMedicalRecords(rows, { key, direction: "desc" }).map(r => r.id), [1, 4, 3, 2]);
    assert.equal(rows[2][key], "2/1/24 (letter)");
  }
});

test("unrecognized historical dates follow valid dates and blanks stay last in both directions", () => {
  const rows = [
    row(1, { requestReceived: "" }), row(2, { requestReceived: "02/31/2024" }),
    row(3, { requestReceived: "01/01/2024" }), row(4, { requestReceived: "12/31/2024" }),
    row(5, { requestReceived: "05/005/23" }), row(6, { requestReceived: " \t " }),
  ];
  assert.deepEqual(sortMedicalRecords(rows, { key: "requestReceived", direction: "asc" }).map(r => r.id), [3, 4, 2, 5, 1, 6]);
  assert.deepEqual(sortMedicalRecords(rows, { key: "requestReceived", direction: "desc" }).map(r => r.id), [4, 3, 5, 2, 1, 6]);
});

test("all non-date fields, including invoice/payment notes and status, sort without guessing monetary meaning", () => {
  for (const key of ["contactPerson", "contactDetails", "contactNumber", "clinicLocation", "intake", "sentThru", "sentBy", "email", "faxNumber", "invoice", "payment", "notes", "status"] as MedicalRecordSortKey[]) {
    const rows = [row(1, { [key]: "B 10" }), row(2, { [key]: "a 2" }), row(3, { [key]: "" })];
    assert.deepEqual(sortMedicalRecords(rows, { key, direction: "asc" }).map(r => r.id), [2, 1, 3]);
    assert.deepEqual(sortMedicalRecords(rows, { key, direction: "desc" }).map(r => r.id), [1, 2, 3]);
  }
});
