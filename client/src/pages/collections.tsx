import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Collection, User, Clinic, Insurance } from "@shared/schema";
import {
  DENIAL_TYPE_OPTIONS,
  COLLECTION_DIVISION_OPTIONS,
  COLLECTION_ISSUE_TYPE_OPTIONS,
  COLLECTION_ACTION_OPTIONS,
  COLLECTION_OUTCOME_OPTIONS,
  COLLECTION_PRIORITY_OPTIONS,
  COLLECTION_STATUS_OPTIONS,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, X, Search, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

function toInputDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const emptyForm = {
  patientLastName: "",
  patientFirstName: "",
  inputDate: "",
  clinic: "",
  division: "",
  insurance: "",
  dosFrom: "",
  dosTo: "",
  numberOfVisits: "",
  amount: "",
  issueType: "",
  typeOfDenial: "",
  action: "",
  outcome: "",
  priority: "",
  assignedTo: "",
  status: "",
};

function priorityColor(p: string) {
  if (p.startsWith("Critical")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (p.startsWith("High")) return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
  if (p.startsWith("Medium")) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
}

function statusColor(s: string) {
  if (s === "Done") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (s === "Working on it") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  if (s === "Assigned") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
  if (s === "Arbitration") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  if (s === "Denials") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
}

export default function CollectionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  if (!user || !["admin", "manager"].includes(user.role)) {
    return <Redirect to="/" />;
  }

  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/collections", historyId, "activity"],
    queryFn: () => fetch(`/api/collections/${historyId}/activity`, { credentials: "include" }).then(r => r.json()),
    enabled: historyId !== null,
  });

  const { data: dataList, isLoading } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const activeUsers = (allUsers || []).filter(u => u.isActive !== false);
  const activeClinics = (allClinics || []).filter(c => c.isActive !== false);
  const sortedInsurances = (allInsurances || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const formToPayload = (f: typeof emptyForm) => {
    const { patientLastName, patientFirstName, ...rest } = f;
    const patientName = patientFirstName.trim()
      ? `${patientLastName.trim()}, ${patientFirstName.trim()}`
      : patientLastName.trim();
    return { ...rest, patientName };
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/collections", formToPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setDialogOpen(false);
      setForm({ ...emptyForm });
      toast({ title: "Collection created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PATCH", `/api/collections/${id}`, formToPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Collection updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setDeleteConfirmId(null);
      toast({ title: "Collection deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (c: Collection) => {
    setEditingId(c.id);
    const nameParts = (c.patientName || "").split(",").map(s => s.trim());
    setForm({
      patientLastName: nameParts[0] || "",
      patientFirstName: nameParts[1] || "",
      inputDate: toInputDate(c.inputDate),
      clinic: c.clinic || "",
      division: c.division || "",
      insurance: c.insurance || "",
      dosFrom: toInputDate(c.dosFrom),
      dosTo: toInputDate(c.dosTo),
      numberOfVisits: c.numberOfVisits?.toString() || "",
      amount: c.amount || "",
      issueType: c.issueType || "",
      typeOfDenial: c.typeOfDenial || "",
      action: c.action || "",
      outcome: c.outcome || "",
      priority: c.priority || "",
      assignedTo: c.assignedTo || "",
      status: c.status || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.patientLastName.trim()) {
      toast({ title: "Last name is required", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const q = searchQuery.toLowerCase();
  const filtered = (dataList || []).filter(d =>
    d.patientName?.toLowerCase().includes(q) ||
    d.clinic?.toLowerCase().includes(q) ||
    d.insurance?.toLowerCase().includes(q) ||
    d.assignedTo?.toLowerCase().includes(q) ||
    d.division?.toLowerCase().includes(q) ||
    d.issueType?.toLowerCase().includes(q)
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-collections-title">Collections</h1>
        <Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); }} data-testid="button-create-collection">
          <Plus className="h-4 w-4 mr-1" /> New Collection
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search collections..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-collections"
        />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Patient's Name</TableHead>
              <TableHead className="min-w-[90px]">Input Date</TableHead>
              <TableHead className="min-w-[60px]">Clinic</TableHead>
              <TableHead className="min-w-[70px]">Division</TableHead>
              <TableHead className="min-w-[120px]">Insurance</TableHead>
              <TableHead className="min-w-[90px]">DOS From</TableHead>
              <TableHead className="min-w-[90px]">DOS To</TableHead>
              <TableHead className="min-w-[50px]"># of Visits</TableHead>
              <TableHead className="min-w-[80px]">Amount</TableHead>
              <TableHead className="min-w-[120px]">Issue Type</TableHead>
              <TableHead className="min-w-[120px]">Type of Denial</TableHead>
              <TableHead className="min-w-[120px]">Action</TableHead>
              <TableHead className="min-w-[100px]">Outcome</TableHead>
              <TableHead className="min-w-[120px]">Priority</TableHead>
              <TableHead className="min-w-[120px]">Assigned to</TableHead>
              <TableHead className="min-w-[100px]">Status</TableHead>
              <TableHead className="min-w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={17} className="text-center py-8 text-muted-foreground">
                  No collections found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(d => (
                <TableRow key={d.id} data-testid={`row-collection-${d.id}`}>
                  <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.inputDate)}</TableCell>
                  <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                  <TableCell className="text-xs">{d.division ? <Badge variant="outline" className="text-xs">{d.division}</Badge> : "-"}</TableCell>
                  <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                  <TableCell className="text-xs text-center">{d.numberOfVisits ?? "-"}</TableCell>
                  <TableCell className="text-xs">{d.amount || "-"}</TableCell>
                  <TableCell className="text-xs">{d.issueType || "-"}</TableCell>
                  <TableCell className="text-xs">{d.typeOfDenial || "-"}</TableCell>
                  <TableCell className="text-xs">{d.action || "-"}</TableCell>
                  <TableCell className="text-xs">{d.outcome ? <Badge variant="secondary" className="text-xs">{d.outcome}</Badge> : "-"}</TableCell>
                  <TableCell className="text-xs">{d.priority ? <Badge className={`text-xs ${priorityColor(d.priority)}`}>{d.priority}</Badge> : "-"}</TableCell>
                  <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                  <TableCell className="text-xs">{d.status ? <Badge className={`text-xs ${statusColor(d.status)}`}>{d.status}</Badge> : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistoryId(d.id)} data-testid={`button-history-collection-${d.id}`}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(d)} data-testid={`button-edit-collection-${d.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-collection-${d.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingId(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-collection-dialog-title">{editingId ? "Edit Collection" : "New Collection"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.patientLastName} onChange={e => setForm(f => ({ ...f, patientLastName: e.target.value }))} data-testid="input-collection-last-name" />
            </div>
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input value={form.patientFirstName} onChange={e => setForm(f => ({ ...f, patientFirstName: e.target.value }))} data-testid="input-collection-first-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Input Date</Label>
              <Input type="date" value={form.inputDate} onChange={e => setForm(f => ({ ...f, inputDate: e.target.value }))} data-testid="input-collection-input-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Clinic</Label>
              <Select value={form.clinic || "__none__"} onValueChange={v => setForm(f => ({ ...f, clinic: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-clinic"><SelectValue placeholder="Select clinic" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {activeClinics.map(c => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Division</Label>
              <Select value={form.division || "__none__"} onValueChange={v => setForm(f => ({ ...f, division: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-division"><SelectValue placeholder="Select division" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {COLLECTION_DIVISION_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Insurance</Label>
              <Select value={form.insurance || "__none__"} onValueChange={v => setForm(f => ({ ...f, insurance: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-insurance"><SelectValue placeholder="Select insurance" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select insurance</SelectItem>
                  {sortedInsurances.map(ins => (
                    <SelectItem key={ins.id} value={ins.name}>{ins.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>DOS From</Label>
              <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-collection-dos-from" />
            </div>
            <div className="space-y-1.5">
              <Label>DOS To</Label>
              <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-collection-dos-to" />
            </div>
            <div className="space-y-1.5">
              <Label># of Visits</Label>
              <Input type="number" value={form.numberOfVisits} onChange={e => setForm(f => ({ ...f, numberOfVisits: e.target.value }))} data-testid="input-collection-visits" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-collection-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Issue Type</Label>
              <Select value={form.issueType || "__none__"} onValueChange={v => setForm(f => ({ ...f, issueType: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-issue-type"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {COLLECTION_ISSUE_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type of Denial</Label>
              <Select value={form.typeOfDenial || "__none__"} onValueChange={v => setForm(f => ({ ...f, typeOfDenial: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-type-denial"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {DENIAL_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={form.action || "__none__"} onValueChange={v => setForm(f => ({ ...f, action: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-action"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {COLLECTION_ACTION_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <Select value={form.outcome || "__none__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-outcome"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {COLLECTION_OUTCOME_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority || "__none__"} onValueChange={v => setForm(f => ({ ...f, priority: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-priority"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {COLLECTION_PRIORITY_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <Select value={form.assignedTo || "__none__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="select-collection-assigned"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                <SelectTrigger data-testid="select-collection-status"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {COLLECTION_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingId(null); }} data-testid="button-cancel-collection">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-collection">
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Collection</DialogTitle></DialogHeader>
          <p>Are you sure you want to delete this collection entry? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} data-testid="button-confirm-delete-collection">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyId !== null} onOpenChange={() => setHistoryId(null)}>
        <DialogContent className="max-w-lg max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Activity History
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            {activityLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : activityData && activityData.length > 0 ? (
              <div className="space-y-3">
                {activityData.map((a: any) => (
                  <div key={a.id} className="border rounded p-2 text-sm">
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
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
