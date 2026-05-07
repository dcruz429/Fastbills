import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import type { CeoBox, Clinic, DropdownOption } from "@shared/schema";
import { CEO_STATUS_LABELS, CEO_PRIORITY_LABELS, DR_AL_NAME } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Search, X, Paperclip, FileText, Image, FileSpreadsheet, Download, Lock, MessageSquare, Clock, User as UserIcon, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BulkEditPanel, type BulkField } from "@/components/bulk-edit-panel";

const STATUS_OPTIONS = ["todo", "working", "done", "closed"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const str = typeof d === "string" ? d : d.toISOString();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${parseInt(match[2])}/${parseInt(match[3])}/${match[1]}`;
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

function parseAttachment(att: string) {
  const parts = att.split("|");
  return { url: parts[0], name: parts[1] || parts[0].split("/").pop() || "file" };
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return <Image className="h-3.5 w-3.5 text-blue-500" />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />;
  return <FileText className="h-3.5 w-3.5 text-gray-500" />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    working: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap", colors[status] || colors.todo)}>
      {CEO_STATUS_LABELS[status] || status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap", colors[priority] || colors.medium)}>
      {CEO_PRIORITY_LABELS[priority] || priority}
    </span>
  );
}

type SortCol = "work" | "dateOfLetter" | "sender" | "company" | "clinic" | "action" | "status" | "createdAt" | "dueDate" | "priority";
type SortDir = "asc" | "desc";

type CeoBoxWithCreator = CeoBox & { creatorName?: string };

const emptyForm = {
  work: "",
  dateOfLetter: "",
  sender: "",
  company: "",
  clinic: "",
  action: "",
  status: "todo",
  dueDate: "",
  priority: "medium",
  confidential: false,
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = { todo: 0, working: 1, done: 2, closed: 3 };

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 text-muted-foreground/40" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 text-foreground" />
    : <ChevronDown className="h-3 w-3 ml-1 text-foreground" />;
}

const BULK_FIELDS: BulkField[] = [
  { value: "sender", label: "Sender", type: "text" },
  { value: "company", label: "Company", type: "text" },
  { value: "clinic", label: "Clinic", type: "text" },
  { value: "action", label: "Action", type: "text" },
  { value: "status", label: "Status", type: "select", options: STATUS_OPTIONS.map(s => CEO_STATUS_LABELS[s] || s) },
  { value: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS.map(p => CEO_PRIORITY_LABELS[p] || p) },
  { value: "dateOfLetter", label: "Date of Letter", type: "date" },
  { value: "dueDate", label: "Due Date", type: "date" },
];

export default function CeoBoxPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [newNote, setNewNote] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return <Redirect to="/login" />;
  if (!user.ceoBoxAccess) return <Redirect to="/" />;

  const isDrAl = user.fullName === DR_AL_NAME;

  const { data: records = [], isLoading } = useQuery<CeoBoxWithCreator[]>({
    queryKey: ["/api/ceo-box"],
  });

  const { data: clinics = [] } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: senderOpts = [] } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "ceo_sender"] });
  const { data: companyOpts = [] } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "ceo_company"] });
  const { data: actionOpts = [] } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "ceo_action"] });

  const currentRecord = editingId ? records.find(r => r.id === editingId) : null;

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { fd.append(k, String(v ?? "")); });
      attachmentFiles.forEach(f => fd.append("attachments", f));
      const res = await fetch("/api/ceo-box", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] });
      setDrawerOpen(false);
      setAttachmentFiles([]);
      toast({ title: "Record created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { fd.append(k, String(v ?? "")); });
      if (currentRecord?.attachments) fd.append("attachments", JSON.stringify(currentRecord.attachments));
      attachmentFiles.forEach(f => fd.append("newAttachments", f));
      const res = await fetch(`/api/ceo-box/${id}`, { method: "PATCH", body: fd, credentials: "include" });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] });
      setDrawerOpen(false);
      setAttachmentFiles([]);
      toast({ title: "Record updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/ceo-box/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] });
      setDeleteDialogOpen(false);
      toast({ title: "Record deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: ({ id, idx }: { id: number; idx: number }) => apiRequest("DELETE", `/api/ceo-box/${id}/attachments/${idx}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiRequest("POST", `/api/ceo-box/${id}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] });
      setNewNote("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, field, value }: { ids: number[]; field: string; value: any }) => {
      const labelToKey: Record<string, string> = {};
      STATUS_OPTIONS.forEach(s => { labelToKey[CEO_STATUS_LABELS[s] || s] = s; });
      PRIORITY_OPTIONS.forEach(p => { labelToKey[CEO_PRIORITY_LABELS[p] || p] = p; });
      const resolved = (field === "status" || field === "priority") && value !== null
        ? (labelToKey[value] ?? value)
        : value;
      const res = await apiRequest("POST", "/api/ceo-box/bulk-update", { ids, data: { [field]: resolved } });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] });
      setSelectedIds(new Set());
      toast({ title: `Updated ${data.updated} record${data.updated !== 1 ? "s" : ""}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/ceo-box/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ceo-box"] });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${data.deleted} record${data.deleted !== 1 ? "s" : ""}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setAttachmentFiles([]);
    setNewNote("");
    setDrawerOpen(true);
  }

  function openEdit(record: CeoBoxWithCreator) {
    setEditingId(record.id);
    setForm({
      work: record.work || "",
      dateOfLetter: toInputDate(record.dateOfLetter),
      sender: record.sender || "",
      company: record.company || "",
      clinic: record.clinic || "",
      action: record.action || "",
      status: record.status || "todo",
      dueDate: toInputDate(record.dueDate),
      priority: record.priority || "medium",
      confidential: record.confidential ?? false,
    });
    setAttachmentFiles([]);
    setNewNote("");
    setDrawerOpen(true);
  }

  function handleSubmit() {
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function getVal(r: CeoBoxWithCreator, col: SortCol): string | number {
    switch (col) {
      case "work": return (r.work || "").toLowerCase();
      case "dateOfLetter": return r.dateOfLetter ? new Date(r.dateOfLetter).getTime() : 0;
      case "sender": return (r.sender || "").toLowerCase();
      case "company": return (r.company || "").toLowerCase();
      case "clinic": return (r.clinic || "").toLowerCase();
      case "action": return (r.action || "").toLowerCase();
      case "status": return STATUS_ORDER[r.status] ?? 99;
      case "createdAt": return r.createdAt ? new Date(r.createdAt).getTime() : 0;
      case "dueDate": return r.dueDate ? new Date(r.dueDate).getTime() : Infinity;
      case "priority": return PRIORITY_ORDER[r.priority] ?? 99;
    }
  }

  const filtered = useMemo(() => {
    let rows = records.filter(r => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (r.work || "").toLowerCase().includes(q) ||
        (r.sender || "").toLowerCase().includes(q) ||
        (r.company || "").toLowerCase().includes(q) ||
        (r.clinic || "").toLowerCase().includes(q) ||
        (r.action || "").toLowerCase().includes(q)
      );
    });
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = getVal(a, sortCol);
        const bv = getVal(b, sortCol);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [records, search, sortCol, sortDir]);

  const canDelete = (record: CeoBoxWithCreator) => record.createdById === user.id;
  const selectedCanDelete = [...selectedIds].every(id => {
    const r = records.find(x => x.id === id);
    return r && r.createdById === user.id;
  });

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someSelected = filtered.some(r => selectedIds.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  }

  function toggleRow(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const selectedCount = selectedIds.size;

  const SH = ({ col, children, className }: { col: SortCol; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn("cursor-pointer select-none hover:bg-muted/60 transition-colors", className)}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
      </span>
    </TableHead>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="page-title-ceo-box">CEO Box</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Private workspace — restricted access</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search records..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 w-52 text-sm"
              data-testid="input-search-ceo-box"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <Button size="sm" onClick={openCreate} className="h-8 gap-1.5" data-testid="button-create-ceo-record">
            <Plus className="h-3.5 w-3.5" /> New Record
          </Button>
        </div>
      </div>

      <BulkEditPanel
        selectedCount={selectedCount}
        fields={BULK_FIELDS}
        isPending={bulkUpdateMutation.isPending}
        onApply={(field, value) => bulkUpdateMutation.mutate({ ids: [...selectedIds], field, value })}
        onClear={() => setSelectedIds(new Set())}
        onDelete={selectedCanDelete ? () => bulkDeleteMutation.mutate([...selectedIds]) : undefined}
        isDeletePending={bulkDeleteMutation.isPending}
        testIdPrefix="ceo-bulk"
      />

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    className="rounded border-border cursor-pointer"
                    data-testid="checkbox-select-all-ceo"
                  />
                </TableHead>
                <TableHead className="w-8 text-xs text-muted-foreground">#</TableHead>
                <SH col="work" className="min-w-[160px]">Name of Doc</SH>
                <SH col="dateOfLetter" className="min-w-[110px]">Date of Letter</SH>
                <SH col="sender" className="min-w-[120px]">Sender</SH>
                <SH col="company" className="min-w-[140px]">Company</SH>
                <SH col="clinic" className="min-w-[130px]">Clinic</SH>
                <SH col="action" className="min-w-[120px]">Action</SH>
                <SH col="status" className="min-w-[100px]">Status</SH>
                <SH col="createdAt" className="min-w-[110px]">Created</SH>
                <SH col="dueDate" className="min-w-[110px]">Due Date</SH>
                <SH col="priority" className="min-w-[90px]">Priority</SH>
                <TableHead className="min-w-[120px]">Attachments</TableHead>
                <TableHead className="min-w-[80px]">Created By</TableHead>
                <TableHead className="w-20 text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="text-center py-16 text-muted-foreground">
                    {search ? "No records match your search." : "No records yet. Click 'New Record' to add one."}
                  </TableCell>
                </TableRow>
              ) : filtered.map((record, idx) => (
                <TableRow
                  key={record.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/30 transition-colors",
                    selectedIds.has(record.id) ? "bg-blue-50/60 dark:bg-blue-950/20" : "",
                    record.confidential && !selectedIds.has(record.id) ? "bg-purple-50/40 dark:bg-purple-950/20" : ""
                  )}
                  onClick={() => openEdit(record)}
                  data-testid={`row-ceo-record-${record.id}`}
                >
                  <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleRow(record.id)}
                      className="rounded border-border cursor-pointer"
                      data-testid={`checkbox-ceo-${record.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                  <TableCell className="font-medium max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      {record.confidential && <Lock className="h-3 w-3 text-purple-500 flex-shrink-0" title="Confidential — only visible to Dr. Al" />}
                      <span className="truncate">{record.work || <span className="text-muted-foreground italic text-xs">—</span>}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(record.dateOfLetter) || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">{record.sender || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">{record.company || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">{record.clinic || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">{record.action || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><StatusBadge status={record.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(record.createdAt)}</TableCell>
                  <TableCell className="text-sm">{formatDate(record.dueDate) || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><PriorityBadge priority={record.priority} /></TableCell>
                  <TableCell>
                    {record.attachments && record.attachments.length > 0 ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {record.attachments.slice(0, 2).map((att, i) => {
                          const parsed = parseAttachment(att);
                          return (
                            <a key={i} href={parsed.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-xs transition-colors"
                              title={parsed.name} data-testid={`link-attachment-${record.id}-${i}`}>
                              {getFileIcon(parsed.name)}
                              <span className="max-w-[60px] truncate">{parsed.name}</span>
                            </a>
                          );
                        })}
                        {record.attachments.length > 2 && (
                          <span className="text-xs text-muted-foreground">+{record.attachments.length - 2}</span>
                        )}
                      </div>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {record.creatorName || "—"}
                  </TableCell>
                  <TableCell className="text-right pr-4" onClick={e => e.stopPropagation()}>
                    {canDelete(record) && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => { setDeletingId(record.id); setDeleteDialogOpen(true); }}
                        data-testid={`button-delete-ceo-${record.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={v => { if (!isSaving) setDrawerOpen(v); }}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0" side="right">
          <SheetHeader className="px-6 py-4 border-b flex-shrink-0">
            <SheetTitle>{editingId ? "Edit Record" : "New Record"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ceo-work">Name of Doc</Label>
                <Input
                  id="ceo-work"
                  value={form.work}
                  onChange={e => setForm(f => ({ ...f, work: e.target.value }))}
                  placeholder="Enter document name..."
                  data-testid="input-ceo-work"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ceo-date-of-letter">Date of Letter</Label>
                  <Input id="ceo-date-of-letter" type="date" value={form.dateOfLetter} onChange={e => setForm(f => ({ ...f, dateOfLetter: e.target.value }))} data-testid="input-ceo-date-of-letter" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ceo-due-date">Due Date</Label>
                  <Input id="ceo-due-date" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} data-testid="input-ceo-due-date" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sender</Label>
                <Select value={form.sender || "__none__"} onValueChange={v => setForm(f => ({ ...f, sender: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-ceo-sender"><SelectValue placeholder="Select sender..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {senderOpts.map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Select value={form.company || "__none__"} onValueChange={v => setForm(f => ({ ...f, company: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-ceo-company"><SelectValue placeholder="Select company..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {companyOpts.map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Clinic</Label>
                <Select value={form.clinic || "__none__"} onValueChange={v => setForm(f => ({ ...f, clinic: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-ceo-clinic"><SelectValue placeholder="Select clinic..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {clinics.sort((a, b) => a.name.localeCompare(b.name)).map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select value={form.action || "__none__"} onValueChange={v => setForm(f => ({ ...f, action: v === "__none__" ? "" : v }))}>
                  <SelectTrigger data-testid="select-ceo-action"><SelectValue placeholder="Select action..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {actionOpts.map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger data-testid="select-ceo-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{CEO_STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger data-testid="select-ceo-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{CEO_PRIORITY_LABELS[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Notes
                </h3>
                {currentRecord?.notes && (
                  <div className="space-y-2" data-testid="ceo-notes-display">
                    {currentRecord.notes.split(/(?=\[.+? - \d{4}-\d{2}-\d{2}T)/).filter(Boolean).sort((a, b) => { const getTs = (s: string) => { const m = s.match(/\[.+? - (.+?)\]/); return m ? new Date(m[1]).getTime() : 0; }; return getTs(b) - getTs(a); }).map((block, idx) => {
                      const m = block.match(/^\[(.+?) - (.+?)\]\n?([\s\S]*)$/);
                      if (m) {
                        const ts = new Date(m[2]);
                        const label = isNaN(ts.getTime()) ? m[2] : ts.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                        return (
                          <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50 space-y-0.5" data-testid={`ceo-note-item-${idx}`}>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <UserIcon className="h-3 w-3" />
                              <span className="font-medium text-foreground">{m[1]}</span>
                              <span className="mx-0.5">·</span>
                              <Clock className="h-3 w-3" />
                              <span>{label}</span>
                            </div>
                            <p className="text-foreground whitespace-pre-wrap">{m[3].trim()}</p>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50" data-testid={`ceo-note-item-${idx}`}>
                          <p className="text-foreground whitespace-pre-wrap">{block.trim()}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {editingId && (
                  <>
                    <Textarea
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                      data-testid="textarea-ceo-new-note"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => newNote.trim() && addNoteMutation.mutate({ id: editingId, note: newNote.trim() })}
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                      data-testid="button-add-ceo-note"
                    >
                      Add Note
                    </Button>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label>Attachments</Label>
                {currentRecord?.attachments && currentRecord.attachments.length > 0 && (
                  <div className="space-y-1.5">
                    {currentRecord.attachments.map((att, i) => {
                      const parsed = parseAttachment(att);
                      return (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group">
                          {getFileIcon(parsed.name)}
                          <a href={parsed.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs truncate hover:underline">{parsed.name}</a>
                          <a href={parsed.url} download={parsed.name} className="text-muted-foreground hover:text-foreground" data-testid={`button-download-att-${i}`}><Download className="h-3.5 w-3.5" /></a>
                          <button onClick={() => removeAttachmentMutation.mutate({ id: currentRecord.id, idx: i })} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-att-${i}`}><X className="h-3.5 w-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {attachmentFiles.length > 0 && (
                  <div className="space-y-1">
                    {attachmentFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-blue-50 dark:bg-blue-950/30 text-xs">
                        {getFileIcon(f.name)}
                        <span className="flex-1 truncate">{f.name}</span>
                        <button onClick={() => setAttachmentFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline" size="sm" type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5 h-8 text-xs"
                  data-testid="button-add-attachment"
                >
                  <Paperclip className="h-3.5 w-3.5" /> Add Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setAttachmentFiles(prev => [...prev, ...files]);
                    e.target.value = "";
                  }}
                  data-testid="input-file-attachment"
                />
              </div>

              {isDrAl && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2.5 cursor-pointer select-none transition-colors",
                    form.confidential
                      ? "bg-purple-100 dark:bg-purple-950/50 border border-purple-300 dark:border-purple-700"
                      : "bg-muted/50 border border-border hover:bg-muted"
                  )}
                  onClick={() => setForm(f => ({ ...f, confidential: !f.confidential }))}
                  data-testid="toggle-confidential"
                >
                  <div className="flex items-center gap-2">
                    <Lock className={cn("h-4 w-4", form.confidential ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground")} />
                    <div>
                      <p className={cn("text-sm font-medium", form.confidential ? "text-purple-700 dark:text-purple-300" : "text-foreground")}>
                        Confidential
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {form.confidential ? "Only visible to you" : "Visible to all CEO Box users"}
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    form.confidential ? "bg-purple-600" : "bg-muted-foreground/30"
                  )}>
                    <span className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                      form.confidential ? "translate-x-4" : "translate-x-1"
                    )} />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="px-6 py-4 border-t flex-shrink-0 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isSaving} data-testid="button-cancel-ceo">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save-ceo">
              {isSaving ? "Saving..." : editingId ? "Save Changes" : "Create Record"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Record</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this record? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete-ceo">Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && deleteMutation.mutate(deletingId)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-ceo">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
