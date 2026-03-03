import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import type { Posting, User, Clinic } from "@shared/schema";
import { POSTING_DOCUMENT_TYPES, POSTING_STATUS_OPTIONS, POSTING_PRIORITY_OPTIONS } from "@shared/schema";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, Search, History, ArrowUpDown, ArrowUp, ArrowDown, X, Filter } from "lucide-react";

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

function priorityColor(p: string) {
  switch (p) {
    case "Low": return "bg-green-100 text-green-800";
    case "Medium": return "bg-yellow-100 text-yellow-800";
    case "High": return "bg-orange-100 text-orange-800";
    case "Critical": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function statusColor(s: string) {
  switch (s) {
    case "Unassigned": return "bg-gray-100 text-gray-800";
    case "Assigned": return "bg-blue-100 text-blue-800";
    case "Working on it": return "bg-yellow-100 text-yellow-800";
    case "Done": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-800";
  }
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterClinic, setFilterClinic] = useState("");
  const [filterDocumentType, setFilterDocumentType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");

  if (!user) {
    return <Redirect to="/" />;
  }

  const isAdminOrManager = user.role === "admin" || user.role === "manager";
  const canEdit = isAdminOrManager || user.role === "assigner";

  const { data: postingList, isLoading } = useQuery<Posting[]>({ queryKey: ["/api/postings"] });
  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/postings", editingId, "activity"],
    enabled: !!editingId,
  });

  const activeUsers = (allUsers || []).filter((u: any) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).filter((c: any) => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));

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
      assignedTo: d.assignedTo || "",
      status: d.status || "",
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

  const activeFilterCount = [filterClinic, filterDocumentType, filterStatus, filterPriority, filterAssignedTo]
    .filter(v => v && v !== "__all__").length;

  function clearFilters() {
    setFilterClinic("");
    setFilterDocumentType("");
    setFilterStatus("");
    setFilterPriority("");
    setFilterAssignedTo("");
  }

  const filteredUnsorted = (postingList || []).filter(d => {
    if (searchQuery && !Object.values(d).some(v => v && String(v).toLowerCase().includes(searchQuery.toLowerCase()))) return false;
    if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
    if (filterDocumentType && filterDocumentType !== "__all__" && d.documentType !== filterDocumentType) return false;
    if (filterStatus && filterStatus !== "__all__" && d.status !== filterStatus) return false;
    if (filterPriority && filterPriority !== "__all__" && d.priority !== filterPriority) return false;
    if (filterAssignedTo && filterAssignedTo !== "__all__" && d.assignedTo !== filterAssignedTo) return false;
    return true;
  });

  const dateColumns = new Set(["scannedDate", "postedDate", "createdAt"]);

  const filtered = [...filteredUnsorted].sort((a, b) => {
    if (!sortCol || !sortDir) return 0;
    let valA: any = (a as any)[sortCol] ?? "";
    let valB: any = (b as any)[sortCol] ?? "";

    if (dateColumns.has(sortCol)) {
      const tA = valA ? new Date(valA).getTime() : 0;
      const tB = valB ? new Date(valB).getTime() : 0;
      return sortDir === "asc" ? tA - tB : tB - tA;
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-posting-title">Posting</h1>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button onClick={openCreate} data-testid="button-create-posting">
              <Plus className="h-4 w-4 mr-1" /> New Posting
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search postings..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-postings"
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="filter-grid-postings">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Clinic</Label>
            <Select value={filterClinic || "__all__"} onValueChange={v => setFilterClinic(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-posting-clinic">
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
            <Label className="text-xs text-muted-foreground">Document Type</Label>
            <Select value={filterDocumentType || "__all__"} onValueChange={v => setFilterDocumentType(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-posting-document-type">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {POSTING_DOCUMENT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filterStatus || "__all__"} onValueChange={v => setFilterStatus(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-posting-status">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {POSTING_STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select value={filterPriority || "__all__"} onValueChange={v => setFilterPriority(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-posting-priority">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {POSTING_PRIORITY_OPTIONS.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assigned To</Label>
            <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
              <SelectTrigger className="h-9 text-xs" data-testid="filter-posting-assigned-to">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {activeUsers.map(u => (
                  <SelectItem key={u.id} value={u.fullName}>{u.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-auto flex-1 min-h-0 always-show-scrollbar">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("fileNumber")} data-testid="sort-fileNumber">File # <SortIcon col="fileNumber" /></TableHead>
              <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic <SortIcon col="clinic" /></TableHead>
              <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("scannedDate")} data-testid="sort-scannedDate">Scanned Date <SortIcon col="scannedDate" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("documentType")} data-testid="sort-documentType">Document Type <SortIcon col="documentType" /></TableHead>
              <TableHead className="min-w-[110px] cursor-pointer select-none" onClick={() => handleSort("postedDate")} data-testid="sort-postedDate">Posted Date <SortIcon col="postedDate" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("priority")} data-testid="sort-priority">Priority <SortIcon col="priority" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To <SortIcon col="assignedTo" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon col="status" /></TableHead>
              {canEdit && <TableHead className="min-w-[60px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No postings found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(d => (
                <TableRow
                  key={d.id}
                  className={canEdit ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => canEdit && openEdit(d)}
                  data-testid={`row-posting-${d.id}`}
                >
                  <TableCell className="text-xs font-medium">{d.fileNumber || "-"}</TableCell>
                  <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.scannedDate)}</TableCell>
                  <TableCell className="text-xs">{d.documentType || "-"}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.postedDate)}</TableCell>
                  <TableCell className="text-xs">{d.priority ? <Badge className={`text-xs ${priorityColor(d.priority)}`}>{d.priority}</Badge> : "-"}</TableCell>
                  <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                  <TableCell className="text-xs">{d.status ? <Badge className={`text-xs ${statusColor(d.status)}`}>{d.status}</Badge> : "-"}</TableCell>
                  {canEdit && (
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
                    {activeUsers.map(u => (
                      <SelectItem key={u.id} value={u.fullName}>{u.fullName}</SelectItem>
                    ))}
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
            </div>

            <div className="space-y-3 pb-4">
              <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-posting">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
              </Button>
              {editingId && canEdit && (
                <Button variant="destructive" className="w-full" onClick={() => setDeleteConfirmId(editingId)} data-testid="button-delete-posting-drawer">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Posting
                </Button>
              )}
            </div>

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
    </div>
  );
}
