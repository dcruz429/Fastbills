import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import type { Closed, User } from "@shared/schema";
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
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, MessageSquare, User as UserIcon, Clock, ChevronDown, FileText, CreditCard, ClipboardList, ShieldAlert, Scale, Package, Archive, RotateCcw } from "lucide-react";

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

function getColSpecs(sectionKey: string): ColSpec[] {
  const patient: ColSpec = { header: "Patient", sort: "patientName", renderCell: (d, rec) => <span className="font-medium">{rec.patientName || d.patientName || "-"}</span> };
  const clinic: ColSpec = { header: "Clinic", sort: "clinic", renderCell: (d, rec) => rec.clinic || d.clinic || "-" };
  const insurance: ColSpec = { header: "Insurance", sort: "insurance", renderCell: (d, rec) => rec.insurance || d.insurance || "-" };
  const amount: ColSpec = { header: "Amount", sort: "amount", renderCell: (d, rec) => fmtAmt(rec.amount || d.amount) };
  const status: ColSpec = { header: "Status", sort: "status", renderCell: (d, rec) => { const s = rec.status || d.status; return s ? <TrackerStatusBadge status={s} /> : "-"; } };
  const assignedTo: ColSpec = { header: "Assigned To", sort: "assignedTo", renderCell: (d, rec) => rec.assignedTo || d.assignedTo || "-" };
  const date: ColSpec = { header: "Date", sort: "createdAt", renderCell: (d) => formatDate(d.createdAt) };

  switch (sectionKey) {
    case "Verification/Billing":
      return [patient, clinic, insurance, amount,
        { header: "Priority", sort: "priority", renderCell: (d, rec) => rec.priority || "-" },
        status, assignedTo, date];
    case "Posting":
      return [patient, clinic,
        { header: "File #", renderCell: (_, rec) => rec.fileNo || "-" },
        { header: "Doc Type", renderCell: (_, rec) => rec.documentType || "-" },
        { header: "Priority", renderCell: (_, rec) => rec.priority || "-" },
        status, assignedTo, date];
    case "Collections":
      return [patient, clinic, insurance, amount, status, assignedTo, date];
    case "Denials":
    case "Arbitration":
      return [patient, clinic, insurance,
        { header: "DOA", renderCell: (_, rec) => rec.doa ? formatDate(rec.doa) : "-" },
        { header: "Type", renderCell: (_, rec) => rec.typeOfDenial || "-" },
        { header: "Filed To", renderCell: (_, rec) => rec.filedTo || "-" },
        { header: "ARB Status", renderCell: (_, rec) => rec.arbStatus || "-" },
        amount, date];
    case "Checks":
      return [patient, clinic, insurance,
        { header: "Check #", renderCell: (_, rec) => rec.checkNo || "-" },
        amount,
        { header: "Type", renderCell: (_, rec) => rec.type || "-" },
        status, date];
    default:
      return [patient, clinic, insurance, amount, status, assignedTo, date];
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const isAdmin = ADMIN_ROLES.includes(user.role);

  const { data: closedList, isLoading } = useQuery<Closed[]>({ queryKey: ["/api/closed"] });
  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/closed", editingId, "activity"],
    enabled: !!editingId,
  });

  const activeUsers = (allUsers || []).filter((u: any) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));

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

  const dateColumns = new Set(["createdAt"]);
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
          {isAdmin && (
            <Button onClick={openCreate} data-testid="button-create-closed">
              <Plus className="h-4 w-4 mr-1" /> New RTP Record
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search RTP records..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-closed"
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
            Clear Filters
          </Button>
        )}
      </div>

      {filtersOpen && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4" data-testid="filter-grid-closed">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filterStatus || "__all__"} onValueChange={v => setFilterStatus(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-closed-status">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {CLOSED_STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Source</Label>
            <Select value={filterSource || "__all__"} onValueChange={v => setFilterSource(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-closed-source">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {sourceOptions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assigned To</Label>
            <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-closed-assigned-to">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {Array.from(new Map([...(closedList || []).map(d => d.assignedTo).filter(Boolean) as string[], ...activeUsers.map(u => u.fullName)].map(n => [n.replace(/\s+/g, ' ').trim().toLowerCase(), n.replace(/\s+/g, ' ').trim()])).values()).sort().map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outcome</Label>
            <Select value={filterOutcome || "__all__"} onValueChange={v => setFilterOutcome(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-outcome">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {OUTCOME_OPTIONS.map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="bg-muted/50 border rounded-lg px-4 py-2 inline-flex items-center gap-2" data-testid="sum-amount-box">
          <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
          <span className="text-lg font-bold" data-testid="sum-amount-value">
            ${filtered.reduce((sum, d) => sum + (parseFloat((d.amount || "0").replace(/[^0-9.\-]/g, '')) || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      const cols = getColSpecs(section.key);
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {cols.map(col => (
                                <TableHead
                                  key={col.header}
                                  className={`min-w-[80px] text-xs select-none ${col.sort ? "cursor-pointer" : ""}`}
                                  onClick={col.sort ? () => handleSort(col.sort!) : undefined}
                                >
                                  {col.header} {col.sort && <SortIcon col={col.sort} />}
                                </TableHead>
                              ))}
                              {user.role === "admin" && <TableHead className="min-w-[60px] text-right text-xs">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sectionItems.map(d => {
                              let rec: any = {};
                              try { if (d.recordData) rec = JSON.parse(d.recordData); } catch {}
                              return (
                                <TableRow
                                  key={d.id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => openEdit(d)}
                                  data-testid={`row-closed-${d.id}`}
                                >
                                  {cols.map(col => (
                                    <TableCell key={col.header} className="text-xs">
                                      {col.renderCell(d, rec)}
                                    </TableCell>
                                  ))}
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
            <div className="grid grid-cols-2 gap-4 pb-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Patient Name *</Label>
                <Input value={form.patientName} onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))} data-testid="input-closed-patient-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Clinic</Label>
                <Input value={form.clinic} onChange={e => setForm(f => ({ ...f, clinic: e.target.value }))} data-testid="input-closed-clinic" />
              </div>
              <div className="space-y-1.5">
                <Label>Insurance</Label>
                <Input value={form.insurance} onChange={e => setForm(f => ({ ...f, insurance: e.target.value }))} data-testid="input-closed-insurance" />
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
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-closed-amount" />
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} data-testid="input-closed-source" />
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
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="resize-none" data-testid="textarea-closed-notes" />
              </div>
            </div>

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
    </div>
  );
}
