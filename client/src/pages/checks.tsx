import { useState } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, MessageSquare, User as UserIcon, Clock } from "lucide-react";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterClinic, setFilterClinic] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterInsurance, setFilterInsurance] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const CHECKS_ROLES = ["admin", "payment_specialist", "case_manager"];
  if (!CHECKS_ROLES.includes(user.role)) {
    return <Redirect to="/" />;
  }

  const canEdit = CHECKS_ROLES.includes(user.role);

  const { data: checksList, isLoading } = useQuery<Check[]>({ queryKey: ["/api/checks"] });
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
  const activeClinics = (allClinics || []).filter((c: any) => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));

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
    (allInsurances || []).filter(i => i.isActive !== false).forEach(i => set.add(i.name));
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

  const activeFilterCount = [filterClinic, filterType, filterStatus, filterInsurance, filterAssignedTo]
    .filter(v => v && v !== "__all__").length;

  function clearFilters() {
    setFilterClinic("");
    setFilterType("");
    setFilterStatus("");
    setFilterInsurance("");
    setFilterAssignedTo("");
  }

  const filteredUnsorted = (checksList || []).filter(d => {
    if (searchQuery && !Object.values(d).some(v => v && String(v).toLowerCase().includes(searchQuery.toLowerCase()))) return false;
    if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
    if (filterType && filterType !== "__all__" && d.type !== filterType) return false;
    if (filterStatus && filterStatus !== "__all__" && d.status !== filterStatus) return false;
    if (filterInsurance && filterInsurance !== "__all__" && d.insurance !== filterInsurance) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
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
            <Button onClick={openCreate} data-testid="button-create-check">
              <Plus className="h-4 w-4 mr-1" /> New Check
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search checks..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-checks"
        />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(!filtersOpen)}
          data-testid="button-toggle-filters"
        >
          <Filter className="h-4 w-4 mr-1" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">{activeFilterCount}</Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="h-3 w-3 mr-1" /> Clear filters
          </Button>
        )}
      </div>

      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 p-3 border rounded-lg bg-muted/30">
            <div>
              <Label className="text-xs mb-1 block">Clinic</Label>
              <Select value={filterClinic} onValueChange={setFilterClinic}>
                <SelectTrigger className="h-8 text-xs" data-testid="filter-clinic"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {activeClinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-xs" data-testid="filter-type"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {CHECKS_TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs" data-testid="filter-status"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {CHECKS_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Insurance</Label>
              <Select value={filterInsurance} onValueChange={setFilterInsurance}>
                <SelectTrigger className="h-8 text-xs" data-testid="filter-insurance"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {insuranceOptions.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Assigned To</Label>
              <Select value={filterAssignedTo} onValueChange={setFilterAssignedTo}>
                <SelectTrigger className="h-8 text-xs" data-testid="filter-assigned-to"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {assignedToOptions.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-2 mb-3">
        <div className="bg-muted/50 border rounded-lg px-4 py-2 inline-flex items-center gap-2" data-testid="sum-amount-box">
          <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
          <span className="text-lg font-bold" data-testid="sum-amount-value">
            ${filtered.reduce((sum, d) => sum + (parseFloat((d.amount || "0").replace(/[^0-9.\-]/g, '')) || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground">({filtered.length} record{filtered.length !== 1 ? "s" : ""})</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To <SortIcon col="assignedTo" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic <SortIcon col="clinic" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("checkNumber")} data-testid="sort-checkNumber">Check No. <SortIcon col="checkNumber" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount <SortIcon col="amount" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("checkDate")} data-testid="sort-checkDate">Check Date <SortIcon col="checkDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("inputDate")} data-testid="sort-inputDate">Input Date <SortIcon col="inputDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("insurance")} data-testid="sort-insurance">Insurance <SortIcon col="insurance" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("fileName")} data-testid="sort-fileName">File Name <SortIcon col="fileName" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("scannedDate")} data-testid="sort-scannedDate">Scanned Date <SortIcon col="scannedDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("type")} data-testid="sort-type">Type <SortIcon col="type" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon col="status" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("postedDate")} data-testid="sort-postedDate">Posted Date <SortIcon col="postedDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("depositDate")} data-testid="sort-depositDate">Deposit Date <SortIcon col="depositDate" /></TableHead>
              <TableHead className="text-xs cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("depositedBy")} data-testid="sort-depositedBy">Deposited By <SortIcon col="depositedBy" /></TableHead>
              {canEdit && <TableHead className="text-xs text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 15 : 14} className="text-center text-sm text-muted-foreground py-8">
                  No checks found
                </TableCell>
              </TableRow>
            ) : filtered.map(d => (
              <TableRow
                key={d.id}
                className={canEdit ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() => canEdit && openEdit(d)}
                data-testid={`row-check-${d.id}`}
              >
                <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                <TableCell className="text-xs">{d.checkNumber || "-"}</TableCell>
                <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.checkDate)}</TableCell>
                <TableCell className="text-xs">{formatDate(d.inputDate)}</TableCell>
                <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                <TableCell className="text-xs">{d.fileName || "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.scannedDate)}</TableCell>
                <TableCell className="text-xs">{d.type || "-"}</TableCell>
                <TableCell className="text-xs">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                <TableCell className="text-xs">{formatDate(d.postedDate)}</TableCell>
                <TableCell className="text-xs">{formatDate(d.depositDate)}</TableCell>
                <TableCell className="text-xs">{d.depositedBy || "-"}</TableCell>
                {canEdit && (
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-check-${d.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
                    {(allInsurances || []).filter(i => i.isActive !== false).map(i => (
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
    </div>
  );
}
