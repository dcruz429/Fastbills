import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Denial, User, Clinic, Insurance, DropdownOption } from "@shared/schema";
import { DENIAL_STATUS_OPTIONS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, X, Search, History, Scale, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TrackerStatusBadge } from "@/components/status-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
  comment: "",
  action: "",
  outcome: "",
  assignedTo: "",
  status: "",
};

export default function DenialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sendToArbId, setSendToArbId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string>("patientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterClinic, setFilterClinic] = useState("");
  const [filterInsurance, setFilterInsurance] = useState("");
  const [filterTypeOfDenial, setFilterTypeOfDenial] = useState("");
  const [filterFiledTo, setFilterFiledTo] = useState("");
  const [filterArbStatus, setFilterArbStatus] = useState("");
  const [filterArbPaymentStatus, setFilterArbPaymentStatus] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/denials", editingId, "activity"],
    queryFn: () => fetch(`/api/denials/${editingId}/activity`, { credentials: "include" }).then(r => r.json()),
    enabled: editingId !== null && drawerOpen,
  });

  const { data: denials, isLoading } = useQuery<Denial[]>({
    queryKey: ["/api/denials"],
  });

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const { data: denialTypeOptions } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_type"] });
  const { data: filedToOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "filed_to"] });
  const { data: arbStatusOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arb_status"] });
  const { data: arbPaymentStatusOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arb_payment_status"] });
  const { data: actionOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_action"] });
  const { data: outcomeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_outcome"] });
  const activeUsers = (allUsers || []).filter(u => u.isActive !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).filter(c => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  const sortedInsurances = (allInsurances || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/denials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/denials"] });
      setDrawerOpen(false);
      setForm({ ...emptyForm });
      toast({ title: "Denial created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/denials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/denials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/denials", editingId, "activity"] });
      setDrawerOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Denial updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/denials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/denials"] });
      setDeleteConfirmId(null);
      setDrawerOpen(false);
      setEditingId(null);
      toast({ title: "Denial deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendToArbMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/denials/${id}/send-to-arbitration`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/denials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setSendToArbId(null);
      toast({ title: "Denial sent to Arbitration" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDrawerOpen(true);
  }

  function openEdit(denial: Denial) {
    setEditingId(denial.id);
    setForm({
      denialFileName: denial.denialFileName || "",
      dateInput: toInputDate(denial.dateInput),
      intake: denial.intake || "",
      doa: toInputDate(denial.doa),
      clinic: denial.clinic || "",
      patientLastName: denial.patientName?.includes(",") ? denial.patientName.split(",")[0].trim() : denial.patientName || "",
      patientFirstName: denial.patientName?.includes(",") ? denial.patientName.split(",").slice(1).join(",").trim() : "",
      insurance: denial.insurance || "",
      dateOfLetter: toInputDate(denial.dateOfLetter),
      typeOfDenial: denial.typeOfDenial || "",
      effectiveDate: toInputDate(denial.effectiveDate),
      dosFrom: toInputDate(denial.dosFrom),
      dosTo: toInputDate(denial.dosTo),
      numberOfDays: denial.numberOfDays != null ? String(denial.numberOfDays) : "",
      amount: denial.amount || "",
      comments: denial.comments || "",
      comment: denial.comment || "",
      action: denial.action || "",
      outcome: denial.outcome || "",
      assignedTo: denial.assignedTo || "",
      status: (denial as any).status || "",
    });
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

  const canDelete = user?.role === "admin" || user?.role === "manager" || user?.role === "assigner";

  const dateColumns = new Set(["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo"]);
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
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    if (sortDir === "asc") return <ArrowUp className="h-3 w-3 ml-1" />;
    return <ArrowDown className="h-3 w-3 ml-1" />;
  }

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager" || user?.role === "assigner";

  const activeFilterCount = [filterClinic, filterInsurance, filterTypeOfDenial, filterFiledTo, filterArbStatus, filterArbPaymentStatus, filterAssignedTo].filter(v => v && v !== "__all__").length;

  function clearFilters() {
    setFilterClinic("");
    setFilterInsurance("");
    setFilterTypeOfDenial("");
    setFilterFiledTo("");
    setFilterArbStatus("");
    setFilterArbPaymentStatus("");
    setFilterAssignedTo("");
  }

  const filteredUnsorted = (denials || []).filter(d => {
    if (!isAdminOrManager && d.assignedTo !== user?.fullName) return false;
    if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
    if (filterInsurance && filterInsurance !== "__all__" && d.insurance !== filterInsurance) return false;
    if (filterTypeOfDenial && filterTypeOfDenial !== "__all__" && d.typeOfDenial !== filterTypeOfDenial) return false;
    if (filterFiledTo && filterFiledTo !== "__all__" && d.filedTo !== filterFiledTo) return false;
    if (filterArbStatus && filterArbStatus !== "__all__" && d.arbStatus !== filterArbStatus) return false;
    if (filterArbPaymentStatus && filterArbPaymentStatus !== "__all__" && d.arbPaymentStatus !== filterArbPaymentStatus) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.patientName?.toLowerCase().includes(q) ||
      d.denialFileName?.toLowerCase().includes(q) ||
      d.clinic?.toLowerCase().includes(q) ||
      d.insurance?.toLowerCase().includes(q) ||
      d.typeOfDenial?.toLowerCase().includes(q) ||
      d.assignedTo?.toLowerCase().includes(q)
    );
  });

  const filtered = [...filteredUnsorted].sort((a, b) => {
    if (!sortCol || !sortDir) return 0;
    const key = sortCol as keyof Denial;
    const valA = a[key];
    const valB = b[key];
    let cmp = 0;
    if (dateColumns.has(sortCol)) {
      const ta = valA ? new Date(valA as string).getTime() : 0;
      const tb = valB ? new Date(valB as string).getTime() : 0;
      cmp = ta - tb;
    } else if (numberColumns.has(sortCol)) {
      cmp = (Number(valA) || 0) - (Number(valB) || 0);
    } else {
      cmp = String(valA || "").localeCompare(String(valB || ""));
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const editingDenial = editingId ? (denials || []).find(d => d.id === editingId) : null;
  const drawerTitle = editingId
    ? (editingDenial?.patientName || "Edit Denial")
    : "New Denial";

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-64px)] animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-denials-title">Denials</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search denials..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
              data-testid="input-search-denials"
            />
          </div>
          <Button onClick={openCreate} data-testid="button-create-denial">
            <Plus className="h-4 w-4 mr-1" /> New Denial
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => setFiltersOpen(v => !v)}
          data-testid="button-toggle-filters"
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{activeFilterCount}</Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters} data-testid="button-clear-filters">
            Clear Filters
          </Button>
        )}
      </div>

      {filtersOpen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Clinic</Label>
            <Select value={filterClinic || "__all__"} onValueChange={v => setFilterClinic(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-clinic">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {activeClinics.map(c => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Insurance</Label>
            <Select value={filterInsurance || "__all__"} onValueChange={v => setFilterInsurance(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-insurance">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {sortedInsurances.map(ins => (
                  <SelectItem key={ins.id} value={ins.name}>{ins.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type of Denial</Label>
            <Select value={filterTypeOfDenial || "__all__"} onValueChange={v => setFilterTypeOfDenial(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-type-of-denial">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(denialTypeOptions || []).map(o => (
                  <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Filed To</Label>
            <Select value={filterFiledTo || "__all__"} onValueChange={v => setFilterFiledTo(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-filed-to">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(filedToOpts || []).map(o => (
                  <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">ARB Status</Label>
            <Select value={filterArbStatus || "__all__"} onValueChange={v => setFilterArbStatus(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-arb-status">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(arbStatusOpts || []).map(o => (
                  <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">ARB Payment Status</Label>
            <Select value={filterArbPaymentStatus || "__all__"} onValueChange={v => setFilterArbPaymentStatus(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-arb-payment-status">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(arbPaymentStatusOpts || []).map(o => (
                  <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assigned To</Label>
            <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-assigned-to">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {[...new Map([...(denials || []).map(d => d.assignedTo).filter(Boolean), ...activeUsers.map(u => u.fullName)].map(n => [n.replace(/\s+/g, ' ').trim().toLowerCase(), n.replace(/\s+/g, ' ').trim()])).values()].sort().map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
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

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0 always-show-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {[
                    { key: "patientName", label: "Patient Name", minW: "130px" },
                    { key: "denialFileName", label: "File Name", minW: "120px" },
                    { key: "dateInput", label: "Date Input", minW: "90px" },
                    { key: "intake", label: "Intake", minW: "80px" },
                    { key: "doa", label: "DOA", minW: "90px" },
                    { key: "clinic", label: "Clinic", minW: "100px" },
                    { key: "insurance", label: "Insurance", minW: "100px" },
                    { key: "dateOfLetter", label: "Date of Letter", minW: "100px" },
                    { key: "typeOfDenial", label: "Type of Denial", minW: "120px" },
                    { key: "effectiveDate", label: "Effective Date", minW: "100px" },
                    { key: "dosFrom", label: "DOS From", minW: "90px" },
                    { key: "dosTo", label: "DOS To", minW: "90px" },
                    { key: "numberOfDays", label: "# Visits", minW: "60px" },
                    { key: "amount", label: "Amount", minW: "80px" },
                    { key: "action", label: "Action", minW: "120px" },
                    { key: "outcome", label: "Outcome", minW: "100px" },
                    { key: "comment", label: "Comment", minW: "120px" },
                    { key: "assignedTo", label: "Assigned To", minW: "110px" },
                    { key: "status", label: "Status", minW: "100px" },
                  ].map(col => (
                    <TableHead
                      key={col.key}
                      className="cursor-pointer select-none hover-elevate"
                      style={{ minWidth: col.minW }}
                      onClick={() => handleSort(col.key)}
                      data-testid={`sort-header-${col.key}`}
                    >
                      <div className="flex items-center">
                        {col.label}
                        {renderSortIcon(col.key)}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                      No denials found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(d => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(d)}
                    data-testid={`row-denial-${d.id}`}
                  >
                    <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                    <TableCell className="text-xs">{d.denialFileName || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateInput)}</TableCell>
                    <TableCell className="text-xs">{d.intake || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.doa)}</TableCell>
                    <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                    <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateOfLetter)}</TableCell>
                    <TableCell className="text-xs">
                      {d.typeOfDenial ? <TrackerStatusBadge status={d.typeOfDenial} /> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(d.effectiveDate)}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                    <TableCell className="text-xs">{d.numberOfDays ?? "-"}</TableCell>
                    <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                    <TableCell className="text-xs">{d.action || "-"}</TableCell>
                    <TableCell className="text-xs">{d.outcome || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{d.comment || "-"}</TableCell>
                    <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                    <TableCell className="text-xs">
                      {(d as any).status ? <TrackerStatusBadge status={(d as any).status} /> : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => setSendToArbId(d.id)} title="Send to Arbitration" data-testid={`button-send-arb-${d.id}`}>
                          <Scale className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-denial-${d.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={(v) => {
        if (!v) {
          setDrawerOpen(false);
          setEditingId(null);
          setForm({ ...emptyForm });
        }
      }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[420px] p-0 flex flex-col"
          data-testid="denial-detail-drawer"
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
            <SheetTitle className="text-left" data-testid="text-denial-drawer-title">
              {drawerTitle}
            </SheetTitle>
            {editingId && (
              <p className="text-xs text-muted-foreground">Denial #{editingId}</p>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Patient First Name</Label>
                  <Input value={form.patientFirstName} onChange={e => setForm(f => ({ ...f, patientFirstName: e.target.value }))} data-testid="input-denial-patient-first-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Patient Last Name *</Label>
                  <Input value={form.patientLastName} onChange={e => setForm(f => ({ ...f, patientLastName: e.target.value }))} data-testid="input-denial-patient-last-name" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Denial File Name</Label>
                  <Input value={form.denialFileName} onChange={e => setForm(f => ({ ...f, denialFileName: e.target.value }))} data-testid="input-denial-file-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date Input</Label>
                  <Input type="date" value={form.dateInput} onChange={e => setForm(f => ({ ...f, dateInput: e.target.value }))} data-testid="input-denial-date-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Intake</Label>
                  <Select value={form.intake || "__clear__"} onValueChange={v => setForm(f => ({ ...f, intake: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-intake">
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
                  <Input type="date" value={form.doa} onChange={e => setForm(f => ({ ...f, doa: e.target.value }))} data-testid="input-denial-doa" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Clinic</Label>
                  <Select value={form.clinic || "__clear__"} onValueChange={v => setForm(f => ({ ...f, clinic: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-clinic">
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
                    <SelectTrigger data-testid="select-denial-insurance"><SelectValue placeholder="Select insurance" /></SelectTrigger>
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
                  <Label className="text-xs text-muted-foreground">Date of Letter</Label>
                  <Input type="date" value={form.dateOfLetter} onChange={e => setForm(f => ({ ...f, dateOfLetter: e.target.value }))} data-testid="input-denial-date-of-letter" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type of Denial</Label>
                  <Select value={form.typeOfDenial} onValueChange={v => setForm(f => ({ ...f, typeOfDenial: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-type">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(denialTypeOptions || []).map(o => o.value).map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Effective Date</Label>
                  <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} data-testid="input-denial-effective-date" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOS From</Label>
                  <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-denial-dos-from" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOS To</Label>
                  <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-denial-dos-to" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground"># of Visits</Label>
                  <Input type="number" value={form.numberOfDays} onChange={e => setForm(f => ({ ...f, numberOfDays: e.target.value }))} data-testid="input-denial-days" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-denial-amount" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Assigned To</Label>
                  <Select value={form.assignedTo || "__clear__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-assigned-to">
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
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={form.status || "__clear__"} onValueChange={v => setForm(f => ({ ...f, status: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-status">
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {DENIAL_STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Action</Label>
                  <Select value={form.action || "__clear__"} onValueChange={v => setForm(f => ({ ...f, action: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-action">
                      <SelectValue placeholder="Select action..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(actionOpts || []).map(o => (
                        <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Outcome</Label>
                  <Select value={form.outcome || "__clear__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__clear__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-denial-outcome">
                      <SelectValue placeholder="Select outcome..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__">-- None --</SelectItem>
                      {(outcomeOpts || []).map(o => (
                        <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Comments</Label>
                <Textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} rows={2} data-testid="input-denial-comments" />
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-denial"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingId ? "Save Changes" : "Create"}
              </Button>

              {editingId && canDelete && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDeleteConfirmId(editingId)}
                  data-testid="button-delete-denial-drawer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Denial
                </Button>
              )}

              {editingId && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <History className="h-4 w-4" />
                      Audit Trail
                    </h3>
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
                          <div key={a.id} className="border rounded-md p-3 space-y-1" data-testid={`activity-denial-${a.id}`}>
                            <div className="flex items-center justify-between flex-wrap gap-1">
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
                                  <div className="flex gap-1">
                                    <span className="text-muted-foreground">From:</span>
                                    <span className="line-through text-muted-foreground">{a.oldValue}</span>
                                  </div>
                                )}
                                {a.newValue && (
                                  <div className="flex gap-1">
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
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={sendToArbId !== null} onOpenChange={() => setSendToArbId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send to Arbitration</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will move the denial to the Arbitration page. The denial will be removed from this page. Continue?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendToArbId(null)} data-testid="button-cancel-send-arb">Cancel</Button>
            <Button onClick={() => sendToArbId && sendToArbMutation.mutate(sendToArbId)} disabled={sendToArbMutation.isPending} data-testid="button-confirm-send-arb">
              {sendToArbMutation.isPending ? "Sending..." : "Send to Arbitration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Denial</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this denial record? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete-denial">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-denial">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
