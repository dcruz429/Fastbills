import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import type { Check, User, Clinic, Insurance } from "@shared/schema";
import { CHECKS_TYPE_OPTIONS, CHECKS_STATUS_OPTIONS, OUTCOME_OPTIONS } from "@shared/schema";
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
import { ScrollSync } from "@/components/scroll-sync";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, MessageSquare, User as UserIcon, Clock, ChevronDown, ChevronRight, CheckCircle2, Upload, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { parseCsvText } from "@/lib/csv-import";

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
  assignedTo: "",
  clinic: "",
  checkNumber: "",
  amount: "",
  checkDate: "",
  inputDate: "",
  insurance: "",
  fileName: "",
  scannedDate: "",
  type: "",
  status: "",
  postedDate: "",
  depositDate: "",
  depositedBy: "",
  outcome: "",
  activity: "",
};

export default function ChecksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string>("checkNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [filterClinic, setFilterClinic] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterInsurance, setFilterInsurance] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("assignedToName") || "";
  });
  const [filterOutcome, setFilterOutcome] = useState("");
  const [mainOpen, setMainOpen] = useState(true);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneSortCol, setDoneSortCol] = useState<string>("");
  const [doneSortDir, setDoneSortDir] = useState<"asc" | "desc">("asc");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [filterDateField, setFilterDateField] = useState("inputDate");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const CHECKS_ROLES = ["admin", "payment_specialist", "account_manager"];
  if (!CHECKS_ROLES.includes(user.role)) {
    return <Redirect to="/" />;
  }

  const canEdit = CHECKS_ROLES.includes(user.role);

  const { data: checksList, isLoading } = useQuery<Check[]>({ queryKey: ["/api/checks"] });

  const autoEditHandled = useRef(false);
  useEffect(() => {
    if (autoEditHandled.current || !checksList) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const rec = checksList.find((c) => c.id === parseInt(editId));
    if (rec) {
      autoEditHandled.current = true;
      openEdit(rec);
      window.history.replaceState({}, "", "/checks");
    }
  }, [checksList]);

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/checks", editingId, "activity"],
    enabled: !!editingId,
  });
  const { data: checksActivityOptions } = useQuery<any[]>({
    queryKey: ["/api/dropdown-options/checks_action"],
  });

  const activeUsers = (allUsers || []).filter((u: any) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).sort((a, b) => a.name.localeCompare(b.name));

  const assignedToOptions = (() => {
    const map = new Map<string, string>();
    activeUsers.forEach(u => map.set(u.fullName.replace(/\s+/g, ' ').trim().toLowerCase(), u.fullName));
    (checksList || []).forEach(d => {
      if (d.assignedTo) {
        const key = d.assignedTo.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!map.has(key)) map.set(key, d.assignedTo);
      }
    });
    if (form.assignedTo) {
      const key = form.assignedTo.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!map.has(key)) map.set(key, form.assignedTo);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  })();

  const insuranceOptions = (() => {
    const set = new Set<string>();
    (allInsurances || []).forEach(i => set.add(i.name));
    (checksList || []).forEach(d => { if (d.insurance) set.add(d.insurance); });
    return Array.from(set).sort();
  })();

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/checks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      setDrawerOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Check created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/checks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", editingId, "activity"] });
      toast({ title: "Check updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/checks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      setDeleteConfirmId(null);
      setDrawerOpen(false);
      setEditingId(null);
      toast({ title: "Check deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/checks/${editingId}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", editingId, "activity"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importCsvMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/checks/import-csv", { rows }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      toast({ title: `Import complete — ${data.success} created, ${data.updated} updated${data.errors?.length ? `, ${data.errors.length} errors` : ""}` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const CSV_COLUMN_MAP: Record<string, string> = {
    "patient name": "patientName", "patient": "patientName",
    "last name": "lastName", "first name": "firstName",
    "assigned to": "assignedTo", "clinic": "clinic",
    "check number": "checkNumber", "check no": "checkNumber", "check #": "checkNumber",
    "amount": "amount", "check date": "checkDate",
    "input date": "inputDate", "date input": "inputDate",
    "insurance": "insurance", "file name": "fileName",
    "scanned date": "scannedDate", "type": "type",
    "status": "status", "posted date": "postedDate",
    "deposit date": "depositDate", "deposited by": "depositedBy",
    "outcome": "outcome",
  };

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text, CSV_COLUMN_MAP, { requirePatientName: false });
      setCsvPreview(rows);
      setCsvFileName(file.name);
      if (rows.length === 0) toast({ title: "No valid rows found", description: "The CSV appears to be empty or has no data rows.", variant: "destructive" });
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

  function openEdit(d: Check) {
    if (!canEdit) return;
    setEditingId(d.id);
    setForm({
      assignedTo: d.assignedTo || "",
      clinic: d.clinic || "",
      checkNumber: d.checkNumber || "",
      amount: d.amount || "",
      checkDate: toInputDate(d.checkDate),
      inputDate: toInputDate(d.inputDate),
      insurance: d.insurance || "",
      fileName: d.fileName || "",
      scannedDate: toInputDate(d.scannedDate),
      type: d.type || "",
      status: d.status || "",
      postedDate: toInputDate(d.postedDate),
      depositDate: toInputDate(d.depositDate),
      depositedBy: d.depositedBy || "",
      outcome: d.outcome || "",
      activity: (d as any).activity || "",
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

  const activeFilterCount = [filterClinic, filterType, filterStatus, filterInsurance, filterAssignedTo, filterOutcome, filterDateFrom, filterDateTo]
    .filter(v => v && v !== "__all__").length;

  function clearFilters() {
    setFilterClinic("");
    setFilterType("");
    setFilterStatus("");
    setFilterInsurance("");
    setFilterAssignedTo("");
    setFilterOutcome("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  const filteredUnsorted = (checksList || []).filter(d => {
    if (searchQuery && !Object.values(d).some(v => v && String(v).toLowerCase().includes(searchQuery.toLowerCase()))) return false;
    if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
    if (filterType && filterType !== "__all__" && d.type !== filterType) return false;
    if (filterStatus && filterStatus !== "__all__" && d.status !== filterStatus) return false;
    if (filterInsurance && filterInsurance !== "__all__" && d.insurance !== filterInsurance) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
    if (filterOutcome && filterOutcome !== "__all__" && (d.outcome || "") !== filterOutcome) return false;
    if (filterDateFrom || filterDateTo) {
      const fieldVal = (d as any)[filterDateField];
      if (!fieldVal) return false;
      const raw = typeof fieldVal === "string" ? fieldVal : new Date(fieldVal).toISOString();
      const dateStr = raw.substring(0, 10);
      if (filterDateFrom && dateStr < filterDateFrom) return false;
      if (filterDateTo && dateStr > filterDateTo) return false;
    }
    return true;
  });

  const dateColumns = new Set(["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate", "createdAt"]);
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
  const doneRecords = filtered.filter(d => (d.status || "").toLowerCase() === "done");

  function toggleDoneSort(col: string) {
    if (doneSortCol === col) { if (doneSortDir === "asc") setDoneSortDir("desc"); else { setDoneSortCol(""); setDoneSortDir("asc"); } }
    else { setDoneSortCol(col); setDoneSortDir("asc"); }
  }
  const DoneSortIcon = ({ col }: { col: string }) => {
    if (doneSortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    return doneSortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline-block" /> : <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };
  const _doneDateCols = new Set(["inputDate", "checkDate", "scannedDate", "postedDate", "depositDate"]);
  const _doneNumCols = new Set(["amount"]);
  const doneSorted = doneSortCol ? [...doneRecords].sort((a, b) => {
    const vA = (a as any)[doneSortCol] ?? ""; const vB = (b as any)[doneSortCol] ?? "";
    let cmp = 0;
    if (_doneDateCols.has(doneSortCol)) cmp = (vA ? new Date(vA).getTime() : 0) - (vB ? new Date(vB).getTime() : 0);
    else if (_doneNumCols.has(doneSortCol)) cmp = (parseFloat(String(vA).replace(/[^0-9.-]/g, "")) || 0) - (parseFloat(String(vB).replace(/[^0-9.-]/g, "")) || 0);
    else cmp = String(vA).toLowerCase().localeCompare(String(vB).toLowerCase());
    return doneSortDir === "asc" ? cmp : -cmp;
  }) : doneRecords;

  const currentEditCheck = editingId ? (checksList || []).find(d => d.id === editingId) : null;
  const notesList = currentEditCheck?.notes
    ? currentEditCheck.notes.split(/(?=\[.+? - \d{4}-\d{2}-\d{2}T)/).filter(Boolean).reverse()
    : [];

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
        <h1 className="text-2xl font-bold" data-testid="text-checks-title">Checks</h1>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv-check">
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button onClick={openCreate} data-testid="button-create-check">
                <Plus className="h-4 w-4 mr-1" /> New Check
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search checks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-checks"
          />
        </div>
        <Select value={filterClinic} onValueChange={setFilterClinic}>
          <SelectTrigger className="w-[130px]" data-testid="filter-clinic"><SelectValue placeholder="All Clinics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Clinics</SelectItem>
            {activeClinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px]" data-testid="filter-type"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {CHECKS_TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]" data-testid="filter-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {CHECKS_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterInsurance} onValueChange={setFilterInsurance}>
          <SelectTrigger className="w-[140px]" data-testid="filter-insurance"><SelectValue placeholder="All Insurances" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Insurances</SelectItem>
            {insuranceOptions.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignedTo} onValueChange={setFilterAssignedTo}>
          <SelectTrigger className="w-[130px]" data-testid="filter-assigned-to"><SelectValue placeholder="All Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Assigned</SelectItem>
            {assignedToOptions.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOutcome} onValueChange={setFilterOutcome}>
          <SelectTrigger className="w-[130px]" data-testid="filter-outcome"><SelectValue placeholder="All Outcomes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Outcomes</SelectItem>
            {OUTCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDateField} onValueChange={setFilterDateField}>
          <SelectTrigger className="w-[130px]" data-testid="filter-date-field"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="inputDate">Input Date</SelectItem>
            <SelectItem value="checkDate">Check Date</SelectItem>
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

      <div className="flex items-center gap-2 mb-3">
        <div className="bg-muted/50 border rounded-lg px-4 py-2 inline-flex items-center gap-2" data-testid="sum-amount-box">
          <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
          <span className="text-lg font-bold" data-testid="sum-amount-value">
            ${filtered.filter(d => !["Paid","Loss","RTP","Send to RTP"].includes(d.outcome||"")).reduce((sum, d) => sum + (parseFloat((d.amount || "0").replace(/[^0-9.\-]/g, '')) || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground">({filtered.length} record{filtered.length !== 1 ? "s" : ""})</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto pb-6">
      <Collapsible open={mainOpen} onOpenChange={setMainOpen}>
        <Card className="border border-teal-200 dark:border-teal-800/30 shadow-sm shrink-0">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none bg-teal-50 dark:bg-teal-950/20" data-testid="checks-main-section-header">
              {mainOpen ? <ChevronDown className="h-4 w-4 text-teal-600 dark:text-teal-400" /> : <ChevronRight className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
              <CreditCard className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="text-sm font-bold tracking-wide text-teal-600 dark:text-teal-400">CHECKS</span>
              <span className="text-xs text-muted-foreground ml-auto font-medium">{activeRecords.length} record{activeRecords.length !== 1 ? "s" : ""}</span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0">
      <ScrollSync className="border-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic <SortIcon col="clinic" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("inputDate")} data-testid="sort-inputDate">Input Date <SortIcon col="inputDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("checkDate")} data-testid="sort-checkDate">Check Date <SortIcon col="checkDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("insurance")} data-testid="sort-insurance">Insurance <SortIcon col="insurance" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("checkNumber")} data-testid="sort-checkNumber">Check No. <SortIcon col="checkNumber" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount <SortIcon col="amount" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("fileName")} data-testid="sort-fileName">File Name <SortIcon col="fileName" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("scannedDate")} data-testid="sort-scannedDate">Scanned Date <SortIcon col="scannedDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("type")} data-testid="sort-type">Type <SortIcon col="type" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon col="status" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("postedDate")} data-testid="sort-postedDate">Posted Date <SortIcon col="postedDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To <SortIcon col="assignedTo" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("depositDate")} data-testid="sort-depositDate">Deposit Date <SortIcon col="depositDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("depositedBy")} data-testid="sort-depositedBy">Deposited By <SortIcon col="depositedBy" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("activity")} data-testid="sort-activity">Action <SortIcon col="activity" /></TableHead>
              {user.role === "admin" && <TableHead className="text-xs text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={user.role === "admin" ? 16 : 15} className="text-center text-sm text-muted-foreground py-8">
                  No checks found
                </TableCell>
              </TableRow>
            ) : activeRecords.map(d => {
              const isTransferred = (d.notes || "").startsWith("[Transferred from");
              return (
              <TableRow
                key={d.id}
                className={`${canEdit ? "cursor-pointer hover:bg-muted/50" : ""} ${isTransferred ? "text-blue-600 dark:text-blue-400" : ""}`}
                onClick={() => canEdit && openEdit(d)}
                data-testid={`row-check-${d.id}`}
              >
                <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.inputDate)}</TableCell>
                <TableCell className="text-xs">{formatDate(d.checkDate)}</TableCell>
                <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                <TableCell className="text-xs">{d.checkNumber || "-"}</TableCell>
                <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                <TableCell className="text-xs">{d.fileName || "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.scannedDate)}</TableCell>
                <TableCell className="text-xs">{d.type || "-"}</TableCell>
                <TableCell className="text-xs">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.postedDate)}</TableCell>
                <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.depositDate)}</TableCell>
                <TableCell className="text-xs">{d.depositedBy || "-"}</TableCell>
                <TableCell className="text-xs">{d.activity || "-"}</TableCell>
                {user.role === "admin" && (
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-check-${d.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
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
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {([["clinic","Clinic"],["inputDate","Input Date"],["checkDate","Check Date"],["insurance","Insurance"],["checkNumber","Check No."],["amount","Amount"],["fileName","File Name"],["scannedDate","Scanned Date"],["type","Type"],["status","Status"],["postedDate","Posted Date"],["assignedTo","Assigned To"],["depositDate","Deposit Date"],["depositedBy","Deposited By"]] as [string,string][]).map(([col,label]) => (
                      <TableHead key={col} className="text-xs whitespace-nowrap cursor-pointer select-none" onClick={() => toggleDoneSort(col)}>{label}<DoneSortIcon col={col} /></TableHead>
                    ))}
                    <TableHead className="text-xs whitespace-nowrap">Action</TableHead>
                    {user.role === "admin" && <TableHead className="text-xs text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doneSorted.map(d => {
                    const isTransferred = (d.notes || "").startsWith("[Transferred from");
                    return (
                    <TableRow
                      key={d.id}
                      className={`${canEdit ? "cursor-pointer hover:bg-muted/50" : ""} ${isTransferred ? "text-blue-600 dark:text-blue-400" : ""}`}
                      onClick={() => canEdit && openEdit(d)}
                      data-testid={`row-check-done-${d.id}`}
                    >
                      <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.inputDate)}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.checkDate)}</TableCell>
                      <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                      <TableCell className="text-xs">{d.checkNumber || "-"}</TableCell>
                      <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                      <TableCell className="text-xs">{d.fileName || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.scannedDate)}</TableCell>
                      <TableCell className="text-xs">{d.type || "-"}</TableCell>
                      <TableCell className="text-xs">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.postedDate)}</TableCell>
                      <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.depositDate)}</TableCell>
                      <TableCell className="text-xs">{d.depositedBy || "-"}</TableCell>
                      <TableCell className="text-xs">{d.activity || "-"}</TableCell>
                      {user.role === "admin" && (
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-check-done-${d.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
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

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="drawer-check">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Check" : "New Check"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Check No.</Label>
                <Input value={form.checkNumber} onChange={e => setForm(f => ({ ...f, checkNumber: e.target.value }))} data-testid="input-checkNumber" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount</Label>
                <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-amount" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Clinic</Label>
                <Select value={form.clinic} onValueChange={v => setForm(f => ({ ...f, clinic: v }))}>
                  <SelectTrigger data-testid="select-clinic"><SelectValue placeholder="Select clinic" /></SelectTrigger>
                  <SelectContent>
                    {activeClinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Insurance</Label>
                <Select value={form.insurance || "__clear__"} onValueChange={v => setForm(f => ({ ...f, insurance: v === "__clear__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-insurance">
                    <SelectValue placeholder="Select insurance..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">-- None --</SelectItem>
                    {(allInsurances || []).map(i => (
                      <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned To</Label>
                <Select value={form.assignedTo} onValueChange={v => setForm(f => ({ ...f, assignedTo: v }))}>
                  <SelectTrigger data-testid="select-assignedTo"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {assignedToOptions.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Deposited By</Label>
                <Select value={form.depositedBy} onValueChange={v => setForm(f => ({ ...f, depositedBy: v }))}>
                  <SelectTrigger data-testid="select-depositedBy"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {assignedToOptions.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {CHECKS_TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-status"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {CHECKS_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">File Name</Label>
              <Input value={form.fileName} onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))} data-testid="input-fileName" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Check Date</Label>
                <Input type="date" value={form.checkDate} onChange={e => setForm(f => ({ ...f, checkDate: e.target.value }))} data-testid="input-checkDate" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Input Date</Label>
                <Input type="date" value={form.inputDate} onChange={e => setForm(f => ({ ...f, inputDate: e.target.value }))} data-testid="input-inputDate" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Scanned Date</Label>
                <Input type="date" value={form.scannedDate} onChange={e => setForm(f => ({ ...f, scannedDate: e.target.value }))} data-testid="input-scannedDate" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Posted Date</Label>
                <Input type="date" value={form.postedDate} onChange={e => setForm(f => ({ ...f, postedDate: e.target.value }))} data-testid="input-postedDate" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Deposit Date</Label>
                <Input type="date" value={form.depositDate} onChange={e => setForm(f => ({ ...f, depositDate: e.target.value }))} data-testid="input-depositDate" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Action</Label>
                <Select value={form.activity || "__none__"} onValueChange={v => setForm(f => ({ ...f, activity: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-check-activity"><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {(checksActivityOptions || []).map((o: any) => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Outcome</Label>
                <Select value={form.outcome} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-check-outcome"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {OUTCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {editingId && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <Label className="text-sm font-medium">Notes</Label>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    className="min-h-[60px] text-xs"
                    data-testid="input-new-note"
                  />
                  <Button
                    size="sm"
                    disabled={!newNote.trim() || addNoteMutation.isPending}
                    onClick={() => addNoteMutation.mutate(newNote.trim())}
                    data-testid="button-add-note"
                  >
                    Add
                  </Button>
                </div>
                {notesList.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {notesList.map((note, i) => {
                      const headerMatch = note.match(/^\[(.+?) - (\d{4}-\d{2}-\d{2}T[^\]]+)\]\n?([\s\S]*)/);
                      return (
                        <div key={i} className="bg-muted/50 rounded p-2 text-xs">
                          {headerMatch ? (
                            <>
                              <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                                <UserIcon className="h-3 w-3" /> {headerMatch[1]}
                                <Clock className="h-3 w-3 ml-2" /> {formatDate(headerMatch[2])}
                              </div>
                              <div className="whitespace-pre-wrap">{headerMatch[3]}</div>
                            </>
                          ) : (
                            <div className="whitespace-pre-wrap">{note}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Separator />

                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" data-testid="button-toggle-history">
                      <History className="h-4 w-4 mr-1" /> Activity History
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {activityLoading ? (
                      <Skeleton className="h-20 w-full" />
                    ) : (activityData || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No activity yet</p>
                    ) : (
                      <ScrollArea className="h-48">
                        <div className="space-y-2">
                          {(activityData || []).map((a: any) => (
                            <div key={a.id} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
                              <div className="font-medium">{a.userName || "System"}</div>
                              <div className="text-muted-foreground">{a.action}
                                {a.field && a.oldValue !== null && a.newValue !== null && (
                                  <span> ({a.oldValue} → {a.newValue})</span>
                                )}
                              </div>
                              <div className="text-muted-foreground">{formatDate(a.timestamp)}</div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1" data-testid="button-save-check">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => setDrawerOpen(false)} data-testid="button-cancel-check">Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Check</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Are you sure you want to delete this check record? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} data-testid="button-confirm-delete">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Checks from CSV</DialogTitle></DialogHeader>
          {csvPreview.length === 0 ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("csv-file-input-check")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.name.endsWith(".csv")) handleCsvFile(file); }}>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to select or drag & drop a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: .csv</p>
                <input id="csv-file-input-check" type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">Expected columns: Clinic, Insurance, Check Number, Amount, Check Date, Input Date, File Name, Scanned Date, Type, Status, Posted Date, Deposit Date, Deposited By, Assigned To (Patient Name optional)</p>
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
              {importCsvMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Check${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
