import type { Task, User } from "../shared/schema";
import {
  PATIENT_OVERVIEW_SECTIONS, calculatePatientTotals,
  type PatientOverviewRecord, type PatientOverviewResponse, type PatientOverviewSectionId,
} from "../shared/patient-overview";

export interface PatientTaskRow {
  task: Task;
  clinic: string | null;
  insurance: string | null;
  assignedTo: string | null;
}

export interface PatientTrackerRow {
  id: number;
  patientName: string | null;
  clinic: string | null;
  insurance: string | null;
  assignedTo: string | null;
  status: string | null;
  outcome: string | null;
  amount: string | null;
  createdAt: Date;
}

export interface PatientOverviewData {
  tasks: PatientTaskRow[];
  posting: PatientTrackerRow[];
  collections: PatientTrackerRow[];
  denials: PatientTrackerRow[];
  arbitration: PatientTrackerRow[];
  checks: PatientTrackerRow[];
}

const BROAD_ROLES = ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"];
const CHECKS_ROLES = ["admin", "payment_specialist", "account_manager"];
const PAYMENT_DOC_ROLES = ["admin", "payment_specialist", "account_manager", "case_manager", "manager"];
const DETAILS: [string, string][] = [
  ["paid", "PAID"],
  ["chartNumber", "Chart #"], ["priority", "Priority"], ["bucket", "Source bucket"],
  ["ieDate", "IE Date"], ["dueDate", "Due Date"], ["doa", "DOA"],
  ["resolutionDate", "Resolution Date"], ["inputDate", "Input Date"],
  ["dateInput", "Date Input"], ["dosFrom", "DOS From"], ["dosTo", "DOS To"],
  ["numberOfVisits", "# of Visits"], ["numberOfDays", "# of Days"],
  ["division", "Division"], ["issueType", "Issue Type"], ["typeOfDenial", "Type of Denial"],
  ["denialFileName", "File Name"], ["fileNumber", "File #"], ["fileName", "File Name"],
  ["documentType", "Document Type"], ["dateOfLetter", "Date of Letter"],
  ["effectiveDate", "Effective Date"], ["filedTo", "Filed To"], ["arbStatus", "ARB Status"],
  ["trialDate", "Trial Date"], ["arbPaymentStatus", "ARB Payment Status"],
  ["amountReceived", "Amount Received"], ["checkedBy", "Checked By"], ["intake", "Intake"],
  ["checkNumber", "Check #"], ["type", "Check Type"], ["checkDate", "Check Date"],
  ["scannedDate", "Scanned Date"], ["postedDate", "Posted Date"], ["depositDate", "Deposit Date"],
  ["depositedBy", "Deposited By"], ["activity", "Action"], ["action", "Action"],
  ["notes", "Notes"], ["comments", "Comments"], ["comment", "Comment"],
];

function dateValue(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function detailsFor(record: object) {
  const data = record as Record<string, unknown>;
  return DETAILS.flatMap(([field, label]) => {
    const value = data[field];
    if (value === null || value === undefined || value === "") return [];
    return [{ label, value: typeof value === "boolean" ? (value ? "Yes" : "No") : value instanceof Date ? dateValue(value)?.slice(0, 10) || "Invalid date" : String(value) }];
  });
}

export function buildPatientOverview(query: string, data: PatientOverviewData, viewer: Pick<User, "id" | "role" | "fullName">): PatientOverviewResponse {
  const sections = PATIENT_OVERVIEW_SECTIONS.map(section => ({
    ...section, records: [] as PatientOverviewRecord[], totals: calculatePatientTotals([]),
  }));
  const recordsFor = (id: PatientOverviewSectionId) => sections.find(section => section.id === id)!.records;

  for (const row of data.tasks) {
    const task = row.task;
    // Normal task listings move dropped tasks to Done, where Billing hides
    // them. Exclude them here without performing that write as a search effect.
    if (task.status === "dropped") continue;
    const sectionId = task.bucket === "for_verification" ? "verification" : "billing";
    const path = sectionId === "verification" ? "/verification" : "/";
    const canOpen = !["verifier", "biller"].includes(viewer.role) || task.assignedUserId === viewer.id;
    const allowedPage = sectionId !== "verification" || viewer.role !== "biller";
    recordsFor(sectionId).push({
      id: task.id, patientName: task.patientName, clinic: row.clinic,
      insurance: row.insurance, assignedTo: row.assignedTo, status: task.status,
      state: task.bucket === "done" || task.status === "done" ? "done" : "open",
      outcome: task.outcome, amount: null, date: dateValue(task.inputDate),
      sourceUrl: canOpen && allowedPage ? `${path}?edit=${task.id}` : null,
      details: detailsFor(task),
    });
  }

  for (const section of sections) {
    if (section.id === "verification" || section.id === "billing") continue;
    for (const record of data[section.id]) {
      let canOpen = BROAD_ROLES.includes(viewer.role) || record.assignedTo === viewer.fullName;
      if (section.id === "checks") canOpen = CHECKS_ROLES.includes(viewer.role);
      if (section.id === "posting" && (record as PatientTrackerRow & { documentType?: string }).documentType?.toLowerCase() === "payment") {
        canOpen = canOpen && PAYMENT_DOC_ROLES.includes(viewer.role);
      }
      section.records.push({
        id: record.id, patientName: record.patientName || "", clinic: record.clinic,
        insurance: record.insurance, assignedTo: record.assignedTo,
        status: record.status || "Unassigned",
        state: (record.status || "").trim().toLowerCase() === "done" ? "done" : "open",
        outcome: record.outcome, amount: record.amount, date: dateValue(record.createdAt),
        sourceUrl: canOpen ? `${section.path}?edit=${record.id}` : null,
        details: detailsFor(record),
      });
    }
  }
  for (const section of sections) section.totals = calculatePatientTotals(section.records);
  return { query, sections, totals: calculatePatientTotals(sections.flatMap(section => section.records)) };
}
