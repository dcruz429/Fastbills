import { z } from "zod";
import { calendarCallSchema } from "@shared/call-calendar-contract";

export class CalendarRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function calendarJson<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  return parseCalendarResponse(response, schema);
}
export async function parseCalendarResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw new CalendarRequestError(response.status, response.status === 403
      ? "Access restricted. You do not have permission for this calendar action."
      : response.status === 404 ? "This calendar record is unavailable or outside your access."
      : response.status === 401 ? "Your session has expired. Sign in again."
      : "Calendar request failed. Please try again.");
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("Invalid calendar response. Please retry."); }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Invalid calendar response. Please retry.");
  return parsed.data;
}

// Validate success responses too, before a mutation can toast success or open
// a detail panel with a malformed object. Backend permissions remain decisive.
export async function calendarRequest(method: string, url: string, data?: unknown): Promise<{ json(): Promise<any> }> {
  const schema = url.endsWith("/attempts")
    ? z.object({ attempt: z.object({ id: z.number().int().positive() }).passthrough(), nextCall: calendarCallSchema.nullable() })
    : calendarCallSchema;
  const result = await calendarJson(url, schema as z.ZodTypeAny, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}),
  });
  return { json: async () => result };
}
