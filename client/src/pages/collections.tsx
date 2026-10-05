import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Collection, User, Clinic, Insurance, DropdownOption } from "@shared/schema";
import { OUTCOME_OPTIONS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, X, Search, History, ArrowUpDown, ArrowUp, ArrowDown, Upload, ChevronDown, ChevronRight, Clock, User as UserIcon, MessageSquare, Filter, Copy, CheckCircle2, Banknote } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEditPanel, type BulkField } from "@/components/bulk-edit-panel";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrackerPriorityBadge, TrackerStatusBadge } from "@/components/status-badge";
import { ScrollSync } from "@/components/scroll-sync";
import { TrackerAmountSummary } from "@/components/tracker-amount-summary";

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
  callCalendarUrgency: "none",
};


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


const EDIT_ROLES = ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"];

export default function CollectionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sortCol, setSortCol] = useState<string>("patientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | "">("asc");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [filterClinic, setFilterClinic] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [filterInsurance, setFilterInsurance] = useState("");
  const [filterIssueType, setFilterIssueType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("assignedToName") || "";
  });
  const [filterPriority, setFilterPriority] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterDateField, setFilterDateField] = useState("inputDate");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [mainOpen, setMainOpen] = useState(true);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneSortCol, setDoneSortCol] = useState<string>("");
  const [doneSortDir, setDoneSortDir] = useState<"asc" | "desc">("asc");

  if (!user) {
    return <Redirect to="/" />;
  }

  const canEdit = EDIT_ROLES.includes(user.role);
  const canDelete = ["admin", "case_manager", "account_manager"].includes(user.role);

  const { data: activityData, isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/collections", editingId, "activity"],
    queryFn: () => fetch(`/api/collections/${editingId}/activity`, { credentials: "include" }).then(r => r.json()),
    enabled: editingId !== null,
  });

  const { data: dataList, isLoading } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const autoEditHandled = useRef(false);
  useEffect(() => {
    if (autoEditHandled.current || !dataList) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const rec = dataList.find((c) => c.id === parseInt(editId));
    if (rec) {
      autoEditHandled.current = true;
      handleEdit(rec);
      window.history.replaceState({}, "", "/collections");
    }
  }, [dataList]);

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const { data: denialTypeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "denial_type"] });
  const { data: divisionOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_division"] });
  const { data: issueTypeOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_issue_type"] });
  const { data: actionOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options/collection_action"] });
  const { data: statusOpts } = useQuery<DropdownOption[]>({ queryKey: ["/api/dropdown-options", "collection_status"] });
  const activeUsers = (allUsers || []).filter(u => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeClinics = (allClinics || []).sort((a, b) => a.name.localeCompare(b.name));
  const sortedInsurances = (allInsurances || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const canBulkEdit = canEdit;
  const COLLECTION_BULK_FIELDS: BulkField[] = [
    { value: "clinic", label: "Clinic", type: "select", options: activeClinics.map(c => c.name) },
    { value: "division", label: "Division", type: "select", options: (divisionOpts || []).map(o => o.value) },
    { value: "insurance", label: "Insurance", type: "select", options: sortedInsurances.map(i => i.name) },
    { value: "dosFrom", label: "DOS From", type: "date" },
    { value: "dosTo", label: "DOS To", type: "date" },
    { value: "numberOfVisits", label: "# of Visits", type: "number" },
    { value: "amount", label: "Amount", type: "text" },
    { value: "assignedTo", label: "Assigned To", type: "select", options: activeUsers.map(u => u.fullName) },
    { value: "action", label: "Action", type: "select", options: (actionOpts || []).map(o => o.value) },
    { value: "status", label: "Status", type: "select", options: ["Unassigned", "Assigned", "Working on it", "Done"] },
    { value: "inputDate", label: "Input Date", type: "date" },
    { value: "issueType", label: "Issue Type", type: "select", options: (issueTypeOpts || []).map(o => o.value) },
    { value: "typeOfDenial", label: "Type of Denial", type: "select", options: (denialTypeOpts || []).map(o => o.value) },
  ];

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/collections/bulk-delete", { ids }).then(r => r.json()),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${result.deleted} record${result.deleted !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: any }) => apiRequest("POST", "/api/collections/bulk-update", { ids, data }).then(r => r.json()),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setSelectedIds(new Set());
      toast({ title: `Updated ${res.updated} record${res.updated !== 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Bulk update failed", description: e.message, variant: "destructive" }),
  });

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
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/collections/import-csv", { rows }).then(r => r.json()),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      toast({
        title: `Import complete`,
        description: `${result.success} created, ${result.updated || 0} updated${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`,
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
    },
    onError: (e: any) => {
      const isAuthError = e.message?.includes("401") || e.message?.includes("Not authenticated");
      toast({
        title: isAuthError ? "Session expired" : "Import failed",
        description: isAuthError
          ? "Your session has expired. Please refresh the page and log in again, then retry the import."
          : e.message,
        variant: "destructive",
      });
    },
  });

  const removeDuplicatesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collections/remove-duplicates").then(r => r.json()),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: `Removed ${result.removed} duplicate(s)` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const fixAssignedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collections/fix-assigned").then(r => r.json()),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: `Fixed ${result.fixed} assignment(s)` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/collections/${editingId}/notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections", editingId, "activity"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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

    // Pre-process a line to quote any unquoted thousands-separated numbers
    // e.g.  ...,1,234.56,...  →  ...,"1,234.56",...
    // e.g.  ...,$1,234.56,...  →  ...,"$1,234.56",...
    // e.g.  ...,(1,234.56),...  →  ...,"(1,234.56)",...
    function quoteNumbers(line: string): string {
      let result = "";
      let inQuotes = false;
      let i = 0;
      while (i < line.length) {
        if (line[i] === '"') {
          inQuotes = !inQuotes;
          result += line[i++];
          continue;
        }
        if (!inQuotes) {
          const m = line.slice(i).match(/^(\(?\$?)(\d{1,3})((?:,\d{3})+)(\.\d+)?(\)?)(?=[,\r\n]|$)/);
          if (m) {
            result += '"' + m[0] + '"';
            i += m[0].length;
            continue;
          }
        }
        result += line[i++];
      }
      return result;
    }

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
      const values = parseRow(quoteNumbers(lines[i]));
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
    if (!canEdit) return;
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
      assignedTo: (() => { const raw = (c.assignedTo || "").replace(/\s+/g, ' ').trim(); return activeUsers.find(u => u.fullName.replace(/\s+/g, ' ').trim().toLowerCase() === raw.toLowerCase())?.fullName ?? raw; })(),
      status: c.status || "",
      callCalendarUrgency: (c as any).callCalendarUrgency || "none",
    });
    setHistoryOpen(false);
    setNewNote("");
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

  const activeFilterCount = [filterClinic, filterDivision, filterInsurance, filterIssueType, filterStatus, filterAssignedTo, filterPriority, filterOutcome, filterDateFrom, filterDateTo].filter(v => v && v !== "__all__").length;

  const clearAllFilters = () => {
    setFilterClinic("");
    setFilterDivision("");
    setFilterInsurance("");
    setFilterIssueType("");
    setFilterStatus("");
    setFilterAssignedTo("");
    setFilterPriority("");
    setFilterOutcome("");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const filteredUnsorted = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (dataList || []).filter(d => {
      const matchesSearch = !q || d.patientName?.toLowerCase().includes(q) ||
        d.clinic?.toLowerCase().includes(q) ||
        d.insurance?.toLowerCase().includes(q) ||
        d.assignedTo?.toLowerCase().includes(q) ||
        d.division?.toLowerCase().includes(q) ||
        d.issueType?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filterClinic && filterClinic !== "__all__" && d.clinic !== filterClinic) return false;
      if (filterDivision && filterDivision !== "__all__" && d.division !== filterDivision) return false;
      if (filterInsurance && filterInsurance !== "__all__" && d.insurance !== filterInsurance) return false;
      if (filterIssueType && filterIssueType !== "__all__" && d.issueType !== filterIssueType) return false;
      if (filterStatus && filterStatus !== "__all__" && d.status !== filterStatus) return false;
      if (filterAssignedTo && filterAssignedTo !== "__all__" && (d.assignedTo || "").replace(/\s+/g, ' ').trim().toLowerCase() !== filterAssignedTo.replace(/\s+/g, ' ').trim().toLowerCase()) return false;
      if (filterOutcome && filterOutcome !== "__all__" && (d.outcome || "") !== filterOutcome) return false;
      if (filterPriority && filterPriority !== "__all__") {
        const rowPriority = computePriority(d.inputDate);
        if (rowPriority !== filterPriority) return false;
      }
      if (filterDateFrom || filterDateTo) {
        const fieldVal = (d as any)[filterDateField];
        if (!fieldVal) return false;
        const dateStr = new Date(fieldVal).toISOString().split("T")[0];
        if (filterDateFrom && dateStr < filterDateFrom) return false;
        if (filterDateTo && dateStr > filterDateTo) return false;
      }
      return true;
    });
  }, [dataList, searchQuery, filterClinic, filterDivision, filterInsurance, filterIssueType, filterStatus, filterAssignedTo, filterOutcome, filterPriority, filterDateField, filterDateFrom, filterDateTo]);

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

  const COLL_DATE_COLS = new Set(["inputDate", "dosFrom", "dosTo"]);
  const COLL_NUM_COLS = new Set(["numberOfVisits", "ageing", "amount"]);

  const filtered = useMemo(() => [...filteredUnsorted].sort((a, b) => {
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

    if (COLL_DATE_COLS.has(sortCol)) {
      const tA = valA ? new Date(valA).getTime() : 0;
      const tB = valB ? new Date(valB).getTime() : 0;
      return sortDir === "asc" ? tA - tB : tB - tA;
    }

    if (COLL_NUM_COLS.has(sortCol)) {
      const nA = parseFloat(String(valA).replace(/[^0-9.\-]/g, '')) || 0;
      const nB = parseFloat(String(valB).replace(/[^0-9.\-]/g, '')) || 0;
      return sortDir === "asc" ? nA - nB : nB - nA;
    }

    const sA = String(valA).toLowerCase();
    const sB = String(valB).toLowerCase();
    const cmp = sA.localeCompare(sB);
    return sortDir === "asc" ? cmp : -cmp;
  }), [filteredUnsorted, sortCol, sortDir]);

  const activeRecords = filtered.filter(d => (d.status || "").toLowerCase() !== "done");
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const valid = new Set(activeRecords.map(r => r.id));
    let changed = false;
    const next = new Set<number>();
    selectedIds.forEach(id => { if (valid.has(id)) next.add(id); else changed = true; });
    if (changed) setSelectedIds(next);
  }, [activeRecords.map(r => r.id).join(",")]);
  const doneRecords = filtered.filter(d => (d.status || "").toLowerCase() === "done");

  function toggleDoneSort(col: string) {
    if (doneSortCol === col) { if (doneSortDir === "asc") setDoneSortDir("desc"); else { setDoneSortCol(""); setDoneSortDir("asc"); } }
    else { setDoneSortCol(col); setDoneSortDir("asc"); }
  }
  const DoneSortIcon = ({ col }: { col: string }) => {
    if (doneSortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    return doneSortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline-block" /> : <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };
  const _doneDateCols = new Set(["dosFrom", "dosTo", "inputDate"]);
  const _doneNumCols = new Set(["numberOfVisits", "amount"]);
  const doneSorted = doneSortCol ? [...doneRecords].sort((a, b) => {
    const vA = (a as any)[doneSortCol] ?? ""; const vB = (b as any)[doneSortCol] ?? "";
    let cmp = 0;
    if (_doneDateCols.has(doneSortCol)) cmp = (vA ? new Date(vA).getTime() : 0) - (vB ? new Date(vB).getTime() : 0);
    else if (_doneNumCols.has(doneSortCol)) cmp = (parseFloat(String(vA).replace(/[^0-9.-]/g, "")) || 0) - (parseFloat(String(vB).replace(/[^0-9.-]/g, "")) || 0);
    else cmp = String(vA).toLowerCase().localeCompare(String(vB).toLowerCase());
    return doneSortDir === "asc" ? cmp : -cmp;
  }) : doneRecords;

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
          {user.role === "admin" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("This will normalize all 'Assigned To' names to match system user names (fixing whitespace/formatting differences). Continue?")) {
                    fixAssignedMutation.mutate();
                  }
                }}
                disabled={fixAssignedMutation.isPending}
                data-testid="button-fix-assigned"
              >
                {fixAssignedMutation.isPending ? "Fixing..." : "Fix Assignments"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("This will remove duplicate collections (matching patient name + clinic), keeping the one with the most data. Continue?")) {
                    removeDuplicatesMutation.mutate();
                  }
                }}
                disabled={removeDuplicatesMutation.isPending}
                data-testid="button-remove-duplicates"
              >
                <Copy className="h-4 w-4 mr-1" /> {removeDuplicatesMutation.isPending ? "Removing..." : "Remove Duplicates"}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv">
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          {canEdit && (
          <Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); }} data-testid="button-create-collection">
            <Plus className="h-4 w-4 mr-1" /> New Collection
          </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collections..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-collections"
          />
        </div>
        <Select value={filterClinic || "__all__"} onValueChange={v => setFilterClinic(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-clinic"><SelectValue placeholder="All Clinics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Clinics</SelectItem>
            {activeClinics.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDivision || "__all__"} onValueChange={v => setFilterDivision(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-division"><SelectValue placeholder="All Divisions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Divisions</SelectItem>
            {(divisionOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterInsurance || "__all__"} onValueChange={v => setFilterInsurance(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-insurance"><SelectValue placeholder="All Insurances" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Insurances</SelectItem>
            {sortedInsurances.map(ins => <SelectItem key={ins.id} value={ins.name}>{ins.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterIssueType || "__all__"} onValueChange={v => setFilterIssueType(v)}>
          <SelectTrigger className="w-[140px]" data-testid="filter-issue-type"><SelectValue placeholder="All Issue Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Issue Types</SelectItem>
            {(issueTypeOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || "__all__"} onValueChange={v => setFilterStatus(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {(statusOpts || []).map(o => <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignedTo || "__all__"} onValueChange={v => setFilterAssignedTo(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-assigned-to"><SelectValue placeholder="All Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Assigned</SelectItem>
            {[...new Map([...(dataList || []).map(d => d.assignedTo).filter(Boolean), ...activeUsers.map(u => u.fullName)].map(n => [n.replace(/\s+/g, ' ').trim().toLowerCase(), n.replace(/\s+/g, ' ').trim()])).values()].sort().map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority || "__all__"} onValueChange={v => setFilterPriority(v)}>
          <SelectTrigger className="w-[130px]" data-testid="filter-priority"><SelectValue placeholder="All Priorities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Priorities</SelectItem>
            <SelectItem value="Low <10 days">Low</SelectItem>
            <SelectItem value="Medium <20 Days">Medium</SelectItem>
            <SelectItem value="High <30 Days">High</SelectItem>
            <SelectItem value="Critical >30 Days">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterOutcome || "__all__"} onValueChange={v => setFilterOutcome(v)}>
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
            <SelectItem value="dosFrom">DOS From</SelectItem>
            <SelectItem value="dosTo">DOS To</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-[140px] h-10" data-testid="filter-date-from" />
        <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-[140px] h-10" data-testid="filter-date-to" />
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters" className="text-xs">
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      <TrackerAmountSummary label="Collections" openRecords={activeRecords} doneRecords={doneRecords} />

      <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto pb-6">
      <Collapsible open={mainOpen} onOpenChange={setMainOpen}>
        <Card className="border border-orange-200 dark:border-orange-800/30 shadow-sm shrink-0">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none bg-orange-50 dark:bg-orange-950/20" data-testid="collections-main-section-header">
              {mainOpen ? <ChevronDown className="h-4 w-4 text-orange-600 dark:text-orange-400" /> : <ChevronRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
              <Banknote className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-bold tracking-wide text-orange-600 dark:text-orange-400">COLLECTIONS</span>
              <span className="text-xs text-muted-foreground ml-auto font-medium">{activeRecords.length} record{activeRecords.length !== 1 ? "s" : ""}</span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0">
      {canBulkEdit && (
        <BulkEditPanel
          selectedCount={selectedIds.size}
          fields={COLLECTION_BULK_FIELDS}
          isPending={bulkUpdateMutation.isPending}
          onApply={(field, value) => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), data: { [field]: value } })}
          onClear={() => setSelectedIds(new Set())}
          onDelete={canDelete ? () => bulkDeleteMutation.mutate(Array.from(selectedIds)) : undefined}
          isDeletePending={bulkDeleteMutation.isPending}
          testIdPrefix="collection-bulk"
        />
      )}
      <ScrollSync className="border-0">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-20 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <TableRow>
              {canBulkEdit && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={activeRecords.length > 0 && activeRecords.every(r => selectedIds.has(r.id))}
                    onCheckedChange={(c) => {
                      if (c) setSelectedIds(new Set(activeRecords.map(r => r.id)));
                      else setSelectedIds(new Set());
                    }}
                    data-testid="checkbox-select-all-collections"
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[160px] cursor-pointer select-none" onClick={() => handleSort("patientName")} data-testid="sort-patientName">Patient's Name <SortIcon col="patientName" /></TableHead>
              <TableHead className="min-w-[60px] cursor-pointer select-none" onClick={() => handleSort("clinic")} data-testid="sort-clinic">Clinic <SortIcon col="clinic" /></TableHead>
              <TableHead className="min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("division")} data-testid="sort-division">Division <SortIcon col="division" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("insurance")} data-testid="sort-insurance">Insurance <SortIcon col="insurance" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosFrom")} data-testid="sort-dosFrom">DOS From <SortIcon col="dosFrom" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("dosTo")} data-testid="sort-dosTo">DOS To <SortIcon col="dosTo" /></TableHead>
              <TableHead className="min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("numberOfVisits")} data-testid="sort-numberOfVisits"># of Visits <SortIcon col="numberOfVisits" /></TableHead>
              <TableHead className="min-w-[80px] cursor-pointer select-none" onClick={() => handleSort("amount")} data-testid="sort-amount">Amount <SortIcon col="amount" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("assignedTo")} data-testid="sort-assignedTo">Assigned To <SortIcon col="assignedTo" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("action")} data-testid="sort-action">Action <SortIcon col="action" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon col="status" /></TableHead>
              <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("outcome")} data-testid="sort-outcome">Outcome <SortIcon col="outcome" /></TableHead>
              <TableHead className="min-w-[90px] cursor-pointer select-none" onClick={() => handleSort("inputDate")} data-testid="sort-inputDate">Input Date <SortIcon col="inputDate" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("issueType")} data-testid="sort-issueType">Issue Type <SortIcon col="issueType" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("typeOfDenial")} data-testid="sort-typeOfDenial">Type of Denial <SortIcon col="typeOfDenial" /></TableHead>
              <TableHead className="min-w-[120px] cursor-pointer select-none" onClick={() => handleSort("priority")} data-testid="sort-priority">Priority <SortIcon col="priority" /></TableHead>
              <TableHead className="min-w-[70px] cursor-pointer select-none" onClick={() => handleSort("ageing")} data-testid="sort-ageing">Ageing <SortIcon col="ageing" /></TableHead>
              {canDelete && <TableHead className="min-w-[100px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={18 + (canBulkEdit ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                  No collections found
                </TableCell>
              </TableRow>
            ) : (
              activeRecords.map(d => {
                const isTransferred = (d.notes || "").startsWith("[Transferred from");
                return (
                <TableRow key={d.id} data-testid={`row-collection-${d.id}`} className={`cursor-pointer ${isTransferred ? "text-blue-600 dark:text-blue-400" : ""}`} onClick={() => handleEdit(d)}>
                  {canBulkEdit && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(d.id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selectedIds);
                          if (c) next.add(d.id); else next.delete(d.id);
                          setSelectedIds(next);
                        }}
                        data-testid={`checkbox-select-collection-${d.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                  <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                  <TableCell className="text-xs">{d.division ? <Badge variant="outline" className="text-xs">{d.division}</Badge> : "-"}</TableCell>
                  <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                  <TableCell className="text-xs text-center">{d.numberOfVisits ?? "-"}</TableCell>
                  <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                  <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                  <TableCell className="text-xs">{d.action || "-"}</TableCell>
                  <TableCell className="text-xs">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                  <TableCell className="text-xs">{d.outcome ? <Badge variant="secondary" className="text-xs">{d.outcome}</Badge> : "-"}</TableCell>
                  <TableCell className="text-xs">{formatDate(d.inputDate)}</TableCell>
                  <TableCell className="text-xs">{d.issueType || "-"}</TableCell>
                  <TableCell className="text-xs">{d.typeOfDenial || "-"}</TableCell>
                  <TableCell className="text-xs">{(() => { const p = computePriority(d.inputDate); return p ? <TrackerPriorityBadge priority={p} /> : "-"; })()}</TableCell>
                  <TableCell className="text-xs font-medium" data-testid={`text-ageing-${d.id}`}>{(() => { const a = computeAgeing(d.inputDate); return a !== null ? `${a} days` : "-"; })()}</TableCell>
                  {canDelete && (
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-collection-${d.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  )}
                </TableRow>
                );
              })
            )}
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
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {([["patientName","Patient's Name","160px"],["clinic","Clinic","60px"],["division","Division","70px"],["insurance","Insurance","120px"],["dosFrom","DOS From","90px"],["dosTo","DOS To","90px"],["numberOfVisits","# of Visits","70px"],["amount","Amount","80px"],["assignedTo","Assigned To","120px"],["action","Action","120px"],["status","Status","100px"],["outcome","Outcome","100px"],["inputDate","Input Date","90px"],["issueType","Issue Type","120px"],["typeOfDenial","Type of Denial","120px"]] as [string,string,string][]).map(([col,label,minW]) => (
                      <TableHead key={col} className="cursor-pointer select-none whitespace-nowrap" style={{minWidth:minW}} onClick={() => toggleDoneSort(col)}>{label}<DoneSortIcon col={col} /></TableHead>
                    ))}
                    <TableHead className="min-w-[120px]">Priority</TableHead>
                    <TableHead className="min-w-[70px]">Ageing</TableHead>
                    {canDelete && <TableHead className="min-w-[100px] text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doneSorted.map(d => {
                    const isTransferred = (d.notes || "").startsWith("[Transferred from");
                    return (
                    <TableRow key={d.id} data-testid={`row-collection-done-${d.id}`} className={`cursor-pointer ${isTransferred ? "text-blue-600 dark:text-blue-400" : ""}`} onClick={() => handleEdit(d)}>
                      <TableCell className="text-xs font-medium">{d.patientName}</TableCell>
                      <TableCell className="text-xs">{d.clinic || "-"}</TableCell>
                      <TableCell className="text-xs">{d.division ? <Badge variant="outline" className="text-xs">{d.division}</Badge> : "-"}</TableCell>
                      <TableCell className="text-xs">{d.insurance || "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.dosFrom)}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.dosTo)}</TableCell>
                      <TableCell className="text-xs text-center">{d.numberOfVisits ?? "-"}</TableCell>
                      <TableCell className="text-xs">{d.amount ? (() => { const n = parseFloat(d.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "-"}</TableCell>
                      <TableCell className="text-xs">{d.assignedTo || "-"}</TableCell>
                      <TableCell className="text-xs">{d.action || "-"}</TableCell>
                      <TableCell className="text-xs">{d.status ? <TrackerStatusBadge status={d.status} /> : "-"}</TableCell>
                      <TableCell className="text-xs">{d.outcome ? <Badge variant="secondary" className="text-xs">{d.outcome}</Badge> : "-"}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.inputDate)}</TableCell>
                      <TableCell className="text-xs">{d.issueType || "-"}</TableCell>
                      <TableCell className="text-xs">{d.typeOfDenial || "-"}</TableCell>
                      <TableCell className="text-xs">{(() => { const p = computePriority(d.inputDate); return p ? <TrackerPriorityBadge priority={p} /> : "-"; })()}</TableCell>
                      <TableCell className="text-xs font-medium">{(() => { const a = computeAgeing(d.inputDate); return a !== null ? `${a} days` : "-"; })()}</TableCell>
                      {canDelete && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(d.id)} data-testid={`button-delete-collection-done-${d.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
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

      <Sheet open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingId(null); } }}>
        <SheetContent
          side="right"
          className="w-[420px] sm:max-w-[420px] p-0"
          data-testid="collection-detail-drawer"
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
          <SheetHeader className="p-4 pb-0">
            <SheetTitle className="text-left" data-testid="text-collection-dialog-title">
              {editingId ? (form.patientFirstName ? `${form.patientLastName}, ${form.patientFirstName}` : form.patientLastName || "Edit Collection") : "New Collection"}
            </SheetTitle>
            {editingId && (
              <p className="text-xs text-muted-foreground">Collection #{editingId}</p>
            )}
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-80px)]">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Last Name *</Label>
                  <Input value={form.patientLastName} onChange={e => setForm(f => ({ ...f, patientLastName: e.target.value }))} data-testid="input-collection-last-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">First Name</Label>
                  <Input value={form.patientFirstName} onChange={e => setForm(f => ({ ...f, patientFirstName: e.target.value }))} data-testid="input-collection-first-name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Clinic</Label>
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
                  <Label className="text-xs text-muted-foreground">Division</Label>
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
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Insurance</Label>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOS From</Label>
                  <Input type="date" value={form.dosFrom} onChange={e => setForm(f => ({ ...f, dosFrom: e.target.value }))} data-testid="input-collection-dos-from" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">DOS To</Label>
                  <Input type="date" value={form.dosTo} onChange={e => setForm(f => ({ ...f, dosTo: e.target.value }))} data-testid="input-collection-dos-to" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground"># of Visits</Label>
                  <Input type="number" value={form.numberOfVisits} onChange={e => setForm(f => ({ ...f, numberOfVisits: e.target.value }))} data-testid="input-collection-visits" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$0.00" data-testid="input-collection-amount" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Assigned to</Label>
                  <Select value={form.assignedTo || "__none__"} onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-collection-assigned"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
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
                  <Label className="text-xs text-muted-foreground">Action</Label>
                  <Select value={form.action || "__none__"} onValueChange={v => setForm(f => ({ ...f, action: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-collection-activity"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {(actionOpts || []).map(o => o.value).map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Outcome</Label>
                  <Select value={form.outcome || "__none__"} onValueChange={v => setForm(f => ({ ...f, outcome: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-collection-outcome"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- None --</SelectItem>
                      {OUTCOME_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Call Calendar Urgency</Label>
                <Select value={form.callCalendarUrgency || "none"} onValueChange={v => setForm(f => ({ ...f, callCalendarUrgency: v }))}>
                  <SelectTrigger data-testid="select-collection-call-calendar-urgency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="urgent">🚨 Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Input Date</Label>
                  <Input type="date" value={form.inputDate} onChange={e => setForm(f => ({ ...f, inputDate: e.target.value }))} data-testid="input-collection-input-date" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Issue Type</Label>
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type of Denial</Label>
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
                  <Label className="text-xs text-muted-foreground">Priority (auto)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm" data-testid="display-collection-priority">
                    {form.inputDate ? (
                      <TrackerPriorityBadge priority={computePriority(form.inputDate)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">Set Input Date</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ageing (auto)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm" data-testid="display-collection-ageing">
                    {form.inputDate ? (
                      <span className="font-medium text-xs">{computeAgeing(form.inputDate) ?? 0} days</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Set Input Date</span>
                    )}
                  </div>
                </div>
              </div>

              {canEdit && (
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-collection"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
              )}

              {editingId && canDelete && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDeleteConfirmId(editingId)}
                  data-testid="button-delete-collection-drawer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Collection
                </Button>
              )}

              {editingId && (() => {
                const currentCollection = (dataList || []).find(c => c.id === editingId);
                return (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" />
                        Notes
                      </h3>
                      {currentCollection?.notes && (
                        <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="notes-display">
                          {currentCollection.notes.split(/(?=\[.+? - \d{4}-\d{2}-\d{2}T)/).filter(Boolean).sort((a: string, b: string) => { const getTs = (s: string) => { const m = s.match(/\[.+? - (.+?)\]/); return m ? new Date(m[1]).getTime() : 0; }; return getTs(b) - getTs(a); }).map((block: string, idx: number) => {
                            const headerMatch = block.match(/^\[(.+?) - (.+?)\]\n?([\s\S]*)$/);
                            if (headerMatch) {
                              return (
                                <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50 space-y-0.5" data-testid={`note-item-${idx}`}>
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <UserIcon className="h-3 w-3" />
                                    <span className="font-medium text-foreground">{headerMatch[1]}</span>
                                    <span className="mx-0.5">·</span>
                                    <Clock className="h-3 w-3" />
                                    <span>{new Date(headerMatch[2]).toLocaleString()}</span>
                                  </div>
                                  <p className="text-foreground whitespace-pre-wrap">{headerMatch[3].trim()}</p>
                                </div>
                              );
                            }
                            return (
                              <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50" data-testid={`note-item-${idx}`}>
                                <p className="text-foreground whitespace-pre-wrap">{block.trim()}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Add a note..."
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          className="text-sm"
                          data-testid="input-collection-note"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => newNote.trim() && addNoteMutation.mutate(newNote.trim())}
                        disabled={!newNote.trim() || addNoteMutation.isPending}
                        data-testid="button-add-note"
                      >
                        Add Note
                      </Button>
                    </div>
                  </>
                );
              })()}

              {editingId && (
                <>
                  <Separator />
                  <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between" data-testid="button-toggle-history">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <History className="h-4 w-4" />
                          Activity History
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pt-2 space-y-2">
                        {activityLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                          </div>
                        ) : activityData && activityData.length > 0 ? (
                          <div className="space-y-2">
                            {activityData.map((a: any) => (
                              <div key={a.id} className="text-xs p-2.5 rounded-md bg-muted/50 space-y-0.5">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <UserIcon className="h-3 w-3" />
                                  <span className="font-medium text-foreground">{a.action}</span>
                                  <span className="mx-0.5">·</span>
                                  <Clock className="h-3 w-3" />
                                  <span>{new Date(a.timestamp).toLocaleString()}</span>
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
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Collection</DialogTitle></DialogHeader>
          <p>Are you sure you want to delete this collection entry? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmId) { deleteMutation.mutate(deleteConfirmId); if (deleteConfirmId === editingId) { setDialogOpen(false); setEditingId(null); } } }} data-testid="button-confirm-delete-collection">Delete</Button>
          </DialogFooter>
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
                        <td className="py-1 px-2">{row.amount ? (() => { const n = parseFloat(row.amount.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? row.amount : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; })() : "—"}</td>
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
