export function CalendarQueryError({ error }: { error: unknown }) {
  if (!error) return null;
  return <div role="alert" data-testid="calendar-query-error" className="m-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
    {error instanceof Error ? error.message : "Calendar data is unavailable. Please retry."}
  </div>;
}
