import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import type { Closed, User, DropdownOption } from "@shared/schema";
import { CLOSED_STATUS_OPTIONS, OUTCOME_OPTIONS } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TrackerStatusBadge } from "@/components/status-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, MessageSquare, User as UserIcon, Clock, ChevronDown, FileText, CreditCard, ClipboardList, ShieldAlert, Scale, Package, Archive, RotateCcw, Download, CheckSquare, Upload } from "lucide-react";
import { parseCsvText } from "@/lib/csv-import";
import { Checkbox } from "@/components/ui/checkbox";

const ADMIN_ROLES = ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"];

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const str = typeof d === "string" ? d : d.toISOString();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${parseInt(match[2])}/${parseInt(match[3])}/${match[1]}`;
  }
  const date = new Date(str);
  if (isNaN(date.getTime())) return "";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

function fmtAmt(v: string | null | undefined) {
  if (!v) return "-";
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? v : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ColSpec = { header: string; sort?: string; renderCell: (d: any, rec: any) => JSX.Element | string | null };

const STATUS_NORMALIZE: Record<string, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  working_on_it: "Working on it",
  done: "Done",
  verified: "Assigned",
  billed: "Assigned",
  dropped: "Unassigned",
};

function normalizeStatus(s: string): string {
  return STATUS_NORMALIZE[s] || s;
}

function getExtraCols(sectionKey: string): ColSpec[] {
  const date: ColSpec = { header: "Date", sort: "createdAt", renderCell: (d) => formatDate(d.createdAt) };

  switch (sectionKey) {
    case "Verification/Billing":
      return [
        { header: "Priority", sort: "priority", renderCell: (d, rec) => rec.priority || "-" },
        date,
      ];
    case "Posting":
      return [
        { header: "File #", renderCell: (_, rec) => rec.fileNumber || "-" },
        { header: "Doc Type", renderCell: (_, rec) => rec.documentType || "-" },
        { header: "Priority", renderCell: (_, rec) => rec.priority || "-" },
        date,
      ];
    case "Denials":
    case "Arbitration":
      return [
        { header: "DOA", renderCell: (_, rec) => rec.doa ? formatDate(rec.doa) : "-" },
        { header: "Type", renderCell: (_, rec) => rec.typeOfDenial || "-" },
        { header: "Filed To", renderCell: (_, rec) => rec.filedTo || "-" },
        { header: "ARB Status", renderCell: (_, rec) => rec.arbStatus || "-" },
        date,
      ];
    case "Checks":
      return [
        { header: "Check #", renderCell: (_, rec) => rec.checkNumber || "-" },
        { header: "Type", renderCell: (_, rec) => rec.type || "-" },
        date,
      ];
    default:
      return [date];
  }
}

function getSourceDetailFields(source: string, rec: any): { label: string; value: string | null | undefined }[] {
  const d = (v: any) => v ? formatDate(v) : null;
  switch (source) {
    case "Denials":
    case "Arbitration":
      return [
        { label: "File Name", value: rec.denialFileName },
        { label: "Date Input", value: d(rec.dateInput) },
        { label: "Intake", value: rec.intake },
        { label: "DOA", value: d(rec.doa) },
        { label: "Date of Letter", value: d(rec.dateOfLetter) },
        { label: "Type of Denial", value: rec.typeOfDenial },
        { label: "Effective Date", value: d(rec.effectiveDate) },
        { label: "DOS From", value: d(rec.dosFrom) },
        { label: "DOS To", value: d(rec.dosTo) },
        { label: "# of Days", value: rec.numberOfDays != null ? String(rec.numberOfDays) : null },
        { label: "Filed To", value: rec.filedTo },
        { label: "ARB Status", value: rec.arbStatus },
        { label: "Trial Date", value: d(rec.trialDate) },
        { label: "ARB Payment Status", value: rec.arbPaymentStatus },
        { label: "Amount Received", value: rec.amountReceived },
        { label: "Assigned To", value: rec.assignedTo },
        { label: "Comments", value: rec.comments },
      ];
    case "Posting":
      return [
        { label: "File Number", value: rec.fileNumber },
        { label: "Document Type", value: rec.documentType },
        { label: "Priority", value: rec.priority },
        { label: "Scanned Date", value: d(rec.scannedDate) },
        { label: "Posted Date", value: d(rec.postedDate) },
        { label: "Deposit Date", value: d(rec.depositDate) },
        { label: "Deposited By", value: rec.depositedBy },
        { label: "Assigned To", value: rec.assignedTo },
      ];
    case "Checks":
      return [
        { label: "Check Number", value: rec.checkNumber },
        { label: "Check Date", value: d(rec.checkDate) },
        { label: "Input Date", value: d(rec.inputDate) },
        { label: "File Name", value: rec.fileName },
        { label: "Type", value: rec.type },
        { label: "Scanned Date", value: d(rec.scannedDate) },
        { label: "Posted Date", value: d(rec.postedDate) },
        { label: "Deposit Date", value: d(rec.depositDate) },
        { label: "Deposited By", value: rec.depositedBy },
        { label: "Assigned To", value: rec.assignedTo },
      ];
    case "Verification/Billing":
      return [
        { label: "Priority", value: rec.priority },
        { label: "Bucket", value: rec.bucket },
        { label: "IE Date", value: d(rec.ieDate) },
        { label: "Due Date", value: d(rec.dueDate) },
        { label: "Chart Number", value: rec.chartNumber },
      ];
    case "Collections":
      return [
        { label: "Assigned To", value: rec.assignedTo },
        { label: "Priority", value: rec.priority },
        { label: "DOS From", value: d(rec.dosFrom) },
        { label: "DOS To", value: d(rec.dosTo) },
      ];
    default:
      return [];
  }
}

const emptyForm = {
  patientName: "",
  clinic: "",
  insurance: "",
  assignedTo: "",
  status: "",
  amount: "",
  source: "",
  outcome: "",
  notes: "",
  reason: "",
  dosFrom: "",
  dosTo: "",
  regularVisit: "",
  fullVisit: "",
  reportedDate: "",
};

export default function ClosedPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string>("patientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const isAdmin = ADMIN_ROLES.includes(user.role);

  const { data: closedList, isLoading } = useQuery<Closed[]>({ queryKey: ["/api/closed"] });
  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<any[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<any[]>({ queryKey: ["/api/insurances"] });
  const { data: rtpReasonOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "rtp_reason"] });
  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/closed", editingId, "activity"],
    enabled: !!editingId,
  });

  const activeUsers = (allUsers || []).filter((u: any) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));

  const editingRecord = editingId ? (closedList || []).find(d => d.id === editingId) : null;
  let sourceRec: any = {};
  try { if (editingRecord?.recordData) sourceRec = JSON.parse(editingRecord.recordData); } catch {}

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/closed", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/closed"] });
      setDrawerOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Closed record created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/closed/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/closed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/closed", editingId, "activity"] });
      toast({ title: "Closed record updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/closed/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/closed"] });
      setDeleteConfirmId(null);
      setDrawerOpen(false);
      setEditingId(null);
      toast({ title: "Closed record deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const exportMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/closed/export", { ids }),
    onSuccess: (data: any, ids: number[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/closed"] });
      setSelectedIds(new Set());
      toast({ title: `Exported ${ids.length} record${ids.length !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });

  function buildCsvRow(d: any): string[] {
    let rec: any = {};
    try { if (d.recordData) rec = JSON.parse(d.recordData); } catch {}
    const fmtD = (v: any) => v ? formatDate(v) : "";
    const base = [
      d.id,
      d.source || "",
      d.patientName || rec.patientName || "",
      d.clinic || rec.clinic || "",
      d.insurance || rec.insurance || "",
      d.amount || rec.amount || "",
      d.status || "",
      d.assignedTo || "",
      d.outcome || "",
      fmtD(d.createdAt),
      fmtD(d.dateExported),
    ];
    const sourceFields: string[] = [];
    if (d.source === "Denials" || d.source === "Arbitration") {
      sourceFields.push(rec.denialFileName || "", fmtD(rec.dateInput), rec.intake || "", fmtD(rec.doa), rec.typeOfDenial || "", rec.filedTo || "", rec.arbStatus || "", fmtD(rec.trialDate), rec.arbPaymentStatus || "", rec.amountReceived || "");
    } else if (d.source === "Posting") {
      sourceFields.push(rec.fileNumber || "", rec.documentType || "", rec.priority || "", fmtD(rec.scannedDate), fmtD(rec.postedDate), fmtD(rec.depositDate), rec.depositedBy || "");
    } else if (d.source === "Checks") {
      sourceFields.push(rec.checkNumber || "", rec.type || "", fmtD(rec.checkDate), fmtD(rec.inputDate), rec.fileName || "", fmtD(rec.scannedDate), fmtD(rec.postedDate), fmtD(rec.depositDate), rec.depositedBy || "");
    } else if (d.source === "Collections") {
      sourceFields.push(rec.priority || "", fmtD(rec.dosFrom), fmtD(rec.dosTo), rec.typeOfDenial || "", rec.comments || "");
    } else if (d.source === "Verification/Billing") {
      sourceFields.push(rec.priority || "", rec.bucket || "", fmtD(rec.ieDate), fmtD(rec.dueDate), rec.chartNumber || "");
    }
    return [...base.map(String), ...sourceFields];
  }

  function handleExport() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const allRecords = closedList || [];
    const toExport = allRecords.filter(d => ids.includes(d.id));
    const headers = ["ID", "Source", "Patient Name", "Clinic", "Insurance", "Amount", "Status", "Assigned To", "Outcome", "Date Created", "Date Exported", "Source-Specific Fields..."];
    const rows = [headers, ...toExport.map(buildCsvRow)];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtp-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    exportMutation.mutate(ids);
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(items: any[]) {
    const ids = items.map((d: any) => d.id);
    const allSelected = ids.every((id: number) => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id: number) => next.delete(id));
      else ids.forEach((id: number) => next.add(id));
      return next;
    });
  }

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/closed/${editingId}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/closed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/closed", editingId, "activity"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importCsvMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/closed/import-csv", { rows }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/closed"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      toast({ title: `Import complete — ${data.success} created, ${data.updated} updated${data.errors?.length ? `, ${data.errors.length} errors` : ""}` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const CSV_COLUMN_MAP: Record<string, string> = {
    "patient name": "patientName", "patient": "patientName",
    "last name": "lastName", "first name": "firstName",
    "clinic": "clinic", "insurance": "insurance",
    "assigned to": "assignedTo", "status": "status",
    "amount": "amount", "source": "source", "outcome": "outcome",
  };

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text, CSV_COLUMN_MAP);
      setCsvPreview(rows);
      setCsvFileName(file.name);
      if (rows.length === 0) toast({ title: "No valid rows found", description: "CSV must have a 'Patient Name' column", variant: "destructive" });
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    if (!form.patientName.trim()) {
      toast({ title: "Patient Name is required", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDrawerOpen(true);
    setHistoryOpen(false);
  }

  function openEdit(d: Closed) {
    setEditingId(d.id);
    setForm({
      patientName: d.patientName || "",
      clinic: d.clinic || "",
      insurance: d.insurance || "",
      assignedTo: d.assignedTo || "",
      status: d.status || "",
      amount: d.amount || "",
      source: d.source || "",
      outcome: d.outcome || "",
      notes: d.notes || "",
      reason: (d as any).reason || "",
      dosFrom: (d as any).dosFrom || "",
      dosTo: (d as any).dosTo || "",
      regularVisit: (d as any).regularVisit != null ? String((d as any).regularVisit) : "",
      fullVisit: (d as any).fullVisit != null ? String((d as any).fullVisit) : "",
      reportedDate: (d as any).reportedDate || "",
    });
    setDrawerOpen(true);
    setHistoryOpen(false);
  }

  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else if (sortDir === "desc") { setSortCol(""); setSortDir(""); }
      else { setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-50" />;
    if (sortDir === "asc") return <ArrowUp className="h-3 w-3 ml-1 inline-block" />;
    return <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };

  const activeFilterCount = [filterStatus, filterSource, filterAssignedTo, filterOutcome]
    .filter(v => v && v !== "__all__").length;

  function clearFilters() {
    setFilterStatus("");
    setFilterSource("");
    setFilterAssignedTo("");
    setFilterOutcome("");
  }

  const SOURCE_SECTIONS = [
    { key: "Verification/Billing", label: "BILLING / VERIFICATION TASKS", icon: FileText, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
    { key: "Posting", label: "POSTINGS", icon: Package, color: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
    { key: "Collections", label: "COLLECTIONS", icon: CreditCard, color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
    { key: "Denials", label: "DENIALS", icon: ShieldAlert, color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800" },
    { key: "Arbitration", label: "ARBITRATIONS", icon: Scale, color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800" },
    { key: "Checks", label: "CHECKS", icon: ClipboardList, color: "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800" },
    { key: "__other__", label: "OTHER / LEGACY", icon: Archive, color: "bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-800" },
  ];

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    SOURCE_SECTIONS.forEach(s => { initial[s.key] = true; });
    return initial;
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const sourceOptions = Array.from(new Set((closedList || []).map(d => d.source).filter(Boolean) as string[])).sort();

  const filteredUnsorted = (closedList || []).filter(d => {
    if (searchQuery && !Object.values(d).some(v => v && String(v).toLowerCase().includes(searchQuery.toLowerCase()))) return false;
    if (filterStatus && filterStatus !== "__all__" && d.status !== filterStatus) return false;
    if (filterSource && filterSource !== "__all__" && d.source !== filterSource) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
    if (filterOutcome && filterOutcome !== "__all__" && (d.outcome || "") !== filterOutcome) return false;
    return true;
  });

  const dateColumns = new Set(["createdAt", "dateExported"]);
  const numberColumns = new Set(["amount"]);

  const filtered = [...filteredUnsorted].sort((a, b) => {
    if (!sortCol || !sortDir) return 0;
    let valA: any = (a as any)[sortCol] ?? "";
    let valB: any = (b as any)[sortCol] ?? "";

    if (dateColumns.has(sortCol)) {
      const tA = valA ? new Date(valA).getTime() : 0;
      const tB = valB ? new Date(valB).getTime() : 0;
      return sortDir === "asc" ? tA - tB : tB - tA;
    }

    if (numberColumns.has(sortCol)) {
      const nA = parseFloat(String(valA).replace(/[^0-9.\-]/g, '')) || 0;
      const nB = parseFloat(String(valB).replace(/[^0-9.\-]/g, '')) || 0;
      return sortDir === "asc" ? nA - nB : nB - nA;
    }

    const cmp = String(valA).localeCompare(String(valB), undefined, { sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-64px)] animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-closed-title">RTP (Return to Partner)</h1>
        <div className="flex items-center gap-2">
          {user.role === "admin" && selectedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exportMutation.isPending}
              data-testid="button-export-selected"
              className="border-green-500 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
            >
              <Download className="h-4 w-4 mr-1" />
              Export {selectedIds.size} Selected
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv-closed">
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button onClick={openCreate} data-testid="button-create-closed">
                <Plus className="h-4 w-4 mr-1" /> New RTP Record
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search RTP records..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-closed"
          />
        </div>
        <Select value={filterStatus || "__all__"} onValueChange={v => setFilterStatus(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-closed-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {CLOSED_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSource || "__all__"} onValueChange={v => setFilterSource(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-closed-source"><SelectValue placeholder="All Sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Sources</SelectItem>
            {sourceOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-closed-assigned-to"><SelectValue placeholder="All Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Assigned</SelectItem>
            {Array.from(new Map([...(closedList || []).map(d => d.assignedTo).filter(Boolean) as string[], ...activeUsers.map(u => u.fullName)].map(n => [n.replace(/\s+/g, ' ').trim().toLowerCase(), n.replace(/\s+/g, ' ').trim()])).values()).sort().map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOutcome || "__all__"} onValueChange={v => setFilterOutcome(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-outcome"><SelectValue placeholder="All Outcomes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Outcomes</SelectItem>
            {OUTCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="bg-muted/50 border rounded-lg px-4 py-2 inline-flex items-center gap-2" data-testid="sum-amount-box">
          <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
          <span className="text-lg font-bold" data-testid="sum-amount-value">
            ${filtered.filter(d => !["Paid","Loss","RTP","Send to RTP"].includes(d.outcome||"")).reduce((sum, d) => sum + (parseFloat((d.amount || "0").replace(/[^0-9.\-]/g, '')) || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground">({filtered.length} record{filtered.length !== 1 ? "s" : ""})</span>
        </div>
      </div>

      <div className="overflow-auto flex-1 min-h-0 always-show-scrollbar space-y-4">
        {(() => {
          const knownKeys = SOURCE_SECTIONS.map(s => s.key).filter(k => k !== "__other__");
          const groupedBySource: Record<string, typeof filtered> = {};
          for (const section of SOURCE_SECTIONS) {
            groupedBySource[section.key] = [];
          }
          for (const d of filtered) {
            const src = d.source || "";
            const matchedKey = knownKeys.find(k => k === src);
            if (matchedKey) {
              groupedBySource[matchedKey].push(d);
            } else {
              groupedBySource["__other__"].push(d);
            }
          }

          const sectionsToShow = filterSource && filterSource !== "__all__"
            ? SOURCE_SECTIONS.filter(s => s.key === filterSource || (s.key === "__other__" && !knownKeys.includes(filterSource)))
            : SOURCE_SECTIONS;

          return sectionsToShow.map(section => {
            const sectionItems = groupedBySource[section.key] || [];
            const SectionIcon = section.icon;
            const isOpen = openSections[section.key] ?? true;

            return (
              <div key={section.key} className={`border rounded-lg overflow-hidden ${section.color}`} data-testid={`section-${section.key}`}>
                <button
                  className={`w-full flex items-center gap-2 px-4 py-3 font-bold text-sm cursor-pointer select-none`}
                  onClick={() => toggleSection(section.key)}
                  data-testid={`toggle-section-${section.key}`}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  <SectionIcon className="h-4 w-4" />
                  <span>{section.label}</span>
                  <span className="text-xs font-normal opacity-70 ml-1">({sectionItems.length})</span>
                </button>
                {isOpen && (
                  <div className="bg-background">
                    {sectionItems.length === 0 ? (
                      <p className="text-center py-6 text-sm text-muted-foreground">No items</p>
                    ) : (() => {
                      const extraCols = getExtraCols(section.key);
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {user.role === "admin" && (
                                <TableHead className="w-10 text-xs" onClick={e => e.stopPropagation()}>
                                  <Checkbox
                                    checked={sectionItems.length > 0 && sectionItems.every(d => selectedIds.has(d.id))}
                                    onCheckedChange={() => toggleSelectAll(sectionItems)}
                                    data-testid={`checkbox-select-all-${section.key}`}
                                  />
                                </TableHead>
                              )}
                              <TableHead className="min-w-[130px] text-xs select-none cursor-pointer" onClick={() => handleSort("patientName")}>Patient <SortIcon col="patientName" /></TableHead>
                              <TableHead className="min-w-[80px] text-xs select-none cursor-pointer" onClick={() => handleSort("clinic")}>Clinic <SortIcon col="clinic" /></TableHead>
                              <TableHead className="min-w-[100px] text-xs select-none cursor-pointer" onClick={() => handleSort("insurance")}>Insurance <SortIcon col="insurance" /></TableHead>
                              <TableHead className="min-w-[90px] text-xs">DOS From</TableHead>
                              <TableHead className="min-w-[90px] text-xs">DOS To</TableHead>
                              <TableHead className="min-w-[80px] text-xs select-none cursor-pointer" onClick={() => handleSort("amount")}>Amount <SortIcon col="amount" /></TableHead>
                              <TableHead className="min-w-[110px] text-xs select-none cursor-pointer" onClick={() => handleSort("assignedTo")}>Assigned To <SortIcon col="assignedTo" /></TableHead>
                              <TableHead className="min-w-[90px] text-xs select-none cursor-pointer" onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>
                              <TableHead className="min-w-[90px] text-xs">Outcome</TableHead>
                              {extraCols.map(col => (
                                <TableHead
                                  key={col.header}
                                  className={`min-w-[80px] text-xs select-none ${col.sort ? "cursor-pointer" : ""}`}
                                  onClick={col.sort ? () => handleSort(col.sort!) : undefined}
                                >
                                  {col.header} {col.sort && <SortIcon col={col.sort} />}
                                </TableHead>
                              ))}
                              <TableHead className="min-w-[100px] text-xs select-none cursor-pointer" onClick={() => handleSort("dateExported")}>
                                Date Exported <SortIcon col="dateExported" />
                              </TableHead>
                              <TableHead className="min-w-[110px] text-xs">Reason</TableHead>
                              <TableHead className="min-w-[100px] text-xs">Regular Visit</TableHead>
                              <TableHead className="min-w-[90px] text-xs">Full Visit</TableHead>
                              <TableHead className="min-w-[110px] text-xs">Reported Date</TableHead>
                              {user.role === "admin" && <TableHead className="min-w-[60px] text-right text-xs">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sectionItems.map(d => {
                              let rec: any = {};
                              try { if (d.recordData) rec = JSON.parse(d.recordData); } catch {}
                              const statusVal = normalizeStatus(d.status || rec.status || "");
                              return (
                                <TableRow
                                  key={d.id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => openEdit(d)}
                                  data-testid={`row-closed-${d.id}`}
                                >
                                  {user.role === "admin" && (
                                    <TableCell onClick={e => e.stopPropagation()}>
                                      <Checkbox
                                        checked={selectedIds.has(d.id)}
                                        onCheckedChange={() => toggleSelect(d.id)}
                                        data-testid={`checkbox-select-${d.id}`}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell className="text-xs font-medium">{rec.patientName || d.patientName || "-"}</TableCell>
                                  <TableCell className="text-xs">{rec.clinic || d.clinic || "-"}</TableCell>
                                  <TableCell className="text-xs">{rec.insurance || d.insurance || "-"}</TableCell>
                                  <TableCell className="text-xs">{(d as any).dosFrom ? formatDate((d as any).dosFrom) : "-"}</TableCell>
                                  <TableCell className="text-xs">{(d as any).dosTo ? formatDate((d as any).dosTo) : "-"}</TableCell>
                                  <TableCell className="text-xs">{fmtAmt(rec.amount || d.amount)}</TableCell>
                                  <TableCell className="text-xs">{rec.assignedTo || d.assignedTo || "-"}</TableCell>
                                  <TableCell className="text-xs">{statusVal ? <TrackerStatusBadge status={statusVal} /> : "-"}</TableCell>
                                  <TableCell className="text-xs">{(d as any).outcome || "-"}</TableCell>
                                  {extraCols.map(col => (
                                    <TableCell key={col.header} className="text-xs">
                                      {col.renderCell(d, rec)}
                                    </TableCell>
                                  ))}
                                  <TableCell className="text-xs text-muted-foreground">
                                    {(d as any).dateExported ? formatDate((d as any).dateExported) : "-"}
                                  </TableCell>
                                  <TableCell className="text-xs">{(d as any).reason || "-"}</TableCell>
                                  <TableCell className="text-xs">{(d as any).regularVisit != null ? (d as any).regularVisit : "-"}</TableCell>
                                  <TableCell className="text-xs">{(d as any).fullVisit != null ? (d as any).fullVisit : "-"}</TableCell>
                                  <TableCell className="text-xs">{(d as any).reportedDate ? formatDate((d as any).reportedDate) : "-"}</TableCell>
                                  {user.role === "admin" && (
                                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-closed-${d.id}`}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      <Sheet open={drawerOpen} onOpenChange={(v) => { if (!v) { setDrawerOpen(false); setEditingId(null); setForm({ ...emptyForm }); } }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[420px] p-0 flex flex-col"
          onInteractOutside={(e) => { if ((e.target as HTMLElement)?.closest?.("[role='listbox']")) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if ((e.target as HTMLElement)?.closest?.("[role='listbox']")) e.preventDefault(); }}
          data-testid="closed-detail-drawer"
        >
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="text-left" data-testid="text-closed-drawer-title">
              {editingId ? `Edit RTP Record${form.patientName ? ` - ${form.patientName}` : ""}` : "New RTP Record"}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 px-4">
            {editingRecord?.recordData ? (
              /* ── Source-record full view ── */
              <div className="space-y-4 pb-4">
                {/* All source fields read-only */}
                {(() => {
                  const f = (label: string, val: any) => val != null && val !== "" ? { label, value: String(val) } : null;
                  const fd = (label: string, val: any) => val ? f(label, formatDate(val)) : null;
                  let rows: ({ label: string; value: string } | null)[] = [];

                  if (form.source === "Denials" || form.source === "Arbitration") {
                    rows = [
                      f("Patient Name", sourceRec.patientName),
                      f("Clinic", sourceRec.clinic),
                      f("Insurance", sourceRec.insurance),
                      f("Amount", sourceRec.amount ? fmtAmt(sourceRec.amount) : null),
                      f("File Name", sourceRec.denialFileName),
                      fd("Date Input", sourceRec.dateInput),
                      f("Intake", sourceRec.intake),
                      fd("DOA", sourceRec.doa),
                      fd("Date of Letter", sourceRec.dateOfLetter),
                      f("Type of Denial", sourceRec.typeOfDenial),
                      fd("Effective Date", sourceRec.effectiveDate),
                      fd("DOS From", sourceRec.dosFrom),
                      fd("DOS To", sourceRec.dosTo),
                      f("# of Days", sourceRec.numberOfDays != null ? String(sourceRec.numberOfDays) : null),
                      f("Filed To", sourceRec.filedTo),
                      f("ARB Status", sourceRec.arbStatus),
                      fd("Trial Date", sourceRec.trialDate),
                      f("ARB Payment Status", sourceRec.arbPaymentStatus),
                      f("Amount Received", sourceRec.amountReceived),
                      f("Assigned To (Source)", sourceRec.assignedTo),
                      f("Comments", sourceRec.comments),
                    ];
                  } else if (form.source === "Posting") {
                    rows = [
                      f("Patient Name", sourceRec.patientName),
                      f("Clinic", sourceRec.clinic),
                      f("Insurance", sourceRec.insurance),
                      f("File Number", sourceRec.fileNumber),
                      f("Document Type", sourceRec.documentType),
                      f("Priority", sourceRec.priority),
                      fd("Scanned Date", sourceRec.scannedDate),
                      fd("Posted Date", sourceRec.postedDate),
                      fd("Deposit Date", sourceRec.depositDate),
                      f("Deposited By", sourceRec.depositedBy),
                      f("Assigned To (Source)", sourceRec.assignedTo),
                    ];
                  } else if (form.source === "Checks") {
                    rows = [
                      f("Patient Name", sourceRec.patientName),
                      f("Clinic", sourceRec.clinic),
                      f("Insurance", sourceRec.insurance),
                      f("Check Number", sourceRec.checkNumber),
                      f("Amount", sourceRec.amount ? fmtAmt(sourceRec.amount) : null),
                      f("Type", sourceRec.type),
                      fd("Check Date", sourceRec.checkDate),
                      fd("Input Date", sourceRec.inputDate),
                      f("File Name", sourceRec.fileName),
                      fd("Scanned Date", sourceRec.scannedDate),
                      fd("Posted Date", sourceRec.postedDate),
                      fd("Deposit Date", sourceRec.depositDate),
                      f("Deposited By", sourceRec.depositedBy),
                      f("Assigned To (Source)", sourceRec.assignedTo),
                    ];
                  } else if (form.source === "Collections") {
                    rows = [
                      f("Patient Name", sourceRec.patientName),
                      f("Clinic", sourceRec.clinic),
                      f("Insurance", sourceRec.insurance),
                      f("Amount", sourceRec.amount ? fmtAmt(sourceRec.amount) : null),
                      fd("DOS From", sourceRec.dosFrom),
                      fd("DOS To", sourceRec.dosTo),
                      f("Priority", sourceRec.priority),
                      f("Type of Denial", sourceRec.typeOfDenial),
                      f("Assigned To (Source)", sourceRec.assignedTo),
                      f("Comments", sourceRec.comments),
                    ];
                  } else if (form.source === "Verification/Billing") {
                    rows = [
                      f("Patient Name", sourceRec.patientName),
                      f("Clinic", sourceRec.clinic || form.clinic),
                      f("Insurance", sourceRec.insurance || form.insurance),
                      f("Priority", sourceRec.priority),
                      f("Bucket", sourceRec.bucket),
                      fd("IE Date", sourceRec.ieDate),
                      fd("Due Date", sourceRec.dueDate),
                      f("Chart Number", sourceRec.chartNumber),
                    ];
                  } else {
                    rows = [
                      f("Patient Name", sourceRec.patientName || form.patientName),
                      f("Clinic", sourceRec.clinic || form.clinic),
                      f("Insurance", sourceRec.insurance || form.insurance),
                      f("Amount", sourceRec.amount ? fmtAmt(sourceRec.amount) : form.amount ? fmtAmt(form.amount) : null),
                    ];
                  }

                  const visible = rows.filter(Boolean) as { label: string; value: string }[];
                  if (visible.length === 0) return null;
                  return (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {form.source} Record
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/30 rounded-lg p-3">
                        {visible.map(item => (
                          <div key={item.label} className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                            <p className="text-xs font-medium break-words">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* RTP management fields */}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">RTP Management</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Assigned To</Label>
                    <Select value={form.assignedTo || "__none__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-closed-assigned-to"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {activeUsers.map(u => (
                          <SelectItem key={u.id} value={u.fullName}>{u.fullName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status || "__none__"} onValueChange={v => setForm(f => ({ ...f, status: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-closed-status"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {CLOSED_STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Outcome</Label>
                    <Select value={form.outcome || "__none__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-closed-outcome"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {OUTCOME_OPTIONS.map(o => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Insurance</Label>
                    <Select value={form.insurance || "__none__"} onValueChange={v => setForm(f => ({ ...f, insurance: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-closed-rtp-insurance"><SelectValue placeholder="Select insurance" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {(allInsurances || []).filter((i: any) => i.active !== false).map((i: any) => (
                          <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Reason</Label>
                    <Select value={form.reason || "__none__"} onValueChange={v => setForm(f => ({ ...f, reason: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-closed-reason"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {(rtpReasonOpts || []).map(o => (
                          <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">DOS From</Label>
                    <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} className="h-8 text-xs" data-testid="input-closed-dos-from" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">DOS To</Label>
                    <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} className="h-8 text-xs" data-testid="input-closed-dos-to" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Regular Visit (0-100)</Label>
                    <Input type="number" min={0} max={100} value={form.regularVisit} onChange={e => setForm(f => ({ ...f, regularVisit: e.target.value }))} className="h-8 text-xs" data-testid="input-closed-regular-visit" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Full Visit (0-100)</Label>
                    <Input type="number" min={0} max={100} value={form.fullVisit} onChange={e => setForm(f => ({ ...f, fullVisit: e.target.value }))} className="h-8 text-xs" data-testid="input-closed-full-visit" />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Reported Date</Label>
                    <Input type="date" value={form.reportedDate} onChange={e => setForm(f => ({ ...f, reportedDate: e.target.value }))} className="h-8 text-xs" data-testid="input-closed-reported-date" />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="resize-none text-xs min-h-[80px]" data-testid="textarea-closed-notes" />
                  </div>
                  {editingRecord && (editingRecord as any).dateExported && (
                    <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-2">
                      <Download className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                      <span>Exported on <strong>{formatDate((editingRecord as any).dateExported)}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Manual creation / legacy form ── */
              <div className="grid grid-cols-2 gap-4 pb-4">
                <div className="space-y-1.5 col-span-2">
                  <Label>Patient Name *</Label>
                  <Input value={form.patientName} onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))} data-testid="input-closed-patient-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Clinic</Label>
                  <Select value={form.clinic || "__none__"} onValueChange={v => setForm(f => ({ ...f, clinic: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-closed-clinic"><SelectValue placeholder="Select clinic" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {(allClinics || []).filter((c: any) => c.active !== false).map((c: any) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Insurance</Label>
                  <Select value={form.insurance || "__none__"} onValueChange={v => setForm(f => ({ ...f, insurance: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-closed-insurance"><SelectValue placeholder="Select insurance" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {(allInsurances || []).filter((i: any) => i.active !== false).map((i: any) => (
                        <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Assigned To</Label>
                  <Select value={form.assignedTo || "__none__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-closed-assigned-to"><SelectValue placeholder="Select user" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {activeUsers.map(u => (
                        <SelectItem key={u.id} value={u.fullName}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status || "__none__"} onValueChange={v => setForm(f => ({ ...f, status: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-closed-status"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {CLOSED_STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Amount</Label>
                  <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-closed-amount" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Outcome</Label>
                  <Select value={form.outcome || "__none__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-closed-outcome"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {OUTCOME_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Reason</Label>
                  <Select value={form.reason || "__none__"} onValueChange={v => setForm(f => ({ ...f, reason: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-closed-reason"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {(rtpReasonOpts || []).map(o => (
                        <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>DOS From</Label>
                  <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-closed-dos-from" />
                </div>
                <div className="space-y-1.5">
                  <Label>DOS To</Label>
                  <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-closed-dos-to" />
                </div>
                <div className="space-y-1.5">
                  <Label>Regular Visit (0-100)</Label>
                  <Input type="number" min={0} max={100} value={form.regularVisit} onChange={e => setForm(f => ({ ...f, regularVisit: e.target.value }))} data-testid="input-closed-regular-visit" />
                </div>
                <div className="space-y-1.5">
                  <Label>Full Visit (0-100)</Label>
                  <Input type="number" min={0} max={100} value={form.fullVisit} onChange={e => setForm(f => ({ ...f, fullVisit: e.target.value }))} data-testid="input-closed-full-visit" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Reported Date</Label>
                  <Input type="date" value={form.reportedDate} onChange={e => setForm(f => ({ ...f, reportedDate: e.target.value }))} data-testid="input-closed-reported-date" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="resize-none" data-testid="textarea-closed-notes" />
                </div>
                {editingRecord && (editingRecord as any).dateExported && (
                  <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-2">
                    <Download className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                    <span>Exported on <strong>{formatDate((editingRecord as any).dateExported)}</strong></span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pb-4">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-closed">
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => { setDrawerOpen(false); setEditingId(null); setForm({ ...emptyForm }); }} data-testid="button-cancel-closed">
                Cancel
              </Button>
              {editingId && user.role === "admin" && (
                <Button variant="destructive" onClick={() => setDeleteConfirmId(editingId)} data-testid="button-delete-closed-drawer">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              )}
            </div>

            {editingId && (
              <>
                <Separator className="my-4" />
                <div className="pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Add Note</Label>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      placeholder="Add a note..."
                      className="resize-none flex-1"
                      data-testid="textarea-closed-add-note"
                    />
                    <Button
                      size="sm"
                      onClick={() => { if (newNote.trim()) addNoteMutation.mutate(newNote.trim()); }}
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                      data-testid="button-add-note-closed"
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <Separator className="my-4" />

                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 mb-2" data-testid="button-toggle-history-closed">
                      <History className="h-4 w-4" />
                      Activity History
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 pb-6" data-testid="closed-activity-list">
                      {activityLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-6 w-full" />
                        </div>
                      ) : (activityData && activityData.length > 0) ? (
                        activityData.map((act: any, i: number) => (
                          <div key={act.id || i} className="flex items-start gap-2 text-xs border-l-2 border-muted pl-3 py-1" data-testid={`activity-item-${act.id || i}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <UserIcon className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium">{act.user?.fullName || "System"}</span>
                                <span className="text-muted-foreground">{act.action}</span>
                                {act.field && (
                                  <span className="text-muted-foreground">
                                    {act.field}{act.oldValue ? ` from "${act.oldValue}"` : ""}{act.newValue ? ` to "${act.newValue}"` : ""}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                                <Clock className="h-3 w-3" />
                                {formatDate(act.timestamp)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No activity yet</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}>
        <DialogContent data-testid="dialog-confirm-delete-closed">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this RTP record? This action cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete-closed">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-closed"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import RTP Records from CSV</DialogTitle></DialogHeader>
          {csvPreview.length === 0 ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("csv-file-input-closed")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.name.endsWith(".csv")) handleCsvFile(file); }}>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to select or drag & drop a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: .csv</p>
                <input id="csv-file-input-closed" type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">Expected columns: Patient Name, Clinic, Insurance, Assigned To, Status, Amount, Source, Outcome</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm"><span className="font-medium">{csvFileName}</span> — {csvPreview.length} row{csvPreview.length !== 1 ? "s" : ""} found</p>
                <Button variant="ghost" size="sm" onClick={() => { setCsvPreview([]); setCsvFileName(""); }}>Clear</Button>
              </div>
              <div className="border rounded-md overflow-auto max-h-64">
                <table className="text-xs w-full">
                  <thead><tr className="bg-muted">{Object.keys(csvPreview[0]).map(k => <th key={k} className="px-2 py-1 text-left font-medium whitespace-nowrap">{k}</th>)}</tr></thead>
                  <tbody>{csvPreview.slice(0, 50).map((row, i) => <tr key={i} className="border-t">{Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 whitespace-nowrap max-w-[150px] truncate">{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {csvPreview.length > 50 && <p className="text-xs text-muted-foreground text-center">Showing first 50 of {csvPreview.length} rows</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Cancel</Button>
            <Button disabled={csvPreview.length === 0 || importCsvMutation.isPending} onClick={() => importCsvMutation.mutate(csvPreview)}>
              {importCsvMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Record${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
