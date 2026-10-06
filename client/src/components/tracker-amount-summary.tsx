import * as React from "react";
import { isTransferredOutcome, sumTrackerAmounts, type TrackerAmountRecord } from "@shared/tracker-amounts";
export { sumTrackerAmounts } from "@shared/tracker-amounts";

export function TrackerAmountSummary({
  label,
  userRole,
  openRecords,
  doneRecords,
}: {
  label: string;
  userRole: string | undefined;
  openRecords: readonly TrackerAmountRecord[];
  doneRecords: readonly TrackerAmountRecord[];
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
      {[...openRecords, ...doneRecords].some(record => isTransferredOutcome(record.outcome)) && (
        <p className="basis-full text-xs text-muted-foreground" data-testid="transfer-amount-exclusion-note">
          Transferred-out amounts are excluded from dollar totals. Record counts are unchanged.
        </p>
      )}
    </div>
  );
}
