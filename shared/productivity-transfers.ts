export type ProductivityTransfer = {
  id: number;
  recordId: number | null;
  userId: number | null;
  userName: string | null;
  patientName: string | null;
  action: string;
  timestamp: string;
  department: string;
  destination: string;
};

export const TRANSFER_DESTINATIONS: Record<string, string> = {
  "Send to Verification": "Verification",
  "Send to Billing": "Billing",
  "Send to Posting": "Posting",
  "Send to Collections": "Collections",
  "Send to Denials": "Denials",
  "Send to Arbitration": "Arbitration",
  "Send to RTP": "RTP",
};

export type TransferActivity = Omit<ProductivityTransfer, "destination" | "timestamp"> & {
  timestamp: Date | string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
};

export function buildProductivityTransfers(activities: TransferActivity[]): ProductivityTransfer[] {
  return activities.flatMap(activity => {
    const destination = TRANSFER_DESTINATIONS[activity.newValue ?? ""];
    // Destination records carry copies of their source's audit history.
    // Only an original outcome change is a new transfer, credited to its actor.
    if (activity.field?.toLowerCase() !== "outcome" || typeof destination !== "string"
      || activity.action.startsWith("[") || activity.oldValue === activity.newValue
      || activity.department === destination) return [];
    const { field, oldValue, newValue, timestamp, ...record } = activity;
    return [{ ...record, destination, timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp }];
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function filterProductivityTransfers(records: ProductivityTransfer[], filters: {
  selectedUser: string;
  selectedDept: string;
  dateStart: Date | null;
  dateEnd: Date | null;
}): ProductivityTransfer[] {
  return records.filter(record => {
    if (filters.selectedUser !== "all" && String(record.userId) !== filters.selectedUser) return false;
    if (filters.selectedDept !== "all" && record.department !== filters.selectedDept) return false;
    const timestamp = new Date(record.timestamp);
    if (filters.dateStart && timestamp < filters.dateStart) return false;
    if (filters.dateEnd && timestamp > filters.dateEnd) return false;
    return true;
  });
}
