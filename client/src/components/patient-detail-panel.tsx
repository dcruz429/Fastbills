import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Clock, User as UserIcon } from "lucide-react";

// ── status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: string | null | undefined): { label: string; cls: string } {
  if (!status) return { label: "Unknown", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400" };
  const s = status.toLowerCase().replace(/_/g, " ");
  if (s === "done" || s === "verified" || s === "billed" || s === "resolved")
    return { label: status, cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" };
  if (s === "working on it")
    return { label: status, cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" };
  if (s === "assigned")
    return { label: status, cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
  if (s === "unassigned")
    return { label: status, cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400" };
  if (s === "dropped" || s === "cancelled")
    return { label: status, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  return { label: status, cls: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300" };
}

function recordStatus(dept: string | null, r: any): string | null {
  if (!r || !dept) return null;
  // Arbitration uses `status` (arbitration_status column)
  return r.status ?? null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/New_York",
  });
}

function val(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

// ── endpoint map ──────────────────────────────────────────────────────────────

const DEPT_API: Record<string, string> = {
  Verification: "tasks",
  Collections: "collections",
  Denials: "denials",
  Arbitration: "arbitrations",
  Posting: "postings",
  Checks: "checks",
};

const DEPT_COLORS: Record<string, string> = {
  Verification: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Collections: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Denials: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Arbitration: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Posting: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Checks: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

// ── field definitions per department ─────────────────────────────────────────

type FieldSection = { heading: string; fields: { label: string; value: string; wide?: boolean }[] };

function buildSections(dept: string, r: any): FieldSection[] {
  if (!r) return [];

  switch (dept) {
    case "Verification":
      return [
        {
          heading: "Status",
          fields: [
            { label: "Status", value: val(r.status) },
            { label: "Priority", value: val(r.priority) },
            { label: "Bucket", value: val(r.bucket)?.replace(/_/g, " ") },
            { label: "Assigned To", value: r.assignedUser?.fullName ?? "Unassigned" },
          ],
        },
        {
          heading: "Patient Info",
          fields: [
            { label: "Chart #", value: val(r.chartNumber) },
            { label: "Clinic", value: r.clinic?.name ?? val(r.clinic) },
            { label: "Insurance", value: r.insurance?.name ?? val(r.insurance) },
          ],
        },
        {
          heading: "Dates",
          fields: [
            { label: "Input Date", value: fmtDate(r.inputDate) },
            { label: "IE Date", value: fmtDate(r.ieDate) },
            { label: "Due Date", value: fmtDate(r.dueDate) },
            { label: "DOA", value: fmtDate(r.doa) },
          ],
        },
        ...(r.outcome ? [{ heading: "Outcome", fields: [{ label: "Outcome", value: val(r.outcome), wide: true }] }] : []),
        ...(r.notes ? [{ heading: "Notes", fields: [{ label: "Notes", value: val(r.notes), wide: true }] }] : []),
      ];

    case "Denials":
      return [
        {
          heading: "Status",
          fields: [
            { label: "Status", value: val(r.status) },
            { label: "Assigned To", value: val(r.assignedTo) },
            { label: "Type of Denial", value: val(r.typeOfDenial) },
            { label: "Filed To", value: val(r.filedTo) },
          ],
        },
        {
          heading: "Patient Info",
          fields: [
            { label: "File Name", value: val(r.denialFileName) },
            { label: "Clinic", value: val(r.clinic) },
            { label: "Insurance", value: val(r.insurance) },
            { label: "Intake", value: val(r.intake) },
          ],
        },
        {
          heading: "Dates & Amounts",
          fields: [
            { label: "Date Input", value: fmtDate(r.dateInput) },
            { label: "DOA", value: fmtDate(r.doa) },
            { label: "Date of Letter", value: fmtDate(r.dateOfLetter) },
            { label: "Effective Date", value: fmtDate(r.effectiveDate) },
            { label: "DOS From", value: fmtDate(r.dosFrom) },
            { label: "DOS To", value: fmtDate(r.dosTo) },
            { label: "# of Days", value: val(r.numberOfDays) },
            { label: "Amount", value: val(r.amount) },
          ],
        },
        {
          heading: "Arbitration",
          fields: [
            { label: "ARB Status", value: val(r.arbStatus) },
            { label: "Trial Date", value: fmtDate(r.trialDate) },
            { label: "ARB Payment Status", value: val(r.arbPaymentStatus) },
            { label: "Amount Received", value: val(r.amountReceived) },
            { label: "Checked By", value: val(r.checkedBy) },
          ],
        },
        ...(r.comments ? [{ heading: "Comments", fields: [{ label: "Comments", value: val(r.comments), wide: true }] }] : []),
        ...(r.comment ? [{ heading: "Note", fields: [{ label: "Note", value: val(r.comment), wide: true }] }] : []),
      ];

    case "Arbitration":
      return [
        {
          heading: "Status",
          fields: [
            { label: "ARB Status", value: val(r.arbStatus) },
            { label: "Assigned To", value: val(r.assignedTo) },
            { label: "Type of Denial", value: val(r.typeOfDenial) },
            { label: "Filed To", value: val(r.filedTo) },
          ],
        },
        {
          heading: "Patient Info",
          fields: [
            { label: "File Name", value: val(r.denialFileName) },
            { label: "Clinic", value: val(r.clinic) },
            { label: "Insurance", value: val(r.insurance) },
            { label: "Intake", value: val(r.intake) },
          ],
        },
        {
          heading: "Dates & Amounts",
          fields: [
            { label: "Date Input", value: fmtDate(r.dateInput) },
            { label: "DOA", value: fmtDate(r.doa) },
            { label: "Effective Date", value: fmtDate(r.effectiveDate) },
            { label: "DOS From", value: fmtDate(r.dosFrom) },
            { label: "DOS To", value: fmtDate(r.dosTo) },
            { label: "# of Days", value: val(r.numberOfDays) },
            { label: "Amount", value: val(r.amount) },
            { label: "Trial Date", value: fmtDate(r.trialDate) },
          ],
        },
        {
          heading: "Payment",
          fields: [
            { label: "ARB Payment Status", value: val(r.arbPaymentStatus) },
            { label: "Amount Received", value: val(r.amountReceived) },
            { label: "Checked By", value: val(r.checkedBy) },
          ],
        },
        ...(r.comments ? [{ heading: "Comments", fields: [{ label: "Comments", value: val(r.comments), wide: true }] }] : []),
        ...(r.comment ? [{ heading: "Note", fields: [{ label: "Note", value: val(r.comment), wide: true }] }] : []),
      ];

    case "Collections":
      return [
        {
          heading: "Status",
          fields: [
            { label: "Status", value: val(r.status) },
            { label: "Priority", value: val(r.priority) },
            { label: "Assigned To", value: val(r.assignedTo) },
            { label: "Division", value: val(r.division) },
          ],
        },
        {
          heading: "Patient Info",
          fields: [
            { label: "Clinic", value: val(r.clinic) },
            { label: "Insurance", value: val(r.insurance) },
            { label: "Input Date", value: fmtDate(r.inputDate) },
            { label: "DOS From", value: fmtDate(r.dosFrom) },
            { label: "DOS To", value: fmtDate(r.dosTo) },
            { label: "# of Visits", value: val(r.numberOfVisits) },
            { label: "Amount", value: val(r.amount) },
          ],
        },
        {
          heading: "Action",
          fields: [
            { label: "Issue Type", value: val(r.issueType) },
            { label: "Type of Denial", value: val(r.typeOfDenial) },
            { label: "Action", value: val(r.action) },
            { label: "Outcome", value: val(r.outcome) },
          ],
        },
        ...(r.notes ? [{ heading: "Notes", fields: [{ label: "Notes", value: val(r.notes), wide: true }] }] : []),
      ];

    case "Posting":
      return [
        {
          heading: "Status",
          fields: [
            { label: "Status", value: val(r.status) },
            { label: "Priority", value: val(r.priority) },
            { label: "Assigned To", value: val(r.assignedTo) },
            { label: "Document Type", value: val(r.documentType) },
          ],
        },
        {
          heading: "Details",
          fields: [
            { label: "File Number", value: val(r.fileNumber) },
            { label: "Clinic", value: val(r.clinic) },
            { label: "Insurance", value: val(r.insurance) },
            { label: "Amount", value: val(r.amount) },
            { label: "Scanned Date", value: fmtDate(r.scannedDate) },
            { label: "Posted Date", value: fmtDate(r.postedDate) },
            { label: "Deposit Date", value: fmtDate(r.depositDate) },
            { label: "Deposited By", value: val(r.depositedBy) },
          ],
        },
        ...(r.outcome ? [{ heading: "Outcome", fields: [{ label: "Outcome", value: val(r.outcome), wide: true }] }] : []),
        ...(r.notes ? [{ heading: "Notes", fields: [{ label: "Notes", value: val(r.notes), wide: true }] }] : []),
      ];

    case "Checks":
      return [
        {
          heading: "Status",
          fields: [
            { label: "Status", value: val(r.status) },
            { label: "Assigned To", value: val(r.assignedTo) },
            { label: "Type", value: val(r.type) },
            { label: "Check #", value: val(r.checkNumber) },
            { label: "Amount", value: val(r.amount) },
          ],
        },
        {
          heading: "Details",
          fields: [
            { label: "File Name", value: val(r.fileName) },
            { label: "Clinic", value: val(r.clinic) },
            { label: "Insurance", value: val(r.insurance) },
            { label: "Check Date", value: fmtDate(r.checkDate) },
            { label: "Input Date", value: fmtDate(r.inputDate) },
            { label: "Scanned Date", value: fmtDate(r.scannedDate) },
            { label: "Posted Date", value: fmtDate(r.postedDate) },
            { label: "Deposit Date", value: fmtDate(r.depositDate) },
            { label: "Deposited By", value: val(r.depositedBy) },
          ],
        },
        ...(r.outcome ? [{ heading: "Outcome", fields: [{ label: "Outcome", value: val(r.outcome), wide: true }] }] : []),
        ...(r.notes ? [{ heading: "Notes", fields: [{ label: "Notes", value: val(r.notes), wide: true }] }] : []),
      ];

    default:
      return [];
  }
}

// ── activity entry ─────────────────────────────────────────────────────────────

function ActivityEntry({ entry }: { entry: any }) {
  const isChange = entry.field && (entry.oldValue !== null || entry.newValue !== null);
  return (
    <div className="flex gap-3 text-sm">
      <div className="mt-0.5 flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
          <Clock className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>
      <div className="flex-1 pb-4 border-b last:border-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {entry.userName && (
              <span className="font-medium text-foreground">{entry.userName} </span>
            )}
            <span className="text-muted-foreground">{entry.action}</span>
            {isChange && (
              <div className="mt-1 text-xs space-y-0.5">
                {entry.oldValue !== null && entry.oldValue !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">From:</span>
                    <span className="line-through text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-1 rounded">
                      {entry.oldValue}
                    </span>
                  </div>
                )}
                {entry.newValue !== null && entry.newValue !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">To:</span>
                    <span className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-1 rounded">
                      {entry.newValue}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            {fmtDateTime(entry.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface PatientDetailPanelProps {
  open: boolean;
  onClose: () => void;
  sourceId: number | null;
  department: string | null;
  agentName?: string | null;
}

export function PatientDetailPanel({ open, onClose, sourceId, department, agentName }: PatientDetailPanelProps) {
  const apiBase = department ? DEPT_API[department] : null;
  const idParam = department === "Verification" ? "taskId" : "id";

  const { data: record, isLoading: loadingRecord } = useQuery<any>({
    queryKey: [`/api/${apiBase}/${sourceId}`],
    queryFn: () => fetch(`/api/${apiBase}/${sourceId}`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!apiBase && !!sourceId,
  });

  // Verification uses /api/tasks/:taskId/activity, others use /:id/activity
  const activityUrl = department === "Verification"
    ? `/api/tasks/${sourceId}/activity`
    : `/api/${apiBase}/${sourceId}/activity`;

  const { data: activity = [], isLoading: loadingActivity } = useQuery<any[]>({
    queryKey: [activityUrl],
    queryFn: () => fetch(activityUrl, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!apiBase && !!sourceId,
  });

  const patientName = record?.patientName ?? record?.posting_patient_name ?? record?.check_patient_name ?? "—";
  const sections = buildSections(department ?? "", record);
  const sortedActivity = [...activity].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-4 pb-3 border-b bg-muted/20 flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-left text-lg leading-tight">{patientName}</SheetTitle>
              {agentName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserIcon className="w-3 h-3" />
                  <span>{agentName}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0 mt-0.5">
              {department && (
                <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", DEPT_COLORS[department] ?? "bg-gray-100 text-gray-800")}>
                  {department}
                </span>
              )}
              {record && (() => {
                const st = recordStatus(department, record);
                if (!st) return null;
                const b = statusBadge(st);
                return (
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", b.cls)}>
                    {b.label}
                  </span>
                );
              })()}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-5">
            {(loadingRecord || loadingActivity) && !record ? (
              <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Loading…</div>
            ) : (
              <>
                {/* Field sections */}
                {sections.map(section => (
                  <div key={section.heading}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {section.heading}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-md border bg-muted/10 p-3">
                      {section.fields.map(f => (
                        <div key={f.label} className={cn("space-y-0.5", f.wide && "col-span-2")}>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          <p className={cn(
                            "text-sm font-medium break-words",
                            f.value === "—" ? "text-muted-foreground font-normal" : "text-foreground"
                          )}>
                            {f.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Audit trail */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Audit Trail
                    {sortedActivity.length > 0 && (
                      <span className="ml-2 font-normal normal-case">({sortedActivity.length} event{sortedActivity.length !== 1 ? "s" : ""})</span>
                    )}
                  </p>
                  {sortedActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    <div className="space-y-0">
                      {sortedActivity.map((entry: any) => (
                        <ActivityEntry key={entry.id} entry={entry} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
