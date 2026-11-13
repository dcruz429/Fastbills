export type TaskRisk = "low" | "medium" | "high" | "critical";
export type ApprovalDecision = "approved" | "rejected";
export function requiresAssignmentApproval(priority: string | null): boolean {
  return priority === "high" || priority === "critical";
}
export function canReviewRiskApproval(requestedBy: number, reviewerId: number): boolean {
  return Number.isSafeInteger(requestedBy) && Number.isSafeInteger(reviewerId) &&
    requestedBy > 0 && reviewerId > 0 && requestedBy !== reviewerId;
}
/** Review decisions never directly reassign a task. */
export function decisionAllowed(status: string, decision: string): decision is ApprovalDecision {
  return status === "pending" && (decision === "approved" || decision === "rejected");
}
