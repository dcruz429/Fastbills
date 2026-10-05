import * as React from "react";

type AmountRecord = { amount: string | null | undefined };

export function sumTrackerAmounts(records: readonly AmountRecord[]): number {
  return records.reduce((sum, record) => {
    const amount = parseFloat((record.amount || "0").replace(/[^0-9.\-]/g, ""));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export function TrackerAmountSummary({
  label,
  userRole,
  openRecords,
  doneRecords,
}: {
  label: string;
  userRole: string | undefined;
  openRecords: readonly AmountRecord[];
  doneRecords: readonly AmountRecord[];
}) {
  const isAdmin = userRole === "admin";
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {[
        { key: "open", title: `Open ${label}`, records: openRecords },
        ...(isAdmin ? [{ key: "done", title: `Done ${label}`, records: doneRecords }] : []),
        ...(isAdmin ? [{ key: "grand-total", title: "Grand Total", records: [...openRecords, ...doneRecords] }] : []),
      ].map(({ key, title, records }) => (
        <div key={key} className="bg-muted/50 border rounded-lg px-4 py-2 inline-flex flex-wrap items-center gap-2" data-testid={`sum-${key}-amount-box`}>
          <span className="text-sm font-medium text-muted-foreground">{title}:</span>
          <span className="text-lg font-bold" data-testid={`sum-${key}-amount-value`}>
            ${sumTrackerAmounts(records).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground">({records.length} record{records.length !== 1 ? "s" : ""})</span>
        </div>
      ))}
    </div>
  );
}
