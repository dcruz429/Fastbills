import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Arbitration, User, Clinic, Insurance, DropdownOption } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
};

export default function ArbitrationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("patientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  if (!user) {
    return <Redirect to="/" />;
  }

  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/arbitrations", historyId, "activity"],
    queryFn: () => fetch(`/api/arbitrations/${historyId}/activity`, { credentials: "include" }).then(r => r.json()),
    enabled: historyId !== null,
  });

  const { data: arbitrations, isLoading } = useQuery<Arbitration[]>({
    queryKey: ["/api/arbitrations"],
  });

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const { data: denialTypeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_type"] });
  const { data: filedToOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "filed_to"] });
  const { data: arbStatusOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arb_status"] });
  const { data: arbPaymentOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "arb_payment_status"] });
  const activeUsers = (allUsers || []).filter(u => u.isActive !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).filter(c => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  const sortedInsurances = (allInsurances || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/arbitrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setDialogOpen(false);
      setForm({ ...emptyForm });
      toast({ title: "Arbitration created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/arbitrations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arbitrations"] });
      setDialogOpen(false);
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
      toast({ title: "Arbitration deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
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
      assignedTo: arb.assignedTo || "",
    });
    setDialogOpen(true);
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

  const canDelete = user?.role === "admin" || user?.role === "manager";

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

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const filtered = (arbitrations || []).filter(d => {
    if (!isAdminOrManager && d.assignedTo !== user?.fullName) return false;
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
      cmp = (Number(aVal) || 0) - (Number(bVal) || 0);
    } else {
      cmp = String(aVal || "").localeCompare(String(bVal || ""));
    }
    return sortDir === "desc" ? -cmp : cmp;
  }) : filtered;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" data-testid="text-arbitration-title">Arbitration</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search arbitrations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
              data-testid="input-search-arbitrations"
            />
          </div>
          <Button onClick={openCreate} data-testid="button-create-arbitration">
            <Plus className="h-4 w-4 mr-1" /> New Arbitration
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="min-w-[130px] cursor-pointer select-none" onClick={() => handleSort("patientName")} data-testid="sort-patientName">Patient Name{renderSortIcon("patientName")}</TableHead>
                  <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("denialFileName")} data-testid="sort-denialFileName">File Name{renderSortIcon("denialFileName")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dateInput")} data-testid="sort-dateInput">Date Input{renderSortIcon("dateInput")}</TableHead>
                  <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("intake")} data-testid="sort-intake">Intake{renderSortIcon("intake")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("doa")} data-testid="sort-doa">DOA{renderSortIcon("doa")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic{renderSortIcon("clinic")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("insurance")} data-testid="sort-insurance">Insurance{renderSortIcon("insurance")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("dateOfLetter")} data-testid="sort-dateOfLetter">Date of Letter{renderSortIcon("dateOfLetter")}</TableHead>
                  <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("typeOfDenial")} data-testid="sort-typeOfDenial">Type of Denial{renderSortIcon("typeOfDenial")}</TableHead>
                  <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("effectiveDate")} data-testid="sort-effectiveDate">Effective Date{renderSortIcon("effectiveDate")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosFrom")} data-testid="sort-dosFrom">DOS From{renderSortIcon("dosFrom")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosTo")} data-testid="sort-dosTo">DOS To{renderSortIcon("dosTo")}</TableHead>
                  <TableHead className="min-w-[60px] cursor-pointer select-none" onClick={() => handleSort("numberOfDays")} data-testid="sort-numberOfDays"># Visits{renderSortIcon("numberOfDays")}</TableHead>
                  <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount{renderSortIcon("amount")}</TableHead>
                  <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("filedTo")} data-testid="sort-filedTo">Filed To{renderSortIcon("filedTo")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("arbStatus")} data-testid="sort-arbStatus">ARB Status{renderSortIcon("arbStatus")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("trialDate")} data-testid="sort-trialDate">Trial Date{renderSortIcon("trialDate")}</TableHead>
                  <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("arbPaymentStatus")} data-testid="sort-arbPaymentStatus">ARB Payment{renderSortIcon("arbPaymentStatus")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("amountReceived")} data-testid="sort-amountReceived">Amt Received{renderSortIcon("amountReceived")}</TableHead>
                  <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("checkedBy")} data-testid="sort-checkedBy">Checked By{renderSortIcon("checkedBy")}</TableHead>
                  <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("comment")} data-testid="sort-comment">Comment{renderSortIcon("comment")}</TableHead>
                  <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To{renderSortIcon("assignedTo")}</TableHead>
                  <TableHead className="min-w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={23} className="text-center py-8 text-muted-foreground">
                      No arbitrations found
                    </TableCell>
                  </TableRow>
                )}
                {sorted.map(d => (
                  <TableRow key={d.id} data-testid={`row-arbitration-${d.id}`}>
                    <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                    <TableCell className="text-xs">{d.denialFileName || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateInput)}</TableCell>
                    <TableCell className="text-xs">{d.intake || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.doa)}</TableCell>
                    <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                    <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateOfLetter)}</TableCell>
                    <TableCell className="text-xs">
                      {d.typeOfDenial ? <Badge variant="outline" className="text-xs whitespace-nowrap">{d.typeOfDenial}</Badge> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(d.effectiveDate)}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                    <TableCell className="text-xs">{d.numberOfDays ?? "-"}</TableCell>
                    <TableCell className="text-xs">{d.amount || "-"}</TableCell>
                    <TableCell className="text-xs">
                      {d.filedTo ? <Badge variant="secondary" className="text-xs">{d.filedTo}</Badge> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.arbStatus ? <Badge variant="outline" className="text-xs">{d.arbStatus}</Badge> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(d.trialDate)}</TableCell>
                    <TableCell className="text-xs">
                      {d.arbPaymentStatus ? <Badge variant="secondary" className="text-xs">{d.arbPaymentStatus}</Badge> : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{d.amountReceived || "-"}</TableCell>
                    <TableCell className="text-xs">{d.checkedBy || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{d.comment || "-"}</TableCell>
                    <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setHistoryId(d.id)} data-testid={`button-history-arbitration-${d.id}`}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)} data-testid={`button-edit-arbitration-${d.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-arbitration-${d.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Arbitration" : "New Arbitration"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            <div className="space-y-1.5">
              <Label>File Name</Label>
              <Input value={form.denialFileName} onChange={e => setForm(f => ({ ...f, denialFileName: e.target.value }))} data-testid="input-arb-file-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Date Input</Label>
              <Input type="date" value={form.dateInput} onChange={e => setForm(f => ({ ...f, dateInput: e.target.value }))} data-testid="input-arb-date-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Intake</Label>
              <Select value={form.intake || "__clear__"} onValueChange={v => setForm(f => ({ ...f, intake: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-arb-intake">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">-- None --</SelectItem>
                  {activeUsers.map(u => (
                    <SelectItem key={u.id} value={u.fullName}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>DOA</Label>
              <Input type="date" value={form.doa} onChange={e => setForm(f => ({ ...f, doa: e.target.value }))} data-testid="input-arb-doa" />
            </div>
            <div className="space-y-1.5">
              <Label>Patient First Name</Label>
              <Input value={form.patientFirstName} onChange={e => setForm(f => ({ ...f, patientFirstName: e.target.value }))} data-testid="input-arb-patient-first-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Patient Last Name *</Label>
              <Input value={form.patientLastName} onChange={e => setForm(f => ({ ...f, patientLastName: e.target.value }))} data-testid="input-arb-patient-last-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic</Label>
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
              <Label>Insurance</Label>
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
            <div className="space-y-1.5">
              <Label>Date of Letter</Label>
              <Input type="date" value={form.dateOfLetter} onChange={e => setForm(f => ({ ...f, dateOfLetter: e.target.value }))} data-testid="input-arb-date-of-letter" />
            </div>
            <div className="space-y-1.5">
              <Label>Type of Denial</Label>
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
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} data-testid="input-arb-effective-date" />
            </div>
            <div className="space-y-1.5">
              <Label>DOS From</Label>
              <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-arb-dos-from" />
            </div>
            <div className="space-y-1.5">
              <Label>DOS To</Label>
              <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-arb-dos-to" />
            </div>
            <div className="space-y-1.5">
              <Label># of Visits</Label>
              <Input type="number" value={form.numberOfDays} onChange={e => setForm(f => ({ ...f, numberOfDays: e.target.value }))} data-testid="input-arb-days" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-arb-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Filed To</Label>
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
            <div className="space-y-1.5">
              <Label>ARB Status</Label>
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
              <Label>Trial Date</Label>
              <Input type="date" value={form.trialDate} onChange={e => setForm(f => ({ ...f, trialDate: e.target.value }))} data-testid="input-arb-trial-date" />
            </div>
            <div className="space-y-1.5">
              <Label>ARB Payment Status</Label>
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
              <Label>Amount Received</Label>
              <Input value={form.amountReceived} onChange={e => setForm(f => ({ ...f, amountReceived: e.target.value }))} placeholder="$0.00" data-testid="input-arb-amount-received" />
            </div>
            <div className="space-y-1.5">
              <Label>Checked By</Label>
              <Input value={form.checkedBy} onChange={e => setForm(f => ({ ...f, checkedBy: e.target.value }))} data-testid="input-arb-checked-by" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} rows={2} data-testid="input-arb-comments" />
            </div>
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Select value={form.assignedTo || "__clear__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-arb-assigned-to">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">-- None --</SelectItem>
                  {activeUsers.map(u => (
                    <SelectItem key={u.id} value={u.fullName}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-arbitration">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-arbitration">
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={historyId !== null} onOpenChange={() => setHistoryId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit Trail
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            {activityLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !activityData || activityData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
            ) : (
              <div className="space-y-3">
                {activityData.map((a: any) => (
                  <div key={a.id} className="border rounded-lg p-3 space-y-1" data-testid={`activity-arb-${a.id}`}>
                    <div className="flex items-center justify-between">
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
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
