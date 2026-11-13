import { z } from "zod";

export const CALL_SCOPE_DEPARTMENTS = [
  "Verification", "Billing", "Posting", "Collections", "Denials", "Arbitration", "RTP", "Checks", "Other",
] as const;
const id = z.number().int().positive().safe();
const text = z.string().nullable().optional();
export const callCapabilitiesSchema = z.object({
  userId: id, canRead: z.boolean(), canMutate: z.boolean(), canManage: z.boolean(),
  clinics: z.array(z.object({ id, name: z.string().min(1) })),
  departments: z.array(z.enum(CALL_SCOPE_DEPARTMENTS)),
});
export type CallCapabilities = z.infer<typeof callCapabilitiesSchema>;
export const calendarCallSchema = z.object({
  id, patientName: z.string(), scheduledAt: z.string().datetime({ offset: true }),
  callStatus: z.string(), clinic: text, department: text, callReason: text,
  assignedUserName: text, insurance: text, phoneNumber: text, notes: text,
  assignedUserId: id.nullable().optional(), relatedTaskId: id.nullable().optional(),
}).passthrough();
export const calendarCallsSchema = z.array(calendarCallSchema);
export const calendarSchedulesSchema = z.array(z.object({
  id, sourceId: id, patientName: z.string(), department: z.string(),
  clinic: text, insurance: text, scheduledDate: z.string().optional(), notes: text,
  dailyStatus: text,
}).passthrough());
export const calendarAgentStatsSchema = z.array(z.object({
  userId: id, userName: z.string(), assigned: z.number(), done: z.number(),
  pending: z.number(), rescheduled: z.number(), successRate: z.number(),
}).passthrough());
export const calendarStatsSchema = z.object({
  scheduledToday: z.number(), resolvedToday: z.number(), overdueToday: z.number(),
  followUpRequired: z.number(), unassigned: z.number(),
});
export const calendarUsersSchema = z.array(z.object({
  id, fullName: z.string(), role: z.string(), active: z.boolean().optional(),
}).passthrough());
export const calendarTeamsSchema = z.array(z.object({
  id, name: z.string(), members: z.array(z.object({ id }).passthrough()),
}).passthrough());
export const calendarAttemptsSchema = z.array(z.object({
  id, outcome: z.string(), createdAt: z.string(), contactPerson: text, notes: text,
}).passthrough());
export const calendarActivitySchema = z.array(z.object({
  id, eventType: z.string(), createdAt: z.string(), userName: text,
}).passthrough());

export function validNewCallScope(capabilities: CallCapabilities | undefined, clinic: string, department: string) {
  return !!capabilities?.canMutate &&
    capabilities.clinics.some(c => c.name === clinic) && capabilities.departments.includes(department as any);
}
