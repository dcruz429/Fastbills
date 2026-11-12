/**
 * Deterministic task SLA severity calculation.
 * Dates are compared as UTC instants; business-day calendar and holidays
 * will be configurable in a later staging-tested release.
 */
export type SlaState = "missing_due_date" | "on_track" | "due_soon" | "overdue";
export interface SlaResult {
  state: SlaState;
  minutesRemaining: number | null;
}
export function taskSla(dueDate: string | Date | null, now: Date, warningMinutes = 24 * 60): SlaResult {
  if (dueDate == null) return {state:"missing_due_date",minutesRemaining:null};
  const due = dueDate instanceof Date ? dueDate.getTime() : Date.parse(dueDate);
  if (!Number.isFinite(due) || !Number.isFinite(now.getTime())) return {state:"missing_due_date",minutesRemaining:null};
  const minutesRemaining=Math.floor((due-now.getTime())/60000);
  if (minutesRemaining<0)return {state:"overdue",minutesRemaining};
  if (minutesRemaining<=Math.max(0,warningMinutes))return {state:"due_soon",minutesRemaining};
  return {state:"on_track",minutesRemaining};
}
