/** Pure task assignment rules that can be unit-tested without patient data. */
export function taskDepartment(bucket: string | null | undefined): "Verification" | "Billing" | null {
  if (bucket === "for_verification") return "Verification";
  if (bucket === "ready_for_billing") return "Billing";
  // The historical 'done' bucket does not distinguish original work stage.
  return null;
}

/** Prevent reassigning final states or transferred/dropped tasks. */
export function canAssignTaskState(bucket: string | null, status: string | null): boolean {
  return taskDepartment(bucket) !== null &&
    !["done", "dropped", "billed", "verified"].includes(status || "");
}

export function assignmentChanged(
  expected: number | null,
  actual: number | null,
): boolean {
  return expected !== actual;
}
