import { z } from "zod";

export const medicalRecordFields = [
  { key: "todayDate", label: "Today's Date" },
  { key: "intake", label: "Intake" },
  { key: "patientName", label: "Patient's Name" },
  { key: "clinicLocation", label: "Clinic Location" },
  { key: "requestReceived", label: "Request Received / Letter" },
  { key: "requestSent", label: "Request Sent" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "contactDetails", label: "Contact Person Details" },
  { key: "contactNumber", label: "Contact Number" },
  { key: "sentThru", label: "Sent Thru" },
  { key: "sentBy", label: "Sent By" },
  { key: "notes", label: "Notes" },
  { key: "invoice", label: "Invoice" },
  { key: "payment", label: "Payment" },
  { key: "email", label: "Email" },
  { key: "faxNumber", label: "Fax Number" },
] as const;

export type MedicalRecordField = typeof medicalRecordFields[number]["key"];
export const contactFields = ["contactPerson", "contactDetails", "contactNumber", "email", "faxNumber"] as const;
export const medicalRecordStatuses = ["pending", "sent", "completed"] as const;

const fieldShape = Object.fromEntries(medicalRecordFields.map(({ key }) => [key, z.string().max(20_000).default("")])) as Record<MedicalRecordField, z.ZodDefault<z.ZodString>>;
export const medicalRecordInputSchema = z.object({
  ...fieldShape,
  tabId: z.number().int().positive(),
  status: z.enum(medicalRecordStatuses).default("pending"),
}).strict();
export type MedicalRecordInput = z.infer<typeof medicalRecordInputSchema>;

export function emptyMedicalRecord(tabId: number, date: string, intake: string): MedicalRecordInput {
  return { ...Object.fromEntries(medicalRecordFields.map(({ key }) => [key, ""])), tabId, todayDate: date, intake, status: "pending" } as MedicalRecordInput;
}

export function applyMedicalContact<T extends MedicalRecordInput>(draft: T, contact: Record<typeof contactFields[number], string>): T {
  return { ...draft, ...Object.fromEntries(contactFields.map(key => [key, contact[key]])) };
}

export function medicalRecordDraft(record: Record<MedicalRecordField, string> & { tabId: number; status: string }): MedicalRecordInput {
  // Explicit editable-field allowlist: never send provenance/actor IDs back as
  // form fields, or let contact selection replace an entire request snapshot.
  return {
    ...Object.fromEntries(medicalRecordFields.map(({ key }) => [key, record[key]])),
    tabId: record.tabId,
    status: record.status as MedicalRecordInput["status"],
  } as MedicalRecordInput;
}
