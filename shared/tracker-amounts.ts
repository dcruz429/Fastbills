import { TRANSFER_DESTINATIONS } from "./productivity-transfers";

export type TrackerAmountRecord = {
  amount: string | null | undefined;
  outcome?: string | null;
};

export function isTransferredOutcome(outcome: string | null | undefined): boolean {
  return typeof TRANSFER_DESTINATIONS[outcome ?? ""] === "string" || outcome === "Send to Closed";
}

// Retain the source record's amount for its history, but count dollars only
// at the destination once a Send to outcome has transferred the record.
export function countedTrackerAmount(record: TrackerAmountRecord): number {
  if (isTransferredOutcome(record.outcome)) return 0;
  const amount = parseFloat((record.amount || "0").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

export function sumTrackerAmounts(records: readonly TrackerAmountRecord[]): number {
  return records.reduce((sum, record) => sum + countedTrackerAmount(record), 0);
}
