import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/status-badge";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { formatEST } from "@/lib/date-utils";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MessageSquare,
  Clock,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { TaskWithRelations, Clinic, Insurance, User } from "@shared/schema";

type SortField = "patientName" | "clinic" | "insurance" | "ieDate" | "dueDate" | "priority" | "status" | "assigned";
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

const bucketConfig = {
  ready_for_billing: {
    label: "READY FOR BILLING",
    icon: FileCheck,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800/30",
  },
  done: {
    label: "DONE",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800/30",
  },
};

export default function BoardPage() {
  const { user } = useAuth();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState("all");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterEscalated, setFilterEscalated] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>("patientName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({
    ready_for_billing: true,
    done: false,
  });

  useEffect(() => {
    if (params.get("status")) setFilterStatus(params.get("status")!);
    if (params.get("priority")) setFilterPriority(params.get("priority")!);
    if (params.get("bucket")) {
      setOpenBuckets((prev) => ({ ...prev, [params.get("bucket")!]: true }));
    }
    if (params.get("overdue") === "true") setFilterOverdue(true);
    if (params.get("escalated") === "true") setFilterEscalated(true);
  }, [searchString]);

  const visibleBuckets = ["ready_for_billing", "done"] as const;

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: clinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const now = new Date();
  const filteredTasks = (tasks || []).filter((t) => {
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
      if (!t.dueDate || new Date(t.dueDate) >= now || t.bucket === "done") return false;
    }
    if (filterEscalated) {
      if (!t.dueDate || t.bucket === "done") return false;
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

  const applySorting = (tasks: TaskWithRelations[]) =>
    sortField ? sortTasks(tasks, sortField, sortDir) : tasks;

  const tasksByBucket = {
    ready_for_billing: applySorting(filteredTasks.filter((t) => t.bucket === "ready_for_billing" && t.status !== "done")),
    done: applySorting(filteredTasks.filter((t) => t.bucket === "done" || (t.bucket === "ready_for_billing" && t.status === "done"))),
  };

  const toggleBucket = (bucket: string) => {
    setOpenBuckets((prev) => ({ ...prev, [bucket]: !prev[bucket] }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-6 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-board-title">Billing</h1>
        {(user?.role === "admin" || user?.role === "manager" || user?.role === "assigner" || user?.role === "account_manager" || user?.role === "case_manager") && <CreateTaskDialog />}
      </div>

      <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients, clinics, insurance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-board-search"
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
              window.history.replaceState({}, "", "/");
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

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 animate-fade-in">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          Object.entries(bucketConfig).filter(([bucket]) => (visibleBuckets as readonly string[]).includes(bucket)).map(([bucket, config]) => {
            const bucketTasks = tasksByBucket[bucket as keyof typeof tasksByBucket];
            const isOpen = openBuckets[bucket];

            return (
              <Collapsible
                key={bucket}
                open={isOpen}
                onOpenChange={() => toggleBucket(bucket)}
              >
                <Card className={cn("border shadow-sm", config.border)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader
                      className={cn(
                        "flex flex-row items-center gap-2 py-2.5 px-4 cursor-pointer select-none",
                        config.bg
                      )}
                      data-testid={`bucket-header-${bucket}`}
                    >
                      {isOpen ? (
                        <ChevronDown className={cn("h-4 w-4", config.color)} />
                      ) : (
                        <ChevronRight className={cn("h-4 w-4", config.color)} />
                      )}
                      <config.icon className={cn("h-4 w-4", config.color)} />
                      <span className={cn("text-sm font-bold tracking-wide", config.color)}>
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto font-medium">
                        {bucketTasks.length} task{bucketTasks.length !== 1 ? "s" : ""}
                      </span>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-0">
                      {bucketTasks.length === 0 ? (
                        <div className="py-10 text-center">
                          <p className="text-sm text-muted-foreground">No tasks in this section</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Tasks will appear here as they move through the workflow</p>
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
                              {bucketTasks.map((task) => {
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
            );
          })
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
    </div>
  );
}
