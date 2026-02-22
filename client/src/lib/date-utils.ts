import { formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "America/New_York";

export function formatEST(date: Date | string | number, formatStr: string): string {
  return formatInTimeZone(new Date(date), TIMEZONE, formatStr);
}
