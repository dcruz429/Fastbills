import XLSX from "xlsx";
import { contactFields, medicalRecordFields, type MedicalRecordField } from "../shared/medical-records";
import { createHash } from "node:crypto";

export const MEDICAL_HISTORY_SOURCE = "medical-records-request-original-workbook";
export const MEDICAL_HISTORY_FILE = "attached_assets/Medical_Records_Request_Done_(ultimo)_1792610396999.xlsx";

const headerKeys: Record<string, MedicalRecordField> = {
  todaysdate: "todayDate", intake: "intake", patientsname: "patientName",
  cliniclocation: "clinicLocation", requestreceived: "requestReceived",
  requestreceivedletter: "requestReceived", requestsent: "requestSent",
  contactperson: "contactPerson", contactpersondetails: "contactDetails",
  contactnumber: "contactNumber", sentthru: "sentThru", sentby: "sentBy",
  notes: "notes", invoice: "invoice", payment: "payment", email: "email", faxnumber: "faxNumber",
};

export function medicalCellText(value: unknown, numberFormat?: string, date1904 = false): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && numberFormat && XLSX.SSF.is_date(numberFormat)) {
    const date = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!date) throw new Error("Invalid workbook date");
    return `${String(date.m).padStart(2, "0")}/${String(date.d).padStart(2, "0")}/${String(date.y).padStart(4, "0")}`;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid workbook date");
    // Workbook dates represent calendar days, not local instants.
    return `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${String(value.getUTCFullYear()).padStart(4, "0")}`;
  }
  return String(value);
}

export function contactFingerprint(contact: Record<typeof contactFields[number], string>): string {
  return createHash("sha256").update(JSON.stringify(contactFields.map(key => contact[key].trim().toLowerCase()))).digest("hex");
}

export function reusableMedicalContact(record: Record<typeof contactFields[number], string>) {
  if (!contactFields.some(key => record[key].trim())) return null;
  const contact = Object.fromEntries(contactFields.map(key => [key, record[key]])) as Record<typeof contactFields[number], string>;
  return { ...contact, fingerprint: contactFingerprint(contact) };
}

export function parseMedicalWorkbook(workbook: XLSX.WorkBook) {
  const tabs: { name: string; sortOrder: number }[] = [];
  const requests: (Record<MedicalRecordField, string> & {
    tabName: string; sourceKey: string; sourceSheet: string; sourceRow: number; status: string;
  })[] = [];
  let ignoredRows = 0;
  for (let sortOrder = 0; sortOrder < workbook.SheetNames.length; sortOrder++) {
    const sheetName = workbook.SheetNames[sortOrder];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: true });
    const headerIndex = rows.findIndex(row => row.some(cell => String(cell ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "patientsname"));
    if (headerIndex < 0) throw new Error(`Workbook tab ${sortOrder + 1} has no patient header`);
    const name = sheetName.trim();
    if (!name || tabs.some(tab => tab.name === name)) throw new Error("Workbook clinic tabs must have unique names");
    tabs.push({ name, sortOrder });
    const mapped = rows[headerIndex].map(cell => headerKeys[String(cell ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()]);
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row.some(value => medicalCellText(value).trim())) continue;
      const record = Object.fromEntries(medicalRecordFields.map(({ key }) => [key, ""])) as Record<MedicalRecordField, string>;
      row.forEach((value, column) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: i, c: column })];
        if (mapped[column]) record[mapped[column]] = medicalCellText(value, cell?.z, !!workbook.Workbook?.WBProps?.date1904);
      });
      // Excel's copied formatting rows contain stray phone/email placeholders,
      // but no request identifiers. Keep genuine partial requests (e.g. date + intake).
      if (!["todayDate", "intake", "patientName", "clinicLocation", "requestReceived", "requestSent"]
        .some(key => record[key as MedicalRecordField].trim())) { ignoredRows++; continue; }
      if (row.some((value, column) => !mapped[column] && medicalCellText(value).trim())) {
        throw new Error(`Unmapped workbook values in tab ${sortOrder + 1}, row ${i + 1}`);
      }
      requests.push({
        ...record, tabName: name, sourceSheet: sheetName, sourceRow: i + 1,
        sourceKey: `${MEDICAL_HISTORY_SOURCE}:${sheetName}:${i + 1}`,
        status: record.requestSent.trim() ? "completed" : "pending",
      });
    }
  }
  return { tabs, requests, ignoredRows };
}

export function readMedicalWorkbook(path: string) {
  return parseMedicalWorkbook(XLSX.readFile(path, { cellDates: false, cellNF: true }));
}
