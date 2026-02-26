import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Denial, User, Clinic } from "@shared/schema";
import {
  DENIAL_TYPE_OPTIONS,
  FILED_TO_OPTIONS,
  ARB_STATUS_OPTIONS,
  ARB_PAYMENT_STATUS_OPTIONS,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, X, Search, History } from "lucide-react";
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
};

export default function DenialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [historyDenialId, setHistoryDenialId] = useState<number | null>(null);

  if (!user || !["admin", "manager"].includes(user.role)) {
    return <Redirect to="/" />;
  }

  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/denials", historyDenialId, "activity"],
    queryFn: () => fetch(`/api/denials/${historyDenialId}/activity`, { credentials: "include" }).then(r => r.json()),
    enabled: historyDenialId !== null,
  });

  const { data: denials, isLoading } = useQuery<Denial[]>({
    queryKey: ["/api/denials"],
  });

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const activeUsers = (allUsers || []).filter(u => u.isActive !== false);
  const activeClinics = (allClinics || []).filter(c => c.isActive !== false);

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/denials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/denials"] });
      setDialogOpen(false);
      setForm({ ...emptyForm });
      toast({ title: "Denial created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/denials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/denials"] });
      setDialogOpen(false);
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
      toast({ title: "Denial deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
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
      filedTo: denial.filedTo || "",
      arbStatus: denial.arbStatus || "",
      trialDate: toInputDate(denial.trialDate),
      arbPaymentStatus: denial.arbPaymentStatus || "",
      amountReceived: denial.amountReceived || "",
      checkedBy: denial.checkedBy || "",
      comment: denial.comment || "",
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

  const filtered = (denials || []).filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.patientName?.toLowerCase().includes(q) ||
      d.denialFileName?.toLowerCase().includes(q) ||
      d.clinic?.toLowerCase().includes(q) ||
      d.insurance?.toLowerCase().includes(q) ||
      d.typeOfDenial?.toLowerCase().includes(q) ||
      d.filedTo?.toLowerCase().includes(q)
    );
  });

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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">File Name</TableHead>
                  <TableHead className="min-w-[90px]">Date Input</TableHead>
                  <TableHead className="min-w-[80px]">Intake</TableHead>
                  <TableHead className="min-w-[90px]">DOA</TableHead>
                  <TableHead className="min-w-[100px]">Clinic</TableHead>
                  <TableHead className="min-w-[130px]">Patient Name</TableHead>
                  <TableHead className="min-w-[100px]">Insurance</TableHead>
                  <TableHead className="min-w-[100px]">Date of Letter</TableHead>
                  <TableHead className="min-w-[120px]">Type of Denial</TableHead>
                  <TableHead className="min-w-[100px]">Effective Date</TableHead>
                  <TableHead className="min-w-[90px]">DOS From</TableHead>
                  <TableHead className="min-w-[90px]">DOS To</TableHead>
                  <TableHead className="min-w-[60px]"># Visits</TableHead>
                  <TableHead className="min-w-[80px]">Amount</TableHead>
                  <TableHead className="min-w-[120px]">Comments</TableHead>
                  <TableHead className="min-w-[80px]">Filed To</TableHead>
                  <TableHead className="min-w-[90px]">ARB Status</TableHead>
                  <TableHead className="min-w-[90px]">Trial Date</TableHead>
                  <TableHead className="min-w-[110px]">ARB Payment</TableHead>
                  <TableHead className="min-w-[90px]">Amt Received</TableHead>
                  <TableHead className="min-w-[90px]">Checked By</TableHead>
                  <TableHead className="min-w-[120px]">Comment</TableHead>
                  <TableHead className="min-w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={23} className="text-center py-8 text-muted-foreground">
                      No denials found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(d => (
                  <TableRow key={d.id} data-testid={`row-denial-${d.id}`}>
                    <TableCell className="text-xs">{d.denialFileName || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.dateInput)}</TableCell>
                    <TableCell className="text-xs">{d.intake || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(d.doa)}</TableCell>
                    <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                    <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
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
                    <TableCell className="text-xs max-w-[150px] truncate">{d.comments || "-"}</TableCell>
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
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setHistoryDenialId(d.id)} data-testid={`button-history-denial-${d.id}`}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)} data-testid={`button-edit-denial-${d.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Denial" : "New Denial"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            <div className="space-y-1.5">
              <Label>Denial File Name</Label>
              <Input value={form.denialFileName} onChange={e => setForm(f => ({ ...f, denialFileName: e.target.value }))} data-testid="input-denial-file-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Date Input</Label>
              <Input type="date" value={form.dateInput} onChange={e => setForm(f => ({ ...f, dateInput: e.target.value }))} data-testid="input-denial-date-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Intake</Label>
              <Select value={form.intake || "__clear__"} onValueChange={v => setForm(f => ({ ...f, intake: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-denial-intake">
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
              <Input type="date" value={form.doa} onChange={e => setForm(f => ({ ...f, doa: e.target.value }))} data-testid="input-denial-doa" />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic</Label>
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
              <Label>Patient Last Name *</Label>
              <Input value={form.patientLastName} onChange={e => setForm(f => ({ ...f, patientLastName: e.target.value }))} data-testid="input-denial-patient-last-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Patient First Name</Label>
              <Input value={form.patientFirstName} onChange={e => setForm(f => ({ ...f, patientFirstName: e.target.value }))} data-testid="input-denial-patient-first-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Insurance</Label>
              <Input value={form.insurance} onChange={e => setForm(f => ({ ...f, insurance: e.target.value }))} data-testid="input-denial-insurance" />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Letter</Label>
              <Input type="date" value={form.dateOfLetter} onChange={e => setForm(f => ({ ...f, dateOfLetter: e.target.value }))} data-testid="input-denial-date-of-letter" />
            </div>
            <div className="space-y-1.5">
              <Label>Type of Denial</Label>
              <Select value={form.typeOfDenial} onValueChange={v => setForm(f => ({ ...f, typeOfDenial: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-denial-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">-- None --</SelectItem>
                  {DENIAL_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} data-testid="input-denial-effective-date" />
            </div>
            <div className="space-y-1.5">
              <Label>DOS From</Label>
              <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-denial-dos-from" />
            </div>
            <div className="space-y-1.5">
              <Label>DOS To</Label>
              <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-denial-dos-to" />
            </div>
            <div className="space-y-1.5">
              <Label># of Visits</Label>
              <Input type="number" value={form.numberOfDays} onChange={e => setForm(f => ({ ...f, numberOfDays: e.target.value }))} data-testid="input-denial-days" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-denial-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Filed To</Label>
              <Select value={form.filedTo} onValueChange={v => setForm(f => ({ ...f, filedTo: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-denial-filed-to">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">-- None --</SelectItem>
                  {FILED_TO_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ARB Status</Label>
              <Select value={form.arbStatus} onValueChange={v => setForm(f => ({ ...f, arbStatus: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-denial-arb-status">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">-- None --</SelectItem>
                  {ARB_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trial Date</Label>
              <Input type="date" value={form.trialDate} onChange={e => setForm(f => ({ ...f, trialDate: e.target.value }))} data-testid="input-denial-trial-date" />
            </div>
            <div className="space-y-1.5">
              <Label>ARB Payment Status</Label>
              <Select value={form.arbPaymentStatus} onValueChange={v => setForm(f => ({ ...f, arbPaymentStatus: v === "__clear__" ? "" : v }))}>
                <SelectTrigger data-testid="select-denial-arb-payment">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">-- None --</SelectItem>
                  {ARB_PAYMENT_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount Received</Label>
              <Input value={form.amountReceived} onChange={e => setForm(f => ({ ...f, amountReceived: e.target.value }))} placeholder="$0.00" data-testid="input-denial-amount-received" />
            </div>
            <div className="space-y-1.5">
              <Label>Checked By</Label>
              <Input value={form.checkedBy} onChange={e => setForm(f => ({ ...f, checkedBy: e.target.value }))} data-testid="input-denial-checked-by" />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} rows={2} data-testid="input-denial-comments" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-denial">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-denial">
              {editingId ? "Save Changes" : "Create"}
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

      <Dialog open={historyDenialId !== null} onOpenChange={() => setHistoryDenialId(null)}>
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
                  <div key={a.id} className="border rounded-lg p-3 space-y-1" data-testid={`activity-denial-${a.id}`}>
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
