import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import type { Posting, User, Clinic } from "@shared/schema";
import { POSTING_DOCUMENT_TYPES, POSTING_STATUS_OPTIONS, POSTING_PRIORITY_OPTIONS, OUTCOME_OPTIONS } from "@shared/schema";
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
import { TrackerPriorityBadge, TrackerStatusBadge } from "@/components/status-badge";
import { ScrollSync } from "@/components/scroll-sync";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, MessageSquare, User as UserIcon, Clock, ChevronDown, ChevronRight, CheckCircle2, Upload, FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEditPanel, type BulkField } from "@/components/bulk-edit-panel";
import { parseCsvText } from "@/lib/csv-import";
import { TrackerAmountSummary } from "@/components/tracker-amount-summary";

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

function matchesPostingSearch(posting: Posting, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;

  if (Object.values(posting).some(value => value != null && String(value).toLowerCase().includes(search))) {
    return true;
  }

  // Amounts are displayed with a dollar sign, commas and two decimal places,
  // while stored values may contain none of those formatting characters.
  if (/^\$?\s*-?\d[\d,]*(?:\.\d*)?$/.test(search) && posting.amount) {
    const amount = Number(String(posting.amount).replace(/[$,\s]/g, ""));
    if (Number.isFinite(amount)) {
      const normalizedSearch = search.replace(/[$,\s]/g, "");
      return amount.toFixed(2).includes(normalizedSearch);
    }
  }
  return false;
}


const emptyForm = {
  fileNumber: "",
  clinic: "",
  scannedDate: "",
  documentType: "",
  postedDate: "",
  priority: "",
  assignedTo: "",
  status: "",
  amount: "",
  outcome: "",
  activity: "",
  depositDate: "",
  depositedBy: "",
  callCalendarUrgency: "none",
};

export default function PostingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string>("fileNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterClinic, setFilterClinic] = useState("");
  const [filterDocumentType, setFilterDocumentType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("assignedToName") || "";
  });
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterDateField, setFilterDateField] = useState("scannedDate");
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

  const isAdminOrManager = user.role === "admin" || user.role === "manager" || user.role === "assigner" || user.role === "account_manager" || user.role === "case_manager" || user.role === "payment_specialist";
  const canEdit = isAdminOrManager;
  const canDelete = ["admin", "case_manager", "account_manager"].includes(user.role);
  const canBulkEdit = isAdminOrManager;

  const { data: postingList, isLoading } = useQuery<Posting[]>({ queryKey: ["/api/postings"] });

  const autoEditHandled = useRef(false);
  useEffect(() => {
    if (autoEditHandled.current || !postingList) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const rec = postingList.find((p) => p.id === parseInt(editId));
    if (rec) {
      autoEditHandled.current = true;
      openEdit(rec);
      window.history.replaceState({}, "", "/posting");
    }
  }, [postingList]);

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/postings", editingId, "activity"],
    enabled: !!editingId,
  });
  const { data: postingActivityOptions } = useQuery<any[]>({
    queryKey: ["/api/dropdown-options/posting_action"],
  });

  const activeUsers = (allUsers || []).filter((u: any) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).sort((a, b) => a.name.localeCompare(b.name));

  const POSTING_BULK_FIELDS: BulkField[] = [
    { value: "clinic", label: "Clinic", type: "select", options: activeClinics.map(c => c.name) },
    { value: "scannedDate", label: "Scanned Date", type: "date" },
    { value: "documentType", label: "Document Type", type: "select", options: [...POSTING_DOCUMENT_TYPES] },
    { value: "postedDate", label: "Posted Date", type: "date" },
    { value: "priority", label: "Priority", type: "select", options: [...POSTING_PRIORITY_OPTIONS] },
    { value: "assignedTo", label: "Assigned To", type: "select", options: activeUsers.map(u => u.fullName) },
    { value: "amount", label: "Amount", type: "text" },
    { value: "status", label: "Status", type: "select", options: [...POSTING_STATUS_OPTIONS] },
    { value: "depositDate", label: "Deposit Date", type: "date" },
    { value: "depositedBy", label: "Deposited By", type: "select", options: activeUsers.map(u => u.fullName) },
    { value: "activity", label: "Action", type: "select", options: (postingActivityOptions || []).map((o: any) => o.value) },
  ];

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/postings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      setDrawerOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Posting created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/postings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/postings", editingId, "activity"] });
      toast({ title: "Posting updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/postings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      setDeleteConfirmId(null);
      setDrawerOpen(false);
      setEditingId(null);
      toast({ title: "Posting deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/postings/${editingId}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/postings", editingId, "activity"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/postings/bulk-delete", { ids }).then(r => r.json()),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${result.deleted} record${result.deleted !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: any }) => apiRequest("POST", "/api/postings/bulk-update", { ids, data }).then(r => r.json()),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      setSelectedIds(new Set());
      toast({ title: `Updated ${res.updated} record${res.updated !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Bulk update failed", description: e.message, variant: "destructive" }),
  });

  const importCsvMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/postings/import-csv", { rows }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/postings"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      toast({ title: `Import complete — ${data.success} created, ${data.updated} updated${data.errors?.length ? `, ${data.errors.length} errors` : ""}` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const CSV_COLUMN_MAP: Record<string, string> = {
    "patient name": "patientName", "patient": "patientName", "patientname": "patientName",
    "name": "patientName", "full name": "patientName", "fullname": "patientName",
    "pt name": "patientName", "pt": "patientName", "patient full name": "patientName",
    "last name": "lastName", "lastname": "lastName", "last": "lastName",
    "first name": "firstName", "firstname": "firstName", "first": "firstName",
    "file number": "fileNumber", "file #": "fileNumber", "file no": "fileNumber",
    "filenumber": "fileNumber", "file": "fileNumber", "file num": "fileNumber",
    "clinic": "clinic", "document type": "documentType", "doc type": "documentType",
    "doctype": "documentType", "type": "documentType",
    "priority": "priority", "assigned to": "assignedTo", "assignedto": "assignedTo",
    "assigned": "assignedTo", "status": "status",
    "amount": "amount", "insurance": "insurance", "outcome": "outcome",
  };

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text, CSV_COLUMN_MAP, { requirePatientName: false });
      setCsvPreview(rows);
      setCsvFileName(file.name);
      if (rows.length === 0) toast({ title: "No valid rows found", description: "CSV appears to be empty", variant: "destructive" });
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
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

  function openEdit(d: Posting) {
    if (!canEdit) return;
    setEditingId(d.id);
    setForm({
      fileNumber: d.fileNumber || "",
      clinic: d.clinic || "",
      scannedDate: toInputDate(d.scannedDate),
      documentType: d.documentType || "",
      postedDate: toInputDate(d.postedDate),
      priority: d.priority || "",
      assignedTo: (() => { const raw = (d.assignedTo || "").replace(/\s+/g, ' ').trim(); return activeUsers.find(u => u.fullName.replace(/\s+/g, ' ').trim().toLowerCase() === raw.toLowerCase())?.fullName ?? raw; })(),
      status: d.status || "",
      amount: d.amount || "",
      outcome: d.outcome || "",
      activity: (d as any).activity || "",
      depositDate: toInputDate(d.depositDate),
      depositedBy: d.depositedBy || "",
      callCalendarUrgency: (d as any).callCalendarUrgency || "none",
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

  const activeFilterCount = [filterClinic, filterDocumentType, filterStatus, filterPriority, filterAssignedTo, filterOutcome, filterDateFrom, filterDateTo]
    .filter(v => v && v !== "__all__").length;

  function clearFilters() {
    setFilterClinic("");
    setFilterDocumentType("");
    setFilterStatus("");
    setFilterPriority("");
    setFilterAssignedTo("");
    setFilterOutcome("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  const canSeePaymentDocs = user.role === "admin" || user.role === "payment_specialist" || user.role === "account_manager";

  const filteredUnsorted = (postingList || []).filter(d => {
    if (!canSeePaymentDocs && (d.documentType || "").toLowerCase() === "payment") return false;
    if (!matchesPostingSearch(d, searchQuery)) return false;
    if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
    if (filterDocumentType && filterDocumentType !== "__all__" && d.documentType !== filterDocumentType) return false;
    if (filterStatus && filterStatus !== "__all__" && d.status !== filterStatus) return false;
    if (filterPriority && filterPriority !== "__all__" && d.priority !== filterPriority) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
    if (filterOutcome && filterOutcome !== "__all__" && (d.outcome || "") !== filterOutcome) return false;
    if (filterDateFrom || filterDateTo) {
      const fieldVal = (d as any)[filterDateField];
      if (!fieldVal) return false;
      const dateStr = new Date(fieldVal).toISOString().split("T")[0];
      if (filterDateFrom && dateStr < filterDateFrom) return false;
      if (filterDateTo && dateStr > filterDateTo) return false;
    }
    return true;
  });

  const dateColumns = new Set(["scannedDate", "postedDate", "createdAt"]);
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

  const activeRecords = filtered.filter(d => (d.status || "").toLowerCase() !== "done");
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const valid = new Set(activeRecords.map(r => r.id));
    let changed = false;
    const next = new Set<number>();
    selectedIds.forEach(id => { if (valid.has(id)) next.add(id); else changed = true; });
    if (changed) setSelectedIds(next);
  }, [activeRecords.map(r => r.id).join(",")]);
  const doneRecords = filtered.filter(d => (d.status || "").toLowerCase() === "done");

  useEffect(() => {
    if (!searchQuery.trim() || !postingList) return;
    setMainOpen(activeRecords.length > 0 || doneRecords.length === 0);
    setDoneOpen(doneRecords.length > 0);
  }, [searchQuery, postingList, activeRecords.length, doneRecords.length]);

  function toggleDoneSort(col: string) {
    if (doneSortCol === col) { if (doneSortDir === "asc") setDoneSortDir("desc"); else { setDoneSortCol(""); setDoneSortDir("asc"); } }
    else { setDoneSortCol(col); setDoneSortDir("asc"); }
  }
  const DoneSortIcon = ({ col }: { col: string }) => {
    if (doneSortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    return doneSortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline-block" /> : <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };
  const _doneDateCols = new Set(["scannedDate", "postedDate", "depositDate"]);
  const _doneNumCols = new Set(["amount"]);
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
      <div className="p-6 space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-64px)] animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-posting-title">Posting</h1>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv-posting">
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button onClick={openCreate} data-testid="button-create-posting">
                <Plus className="h-4 w-4 mr-1" /> New Posting
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search postings or amount..."
            value={searchQuery}
            onChange={e => {
              const value = e.target.value;
              setSearchQuery(value);
              if (!value.trim()) {
                setMainOpen(true);
                setDoneOpen(false);
              }
            }}
            className="pl-9"
            data-testid="input-search-postings"
          />
        </div>
        <Select value={filterClinic || "__all__"} onValueChange={v => setFilterClinic(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-posting-clinic"><SelectValue placeholder="All Clinics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Clinics</SelectItem>
            {activeClinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDocumentType || "__all__"} onValueChange={v => setFilterDocumentType(v)}>
          <SelectTrigger className="w-[150px]" data-testid="filter-posting-document-type"><SelectValue placeholder="All Doc Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Doc Types</SelectItem>
            {POSTING_DOCUMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || "__all__"} onValueChange={v => setFilterStatus(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-posting-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {POSTING_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority || "__all__"} onValueChange={v => setFilterPriority(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-posting-priority"><SelectValue placeholder="All Priorities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Priorities</SelectItem>
            {POSTING_PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-posting-assigned-to"><SelectValue placeholder="All Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Assigned</SelectItem>
            {[...new Map([...(postingList || []).map(d => d.assignedTo).filter(Boolean), ...activeUsers.map(u => u.fullName)].map(n => [n.replace(/\s+/g, ' ').trim().toLowerCase(), n.replace(/\s+/g, ' ').trim()])).values()].sort().map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOutcome || "__all__"} onValueChange={v => setFilterOutcome(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-outcome"><SelectValue placeholder="All Outcomes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Outcomes</SelectItem>
            {OUTCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDateField} onValueChange={setFilterDateField}>
          <SelectTrigger className="w-[140px]" data-testid="filter-date-field"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="scannedDate">Scanned Date</SelectItem>
            <SelectItem value="postedDate">Posted Date</SelectItem>
            <SelectItem value="depositDate">Deposit Date</SelectItem>
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

      <TrackerAmountSummary label="Posting" openRecords={activeRecords} doneRecords={doneRecords} />

      <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto pb-6">
      <Collapsible open={mainOpen} onOpenChange={setMainOpen}>
        <Card className="border border-purple-200 dark:border-purple-800/30 shadow-sm shrink-0">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none bg-purple-50 dark:bg-purple-950/20" data-testid="posting-main-section-header">
              {mainOpen ? <ChevronDown className="h-4 w-4 text-purple-600 dark:text-purple-400" /> : <ChevronRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
              <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-bold tracking-wide text-purple-600 dark:text-purple-400">POSTINGS</span>
              <span className="text-xs text-muted-foreground ml-auto font-medium">{activeRecords.length} record{activeRecords.length !== 1 ? "s" : ""}</span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0">
      {canBulkEdit && (
        <BulkEditPanel
          selectedCount={selectedIds.size}
          fields={POSTING_BULK_FIELDS}
          isPending={bulkUpdateMutation.isPending}
          onApply={(field, value) => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), data: { [field]: value } })}
          onClear={() => setSelectedIds(new Set())}
          onDelete={canDelete ? () => bulkDeleteMutation.mutate(Array.from(selectedIds)) : undefined}
          isDeletePending={bulkDeleteMutation.isPending}
          testIdPrefix="posting-bulk"
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
                    data-testid="checkbox-select-all-postings"
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("fileNumber")} data-testid="sort-fileNumber">File # <SortIcon col="fileNumber" /></TableHead>
              <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic <SortIcon col="clinic" /></TableHead>
              <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("scannedDate")} data-testid="sort-scannedDate">Scanned Date <SortIcon col="scannedDate" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("documentType")} data-testid="sort-documentType">Document Type <SortIcon col="documentType" /></TableHead>
              <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("postedDate")} data-testid="sort-postedDate">Posted Date <SortIcon col="postedDate" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("priority")} data-testid="sort-priority">Priority <SortIcon col="priority" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To <SortIcon col="assignedTo" /></TableHead>
              <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount <SortIcon col="amount" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon col="status" /></TableHead>
              <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("depositDate")} data-testid="sort-depositDate">Deposit Date <SortIcon col="depositDate" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("depositedBy")} data-testid="sort-depositedBy">Deposited By <SortIcon col="depositedBy" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("activity")} data-testid="sort-activity">Action <SortIcon col="activity" /></TableHead>
              {canDelete && <TableHead className="min-w-[60px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={(canDelete ? 13 : 12) + (canBulkEdit ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                  No postings found
                </TableCell>
              </TableRow>
            ) : (
              activeRecords.map(d => (
                <TableRow
                  key={d.id}
                  className={canEdit ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => canEdit && openEdit(d)}
                  data-testid={`row-posting-${d.id}`}
                >
                  {canBulkEdit && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(d.id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selectedIds);
                          if (c) next.add(d.id); else next.delete(d.id);
                          setSelectedIds(next);
                        }}
                        data-testid={`checkbox-select-posting-${d.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-sm font-medium">{d.fileNumber || "-"}</TableCell>
                  <TableCell className="text-sm">{d.clinic || "-"}</TableCell>
                  <TableCell className="text-sm">{formatDate(d.scannedDate)}</TableCell>
                  <TableCell className="text-sm">{d.documentType || "-"}</TableCell>
                  <TableCell className="text-sm">{formatDate(d.postedDate)}</TableCell>
                  <TableCell className="text-sm">{d.priority ? <TrackerPriorityBadge priority={d.priority} /> : "-"}</TableCell>
                  <TableCell className="text-sm">{d.assignedTo || "-"}</TableCell>
                  <TableCell className="text-sm">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                  <TableCell className="text-sm">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                  <TableCell className="text-sm">{formatDate(d.depositDate)}</TableCell>
                  <TableCell className="text-sm">{d.depositedBy || "-"}</TableCell>
                  <TableCell className="text-sm">{(d as any).activity || "-"}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-posting-${d.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
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
                    {([["fileNumber","File #","100px"],["clinic","Clinic","80px"],["scannedDate","Scanned Date","110px"],["documentType","Document Type","120px"],["postedDate","Posted Date","110px"],["priority","Priority","90px"],["assignedTo","Assigned To","120px"],["amount","Amount","80px"],["status","Status","100px"],["depositDate","Deposit Date","110px"],["depositedBy","Deposited By","120px"]] as [string,string,string][]).map(([col,label,minW]) => (
                      <TableHead key={col} className="cursor-pointer select-none whitespace-nowrap" style={{minWidth:minW}} onClick={() => toggleDoneSort(col)}>{label}<DoneSortIcon col={col} /></TableHead>
                    ))}
                    <TableHead className="min-w-[100px]">Action</TableHead>
                    {canDelete && <TableHead className="min-w-[60px] text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doneSorted.map(d => (
                    <TableRow
                      key={d.id}
                      className={canEdit ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => canEdit && openEdit(d)}
                      data-testid={`row-posting-done-${d.id}`}
                    >
                      <TableCell className="text-sm font-medium">{d.fileNumber || "-"}</TableCell>
                      <TableCell className="text-sm">{d.clinic || "-"}</TableCell>
                      <TableCell className="text-sm">{formatDate(d.scannedDate)}</TableCell>
                      <TableCell className="text-sm">{d.documentType || "-"}</TableCell>
                      <TableCell className="text-sm">{formatDate(d.postedDate)}</TableCell>
                      <TableCell className="text-sm">{d.priority ? <TrackerPriorityBadge priority={d.priority} /> : "-"}</TableCell>
                      <TableCell className="text-sm">{d.assignedTo || "-"}</TableCell>
                      <TableCell className="text-sm">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                      <TableCell className="text-sm">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                      <TableCell className="text-sm">{formatDate(d.depositDate)}</TableCell>
                      <TableCell className="text-sm">{d.depositedBy || "-"}</TableCell>
                      <TableCell className="text-sm">{(d as any).activity || "-"}</TableCell>
                      {canDelete && (
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-posting-done-${d.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
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
          onInteractOutside={(e) => { if ((e.target as HTMLElement)?.closest?.("[role='listbox']")) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if ((e.target as HTMLElement)?.closest?.("[role='listbox']")) e.preventDefault(); }}
          data-testid="posting-detail-drawer"
        >
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="text-left" data-testid="text-posting-drawer-title">
              {editingId ? `Edit Posting${form.fileNumber ? ` - ${form.fileNumber}` : ""}` : "New Posting"}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 px-4">
            <div className="grid grid-cols-2 gap-4 pb-4">
              <div className="space-y-1.5">
                <Label>File #</Label>
                <Input value={form.fileNumber} onChange={e => setForm(f => ({ ...f, fileNumber: e.target.value }))} data-testid="input-posting-file-number" />
              </div>
              <div className="space-y-1.5">
                <Label>Clinic</Label>
                <Select value={form.clinic || "__none__"} onValueChange={v => setForm(f => ({ ...f, clinic: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-clinic"><SelectValue placeholder="Select clinic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {activeClinics.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Scanned Date</Label>
                <Input type="date" value={form.scannedDate} onChange={e => setForm(f => ({ ...f, scannedDate: e.target.value }))} data-testid="input-posting-scanned-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <Select value={form.documentType || "__none__"} onValueChange={v => setForm(f => ({ ...f, documentType: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-document-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {POSTING_DOCUMENT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Posted Date</Label>
                <Input type="date" value={form.postedDate} onChange={e => setForm(f => ({ ...f, postedDate: e.target.value }))} data-testid="input-posting-posted-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority || "__none__"} onValueChange={v => setForm(f => ({ ...f, priority: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-priority"><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {POSTING_PRIORITY_OPTIONS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assigned To</Label>
                <Select value={form.assignedTo || "__none__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-assigned-to"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
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
                <Label>Amount</Label>
                <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-posting-amount" />
              </div>
              <div className="space-y-1.5">
                <Label>Deposit Date</Label>
                <Input type="date" value={form.depositDate} onChange={e => setForm(f => ({ ...f, depositDate: e.target.value }))} data-testid="input-posting-deposit-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Deposited By</Label>
                <Select value={form.depositedBy || "__none__"} onValueChange={v => setForm(f => ({ ...f, depositedBy: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-deposited-by"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {(() => {
                      const names = new Map(activeUsers.map(u => [u.fullName.replace(/\s+/g, ' ').trim().toLowerCase(), u.fullName]));
                      if (form.depositedBy && !names.has(form.depositedBy.replace(/\s+/g, ' ').trim().toLowerCase())) {
                        names.set(form.depositedBy.replace(/\s+/g, ' ').trim().toLowerCase(), form.depositedBy);
                      }
                      return [...names.values()].sort().map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "__none__"} onValueChange={v => setForm(f => ({ ...f, status: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-status"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {POSTING_STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select value={form.activity || "__none__"} onValueChange={v => setForm(f => ({ ...f, activity: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-activity"><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {(postingActivityOptions || []).map((o: any) => (
                      <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Outcome</Label>
                <Select value={form.outcome || "__none__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-posting-outcome"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {OUTCOME_OPTIONS.map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Call Calendar Urgency</Label>
                <Select value={form.callCalendarUrgency || "none"} onValueChange={v => setForm(f => ({ ...f, callCalendarUrgency: v }))}>
                  <SelectTrigger data-testid="select-posting-call-calendar-urgency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="urgent">🚨 Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 pb-4">
              <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-posting">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
              </Button>
              {editingId && canDelete && (
                <Button variant="destructive" className="w-full" onClick={() => setDeleteConfirmId(editingId)} data-testid="button-delete-posting-drawer">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Posting
                </Button>
              )}
            </div>

            {editingId && (() => {
              const currentPosting = (postingList || []).find(p => p.id === editingId);
              return (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4" />
                      Notes
                    </h3>
                    {currentPosting?.notes && (
                      <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="posting-notes-display">
                        {currentPosting.notes.split(/(?=\[.+? - \d{4}-\d{2}-\d{2}T)/).filter(Boolean).sort((a: string, b: string) => { const getTs = (s: string) => { const m = s.match(/\[.+? - (.+?)\]/); return m ? new Date(m[1]).getTime() : 0; }; return getTs(b) - getTs(a); }).map((block: string, idx: number) => {
                          const headerMatch = block.match(/^\[(.+?) - (.+?)\]\n?([\s\S]*)$/);
                          if (headerMatch) {
                            return (
                              <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50 space-y-0.5" data-testid={`posting-note-item-${idx}`}>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <UserIcon className="h-3 w-3" />
                                  <span className="font-medium text-foreground">{headerMatch[1]}</span>
                                  <span className="mx-0.5">·</span>
                                  <Clock className="h-3 w-3" />
                                  <span>{new Date(headerMatch[2]).toLocaleString()}</span>
                                </div>
                                <p className="text-foreground whitespace-pre-wrap">{headerMatch[3].trim()}</p>
                              </div>
                            );
                          }
                          return (
                            <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50" data-testid={`posting-note-item-${idx}`}>
                              <p className="text-foreground whitespace-pre-wrap">{block.trim()}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Add a note..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="text-sm"
                        data-testid="input-posting-note"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => newNote.trim() && addNoteMutation.mutate(newNote.trim())}
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                      data-testid="button-add-posting-note"
                    >
                      Add Note
                    </Button>
                  </div>
                </>
              );
            })()}

            {editingId && (
              <>
                <Separator className="my-2" />
                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-start gap-2 mb-2" data-testid="button-toggle-history">
                      <History className="h-4 w-4" /> Activity History
                      <Badge variant="secondary" className="ml-auto text-xs">{activityData?.length || 0}</Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {activityLoading ? (
                      <div className="space-y-2 pb-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : activityData && activityData.length > 0 ? (
                      <div className="space-y-3 pb-4">
                        {activityData.map((a: any) => (
                          <div key={a.id} className="border rounded p-2 text-sm" data-testid={`activity-posting-${a.id}`}>
                            <div className="flex justify-between items-start">
                              <span className="font-medium">{a.action}</span>
                              <span className="text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</span>
                            </div>
                            {a.userName && <p className="text-xs text-muted-foreground">by {a.userName}</p>}
                            {a.oldValue && a.newValue && (
                              <p className="text-xs mt-1">
                                <span className="line-through text-muted-foreground">{a.oldValue}</span>
                                {" → "}
                                <span className="font-medium">{a.newValue}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No activity recorded</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Posting</DialogTitle></DialogHeader>
          <p>Are you sure you want to delete this posting? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} data-testid="button-confirm-delete-posting">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Postings from CSV</DialogTitle></DialogHeader>
          {csvPreview.length === 0 ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("csv-file-input-posting")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.name.endsWith(".csv")) handleCsvFile(file); }}>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to select or drag & drop a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: .csv</p>
                <input id="csv-file-input-posting" type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">Expected columns: Patient Name, File Number, Clinic, Document Type, Priority, Assigned To, Status, Amount, Insurance</p>
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
              {importCsvMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Posting${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
