import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Arbitration, User, Clinic, Insurance, DropdownOption } from "@shared/schema";
import { ARBITRATION_STATUS_OPTIONS, OUTCOME_OPTIONS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEditPanel, type BulkField } from "@/components/bulk-edit-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, ChevronDown, ChevronRight, CheckCircle2, Upload, Scale } from "lucide-react";
import { parseCsvText } from "@/lib/csv-import";
import { Badge } from "@/components/ui/badge";
import { TrackerStatusBadge } from "@/components/status-badge";
import { ScrollSync } from "@/components/scroll-sync";
import { TrackerAmountSummary } from "@/components/tracker-amount-summary";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

function toInputDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

const emptyForm = {
  denialFileName: "",
  dateInput: "",
  intake: "",
  doa: "",
  clinic: "",
  patientLastName: "",
  patientFirstName: "",
  insurance: "",
  dateOfLetter: "",
  typeOfDenial: "",
  effectiveDate: "",
  dosFrom: "",
  dosTo: "",
  numberOfDays: "",
  amount: "",
  comments: "",
  filedTo: "",
  arbStatus: "",
  trialDate: "",
  arbPaymentStatus: "",
  amountReceived: "",
  checkedBy: "",
  comment: "",
  assignedTo: "",
  status: "",
  outcome: "",
  activity: "",
  callCalendarUrgency: "none",
};

export default function ArbitrationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("patientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filterClinic, setFilterClinic] = useState("");
  const [filterInsurance, setFilterInsurance] = useState("");
  const [filterTypeOfDenial, setFilterTypeOfDenial] = useState("");
  const [filterFiledTo, setFilterFiledTo] = useState("");
  const [filterArbStatus, setFilterArbStatus] = useState("");
  const [filterArbPaymentStatus, setFilterArbPaymentStatus] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("assignedToName") || "";
  });
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterDateField, setFilterDateField] = useState("dateInput");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [mainOpen, setMainOpen] = useState(true);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneSortCol, setDoneSortCol] = useState<string>("");
  const [doneSortDir, setDoneSortDir] = useState<"asc" | "desc">("asc");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/arbitrations", editingId, "activity"],
    queryFn: () => fetch(`/api/arbitrations/${editingId}/activity`, { credentials: "include" }).then(r => r.json()),
    enabled: editingId !== null && drawerOpen,
  });

  const { data: arbitrations, isLoading } = useQuery<Arbitration[]>({
    queryKey: ["/api/arbitrations"],
  });

  const autoEditHandled = useRef(false);
  useEffect(() => {
    if (autoEditHandled.current || !arbitrations) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const rec = arbitrations.find((a) => a.id === parseInt(editId));
    if (rec) {
      autoEditHandled.current = true;
      openEdit(rec);
      window.history.replaceState({}, "", "/arbitration");
    }
  }, [arbitrations]);

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const { data: denialTypeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_type"] });
  const { data: filedToOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "filed_to"] });
  const { data: arbStatusOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arb_status"] });
  const { data: arbPaymentOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arb_payment_status"] });
  const { data: arbitrationActivityOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arbitration_action"] });
  const activeUsers = (allUsers || []).filter(u => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).sort((a, b) => a.name.localeCompare(b.name));
  const sortedInsurances = (allInsurances || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const canBulkEdit = user?.role === "admin" || user?.role === "manager" || user?.role === "assigner" || user?.role === "account_manager" || user?.role === "payment_specialist" || user?.role === "case_manager";
  const ARB_BULK_FIELDS: BulkField[] = [
    { value: "clinic", label: "Clinic", type: "select", options: activeClinics.map(c => c.name) },
    { value: "insurance", label: "Insurance", type: "select", options: sortedInsurances.map(i => i.name) },
    { value: "dosFrom", label: "DOS From", type: "date" },
    { value: "dosTo", label: "DOS To", type: "date" },
    { value: "numberOfDays", label: "# of Visits", type: "number" },
    { value: "amount", label: "Amount", type: "text" },
    { value: "assignedTo", label: "Assigned To", type: "select", options: activeUsers.map(u => u.fullName) },
    { value: "activity", label: "Action", type: "select", options: (arbitrationActivityOpts || []).map(o => o.value) },
    { value: "status", label: "Status", type: "select", options: ["Unassigned", "Assigned", "Working on it", "Done"] },
    { value: "denialFileName", label: "File Name", type: "text" },
    { value: "dateInput", label: "Date Input", type: "date" },
    { value: "intake", label: "Intake", type: "select", options: activeUsers.map(u => u.fullName) },
    { value: "doa", label: "DOA", type: "date" },
    { value: "dateOfLetter", label: "Date of Letter", type: "date" },
    { value: "typeOfDenial", label: "Type of Denial", type: "select", options: (denialTypeOpts || []).map(o => o.value) },
    { value: "effectiveDate", label: "Effective Date", type: "date" },
    { value: "filedTo", label: "Filed To", type: "select", options: (filedToOpts || []).map(o => o.value) },
    { value: "arbStatus", label: "ARB Status", type: "select", options: (arbStatusOpts || []).map(o => o.value) },
    { value: "trialDate", label: "Trial Date", type: "date" },
    { value: "arbPaymentStatus", label: "ARB Payment Status", type: "select", options: (arbPaymentOpts || []).map(o => o.value) },
    { value: "amountReceived", label: "Amount Received", type: "text" },
    { value: "checkedBy", label: "Checked By", type: "select", options: activeUsers.map(u => u.fullName) },
    { value: "comment", label: "Comment", type: "text" },
  ];

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/arbitrations/bulk-delete", { ids }).then(r => r.json()),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${result.deleted} record${result.deleted !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: any }) => apiRequest("POST", "/api/arbitrations/bulk-update", { ids, data }).then(r => r.json()),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setSelectedIds(new Set());
      toast({ title: `Updated ${res.updated} record${res.updated !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Bulk update failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/arbitrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setDrawerOpen(false);
      setForm({ ...emptyForm });
      toast({ title: "Arbitration created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/arbitrations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations", editingId, "activity"] });
      setDrawerOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Arbitration updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/arbitrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setDeleteConfirmId(null);
      setDrawerOpen(false);
      setEditingId(null);
      toast({ title: "Arbitration deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importCsvMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/arbitrations/import-csv", { rows }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      toast({ title: `Import complete — ${data.success} created, ${data.updated} updated${data.errors?.length ? `, ${data.errors.length} errors` : ""}` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const CSV_COLUMN_MAP: Record<string, string> = {
    "patient name": "patientName", "patient": "patientName",
    "last name": "lastName", "first name": "firstName",
    "input date": "inputDate", "date input": "inputDate",
    "clinic": "clinic", "insurance": "insurance",
    "dos from": "dosFrom", "dos to": "dosTo",
    "amount": "amount", "type of denial": "typeOfDenial", "denial type": "typeOfDenial",
    "date of letter": "dateOfLetter", "filed to": "filedTo",
    "arb status": "arbStatus", "arb payment status": "arbPaymentStatus",
    "amount received": "amountReceived", "assigned to": "assignedTo",
    "status": "status", "priority": "priority", "outcome": "outcome",
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

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setHistoryOpen(false);
    setDrawerOpen(true);
  }

  function openEdit(arb: Arbitration) {
    setEditingId(arb.id);
    setForm({
      denialFileName: arb.denialFileName || "",
      dateInput: toInputDate(arb.dateInput),
      intake: arb.intake || "",
      doa: toInputDate(arb.doa),
      clinic: arb.clinic || "",
      patientLastName: arb.patientName?.includes(",") ? arb.patientName.split(",")[0].trim() : arb.patientName || "",
      patientFirstName: arb.patientName?.includes(",") ? arb.patientName.split(",").slice(1).join(",").trim() : "",
      insurance: arb.insurance || "",
      dateOfLetter: toInputDate(arb.dateOfLetter),
      typeOfDenial: arb.typeOfDenial || "",
      effectiveDate: toInputDate(arb.effectiveDate),
      dosFrom: toInputDate(arb.dosFrom),
      dosTo: toInputDate(arb.dosTo),
      numberOfDays: arb.numberOfDays != null ? String(arb.numberOfDays) : "",
      amount: arb.amount || "",
      comments: arb.comments || "",
      filedTo: arb.filedTo || "",
      arbStatus: arb.arbStatus || "",
      trialDate: toInputDate(arb.trialDate),
      arbPaymentStatus: arb.arbPaymentStatus || "",
      amountReceived: arb.amountReceived || "",
      checkedBy: arb.checkedBy || "",
      comment: arb.comment || "",
      assignedTo: (() => { const raw = (arb.assignedTo || "").replace(/\s+/g, ' ').trim(); return activeUsers.find(u => u.fullName.replace(/\s+/g, ' ').trim().toLowerCase() === raw.toLowerCase())?.fullName ?? raw; })(),
      status: (arb as any).status || "",
      outcome: (arb as any).outcome || "",
      activity: (arb as any).activity || "",
      callCalendarUrgency: (arb as any).callCalendarUrgency || "none",
    });
    setHistoryOpen(false);
    setDrawerOpen(true);
  }

  function handleSubmit() {
    if (!form.patientLastName.trim()) {
      toast({ title: "Patient last name is required", variant: "destructive" });
      return;
    }
    const patientName = form.patientFirstName.trim()
      ? `${form.patientLastName.trim()}, ${form.patientFirstName.trim()}`
      : form.patientLastName.trim();
    const { patientLastName, patientFirstName, ...rest } = form;
    const submitData = { ...rest, patientName };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData as any });
    } else {
      createMutation.mutate(submitData as any);
    }
  }

  const canDelete = ["admin", "case_manager", "account_manager"].includes(user?.role || "");

  const dateColumns = new Set(["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate"]);
  const numberColumns = new Set(["numberOfDays"]);

  function handleSort(col: string) {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol("");
      setSortDir("");
    }
  }

  function renderSortIcon(col: string) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-50" />;
    if (sortDir === "asc") return <ArrowUp className="h-3 w-3 ml-1 inline-block" />;
    return <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  }

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager" || user?.role === "assigner" || user?.role === "account_manager" || user?.role === "payment_specialist" || user?.role === "case_manager";

  const activeFilterCount = [filterClinic, filterInsurance, filterTypeOfDenial, filterFiledTo, filterArbStatus, filterArbPaymentStatus, filterAssignedTo, filterStatus, filterOutcome, filterDateFrom, filterDateTo].filter(f => f && f !== "__all__").length;

  function clearFilters() {
    setFilterClinic("");
    setFilterInsurance("");
    setFilterTypeOfDenial("");
    setFilterFiledTo("");
    setFilterArbStatus("");
    setFilterArbPaymentStatus("");
    setFilterAssignedTo("");
    setFilterStatus("");
    setFilterOutcome("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  const filtered = (arbitrations || []).filter(d => {
    if (!isAdminOrManager && d.assignedTo !== user?.fullName) return false;
    if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
    if (filterInsurance && filterInsurance !== "__all__" && d.insurance !== filterInsurance) return false;
    if (filterTypeOfDenial && filterTypeOfDenial !== "__all__" && d.typeOfDenial !== filterTypeOfDenial) return false;
    if (filterFiledTo && filterFiledTo !== "__all__" && d.filedTo !== filterFiledTo) return false;
    if (filterArbStatus && filterArbStatus !== "__all__" && d.arbStatus !== filterArbStatus) return false;
    if (filterArbPaymentStatus && filterArbPaymentStatus !== "__all__" && d.arbPaymentStatus !== filterArbPaymentStatus) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
    if (filterStatus && filterStatus !== "__all__" && (d as any).status !== filterStatus) return false;
    if (filterOutcome && filterOutcome !== "__all__" && (d.outcome || "") !== filterOutcome) return false;
    if (filterDateFrom || filterDateTo) {
      const fieldVal = (d as any)[filterDateField];
      if (!fieldVal) return false;
      const dateStr = new Date(fieldVal).toISOString().split("T")[0];
      if (filterDateFrom && dateStr < filterDateFrom) return false;
      if (filterDateTo && dateStr > filterDateTo) return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.patientName?.toLowerCase().includes(q) ||
      d.denialFileName?.toLowerCase().includes(q) ||
      d.clinic?.toLowerCase().includes(q) ||
      d.insurance?.toLowerCase().includes(q) ||
      d.typeOfDenial?.toLowerCase().includes(q) ||
      d.filedTo?.toLowerCase().includes(q) ||
      d.assignedTo?.toLowerCase().includes(q)
    );
  });

  const sorted = sortCol && sortDir ? [...filtered].sort((a, b) => {
    const key = sortCol as keyof Arbitration;
    const aVal = a[key];
    const bVal = b[key];
    let cmp = 0;
    if (dateColumns.has(sortCol)) {
      const aTime = aVal ? new Date(aVal as string).getTime() : 0;
      const bTime = bVal ? new Date(bVal as string).getTime() : 0;
      cmp = aTime - bTime;
    } else if (numberColumns.has(sortCol)) {
      const nA = parseFloat(String(aVal ?? "").replace(/[^0-9.\-]/g, '')) || 0;
      const nB = parseFloat(String(bVal ?? "").replace(/[^0-9.\-]/g, '')) || 0;
      cmp = nA - nB;
    } else {
      cmp = String(aVal || "").localeCompare(String(bVal || ""));
    }
    return sortDir === "desc" ? -cmp : cmp;
  }) : filtered;

  const activeRecords = sorted.filter(d => ((d as any).status || "").toLowerCase() !== "done");
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const valid = new Set(activeRecords.map(r => r.id));
    let changed = false;
    const next = new Set<number>();
    selectedIds.forEach(id => { if (valid.has(id)) next.add(id); else changed = true; });
    if (changed) setSelectedIds(next);
  }, [activeRecords.map(r => r.id).join(",")]);
  const doneRecords = sorted.filter(d => ((d as any).status || "").toLowerCase() === "done");

  function toggleDoneSort(col: string) {
    if (doneSortCol === col) { if (doneSortDir === "asc") setDoneSortDir("desc"); else { setDoneSortCol(""); setDoneSortDir("asc"); } }
    else { setDoneSortCol(col); setDoneSortDir("asc"); }
  }
  const DoneSortIcon = ({ col }: { col: string }) => {
    if (doneSortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    return doneSortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline-block" /> : <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };
  const _doneDateCols = new Set(["dosFrom", "dosTo", "dateInput", "doa", "dateOfLetter", "effectiveDate", "trialDate"]);
  const _doneNumCols = new Set(["numberOfDays", "amount", "amountReceived"]);
  const doneSorted = doneSortCol ? [...doneRecords].sort((a, b) => {
    const vA = (a as any)[doneSortCol] ?? ""; const vB = (b as any)[doneSortCol] ?? "";
    let cmp = 0;
    if (_doneDateCols.has(doneSortCol)) cmp = (vA ? new Date(vA).getTime() : 0) - (vB ? new Date(vB).getTime() : 0);
    else if (_doneNumCols.has(doneSortCol)) cmp = (parseFloat(String(vA).replace(/[^0-9.-]/g, "")) || 0) - (parseFloat(String(vB).replace(/[^0-9.-]/g, "")) || 0);
    else cmp = String(vA).toLowerCase().localeCompare(String(vB).toLowerCase());
    return doneSortDir === "asc" ? cmp : -cmp;
  }) : doneRecords;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const drawerTitle = editingId
    ? (form.patientFirstName ? `${form.patientLastName}, ${form.patientFirstName}` : form.patientLastName || "Edit Arbitration")
    : "New Arbitration";

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-64px)] animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-arbitration-title">Arbitration</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv-arbitration">
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Button onClick={openCreate} data-testid="button-create-arbitration">
            <Plus className="h-4 w-4 mr-1" /> New Arbitration
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search arbitrations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-arbitrations"
          />
        </div>
        <Select value={filterClinic || "__all__"} onValueChange={v => setFilterClinic(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-clinic"><SelectValue placeholder="All Clinics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Clinics</SelectItem>
            {activeClinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterInsurance || "__all__"} onValueChange={v => setFilterInsurance(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-insurance"><SelectValue placeholder="All Insurances" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Insurances</SelectItem>
            {sortedInsurances.map(i => <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTypeOfDenial || "__all__"} onValueChange={v => setFilterTypeOfDenial(v)}>
          <SelectTrigger className="w-[150px]" data-testid="filter-type-of-denial"><SelectValue placeholder="All Denial Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Denial Types</SelectItem>
            {(denialTypeOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterFiledTo || "__all__"} onValueChange={v => setFilterFiledTo(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-filed-to"><SelectValue placeholder="All Filed To" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Filed To</SelectItem>
            {(filedToOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterArbStatus || "__all__"} onValueChange={v => setFilterArbStatus(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-arb-status"><SelectValue placeholder="All ARB Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All ARB Status</SelectItem>
            {(arbStatusOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterArbPaymentStatus || "__all__"} onValueChange={v => setFilterArbPaymentStatus(v)}>
          <SelectTrigger className="w-[155px]" data-testid="filter-arb-payment-status"><SelectValue placeholder="All ARB Payment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All ARB Payment</SelectItem>
            {(arbPaymentOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-assigned-to"><SelectValue placeholder="All Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Assigned</SelectItem>
            {[...new Map([...(arbitrations || []).map(d => d.assignedTo).filter(Boolean), ...activeUsers.map(u => u.fullName)].map(n => [n.replace(/\s+/g, ' ').trim().toLowerCase(), n.replace(/\s+/g, ' ').trim()])).values()].sort().map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus || "__all__"} onValueChange={v => setFilterStatus(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {ARBITRATION_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOutcome || "__all__"} onValueChange={v => setFilterOutcome(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-outcome"><SelectValue placeholder="All Outcomes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Outcomes</SelectItem>
            {OUTCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDateField} onValueChange={setFilterDateField}>
          <SelectTrigger className="w-[140px]" data-testid="filter-date-field"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dateInput">Input Date</SelectItem>
            <SelectItem value="doa">Date of Accident</SelectItem>
            <SelectItem value="dateOfLetter">Date of Letter</SelectItem>
            <SelectItem value="effectiveDate">Effective Date</SelectItem>
            <SelectItem value="dosFrom">DOS From</SelectItem>
            <SelectItem value="dosTo">DOS To</SelectItem>
            <SelectItem value="trialDate">Trial Date</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-[140px] h-10" data-testid="filter-date-from" />
        <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-[140px] h-10" data-testid="filter-date-to" />
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      <TrackerAmountSummary label="Arbitration" openRecords={activeRecords} doneRecords={doneRecords} />

      <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto pb-6">
      <Collapsible open={mainOpen} onOpenChange={setMainOpen}>
        <Card className="border border-indigo-200 dark:border-indigo-800/30 shadow-sm shrink-0">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none bg-indigo-50 dark:bg-indigo-950/20" data-testid="arbitration-main-section-header">
              {mainOpen ? <ChevronDown className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> : <ChevronRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
              <Scale className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-bold tracking-wide text-indigo-600 dark:text-indigo-400">ARBITRATION</span>
              <span className="text-xs text-muted-foreground ml-auto font-medium">{activeRecords.length} record{activeRecords.length !== 1 ? "s" : ""}</span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0">
          {canBulkEdit && (
            <BulkEditPanel
              selectedCount={selectedIds.size}
              fields={ARB_BULK_FIELDS}
              isPending={bulkUpdateMutation.isPending}
              onApply={(field, value) => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), data: { [field]: value } })}
              onClear={() => setSelectedIds(new Set())}
              onDelete={canDelete ? () => bulkDeleteMutation.mutate(Array.from(selectedIds)) : undefined}
              isDeletePending={bulkDeleteMutation.isPending}
              testIdPrefix="arbitration-bulk"
            />
          )}
          <ScrollSync>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {canBulkEdit && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={activeRecords.length > 0 && activeRecords.every(r => selectedIds.has(r.id))}
                        onCheckedChange={(c) => {
                          if (c) setSelectedIds(new Set(activeRecords.map(r => r.id)));
                          else setSelectedIds(new Set());
                        }}
                        data-testid="checkbox-select-all-arbitrations"
                      />
                    </TableHead>
                  )}
                  <TableHead className="min-w-[130px] cursor-pointer select-none" onClick={() => handleSort("patientName")} data-testid="sort-patientName">Patient Name{renderSortIcon("patientName")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic{renderSortIcon("clinic")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("insurance")} data-testid="sort-insurance">Insurance{renderSortIcon("insurance")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosFrom")} data-testid="sort-dosFrom">DOS From{renderSortIcon("dosFrom")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosTo")} data-testid="sort-dosTo">DOS To{renderSortIcon("dosTo")}</TableHead>
                  <TableHead className="min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("numberOfDays")} data-testid="sort-numberOfDays"># of Visits{renderSortIcon("numberOfDays")}</TableHead>
                  <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount{renderSortIcon("amount")}</TableHead>
                  <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To{renderSortIcon("assignedTo")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("activity")} data-testid="sort-activity">Action{renderSortIcon("activity")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("status")} data-testid="sort-status">Status{renderSortIcon("status")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("outcome")} data-testid="sort-outcome">Outcome{renderSortIcon("outcome")}</TableHead>
                  <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("denialFileName")} data-testid="sort-denialFileName">File Name{renderSortIcon("denialFileName")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dateInput")} data-testid="sort-dateInput">Date Input{renderSortIcon("dateInput")}</TableHead>
                  <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("intake")} data-testid="sort-intake">Intake{renderSortIcon("intake")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("doa")} data-testid="sort-doa">DOA{renderSortIcon("doa")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("dateOfLetter")} data-testid="sort-dateOfLetter">Date of Letter{renderSortIcon("dateOfLetter")}</TableHead>
                  <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("typeOfDenial")} data-testid="sort-typeOfDenial">Type of Denial{renderSortIcon("typeOfDenial")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("effectiveDate")} data-testid="sort-effectiveDate">Effective Date{renderSortIcon("effectiveDate")}</TableHead>
                  <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("filedTo")} data-testid="sort-filedTo">Filed To{renderSortIcon("filedTo")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("arbStatus")} data-testid="sort-arbStatus">ARB Status{renderSortIcon("arbStatus")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("trialDate")} data-testid="sort-trialDate">Trial Date{renderSortIcon("trialDate")}</TableHead>
                  <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("arbPaymentStatus")} data-testid="sort-arbPaymentStatus">ARB Payment{renderSortIcon("arbPaymentStatus")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("amountReceived")} data-testid="sort-amountReceived">Amt Received{renderSortIcon("amountReceived")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("checkedBy")} data-testid="sort-checkedBy">Checked By{renderSortIcon("checkedBy")}</TableHead>
                  <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("comment")} data-testid="sort-comment">Comment{renderSortIcon("comment")}</TableHead>
                  {canDelete && <TableHead className="min-w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={26 + (canBulkEdit ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                      No arbitrations found
                    </TableCell>
                  </TableRow>
                )}
                {activeRecords.map(d => {
                  const isTransferred = (d.comments || "").startsWith("[Transferred from");
                  return (
                  <TableRow key={d.id} className={`cursor-pointer ${isTransferred ? "text-blue-600 dark:text-blue-400" : ""}`} onClick={() => openEdit(d)} data-testid={`row-arbitration-${d.id}`}>
                    {canBulkEdit && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(d.id)}
                          onCheckedChange={(c) => {
                            const next = new Set(selectedIds);
                            if (c) next.add(d.id); else next.delete(d.id);
                            setSelectedIds(next);
                          }}
                          data-testid={`checkbox-select-arbitration-${d.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                    <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                    <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                    <TableCell className="text-xs">{d.numberOfDays ?? "-"}</TableCell>
                    <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                    <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                    <TableCell className="text-xs">{(d as any).activity || "-"}</TableCell>
                    <TableCell className="text-xs">
                      {(d as any).status ? <TrackerStatusBadge status={(d as any).status} /> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{(d as any).outcome || "-"}</TableCell>
                    <TableCell className="text-xs">{d.denialFileName || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateInput)}</TableCell>
                    <TableCell className="text-xs">{d.intake || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.doa)}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateOfLetter)}</TableCell>
                    <TableCell className="text-xs">
                      {d.typeOfDenial ? <TrackerStatusBadge status={d.typeOfDenial} /> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(d.effectiveDate)}</TableCell>
                    <TableCell className="text-xs">
                      {d.filedTo ? <TrackerStatusBadge status={d.filedTo} /> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.arbStatus ? <TrackerStatusBadge status={d.arbStatus} /> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(d.trialDate)}</TableCell>
                    <TableCell className="text-xs">
                      {d.arbPaymentStatus ? <TrackerStatusBadge status={d.arbPaymentStatus} /> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{d.amountReceived ? (() => { const n = parseFloat(d.amountReceived.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amountReceived : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                    <TableCell className="text-xs">{d.checkedBy || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{d.comment || "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {canDelete && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(d.id); }} data-testid={`button-delete-arbitration-${d.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollSync>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {doneRecords.length > 0 && (
        <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
          <Card className="border border-emerald-200 dark:border-emerald-800/30 shadow-sm shrink-0">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none bg-emerald-50 dark:bg-emerald-950/20" data-testid="collapsible-done-section">
              {doneOpen ? <ChevronDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <ChevronRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-bold tracking-wide text-emerald-700 dark:text-emerald-400">DONE</span>
              <span className="text-xs text-muted-foreground ml-auto font-medium">{doneRecords.length} record{doneRecords.length !== 1 ? "s" : ""}</span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0">
            <div className="overflow-auto max-h-80 border-t">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {([["patientName","Patient Name","130px"],["clinic","Clinic","100px"],["insurance","Insurance","100px"],["dosFrom","DOS From","90px"],["dosTo","DOS To","90px"],["numberOfDays","# of Visits","70px"],["amount","Amount","80px"],["assignedTo","Assigned To","110px"],["action","Action","100px"],["status","Status","100px"],["outcome","Outcome","100px"],["denialFileName","File Name","120px"],["dateInput","Date Input","90px"],["intake","Intake","80px"],["doa","DOA","90px"],["dateOfLetter","Date of Letter","100px"],["typeOfDenial","Type of Denial","120px"],["effectiveDate","Effective Date","100px"],["filedTo","Filed To","80px"],["arbStatus","ARB Status","90px"],["trialDate","Trial Date","90px"],["arbPaymentStatus","ARB Payment","110px"],["amountReceived","Amt Received","90px"],["checkedBy","Checked By","90px"],["comment","Comment","120px"]] as [string,string,string][]).map(([col,label,minW]) => (
                      <TableHead key={col} className="cursor-pointer select-none whitespace-nowrap" style={{minWidth:minW}} onClick={() => toggleDoneSort(col)}>{label}<DoneSortIcon col={col} /></TableHead>
                    ))}
                    {canDelete && <TableHead className="min-w-[80px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doneSorted.map(d => {
                    const isTransferred = (d.comments || "").startsWith("[Transferred from");
                    return (
                    <TableRow key={d.id} className={`cursor-pointer ${isTransferred ? "text-blue-600 dark:text-blue-400" : ""}`} onClick={() => openEdit(d)} data-testid={`row-arbitration-done-${d.id}`}>
                      <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                      <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                      <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                      <TableCell className="text-xs">{d.numberOfDays ?? "-"}</TableCell>
                      <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                      <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                      <TableCell className="text-xs">{(d as any).activity || "-"}</TableCell>
                      <TableCell className="text-xs">{(d as any).status ? <TrackerStatusBadge status={(d as any).status} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{(d as any).outcome || "-"}</TableCell>
                      <TableCell className="text-xs">{d.denialFileName || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.dateInput)}</TableCell>
                      <TableCell className="text-xs">{d.intake || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.doa)}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.dateOfLetter)}</TableCell>
                      <TableCell className="text-xs">{d.typeOfDenial ? <TrackerStatusBadge status={d.typeOfDenial} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.effectiveDate)}</TableCell>
                      <TableCell className="text-xs">{d.filedTo ? <TrackerStatusBadge status={d.filedTo} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{d.arbStatus ? <TrackerStatusBadge status={d.arbStatus} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.trialDate)}</TableCell>
                      <TableCell className="text-xs">{d.arbPaymentStatus ? <TrackerStatusBadge status={d.arbPaymentStatus} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{d.amountReceived ? (() => { const n = parseFloat(d.amountReceived.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amountReceived : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                      <TableCell className="text-xs">{d.checkedBy || "-"}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{d.comment || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canDelete && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(d.id); }} data-testid={`button-delete-arbitration-done-${d.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={(v) => { if (!v) { setDrawerOpen(false); setEditingId(null); setForm({ ...emptyForm }); } }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[420px] p-0 flex flex-col"
          data-testid="arbitration-detail-drawer"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest("[role='listbox']") || target?.closest("[data-radix-popper-content-wrapper]")) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest("[role='listbox']") || target?.closest("[data-radix-popper-content-wrapper]")) {
              e.preventDefault();
            }
          }}
        >
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="text-left" data-testid="text-arbitration-drawer-title">
              {drawerTitle}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 pt-2 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Patient First Name</Label>
                  <Input value={form.patientFirstName} onChange={e => setForm(f => ({ ...f, patientFirstName: e.target.value }))} data-testid="input-arb-patient-first-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Patient Last Name *</Label>
                  <Input value={form.patientLastName} onChange={e => setForm(f => ({ ...f, patientLastName: e.target.value }))} data-testid="input-arb-patient-last-name" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Clinic</Label>
                  <Select value={form.clinic || "__clear__"} onValueChange={v => setForm(f => ({ ...f, clinic: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-clinic">
                      <SelectValue placeholder="Select clinic..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {activeClinics.map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Insurance</Label>
                  <Select value={form.insurance || "__none__"} onValueChange={v => setForm(f => ({ ...f, insurance: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-insurance"><SelectValue placeholder="Select insurance" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select insurance</SelectItem>
                      {sortedInsurances.map(ins => (
                        <SelectItem key={ins.id} value={ins.name}>{ins.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOS From</Label>
                  <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-arb-dos-from" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOS To</Label>
                  <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-arb-dos-to" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground"># of Visits</Label>
                  <Input type="number" value={form.numberOfDays} onChange={e => setForm(f => ({ ...f, numberOfDays: e.target.value }))} data-testid="input-arb-days" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-arb-amount" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Assigned To</Label>
                  <Select value={form.assignedTo || "__clear__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-assigned-to">
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(() => {
                        const names = new Map(activeUsers.map(u => [u.fullName.replace(/\s+/g, ' ').trim().toLowerCase(), u.fullName]));
                        if (form.assignedTo && !names.has(form.assignedTo.replace(/\s+/g, ' ').trim().toLowerCase())) {
                          names.set(form.assignedTo.replace(/\s+/g, ' ').trim().toLowerCase(), form.assignedTo);
                        }
                        return [...names.values()].sort().map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Action</Label>
                  <Select value={form.activity || "__clear__"} onValueChange={v => setForm(f => ({ ...f, activity: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-activity">
                      <SelectValue placeholder="Select action..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(arbitrationActivityOpts || []).map(o => (
                        <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={form.status || "__clear__"} onValueChange={v => setForm(f => ({ ...f, status: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-status-field">
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {ARBITRATION_STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Outcome</Label>
                  <Select value={form.outcome || "__clear__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-outcome">
                      <SelectValue placeholder="Select outcome..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {OUTCOME_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Call Calendar Urgency</Label>
                <Select value={form.callCalendarUrgency || "none"} onValueChange={v => setForm(f => ({ ...f, callCalendarUrgency: v }))}>
                  <SelectTrigger data-testid="select-arb-call-calendar-urgency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="urgent">🚨 Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">File Name</Label>
                  <Input value={form.denialFileName} onChange={e => setForm(f => ({ ...f, denialFileName: e.target.value }))} data-testid="input-arb-file-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date Input</Label>
                  <Input type="date" value={form.dateInput} onChange={e => setForm(f => ({ ...f, dateInput: e.target.value }))} data-testid="input-arb-date-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Intake</Label>
                  <Select value={form.intake || "__clear__"} onValueChange={v => setForm(f => ({ ...f, intake: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-intake">
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(() => {
                        const names = new Map(activeUsers.map(u => [u.fullName.replace(/\s+/g, ' ').trim().toLowerCase(), u.fullName]));
                        if (form.intake && !names.has(form.intake.replace(/\s+/g, ' ').trim().toLowerCase())) {
                          names.set(form.intake.replace(/\s+/g, ' ').trim().toLowerCase(), form.intake);
                        }
                        return [...names.values()].sort().map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOA</Label>
                  <Input type="date" value={form.doa} onChange={e => setForm(f => ({ ...f, doa: e.target.value }))} data-testid="input-arb-doa" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date of Letter</Label>
                  <Input type="date" value={form.dateOfLetter} onChange={e => setForm(f => ({ ...f, dateOfLetter: e.target.value }))} data-testid="input-arb-date-of-letter" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type of Denial</Label>
                  <Select value={form.typeOfDenial} onValueChange={v => setForm(f => ({ ...f, typeOfDenial: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-type">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(denialTypeOpts || []).map(o => o.value).map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Effective Date</Label>
                  <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} data-testid="input-arb-effective-date" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Filed To</Label>
                  <div className="relative" data-testid="combo-arb-filed-to">
                    <Input
                      value={form.filedTo}
                      onChange={e => setForm(f => ({ ...f, filedTo: e.target.value }))}
                      placeholder="Type or select..."
                      data-testid="input-arb-filed-to"
                      list="arb-filed-to-options"
                    />
                    <datalist id="arb-filed-to-options">
                      {(filedToOpts || []).map(o => o.value).map(o => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">ARB Status</Label>
                  <Select value={form.arbStatus} onValueChange={v => setForm(f => ({ ...f, arbStatus: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-status">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(arbStatusOpts || []).map(o => o.value).map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Trial Date</Label>
                  <Input type="date" value={form.trialDate} onChange={e => setForm(f => ({ ...f, trialDate: e.target.value }))} data-testid="input-arb-trial-date" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">ARB Payment Status</Label>
                  <Select value={form.arbPaymentStatus} onValueChange={v => setForm(f => ({ ...f, arbPaymentStatus: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-arb-payment">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(arbPaymentOpts || []).map(o => o.value).map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount Received</Label>
                  <Input value={form.amountReceived} onChange={e => setForm(f => ({ ...f, amountReceived: e.target.value }))} placeholder="$0.00" data-testid="input-arb-amount-received" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Checked By</Label>
                <Input value={form.checkedBy} onChange={e => setForm(f => ({ ...f, checkedBy: e.target.value }))} data-testid="input-arb-checked-by" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Comments</Label>
                <Textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} rows={2} data-testid="input-arb-comments" />
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-arbitration"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
              </Button>

              {editingId && canDelete && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDeleteConfirmId(editingId)}
                  data-testid="button-delete-arbitration-drawer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Arbitration
                </Button>
              )}

              {editingId && (
                <>
                  <Separator />
                  <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-start gap-2" data-testid="button-toggle-history">
                        <History className="h-4 w-4" />
                        <span className="text-sm font-semibold">Activity History</span>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3 pt-2">
                        {activityLoading ? (
                          <div className="space-y-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                          </div>
                        ) : !activityData || activityData.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet</p>
                        ) : (
                          <div className="space-y-3">
                            {activityData.map((a: any) => (
                              <div key={a.id} className="border rounded-md p-3 space-y-1" data-testid={`activity-arb-${a.id}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{a.action}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(a.timestamp).toLocaleString("en-US", {
                                      month: "short", day: "numeric", year: "numeric",
                                      hour: "numeric", minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  by {a.userName || "System"}
                                </div>
                                {a.field && (
                                  <div className="text-xs mt-1 space-y-0.5">
                                    {a.oldValue && (
                                      <div className="flex gap-1 flex-wrap">
                                        <span className="text-muted-foreground">From:</span>
                                        <span className="line-through text-muted-foreground">{a.oldValue}</span>
                                      </div>
                                    )}
                                    {a.newValue && (
                                      <div className="flex gap-1 flex-wrap">
                                        <span className="text-muted-foreground">To:</span>
                                        <span className="font-medium">{a.newValue}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Arbitration</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this arbitration record? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete-arb">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-arb">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Arbitrations from CSV</DialogTitle></DialogHeader>
          {csvPreview.length === 0 ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("csv-file-input-arb")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.name.endsWith(".csv")) handleCsvFile(file); }}>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to select or drag & drop a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: .csv</p>
                <input id="csv-file-input-arb" type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">Expected columns: Patient Name, Clinic, Insurance, DOS From, DOS To, Amount, Type of Denial, Date of Letter, Filed To, ARB Status, Assigned To, Status, Priority</p>
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
              {importCsvMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Arbitration${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
