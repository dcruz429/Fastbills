import * as React from "react";
import type { PatientOverviewTotals as Totals } from "@shared/patient-overview";

export function PatientOverviewTotals({
  totals, userRole, hasAmounts = true, testId = "patient-total",
}: { totals: Totals; userRole: string | undefined; hasAmounts?: boolean; testId?: string }) {
  const summaries = [
    { key: "open", label: "Open", total: totals.open },
    ...(userRole === "admin" ? [
      { key: "done", label: "Done", total: totals.done },
      { key: "grand", label: "Grand Total", total: totals.grandTotal },
    ] : []),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {summaries.map(({ key, label, total }) => (
        <div key={key} className="min-w-[118px] rounded-lg border bg-muted/30 px-3 py-2" data-testid={`${testId}-${key}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {hasAmounts ? total.amount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">{total.count} tracked record{total.count === 1 ? "" : "s"}</p>
        </div>
      ))}
    </div>
  );
}
