import { countedTrackerAmount } from "./tracker-amounts";

export const PATIENT_OVERVIEW_SECTIONS = [
  { id: "verification", label: "Verification", path: "/verification", hasAmounts: false },
  { id: "billing", label: "Billing", path: "/", hasAmounts: false },
  { id: "posting", label: "Posting", path: "/posting", hasAmounts: true },
  { id: "collections", label: "Collections", path: "/collections", hasAmounts: true },
  { id: "denials", label: "Denials", path: "/denials", hasAmounts: true },
  { id: "arbitration", label: "Arbitration", path: "/arbitration", hasAmounts: true },
  { id: "checks", label: "Checks", path: "/checks", hasAmounts: true },
] as const;

export type PatientOverviewSectionId = typeof PATIENT_OVERVIEW_SECTIONS[number]["id"];

export interface PatientOverviewRecord {
  id: number;
  patientName: string;
  clinic: string | null;
  insurance: string | null;
  assignedTo: string | null;
  status: string;
  state: "open" | "done";
  outcome: string | null;
  amount: string | null;
  date: string | null;
  sourceUrl: string | null;
  details: { label: string; value: string }[];
}

export interface PatientOverviewTotal {
  count: number;
  amount: number;
}

export interface PatientOverviewTotals {
  open: PatientOverviewTotal;
  done: PatientOverviewTotal;
  grandTotal: PatientOverviewTotal;
}

export interface PatientOverviewSection {
  id: PatientOverviewSectionId;
  label: string;
  hasAmounts: boolean;
  records: PatientOverviewRecord[];
  totals: PatientOverviewTotals;
}

export interface PatientOverviewResponse {
  query: string;
  sections: PatientOverviewSection[];
  totals: PatientOverviewTotals;
}

export function patientSearchTokens(query: string): string[] {
  return Array.from(new Set(query.toLocaleLowerCase("en-US").match(new RegExp("[\\p{L}\\p{N}]+", "gu")) || []));
}

export function matchesPatientName(name: string | null, query: string): boolean {
  const tokens = patientSearchTokens(query);
  const normalized = patientSearchTokens(name || "").join(" ");
  return tokens.length > 0 && tokens.every(token => normalized.includes(token));
}

export function calculatePatientTotals(records: readonly (Pick<PatientOverviewRecord, "state" | "amount"> & Partial<Pick<PatientOverviewRecord, "outcome">>)[]): PatientOverviewTotals {
  const open = { count: 0, amount: 0 };
  const done = { count: 0, amount: 0 };
  for (const record of records) {
    const total = record.state === "done" ? done : open;
    total.count++;
    total.amount += countedTrackerAmount(record);
  }
  return { open, done, grandTotal: { count: open.count + done.count, amount: open.amount + done.amount } };
}
