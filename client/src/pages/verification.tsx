import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { parseCsvText } from "@/lib/csv-import";
import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/status-badge";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { formatEST } from "@/lib/date-utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { TaskWithRelations, Clinic, User } from "@shared/schema";

type SortField = "patientName" | "clinic" | "insurance" | "ieDate" | "dueDate" | "doa" | "priority" | "status" | "assigned";
type SortDir = "asc" | "desc";

const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const statusOrder: Record<string, number> = { unassigned: 0, assigned: 1, working_on_it: 2, verified: 3, billed: 4, dropped: 5 };

function sortTasks(tasks: TaskWithRelations[], field: SortField, dir: SortDir): TaskWithRelations[] {
  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "patientName":
        cmp = (a.patientName || "").localeCompare(b.patientName || "");
        break;
      case "clinic":
        cmp = (a.clinic?.name || "").localeCompare(b.clinic?.name || "");
        break;
      case "insurance":
        cmp = (a.insurance?.name || "").localeCompare(b.insurance?.name || "");
        break;
      case "ieDate":
        cmp = (a.ieDate ? new Date(a.ieDate).getTime() : 0) - (b.ieDate ? new Date(b.ieDate).getTime() : 0);
        break;
      case "dueDate":
        cmp = (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0);
        break;
      case "doa":
        cmp = (a.doa ? new Date(a.doa).getTime() : 0) - (b.doa ? new Date(b.doa).getTime() : 0);
        break;
      case "priority":
        cmp = (priorityOrder[a.priority] ?? 0) - (priorityOrder[b.priority] ?? 0);
        break;
      case "status":
        cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
        break;
      case "assigned":
        cmp = (a.assignedUser?.fullName || "").localeCompare(b.assignedUser?.fullName || "");
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export default function VerificationPage() {
  const { user } = useAuth();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("assignedToId") || "all";
  });
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterEscalated, setFilterEscalated] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>("patientName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [doneSortCol, setDoneSortCol] = useState<SortField | null>("patientName");
  const [doneSortDir, setDoneSortDir] = useState<SortDir>("asc");
  const [mainOpen, setMainOpen] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (params.get("status")) setFilterStatus(params.get("status")!);
    if (params.get("priority")) setFilterPriority(params.get("priority")!);
    if (params.get("overdue") === "true") setFilterOverdue(true);
    if (params.get("escalated") === "true") setFilterEscalated(true);
  }, [searchString]);

  const autoEditHandled = useRef(false);

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });

  useEffect(() => {
    if (autoEditHandled.current || !tasks) return;
    const p = new URLSearchParams(window.location.search);
    const editId = p.get("edit");
    if (!editId) return;
    const task = tasks.find(t => t.id === parseInt(editId));
    if (task) {
      autoEditHandled.current = true;
      setSelectedTask(task);
      setDrawerOpen(true);
      window.history.replaceState({}, "", "/verification");
    }
  }, [tasks]);

  const { data: clinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const now = new Date();
  const verificationTasks = (tasks || []).filter((t) => t.bucket === "for_verification");

  const filteredTasks = verificationTasks.filter((t) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !t.patientName.toLowerCase().includes(s) &&
        !(t.chartNumber || "").toLowerCase().includes(s) &&
        !t.clinic?.name?.toLowerCase().includes(s) &&
        !t.insurance?.name?.toLowerCase().includes(s) &&
        !t.assignedUser?.fullName?.toLowerCase().includes(s)
      )
        return false;
    }
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterClinic !== "all" && t.clinicId?.toString() !== filterClinic) return false;
    if (filterAssignedTo !== "all") {
      if (filterAssignedTo === "unassigned") {
        if (t.assignedUserId) return false;
      } else {
        if (t.assignedUserId?.toString() !== filterAssignedTo) return false;
      }
    }
    if (filterOverdue) {
      if (!t.dueDate || new Date(t.dueDate) >= now) return false;
    }
    if (filterEscalated) {
      if (!t.dueDate) return false;
      const diff = (now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 3) return false;
    }
    return true;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function toggleDoneSort(col: SortField) {
    if (doneSortCol === col) {
      if (doneSortDir === "asc") setDoneSortDir("desc");
      else { setDoneSortCol(null); setDoneSortDir("asc"); }
    } else {
      setDoneSortCol(col);
      setDoneSortDir("asc");
    }
  }

  const DoneSortIcon = ({ col }: { col: SortField }) => {
    if (doneSortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    if (doneSortDir === "asc") return <ArrowUp className="h-3 w-3 ml-1 inline-block" />;
    return <ArrowDown className="h-3 w-3 ml-1 inline-block" />;
  };

  const activeTasks = filteredTasks.filter(t => t.status !== "done");
  const doneTasks = filteredTasks.filter(t => t.status === "done");
  const activeSorted = sortField ? sortTasks(activeTasks, sortField, sortDir) : activeTasks;
  const doneSorted = doneSortCol ? sortTasks(doneTasks, doneSortCol, doneSortDir) : doneTasks;

  const importCsvMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => apiRequest("POST", "/api/tasks/import-csv", { rows, bucket: "for_verification" }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setCsvDialogOpen(false);
      setCsvPreview([]);
      toast({ title: `Import complete — ${data.success} created, ${data.updated} updated${data.errors?.length ? `, ${data.errors.length} errors` : ""}` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const CSV_COLUMN_MAP: Record<string, string> = {
    "patient name": "patientName", "patient": "patientName",
    "last name": "lastName", "first name": "firstName",
    "clinic": "clinic", "insurance": "insurance",
    "chart number": "chartNumber", "chart #": "chartNumber",
    "priority": "priority", "assigned to": "assignedTo",
    "status": "status", "ie date": "ieDate", "due date": "dueDate",
    "doa": "doa", "date of accident": "doa", "date of admission": "doa",
  };

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsvText(text, CSV_COLUMN_MAP);
      setCsvPreview(rows);
      setCsvFileName(file.name);
      if (rows.length === 0) toast({ title: "No valid rows found", description: "CSV must have a 'Patient Name' column", variant: "destructive" });
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-6 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-verification-title">Verification</h1>
        <div className="flex items-center gap-2">
          {(user?.role === "admin" || user?.role === "manager" || user?.role === "assigner" || user?.role === "account_manager" || user?.role === "case_manager") && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setCsvDialogOpen(true); setCsvPreview([]); setCsvFileName(""); }} data-testid="button-import-csv-verification">
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <CreateTaskDialog />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients, clinics, insurance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-verification-search"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="working_on_it">Working on it</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterClinic} onValueChange={setFilterClinic}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-clinic">
            <SelectValue placeholder="Clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clinics</SelectItem>
            {clinics?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAssignedTo} onValueChange={setFilterAssignedTo}>
          <SelectTrigger className="w-[150px]" data-testid="select-filter-assigned-to">
            <SelectValue placeholder="Assigned To" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assigned</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users?.filter(u => u.active !== false).slice().sort((a, b) => a.fullName.localeCompare(b.fullName)).map((u) => (
              <SelectItem key={u.id} value={u.id.toString()}>{u.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterOverdue || filterEscalated || filterAssignedTo !== "all" || filterStatus !== "all" || filterPriority !== "all" || filterClinic !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterOverdue(false);
              setFilterEscalated(false);
              setFilterStatus("all");
              setFilterPriority("all");
              setFilterClinic("all");
              setFilterAssignedTo("all");
              window.history.replaceState({}, "", "/verification");
            }}
            className="text-xs"
            data-testid="button-clear-filters"
          >
            Clear filters
          </Button>
        )}
      </div>

      {(filterOverdue || filterEscalated) && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            {filterOverdue ? "Showing: Overdue tasks" : "Showing: Escalated tasks (3+ days overdue)"}
          </span>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto px-6 pb-6 animate-fade-in">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <Collapsible open={mainOpen} onOpenChange={setMainOpen}>
            <Card className="border shadow-sm border-amber-200 dark:border-amber-800/30 shrink-0">
              <CollapsibleTrigger asChild>
              <CardHeader
                className="flex flex-row items-center gap-2 py-2.5 px-4 bg-amber-50 dark:bg-amber-950/20 cursor-pointer select-none"
                data-testid="verification-header"
              >
                {mainOpen ? <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-bold tracking-wide text-amber-600 dark:text-amber-400">
                  FOR VERIFICATION
                </span>
                <span className="text-xs text-muted-foreground ml-auto font-medium">
                  {activeSorted.length} task{activeSorted.length !== 1 ? "s" : ""}
                </span>
              </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
              <CardContent className="p-0">
                {activeSorted.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">No tasks in verification</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Tasks will appear here when created and assigned for verification</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          {([
                            { field: "patientName" as SortField, label: "Patient Name", cls: "px-3", hide: "" },
                            { field: "clinic" as SortField, label: "Clinic", cls: "px-3", hide: "hidden md:table-cell" },
                            { field: "insurance" as SortField, label: "Insurance", cls: "px-2", hide: "hidden lg:table-cell" },
                            { field: "ieDate" as SortField, label: "IE Date", cls: "px-2", hide: "hidden lg:table-cell" },
                            { field: "dueDate" as SortField, label: "Due Date", cls: "px-2", hide: "" },
                            { field: "doa" as SortField, label: "DOA", cls: "px-2", hide: "" },
                            { field: "priority" as SortField, label: "Priority", cls: "px-2", hide: "" },
                            { field: "status" as SortField, label: "Status", cls: "px-2", hide: "" },
                            { field: "assigned" as SortField, label: "Assigned", cls: "px-3 min-w-[140px]", hide: "hidden md:table-cell" },
                          ]).map(col => (
                            <th
                              key={col.field}
                              className={cn("text-left py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors", col.cls, col.hide)}
                              onClick={() => handleSort(col.field)}
                              data-testid={`sort-${col.field}`}
                            >
                              <div className="flex items-center gap-1">
                                {col.label}
                                {sortField === col.field ? (
                                  sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 opacity-30" />
                                )}
                              </div>
                            </th>
                          ))}
                          <th className="text-left py-2 px-3 font-medium w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSorted.map((task) => {
                          const isOverdue =
                            task.dueDate &&
                            new Date(task.dueDate) < new Date() &&
                            task.bucket !== "done";
                          const isTransferred = (task.notes || "").startsWith("[Transferred from");
                          return (
                            <tr
                              key={task.id}
                              className={cn(
                                "border-b last:border-0 cursor-pointer transition-colors duration-150",
                                isOverdue
                                  ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-950/30"
                                  : "even:bg-muted/20 hover:bg-primary/5 dark:hover:bg-primary/10",
                                isTransferred && "text-blue-600 dark:text-blue-400"
                              )}
                              onClick={() => {
                                setSelectedTask(task);
                                setDrawerOpen(true);
                              }}
                              data-testid={`task-row-${task.id}`}
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  {isOverdue && (
                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                  )}
                                  <span className="font-medium truncate max-w-[180px]">
                                    {task.patientName}
                                  </span>
                                  {task.notes && (
                                    <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                                {task.clinic?.name || "-"}
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell">
                                {task.insurance?.name || "-"}
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell">
                                {task.ieDate ? formatEST(new Date(task.ieDate), "MM/dd") : "-"}
                              </td>
                              <td className="py-2.5 px-2">
                                <span
                                  className={cn(
                                    "text-xs",
                                    isOverdue
                                      ? "text-red-600 dark:text-red-400 font-semibold"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {task.dueDate
                                    ? formatEST(new Date(task.dueDate), "MM/dd")
                                    : "-"}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground text-xs">
                                {task.doa ? formatEST(new Date(task.doa), "MM/dd/yy") : "-"}
                              </td>
                              <td className="py-2.5 px-2">
                                <PriorityBadge priority={task.priority} />
                              </td>
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-1">
                                  <StatusBadge status={task.status} />
                                  {task.status === "dropped" && task.rtp && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400" data-testid={`badge-rtp-${task.id}`}>
                                      RTP
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                                <span className="truncate max-w-[160px] inline-block">
                                  {task.assignedUser?.fullName || "-"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {isOverdue && (
                                  <Clock className="h-3.5 w-3.5 text-red-500" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
            </Card>
            </Collapsible>

            {doneSorted.length > 0 && (
              <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
                <Card className="border border-emerald-200 dark:border-emerald-800/30 shadow-sm shrink-0">
                <CollapsibleTrigger asChild>
                  <CardHeader className="flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none bg-emerald-50 dark:bg-emerald-950/20" data-testid="toggle-done-section">
                    {doneOpen ? <ChevronDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <ChevronRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-bold tracking-wide text-emerald-700 dark:text-emerald-400">DONE</span>
                    <span className="text-xs text-muted-foreground ml-auto font-medium">{doneSorted.length} task{doneSorted.length !== 1 ? "s" : ""}</span>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                  <div className="overflow-x-auto border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-2 px-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleDoneSort("patientName")}>Patient Name<DoneSortIcon col="patientName" /></th>
                          <th className="text-left py-2 px-3 font-medium cursor-pointer select-none hover:text-foreground hidden md:table-cell" onClick={() => toggleDoneSort("clinic")}>Clinic<DoneSortIcon col="clinic" /></th>
                          <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground hidden lg:table-cell" onClick={() => toggleDoneSort("insurance")}>Insurance<DoneSortIcon col="insurance" /></th>
                          <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground hidden lg:table-cell" onClick={() => toggleDoneSort("ieDate")}>IE Date<DoneSortIcon col="ieDate" /></th>
                          <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleDoneSort("dueDate")}>Due Date<DoneSortIcon col="dueDate" /></th>
                          <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleDoneSort("doa")}>DOA<DoneSortIcon col="doa" /></th>
                          <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleDoneSort("priority")}>Priority<DoneSortIcon col="priority" /></th>
                          <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleDoneSort("status")}>Status<DoneSortIcon col="status" /></th>
                          <th className="text-left py-2 px-3 font-medium cursor-pointer select-none hover:text-foreground hidden md:table-cell" onClick={() => toggleDoneSort("assigned")}>Assigned<DoneSortIcon col="assigned" /></th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {doneSorted.map((task) => {
                          const isTransferred = (task.notes || "").startsWith("[Transferred from");
                          return (
                            <tr
                              key={task.id}
                              className={cn(
                                "border-b last:border-0 cursor-pointer transition-colors duration-150 opacity-75",
                                "even:bg-muted/20 hover:bg-primary/5 dark:hover:bg-primary/10",
                                isTransferred && "text-blue-600 dark:text-blue-400"
                              )}
                              onClick={() => { setSelectedTask(task); setDrawerOpen(true); }}
                              data-testid={`task-row-done-${task.id}`}
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate max-w-[180px]">{task.patientName}</span>
                                  {task.notes && <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">{task.clinic?.name || "-"}</td>
                              <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell">{task.insurance?.name || "-"}</td>
                              <td className="py-2.5 px-2 text-muted-foreground hidden lg:table-cell">
                                {task.ieDate ? formatEST(new Date(task.ieDate), "MM/dd") : "-"}
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground text-xs">
                                {task.dueDate ? formatEST(new Date(task.dueDate), "MM/dd") : "-"}
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground text-xs">
                                {task.doa ? formatEST(new Date(task.doa), "MM/dd/yy") : "-"}
                              </td>
                              <td className="py-2.5 px-2"><PriorityBadge priority={task.priority} /></td>
                              <td className="py-2.5 px-2"><StatusBadge status={task.status} /></td>
                              <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                                <span className="truncate max-w-[160px] inline-block">{task.assignedUser?.fullName || "-"}</span>
                              </td>
                              <td className="py-2.5 px-3"></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </CardContent>
                </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </>
        )}
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedTask(null);
        }}
      />

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Verification Tasks from CSV</DialogTitle></DialogHeader>
          {csvPreview.length === 0 ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("csv-file-input-verification")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.name.endsWith(".csv")) handleCsvFile(file); }}>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to select or drag & drop a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: .csv</p>
                <input id="csv-file-input-verification" type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">Expected columns: Patient Name, Clinic, Insurance, Chart Number, Priority, Assigned To, Status, IE Date, Due Date</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm"><span className="font-medium">{csvFileName}</span> — {csvPreview.length} row{csvPreview.length !== 1 ? "s" : ""} found</p>
                <Button variant="ghost" size="sm" onClick={() => { setCsvPreview([]); setCsvFileName(""); }}>Clear</Button>
              </div>
              <div className="border rounded-md overflow-auto max-h-64">
                <table className="text-xs w-full">
                  <thead><tr className="bg-muted">{Object.keys(csvPreview[0]).map(k => <th key={k} className="px-2 py-1 text-left font-medium whitespace-nowrap">{k}</th>)}</tr></thead>
                  <tbody>{csvPreview.slice(0, 50).map((row, i) => <tr key={i} className="border-t">{Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 whitespace-nowrap max-w-[150px] truncate">{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {csvPreview.length > 50 && <p className="text-xs text-muted-foreground text-center">Showing first 50 of {csvPreview.length} rows</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Cancel</Button>
            <Button disabled={csvPreview.length === 0 || importCsvMutation.isPending} onClick={() => importCsvMutation.mutate(csvPreview)}>
              {importCsvMutation.isPending ? "Importing..." : `Import ${csvPreview.length} Task${csvPreview.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
