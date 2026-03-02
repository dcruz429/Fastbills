import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Collection, User, Clinic, Insurance, DropdownOption } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, X, Search, History, ArrowUpDown, ArrowUp, ArrowDown, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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

function computePriority(inputDate: string | Date | null | undefined): string {
  if (!inputDate) return "";
  const d = typeof inputDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(inputDate)
    ? new Date(inputDate + "T00:00:00")
    : new Date(inputDate);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days >= 30) return "Critical >30 Days";
  if (days >= 21) return "High <30 Days";
  if (days >= 11) return "Medium <20 Days";
  return "Low <10 days";
}

function computeAgeing(inputDate: string | Date | null | undefined): number | null {
  if (!inputDate) return null;
  const d = typeof inputDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(inputDate)
    ? new Date(inputDate + "T00:00:00")
    : new Date(inputDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
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
  const [sortCol, setSortCol] = useState<string>("patientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  if (!user) {
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
  const { data: denialTypeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_type"] });
  const { data: divisionOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_division"] });
  const { data: issueTypeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_issue_type"] });
  const { data: actionOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_action"] });
  const { data: outcomeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_outcome"] });
  const { data: statusOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_status"] });
  const activeUsers = (allUsers || []).filter(u => u.isActive !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).filter(c => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  const sortedInsurances = (allInsurances || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const formToPayload = (f: typeof emptyForm) => {
    const { patientLastName, patientFirstName, ...rest } = f;
    const patientName = patientFirstName.trim()
      ? `${patientLastName.trim()}, ${patientFirstName.trim()}`
      : patientLastName.trim();
    const priority = computePriority(rest.inputDate);
    return { ...rest, patientName, priority };
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

  const importMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/collections/import-csv", { rows }),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      toast({
        title: `Import complete`,
        description: `${result.success} collections created${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`,
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const CSV_COLUMN_MAP: Record<string, string> = {
    "patient name": "patientName",
    "patient": "patientName",
    "last name": "lastName",
    "first name": "firstName",
    "input date": "inputDate",
    "date input": "inputDate",
    "clinic": "clinic",
    "division": "division",
    "insurance": "insurance",
    "dos from": "dosFrom",
    "dos to": "dosTo",
    "# of visits": "numberOfVisits",
    "number of visits": "numberOfVisits",
    "visits": "numberOfVisits",
    "amount": "amount",
    "issue type": "issueType",
    "type of denial": "typeOfDenial",
    "denial type": "typeOfDenial",
    "action": "action",
    "outcome": "outcome",
    "priority": "priority",
    "assigned to": "assignedTo",
    "status": "status",
  };

  function cleanAmount(val: string): string {
    if (!val) return "";
    const negative = val.includes("(") && val.includes(")");
    const cleaned = val.replace(/[$,\s()]/g, "");
    return negative ? `-${cleaned}` : cleaned;
  }

  function parseDateValue(val: string): string {
    if (!val) return "";
    const parts = val.split("/");
    if (parts.length === 3) {
      const [m, d, y] = parts;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return val;
  }

  function parseCsvText(text: string): Record<string, string>[] {
    const cleaned = text.replace(/^\uFEFF/, "");
    const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(lines[0]);
    const mappedHeaders = headers.map(h => {
      const lower = h.toLowerCase().replace(/[_\-:]/g, " ").replace(/\s+/g, " ").trim();
      return CSV_COLUMN_MAP[lower] || lower.replace(/\s+(.)/g, (_, c) => c.toUpperCase());
    });
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      if (values.every(v => !v)) continue;
      const row: Record<string, string> = {};
      mappedHeaders.forEach((key, idx) => {
        if (values[idx]) row[key] = values[idx];
      });
      if (row.lastName) {
        row.patientName = row.firstName
          ? `${row.lastName.trim()}, ${row.firstName.trim()}`
          : row.lastName.trim();
        delete row.lastName;
        delete row.firstName;
      }
      if (row.amount) {
        row.amount = cleanAmount(row.amount);
      }
      if (row.inputDate) {
        row.inputDate = parseDateValue(row.inputDate);
      }
      if (row.dosFrom) row.dosFrom = parseDateValue(row.dosFrom);
      if (row.dosTo) row.dosTo = parseDateValue(row.dosTo);
      if (row.patientName) rows.push(row);
    }
    return rows;
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text);
      setCsvPreview(rows);
      setCsvFileName(file.name);
      if (rows.length === 0) {
        toast({ title: "No valid rows found", description: "Make sure your CSV has a header row with a 'Patient Name' column", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

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
  const filteredUnsorted = (dataList || []).filter(d =>
    d.patientName?.toLowerCase().includes(q) ||
    d.clinic?.toLowerCase().includes(q) ||
    d.insurance?.toLowerCase().includes(q) ||
    d.assignedTo?.toLowerCase().includes(q) ||
    d.division?.toLowerCase().includes(q) ||
    d.issueType?.toLowerCase().includes(q)
  );

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

  const dateColumns = new Set(["inputDate", "dosFrom", "dosTo"]);
  const numberColumns = new Set(["numberOfVisits", "ageing"]);

  const filtered = [...filteredUnsorted].sort((a, b) => {
    if (!sortCol || !sortDir) return 0;

    let valA: any;
    let valB: any;

    if (sortCol === "priority") {
      const priorityOrder: Record<string, number> = { "Low <10 days": 0, "Medium <20 Days": 1, "High <30 Days": 2, "Critical >30 Days": 3 };
      valA = priorityOrder[computePriority(a.inputDate)] ?? -1;
      valB = priorityOrder[computePriority(b.inputDate)] ?? -1;
      const diff = valA - valB;
      return sortDir === "asc" ? diff : -diff;
    }

    if (sortCol === "ageing") {
      valA = computeAgeing(a.inputDate) ?? -1;
      valB = computeAgeing(b.inputDate) ?? -1;
      const diff = valA - valB;
      return sortDir === "asc" ? diff : -diff;
    }

    valA = (a as any)[sortCol] ?? "";
    valB = (b as any)[sortCol] ?? "";

    if (dateColumns.has(sortCol)) {
      const tA = valA ? new Date(valA).getTime() : 0;
      const tB = valB ? new Date(valB).getTime() : 0;
      return sortDir === "asc" ? tA - tB : tB - tA;
    }

    if (numberColumns.has(sortCol)) {
      const nA = parseFloat(valA) || 0;
      const nB = parseFloat(valB) || 0;
      return sortDir === "asc" ? nA - nB : nB - nA;
    }

    const sA = String(valA).toLowerCase();
    const sB = String(valB).toLowerCase();
    const cmp = sA.localeCompare(sB);
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
        <h1 className="text-2xl font-bold" data-testid="text-collections-title">Collections</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv">
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); }} data-testid="button-create-collection">
            <Plus className="h-4 w-4 mr-1" /> New Collection
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search collections..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-collections"
        />
      </div>

      <div className="border rounded-lg overflow-auto flex-1 min-h-0 always-show-scrollbar">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="min-w-[160px] cursor-pointer select-none" onClick={() => handleSort("patientName")} data-testid="sort-patientName">Patient's Name <SortIcon col="patientName" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("inputDate")} data-testid="sort-inputDate">Input Date <SortIcon col="inputDate" /></TableHead>
              <TableHead className="min-w-[60px] cursor-pointer select-none" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic <SortIcon col="clinic" /></TableHead>
              <TableHead className="min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("division")} data-testid="sort-division">Division <SortIcon col="division" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("insurance")} data-testid="sort-insurance">Insurance <SortIcon col="insurance" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosFrom")} data-testid="sort-dosFrom">DOS From <SortIcon col="dosFrom" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosTo")} data-testid="sort-dosTo">DOS To <SortIcon col="dosTo" /></TableHead>
              <TableHead className="min-w-[50px] cursor-pointer select-none" onClick={() => handleSort("numberOfVisits")} data-testid="sort-numberOfVisits"># of Visits <SortIcon col="numberOfVisits" /></TableHead>
              <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount <SortIcon col="amount" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("issueType")} data-testid="sort-issueType">Issue Type <SortIcon col="issueType" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("typeOfDenial")} data-testid="sort-typeOfDenial">Type of Denial <SortIcon col="typeOfDenial" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("action")} data-testid="sort-action">Action <SortIcon col="action" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("outcome")} data-testid="sort-outcome">Outcome <SortIcon col="outcome" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("priority")} data-testid="sort-priority">Priority <SortIcon col="priority" /></TableHead>
              <TableHead className="min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("ageing")} data-testid="sort-ageing">Ageing <SortIcon col="ageing" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned to <SortIcon col="assignedTo" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon col="status" /></TableHead>
              <TableHead className="min-w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={18} className="text-center py-8 text-muted-foreground">
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
                  <TableCell className="text-xs">{(() => { const p = computePriority(d.inputDate); return p ? <Badge className={`text-xs ${priorityColor(p)}`}>{p}</Badge> : "-"; })()}</TableCell>
                  <TableCell className="text-xs font-medium" data-testid={`text-ageing-${d.id}`}>{(() => { const a = computeAgeing(d.inputDate); return a !== null ? `${a} days` : "-"; })()}</TableCell>
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
                  {(divisionOpts || []).map(o => o.value).map(o => (
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
                  {(issueTypeOpts || []).map(o => o.value).map(o => (
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
                  {(denialTypeOpts || []).map(o => o.value).map(o => (
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
                  {(actionOpts || []).map(o => o.value).map(o => (
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
                  {(outcomeOpts || []).map(o => o.value).map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority (auto)</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm" data-testid="display-collection-priority">
                {form.inputDate ? (
                  <Badge className={`text-xs ${priorityColor(computePriority(form.inputDate))}`}>{computePriority(form.inputDate)}</Badge>
                ) : (
                  <span className="text-muted-foreground">Set Input Date to compute</span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ageing (auto)</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm" data-testid="display-collection-ageing">
                {form.inputDate ? (
                  <span className="font-medium">{computeAgeing(form.inputDate) ?? 0} days</span>
                ) : (
                  <span className="text-muted-foreground">Set Input Date to compute</span>
                )}
              </div>
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
                  {(statusOpts || []).map(o => o.value).map(o => (
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

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-csv-import-title">Import Collections from CSV</DialogTitle>
          </DialogHeader>
          {csvPreview.length === 0 ? (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById("csv-file-input")?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file && file.name.endsWith(".csv")) handleCsvFile(file);
                }}
                data-testid="csv-drop-zone"
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to select or drag & drop a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: .csv</p>
              </div>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvFile(file);
                  e.target.value = "";
                }}
                data-testid="input-csv-file"
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Expected CSV columns:</p>
                <p>Patient Name, Input Date, Clinic, Division, Insurance, DOS From, DOS To, # of Visits, Amount, Issue Type, Type of Denial, Action, Outcome, Assigned To, Status</p>
                <p>The first row must be column headers. "Patient Name" is required.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm"><span className="font-medium">{csvFileName}</span> — {csvPreview.length} row{csvPreview.length !== 1 ? "s" : ""} found</p>
                <Button variant="ghost" size="sm" onClick={() => { setCsvPreview([]); setCsvFileName(""); }} data-testid="button-csv-clear">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              </div>
              <div className="border rounded-md overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left py-1.5 px-2 font-medium">#</th>
                      <th className="text-left py-1.5 px-2 font-medium">Patient Name</th>
                      <th className="text-left py-1.5 px-2 font-medium">Clinic</th>
                      <th className="text-left py-1.5 px-2 font-medium">Insurance</th>
                      <th className="text-left py-1.5 px-2 font-medium">Input Date</th>
                      <th className="text-left py-1.5 px-2 font-medium">Amount</th>
                      <th className="text-left py-1.5 px-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1 px-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-1 px-2">{row.patientName || "—"}</td>
                        <td className="py-1 px-2">{row.clinic || "—"}</td>
                        <td className="py-1 px-2">{row.insurance || "—"}</td>
                        <td className="py-1 px-2">{row.inputDate || "—"}</td>
                        <td className="py-1 px-2">{row.amount || "—"}</td>
                        <td className="py-1 px-2">{row.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreview.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {csvPreview.length} rows</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)} data-testid="button-csv-cancel">Cancel</Button>
            <Button
              disabled={csvPreview.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate(csvPreview)}
              data-testid="button-csv-import"
            >
              {importMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Collection${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
