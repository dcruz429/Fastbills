import type { MedicalRecordField } from "@shared/medical-records";

export type MedicalRecordSortKey = MedicalRecordField | "status";
export type MedicalRecordSort = { key: MedicalRecordSortKey; direction: "asc" | "desc" };
const dateFields = new Set<MedicalRecordSortKey>(["todayDate", "requestReceived", "requestSent"]);
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function dateValue(text: string): number | null {
  // Use a valid leading calendar date for annotated dates/ranges. Do not let
  // Date.parse normalize historical typos such as February 31 into March.
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?=$|[\s(-])/.exec(text);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
  if (year < 1900 || year > 9999) return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? value.getTime() : null;
}

export function sortMedicalRecords<T extends Record<MedicalRecordSortKey, string>>(records: T[], sort: MedicalRecordSort | null): T[] {
  if (!sort) return records;
  const direction = sort.direction === "asc" ? 1 : -1;
  return records.slice().sort((a, b) => {
    const left = a[sort.key].trim();
    const right = b[sort.key].trim();
    // Blanks stay at the bottom in either direction.
    if (!left || !right) return left ? -1 : right ? 1 : 0;
    if (dateFields.has(sort.key)) {
      const leftDate = dateValue(left);
      const rightDate = dateValue(right);
      if (leftDate !== null && rightDate !== null) return (leftDate - rightDate) * direction;
      // Unrecognized historical dates follow valid dates without being changed.
      if (leftDate !== null || rightDate !== null) return leftDate !== null ? -1 : 1;
    }
    return collator.compare(left, right) * direction;
  });
}
